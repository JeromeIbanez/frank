import { and, desc, eq, inArray, lte, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  accounts,
  auditEvents,
  budgetLines,
  documents,
  dossiers,
  letters,
  paymentBatches,
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

export async function dossierUrgency(dossierId: string): Promise<{
  overdue: number;
  unconfirmed: number;
  dueSoon: number;
}> {
  const db = getDb();
  const isoToday = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
  const open = await db.query.tasks.findMany({
    where: and(
      eq(tasks.dossierId, dossierId),
      inArray(tasks.status, ["open", "prepared", "submitted"])
    ),
    columns: { dueDate: true, deadlineConfirmed: true, kind: true },
  });
  return {
    overdue: open.filter((t) => t.dueDate && t.dueDate < isoToday).length,
    unconfirmed: open.filter((t) => t.kind === "statutory" && !t.deadlineConfirmed)
      .length,
    dueSoon: open.filter(
      (t) => t.dueDate && t.dueDate >= isoToday && t.dueDate <= soon
    ).length,
  };
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

export async function getNavCounts() {
  const db = getDb();
  const [dossierCount] = await db
    .select({ n: sql<number>`count(*)` })
    .from(dossiers)
    .where(ne(dossiers.status, "afgesloten"));
  const [openTaskCount] = await db
    .select({ n: sql<number>`count(*)` })
    .from(tasks)
    .where(inArray(tasks.status, ["open", "prepared", "submitted"]));
  const [inboxNew] = await db
    .select({ n: sql<number>`count(*)` })
    .from(documents)
    .where(eq(documents.status, "new"));
  // Obligations count too (plan os-v2 W1): the badge should mean "decisions
  // waiting on you", not "files someone uploaded".
  let openObligations = 0;
  try {
    const r = await db.execute<{ n: number }>(
      sql`SELECT COUNT(*)::int AS n FROM obligations WHERE status = 'open'`
    );
    openObligations = Number(r.rows?.[0]?.n ?? 0);
  } catch {
    // Table may not exist yet on an un-migrated environment.
  }
  let safeguarding = 0;
  try {
    const r = await db.execute<{ n: number }>(
      sql`SELECT COUNT(*)::int AS n FROM safeguarding_cases
           WHERE status IN ('open','clarifying','explained')`
    );
    safeguarding = Number(r.rows?.[0]?.n ?? 0);
  } catch {
    // Table may not exist yet on an un-migrated environment.
  }
  let processesWaiting = 0;
  try {
    const { officeProcesses } = await import("@/lib/processes");
    processesWaiting = (await officeProcesses()).summary.waitingOnYou;
  } catch {
    // Never let the badge take the shell down.
  }
  return {
    dossiers: Number(dossierCount?.n ?? 0),
    openTasks: Number(openTaskCount?.n ?? 0),
    inboxNew: Number(inboxNew?.n ?? 0) + openObligations,
    safeguarding,
    // Steps the office itself can act on. Deliberately NOT the count of
    // running processes: a badge that includes work nobody here can move is
    // a badge people learn to ignore.
    processesWaiting,
  };
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
