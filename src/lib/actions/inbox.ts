"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  channels,
  messages,
  obligations,
  dossiers,
  accounts,
  contacts,
  debts,
} from "@/lib/db/schema";
import { currentActor } from "@/lib/identity";
import { writeAudit } from "@/lib/audit";
import { canPerform } from "@/lib/domain/authz";
import {
  agentContext,
  assertAgentMay,
  assertGrantCovers,
  agentActorId,
} from "@/lib/agent-context";
import {
  resolveDossier,
  type DossierCandidate,
} from "@/lib/domain/resolve-dossier";
import { readInboundFacts, classifyObligationKind } from "@/lib/domain/inbound";
import { checkWikAmount } from "@/lib/domain/wik";
import { INBOX_FIXTURES } from "@/lib/inbox-fixtures";

const SIMULATED_CHANNEL_LABEL = "Gesimuleerde postbus";

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function officeToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
  }).format(new Date());
}

async function simulatedChannelId(): Promise<string> {
  const db = getDb();
  const existing = await db.query.channels.findFirst({
    where: and(eq(channels.kind, "email"), eq(channels.adapter, "simulated")),
  });
  if (existing) return existing.id;
  const [row] = await db
    .insert(channels)
    .values({ kind: "email", label: SIMULATED_CHANNEL_LABEL, adapter: "simulated" })
    .returning();
  return row.id;
}

/** Everything the deterministic matchers need, in one query per table. */
async function loadCandidates(): Promise<DossierCandidate[]> {
  const db = getDb();
  const [ds, accs, cts, dbts] = await Promise.all([
    db.select({ id: dossiers.id, firstName: dossiers.firstName, lastName: dossiers.lastName, bsn: dossiers.bsn }).from(dossiers),
    db.select({ dossierId: accounts.dossierId, iban: accounts.iban }).from(accounts),
    db.select({ dossierId: contacts.dossierId, email: contacts.email }).from(contacts),
    db.select({ dossierId: debts.dossierId, reference: debts.reference }).from(debts),
  ]);
  const by = <T extends { dossierId: string | null }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      if (!r.dossierId) continue;
      (m.get(r.dossierId) ?? m.set(r.dossierId, []).get(r.dossierId)!).push(r);
    }
    return m;
  };
  const accById = by(accs);
  const ctById = by(cts);
  const dbById = by(dbts);
  return ds.map((d) => ({
    id: d.id,
    bsn: d.bsn,
    firstName: d.firstName,
    lastName: d.lastName,
    ibans: (accById.get(d.id) ?? []).map((a) => a.iban).filter(Boolean) as string[],
    contactEmails: (ctById.get(d.id) ?? []).map((c) => c.email).filter(Boolean) as string[],
    debtReferences: (dbById.get(d.id) ?? []).map((x) => x.reference).filter(Boolean) as string[],
  }));
}

/**
 * Postbode's ingest pass over one message.
 *
 * Every write here is a plan os-v2 §2.1 permitted pre-decision write:
 * `message_ingest` records that something arrived (category A), and
 * `dossier_link` writes a PROVISIONAL link (category B) that a human must
 * confirm. Nothing consequential happens — the drafted reply and the debt
 * adjustment both wait for a decision.
 */
async function ingestOne(
  fixture: (typeof INBOX_FIXTURES)[number],
  channelId: string,
  candidates: DossierCandidate[],
  ctx: ReturnType<typeof agentContext>
): Promise<"created" | "duplicate"> {
  const db = getDb();
  const receivedAt = new Date(
    Date.now() - fixture.receivedDaysAgo * 86_400_000
  );
  const raw = `${fixture.subject}\n${fixture.body}`;

  const ingestGrant = await assertAgentMay(ctx, "message_ingest", {
    type: "channel",
    id: channelId,
  });
  assertGrantCovers(ingestGrant, "message_ingest", {
    type: "channel",
    id: channelId,
  });

  // Idempotent on (channelId, externalId): re-pulling never duplicates.
  const [msg] = await db
    .insert(messages)
    .values({
      channelId,
      externalId: fixture.externalId,
      threadKey: fixture.externalId,
      direction: "inbound",
      fromName: fixture.fromName,
      fromAddress: fixture.fromAddress,
      subject: fixture.subject,
      bodyText: fixture.body,
      receivedAt,
      rawSha256: sha256(raw),
      status: "new",
    })
    .onConflictDoNothing()
    .returning();
  if (!msg) return "duplicate";

  // --- Resolve to a dossier. Deterministic matchers, recorded evidence. ---
  const resolution = resolveDossier({
    text: raw,
    fromAddress: fixture.fromAddress,
    candidates,
  });

  if (resolution.dossierId) {
    const linkGrant = await assertAgentMay(ctx, "dossier_link", {
      type: "message",
      id: msg.id,
    });
    // Entity-bound: a grant minted for another message must not authorize a
    // link on this one (Temujin PR-8 r3).
    assertGrantCovers(linkGrant, "dossier_link", { type: "message", id: msg.id });

    await db
      .update(messages)
      .set({
        dossierId: resolution.dossierId,
        resolutionConfidence: resolution.confidence,
        resolutionEvidence: resolution.evidence.map((e) => ({
          matcher: e.matcher,
          value: e.value,
        })),
        linkSource: "agent",
        linkReviewed: false, // PROVISIONAL until a human confirms
        status: "resolved",
      })
      .where(eq(messages.id, msg.id));

    await writeAudit({
      actorId: agentActorId(linkGrant),
      actorType: "agent",
      action: "update",
      entityType: "message",
      entityId: msg.id,
      correlationId: linkGrant.correlationId,
      versionAfter: {
        dossierId: resolution.dossierId,
        confidence: resolution.confidence,
        linkReviewed: false,
      },
      reason: "provisional dossier link (agent) — awaiting human confirmation",
    });
  } else {
    await db
      .update(messages)
      .set({
        resolutionConfidence: resolution.confidence,
        resolutionEvidence: resolution.evidence.map((e) => ({
          matcher: e.matcher,
          value: e.value,
        })),
        status: "needs_dossier",
      })
      .where(eq(messages.id, msg.id));
  }

  // --- Read the labelled facts, then run the checks. ---
  const facts = readInboundFacts(raw);
  const kind = classifyObligationKind(fixture.subject, fixture.body);
  const findings: Record<string, unknown>[] = [];

  // The consumer basis is EVIDENCED, not assumed: these dossiers are
  // natural persons under bewind, which is what the regime turns on.
  const wik = checkWikAmount({
    principalCents: facts.principalCents?.value,
    chargedCostsCents: facts.collectionCostsCents?.value,
    consumerBasis: resolution.dossierId ? "dossier_natural_person" : undefined,
    onDate: officeToday(),
  });
  if (wik.finding !== "none") {
    findings.push({
      ...wik,
      evidence: {
        principal: facts.principalCents?.snippet,
        collectionCosts: facts.collectionCostsCents?.snippet,
      },
    });
  }

  const summaryNl = buildSummary(fixture, facts, "nl");
  const summaryEn = buildSummary(fixture, facts, "en");

  await db
    .insert(obligations)
    .values({
      dossierId: resolution.dossierId,
      sourceMessageId: msg.id,
      kind,
      summaryNl,
      summaryEn,
      dueDate: facts.dueDate?.value ?? null,
      dueDateSource: facts.dueDate?.snippet ?? null,
      agentKey: ctx.agentKey,
      findings,
      status: "open",
    })
    .onConflictDoNothing();

  return "created";
}

function buildSummary(
  fixture: (typeof INBOX_FIXTURES)[number],
  facts: ReturnType<typeof readInboundFacts>,
  locale: "nl" | "en"
): string {
  const amount = facts.totalCents?.value ?? facts.principalCents?.value;
  const euro =
    amount !== undefined
      ? (amount / 100).toLocaleString("nl-NL", {
          style: "currency",
          currency: "EUR",
        })
      : null;
  if (locale === "nl") {
    return euro
      ? `${fixture.fromName} vordert ${euro}`
      : `${fixture.fromName}: ${fixture.subject}`;
  }
  return euro
    ? `${fixture.fromName} demands ${euro}`
    : `${fixture.fromName}: ${fixture.subject}`;
}

/**
 * "Ontvang post" — replay the simulated mailbox (N6).
 *
 * A human triggers it; Postbode does the work under its ceiling. Idempotent,
 * so pressing it twice during a demo adds nothing.
 */
export async function receiveSimulatedPost(): Promise<{
  ok: boolean;
  created: number;
  duplicates: number;
  error?: string;
}> {
  const ctx = agentContext("postbode");
  const actor = await currentActor();
  if (!actor.active) return { ok: false, created: 0, duplicates: 0, error: "inactive_actor" };

  const channelId = await simulatedChannelId();
  const candidates = await loadCandidates();

  let created = 0;
  let duplicates = 0;
  for (const fixture of INBOX_FIXTURES) {
    const r = await ingestOne(fixture, channelId, candidates, ctx);
    if (r === "created") created++;
    else duplicates++;
  }

  await getDb()
    .update(channels)
    .set({ lastSyncAt: new Date() })
    .where(eq(channels.id, channelId));

  revalidatePath("/inbox");
  revalidatePath("/");
  return { ok: true, created, duplicates };
}

/**
 * Confirm (or correct) the provisional dossier link. This is the human
 * decision that plan §2.1 category B requires before anything downstream may
 * rely on dossier identity.
 */
export async function confirmDossierLink(
  messageId: string,
  dossierId: string
): Promise<{ ok: boolean; error?: string }> {
  const actor = await currentActor();
  const db = getDb();
  const msg = await db.query.messages.findFirst({
    where: eq(messages.id, messageId),
  });
  if (!msg) return { ok: false, error: "not_found" };

  await db
    .update(messages)
    .set({
      dossierId,
      linkSource: "human",
      linkReviewed: true,
      status: "resolved",
    })
    .where(eq(messages.id, messageId));
  await db
    .update(obligations)
    .set({ dossierId })
    .where(eq(obligations.sourceMessageId, messageId));

  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "update",
    entityType: "message",
    entityId: messageId,
    versionBefore: { dossierId: msg.dossierId, linkReviewed: msg.linkReviewed },
    versionAfter: { dossierId, linkReviewed: true },
    reason:
      msg.dossierId === dossierId
        ? "confirmed agent dossier link"
        : "corrected agent dossier link",
  });
  revalidatePath("/inbox");
  return { ok: true };
}

/** Dismiss an obligation with a recorded reason — never a silent close. */
export async function dismissObligation(
  obligationId: string,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  const actor = await currentActor();
  const trimmed = reason.trim();
  if (trimmed.length < 3) return { ok: false, error: "reason_required" };

  const db = getDb();
  const [row] = await db
    .update(obligations)
    .set({
      status: "dismissed",
      dismissReason: trimmed,
      decidedBy: actor.id,
      decidedAt: new Date(),
    })
    .where(and(eq(obligations.id, obligationId), eq(obligations.status, "open")))
    .returning();
  if (!row) return { ok: false, error: "not_open" };

  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "update",
    entityType: "obligation",
    entityId: obligationId,
    versionAfter: { status: "dismissed", reason: trimmed },
    reason: trimmed,
  });
  revalidatePath("/inbox");
  return { ok: true };
}

/**
 * Mark an obligation actioned.
 *
 * Note what this deliberately does NOT do: it does not apply a debt event.
 * A balance changes only through the audited debt-event chokepoint, as its
 * own explicit decision (Temujin os-v2 r2 #2). Approving a reply is not
 * approving a payment.
 */
export async function actionObligation(
  obligationId: string
): Promise<{ ok: boolean; error?: string }> {
  const actor = await currentActor();
  const verdict = canPerform(
    { id: actor.id, role: actor.role, active: actor.active },
    "letter_approve"
  );
  if (!verdict.allowed) return { ok: false, error: verdict.reason };

  const db = getDb();
  const row = await db.query.obligations.findFirst({
    where: eq(obligations.id, obligationId),
  });
  if (!row) return { ok: false, error: "not_found" };
  if (row.status !== "open") return { ok: false, error: "not_open" };

  // An unreviewed agent link must not carry a decision (plan §2.1 B).
  if (row.dossierId) {
    const msg = await db.query.messages.findFirst({
      where: eq(messages.id, row.sourceMessageId),
    });
    if (msg && msg.linkSource === "agent" && !msg.linkReviewed)
      return { ok: false, error: "link_unconfirmed" };
  }

  await db
    .update(obligations)
    .set({ status: "actioned", decidedBy: actor.id, decidedAt: new Date() })
    .where(eq(obligations.id, obligationId));

  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "approve",
    entityType: "obligation",
    entityId: obligationId,
    versionAfter: { status: "actioned" },
    reason: "obligation actioned by bewindvoerder",
  });
  revalidatePath("/inbox");
  return { ok: true };
}

/** Open-obligation count for the sidebar. */
export async function openObligationCount(): Promise<number> {
  try {
    const db = getDb();
    const r = await db.execute<{ n: number }>(
      sql`SELECT COUNT(*)::int AS n FROM obligations WHERE status = 'open'`
    );
    return Number(r.rows?.[0]?.n ?? 0);
  } catch {
    return 0;
  }
}
