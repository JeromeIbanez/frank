import { and, eq, gte, inArray, lte, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { debtEvents, documents, rvPeriods, transactions } from "@/lib/db/schema";
import { getDossier } from "@/lib/queries";
import { CATEGORIES } from "@/lib/domain/categories";
import { MACHTIGING_THRESHOLD_CENTS } from "@/lib/domain/machtiging";
import { reconcileRv, type RvReconciliation } from "@/lib/domain/rvmath";
import { schuldenverloop } from "@/lib/domain/debts";

/**
 * R&V review pack (PRD M5): a worksheet computed BY CODE from the ledger —
 * the rechtspraak model line items — plus validations and an attachment
 * checklist. This is a werkdocument for completion in Mijn CBM, explicitly
 * NOT a court-submittable filing (Temujin #3).
 */
export type RvPack = {
  year: number;
  periodStart: string;
  periodEnd: string;
  accounts: {
    iban: string;
    type: string;
    openingCents: number;
    closingCents: number;
    leefgeldOnly: boolean;
  }[];
  incomeByCategory: { key: string; nl: string; en: string; cents: number }[];
  expenseByCategory: { key: string; nl: string; en: string; cents: number }[];
  totalIncomeCents: number;
  totalExpenseCents: number;
  validations: { key: string; level: "error" | "warning"; detail?: string }[];
  reconciliation: RvReconciliation;
  attachments: { key: string; done: boolean }[];
  largeExpenses: {
    date: string;
    counterparty: string | null;
    cents: number;
  }[];
  /** Court-recorded period + bespreking facts (official LOV R&V form) —
   *  null when no rv_periods row is recorded for this year. */
  courtPeriod: {
    besprekingDate: string | null;
    besprekingOutcome: string | null;
    signedStatus: string;
    note: string | null;
  } | null;
  /** Schuldenverloop per debt from provenance-bearing debt events. */
  schuldenverloop: {
    creditor: string;
    reference: string | null;
    status: string;
    beginCents: number;
    paidCents: number;
    otherDeltaCents: number;
    endCents: number;
    hasHistory: boolean;
  }[];
};

export async function buildRvPack(
  dossierId: string,
  year: number
): Promise<RvPack | null> {
  const db = getDb();
  const dossier = await getDossier(dossierId);
  if (!dossier) return null;

  // Court-recorded reporting period for this year (plan os-v1 W3): the
  // rechtbank sets the period; Frank records it in rv_periods and NEVER
  // infers it. Without a recorded row we fall back to the calendar year
  // and flag it — a werkdocument may estimate, a filing may not.
  const recorded = await db.query.rvPeriods.findFirst({
    where: and(
      eq(rvPeriods.dossierId, dossierId),
      sql`extract(year from ${rvPeriods.periodEnd}) = ${year}`
    ),
  });
  const periodStart = recorded?.periodStart ?? `${year}-01-01`;
  const periodEnd = recorded?.periodEnd ?? `${year}-12-31`;

  const accounts = [] as RvPack["accounts"];
  for (const acc of dossier.accounts) {
    const before = await db
      .select({ amountCents: transactions.amountCents })
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, acc.id),
          lt(transactions.bookingDate, periodStart)
        )
      );
    const during = await db
      .select({ amountCents: transactions.amountCents })
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, acc.id),
          gte(transactions.bookingDate, periodStart),
          lte(transactions.bookingDate, periodEnd)
        )
      );
    const openingCents =
      acc.openingBalanceCents + before.reduce((s, t) => s + t.amountCents, 0);
    const closingCents =
      openingCents + during.reduce((s, t) => s + t.amountCents, 0);
    accounts.push({
      iban: acc.iban,
      type: acc.type,
      openingCents,
      closingCents,
      // LOVT B.B11: leefgeldrekening only needs opening/closing balance
      leefgeldOnly: acc.type === "leefgeld",
    });
  }

  // Category totals over beheer/spaar accounts only (leefgeld excluded)
  const relevantAccountIds = dossier.accounts
    .filter((a) => a.type !== "leefgeld")
    .map((a) => a.id);
  const rows = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.dossierId, dossierId),
        gte(transactions.bookingDate, periodStart),
        lte(transactions.bookingDate, periodEnd)
      )
    );
  const relevant = rows.filter((r) => relevantAccountIds.includes(r.accountId));

  const catTotals = new Map<string, number>();
  let uncategorized = 0;
  let uncategorizedNetCents = 0;
  for (const r of relevant) {
    if (!r.categoryKey) {
      uncategorized++;
      uncategorizedNetCents += r.amountCents;
      continue;
    }
    catTotals.set(r.categoryKey, (catTotals.get(r.categoryKey) ?? 0) + r.amountCents);
  }

  const incomeByCategory: RvPack["incomeByCategory"] = [];
  const expenseByCategory: RvPack["expenseByCategory"] = [];
  for (const cat of CATEGORIES) {
    const cents = catTotals.get(cat.key) ?? 0;
    if (cents === 0) continue;
    const entry = { key: cat.key, nl: cat.nl, en: cat.en, cents };
    if (cents > 0) incomeByCategory.push(entry);
    else expenseByCategory.push({ ...entry, cents: Math.abs(cents) });
  }
  const totalIncomeCents = incomeByCategory.reduce((s, c) => s + c.cents, 0);
  const totalExpenseCents = expenseByCategory.reduce((s, c) => s + c.cents, 0);

  const largeExpenses = relevant
    .filter((r) => r.amountCents <= -MACHTIGING_THRESHOLD_CENTS)
    .map((r) => ({
      date: r.bookingDate,
      counterparty: r.counterpartyName,
      cents: Math.abs(r.amountCents),
    }));

  // Reconciliation over non-leefgeld accounts (Temujin finding 6)
  const reconciliation = reconcileRv({
    accountMovements: accounts
      .filter((a) => !a.leefgeldOnly)
      .map((a) => ({ openingCents: a.openingCents, closingCents: a.closingCents })),
    totalIncomeCents,
    totalExpenseCents,
    uncategorizedNetCents,
  });

  const validations: RvPack["validations"] = [];
  if (!reconciliation.reconciles) {
    validations.push({
      key: "reconciliation",
      level: "error",
      detail: (reconciliation.deltaCents / 100).toFixed(2),
    });
  }
  if (!dossier.rvScheduleConfirmed) {
    validations.push({ key: "rvScheduleMissing", level: "error" });
  }
  if (uncategorized > 0) {
    validations.push({
      key: "uncategorized",
      level: "error",
      detail: String(uncategorized),
    });
  }
  if (largeExpenses.length > 0) {
    validations.push({
      key: "largeExpenses",
      level: "warning",
      detail: String(largeExpenses.length),
    });
  }
  if (relevant.length === 0) {
    validations.push({ key: "noTransactions", level: "warning" });
  }

  if (!recorded) {
    validations.push({ key: "periodNotCourtRecorded", level: "warning" });
  }

  // Schuldenverloop from provenance-bearing debt events (never from the
  // pain.001 export). Debts without event history are flagged.
  const debtIds = dossier.debts.map((d) => d.id);
  const eventRows = debtIds.length
    ? await db.query.debtEvents.findMany({
        where: inArray(debtEvents.debtId, debtIds),
      })
    : [];
  const verloop: RvPack["schuldenverloop"] = dossier.debts.map((d) => {
    const v = schuldenverloop(
      d.currentAmountCents,
      eventRows
        .filter((e) => e.debtId === d.id)
        .map((e) => ({
          kind: e.kind,
          deltaCents: e.deltaCents,
          createdAtIso: e.createdAt.toISOString(),
        })),
      periodStart,
      periodEnd
    );
    return {
      creditor: d.creditor,
      reference: d.reference,
      status: d.status,
      beginCents: v.beginCents,
      paidCents: v.paidCents,
      otherDeltaCents: v.otherDeltaCents,
      endCents: v.endCents,
      hasHistory: v.hasHistory,
    };
  });
  if (verloop.some((v) => !v.hasHistory)) {
    validations.push({
      key: "debtNoHistory",
      level: "warning",
      detail: String(verloop.filter((v) => !v.hasHistory).length),
    });
  }

  // Attachment checklist bound to REAL archived documents (plan os-v1 W3):
  // a checkbox is done only when evidence exists in the dossier archive.
  const dossierDocs = await db.query.documents.findMany({
    where: eq(documents.dossierId, dossierId),
  });
  const hasClassified = (...keys: string[]) =>
    dossierDocs.some((d) => d.classification && keys.includes(d.classification));
  const attachments: RvPack["attachments"] = [
    { key: "bankStatements", done: hasClassified("bankafschrift") },
    { key: "leefgeldBalances", done: hasClassified("bankafschrift") },
    { key: "consentEvidence", done: largeExpenses.length === 0 },
    { key: "debtOverview", done: dossier.debts.length === 0 },
  ];

  return {
    year,
    periodStart,
    periodEnd,
    courtPeriod: recorded
      ? {
          besprekingDate: recorded.besprekingDate,
          besprekingOutcome: recorded.besprekingOutcome,
          signedStatus: recorded.signedStatus,
          note: recorded.note,
        }
      : null,
    schuldenverloop: verloop,
    reconciliation,
    accounts,
    incomeByCategory,
    expenseByCategory,
    totalIncomeCents,
    totalExpenseCents,
    validations,
    attachments,
    largeExpenses,
  };
}
