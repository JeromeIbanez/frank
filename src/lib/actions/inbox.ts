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
  letters,
} from "@/lib/db/schema";
import { currentActor } from "@/lib/identity";
import { writeAudit } from "@/lib/audit";
import { canPerform } from "@/lib/domain/authz";
import { approveLetter } from "@/lib/actions/letters";
import {
  agentContext,
  assertAgentMay,
  assertGrantCovers,
  agentActorId,
  type AgentContext,
} from "@/lib/agent-context";
import {
  resolveDossier,
  type DossierCandidate,
} from "@/lib/domain/resolve-dossier";
import {
  readInboundFacts,
  readCreditorRegimeInvocation,
  classifyObligationKind,
} from "@/lib/domain/inbound";
import { draftWikDispute, draftInfoRequestAck } from "@/lib/domain/reply-drafts";
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

/**
 * Provisioning the simulated channel is HUMAN CONFIGURATION, not agent work
 * (Temujin PR-9 r1 #2).
 *
 * Creating a channel and stamping its sync time are office-configuration
 * writes. Doing them inside the agent pass meant writes happening before any
 * gate — the same ordering failure found in PR-8. So they are attributed to
 * the human who pressed the button, audited, and completed BEFORE the agent
 * context is built.
 */
async function provisionSimulatedChannel(actorId: string): Promise<string> {
  const db = getDb();
  const existing = await db.query.channels.findFirst({
    where: and(eq(channels.kind, "email"), eq(channels.adapter, "simulated")),
  });
  if (existing) return existing.id;
  const [row] = await db
    .insert(channels)
    .values({
      kind: "email",
      label: SIMULATED_CHANNEL_LABEL,
      adapter: "simulated",
    })
    .returning();
  await writeAudit({
    actorId,
    actorType: "human",
    action: "create",
    entityType: "channel",
    entityId: row.id,
    versionAfter: { kind: "email", adapter: "simulated" },
    reason: "provisioned the simulated mailbox (office configuration)",
  });
  return row.id;
}

/** Everything the deterministic matchers need, in one query per table. */
async function loadCandidates(): Promise<DossierCandidate[]> {
  const db = getDb();
  const [ds, accs, cts, dbts] = await Promise.all([
    db
      .select({
        id: dossiers.id,
        firstName: dossiers.firstName,
        lastName: dossiers.lastName,
        bsn: dossiers.bsn,
      })
      .from(dossiers),
    db.select({ dossierId: accounts.dossierId, iban: accounts.iban }).from(accounts),
    db.select({ dossierId: contacts.dossierId, email: contacts.email }).from(contacts),
    db.select({ dossierId: debts.dossierId, reference: debts.reference }).from(debts),
  ]);
  const by = <T extends { dossierId: string | null }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      if (!r.dossierId) continue;
      const list = m.get(r.dossierId);
      if (list) list.push(r);
      else m.set(r.dossierId, [r]);
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
    contactEmails: (ctById.get(d.id) ?? [])
      .map((c) => c.email)
      .filter(Boolean) as string[],
    debtReferences: (dbById.get(d.id) ?? [])
      .map((x) => x.reference)
      .filter(Boolean) as string[],
  }));
}

/**
 * Postbode's ingest pass over one message.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO (Temujin PR-9 r2 #1)
 * ------------------------------------------------------
 * It does not attach a dossier to the obligation, and it does not draft a
 * letter. An earlier version did both while the dossier link was still
 * `linkReviewed: false`, which broke the plan's own rule that no downstream
 * action depending on dossier identity may proceed on an unconfirmed link.
 * The consequence was concrete: a letter row bound to a client Frank had only
 * GUESSED at, sitting in that client's dossier before any human looked at it.
 *
 * So ingest produces the message (carrying its provisional link, marked as
 * such) and an obligation attached only to the message. Everything
 * dossier-bound is materialized by `confirmDossierLink`, after a human
 * confirms who this is about.
 */
async function ingestOne(
  fixture: (typeof INBOX_FIXTURES)[number],
  channelId: string,
  candidates: DossierCandidate[],
  ctx: AgentContext
): Promise<"created" | "duplicate"> {
  const db = getDb();
  const receivedAt = new Date(Date.now() - fixture.receivedDaysAgo * 86_400_000);
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

  // --- Resolve. Deterministic matchers, recorded evidence. ---
  const resolution = resolveDossier({
    text: raw,
    fromAddress: fixture.fromAddress,
    candidates,
  });

  // Recording the conclusion is itself an interpretation and needs its own
  // grant — permission to ingest is not permission to conclude (Temujin
  // PR-9 r2 #2). This covers BOTH outcomes, including "I could not tell",
  // which is a conclusion too.
  const resolveGrant = await assertAgentMay(ctx, "message_resolve", {
    type: "message",
    id: msg.id,
  });
  assertGrantCovers(resolveGrant, "message_resolve", {
    type: "message",
    id: msg.id,
  });

  const evidence = resolution.evidence.map((e) => ({
    matcher: e.matcher,
    value: e.value,
  }));

  if (resolution.dossierId) {
    const linkGrant = await assertAgentMay(ctx, "dossier_link", {
      type: "message",
      id: msg.id,
    });
    assertGrantCovers(linkGrant, "dossier_link", { type: "message", id: msg.id });

    await db
      .update(messages)
      .set({
        dossierId: resolution.dossierId,
        resolutionConfidence: resolution.confidence,
        resolutionEvidence: evidence,
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
        resolutionEvidence: evidence,
        status: "needs_dossier",
      })
      .where(eq(messages.id, msg.id));

    await writeAudit({
      actorId: agentActorId(resolveGrant),
      actorType: "agent",
      action: "update",
      entityType: "message",
      entityId: msg.id,
      correlationId: resolveGrant.correlationId,
      versionAfter: {
        confidence: resolution.confidence,
        reason: resolution.reason,
      },
      reason: "could not identify a dossier — routed to a human",
    });
  }

  // --- Read the labelled facts, then run the checks. ---
  const facts = readInboundFacts(raw);
  const kind = classifyObligationKind(fixture.subject, fixture.body);
  const findings: Record<string, unknown>[] = [];

  // The applicability basis must be evidenced by the DOCUMENT, and is only
  // ever the creditor's own invocation of the BIK regime — not proof of
  // consumer status, which is a different thing (Temujin PR-9 r1 #3, r2 #3).
  const invocation = readCreditorRegimeInvocation(raw);
  const wik = checkWikAmount({
    principalCents: facts.principalCents?.value,
    chargedCostsCents: facts.collectionCostsCents?.value,
    applicabilityBasis: invocation?.value,
    onDate: officeToday(),
  });
  if (wik.finding !== "none") {
    findings.push({
      ...wik,
      evidence: {
        principal: facts.principalCents?.snippet,
        collectionCosts: facts.collectionCostsCents?.snippet,
        applicabilityBasis: invocation?.snippet,
      },
    });
  }

  // Creating an obligation is a real work item, not an inbound fact, so it
  // has its own gated, entity-bound capability (Temujin PR-9 r1 #1).
  const obligationGrant = await assertAgentMay(ctx, "obligation_create", {
    type: "message",
    id: msg.id,
  });
  assertGrantCovers(obligationGrant, "obligation_create", {
    type: "message",
    id: msg.id,
  });

  const [obligationRow] = await db
    .insert(obligations)
    .values({
      // NULL until a human confirms the link — see the note above.
      dossierId: null,
      sourceMessageId: msg.id,
      kind,
      summaryNl: buildSummary(fixture, facts, "nl"),
      summaryEn: buildSummary(fixture, facts, "en"),
      dueDate: facts.dueDate?.value ?? null,
      dueDateSource: facts.dueDate?.snippet ?? null,
      agentKey: ctx.agentKey,
      findings,
      status: "open",
    })
    .onConflictDoNothing()
    .returning();

  if (obligationRow) {
    await writeAudit({
      actorId: agentActorId(obligationGrant),
      actorType: "agent",
      action: "create",
      entityType: "obligation",
      entityId: obligationRow.id,
      correlationId: obligationGrant.correlationId,
      versionAfter: { kind, findings: findings.length, dossierId: null },
      reason: "obligation raised by agent — awaiting human decision",
    });
  }

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
  // Human configuration FIRST, and fully finished, before any agent context
  // exists (Temujin PR-9 r1 #2).
  const actor = await currentActor();
  if (!actor.active)
    return { ok: false, created: 0, duplicates: 0, error: "inactive_actor" };
  const channelId = await provisionSimulatedChannel(actor.id);
  await getDb()
    .update(channels)
    .set({ lastSyncAt: new Date() })
    .where(eq(channels.id, channelId));

  const candidates = await loadCandidates();

  // Only now does the agent begin.
  const ctx = agentContext("postbode");
  let created = 0;
  let duplicates = 0;
  for (const fixture of INBOX_FIXTURES) {
    const r = await ingestOne(fixture, channelId, candidates, ctx);
    if (r === "created") created++;
    else duplicates++;
  }

  revalidatePath("/inbox");
  revalidatePath("/");
  return { ok: true, created, duplicates };
}

/**
 * Postbode drafts the reply — gated, entity-bound, and only AFTER a human has
 * confirmed whose dossier this is.
 *
 * Deterministic Dutch templates rather than generation: a letter disputing a
 * statutory cap must state the arithmetic exactly, so every number comes from
 * the finding that produced it. The letter lands as `draft`; sending is never
 * an agent act (N2).
 */
async function draftReplyFor(
  obligationId: string,
  dossierId: string,
  clientName: string
): Promise<void> {
  const db = getDb();
  const obligation = await db.query.obligations.findFirst({
    where: eq(obligations.id, obligationId),
  });
  if (!obligation || obligation.proposedLetterId) return;
  const msg = await db.query.messages.findFirst({
    where: eq(messages.id, obligation.sourceMessageId),
  });
  if (!msg) return;

  const facts = readInboundFacts(`${msg.subject ?? ""}\n${msg.bodyText ?? ""}`);
  const wik = (obligation.findings ?? []).find(
    (f) => (f as { finding?: string }).finding === "wik_amount_exceeds_cap"
  ) as
    | {
        principalCents: number;
        chargedCostsCents: number;
        maximumCents: number;
        excessCents: number;
        sourceUrl: string;
      }
    | undefined;

  const draft = wik
    ? draftWikDispute({
        creditorName: msg.fromName ?? "de schuldeiser",
        reference: facts.reference?.value,
        principalCents: wik.principalCents,
        chargedCostsCents: wik.chargedCostsCents,
        maximumCents: wik.maximumCents,
        excessCents: wik.excessCents,
        clientName,
        sourceUrl: wik.sourceUrl,
      })
    : obligation.kind === "information_request"
      ? draftInfoRequestAck({
          senderName: msg.fromName ?? "de afzender",
          reference: facts.reference?.value,
          clientName,
          dueDate: obligation.dueDate,
        })
      : null;
  if (!draft) return;

  const ctx = agentContext("postbode");
  const grant = await assertAgentMay(ctx, "letter_draft", {
    type: "obligation",
    id: obligationId,
  });
  assertGrantCovers(grant, "letter_draft", {
    type: "obligation",
    id: obligationId,
  });

  const [letterRow] = await db
    .insert(letters)
    .values({
      dossierId,
      templateKey: draft.templateKey,
      recipientName: msg.fromName,
      subject: draft.subject,
      body: draft.body,
      language: "nl",
      status: "draft",
    })
    .returning();
  if (!letterRow) return;

  await db
    .update(obligations)
    .set({ proposedLetterId: letterRow.id })
    .where(eq(obligations.id, obligationId));

  await writeAudit({
    actorId: agentActorId(grant),
    actorType: "agent",
    action: "create",
    entityType: "letter",
    entityId: letterRow.id,
    correlationId: grant.correlationId,
    versionAfter: { templateKey: draft.templateKey, status: "draft" },
    reason: "reply drafted by agent — awaiting human approval",
  });
}

/**
 * The human decision that unlocks everything dossier-bound.
 *
 * Only after this does the obligation acquire a dossier and the reply get
 * drafted. Before it, Frank has a guess; after it, a person has taken
 * responsibility for who this letter is about.
 */
export async function confirmDossierLink(
  messageId: string,
  dossierId: string
): Promise<{ ok: boolean; error?: string }> {
  const actor = await currentActor();
  if (!actor.active) return { ok: false, error: "inactive_actor" };

  const db = getDb();
  const msg = await db.query.messages.findFirst({
    where: eq(messages.id, messageId),
  });
  if (!msg) return { ok: false, error: "not_found" };
  const dossier = await db.query.dossiers.findFirst({
    where: eq(dossiers.id, dossierId),
  });
  if (!dossier) return { ok: false, error: "unknown_dossier" };

  await db
    .update(messages)
    .set({
      dossierId,
      linkSource: "human",
      linkReviewed: true,
      status: "resolved",
    })
    .where(eq(messages.id, messageId));

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

  const obligation = await db.query.obligations.findFirst({
    where: eq(obligations.sourceMessageId, messageId),
  });
  if (obligation) {
    await db
      .update(obligations)
      .set({ dossierId })
      .where(eq(obligations.id, obligation.id));
    // NOW the reply may be drafted — the dossier identity is a human's
    // decision rather than Frank's guess.
    await draftReplyFor(
      obligation.id,
      dossierId,
      `${dossier.firstName} ${dossier.lastName}`
    );
  }

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
 * Approve the drafted reply and close the obligation.
 *
 * The letter goes draft → approved through `approveLetter`, the SAME action
 * manual correspondence uses — one approval path, one audit trail, per the
 * os-v1 materialization invariant. The result is then RE-READ and verified
 * rather than assumed, because `approveLetter` returns void and refuses
 * silently; a success toast over an unchanged row is exactly the failure mode
 * os-v1 PR-4 R2 found.
 *
 * Note what this does NOT do: it does not apply a debt event, and it does not
 * send anything. A balance changes only through the audited debt-event
 * chokepoint as its own explicit decision (Temujin os-v2 r2 #2), and sending
 * is never an agent act (N2).
 */
export async function actionObligation(
  obligationId: string
): Promise<{ ok: boolean; error?: string; approvedLetter?: boolean }> {
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
  const msg = await db.query.messages.findFirst({
    where: eq(messages.id, row.sourceMessageId),
  });
  if (!msg?.linkReviewed || !row.dossierId)
    return { ok: false, error: "link_unconfirmed" };

  let approvedLetter = false;
  if (row.proposedLetterId) {
    await approveLetter(row.proposedLetterId);
    const letter = await db.query.letters.findFirst({
      where: eq(letters.id, row.proposedLetterId),
    });
    if (letter?.status !== "approved")
      return { ok: false, error: "letter_not_approved" };
    approvedLetter = true;
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
    versionAfter: { status: "actioned", approvedLetter },
    reason: approvedLetter
      ? "obligation actioned; drafted reply approved (not sent)"
      : "obligation actioned (no drafted reply)",
  });
  revalidatePath("/inbox");
  return { ok: true, approvedLetter };
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
