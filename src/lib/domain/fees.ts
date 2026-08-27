/**
 * Bewindvoerdersbeloning — a VERSIONED LEGAL DATASET, not constants
 * (Temujin plan review round 1 #5).
 *
 * Every amount is transcribed from the Regeling beloning curatoren,
 * bewindvoerders en mentoren (wetten.overheid.nl BWBR0035730) as in force
 * on `effectiveFrom`, with its VAT treatment recorded. Amounts are EXCL.
 * BTW unless a row says otherwise; the 21% figure is shown separately and
 * never folded into the statutory amount.
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
  vatTreatment: "excl_btw_21" | "incl_btw";
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
    vatTreatment: "excl_btw_21",
    yearlyCents: {
      bewind_standaard: 140_300,
      bewind_schulden: 181_400,
      bewind_standaard_2p: 168_400,
      bewind_schulden_2p: 217_700,
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
    vatTreatment: "excl_btw_21",
    yearlyCents: {
      bewind_standaard: 163_000,
      bewind_schulden: 210_700,
      bewind_standaard_2p: 195_600,
      bewind_schulden_2p: 252_800,
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
    "curatele_standaard",
    "mentorschap_standaard",
  ].includes(v);
}

export type FeeComputation = {
  category: FeeCategory;
  scheduleVersion: string;
  legalSource: string;
  sourceUrl: string;
  calcVersion: string;
  /** days of the period the measure actually ran */
  activeDays: number;
  periodDays: number;
  yearlyCents: number;
  /** pro-rated for a measure that started/ended mid-period */
  proratedCents: number;
  vatCents: number;
  totalInclVatCents: number;
  benchmarkHours: number;
};

function daysInclusive(fromIso: string, toIso: string): number {
  return (
    Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000) + 1
  );
}

/**
 * Beloning for one dossier over one period, pro-rated by the days the
 * measure was actually running. Returns null when no schedule covers the
 * period start — a missing legal source must never silently become €0.
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
  const schedule = scheduleFor(input.periodStart);
  if (!schedule) return null;
  const category = categoryFor(input.dossier);
  const yearlyCents = schedule.yearlyCents[category];

  const periodDays = daysInclusive(input.periodStart, input.periodEnd);
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

  const proratedCents =
    activeDays >= periodDays
      ? yearlyCents
      : Math.round((yearlyCents * activeDays) / periodDays);
  const vatCents = Math.round(proratedCents * VAT_RATE);

  return {
    category,
    scheduleVersion: schedule.sourceVersion,
    legalSource: schedule.legalSource,
    sourceUrl: schedule.sourceUrl,
    calcVersion: FEE_CALC_VERSION,
    activeDays,
    periodDays,
    yearlyCents,
    proratedCents,
    vatCents,
    totalInclVatCents: proratedCents + vatCents,
    benchmarkHours: category.includes("schulden")
      ? schedule.benchmarkHours.schulden
      : schedule.benchmarkHours.standard,
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
