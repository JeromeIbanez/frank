/**
 * Safeguarding detectors — pure, no I/O (plan os-v2 W2 / PR-10).
 *
 * WHAT THIS MODULE IS FOR
 * -----------------------
 * A bewindvoerder holds a duty of care over a vulnerable adult's money.
 * Financial abuse — by third parties, by scammers, and sometimes by the
 * bewindvoerder — is the failure mode with the worst consequences and the
 * least tooling. At 40 dossiers per curator nobody can watch every account.
 *
 * WHAT IT IS NOT FOR
 * ------------------
 * It never says fraud (N4). Every output is an UNEXPLAINED PATTERN, phrased
 * as a question, addressed to a professional who can ask the client. The
 * people in these dossiers are adults with rights; the flags concern their
 * own money and sometimes their own family, and a false accusation lands on
 * a real relationship in a household that is already under strain.
 *
 * Three structural consequences of that, not just wording:
 *   1. BASELINES ARE PER-CLIENT. A client who ordinarily withdraws cash is
 *      not flagged for being themselves. Comparison is always against their
 *      own history, never against a population norm.
 *   2. A DETECTOR THAT CANNOT SEE ENOUGH HISTORY ABSTAINS. Too little data
 *      is not a licence to guess; it is a reason to say nothing.
 *   3. NO RELATIONSHIP-BASED DETECTOR EXISTS. `payment_to_related_contact`
 *      was cut in plan rev 2 (Temujin r1 #5): a family label is not
 *      suspicious evidence, and normal support between relatives is common
 *      in exactly these households. Do not reintroduce it without a
 *      provenance-bearing relationship record AND an unusual-pattern
 *      threshold — an IBAN matching a CRM label is not either of those.
 *
 * Office-scope detectors (N5) describe what was OBSERVED, never what it
 * means: `office_linked_beneficiary_outside_fee_basis`, not "self-dealing"
 * (Temujin r2 #3).
 */

export const SAFEGUARDING_VERSION = "safeguarding-v1";

export type SafeguardingScope = "client" | "office";
export type Severity = "red" | "amber" | "info";

export type SafeguardingTransaction = {
  readonly id: string;
  readonly dossierId: string;
  readonly accountId: string;
  readonly accountType: "beheer" | "leefgeld" | "spaar";
  readonly bookingDate: string; // ISO date
  /** Signed: negative is a debit. */
  readonly amountCents: number;
  readonly counterpartyName: string | null;
  readonly counterpartyIban: string | null;
  readonly description: string | null;
  readonly categoryKey: string | null;
};

export type SafeguardingCase = {
  readonly detectorKey: string;
  readonly detectorVersion: string;
  readonly scope: SafeguardingScope;
  readonly dossierId: string | null;
  /** Stable identity so the same pattern does not reopen every refresh. */
  readonly dedupeKey: string;
  readonly severity: Severity;
  /** Machine-readable; the UI renders it through i18n, never raw. */
  readonly evidence: Record<string, string | number | string[]>;
  /** Office scope only: the actor the case concerns, who may not dispose. */
  readonly concernsActorId?: string;
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS
  );
}

function isDebit(t: SafeguardingTransaction): boolean {
  return t.amountCents < 0;
}

/** Absolute value in cents. */
function abs(n: number): number {
  return Math.abs(n);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/**
 * Dutch bank descriptions for cash withdrawal. Deterministic markers, not a
 * model's opinion about what a transaction "looks like".
 */
const CASH_MARKERS = [
  "geldautomaat",
  "gea ",
  "betaalautomaat opname",
  "opname",
  "atm",
  "cash",
];

export function isCashWithdrawal(t: SafeguardingTransaction): boolean {
  if (!isDebit(t)) return false;
  const hay = `${t.description ?? ""} ${t.counterpartyName ?? ""}`.toLowerCase();
  return CASH_MARKERS.some((m) => hay.includes(m));
}

/**
 * Curated, versioned merchant list — NEVER model guesswork (plan §6).
 *
 * Deliberately short and conservative. A wrong entry here produces a flag
 * about how someone spends their own money, so the bar for inclusion is that
 * the merchant is unambiguously in the category, not that it might be.
 */
export const HIGH_RISK_MERCHANTS: readonly {
  readonly match: string;
  readonly category: "gokken" | "crypto" | "pandhuis";
}[] = [
  { match: "holland casino", category: "gokken" },
  { match: "toto", category: "gokken" },
  { match: "unibet", category: "gokken" },
  { match: "bet365", category: "gokken" },
  { match: "jack's casino", category: "gokken" },
  { match: "bitvavo", category: "crypto" },
  { match: "coinbase", category: "crypto" },
  { match: "binance", category: "crypto" },
  { match: "kraken.com", category: "crypto" },
  { match: "used products", category: "pandhuis" },
  { match: "cash converters", category: "pandhuis" },
];

export function highRiskMerchant(
  t: SafeguardingTransaction
): { match: string; category: string } | null {
  const hay = `${t.counterpartyName ?? ""} ${t.description ?? ""}`.toLowerCase();
  for (const m of HIGH_RISK_MERCHANTS) {
    if (hay.includes(m.match)) return { match: m.match, category: m.category };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Client-scope detectors
// ---------------------------------------------------------------------------

export type ClientDetectorInput = {
  readonly dossierId: string;
  readonly transactions: readonly SafeguardingTransaction[];
  /** Office-timezone evaluation date, supplied by the caller. */
  readonly today: string;
  /** How far back the "recent" window reaches. */
  readonly windowDays?: number;
  /** Known SEPA mandates on file, by creditor IBAN. */
  readonly recordedMandateIbans?: readonly string[];
  /** Creditor name expected for a given IBAN, from the dossier's debts. */
  readonly expectedCreditorByIban?: Readonly<Record<string, string>>;
};

const DEFAULT_WINDOW_DAYS = 30;
/** Below this, no client detector speaks: too little history to compare. */
const MIN_BASELINE_MONTHS = 3;
/** A spike must be this many times the client's own monthly baseline. */
const SPIKE_FACTOR = 3;
/** …and clear this floor, so small absolute sums never trigger. */
const SPIKE_FLOOR_CENTS = 30_000; // €300

/**
 * Cash out far above THIS client's own habit.
 *
 * Not "a lot of cash" — a lot of cash *for them*. Abstains entirely without
 * at least three months of history to form the baseline.
 */
export function detectCashWithdrawalSpike(
  input: ClientDetectorInput
): SafeguardingCase[] {
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS;
  const cash = input.transactions.filter(isCashWithdrawal);
  if (cash.length === 0) return [];

  const recent = cash.filter(
    (t) => daysBetween(t.bookingDate, input.today) <= windowDays
  );
  const older = cash.filter(
    (t) => daysBetween(t.bookingDate, input.today) > windowDays
  );
  if (recent.length === 0) return [];

  // Baseline: median monthly cash total over prior months.
  const byMonth = new Map<string, number>();
  for (const t of older) {
    const m = t.bookingDate.slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + abs(t.amountCents));
  }
  if (byMonth.size < MIN_BASELINE_MONTHS) return []; // abstain, do not guess

  const baseline = median([...byMonth.values()]);
  const recentTotal = recent.reduce((s, t) => s + abs(t.amountCents), 0);

  if (recentTotal < SPIKE_FLOOR_CENTS) return [];
  if (baseline > 0 && recentTotal < baseline * SPIKE_FACTOR) return [];
  if (baseline === 0 && recentTotal < SPIKE_FLOOR_CENTS) return [];

  return [
    {
      detectorKey: "cash_withdrawal_spike",
      detectorVersion: SAFEGUARDING_VERSION,
      scope: "client",
      dossierId: input.dossierId,
      dedupeKey: `cash_withdrawal_spike:${input.dossierId}:${input.today.slice(0, 7)}`,
      severity: "amber",
      evidence: {
        recentTotalCents: recentTotal,
        baselineMonthlyCents: baseline,
        windowDays,
        transactionIds: recent.map((t) => t.id),
        count: recent.length,
      },
    },
  ];
}

/**
 * Repeated withdrawals sitting just under a round threshold.
 *
 * Deliberately limited to €500 and €1000, with a tight €25 margin. An
 * earlier version included €250, which fired on ordinary €200 withdrawals —
 * one of the most common amounts a person living on leefgeld takes out, and
 * exactly the kind of false positive that turns a safeguarding tool into an
 * accusation machine. Thresholds a client plausibly hits by habit do not
 * belong here.
 */
const STRUCTURING_THRESHOLDS = [50_000, 100_000]; // €500, €1000
const STRUCTURING_MARGIN = 2_500; // within €25 under
const STRUCTURING_MIN_COUNT = 3;

export function detectStructuring(
  input: ClientDetectorInput
): SafeguardingCase[] {
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS;
  const recent = input.transactions.filter(
    (t) =>
      isCashWithdrawal(t) && daysBetween(t.bookingDate, input.today) <= windowDays
  );

  for (const threshold of STRUCTURING_THRESHOLDS) {
    const hits = recent.filter((t) => {
      const a = abs(t.amountCents);
      return a < threshold && a >= threshold - STRUCTURING_MARGIN;
    });
    if (hits.length >= STRUCTURING_MIN_COUNT) {
      return [
        {
          detectorKey: "structuring",
          detectorVersion: SAFEGUARDING_VERSION,
          scope: "client",
          dossierId: input.dossierId,
          dedupeKey: `structuring:${input.dossierId}:${threshold}:${input.today.slice(0, 7)}`,
          severity: "amber",
          evidence: {
            thresholdCents: threshold,
            count: hits.length,
            transactionIds: hits.map((t) => t.id),
          },
        },
      ];
    }
  }
  return [];
}

/** A credit followed almost immediately by a near-equal debit. */
const RAPID_WINDOW_DAYS = 2;
const RAPID_TOLERANCE = 0.05; // within 5%
const RAPID_FLOOR_CENTS = 20_000; // €200

export function detectRapidInOut(
  input: ClientDetectorInput
): SafeguardingCase[] {
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS;
  const inWindow = input.transactions.filter(
    (t) => daysBetween(t.bookingDate, input.today) <= windowDays
  );
  const credits = inWindow.filter((t) => t.amountCents >= RAPID_FLOOR_CENTS);
  const debits = inWindow.filter(
    (t) => isDebit(t) && abs(t.amountCents) >= RAPID_FLOOR_CENTS
  );

  const cases: SafeguardingCase[] = [];
  for (const c of credits) {
    for (const d of debits) {
      const gap = daysBetween(c.bookingDate, d.bookingDate);
      if (gap < 0 || gap > RAPID_WINDOW_DAYS) continue;
      const diff = abs(abs(d.amountCents) - c.amountCents);
      if (diff > c.amountCents * RAPID_TOLERANCE) continue;
      cases.push({
        detectorKey: "rapid_in_out",
        detectorVersion: SAFEGUARDING_VERSION,
        scope: "client",
        dossierId: input.dossierId,
        dedupeKey: `rapid_in_out:${c.id}:${d.id}`,
        severity: "amber",
        evidence: {
          creditCents: c.amountCents,
          debitCents: abs(d.amountCents),
          gapDays: gap,
          transactionIds: [c.id, d.id],
          counterparty: d.counterpartyName ?? "",
        },
      });
      break; // one pairing per credit
    }
  }
  return cases;
}

/** First-ever transfer to an unknown IBAN, above a floor. */
const NEW_PAYEE_FLOOR_CENTS = 50_000; // €500

export function detectNewPayeeHighValue(
  input: ClientDetectorInput
): SafeguardingCase[] {
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS;
  const seenBefore = new Set(
    input.transactions
      .filter((t) => daysBetween(t.bookingDate, input.today) > windowDays)
      .map((t) => t.counterpartyIban)
      .filter(Boolean) as string[]
  );

  return input.transactions
    .filter(
      (t) =>
        isDebit(t) &&
        daysBetween(t.bookingDate, input.today) <= windowDays &&
        abs(t.amountCents) >= NEW_PAYEE_FLOOR_CENTS &&
        t.counterpartyIban !== null &&
        !seenBefore.has(t.counterpartyIban)
    )
    .map((t) => ({
      detectorKey: "new_payee_high_value",
      detectorVersion: SAFEGUARDING_VERSION,
      scope: "client" as const,
      dossierId: input.dossierId,
      dedupeKey: `new_payee_high_value:${t.id}`,
      severity: "amber" as const,
      evidence: {
        amountCents: abs(t.amountCents),
        counterparty: t.counterpartyName ?? "",
        iban: t.counterpartyIban ?? "",
        transactionIds: [t.id],
      },
    }));
}

export function detectHighRiskMerchant(
  input: ClientDetectorInput
): SafeguardingCase[] {
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS;
  return input.transactions
    .filter(
      (t) => isDebit(t) && daysBetween(t.bookingDate, input.today) <= windowDays
    )
    .flatMap((t) => {
      const m = highRiskMerchant(t);
      if (!m) return [];
      return [
        {
          detectorKey: "high_risk_merchant",
          detectorVersion: SAFEGUARDING_VERSION,
          scope: "client" as const,
          dossierId: input.dossierId,
          dedupeKey: `high_risk_merchant:${t.id}`,
          severity: "info" as const, // a question, not an alarm
          evidence: {
            category: m.category,
            merchant: t.counterpartyName ?? m.match,
            amountCents: abs(t.amountCents),
            transactionIds: [t.id],
          },
        },
      ];
    });
}

/** Leefgeld drained almost immediately after it arrives. */
const DIVERSION_WINDOW_DAYS = 1;
const DIVERSION_SHARE = 0.8;

export function detectLeefgeldDiversion(
  input: ClientDetectorInput
): SafeguardingCase[] {
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS;
  const leefgeld = input.transactions.filter(
    (t) =>
      t.accountType === "leefgeld" &&
      daysBetween(t.bookingDate, input.today) <= windowDays
  );
  const credits = leefgeld.filter((t) => t.amountCents > 0);
  const cases: SafeguardingCase[] = [];

  for (const c of credits) {
    const outflow = leefgeld
      .filter((d) => {
        const gap = daysBetween(c.bookingDate, d.bookingDate);
        return isDebit(d) && gap >= 0 && gap <= DIVERSION_WINDOW_DAYS;
      })
      .reduce((s, d) => s + abs(d.amountCents), 0);
    if (outflow >= c.amountCents * DIVERSION_SHARE && outflow > 0) {
      cases.push({
        detectorKey: "leefgeld_diversion",
        detectorVersion: SAFEGUARDING_VERSION,
        scope: "client",
        dossierId: input.dossierId,
        dedupeKey: `leefgeld_diversion:${c.id}`,
        severity: "amber",
        evidence: {
          creditCents: c.amountCents,
          outflowCents: outflow,
          withinDays: DIVERSION_WINDOW_DAYS,
          transactionIds: [c.id],
        },
      });
    }
  }
  return cases;
}

/**
 * A direct debit with no mandate on file.
 *
 * Named for what Frank can actually know (Temujin os-v2 r1 #5): the finding
 * is "no recorded mandate", never "unauthorised". Frank's missing record
 * cannot prove no mandate exists (N4b), and the wording must not imply it.
 */
export function detectDirectDebitWithoutRecordedMandate(
  input: ClientDetectorInput
): SafeguardingCase[] {
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS;
  const known = new Set(
    (input.recordedMandateIbans ?? []).map((i) => i.replace(/\s+/g, "").toUpperCase())
  );
  if (known.size === 0) return []; // nothing recorded at all → no basis to compare

  return input.transactions
    .filter((t) => {
      if (!isDebit(t) || !t.counterpartyIban) return false;
      if (daysBetween(t.bookingDate, input.today) > windowDays) return false;
      const desc = `${t.description ?? ""}`.toLowerCase();
      if (!desc.includes("incasso") && !desc.includes("machtiging")) return false;
      return !known.has(t.counterpartyIban.replace(/\s+/g, "").toUpperCase());
    })
    .map((t) => ({
      detectorKey: "direct_debit_without_recorded_mandate",
      detectorVersion: SAFEGUARDING_VERSION,
      scope: "client" as const,
      dossierId: input.dossierId,
      dedupeKey: `direct_debit_without_recorded_mandate:${t.id}`,
      severity: "info" as const,
      evidence: {
        counterparty: t.counterpartyName ?? "",
        iban: t.counterpartyIban ?? "",
        amountCents: abs(t.amountCents),
        transactionIds: [t.id],
      },
    }));
}

/**
 * The account name on a demand does not match the creditor on file.
 *
 * NEVER described as invoice fraud (Temujin os-v2 r2 #3): legitimate
 * mismatches are common through factoring, name changes and incasso
 * intermediaries. It is a reason to verify, and nothing more.
 */
export function detectBeneficiaryNameMismatch(
  input: ClientDetectorInput
): SafeguardingCase[] {
  const expected = input.expectedCreditorByIban ?? {};
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS;

  return input.transactions
    .filter((t) => {
      if (!isDebit(t) || !t.counterpartyIban || !t.counterpartyName) return false;
      if (daysBetween(t.bookingDate, input.today) > windowDays) return false;
      const want = expected[t.counterpartyIban.replace(/\s+/g, "").toUpperCase()];
      if (!want) return false;
      const a = want.toLowerCase().replace(/[^a-z0-9]/g, "");
      const b = t.counterpartyName.toLowerCase().replace(/[^a-z0-9]/g, "");
      return a.length > 0 && b.length > 0 && !a.includes(b) && !b.includes(a);
    })
    .map((t) => ({
      detectorKey: "beneficiary_name_mismatch",
      detectorVersion: SAFEGUARDING_VERSION,
      scope: "client" as const,
      dossierId: input.dossierId,
      dedupeKey: `beneficiary_name_mismatch:${t.id}`,
      severity: "amber" as const,
      evidence: {
        onFile:
          expected[t.counterpartyIban!.replace(/\s+/g, "").toUpperCase()] ?? "",
        onTransaction: t.counterpartyName ?? "",
        iban: t.counterpartyIban ?? "",
        transactionIds: [t.id],
      },
    }));
}

export const CLIENT_DETECTORS = [
  detectCashWithdrawalSpike,
  detectStructuring,
  detectRapidInOut,
  detectNewPayeeHighValue,
  detectHighRiskMerchant,
  detectLeefgeldDiversion,
  detectDirectDebitWithoutRecordedMandate,
  detectBeneficiaryNameMismatch,
] as const;

export function runClientDetectors(
  input: ClientDetectorInput
): SafeguardingCase[] {
  return CLIENT_DETECTORS.flatMap((d) => d(input));
}

// ---------------------------------------------------------------------------
// Office-scope detectors (N5) — Frank watches its own operators
// ---------------------------------------------------------------------------

export type OfficeDetectorInput = {
  /** IBANs belonging to the office or to an office actor. */
  readonly officeLinkedIbans: readonly {
    readonly iban: string;
    readonly actorId: string | null;
    readonly label: string;
  }[];
  readonly transactions: readonly SafeguardingTransaction[];
  /** Category keys that legitimately pay the office (the fee basis). */
  readonly feeBasisCategoryKeys: readonly string[];
  readonly today: string;
  readonly windowDays?: number;
  /** Fee charged vs what the versioned schedule permits, per dossier. */
  readonly feeComparisons?: readonly {
    readonly dossierId: string;
    readonly chargedCents: number;
    readonly permittedCents: number;
    readonly year: number;
  }[];
  /** Approvals where the same actor created and approved a batch. */
  readonly sameActorApprovals?: readonly {
    readonly batchId: string;
    readonly actorId: string;
    readonly createdAuditId: string;
    readonly approvedAuditId: string;
    readonly activeBewindvoerderCount: number;
  }[];
};

/**
 * A payment to an office-linked account outside the recorded fee basis.
 *
 * Renamed from `self_dealing` (Temujin os-v2 r2 #3): that was a conclusion.
 * This describes what was observed and leaves the meaning to a human — which
 * matters more here than anywhere, because the subject is a colleague.
 */
export function detectOfficeLinkedBeneficiary(
  input: OfficeDetectorInput
): SafeguardingCase[] {
  const windowDays = input.windowDays ?? 90;
  const feeBasis = new Set(input.feeBasisCategoryKeys);
  const linked = new Map(
    input.officeLinkedIbans.map((o) => [
      o.iban.replace(/\s+/g, "").toUpperCase(),
      o,
    ])
  );

  return input.transactions
    .filter((t) => {
      if (!isDebit(t) || !t.counterpartyIban) return false;
      if (daysBetween(t.bookingDate, input.today) > windowDays) return false;
      if (t.categoryKey && feeBasis.has(t.categoryKey)) return false;
      return linked.has(t.counterpartyIban.replace(/\s+/g, "").toUpperCase());
    })
    .map((t) => {
      const o = linked.get(
        t.counterpartyIban!.replace(/\s+/g, "").toUpperCase()
      )!;
      return {
        detectorKey: "office_linked_beneficiary_outside_fee_basis",
        detectorVersion: SAFEGUARDING_VERSION,
        scope: "office" as const,
        dossierId: t.dossierId,
        dedupeKey: `office_linked_beneficiary:${t.id}`,
        severity: "red" as const,
        evidence: {
          beneficiary: o.label,
          iban: t.counterpartyIban ?? "",
          amountCents: abs(t.amountCents),
          categoryKey: t.categoryKey ?? "",
          transactionIds: [t.id],
        },
        concernsActorId: o.actorId ?? undefined,
      };
    });
}

/** Fee charged above what the versioned schedule permits. Deterministic. */
export function detectFeeAboveSchedule(
  input: OfficeDetectorInput
): SafeguardingCase[] {
  return (input.feeComparisons ?? [])
    .filter((c) => c.chargedCents > c.permittedCents)
    .map((c) => ({
      detectorKey: "fee_above_schedule",
      detectorVersion: SAFEGUARDING_VERSION,
      scope: "office" as const,
      dossierId: c.dossierId,
      dedupeKey: `fee_above_schedule:${c.dossierId}:${c.year}`,
      severity: "red" as const,
      evidence: {
        chargedCents: c.chargedCents,
        permittedCents: c.permittedCents,
        excessCents: c.chargedCents - c.permittedCents,
        year: c.year,
      },
    }));
}

/**
 * An EVIDENCED breach of the vier-ogen rule — never an "unusual pattern"
 * (Temujin os-v2 r2 #3).
 *
 * It fires only when it can point at the rule and at the two audit rows that
 * breach it: the same actor created and approved a batch while more than one
 * active bewindvoerder existed, which is exactly what `canApproveBatch`
 * forbids. With a single bewindvoerder the rule does not apply and this stays
 * silent rather than inventing a violation.
 */
export function detectFourEyesViolation(
  input: OfficeDetectorInput
): SafeguardingCase[] {
  return (input.sameActorApprovals ?? [])
    .filter((a) => a.activeBewindvoerderCount > 1)
    .map((a) => ({
      detectorKey: "four_eyes_violation",
      detectorVersion: SAFEGUARDING_VERSION,
      scope: "office" as const,
      dossierId: null,
      dedupeKey: `four_eyes_violation:${a.batchId}`,
      severity: "red" as const,
      evidence: {
        batchId: a.batchId,
        rule: "canApproveBatch: approver must differ from creator",
        auditIds: [a.createdAuditId, a.approvedAuditId],
        activeBewindvoerderCount: a.activeBewindvoerderCount,
      },
      concernsActorId: a.actorId,
    }));
}

export const OFFICE_DETECTORS = [
  detectOfficeLinkedBeneficiary,
  detectFeeAboveSchedule,
  detectFourEyesViolation,
] as const;

export function runOfficeDetectors(
  input: OfficeDetectorInput
): SafeguardingCase[] {
  return OFFICE_DETECTORS.flatMap((d) => d(input));
}

// ---------------------------------------------------------------------------
// Disposition rules
// ---------------------------------------------------------------------------

export type CaseStatus =
  | "open"
  | "clarifying"
  | "explained"
  | "resolved"
  | "escalated";

/**
 * Who may dispose of a case.
 *
 * An office-scope case is IMMUTABLE to the actor it concerns — not merely
 * non-dismissible (Temujin os-v2 r1 #6). They cannot resolve, escalate or
 * edit it, and an attempt is itself audited.
 *
 * Where no independent reviewer exists, the case stays open and visible
 * rather than quietly closable: an unresolvable open case is the honest
 * state. Jerome decided (2026-08-27) that for a solo office the standing
 * external destination is the appointing kantonrechter.
 */
export function canDisposeCase(input: {
  actorId: string;
  actorRole: "bewindvoerder" | "assistent";
  actorActive: boolean;
  scope: SafeguardingScope;
  concernsActorId?: string | null;
}):
  | { allowed: true }
  | {
      allowed: false;
      reason: "inactive_actor" | "role_required" | "concerns_self";
    } {
  if (!input.actorActive) return { allowed: false, reason: "inactive_actor" };
  if (input.actorRole !== "bewindvoerder")
    return { allowed: false, reason: "role_required" };
  if (
    input.scope === "office" &&
    input.concernsActorId &&
    input.concernsActorId === input.actorId
  ) {
    return { allowed: false, reason: "concerns_self" };
  }
  return { allowed: true };
}

/** Escalation destinations. A human picks; Frank never picks for them. */
export const ESCALATION_DESTINATIONS = [
  "kantonrechter",
  "bank",
  "veilig_thuis",
  "politie_aangifte",
  "extern_reviewer",
] as const;
export type EscalationDestination = (typeof ESCALATION_DESTINATIONS)[number];

export function isEscalationDestination(v: unknown): v is EscalationDestination {
  return (
    typeof v === "string" &&
    (ESCALATION_DESTINATIONS as readonly string[]).includes(v)
  );
}
