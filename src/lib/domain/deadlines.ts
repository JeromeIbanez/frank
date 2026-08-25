/**
 * Statutory task generation with deadline provenance (PRD §6 M2).
 *
 * Every generated task carries provenance: the legal source (statute / LOVT
 * ref), the basis date + kind it was computed from, and the calculation
 * version — so a human can always see WHY a deadline exists. Deadlines are
 * proposals until a human confirms them (unconfirmed renders red, see
 * `severity`). The court's R&V schedule is an explicit input and never
 * inferred: with `rvScheduleMonth === null` NO R&V task is generated.
 *
 * All date math is UTC on ISO "YYYY-MM-DD" strings.
 */

export const CALC_VERSION = "2026-08.1";

export type StatutoryTaskSpec = {
  key: string; // stable key e.g. "boedelbeschrijving"
  titleKey: string; // i18n key "tasks.boedelbeschrijving"
  legalSource: string; // e.g. "art. 1:436 BW; LOVT B.B1"
  basisDate: string; // ISO date it was computed from
  basisKind: "startDate" | "beschikkingDate" | "rvSchedule" | "endDate" | "deathDate";
  dueDate: string; // ISO
  calculationVersion: string;
  tier: "T1" | "T2" | "T3" | "internal";
  recurring?: "yearly" | "monthly";
};

function parseIsoDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function toIso(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, "0");
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function lastDayOfMonthUtc(year: number, month1to12: number): Date {
  // Day 0 of the next month = last day of this month.
  return new Date(Date.UTC(year, month1to12, 0));
}

/** Add calendar months in UTC, clamping to the last day of the target month. */
function addMonthsClamped(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(y, m + months, 1));
  const lastDay = lastDayOfMonthUtc(target.getUTCFullYear(), target.getUTCMonth() + 1).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

function addYearsClamped(d: Date, years: number): Date {
  return addMonthsClamped(d, years * 12);
}

export function computeStatutoryTasks(input: {
  startDate: string | null; // ISO
  beschikkingDate: string | null;
  schuldenbewind: boolean;
  rvScheduleMonth: number | null; // 1-12, explicit court schedule; null => no R&V task
  today: string; // ISO, injected for testability
}): StatutoryTaskSpec[] {
  const tasks: StatutoryTaskSpec[] = [];
  const today = parseIsoDate(input.today);

  // Basis for start-of-bewind obligations: startDate, falling back to the
  // beschikkingDate when the operational start date is not yet recorded.
  const basis: { date: Date; iso: string; kind: "startDate" | "beschikkingDate" } | null =
    input.startDate !== null
      ? { date: parseIsoDate(input.startDate), iso: input.startDate, kind: "startDate" }
      : input.beschikkingDate !== null
        ? { date: parseIsoDate(input.beschikkingDate), iso: input.beschikkingDate, kind: "beschikkingDate" }
        : null;

  if (basis !== null) {
    // Boedelbeschrijving: within 4 months of start (art. 1:436 BW; LOVT B.B1).
    const boedelDue = addMonthsClamped(basis.date, 4);
    tasks.push({
      key: "boedelbeschrijving",
      titleKey: "tasks.boedelbeschrijving",
      legalSource: "art. 1:436 BW; LOVT B.B1",
      basisDate: basis.iso,
      basisKind: basis.kind,
      dueDate: toIso(boedelDue),
      calculationVersion: CALC_VERSION,
      tier: "T2",
    });

    // Plan van aanpak: due together with the boedelbeschrijving. Always
    // relevant for a professional office (LOVT B.B4); for schuldenbewind the
    // plan includes the supplementary debt plan — same stable key, the
    // schuldenbewind flag lives on the dossier, not in the task key.
    tasks.push({
      key: "plan_van_aanpak",
      titleKey: "tasks.plan_van_aanpak",
      legalSource: input.schuldenbewind
        ? "LOVT B.B4 (incl. aanvullend schuldenplan); art. 1:432a BW"
        : "LOVT B.B4; art. 1:432a BW",
      basisDate: basis.iso,
      basisKind: basis.kind,
      dueDate: toIso(boedelDue),
      calculationVersion: CALC_VERSION,
      tier: "T2",
    });

    // 5-yearly evaluation (art. 1:446a BW): startDate + 5 years.
    tasks.push({
      key: "vijfjaarlijkse_evaluatie",
      titleKey: "tasks.vijfjaarlijkse_evaluatie",
      legalSource: "art. 1:446a BW; LOVT M.B10",
      basisDate: basis.iso,
      basisKind: basis.kind,
      dueDate: toIso(addYearsClamped(basis.date, 5)),
      calculationVersion: CALC_VERSION,
      tier: "T2",
    });
  }

  // R&V: yearly, due the last day of the court-set schedule month
  // (art. 1:445 BW). ONLY generated when the court schedule is explicitly
  // recorded — never inferred (PRD §6 M2). Next upcoming occurrence only.
  if (input.rvScheduleMonth !== null) {
    if (
      !Number.isInteger(input.rvScheduleMonth) ||
      input.rvScheduleMonth < 1 ||
      input.rvScheduleMonth > 12
    ) {
      throw new Error(`rvScheduleMonth out of range: ${input.rvScheduleMonth}`);
    }
    const thisYearDue = lastDayOfMonthUtc(today.getUTCFullYear(), input.rvScheduleMonth);
    const due =
      thisYearDue.getTime() >= today.getTime()
        ? thisYearDue
        : lastDayOfMonthUtc(today.getUTCFullYear() + 1, input.rvScheduleMonth);
    tasks.push({
      key: "rekening_verantwoording",
      titleKey: "tasks.rekening_verantwoording",
      legalSource: "art. 1:445 BW; LOVT B.B11-B.B13",
      basisDate: input.today,
      basisKind: "rvSchedule",
      dueDate: toIso(due),
      calculationVersion: CALC_VERSION,
      tier: "T2",
      recurring: "yearly",
    });
  }

  // Monthly client account overview (Besluit kwaliteitseisen art. 5 lid 6):
  // next month-end relative to today, recurring, internal tier.
  {
    const eom = lastDayOfMonthUtc(today.getUTCFullYear(), today.getUTCMonth() + 1);
    const due =
      eom.getTime() >= today.getTime()
        ? eom
        : lastDayOfMonthUtc(today.getUTCFullYear(), today.getUTCMonth() + 2);
    tasks.push({
      key: "maandoverzicht_client",
      titleKey: "tasks.maandoverzicht_client",
      legalSource: "Besluit kwaliteitseisen art. 5 lid 6",
      basisDate: basis?.iso ?? input.today,
      basisKind: basis?.kind ?? "startDate",
      dueDate: toIso(due),
      calculationVersion: CALC_VERSION,
      tier: "internal",
      recurring: "monthly",
    });
  }

  return tasks;
}

/**
 * Traffic-light severity for a deadline.
 * - "red": overdue, OR the deadline has not been human-confirmed yet
 *   (unconfirmed legal dates render red — PRD §6 M2).
 * - "amber": due within 14 days.
 * - "green": otherwise.
 */
export function severity(
  dueDate: string,
  today: string,
  confirmed: boolean,
): "red" | "amber" | "green" {
  const due = parseIsoDate(dueDate).getTime();
  const now = parseIsoDate(today).getTime();
  if (!confirmed) return "red";
  if (due < now) return "red";
  const days = (due - now) / 86_400_000;
  if (days <= 14) return "amber";
  return "green";
}
