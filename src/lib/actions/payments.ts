"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  budgetLines,
  dossiers,
  paymentBatches,
  paymentItems,
} from "@/lib/db/schema";
import { countActiveBewindvoerders, currentActor } from "@/lib/identity";
import { canApproveBatch, canPerform } from "@/lib/domain/authz";
import { writeAudit } from "@/lib/audit";
import { checkMachtiging } from "@/lib/domain/machtiging";
import { isValidIban } from "@/lib/domain/pain001";
import { shiftToBusinessDay } from "@/lib/domain/holidays";
import { refreshSignalsSafe } from "@/lib/signals";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Build a draft payment batch from due budget lines (monthly expenses) and
 * leefgeld schedules across all active dossiers. Every item runs through the
 * machtiging guard (a legal-review flag, never a conclusion) and IBAN
 * validation. Draft → human approval → export (demo-labeled pain.001).
 */
export async function createPaymentProposals(): Promise<{
  batchId?: string;
  items: number;
  error?: string;
}> {
  const actor = await currentActor();
  const db = getDb();

  // Idempotency guard (Temujin code review finding 2): at most ONE open
  // (draft/approved) batch may exist — a double click, retry, or repeat run
  // must never create the same payable twice. Backed by a partial unique
  // index on payment_batches (one_open_payment_batch).
  const existing = await db.query.paymentBatches.findFirst({
    where: inArray(paymentBatches.status, ["draft", "approved"]),
  });
  if (existing) {
    return { batchId: existing.id, items: 0, error: "open_batch_exists" };
  }

  const activeDossiers = await db.query.dossiers.findMany({
    where: eq(dossiers.status, "actief"),
    with: { accounts: true, budgetLines: true },
  });

  const today = new Date();
  const execDate = shiftToBusinessDay(
    new Date(today.getTime() + 2 * 86400_000),
    "after"
  );

  let batch: typeof paymentBatches.$inferSelect;
  try {
    [batch] = await db
      .insert(paymentBatches)
      .values({
        name: `Betaalvoorstel ${isoDate(today)}`,
        executionDate: isoDate(execDate),
        status: "draft",
        createdBy: actor.id,
        demoExport: true,
      })
      .returning();
  } catch {
    // partial unique index one_open_payment_batch lost the race — surface
    // the winning batch so the UI can navigate to it
    const winner = await db.query.paymentBatches.findFirst({
      where: inArray(paymentBatches.status, ["draft", "approved"]),
    });
    return { batchId: winner?.id, items: 0, error: "open_batch_exists" };
  }

  let itemCount = 0;
  const yearStart = `${today.getUTCFullYear()}-01-01`;

  for (const d of activeDossiers) {
    const beheer = d.accounts.find((a) => a.type === "beheer");
    const leefgeldAcc = d.accounts.find((a) => a.type === "leefgeld");
    if (!beheer) continue;

    // Leefgeld
    if (d.leefgeldAmountCents && leefgeldAcc) {
      const flag = checkMachtiging({
        amountCents: d.leefgeldAmountCents,
        categoryKey: "leefgeld",
        purposeTag: null,
        yearSpentOnPurposeCents: 0,
        kind: "leefgeld",
      });
      const errors: string[] = [];
      if (!isValidIban(leefgeldAcc.iban)) errors.push("invalid_iban");
      await db.insert(paymentItems).values({
        batchId: batch.id,
        dossierId: d.id,
        debtorAccountId: beheer.id,
        creditorName: `${d.firstName} ${d.lastName} (leefgeld)`,
        creditorIban: leefgeldAcc.iban,
        amountCents: d.leefgeldAmountCents,
        remittanceInfo: `Leefgeld week ${getWeekNumber(today)}`,
        machtigingFlag: { triggered: flag.triggered, reasons: flag.reasons },
        validationErrors: errors.length ? errors : null,
      });
      itemCount++;
    }

    // Monthly expense budget lines with a counterparty IBAN
    for (const line of d.budgetLines.filter(
      (b) =>
        b.kind === "expense" &&
        b.active &&
        b.frequency === "monthly" &&
        b.counterpartyIban
    )) {
      // LOVT B.D3 aggregation is per identifiable SINGLE purpose (driving
      // lessons, a holiday, furnishing) — never a whole category (Temujin
      // design-PR review #1). A line with a purposeTag is discretionary
      // spending on that purpose: purchase semantics, aggregated over this
      // calendar year's prior payment items for the same purpose. Lines
      // without a purposeTag are contractual fixed lasten: regular_bill,
      // never amount-triggered.
      let yearSpentOnPurposeCents = 0;
      if (line.purposeTag) {
        const [spent] = await db
          .select({
            total: sql<number>`coalesce(sum(${paymentItems.amountCents}),0)`,
          })
          .from(paymentItems)
          .innerJoin(
            paymentBatches,
            eq(paymentItems.batchId, paymentBatches.id)
          )
          .innerJoin(budgetLines, eq(paymentItems.budgetLineId, budgetLines.id))
          .where(
            and(
              eq(paymentItems.dossierId, d.id),
              eq(paymentItems.excluded, false),
              eq(budgetLines.purposeTag, line.purposeTag),
              inArray(paymentBatches.status, ["approved", "exported"]),
              gte(paymentBatches.executionDate, yearStart)
            )
          );
        yearSpentOnPurposeCents = Number(spent?.total ?? 0);
      }

      const flag = checkMachtiging({
        amountCents: line.amountCents,
        categoryKey: line.categoryKey,
        purposeTag: line.purposeTag,
        yearSpentOnPurposeCents,
        kind: line.purposeTag ? "purchase" : "regular_bill",
      });
      const errors: string[] = [];
      if (!isValidIban(line.counterpartyIban!)) errors.push("invalid_iban");
      if (line.amountCents <= 0) errors.push("invalid_amount");

      await db.insert(paymentItems).values({
        batchId: batch.id,
        dossierId: d.id,
        debtorAccountId: beheer.id,
        creditorName: line.counterpartyName ?? line.name,
        creditorIban: line.counterpartyIban!,
        amountCents: line.amountCents,
        remittanceInfo: line.name,
        budgetLineId: line.id,
        machtigingFlag: { triggered: flag.triggered, reasons: flag.reasons },
        validationErrors: errors.length ? errors : null,
      });
      itemCount++;
    }
  }

  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "create",
    entityType: "payment_batch",
    entityId: batch.id,
    versionAfter: { items: itemCount, executionDate: isoDate(execDate) },
    reason: "payment proposals generated from budgetplan + leefgeld schedules",
  });

  revalidatePath("/payments");
  await refreshSignalsSafe();
  return { batchId: batch.id, items: itemCount };
}

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Resolve a machtiging flag: consent / court authorization / not applicable. */
export async function resolveMachtigingFlag(
  itemId: string,
  resolution: "consent_recorded" | "court_authorization" | "not_applicable",
  rationale: string
): Promise<{ ok: boolean; error?: string }> {
  const actor = await currentActor();
  // Resolving a legal-review flag is a bewindvoerder act (plan os-v1 W0).
  const verdict = canPerform(actor, "machtiging_resolve");
  if (!verdict.allowed) return { ok: false, error: verdict.reason };
  if (!rationale.trim()) return { ok: false, error: "rationale_required" };
  const db = getDb();
  const item = await db.query.paymentItems.findFirst({
    where: eq(paymentItems.id, itemId),
  });
  if (!item || !item.machtigingFlag?.triggered) return { ok: false, error: "not_found" };
  // A locked (approved/exported) batch is immutable — including its legal-
  // resolution records (Temujin design-PR review #2).
  const parentBatch = await db.query.paymentBatches.findFirst({
    where: eq(paymentBatches.id, item.batchId),
  });
  if (!parentBatch || parentBatch.status !== "draft") {
    return { ok: false, error: "locked" };
  }

  const next = {
    ...item.machtigingFlag,
    resolution,
    rationale,
    resolvedBy: actor.id,
    resolvedAt: new Date().toISOString(),
  };
  await db
    .update(paymentItems)
    .set({ machtigingFlag: next })
    .where(eq(paymentItems.id, itemId));
  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "approve",
    entityType: "payment_item",
    entityId: itemId,
    versionBefore: item.machtigingFlag,
    versionAfter: next,
    reason: `machtiging flag resolved: ${resolution} — ${rationale}`,
  });
  const batch = await db.query.paymentBatches.findFirst({
    where: eq(paymentBatches.id, item.batchId),
  });
  if (batch) revalidatePath(`/payments/${batch.id}`);
  revalidatePath("/payments");
  await refreshSignalsSafe();
  return { ok: true };
}

/**
 * Approve a batch. Blocked while any item has validation errors or an
 * unresolved machtiging flag (PRD money invariants).
 */
export async function approveBatch(
  batchId: string,
  acknowledged?: boolean
): Promise<{ ok: boolean; error?: string }> {
  const actor = await currentActor();
  const db = getDb();
  // The acknowledgment checkbox is UI, but the invariant is server-side
  // (Temujin guardrail 3): no approval without an explicit acknowledgment.
  if (!acknowledged) return { ok: false, error: "not_acknowledged" };
  const batch = await db.query.paymentBatches.findFirst({
    where: eq(paymentBatches.id, batchId),
    with: { items: true },
  });
  if (!batch || batch.status !== "draft") return { ok: false, error: "invalid_state" };

  // Role + vier-ogen (plan os-v1 W0): approval is a bewindvoerder act, and
  // with more than one active bewindvoerder the approver must differ from
  // the batch creator. Enforced here, never in the UI.
  const verdict = canApproveBatch(
    actor,
    batch.createdBy,
    await countActiveBewindvoerders()
  );
  if (!verdict.allowed) return { ok: false, error: verdict.reason };

  // Server-side re-check (Temujin guardrail 2): excluded items neither block
  // nor count; everything else must be clean.
  const included = batch.items.filter((i) => !i.excluded);
  const blocking = included.filter(
    (i) =>
      (i.validationErrors && i.validationErrors.length > 0) ||
      (i.machtigingFlag?.triggered && !i.machtigingFlag.resolution)
  );
  if (blocking.length > 0) {
    return { ok: false, error: `blocked:${blocking.length}` };
  }
  if (included.length === 0) return { ok: false, error: "empty_batch" };

  await db
    .update(paymentBatches)
    .set({ status: "approved", approvedBy: actor.id, approvedAt: new Date() })
    .where(eq(paymentBatches.id, batchId));

  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "approve",
    entityType: "payment_batch",
    entityId: batchId,
    approvalId: batchId,
    versionBefore: { status: "draft" },
    versionAfter: {
      status: "approved",
      items: included.length,
      excludedItems: batch.items.length - included.length,
      totalCents: included.reduce((s, i) => s + i.amountCents, 0),
      acknowledged: true,
    },
    reason:
      "payment batch approved for export — acknowledgment recorded; batch locked",
  });

  revalidatePath("/payments");
  revalidatePath(`/payments/${batchId}`);
  await refreshSignalsSafe();
  return { ok: true };
}

export async function removePaymentItem(itemId: string): Promise<void> {
  const actor = await currentActor();
  // Same privilege as excluding: it changes the payable set.
  if (!canPerform(actor, "batch_item_exclude").allowed) return;
  const db = getDb();
  const item = await db.query.paymentItems.findFirst({
    where: eq(paymentItems.id, itemId),
  });
  if (!item) return;
  const batch = await db.query.paymentBatches.findFirst({
    where: eq(paymentBatches.id, item.batchId),
  });
  if (!batch || batch.status !== "draft") return; // approved batches are immutable
  await db.delete(paymentItems).where(eq(paymentItems.id, itemId));
  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "delete",
    entityType: "payment_item",
    entityId: itemId,
    versionBefore: {
      creditor: item.creditorName,
      amountCents: item.amountCents,
    },
    reason: "item removed from draft batch",
  });
  revalidatePath(`/payments/${item.batchId}`);
  revalidatePath("/payments");
}

/**
 * Soft-exclude / re-include an item ("held for court authorisation" in the
 * deliberate-approve flow). Only while the batch is a draft; audited with
 * the fixed reason (Temujin guardrail 3). Excluded items are skipped by
 * approval gates and by the pain.001 export.
 */
export async function setItemExcluded(
  itemId: string,
  excluded: boolean
): Promise<{ ok: boolean; error?: string }> {
  const actor = await currentActor();
  // Changing the payable set is a bewindvoerder act (plan os-v1 W0).
  const verdict = canPerform(actor, "batch_item_exclude");
  if (!verdict.allowed) return { ok: false, error: verdict.reason };
  const db = getDb();
  const item = await db.query.paymentItems.findFirst({
    where: eq(paymentItems.id, itemId),
  });
  if (!item) return { ok: false, error: "not_found" };
  const batch = await db.query.paymentBatches.findFirst({
    where: eq(paymentBatches.id, item.batchId),
  });
  // Locked after approval (Temujin guardrail 2)
  if (!batch || batch.status !== "draft") return { ok: false, error: "locked" };
  if (item.excluded === excluded) return { ok: true };

  await db
    .update(paymentItems)
    .set({ excluded })
    .where(eq(paymentItems.id, itemId));

  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "update",
    entityType: "payment_item",
    entityId: itemId,
    versionBefore: { excluded: item.excluded },
    versionAfter: { excluded },
    reason: excluded
      ? "excluded from batch — held for court authorisation (machtiging)"
      : "re-included in batch (exclusion undone)",
  });

  revalidatePath(`/payments/${item.batchId}`);
  revalidatePath("/payments");
  await refreshSignalsSafe();
  return { ok: true };
}
