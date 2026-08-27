/**
 * Bewindvoerdersbeloning — a VERSIONED LEGAL DATASET, not constants
 * (Temujin plan review round 1 #5).
 *
 * Every amount is transcribed from the Regeling beloning curatoren,
 * bewindvoerders en mentoren (wetten.overheid.nl BWBR0035730) as in force
 * on `effectiveFrom`. Amounts are the statutory amounts EXCLUDING VAT.
 *
 * VAT is deliberately NOT assumed (Temujin PR-7 gate B): the Regeling
 * states amounts excluding VAT "where applicable", and whether a given
 * office/measure is VAT-liable or exempt is not derivable from the fee
 * table. The dataset therefore records the open question, and any VAT
 * figure is labelled "if applicable" instead of being folded into a total.
 *
 * The "17 hours" figure that motivated the 2026 increase is an INTERNAL
 * CAPACITY BENCHMARK for the office dashboard — never presented as a
 * legal norm (Temujin round 1 #5).
 */

export const FEE_CALC_VERSION = "fees-2026.1";

export type FeeCategory =
  | "bewind_standaard"
  | "bewind_schulden"
  | "bewind_standaard_2p"
  | "bewind_schulden_2p"
  | "bewind_gemengd_2p"
  | "curatele_standaard"
  | "mentorschap_standaard";

export type FeeSchedule = {
  /** ISO date this schedule takes effect (inclusive) */
  effectiveFrom: string;
  /** ISO date it stops applying (exclusive); null = still in force */
  effectiveTo: string | null;
  legalSource: string;
  sourceUrl: string;
  /** version identifier of the consulted text */
  sourceVersion: string;
  /** How VAT applies to these amounts. The Regeling states amounts
   *  excluding VAT "where applicable" — whether a given office/measure is
   *  VAT-liable or exempt is NOT derivable from the fee table, so the
   *  dataset records the question rather than assuming an answer
   *  (Temujin PR-7 gate B). */
  vatTreatment: "excl_vat_applicability_varies";
  /** yearly beloning per category, in cents, EXCL. BTW */
  yearlyCents: Record<FeeCategory, number>;
  /** one-off fees, in cents, EXCL. BTW */
  intakeCents: number;
  eindrekeningCents: number;
  /** Internal capacity benchmark ONLY — not a legal norm. */
  benchmarkHours: { standard: number; schulden: number };
};

/**
 * Ordered oldest → newest. 2026 amounts: +5.1629% indexation plus a
 * one-off +10.5% structural increase (Stcrt. 2025, 39037).
 */
export const FEE_SCHEDULES: FeeSchedule[] = [
  {
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    legalSource: "Regeling beloning curatoren, bewindvoerders en mentoren",
    sourceUrl: "https://wetten.overheid.nl/BWBR0035730",
    sourceVersion: "2025",
    vatTreatment: "excl_vat_applicability_varies",
    yearlyCents: {
      bewind_standaard: 140_300,
      bewind_schulden: 181_400,
      bewind_standaard_2p: 168_100,
      bewind_schulden_2p: 217_600,
      bewind_gemengd_2p: 193_000,
      curatele_standaard: 252_400,
      mentorschap_standaard: 140_300,
    },
    intakeCents: 65_900,
    eindrekeningCents: 27_500,
    benchmarkHours: { standard: 17, schulden: 22 },
  },
  {
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    legalSource:
      "Regeling beloning curatoren, bewindvoerders en mentoren (indexering + structurele verhoging, Stcrt. 2025, 39037)",
    sourceUrl: "https://wetten.overheid.nl/BWBR0035730",
    sourceVersion: "2026-01-01",
    vatTreatment: "excl_vat_applicability_varies",
    yearlyCents: {
      bewind_standaard: 163_000,
      bewind_schulden: 210_700,
      bewind_standaard_2p: 195_400,
      bewind_schulden_2p: 252_800,
      bewind_gemengd_2p: 224_300,
      curatele_standaard: 293_300,
      mentorschap_standaard: 163_000,
    },
    intakeCents: 76_700,
    eindrekeningCents: 28_800,
    benchmarkHours: { standard: 17, schulden: 22 },
  },
];

export const VAT_RATE = 0.21;

export function scheduleFor(dateIso: string): FeeSchedule | null {
  return (
    FEE_SCHEDULES.find(
      (s) =>
        dateIso >= s.effectiveFrom &&
        (s.effectiveTo === null || dateIso < s.effectiveTo)
    ) ?? null
  );
}

/** Category from the dossier's own facts; an audited override wins. */
export function categoryFor(dossier: {
  regime: string;
  schuldenbewind: boolean;
  feeCategory?: string | null;
}): FeeCategory {
  if (dossier.feeCategory && isFeeCategory(dossier.feeCategory)) {
    return dossier.feeCategory;
  }
  if (dossier.regime === "curatele") return "curatele_standaard";
  if (dossier.regime === "mentorschap") return "mentorschap_standaard";
  return dossier.schuldenbewind ? "bewind_schulden" : "bewind_standaard";
}

export function isFeeCategory(v: string): v is FeeCategory {
  return [
    "bewind_standaard",
    "bewind_schulden",
    "bewind_standaard_2p",
    "bewind_schulden_2p",
    "bewind_gemengd_2p",
    "curatele_standaard",
    "mentorschap_standaard",
  ].includes(v);
}

export type FeeSegment = {
  from: string;
  to: string;
  scheduleVersion: string;
  yearlyCents: number;
  activeDays: number;
  /** days of the SEGMENT (denominator for that schedule's pro-rating) */
  segmentDays: number;
  cents: number;
};

export type FeeComputation = {
  category: FeeCategory;
  /** every schedule version that contributed (a period may cross a
   *  statutory boundary — Temujin PR-7 gate B) */
  scheduleVersion: string;
  scheduleVersions: string[];
  segments: FeeSegment[];
  legalSource: string;
  sourceUrl: string;
  calcVersion: string;
  /** days of the period the measure actually ran */
  activeDays: number;
  periodDays: number;
  /** yearly amount of the LAST contributing schedule (headline figure) */
  yearlyCents: number;
  /** pro-rated, summed across schedule segments */
  proratedCents: number;
  /** VAT is NOT assumed: applicability depends on the office's own tax
   *  position, so this is "if applicable at 21%", never folded into a
   *  total (Temujin PR-7 gate B). */
  vatApplicability: "varies_by_office";
  vatIfApplicableCents: number;
  benchmarkHours: number;
};

function daysInclusive(fromIso: string, toIso: string): number {
  return (
    Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000) + 1
  );
}

function maxIso(a: string, b: string) {
  return a > b ? a : b;
}
function minIso(a: string, b: string) {
  return a < b ? a : b;
}

/**
 * Beloning for one dossier over one period, pro-rated by the days the
 * measure actually ran — and SPLIT per schedule when the period crosses a
 * statutory effective date (e.g. a court year running Jul 2025–Jun 2026
 * earns the 2025 rate for its 2025 days and the 2026 rate afterwards).
 *
 * Returns null when NO schedule covers any part of the period: a missing
 * legal source must never silently become €0.
 */
export function computeFee(input: {
  dossier: {
    regime: string;
    schuldenbewind: boolean;
    feeCategory?: string | null;
    startDate: string | null;
    endDate?: string | null;
  };
  periodStart: string;
  periodEnd: string;
}): FeeComputation | null {
  const category = categoryFor(input.dossier);
  const periodDays = daysInclusive(input.periodStart, input.periodEnd);

  // Window the measure was actually running inside this period.
  const activeStart =
    input.dossier.startDate && input.dossier.startDate > input.periodStart
      ? input.dossier.startDate
      : input.periodStart;
  const activeEnd =
    input.dossier.endDate && input.dossier.endDate < input.periodEnd
      ? input.dossier.endDate
      : input.periodEnd;
  const activeDays =
    activeStart > activeEnd ? 0 : daysInclusive(activeStart, activeEnd);

  const segments: FeeSegment[] = [];
  for (const schedule of FEE_SCHEDULES) {
    const segFrom = maxIso(schedule.effectiveFrom, input.periodStart);
    const segTo = schedule.effectiveTo
      ? minIso(
          new Date(Date.parse(schedule.effectiveTo) - 86_400_000)
            .toISOString()
            .slice(0, 10),
          input.periodEnd
        )
      : input.periodEnd;
    if (segFrom > segTo) continue; // schedule does not overlap the period
    const segmentDays = daysInclusive(segFrom, segTo);
    // Active days INSIDE this segment.
    const aStart = maxIso(segFrom, activeStart);
    const aEnd = minIso(segTo, activeEnd);
    const segActiveDays = aStart > aEnd ? 0 : daysInclusive(aStart, aEnd);
    const yearlyCents = schedule.yearlyCents[category];
    // Pro-rate against the FULL PERIOD, so segments of one reporting
    // period always sum to at most one yearly fee.
    const cents = Math.round((yearlyCents * segActiveDays) / periodDays);
    segments.push({
      from: segFrom,
      to: segTo,
      scheduleVersion: schedule.sourceVersion,
      yearlyCents,
      activeDays: segActiveDays,
      segmentDays,
      cents,
    });
  }
  if (segments.length === 0) return null;

  const last = FEE_SCHEDULES.find(
    (s) => s.sourceVersion === segments.at(-1)!.scheduleVersion
  )!;
  const proratedCents = segments.reduce((s, seg) => s + seg.cents, 0);

  return {
    category,
    scheduleVersion: segments.at(-1)!.scheduleVersion,
    scheduleVersions: [...new Set(segments.map((s) => s.scheduleVersion))],
    segments,
    legalSource: last.legalSource,
    sourceUrl: last.sourceUrl,
    calcVersion: FEE_CALC_VERSION,
    activeDays,
    periodDays,
    yearlyCents: last.yearlyCents[category],
    proratedCents,
    vatApplicability: "varies_by_office",
    vatIfApplicableCents: Math.round(proratedCents * VAT_RATE),
    benchmarkHours: category.includes("schulden")
      ? last.benchmarkHours.schulden
      : last.benchmarkHours.standard,
  };
}

// ---------- Time & capacity (internal benchmark only) ----------

export const ACTIVITY_KEYS = [
  "intake",
  "betalingsverkeer",
  "post",
  "rechtbank",
  "klantcontact",
  "schulden",
  "overig",
] as const;
export type ActivityKey = (typeof ACTIVITY_KEYS)[number];

export function isActivityKey(v: string): v is ActivityKey {
  return (ACTIVITY_KEYS as readonly string[]).includes(v);
}

/**
 * Effective hourly rate and benchmark comparison for ONE dossier.
 * `benchmarkHours` is the office's internal capacity yardstick derived
 * from the fee level — explicitly NOT a legal maximum.
 */
export function dossierEconomics(input: {
  fee: FeeComputation;
  minutesLogged: number;
}): {
  hoursLogged: number;
  benchmarkHours: number;
  hoursOverBenchmark: number;
  effectiveHourlyCents: number | null;
} {
  const hoursLogged = input.minutesLogged / 60;
  const effectiveHourlyCents =
    hoursLogged > 0
      ? Math.round(input.fee.proratedCents / hoursLogged)
      : null;
  return {
    hoursLogged,
    benchmarkHours: input.fee.benchmarkHours,
    hoursOverBenchmark: hoursLogged - input.fee.benchmarkHours,
    effectiveHourlyCents,
  };
}
