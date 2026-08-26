/**
 * Signal detectors — pure functions over a world snapshot (plan os-v1 W1).
 *
 * Detectors NEVER touch the database and NEVER use AI: the snapshot goes
 * in, conditions come out, and the reconcile step (also pure) decides row
 * transitions. Persisted signals are materialized pointers with a
 * lifecycle — never authoritative state (Temujin plan review round 1 #4).
 *
 * Matching is conservative by design: `income_missed` resolves only on an
 * exact counterparty-IBAN match or an amount-within-tolerance + category
 * match; anything weaker leaves the signal open. `unexpected_debit`
 * excludes transfers between a dossier's own accounts and clears only via
 * the transaction's explicit human `reviewed` state.
 */

export const DETECTOR_VERSION = "signals-v2";

export type Severity = "red" | "amber" | "info";

export type SignalCondition = {
  detectorKey: string;
  dedupeKey: string;
  severity: Severity;
  dossierId: string | null;
  entityType: string;
  entityId: string;
  payload: Record<string, string | number>;
};

export type Snapshot = {
  /** ISO date YYYY-MM-DD in the office timezone (Europe/Amsterdam) —
   *  Temujin PR-5 review #1. */
  today: string;
  /** ISO datetime of the refresh instant; elapsed-time detectors compute
   *  against THIS, never against an end-of-day approximation. */
  nowIso: string;
  dossiers: {
    id: string;
    name: string;
    leefgeldAmountCents: number | null;
    rvScheduleMonth: number | null;
    rvScheduleConfirmed: boolean;
  }[];
  accounts: {
    id: string;
    dossierId: string;
    type: "beheer" | "leefgeld" | "spaar";
    iban: string;
    balanceCents: number;
  }[];
  budgetLines: {
    id: string;
    dossierId: string;
    kind: "income" | "expense" | "reserve";
    name: string;
    active: boolean;
    frequency: string;
    expectedDay: number | null;
    amountCents: number;
    counterpartyIban: string | null;
    categoryKey: string;
  }[];
  /** Credits since the start of the PREVIOUS month (amountCents > 0) —
   *  month-end due days need last month's window (Temujin PR-5 #2). */
  recentCredits: {
    dossierId: string;
    bookingDate: string;
    amountCents: number;
    counterpartyIban: string | null;
    categoryKey: string | null;
  }[];
  /** Debits ≥ threshold of the last 30 days on beheer/leefgeld accounts. */
  recentLargeDebits: {
    id: string;
    dossierId: string;
    accountId: string;
    bookingDate: string;
    amountCents: number; // negative
    counterpartyIban: string | null;
    counterpartyName: string | null;
    categoryKey: string | null;
    reviewed: boolean;
  }[];
  /** Count of uncategorized transactions per dossier. */
  uncategorizedByDossier: Record<string, number>;
  newDocuments: { id: string; dossierId: string | null; filename: string }[];
  draftBatch: {
    id: string;
    createdAtIso: string; // ISO datetime
    items: {
      id: string;
      dossierId: string;
      creditorName: string;
      machtigingTriggered: boolean;
      machtigingResolved: boolean;
      excluded: boolean;
    }[];
  } | null;
  openTasks: {
    id: string;
    dossierId: string | null;
    titleKey: string;
    kind: string;
    dueDate: string | null;
    deadlineConfirmed: boolean;
  }[];
};

const INCOME_GRACE_DAYS = 3;
const INCOME_AMOUNT_TOLERANCE = 0.1;
const UNEXPECTED_DEBIT_MIN_CENTS = 25_000; // €250
const UNEXPECTED_DEBIT_RED_CENTS = 100_000; // €1.000
const BEHEER_FLOOR_CENTS = 5_000; // €50
const TASK_DUE_SOON_DAYS = 7;
const RV_WINDOW_DAYS = 60;
const BATCH_WAITING_HOURS = 24;
const BATCH_WAITING_RED_HOURS = 72;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Due date for a scheduled day-of-month in a given month, clamped to the
 *  month's length (day 31 → 28/29/30 in short months — Temujin PR-5 #2). */
function clampedDueDate(year: number, month1: number, day: number): string {
  const d = Math.min(day, daysInMonth(year, month1));
  return `${year}-${String(month1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** income_missed — active monthly income line whose most recent due date
 *  passed by the grace period with no conservative match among the credits
 *  of that due date's month. Month-end days are clamped, and a grace
 *  window that spills into the next month still checks the DUE month. */
export function detectIncomeMissed(s: Snapshot): SignalCondition[] {
  const out: SignalCondition[] = [];
  const year = Number(s.today.slice(0, 4));
  const month1 = Number(s.today.slice(5, 7));
  for (const line of s.budgetLines) {
    if (
      line.kind !== "income" ||
      !line.active ||
      line.frequency !== "monthly" ||
      !line.expectedDay
    )
      continue;
    // Most recent due date on or before today (current month, else previous).
    let dueYear = year;
    let dueMonth = month1;
    let due = clampedDueDate(dueYear, dueMonth, line.expectedDay);
    if (due > s.today) {
      dueMonth -= 1;
      if (dueMonth === 0) {
        dueMonth = 12;
        dueYear -= 1;
      }
      due = clampedDueDate(dueYear, dueMonth, line.expectedDay);
    }
    if (daysBetween(due, s.today) < INCOME_GRACE_DAYS) continue;
    const dueMonthKey = due.slice(0, 7);
    const monthStart = `${dueMonthKey}-01`;
    // Credit window is BOUNDED (Temujin PR-5 round-2): [due month start,
    // due date + grace]. A month-end salary landing a day or two into the
    // next month still counts as THIS month's late payment, but a credit
    // after the grace window belongs to the next expectation and must
    // never clear this one.
    const windowEnd = new Date(Date.parse(due) + INCOME_GRACE_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const credits = s.recentCredits.filter(
      (c) =>
        c.dossierId === line.dossierId &&
        c.amountCents > 0 &&
        c.bookingDate >= monthStart &&
        c.bookingDate <= windowEnd
    );
    const ibanMatch =
      line.counterpartyIban !== null &&
      credits.some((c) => c.counterpartyIban === line.counterpartyIban);
    const amountCategoryMatch = credits.some(
      (c) =>
        c.categoryKey === line.categoryKey &&
        Math.abs(c.amountCents - line.amountCents) <=
          line.amountCents * INCOME_AMOUNT_TOLERANCE
    );
    if (ibanMatch || amountCategoryMatch) continue;
    out.push({
      detectorKey: "income_missed",
      dedupeKey: `income_missed:${line.id}:${dueMonthKey}`,
      severity: "amber",
      dossierId: line.dossierId,
      entityType: "budget_line",
      entityId: line.id,
      payload: {
        line: line.name,
        dueDate: due,
        amountCents: line.amountCents,
      },
    });
  }
  return out;
}

/** leefgeld_low — leefgeld account can't cover the next scheduled transfer. */
export function detectLeefgeldLow(s: Snapshot): SignalCondition[] {
  const out: SignalCondition[] = [];
  for (const acc of s.accounts) {
    if (acc.type !== "leefgeld") continue;
    const dossier = s.dossiers.find((d) => d.id === acc.dossierId);
    if (!dossier?.leefgeldAmountCents) continue;
    if (acc.balanceCents >= dossier.leefgeldAmountCents) continue;
    out.push({
      detectorKey: "leefgeld_low",
      dedupeKey: `leefgeld_low:${acc.id}`,
      severity: acc.balanceCents < 0 ? "red" : "amber",
      dossierId: acc.dossierId,
      entityType: "account",
      entityId: acc.id,
      payload: {
        iban: acc.iban,
        balanceCents: acc.balanceCents,
        neededCents: dossier.leefgeldAmountCents,
      },
    });
  }
  return out;
}

/** balance_floor — beheer account under the operating floor. */
export function detectBalanceFloor(s: Snapshot): SignalCondition[] {
  const out: SignalCondition[] = [];
  for (const acc of s.accounts) {
    if (acc.type !== "beheer") continue;
    if (acc.balanceCents >= BEHEER_FLOOR_CENTS) continue;
    out.push({
      detectorKey: "balance_floor",
      dedupeKey: `balance_floor:${acc.id}`,
      severity: "red",
      dossierId: acc.dossierId,
      entityType: "account",
      entityId: acc.id,
      payload: { iban: acc.iban, balanceCents: acc.balanceCents },
    });
  }
  return out;
}

/** unexpected_debit — large unreviewed debit with no budget-line match and
 *  not an internal transfer between the dossier's own accounts. */
export function detectUnexpectedDebit(s: Snapshot): SignalCondition[] {
  const out: SignalCondition[] = [];
  const ownIbansByDossier = new Map<string, Set<string>>();
  for (const acc of s.accounts) {
    if (!ownIbansByDossier.has(acc.dossierId))
      ownIbansByDossier.set(acc.dossierId, new Set());
    ownIbansByDossier.get(acc.dossierId)!.add(acc.iban);
  }
  for (const tx of s.recentLargeDebits) {
    if (tx.reviewed) continue;
    if (tx.amountCents > -UNEXPECTED_DEBIT_MIN_CENTS) continue;
    if (
      tx.counterpartyIban &&
      ownIbansByDossier.get(tx.dossierId)?.has(tx.counterpartyIban)
    )
      continue; // internal transfer
    // Suppression must be conservative (Temujin PR-5 #5): exact counter-
    // party IBAN, or category PLUS amount-within-tolerance of the line.
    // Category alone never hides a large debit.
    const matchesLine = s.budgetLines.some(
      (l) =>
        l.dossierId === tx.dossierId &&
        l.active &&
        l.kind !== "income" &&
        ((l.counterpartyIban !== null &&
          l.counterpartyIban === tx.counterpartyIban) ||
          (tx.categoryKey !== null &&
            l.categoryKey === tx.categoryKey &&
            Math.abs(Math.abs(tx.amountCents) - l.amountCents) <=
              l.amountCents * INCOME_AMOUNT_TOLERANCE))
    );
    if (matchesLine) continue;
    out.push({
      detectorKey: "unexpected_debit",
      dedupeKey: `unexpected_debit:${tx.id}`,
      severity:
        tx.amountCents <= -UNEXPECTED_DEBIT_RED_CENTS ? "red" : "amber",
      dossierId: tx.dossierId,
      entityType: "transaction",
      entityId: tx.id,
      payload: {
        counterparty: tx.counterpartyName ?? tx.counterpartyIban ?? "?",
        amountCents: tx.amountCents,
        date: tx.bookingDate,
      },
    });
  }
  return out;
}

/** doc_needs_triage — one signal per un-triaged inbox document. */
export function detectDocNeedsTriage(s: Snapshot): SignalCondition[] {
  return s.newDocuments.map((doc) => ({
    detectorKey: "doc_needs_triage",
    dedupeKey: `doc_needs_triage:${doc.id}`,
    severity: "info" as Severity,
    dossierId: doc.dossierId,
    entityType: "document",
    entityId: doc.id,
    payload: { filename: doc.filename },
  }));
}

/** machtiging_open — unresolved legal-review flag in the open draft batch. */
export function detectMachtigingOpen(s: Snapshot): SignalCondition[] {
  if (!s.draftBatch) return [];
  return s.draftBatch.items
    .filter((i) => i.machtigingTriggered && !i.machtigingResolved && !i.excluded)
    .map((i) => ({
      detectorKey: "machtiging_open",
      dedupeKey: `machtiging_open:${i.id}`,
      severity: "red" as Severity,
      dossierId: i.dossierId,
      entityType: "payment_item",
      entityId: i.id,
      payload: { creditor: i.creditorName, batchId: s.draftBatch!.id },
    }));
}

/** task_deadline — open task overdue (red) or due within 7 days (amber). */
export function detectTaskDeadline(s: Snapshot): SignalCondition[] {
  const out: SignalCondition[] = [];
  for (const task of s.openTasks) {
    if (!task.dueDate) continue;
    const days = daysBetween(s.today, task.dueDate);
    if (days > TASK_DUE_SOON_DAYS) continue;
    out.push({
      detectorKey: "task_deadline",
      dedupeKey: `task_deadline:${task.id}`,
      severity: days < 0 ? "red" : "amber",
      dossierId: task.dossierId,
      entityType: "task",
      entityId: task.id,
      payload: { titleKey: task.titleKey, dueDate: task.dueDate, days },
    });
  }
  return out;
}

/** deadline_unconfirmed — statutory task whose computed deadline was never
 *  human-confirmed (provenance invariant). */
export function detectDeadlineUnconfirmed(s: Snapshot): SignalCondition[] {
  return s.openTasks
    .filter((t) => t.kind === "statutory" && !t.deadlineConfirmed)
    .map((t) => ({
      detectorKey: "deadline_unconfirmed",
      dedupeKey: `deadline_unconfirmed:${t.id}`,
      severity: "amber" as Severity,
      dossierId: t.dossierId,
      entityType: "task",
      entityId: t.id,
      payload: { titleKey: t.titleKey, dueDate: t.dueDate ?? "?" },
    }));
}

/** rv_window — the confirmed R&V DUE month (per the court instruction —
 *  rvScheduleMonth is the filing due month, NOT a period end; Temujin PR-5
 *  #4) ends within 60 days. Signals the filing deadline; the reporting-
 *  period model itself is W3. */
export function detectRvWindow(s: Snapshot): SignalCondition[] {
  const out: SignalCondition[] = [];
  const year = Number(s.today.slice(0, 4));
  for (const d of s.dossiers) {
    if (!d.rvScheduleConfirmed || !d.rvScheduleMonth) continue;
    for (const y of [year, year + 1]) {
      // Filing is due within the schedule month: deadline = its last day.
      const dueIso = new Date(Date.UTC(y, d.rvScheduleMonth, 0))
        .toISOString()
        .slice(0, 10);
      const days = daysBetween(s.today, dueIso);
      if (days < 0 || days > RV_WINDOW_DAYS) continue;
      out.push({
        detectorKey: "rv_window",
        dedupeKey: `rv_window:${d.id}:${y}`,
        severity: days <= 14 ? "amber" : "info",
        dossierId: d.id,
        entityType: "dossier",
        entityId: d.id,
        payload: { dueDate: dueIso, days, year: y },
      });
      break;
    }
  }
  return out;
}

/** batch_waiting — a draft batch has been waiting for review too long.
 *  Elapsed time runs from the refresh instant (Temujin PR-5 #1). */
export function detectBatchWaiting(s: Snapshot): SignalCondition[] {
  if (!s.draftBatch) return [];
  const hours =
    (Date.parse(s.nowIso) - Date.parse(s.draftBatch.createdAtIso)) / 3_600_000;
  if (hours < BATCH_WAITING_HOURS) return [];
  return [
    {
      detectorKey: "batch_waiting",
      dedupeKey: `batch_waiting:${s.draftBatch.id}`,
      severity: hours >= BATCH_WAITING_RED_HOURS ? "amber" : "info",
      dossierId: null,
      entityType: "payment_batch",
      entityId: s.draftBatch.id,
      payload: { hours: Math.floor(hours) },
    },
  ];
}

/** uncategorized_tx — transactions still without a category, per dossier. */
export function detectUncategorized(s: Snapshot): SignalCondition[] {
  return Object.entries(s.uncategorizedByDossier)
    .filter(([, n]) => n > 0)
    .map(([dossierId, n]) => ({
      detectorKey: "uncategorized_tx",
      dedupeKey: `uncategorized_tx:${dossierId}`,
      severity: "info" as Severity,
      dossierId,
      entityType: "dossier",
      entityId: dossierId,
      payload: { count: n },
    }));
}

export function runDetectors(s: Snapshot): SignalCondition[] {
  return [
    ...detectIncomeMissed(s),
    ...detectLeefgeldLow(s),
    ...detectBalanceFloor(s),
    ...detectUnexpectedDebit(s),
    ...detectDocNeedsTriage(s),
    ...detectMachtigingOpen(s),
    ...detectTaskDeadline(s),
    ...detectDeadlineUnconfirmed(s),
    ...detectRvWindow(s),
    ...detectBatchWaiting(s),
    ...detectUncategorized(s),
  ];
}

// ---------- Lifecycle reconciliation (also pure) ----------

export type ExistingSignal = {
  dedupeKey: string;
  status: "open" | "dismissed" | "resolved";
  severity?: Severity;
  /** JSON-stringified payload for change detection */
  payloadJson?: string;
  detectorVersion?: string;
};

export type ReconcilePlan = {
  /** condition present, no row yet → insert as open */
  insert: SignalCondition[];
  /** present + open + severity/payload CHANGED → per-row update */
  refresh: SignalCondition[];
  /** present + open + unchanged → batched lastSeenAt/computedAt touch */
  touchOpen: string[]; // dedupeKeys
  /** present + dismissed → batched touch ONLY (dismissal maps to the
   *  condition instance; it does not resurface while it persists) */
  touchDismissed: string[]; // dedupeKeys
  /** present + resolved → the condition cleared earlier and RECURRED →
   *  reopen (Temujin plan review round 1 #4 reopening semantics) */
  reopen: SignalCondition[];
  /** absent + open/dismissed → resolved */
  resolve: string[]; // dedupeKeys
};

export function reconcileSignals(
  existing: ExistingSignal[],
  present: SignalCondition[],
  currentVersion: string = DETECTOR_VERSION
): ReconcilePlan {
  const byKey = new Map(existing.map((e) => [e.dedupeKey, e]));
  const presentKeys = new Set(present.map((p) => p.dedupeKey));
  const plan: ReconcilePlan = {
    insert: [],
    refresh: [],
    touchOpen: [],
    touchDismissed: [],
    reopen: [],
    resolve: [],
  };
  for (const p of present) {
    const row = byKey.get(p.dedupeKey);
    if (!row) plan.insert.push(p);
    else if (row.status === "open") {
      const changed =
        row.severity !== p.severity ||
        row.payloadJson !== JSON.stringify(p.payload) ||
        // A detector fix must re-stamp rows it produced (Temujin PR-5 #6).
        (row.detectorVersion !== undefined &&
          row.detectorVersion !== currentVersion);
      if (changed) plan.refresh.push(p);
      else plan.touchOpen.push(p.dedupeKey);
    } else if (row.status === "dismissed") plan.touchDismissed.push(p.dedupeKey);
    else plan.reopen.push(p);
  }
  for (const e of existing) {
    if (e.status !== "resolved" && !presentKeys.has(e.dedupeKey)) {
      plan.resolve.push(e.dedupeKey);
    }
  }
  return plan;
}
