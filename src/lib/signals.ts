import "server-only";
import { and, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  budgetLines,
  documents,
  dossiers,
  paymentBatches,
  signals,
  tasks,
  transactions,
} from "@/lib/db/schema";
import {
  DETECTOR_VERSION,
  reconcileSignals,
  runDetectors,
  type Snapshot,
} from "@/lib/domain/signals";

/**
 * Snapshot builder + refresh (plan os-v1 W1). refreshSignals() runs after
 * state-changing events (imports, uploads, task/batch/budget mutations)
 * and from the explicit refresh action on Today — NEVER during render.
 * Detectors and reconciliation are pure; this module only feeds and
 * persists them.
 */

async function buildSnapshot(): Promise<Snapshot> {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const [
    dossierRows,
    accountRows,
    balanceRows,
    lineRows,
    creditRows,
    debitRows,
    uncatRows,
    docRows,
    draftBatchRow,
    taskRows,
  ] = await Promise.all([
    db.query.dossiers.findMany({ where: eq(dossiers.status, "actief") }),
    db.query.accounts.findMany(),
    db
      .select({
        accountId: transactions.accountId,
        total: sql<number>`coalesce(sum(${transactions.amountCents}),0)`,
      })
      .from(transactions)
      .groupBy(transactions.accountId),
    db.query.budgetLines.findMany({ where: eq(budgetLines.active, true) }),
    db
      .select({
        dossierId: transactions.dossierId,
        amountCents: transactions.amountCents,
        counterpartyIban: transactions.counterpartyIban,
        categoryKey: transactions.categoryKey,
      })
      .from(transactions)
      .where(
        and(
          gte(transactions.bookingDate, monthStart),
          gte(transactions.amountCents, 1)
        )
      ),
    db.query.transactions.findMany({
      where: and(
        gte(transactions.bookingDate, thirtyDaysAgo),
        lte(transactions.amountCents, -25_000)
      ),
    }),
    db
      .select({
        dossierId: transactions.dossierId,
        n: sql<number>`count(*)`,
      })
      .from(transactions)
      .where(isNull(transactions.categoryKey))
      .groupBy(transactions.dossierId),
    db.query.documents.findMany({ where: eq(documents.status, "new") }),
    db.query.paymentBatches.findFirst({
      where: eq(paymentBatches.status, "draft"),
      with: { items: true },
    }),
    db.query.tasks.findMany({
      where: inArray(tasks.status, ["open", "prepared"]),
    }),
  ]);

  const activeDossierIds = new Set(dossierRows.map((d) => d.id));
  const balances = new Map(
    balanceRows.map((b) => [b.accountId, Number(b.total)])
  );

  return {
    today,
    dossiers: dossierRows.map((d) => ({
      id: d.id,
      name: `${d.firstName} ${d.lastName}`,
      leefgeldAmountCents: d.leefgeldAmountCents,
      rvScheduleMonth: d.rvScheduleMonth,
      rvScheduleConfirmed: d.rvScheduleConfirmed,
    })),
    accounts: accountRows
      .filter((a) => activeDossierIds.has(a.dossierId))
      .map((a) => ({
        id: a.id,
        dossierId: a.dossierId,
        type: a.type,
        iban: a.iban,
        balanceCents: a.openingBalanceCents + (balances.get(a.id) ?? 0),
      })),
    budgetLines: lineRows
      .filter((l) => activeDossierIds.has(l.dossierId))
      .map((l) => ({
        id: l.id,
        dossierId: l.dossierId,
        kind: l.kind,
        name: l.name,
        active: l.active,
        frequency: l.frequency,
        expectedDay: l.expectedDay,
        amountCents: l.amountCents,
        counterpartyIban: l.counterpartyIban,
        categoryKey: l.categoryKey,
      })),
    monthCredits: creditRows.filter((c) => activeDossierIds.has(c.dossierId)),
    recentLargeDebits: debitRows
      .filter((t) => activeDossierIds.has(t.dossierId))
      .map((t) => ({
        id: t.id,
        dossierId: t.dossierId,
        accountId: t.accountId,
        bookingDate: t.bookingDate,
        amountCents: t.amountCents,
        counterpartyIban: t.counterpartyIban,
        counterpartyName: t.counterpartyName,
        categoryKey: t.categoryKey,
        reviewed: t.reviewed,
      })),
    uncategorizedByDossier: Object.fromEntries(
      uncatRows
        .filter((u) => activeDossierIds.has(u.dossierId))
        .map((u) => [u.dossierId, Number(u.n)])
    ),
    newDocuments: docRows.map((d) => ({
      id: d.id,
      dossierId: d.dossierId,
      filename: d.filename,
    })),
    draftBatch: draftBatchRow
      ? {
          id: draftBatchRow.id,
          createdAtIso: draftBatchRow.createdAt.toISOString(),
          items: draftBatchRow.items.map((i) => ({
            id: i.id,
            dossierId: i.dossierId,
            creditorName: i.creditorName,
            machtigingTriggered: i.machtigingFlag?.triggered ?? false,
            machtigingResolved: !!i.machtigingFlag?.resolution,
            excluded: i.excluded,
          })),
        }
      : null,
    openTasks: taskRows.map((t) => ({
      id: t.id,
      dossierId: t.dossierId,
      titleKey: t.titleKey,
      kind: t.kind,
      dueDate: t.dueDate,
      deadlineConfirmed: t.deadlineConfirmed,
    })),
  };
}

/** Recompute all signals and reconcile the persisted lifecycle. Safe to
 *  run concurrently (dedupeKey unique + last-write-wins on refresh). */
export async function refreshSignals(): Promise<{
  open: number;
  resolved: number;
}> {
  const db = getDb();
  const snapshot = await buildSnapshot();
  const present = runDetectors(snapshot);
  const existingRows = await db
    .select({
      dedupeKey: signals.dedupeKey,
      status: signals.status,
      severity: signals.severity,
      payload: signals.payload,
    })
    .from(signals);
  const plan = reconcileSignals(
    existingRows.map((e) => ({
      dedupeKey: e.dedupeKey,
      status: e.status,
      severity: e.severity,
      payloadJson: JSON.stringify(e.payload ?? {}),
    })),
    present
  );
  const now = new Date();

  if (plan.insert.length > 0) {
    await db
      .insert(signals)
      .values(
        plan.insert.map((p) => ({
          detectorKey: p.detectorKey,
          detectorVersion: DETECTOR_VERSION,
          dedupeKey: p.dedupeKey,
          dossierId: p.dossierId,
          entityType: p.entityType,
          entityId: p.entityId,
          severity: p.severity,
          status: "open" as const,
          payload: p.payload,
          computedAt: now,
          firstSeenAt: now,
          lastSeenAt: now,
        }))
      )
      .onConflictDoNothing({ target: signals.dedupeKey });
  }
  for (const p of plan.refresh) {
    await db
      .update(signals)
      .set({
        severity: p.severity,
        payload: p.payload,
        detectorVersion: DETECTOR_VERSION,
        computedAt: now,
        lastSeenAt: now,
      })
      .where(eq(signals.dedupeKey, p.dedupeKey));
  }
  for (const p of plan.reopen) {
    // A reopened signal is a NEW occurrence of the condition; the old
    // dismissal does not carry over.
    await db
      .update(signals)
      .set({
        severity: p.severity,
        payload: p.payload,
        detectorVersion: DETECTOR_VERSION,
        computedAt: now,
        lastSeenAt: now,
        firstSeenAt: now,
        status: "open",
        resolvedAt: null,
        dismissedBy: null,
        dismissedReason: null,
        dismissedAt: null,
      })
      .where(eq(signals.dedupeKey, p.dedupeKey));
  }
  // Unchanged rows get ONE batched freshness touch, not a write per row.
  const touchKeys = [...plan.touchOpen, ...plan.touchDismissed];
  if (touchKeys.length > 0) {
    await db
      .update(signals)
      .set({ computedAt: now, lastSeenAt: now })
      .where(inArray(signals.dedupeKey, touchKeys));
  }
  if (plan.resolve.length > 0) {
    await db
      .update(signals)
      .set({ status: "resolved", resolvedAt: now, computedAt: now })
      .where(
        and(
          inArray(signals.dedupeKey, plan.resolve),
          ne(signals.status, "resolved")
        )
      );
  }
  return {
    open:
      plan.insert.length +
      plan.refresh.length +
      plan.touchOpen.length +
      plan.reopen.length,
    resolved: plan.resolve.length,
  };
}

/** Fire-and-forget wrapper for event hooks: a signals failure must never
 *  break the user's actual action. */
export async function refreshSignalsSafe(): Promise<void> {
  try {
    await refreshSignals();
  } catch (e) {
    console.error("signals refresh failed:", e);
  }
}

export async function listOpenSignals() {
  const db = getDb();
  return db.query.signals.findMany({
    where: eq(signals.status, "open"),
    with: { dossier: true },
    orderBy: [desc(signals.lastSeenAt)],
  });
}

export async function latestComputedAt(): Promise<Date | null> {
  const db = getDb();
  const [row] = await db
    .select({ m: sql<string | null>`max(${signals.computedAt})` })
    .from(signals);
  return row?.m ? new Date(row.m) : null;
}
