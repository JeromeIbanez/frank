/**
 * Buitengerechtelijke incassokosten (WIK) as a VERSIONED LEGAL DATASET
 * (plan os-v2 §5.1) — pure, no I/O.
 *
 * Modelled the same way as `fees.ts`: effective dates, a source URL, a
 * version string, and tests asserting the table against the cited source.
 * os-v1 PR-7 found real transcription errors in the fee table, so the same
 * risk is assumed here and the numbers are reviewed independently.
 *
 * Source of record: Besluit vergoeding voor buitengerechtelijke
 * incassokosten (BIK), https://wetten.overheid.nl/BWBR0031432/
 *
 * TWO SEPARATE CHECKS, NOT ONE (Temujin os-v2 r1 #3)
 * --------------------------------------------------
 * Conflating "the amount is too high" with "no valid notice was sent"
 * produces claims the data cannot support. They have different
 * preconditions, so they are different findings:
 *
 *   - `wik_amount_exceeds_cap` needs principal + charged costs + an evidenced
 *     applicability basis. It is deterministic arithmetic.
 *   - `wik_notice_missing` needs the notice content AND receipt evidence,
 *     because the 14-day period runs from RECEIPT, not dispatch. Frank not
 *     having seen a notice is not evidence that none was sent (N4b), so
 *     without delivery evidence this check abstains entirely.
 *
 * EVERY CHECK ABSTAINS BY DEFAULT. Abstention is correct behaviour, not a
 * failure: a finding is produced only when all preconditions are evidenced.
 */

export const WIK_DATASET_VERSION = "wik-2026.1";
export const WIK_SOURCE_URL = "https://wetten.overheid.nl/BWBR0031432/";
export const WIK_SOURCE_NAME =
  "Besluit vergoeding voor buitengerechtelijke incassokosten (BIK)";

/**
 * The staffel, in basis points so the arithmetic stays in integers until a
 * single final rounding step. `upToCents` is the TOP of each band; the last
 * band is unbounded.
 */
export type WikBand = {
  /** Top of this band, measured on the principal. null = unbounded. */
  readonly upToCents: number | null;
  /** Rate applied to the portion of principal falling in this band. */
  readonly basisPoints: number;
};

export type WikSchedule = {
  readonly version: string;
  readonly effectiveFrom: string;
  readonly sourceUrl: string;
  readonly sourceName: string;
  readonly bands: readonly WikBand[];
  readonly minimumCents: number;
  readonly maximumCents: number;
  /**
   * Documented rounding rule (Temujin os-v2 r1 #3). Percentages of a
   * principal rarely land on whole cents — 15% of €412,30 is €61,845 — so
   * the rule has to be stated rather than left to whichever float lands.
   */
  readonly rounding: "half_up_to_cent";
  /**
   * A finding requires the excess to clear this. A rounding difference must
   * never become an allegation against a creditor.
   */
  readonly deMinimisCents: number;
};

export const WIK_SCHEDULES: readonly WikSchedule[] = [
  {
    version: WIK_DATASET_VERSION,
    effectiveFrom: "2012-07-01", // BIK entry into force
    sourceUrl: WIK_SOURCE_URL,
    sourceName: WIK_SOURCE_NAME,
    bands: [
      { upToCents: 250_000, basisPoints: 1500 }, // 15% over the first €2.500
      { upToCents: 500_000, basisPoints: 1000 }, // 10% over the next €2.500
      { upToCents: 1_000_000, basisPoints: 500 }, //  5% over the next €5.000
      { upToCents: 20_000_000, basisPoints: 100 }, //  1% over the next €190.000
      { upToCents: null, basisPoints: 50 }, // 0,5% over the remainder
    ],
    minimumCents: 4_000, // €40 minimum
    maximumCents: 677_500, // €6.775 maximum
    rounding: "half_up_to_cent",
    deMinimisCents: 100, // €1 — comfortably above any rounding artefact
  },
];

export function wikScheduleFor(isoDate: string): WikSchedule | null {
  const applicable = WIK_SCHEDULES.filter((s) => s.effectiveFrom <= isoDate);
  if (applicable.length === 0) return null;
  return applicable.reduce((a, b) => (a.effectiveFrom > b.effectiveFrom ? a : b));
}

/** Half-up rounding on a non-negative rational, kept explicit and testable. */
function roundHalfUp(numerator: number, denominator: number): number {
  return Math.floor(numerator / denominator + 0.5);
}

/**
 * Statutory maximum collection costs for a given principal.
 *
 * Integer arithmetic throughout: each band contributes
 * `bandAmountCents * basisPoints`, summed, and divided by 10_000 exactly
 * once, so no intermediate float error can accumulate across bands.
 */
export function wikMaximumCents(
  principalCents: number,
  schedule: WikSchedule
): number {
  if (!Number.isInteger(principalCents) || principalCents <= 0) return 0;

  let remaining = principalCents;
  let previousTop = 0;
  let numerator = 0;

  for (const band of schedule.bands) {
    if (remaining <= 0) break;
    const bandWidth =
      band.upToCents === null ? remaining : band.upToCents - previousTop;
    const amountInBand = Math.min(remaining, bandWidth);
    numerator += amountInBand * band.basisPoints;
    remaining -= amountInBand;
    if (band.upToCents !== null) previousTop = band.upToCents;
  }

  const raw = roundHalfUp(numerator, 10_000);
  return Math.min(Math.max(raw, schedule.minimumCents), schedule.maximumCents);
}

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

/**
 * What the check needs before it may speak. Anything `undefined` means "not
 * evidenced", which produces abstention rather than an assumption.
 */
export type WikAmountInput = {
  principalCents?: number;
  chargedCostsCents?: number;
  /**
   * Why the BIK scale applies to this claim (Temujin PR-9 r2 #3).
   *
   * NOT called a consumer basis, because that is not what it evidences. A
   * creditor writing "conform de Wet Incassokosten" is INVOKING a regime;
   * it is not proof that the debtor acted outside a profession or business.
   * The distinction matters: the BIK fee scale governs contractual payment
   * obligations generally, while the 14-day notice requirement is the part
   * that is genuinely consumer-specific — so the two checks take different
   * evidence and `checkWikNotice` demands documented consumer status.
   */
  applicabilityBasis?: "creditor_invoked_bik" | "documented_consumer_status";
  /** Date the costs were charged, selecting the schedule version. */
  onDate: string;
};

export type WikFinding =
  | { finding: "none"; abstained: true; missing: readonly string[] }
  | {
      finding: "wik_amount_exceeds_cap";
      principalCents: number;
      chargedCostsCents: number;
      maximumCents: number;
      excessCents: number;
      datasetVersion: string;
      sourceUrl: string;
    };

export function checkWikAmount(input: WikAmountInput): WikFinding {
  const missing: string[] = [];
  if (input.principalCents === undefined || input.principalCents <= 0)
    missing.push("principal");
  if (input.chargedCostsCents === undefined || input.chargedCostsCents <= 0)
    missing.push("chargedCosts");
  if (input.applicabilityBasis === undefined) missing.push("applicabilityBasis");

  const schedule = wikScheduleFor(input.onDate);
  if (!schedule) missing.push("schedule");

  if (missing.length > 0 || !schedule) {
    return { finding: "none", abstained: true, missing };
  }

  const principalCents = input.principalCents!;
  const chargedCostsCents = input.chargedCostsCents!;
  const maximumCents = wikMaximumCents(principalCents, schedule);
  const excessCents = chargedCostsCents - maximumCents;

  // De-minimis: a cent or two of rounding disagreement is not an allegation.
  if (excessCents < schedule.deMinimisCents) {
    return { finding: "none", abstained: true, missing: [] };
  }

  return {
    finding: "wik_amount_exceeds_cap",
    principalCents,
    chargedCostsCents,
    maximumCents,
    excessCents,
    datasetVersion: schedule.version,
    sourceUrl: schedule.sourceUrl,
  };
}

/**
 * The 14-day notice check.
 *
 * Deliberately hard to satisfy. The period runs from RECEIPT, so without
 * delivery evidence there is nothing to measure — and Frank's own silence
 * proves nothing about what the creditor sent (N4b). In practice this
 * abstains on almost every inbound letter, which is the correct outcome:
 * the alternative is accusing creditors of skipping a notice we simply have
 * not seen.
 */
export type WikNoticeInput = {
  /**
   * The 14-day notice duty is genuinely consumer-specific, so unlike the fee
   * cap this check needs actual consumer status, documented — not a
   * creditor's invocation of the regime (Temujin PR-9 r2 #3).
   */
  consumerStatusEvidenced?: boolean;
  /** Evidence the 14-day notice exists and what it said. */
  noticeContentEvidenced?: boolean;
  /** Evidence of DELIVERY — the period runs from receipt, not dispatch. */
  receiptEvidencedOn?: string;
  costsChargedOn?: string;
};

export type WikNoticeFinding =
  | { finding: "none"; abstained: true; missing: readonly string[] }
  | {
      finding: "wik_notice_period_short";
      receiptDate: string;
      chargedDate: string;
      daysElapsed: number;
    };

export function checkWikNotice(input: WikNoticeInput): WikNoticeFinding {
  const missing: string[] = [];
  if (!input.consumerStatusEvidenced) missing.push("consumerStatus");
  if (!input.noticeContentEvidenced) missing.push("noticeContent");
  if (!input.receiptEvidencedOn) missing.push("receiptEvidence");
  if (!input.costsChargedOn) missing.push("costsChargedDate");
  if (missing.length > 0) {
    return { finding: "none", abstained: true, missing };
  }

  const receipt = Date.parse(input.receiptEvidencedOn! + "T00:00:00Z");
  const charged = Date.parse(input.costsChargedOn! + "T00:00:00Z");
  if (Number.isNaN(receipt) || Number.isNaN(charged)) {
    return { finding: "none", abstained: true, missing: ["unparsable_date"] };
  }

  const daysElapsed = Math.floor((charged - receipt) / 86_400_000);
  // The debtor gets a full 14 days AFTER the day of receipt.
  if (daysElapsed > 14) {
    return { finding: "none", abstained: true, missing: [] };
  }

  return {
    finding: "wik_notice_period_short",
    receiptDate: input.receiptEvidencedOn!,
    chargedDate: input.costsChargedOn!,
    daysElapsed,
  };
}
