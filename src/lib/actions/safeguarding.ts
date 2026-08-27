"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  safeguardingCases,
  transactions,
  accounts,
  dossiers,
  paymentItems,
  channels,
  messages,
} from "@/lib/db/schema";
import { currentActor } from "@/lib/identity";
import { writeAudit } from "@/lib/audit";
import {
  agentContext,
  assertAgentMay,
  assertGrantCovers,
  agentActorId,
} from "@/lib/agent-context";
import {
  runClientDetectors,
  canDisposeCase,
  isEscalationDestination,
  type SafeguardingTransaction,
  type SafeguardingCase,
} from "@/lib/domain/safeguarding";
import {
  draftClarification,
  hasClientQuestion,
} from "@/lib/domain/clarification";

const CLIENT_CHANNEL_LABEL = "Cliëntkanaal (gesimuleerd)";

function officeToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
  }).format(new Date());
}

/** Human configuration, provisioned before any agent context exists. */
async function provisionClientChannel(actorId: string): Promise<string> {
  const db = getDb();
  const existing = await db.query.channels.findFirst({
    where: and(eq(channels.kind, "client_app"), eq(channels.adapter, "simulated")),
  });
  if (existing) return existing.id;
  const [row] = await db
    .insert(channels)
    .values({
      kind: "client_app",
      label: CLIENT_CHANNEL_LABEL,
      adapter: "simulated",
    })
    .returning();
  await writeAudit({
    actorId,
    actorType: "human",
    action: "create",
    entityType: "channel",
    entityId: row.id,
    versionAfter: { kind: "client_app", adapter: "simulated" },
    reason: "provisioned the simulated client channel (office configuration)",
  });
  return row.id;
}

async function loadDetectorInput(dossierId: string): Promise<{
  txs: SafeguardingTransaction[];
  mandateIbans: string[];
  expectedCreditorByIban: Record<string, string>;
}> {
  const db = getDb();
  const [rows, accs, items] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(eq(transactions.dossierId, dossierId)),
    db.select().from(accounts).where(eq(accounts.dossierId, dossierId)),
    db
      .select({
        creditorIban: paymentItems.creditorIban,
        creditorName: paymentItems.creditorName,
      })
      .from(paymentItems)
      .where(eq(paymentItems.dossierId, dossierId)),
  ]);
  const typeById = new Map(accs.map((a) => [a.id, a.type]));

  // Creditor identity comes from `payment_items`, which is where the office
  // has actually recorded who it pays and on which account. `debts` carries a
  // reference but no IBAN, so sourcing it there would have left both the
  // mandate and name-mismatch detectors permanently silent — dead code that
  // looks like coverage.
  const mandateIbans: string[] = [];
  const expectedCreditorByIban: Record<string, string> = {};
  for (const it of items) {
    if (!it.creditorIban) continue;
    const key = it.creditorIban.replace(/\s+/g, "").toUpperCase();
    mandateIbans.push(key);
    if (it.creditorName) expectedCreditorByIban[key] = it.creditorName;
  }

  return {
    txs: rows.map((t) => ({
      id: t.id,
      dossierId: t.dossierId,
      accountId: t.accountId,
      accountType: typeById.get(t.accountId) ?? "beheer",
      bookingDate: t.bookingDate,
      amountCents: t.amountCents,
      counterpartyName: t.counterpartyName,
      counterpartyIban: t.counterpartyIban,
      description: t.description,
      categoryKey: t.categoryKey,
    })),
    mandateIbans,
    expectedCreditorByIban,
  };
}

/**
 * Waakhond's detection pass.
 *
 * Event-triggered, never during render — the same discipline as
 * `refreshSignals()`. Opening a case is a §2.1 category-D protective write:
 * permitted precisely because FAILING to raise one is the more dangerous
 * error, and non-conclusive by construction. Nothing here disposes of
 * anything; every case waits for a human.
 */
export async function refreshSafeguarding(): Promise<{
  ok: boolean;
  opened: number;
  existing: number;
  error?: string;
}> {
  const actor = await currentActor();
  if (!actor.active) return { ok: false, opened: 0, existing: 0, error: "inactive_actor" };

  const db = getDb();
  const ds = await db.select({ id: dossiers.id }).from(dossiers);
  const today = officeToday();

  const ctx = agentContext("waakhond");
  let opened = 0;
  let existing = 0;

  for (const d of ds) {
    const input = await loadDetectorInput(d.id);
    const found = runClientDetectors({
      dossierId: d.id,
      transactions: input.txs,
      today,
      recordedMandateIbans: input.mandateIbans,
      expectedCreditorByIban: input.expectedCreditorByIban,
    });
    for (const c of found) {
      const created = await openCase(ctx, c);
      if (created) opened++;
      else existing++;
    }
  }

  revalidatePath("/safeguarding");
  revalidatePath("/");
  return { ok: true, opened, existing };
}

async function openCase(
  ctx: ReturnType<typeof agentContext>,
  c: SafeguardingCase
): Promise<boolean> {
  const db = getDb();
  const grant = await assertAgentMay(ctx, "safeguarding_case_open", {
    type: "dedupe_key",
    id: c.dedupeKey,
  });
  assertGrantCovers(grant, "safeguarding_case_open", {
    type: "dedupe_key",
    id: c.dedupeKey,
  });

  const [row] = await db
    .insert(safeguardingCases)
    .values({
      detectorKey: c.detectorKey,
      detectorVersion: c.detectorVersion,
      dedupeKey: c.dedupeKey,
      scope: c.scope,
      dossierId: c.dossierId,
      concernsActorId: c.concernsActorId ?? null,
      severity: c.severity,
      evidence: c.evidence,
      agentKey: ctx.agentKey,
      status: "open",
    })
    .onConflictDoNothing()
    .returning();
  if (!row) return false;

  await writeAudit({
    actorId: agentActorId(grant),
    actorType: "agent",
    action: "create",
    entityType: "safeguarding_case",
    entityId: row.id,
    correlationId: grant.correlationId,
    versionAfter: { detectorKey: c.detectorKey, severity: c.severity },
    reason: "unexplained pattern recorded — awaiting human review",
  });
  return true;
}

/**
 * Draft the question to the client. Agent-gated; the message lands as an
 * UNSENT outbound row. A human approves before anything leaves (N2).
 */
export async function prepareClarification(
  caseId: string
): Promise<{ ok: boolean; error?: string }> {
  const actor = await currentActor();
  if (!actor.active) return { ok: false, error: "inactive_actor" };

  const db = getDb();
  const row = await db.query.safeguardingCases.findFirst({
    where: eq(safeguardingCases.id, caseId),
  });
  if (!row) return { ok: false, error: "not_found" };
  if (row.clarificationMessageId) return { ok: true }; // idempotent
  if (row.scope !== "client" || !row.dossierId)
    return { ok: false, error: "no_client_question" };

  const dossier = await db.query.dossiers.findFirst({
    where: eq(dossiers.id, row.dossierId),
  });
  if (!dossier) return { ok: false, error: "not_found" };

  const draft = draftClarification({
    detectorKey: row.detectorKey,
    clientFirstName: dossier.firstName,
    evidence: (row.evidence ?? {}) as Record<string, unknown>,
  });
  if (!draft) return { ok: false, error: "no_client_question" };

  const channelId = await provisionClientChannel(actor.id);

  const ctx = agentContext("waakhond");
  const grant = await assertAgentMay(ctx, "clarification_draft", {
    type: "safeguarding_case",
    id: caseId,
  });
  assertGrantCovers(grant, "clarification_draft", {
    type: "safeguarding_case",
    id: caseId,
  });

  const body = draft.body;
  const [msg] = await db
    .insert(messages)
    .values({
      channelId,
      externalId: `clarification:${caseId}`,
      threadKey: `case:${caseId}`,
      direction: "outbound",
      fromName: "Frank",
      subject: draft.subject,
      bodyText: body,
      receivedAt: new Date(),
      rawSha256: createHash("sha256").update(body, "utf8").digest("hex"),
      dossierId: row.dossierId,
      linkSource: "human", // inherits the dossier from the case, not a guess
      linkReviewed: true,
      status: "resolved",
      // sentAt stays NULL: drafted, not sent.
    })
    .onConflictDoNothing()
    .returning();
  if (!msg) return { ok: true };

  await db
    .update(safeguardingCases)
    .set({ clarificationMessageId: msg.id })
    .where(eq(safeguardingCases.id, caseId));

  await writeAudit({
    actorId: agentActorId(grant),
    actorType: "agent",
    action: "create",
    entityType: "message",
    entityId: msg.id,
    correlationId: grant.correlationId,
    versionAfter: { direction: "outbound", sent: false },
    reason: "clarification question drafted — awaiting human approval",
  });

  revalidatePath("/safeguarding");
  return { ok: true };
}

/**
 * Human approves the question and it goes out.
 *
 * Sending is SIMULATED in this build (N6), exactly as pain.001 remains
 * demo-only: the row is stamped sent and audited, and nothing leaves the
 * system. Only a human can reach this.
 */
export async function sendClarification(
  caseId: string
): Promise<{ ok: boolean; error?: string }> {
  const actor = await currentActor();
  const db = getDb();
  const row = await db.query.safeguardingCases.findFirst({
    where: eq(safeguardingCases.id, caseId),
  });
  if (!row) return { ok: false, error: "not_found" };

  const verdict = canDisposeCase({
    actorId: actor.id,
    actorRole: actor.role,
    actorActive: actor.active,
    scope: row.scope,
    concernsActorId: row.concernsActorId,
  });
  if (!verdict.allowed) return { ok: false, error: verdict.reason };
  if (!row.clarificationMessageId) return { ok: false, error: "no_draft" };
  if (row.status !== "open") return { ok: false, error: "not_open" };

  await db
    .update(messages)
    .set({ sentAt: new Date() })
    .where(eq(messages.id, row.clarificationMessageId));
  await db
    .update(safeguardingCases)
    .set({ status: "clarifying" })
    .where(eq(safeguardingCases.id, caseId));

  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "approve",
    entityType: "message",
    entityId: row.clarificationMessageId,
    versionAfter: { sent: true, simulated: true },
    reason: "clarification question approved and sent (simulated)",
  });
  revalidatePath("/safeguarding");
  return { ok: true };
}

/**
 * Record what the client said.
 *
 * Their explanation is first-class evidence, not a footnote (N4). It is
 * stored as an inbound message and shown beside the finding for good.
 */
export async function recordClientResponse(
  caseId: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const actor = await currentActor();
  const trimmed = text.trim();
  if (trimmed.length < 2) return { ok: false, error: "response_required" };

  const db = getDb();
  const row = await db.query.safeguardingCases.findFirst({
    where: eq(safeguardingCases.id, caseId),
  });
  if (!row) return { ok: false, error: "not_found" };
  if (row.status !== "clarifying") return { ok: false, error: "not_clarifying" };

  const channelId = await provisionClientChannel(actor.id);
  const [msg] = await db
    .insert(messages)
    .values({
      channelId,
      externalId: `response:${caseId}`,
      threadKey: `case:${caseId}`,
      direction: "inbound",
      fromName: "Cliënt",
      subject: "Reactie op vraag",
      bodyText: trimmed,
      receivedAt: new Date(),
      rawSha256: createHash("sha256").update(trimmed, "utf8").digest("hex"),
      dossierId: row.dossierId,
      linkSource: "human",
      linkReviewed: true,
      status: "resolved",
    })
    .onConflictDoNothing()
    .returning();

  await db
    .update(safeguardingCases)
    .set({
      status: "explained",
      clientResponseMessageId: msg?.id ?? row.clientResponseMessageId,
    })
    .where(eq(safeguardingCases.id, caseId));

  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "update",
    entityType: "safeguarding_case",
    entityId: caseId,
    versionAfter: { status: "explained" },
    reason: "client explanation recorded",
  });
  revalidatePath("/safeguarding");
  return { ok: true };
}

/** Close a case with a recorded reason. Never silent. */
export async function resolveCase(
  caseId: string,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  const actor = await currentActor();
  const trimmed = reason.trim();
  if (trimmed.length < 3) return { ok: false, error: "reason_required" };

  const db = getDb();
  const row = await db.query.safeguardingCases.findFirst({
    where: eq(safeguardingCases.id, caseId),
  });
  if (!row) return { ok: false, error: "not_found" };

  const verdict = canDisposeCase({
    actorId: actor.id,
    actorRole: actor.role,
    actorActive: actor.active,
    scope: row.scope,
    concernsActorId: row.concernsActorId,
  });
  if (!verdict.allowed) {
    // An attempt by the concerned actor is itself security-relevant (N5).
    if (verdict.reason === "concerns_self") {
      await writeAudit({
        actorId: actor.id,
        actorType: "human",
        action: "security_denied",
        entityType: "safeguarding_case",
        entityId: caseId,
        versionAfter: { attempted: "resolve" },
        reason: "actor attempted to dispose of a case concerning themselves",
      });
    }
    return { ok: false, error: verdict.reason };
  }
  if (row.status === "resolved" || row.status === "escalated")
    return { ok: false, error: "already_disposed" };

  await db
    .update(safeguardingCases)
    .set({
      status: "resolved",
      dispositionReason: trimmed,
      dispositionBy: actor.id,
      dispositionAt: new Date(),
    })
    .where(eq(safeguardingCases.id, caseId));

  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "update",
    entityType: "safeguarding_case",
    entityId: caseId,
    versionBefore: { status: row.status },
    versionAfter: { status: "resolved" },
    reason: trimmed,
  });
  revalidatePath("/safeguarding");
  return { ok: true };
}

/**
 * Escalate, with a recorded ground and a named destination.
 *
 * Frank never picks the destination. For a solo office the standing external
 * destination is the appointing kantonrechter (Jerome, 2026-08-27).
 */
export async function escalateCase(
  caseId: string,
  ground: string,
  destination: string
): Promise<{ ok: boolean; error?: string }> {
  const actor = await currentActor();
  const trimmed = ground.trim();
  if (trimmed.length < 3) return { ok: false, error: "ground_required" };
  if (!isEscalationDestination(destination))
    return { ok: false, error: "invalid_destination" };

  const db = getDb();
  const row = await db.query.safeguardingCases.findFirst({
    where: eq(safeguardingCases.id, caseId),
  });
  if (!row) return { ok: false, error: "not_found" };

  const verdict = canDisposeCase({
    actorId: actor.id,
    actorRole: actor.role,
    actorActive: actor.active,
    scope: row.scope,
    concernsActorId: row.concernsActorId,
  });
  if (!verdict.allowed) {
    if (verdict.reason === "concerns_self") {
      await writeAudit({
        actorId: actor.id,
        actorType: "human",
        action: "security_denied",
        entityType: "safeguarding_case",
        entityId: caseId,
        versionAfter: { attempted: "escalate" },
        reason: "actor attempted to dispose of a case concerning themselves",
      });
    }
    return { ok: false, error: verdict.reason };
  }
  if (row.status === "resolved" || row.status === "escalated")
    return { ok: false, error: "already_disposed" };

  await db
    .update(safeguardingCases)
    .set({
      status: "escalated",
      escalationGround: trimmed,
      escalationDestination: destination,
      dispositionBy: actor.id,
      dispositionAt: new Date(),
    })
    .where(eq(safeguardingCases.id, caseId));

  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "transition",
    entityType: "safeguarding_case",
    entityId: caseId,
    versionBefore: { status: row.status },
    versionAfter: { status: "escalated", destination },
    reason: trimmed,
  });
  revalidatePath("/safeguarding");
  return { ok: true };
}

export async function openCaseCount(): Promise<number> {
  try {
    const db = getDb();
    const r = await db.execute<{ n: number }>(
      sql`SELECT COUNT(*)::int AS n FROM safeguarding_cases
           WHERE status IN ('open','clarifying','explained')`
    );
    return Number(r.rows?.[0]?.n ?? 0);
  } catch {
    return 0;
  }
}

export type SafeguardingCaseRow = {
  id: string;
  detectorKey: string;
  scope: "client" | "office";
  severity: string;
  status: string;
  evidence: Record<string, unknown>;
  concernsActorId: string | null;
  dossier: { id: string; name: string } | null;
  /** Whether this detector has a question that can fairly be put to the
   *  client at all — a name mismatch cannot, since the client has no way to
   *  know whose account number a company uses. */
  hasClientQuestion: boolean;
  question: string | null;
  questionSent: boolean;
  clientResponse: string | null;
  dispositionReason: string | null;
  escalationDestination: string | null;
};

export async function listSafeguardingCases(): Promise<SafeguardingCaseRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      c: safeguardingCases,
      dId: dossiers.id,
      dFirst: dossiers.firstName,
      dLast: dossiers.lastName,
    })
    .from(safeguardingCases)
    .leftJoin(dossiers, eq(safeguardingCases.dossierId, dossiers.id))
    .where(
      inArray(safeguardingCases.status, [
        "open",
        "clarifying",
        "explained",
        "escalated",
      ])
    );

  const msgIds = rows
    .flatMap((r) => [r.c.clarificationMessageId, r.c.clientResponseMessageId])
    .filter(Boolean) as string[];
  const msgs =
    msgIds.length > 0
      ? await db.select().from(messages).where(inArray(messages.id, msgIds))
      : [];
  const byId = new Map(msgs.map((m) => [m.id, m]));

  return rows.map((r) => {
    const q = r.c.clarificationMessageId
      ? byId.get(r.c.clarificationMessageId)
      : undefined;
    const resp = r.c.clientResponseMessageId
      ? byId.get(r.c.clientResponseMessageId)
      : undefined;
    return {
      id: r.c.id,
      detectorKey: r.c.detectorKey,
      scope: r.c.scope,
      severity: r.c.severity,
      status: r.c.status,
      evidence: (r.c.evidence ?? {}) as Record<string, unknown>,
      concernsActorId: r.c.concernsActorId,
      dossier: r.dId ? { id: r.dId, name: `${r.dFirst} ${r.dLast}` } : null,
      hasClientQuestion:
        r.c.scope === "client" && hasClientQuestion(r.c.detectorKey),
      question: q?.bodyText ?? null,
      questionSent: Boolean(q?.sentAt),
      clientResponse: resp?.bodyText ?? null,
      dispositionReason: r.c.dispositionReason,
      escalationDestination: r.c.escalationDestination,
    };
  });
}
