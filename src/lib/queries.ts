import { and, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  accounts,
  auditEvents,
  budgetLines,
  contacts,
  debts,
  documents,
  dossiers,
  letters,
  paymentBatches,
  paymentItems,
  tasks,
  transactions,
} from "@/lib/db/schema";

export type DossierRow = typeof dossiers.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type BudgetLineRow = typeof budgetLines.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;

export async function listDossiers() {
  const db = getDb();
  return db.query.dossiers.findMany({
    orderBy: [desc(dossiers.createdAt)],
    with: { accounts: true },
  });
}

export async function getDossier(id: string) {
  const db = getDb();
  return db.query.dossiers.findFirst({
    where: eq(dossiers.id, id),
    with: {
      accounts: true,
      contacts: true,
      budgetLines: true,
      debts: true,
    },
  });
}

export async function getDossierTasks(dossierId: string) {
  const db = getDb();
  return db.query.tasks.findMany({
    where: eq(tasks.dossierId, dossierId),
    orderBy: [sql`${tasks.dueDate} asc nulls last`],
    with: { events: true },
  });
}

export async function getOpenTasks() {
  const db = getDb();
  return db.query.tasks.findMany({
    where: inArray(tasks.status, ["open", "prepared", "submitted"]),
    orderBy: [sql`${tasks.dueDate} asc nulls last`],
    with: { dossier: true },
  });
}

export async function getDossierTransactions(dossierId: string, limit = 200) {
  const db = getDb();
  return db.query.transactions.findMany({
    where: eq(transactions.dossierId, dossierId),
    orderBy: [desc(transactions.bookingDate), desc(transactions.createdAt)],
    limit,
    with: { account: true },
  });
}

export async function getInboxDocuments() {
  const db = getDb();
  return db.query.documents.findMany({
    orderBy: [desc(documents.uploadedAt)],
    with: { dossier: true },
  });
}

export async function getDossierDocuments(dossierId: string) {
  const db = getDb();
  return db.query.documents.findMany({
    where: eq(documents.dossierId, dossierId),
    orderBy: [desc(documents.uploadedAt)],
  });
}

export async function getDossierLetters(dossierId: string) {
  const db = getDb();
  return db.query.letters.findMany({
    where: eq(letters.dossierId, dossierId),
    orderBy: [desc(letters.createdAt)],
  });
}

export async function getPaymentBatches() {
  const db = getDb();
  return db.query.paymentBatches.findMany({
    orderBy: [desc(paymentBatches.createdAt)],
    with: { items: { with: { dossier: true, debtorAccount: true } } },
  });
}

export async function getPaymentBatch(id: string) {
  const db = getDb();
  return db.query.paymentBatches.findFirst({
    where: eq(paymentBatches.id, id),
    with: { items: { with: { dossier: true, debtorAccount: true } } },
  });
}

export async function getAuditTrail(limit = 200) {
  const db = getDb();
  return db
    .select()
    .from(auditEvents)
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);
}

export async function getEntityAudit(entityType: string, entityId: string) {
  const db = getDb();
  return db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.entityType, entityType),
        eq(auditEvents.entityId, entityId)
      )
    )
    .orderBy(desc(auditEvents.createdAt));
}

// ---------- Exceptions (management by exception; computed on read) ----------

export type ExceptionItem = {
  kind: "missed_income" | "balance_floor" | "uncategorized" | "unconfirmed_deadline";
  dossierId: string;
  dossierName: string;
  detail: Record<string, string | number>;
};

export async function computeExceptions(): Promise<ExceptionItem[]> {
  const db = getDb();
  const out: ExceptionItem[] = [];
  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);
  const monthStart = isoToday.slice(0, 8) + "01";
  const dayOfMonth = today.getUTCDate();

  const allDossiers = await db.query.dossiers.findMany({
    where: eq(dossiers.status, "actief"),
    with: { accounts: true, budgetLines: true },
  });

  for (const d of allDossiers) {
    const name = `${d.firstName} ${d.lastName}`;

    // Missed income: monthly income line whose expected day passed >3 days ago
    // without a matching credit this month.
    const incomeLines = d.budgetLines.filter(
      (b) => b.kind === "income" && b.active && b.frequency === "monthly"
    );
    for (const line of incomeLines) {
      if (!line.expectedDay || dayOfMonth < line.expectedDay + 3) continue;
      const [match] = await db
        .select({ n: sql<number>`count(*)` })
        .from(transactions)
        .where(
          and(
            eq(transactions.dossierId, d.id),
            gte(transactions.bookingDate, monthStart),
            gte(transactions.amountCents, Math.round(line.amountCents * 0.5)),
            line.counterpartyIban
              ? eq(transactions.counterpartyIban, line.counterpartyIban)
              : sql`true`
          )
        );
      if (Number(match?.n ?? 0) === 0) {
        out.push({
          kind: "missed_income",
          dossierId: d.id,
          dossierName: name,
          detail: {
            line: line.name,
            expectedDay: line.expectedDay,
            amountCents: line.amountCents,
          },
        });
      }
    }

    // Balance floor: beheer account balance (opening + sum tx) below €50
    for (const acc of d.accounts.filter((a) => a.type === "beheer")) {
      const [s] = await db
        .select({ total: sql<number>`coalesce(sum(${transactions.amountCents}),0)` })
        .from(transactions)
        .where(eq(transactions.accountId, acc.id));
      const balance = acc.openingBalanceCents + Number(s?.total ?? 0);
      if (balance < 5000) {
        out.push({
          kind: "balance_floor",
          dossierId: d.id,
          dossierName: name,
          detail: { iban: acc.iban, balanceCents: balance },
        });
      }
    }

    // Uncategorized transactions needing review
    const [uncat] = await db
      .select({ n: sql<number>`count(*)` })
      .from(transactions)
      .where(
        and(
          eq(transactions.dossierId, d.id),
          isNull(transactions.categoryKey)
        )
      );
    if (Number(uncat?.n ?? 0) > 0) {
      out.push({
        kind: "uncategorized",
        dossierId: d.id,
        dossierName: name,
        detail: { count: Number(uncat!.n) },
      });
    }
  }

  // Unconfirmed statutory deadlines
  const unconfirmed = await db.query.tasks.findMany({
    where: and(
      eq(tasks.kind, "statutory"),
      eq(tasks.deadlineConfirmed, false),
      inArray(tasks.status, ["open", "prepared"])
    ),
    with: { dossier: true },
  });
  for (const t of unconfirmed) {
    if (!t.dossier) continue;
    out.push({
      kind: "unconfirmed_deadline",
      dossierId: t.dossier.id,
      dossierName: `${t.dossier.firstName} ${t.dossier.lastName}`,
      detail: { task: t.titleKey, dueDate: t.dueDate ?? "?" },
    });
  }

  return out;
}

export async function accountBalance(accountId: string): Promise<number> {
  const db = getDb();
  const [acc] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId));
  if (!acc) return 0;
  const [s] = await db
    .select({ total: sql<number>`coalesce(sum(${transactions.amountCents}),0)` })
    .from(transactions)
    .where(eq(transactions.accountId, accountId));
  return acc.openingBalanceCents + Number(s?.total ?? 0);
}

export async function dashboardStats() {
  const db = getDb();
  const [dossierCount] = await db
    .select({ n: sql<number>`count(*)` })
    .from(dossiers)
    .where(ne(dossiers.status, "afgesloten"));
  const [openTaskCount] = await db
    .select({ n: sql<number>`count(*)` })
    .from(tasks)
    .where(inArray(tasks.status, ["open", "prepared", "submitted"]));
  const isoToday = new Date().toISOString().slice(0, 10);
  const [overdueCount] = await db
    .select({ n: sql<number>`count(*)` })
    .from(tasks)
    .where(
      and(
        inArray(tasks.status, ["open", "prepared", "submitted"]),
        lte(tasks.dueDate, isoToday)
      )
    );
  const [newDocs] = await db
    .select({ n: sql<number>`count(*)` })
    .from(documents)
    .where(eq(documents.status, "new"));
  return {
    dossiers: Number(dossierCount?.n ?? 0),
    openTasks: Number(openTaskCount?.n ?? 0),
    overdueTasks: Number(overdueCount?.n ?? 0),
    newDocuments: Number(newDocs?.n ?? 0),
  };
}
