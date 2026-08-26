import { describe, expect, it } from "vitest";
import {
  detectBalanceFloor,
  detectBatchWaiting,
  detectDeadlineUnconfirmed,
  detectDocNeedsTriage,
  detectIncomeMissed,
  detectLeefgeldLow,
  detectMachtigingOpen,
  detectRvWindow,
  detectTaskDeadline,
  detectUncategorized,
  detectUnexpectedDebit,
  reconcileSignals,
  type SignalCondition,
  type Snapshot,
} from "../signals";

const emptySnapshot = (today = "2026-08-26"): Snapshot => ({
  today,
  nowIso: `${today}T10:00:00Z`,
  dossiers: [],
  accounts: [],
  budgetLines: [],
  recentCredits: [],
  recentLargeDebits: [],
  uncategorizedByDossier: {},
  newDocuments: [],
  draftBatch: null,
  openTasks: [],
});

const incomeLine = (over: Partial<Snapshot["budgetLines"][number]> = {}) => ({
  id: "L1",
  dossierId: "D1",
  kind: "income" as const,
  name: "Loon",
  active: true,
  frequency: "monthly",
  expectedDay: 15,
  amountCents: 150_000,
  counterpartyIban: "NL01WERK0000000001",
  categoryKey: "inkomen_loon",
  ...over,
});

describe("income_missed (conservative matching)", () => {
  it("fires when expected day + grace passed with no credits at all", () => {
    const s = emptySnapshot("2026-08-26");
    s.budgetLines = [incomeLine()];
    const out = detectIncomeMissed(s);
    expect(out).toHaveLength(1);
    expect(out[0].dedupeKey).toBe("income_missed:L1:2026-08");
  });

  it("stays quiet inside the grace period", () => {
    const s = emptySnapshot("2026-08-16");
    s.budgetLines = [incomeLine()];
    expect(detectIncomeMissed(s)).toHaveLength(0);
  });

  it("exact IBAN match resolves regardless of amount", () => {
    const s = emptySnapshot("2026-08-26");
    s.budgetLines = [incomeLine()];
    s.recentCredits = [
      {
        dossierId: "D1",
        bookingDate: "2026-08-15",
        amountCents: 12_345, // wildly different amount — IBAN wins
        counterpartyIban: "NL01WERK0000000001",
        categoryKey: null,
      },
    ];
    expect(detectIncomeMissed(s)).toHaveLength(0);
  });

  it("amount within tolerance + same category resolves", () => {
    const s = emptySnapshot("2026-08-26");
    s.budgetLines = [incomeLine()];
    s.recentCredits = [
      {
        dossierId: "D1",
        bookingDate: "2026-08-15",
        amountCents: 145_000, // within 10%
        counterpartyIban: "NL99ANDERS0000000001",
        categoryKey: "inkomen_loon",
      },
    ];
    expect(detectIncomeMissed(s)).toHaveLength(0);
  });

  it("weak match (amount only, wrong category) does NOT resolve", () => {
    const s = emptySnapshot("2026-08-26");
    s.budgetLines = [incomeLine()];
    s.recentCredits = [
      {
        dossierId: "D1",
        bookingDate: "2026-08-15",
        amountCents: 150_000,
        counterpartyIban: "NL99ANDERS0000000001",
        categoryKey: "toeslag_zorg",
      },
    ];
    expect(detectIncomeMissed(s)).toHaveLength(1);
  });

  it("weak match (category only, amount off) does NOT resolve", () => {
    const s = emptySnapshot("2026-08-26");
    s.budgetLines = [incomeLine()];
    s.recentCredits = [
      {
        dossierId: "D1",
        bookingDate: "2026-08-15",
        amountCents: 50_000, // way outside tolerance
        counterpartyIban: null,
        categoryKey: "inkomen_loon",
      },
    ];
    expect(detectIncomeMissed(s)).toHaveLength(1);
  });

  it("clamps day 31 in a 30-day month (due 30-09, fires 03-10 with the SEPTEMBER dedupe month)", () => {
    const s = emptySnapshot("2026-10-03");
    s.budgetLines = [incomeLine({ expectedDay: 31 })];
    const out = detectIncomeMissed(s);
    expect(out).toHaveLength(1);
    expect(out[0].dedupeKey).toBe("income_missed:L1:2026-09");
    expect(out[0].payload.dueDate).toBe("2026-09-30");
  });

  it("clamps day 31 in February (due 28-02, fires 03-03)", () => {
    const s = emptySnapshot("2026-03-03");
    s.budgetLines = [incomeLine({ expectedDay: 31 })];
    const out = detectIncomeMissed(s);
    expect(out).toHaveLength(1);
    expect(out[0].payload.dueDate).toBe("2026-02-28");
  });

  it("grace spill into the next month still matches the DUE month's credits", () => {
    const s = emptySnapshot("2026-10-02"); // due 30-09, grace not yet passed (2 < 3)
    s.budgetLines = [incomeLine({ expectedDay: 30 })];
    expect(detectIncomeMissed(s)).toHaveLength(0);
    const s2 = emptySnapshot("2026-10-03"); // grace passed; credit on 30-09 resolves
    s2.budgetLines = [incomeLine({ expectedDay: 30 })];
    s2.recentCredits = [
      { dossierId: "D1", bookingDate: "2026-09-30", amountCents: 150_000, counterpartyIban: "NL01WERK0000000001", categoryKey: null },
    ];
    expect(detectIncomeMissed(s2)).toHaveLength(0);
  });

  it("mid-month check looks at the PREVIOUS month's due date, not a future one", () => {
    const s = emptySnapshot("2026-08-10"); // day 15 not reached; July due 15-07 unmatched
    s.budgetLines = [incomeLine()];
    const out = detectIncomeMissed(s);
    expect(out).toHaveLength(1);
    expect(out[0].dedupeKey).toBe("income_missed:L1:2026-07");
  });
});

describe("leefgeld_low / balance_floor", () => {
  it("flags a leefgeld account below the next transfer, red when negative", () => {
    const s = emptySnapshot();
    s.dossiers = [
      { id: "D1", name: "X", leefgeldAmountCents: 7_500, rvScheduleMonth: null, rvScheduleConfirmed: false },
    ];
    s.accounts = [
      { id: "A1", dossierId: "D1", type: "leefgeld", iban: "NL01", balanceCents: 5_000 },
      { id: "A2", dossierId: "D1", type: "leefgeld", iban: "NL02", balanceCents: -100 },
      { id: "A3", dossierId: "D1", type: "leefgeld", iban: "NL03", balanceCents: 10_000 },
    ];
    const out = detectLeefgeldLow(s);
    expect(out.map((o) => [o.entityId, o.severity])).toEqual([
      ["A1", "amber"],
      ["A2", "red"],
    ]);
  });

  it("flags a beheer account under the floor", () => {
    const s = emptySnapshot();
    s.accounts = [
      { id: "A1", dossierId: "D1", type: "beheer", iban: "NL01", balanceCents: 4_999 },
      { id: "A2", dossierId: "D1", type: "beheer", iban: "NL02", balanceCents: 5_000 },
    ];
    const out = detectBalanceFloor(s);
    expect(out).toHaveLength(1);
    expect(out[0].entityId).toBe("A1");
  });
});

describe("unexpected_debit", () => {
  const debit = (over: Partial<Snapshot["recentLargeDebits"][number]> = {}) => ({
    id: "T1",
    dossierId: "D1",
    accountId: "A1",
    bookingDate: "2026-08-20",
    amountCents: -60_000,
    counterpartyIban: "NL55VREEMD0000000001",
    counterpartyName: "Onbekend BV",
    categoryKey: null,
    reviewed: false,
    ...over,
  });

  it("fires for a large unmatched debit; red at €1.000+", () => {
    const s = emptySnapshot();
    s.recentLargeDebits = [debit(), debit({ id: "T2", amountCents: -120_000 })];
    const out = detectUnexpectedDebit(s);
    expect(out.map((o) => [o.entityId, o.severity])).toEqual([
      ["T1", "amber"],
      ["T2", "red"],
    ]);
  });

  it("excludes internal transfers between the dossier's own accounts", () => {
    const s = emptySnapshot();
    s.accounts = [
      { id: "A1", dossierId: "D1", type: "beheer", iban: "NL01EIGEN", balanceCents: 0 },
      { id: "A2", dossierId: "D1", type: "leefgeld", iban: "NL02EIGEN", balanceCents: 0 },
    ];
    s.recentLargeDebits = [debit({ counterpartyIban: "NL02EIGEN" })];
    expect(detectUnexpectedDebit(s)).toHaveLength(0);
  });

  it("clears only via the explicit reviewed state", () => {
    const s = emptySnapshot();
    s.recentLargeDebits = [debit({ reviewed: true })];
    expect(detectUnexpectedDebit(s)).toHaveLength(0);
  });

  it("suppressed on exact counterparty-IBAN match with a budget line", () => {
    const s = emptySnapshot();
    s.budgetLines = [
      incomeLine({
        id: "L9",
        kind: "expense",
        counterpartyIban: "NL55VREEMD0000000001",
        categoryKey: "wonen_huur",
      }),
    ];
    s.recentLargeDebits = [debit()];
    expect(detectUnexpectedDebit(s)).toHaveLength(0);
  });

  it("category match ALONE does NOT suppress (Temujin PR-5 #5)", () => {
    const s = emptySnapshot();
    s.budgetLines = [
      incomeLine({
        id: "L9",
        kind: "expense",
        counterpartyIban: null,
        categoryKey: "wonen_huur",
        amountCents: 10_000, // line €100 vs debit €600 — amount way off
      }),
    ];
    s.recentLargeDebits = [debit({ categoryKey: "wonen_huur" })];
    expect(detectUnexpectedDebit(s)).toHaveLength(1);
  });

  it("category + amount-within-tolerance suppresses", () => {
    const s = emptySnapshot();
    s.budgetLines = [
      incomeLine({
        id: "L9",
        kind: "expense",
        counterpartyIban: null,
        categoryKey: "wonen_huur",
        amountCents: 60_000,
      }),
    ];
    s.recentLargeDebits = [debit({ categoryKey: "wonen_huur", amountCents: -58_000 })];
    expect(detectUnexpectedDebit(s)).toHaveLength(0);
  });
});

describe("docs, machtiging, tasks, rv, batch, uncategorized", () => {
  it("doc_needs_triage: one per new document", () => {
    const s = emptySnapshot();
    s.newDocuments = [
      { id: "DOC1", dossierId: null, filename: "brief.pdf" },
      { id: "DOC2", dossierId: "D1", filename: "loon.pdf" },
    ];
    expect(detectDocNeedsTriage(s)).toHaveLength(2);
  });

  it("machtiging_open: unresolved + not excluded only", () => {
    const s = emptySnapshot();
    s.draftBatch = {
      id: "B1",
      createdAtIso: "2026-08-26T00:00:00Z",
      items: [
        { id: "I1", dossierId: "D1", creditorName: "X", machtigingTriggered: true, machtigingResolved: false, excluded: false },
        { id: "I2", dossierId: "D1", creditorName: "Y", machtigingTriggered: true, machtigingResolved: true, excluded: false },
        { id: "I3", dossierId: "D1", creditorName: "Z", machtigingTriggered: true, machtigingResolved: false, excluded: true },
      ],
    };
    const out = detectMachtigingOpen(s);
    expect(out).toHaveLength(1);
    expect(out[0].entityId).toBe("I1");
    expect(out[0].severity).toBe("red");
  });

  it("task_deadline: overdue red, due-soon amber, far-future silent", () => {
    const s = emptySnapshot("2026-08-26");
    s.openTasks = [
      { id: "T1", dossierId: "D1", titleKey: "t1", kind: "playbook", dueDate: "2026-08-20", deadlineConfirmed: true },
      { id: "T2", dossierId: "D1", titleKey: "t2", kind: "playbook", dueDate: "2026-08-30", deadlineConfirmed: true },
      { id: "T3", dossierId: "D1", titleKey: "t3", kind: "playbook", dueDate: "2026-10-01", deadlineConfirmed: true },
    ];
    const out = detectTaskDeadline(s);
    expect(out.map((o) => [o.entityId, o.severity])).toEqual([
      ["T1", "red"],
      ["T2", "amber"],
    ]);
  });

  it("deadline_unconfirmed: statutory + unconfirmed only", () => {
    const s = emptySnapshot();
    s.openTasks = [
      { id: "T1", dossierId: "D1", titleKey: "t1", kind: "statutory", dueDate: "2026-12-01", deadlineConfirmed: false },
      { id: "T2", dossierId: "D1", titleKey: "t2", kind: "statutory", dueDate: "2026-12-01", deadlineConfirmed: true },
      { id: "T3", dossierId: "D1", titleKey: "t3", kind: "manual", dueDate: null, deadlineConfirmed: false },
    ];
    const out = detectDeadlineUnconfirmed(s);
    expect(out).toHaveLength(1);
    expect(out[0].entityId).toBe("T1");
  });

  it("rv_window: fires within 60 days of the confirmed schedule month end", () => {
    const s = emptySnapshot("2026-08-26");
    s.dossiers = [
      { id: "D1", name: "A", leefgeldAmountCents: null, rvScheduleMonth: 9, rvScheduleConfirmed: true },
      { id: "D2", name: "B", leefgeldAmountCents: null, rvScheduleMonth: 12, rvScheduleConfirmed: true },
      { id: "D3", name: "C", leefgeldAmountCents: null, rvScheduleMonth: 9, rvScheduleConfirmed: false },
    ];
    const out = detectRvWindow(s);
    expect(out).toHaveLength(1);
    expect(out[0].dedupeKey).toBe("rv_window:D1:2026");
    expect(out[0].payload.dueDate).toBe("2026-09-30");
  });

  it("batch_waiting: silent under 24h, info after, amber after 72h", () => {
    const fresh = emptySnapshot("2026-08-26");
    fresh.draftBatch = { id: "B1", createdAtIso: "2026-08-26T08:00:00Z", items: [] };
    expect(detectBatchWaiting(fresh)).toHaveLength(0);

    const day = emptySnapshot("2026-08-27");
    day.draftBatch = { id: "B1", createdAtIso: "2026-08-26T08:00:00Z", items: [] };
    expect(detectBatchWaiting(day)[0]?.severity).toBe("info");

    const old = emptySnapshot("2026-08-30");
    old.draftBatch = { id: "B1", createdAtIso: "2026-08-26T08:00:00Z", items: [] };
    expect(detectBatchWaiting(old)[0]?.severity).toBe("amber");
  });

  it("uncategorized_tx: per dossier with count", () => {
    const s = emptySnapshot();
    s.uncategorizedByDossier = { D1: 3, D2: 0 };
    const out = detectUncategorized(s);
    expect(out).toHaveLength(1);
    expect(out[0].payload.count).toBe(3);
  });
});

describe("reconcileSignals lifecycle", () => {
  const cond = (key: string): SignalCondition => ({
    detectorKey: key.split(":")[0],
    dedupeKey: key,
    severity: "amber",
    dossierId: "D1",
    entityType: "x",
    entityId: "y",
    payload: {},
  });

  it("new condition → insert", () => {
    const plan = reconcileSignals([], [cond("a:1")]);
    expect(plan.insert).toHaveLength(1);
  });

  it("present + open + unchanged → batched touch, no per-row refresh", () => {
    const plan = reconcileSignals(
      [{ dedupeKey: "a:1", status: "open", severity: "amber", payloadJson: "{}" }],
      [cond("a:1")]
    );
    expect(plan.touchOpen).toEqual(["a:1"]);
    expect(plan.refresh).toHaveLength(0);
    expect(plan.insert).toHaveLength(0);
  });

  it("present + open + stale detectorVersion → per-row refresh (Temujin PR-5 #6)", () => {
    const plan = reconcileSignals(
      [{ dedupeKey: "a:1", status: "open", severity: "amber", payloadJson: "{}", detectorVersion: "signals-v1" }],
      [cond("a:1")],
      "signals-v2"
    );
    expect(plan.refresh).toHaveLength(1);
    expect(plan.touchOpen).toHaveLength(0);
  });

  it("present + open + severity or payload changed → per-row refresh", () => {
    const bySeverity = reconcileSignals(
      [{ dedupeKey: "a:1", status: "open", severity: "info", payloadJson: "{}" }],
      [cond("a:1")]
    );
    expect(bySeverity.refresh).toHaveLength(1);
    const byPayload = reconcileSignals(
      [{ dedupeKey: "a:1", status: "open", severity: "amber", payloadJson: '{"n":1}' }],
      [cond("a:1")]
    );
    expect(byPayload.refresh).toHaveLength(1);
  });

  it("present + dismissed → stays dismissed (touch only)", () => {
    const plan = reconcileSignals(
      [{ dedupeKey: "a:1", status: "dismissed" }],
      [cond("a:1")]
    );
    expect(plan.touchDismissed).toEqual(["a:1"]);
    expect(plan.reopen).toHaveLength(0);
  });

  it("present + resolved → REOPEN (cleared then recurred)", () => {
    const plan = reconcileSignals(
      [{ dedupeKey: "a:1", status: "resolved" }],
      [cond("a:1")]
    );
    expect(plan.reopen).toHaveLength(1);
  });

  it("absent + open/dismissed → resolve; absent + resolved untouched", () => {
    const plan = reconcileSignals(
      [
        { dedupeKey: "a:1", status: "open" },
        { dedupeKey: "a:2", status: "dismissed" },
        { dedupeKey: "a:3", status: "resolved" },
      ],
      []
    );
    expect(plan.resolve.sort()).toEqual(["a:1", "a:2"]);
  });

  it("full dismissal round-trip: dismissed → condition clears (resolve) → recurs (reopen)", () => {
    // dismissed while present: stays dismissed
    let plan = reconcileSignals([{ dedupeKey: "a:1", status: "dismissed" }], [cond("a:1")]);
    expect(plan.touchDismissed).toHaveLength(1);
    // condition clears: resolved
    plan = reconcileSignals([{ dedupeKey: "a:1", status: "dismissed" }], []);
    expect(plan.resolve).toEqual(["a:1"]);
    // condition recurs: reopens as a fresh occurrence
    plan = reconcileSignals([{ dedupeKey: "a:1", status: "resolved" }], [cond("a:1")]);
    expect(plan.reopen).toHaveLength(1);
  });
});
