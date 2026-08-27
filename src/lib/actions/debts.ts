"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  budgetLines,
  debtEvents,
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
  deltaCents: number;
  sourceTransactionId?: string;
  sourceDocumentId?: string;
  note?: string;
  actorId: string;
  actorType: "human" | "system";
}): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const debt = await db.query.debts.findFirst({
    where: eq(debts.id, input.debtId),
  });
  if (!debt) return { ok: false, error: "not_found" };

  const [event] = await db
    .insert(debtEvents)
    .values({
      debtId: input.debtId,
      kind: input.kind,
      deltaCents: input.deltaCents,
      sourceTransactionId: input.sourceTransactionId ?? null,
      sourceDocumentId: input.sourceDocumentId ?? null,
      note: input.note ?? null,
      actorId: input.actorId,
    })
    // sourceTransactionId unique: one transaction settles a debt at most
    // once — a concurrent/repeated reconciliation inserts nothing.
    .onConflictDoNothing()
    .returning();
  if (!event) return { ok: false, error: "duplicate_transaction" };

  const newBalance = debt.currentAmountCents + input.deltaCents;
  const newStatus =
    newBalance <= 0 && debt.status !== "afgelost" ? "afgelost" : debt.status;
  await db
    .update(debts)
    .set({ currentAmountCents: Math.max(0, newBalance), status: newStatus })
    .where(eq(debts.id, input.debtId));

  await writeAudit({
    actorId: input.actorId,
    actorType: input.actorType,
    action: "update",
    entityType: "debt",
    entityId: input.debtId,
    versionBefore: { currentAmountCents: debt.currentAmountCents },
    versionAfter: {
      currentAmountCents: Math.max(0, newBalance),
      eventId: event.id,
      eventKind: input.kind,
      deltaCents: input.deltaCents,
      sourceTransactionId: input.sourceTransactionId,
      sourceDocumentId: input.sourceDocumentId,
    },
    reason:
      input.kind === "payment_reconciled"
        ? "debt reduced by reconciled CAMT payment"
        : input.kind === "creditor_statement"
          ? `debt balance set per creditor statement — ${input.note ?? ""}`
          : `debt correction — ${input.note ?? ""}`,
  });
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
    deltaCents: statedCents - debt.currentAmountCents,
    sourceDocumentId,
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
    const res = await applyDebtEvent({
      debtId: m.debtId,
      kind: "payment_reconciled",
      deltaCents: m.deltaCents,
      sourceTransactionId: m.transactionId,
      actorId: "system",
      actorType: "system",
    });
    if (res.ok) reconciled++;
  }
  return { reconciled };
}
