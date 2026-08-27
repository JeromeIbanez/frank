"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { getDb } from "@/lib/db";
import {
  budgetLines,
  debts,
  documents,
  transactions,
} from "@/lib/db/schema";
import { currentActor } from "@/lib/identity";
import { canPerform } from "@/lib/domain/authz";
import { writeAudit } from "@/lib/audit";
import { refreshSignalsSafe } from "@/lib/signals";
import { matchRegelingPayments } from "@/lib/domain/debts";
import { parseEuro } from "@/lib/domain/money";

/**
 * THE chokepoint for debt-balance changes (plan os-v1 W4 + Temujin
 * round-2 note): inserts the provenance-bearing event, updates the
 * explicitly-audited cache debts.currentAmountCents, and writes the audit
 * row. Nothing else may touch a debt balance.
 */
async function applyDebtEvent(input: {
  debtId: string;
  kind: "payment_reconciled" | "creditor_statement" | "correction";
  /** For creditor_statement the caller passes the STATED balance instead
   *  of a delta: the delta is then computed inside the same statement,
   *  against the locked row — never against a stale read. */
  deltaCents?: number;
  targetBalanceCents?: number;
  sourceTransactionId?: string;
  sourceDocumentId?: string;
  sourceProvenance:
    | "camt_import"
    | "manual_entry"
    | "document"
    | "human_assertion";
  note?: string;
  actorId: string;
  actorType: "human" | "system";
}): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const eventId = createId();
  const auditId = createId();
  const reason =
    input.kind === "payment_reconciled"
      ? `debt reduced by reconciled bank payment (${input.sourceProvenance})`
      : input.kind === "creditor_statement"
        ? `debt balance set per creditor statement — ${input.note ?? ""}`
        : `debt correction — ${input.note ?? ""}`;

  // ONE statement = ONE transaction (Temujin PR-7 gate A). The neon-http
  // driver has no interactive transactions, so event insert + balance
  // update + audit are a single CTE chain:
  //  - `locked` takes a row lock, so concurrent events on the SAME debt
  //    serialize instead of clobbering each other;
  //  - the delta is applied RELATIVE to the locked balance (never a
  //    read-modify-write from application memory);
  //  - the update and the audit fire ONLY if the event row was actually
  //    inserted, so a duplicate sourceTransactionId changes nothing.
  const rows = await db.execute(sql`
    WITH locked AS (
      SELECT id, current_amount_cents, status
      FROM debts WHERE id = ${input.debtId}
      FOR UPDATE
    ),
    ins AS (
      INSERT INTO debt_events (
        id, debt_id, kind, delta_cents, source_transaction_id,
        source_document_id, source_provenance, note, actor_id
      )
      SELECT
        ${eventId}::text, ${input.debtId}::text, ${input.kind}::text,
        ${
          input.targetBalanceCents !== undefined
            ? sql`${input.targetBalanceCents}::integer - locked.current_amount_cents`
            : sql`${input.deltaCents ?? 0}::integer`
        },
        ${input.sourceTransactionId ?? null}::text,
        ${input.sourceDocumentId ?? null}::text,
        ${input.sourceProvenance}::text, ${input.note ?? null}::text,
        ${input.actorId}::text
      FROM locked
      ON CONFLICT DO NOTHING
      RETURNING id, delta_cents
    ),
    upd AS (
      UPDATE debts d
      SET current_amount_cents = GREATEST(0, d.current_amount_cents + ins.delta_cents),
          status = CASE
            WHEN d.current_amount_cents + ins.delta_cents <= 0 AND d.status <> 'afgelost'
              THEN 'afgelost' ELSE d.status END
      FROM ins
      WHERE d.id = ${input.debtId}
      RETURNING d.current_amount_cents AS new_balance, ins.delta_cents
    )
    INSERT INTO audit_events (
      id, actor_id, actor_type, action, entity_type, entity_id,
      version_before, version_after, reason
    )
    SELECT
      ${auditId}::text, ${input.actorId}::text, ${input.actorType}::text,
      'update', 'debt', ${input.debtId}::text,
      -- The PRE-UPDATE balance comes from the locked row, never from
      -- new_balance − delta: an overpayment clamps the new balance at 0,
      -- which would misreport the prior balance (Temujin PR-7 r2 gate A).
      jsonb_build_object('currentAmountCents', locked.current_amount_cents),
      jsonb_build_object(
        'currentAmountCents', upd.new_balance,
        'eventId', ${eventId}::text,
        'eventKind', ${input.kind}::text,
        'deltaCents', upd.delta_cents,
        'sourceProvenance', ${input.sourceProvenance}::text,
        'sourceTransactionId', ${input.sourceTransactionId ?? null}::text,
        'sourceDocumentId', ${input.sourceDocumentId ?? null}::text,
        -- an overpayment writes off more than was owed: recorded, not hidden
        'clampedCents', GREATEST(0, -(locked.current_amount_cents + upd.delta_cents))
      ),
      ${reason}::text
    FROM upd CROSS JOIN locked
    RETURNING id
  `);
  const applied = Array.isArray(rows) ? rows.length : (rows.rows?.length ?? 0);
  if (applied === 0) return { ok: false, error: "duplicate_transaction" };
  return { ok: true };
}

/**
 * Human-entered saldo-opgave: sets the balance to the creditor's stated
 * amount. Requires the statement DOCUMENT as provenance. Handles partial /
 * combined payments that exact-match reconciliation cannot see.
 */
export async function recordCreditorStatement(
  debtId: string,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const actor = await currentActor();
  // Adjusting legal debt positions is a bewindvoerder act.
  if (!canPerform(actor, "debt_adjust").allowed)
    return { ok: false, error: "role_required" };
  const db = getDb();
  const debt = await db.query.debts.findFirst({ where: eq(debts.id, debtId) });
  if (!debt) return { ok: false, error: "not_found" };
  const statedCents = parseEuro(String(formData.get("statedAmount") ?? ""));
  if (statedCents === null || statedCents < 0)
    return { ok: false, error: "invalid_amount" };
  const sourceDocumentId = String(formData.get("sourceDocumentId") || "");
  if (!sourceDocumentId) return { ok: false, error: "document_required" };
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, sourceDocumentId),
  });
  if (!doc || doc.dossierId !== debt.dossierId)
    return { ok: false, error: "document_required" };
  const note = String(formData.get("note") || "").trim();

  const res = await applyDebtEvent({
    debtId,
    kind: "creditor_statement",
    // Target balance, not a delta: the delta is derived inside the locked
    // statement so a concurrent event cannot make this write stale.
    targetBalanceCents: statedCents,
    sourceDocumentId,
    sourceProvenance: "document",
    note: note || `saldo-opgave: ${doc.filename}`,
    actorId: actor.id,
    actorType: "human",
  });
  if (res.ok) {
    revalidatePath(`/dossiers/${debt.dossierId}`);
    await refreshSignalsSafe();
  }
  return res;
}

/**
 * Create a betalingsregeling from a debt: a linked expense budget line
 * (aflossing_schuld) whose payments the reconciliation step matches back
 * to this debt.
 */
export async function createRegeling(
  debtId: string,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const actor = await currentActor();
  if (!canPerform(actor, "debt_adjust").allowed)
    return { ok: false, error: "role_required" };
  const db = getDb();
  const debt = await db.query.debts.findFirst({ where: eq(debts.id, debtId) });
  if (!debt) return { ok: false, error: "not_found" };
  const amountCents = parseEuro(String(formData.get("amount") ?? ""));
  if (amountCents === null || amountCents <= 0)
    return { ok: false, error: "invalid_amount" };
  const iban = String(formData.get("counterpartyIban") || "")
    .trim()
    .toUpperCase();
  if (iban.length < 15) return { ok: false, error: "invalid_iban" };
  const existing = await db.query.budgetLines.findFirst({
    where: and(eq(budgetLines.debtId, debtId), eq(budgetLines.active, true)),
  });
  if (existing) return { ok: false, error: "regeling_exists" };

  const [row] = await db
    .insert(budgetLines)
    .values({
      dossierId: debt.dossierId,
      debtId,
      kind: "expense",
      name: `Regeling ${debt.creditor}`,
      categoryKey: "aflossing_schuld",
      amountCents,
      frequency: "monthly",
      expectedDay: Number(formData.get("expectedDay")) || null,
      counterpartyName: debt.creditor,
      counterpartyIban: iban,
    })
    .returning();
  await db
    .update(debts)
    .set({ status: "regeling", monthlyPaymentCents: amountCents })
    .where(eq(debts.id, debtId));
  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "create",
    entityType: "budget_line",
    entityId: row.id,
    versionAfter: {
      name: row.name,
      amountCents,
      debtId,
      categoryKey: "aflossing_schuld",
    },
    reason: `betalingsregeling created for debt ${debt.creditor}`,
  });
  revalidatePath(`/dossiers/${debt.dossierId}`);
  await refreshSignalsSafe();
  return { ok: true };
}

/**
 * Code reconciliation step (runs after CAMT import): match imported debits
 * to active regeling lines — same dossier, EXACT IBAN, EXACT amount — and
 * apply payment_reconciled events. Idempotent via the unique
 * sourceTransactionId; anything weaker than exact is left to the human
 * creditor-statement path.
 */
export async function reconcileDebtPayments(options?: {
  sinceDate?: string;
}): Promise<{ reconciled: number }> {
  const db = getDb();
  const lines = await db.query.budgetLines.findMany({
    where: and(eq(budgetLines.active, true), isNotNull(budgetLines.debtId)),
  });
  if (lines.length === 0) return { reconciled: 0 };
  const since =
    options?.sinceDate ??
    new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const ibans = lines
    .map((l) => l.counterpartyIban)
    .filter((v): v is string => v !== null);
  if (ibans.length === 0) return { reconciled: 0 };
  // Both bank-imported and human-transcribed bank facts are allowed
  // evidence (Temujin PR-7 gate A) — but WHICH one is recorded on every
  // event, never blurred. AI-derived or proposed rows are not a source
  // here: only real transaction rows exist in this table.
  const txs = await db.query.transactions.findMany({
    where: and(
      gte(transactions.bookingDate, since),
      lte(transactions.amountCents, -1),
      inArray(transactions.counterpartyIban, ibans)
    ),
  });
  const matches = matchRegelingPayments(
    lines.map((l) => ({
      budgetLineId: l.id,
      debtId: l.debtId!,
      dossierId: l.dossierId,
      counterpartyIban: l.counterpartyIban,
      amountCents: l.amountCents,
    })),
    txs.map((t) => ({
      id: t.id,
      dossierId: t.dossierId,
      bookingDate: t.bookingDate,
      amountCents: t.amountCents,
      counterpartyIban: t.counterpartyIban,
    }))
  );
  let reconciled = 0;
  for (const m of matches) {
    const tx = txs.find((t) => t.id === m.transactionId)!;
    const res = await applyDebtEvent({
      debtId: m.debtId,
      kind: "payment_reconciled",
      deltaCents: m.deltaCents,
      sourceTransactionId: m.transactionId,
      sourceProvenance: tx.importId ? "camt_import" : "manual_entry",
      actorId: "system",
      actorType: "system",
    });
    if (res.ok) reconciled++;
  }
  return { reconciled };
}
