import "server-only";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { timeEntries } from "@/lib/db/schema";
import { computeFee, dossierEconomics, type FeeComputation } from "@/lib/domain/fees";

/**
 * Office view (plan os-v1 W5): the tariff-cap thesis made visible —
 * fee revenue per dossier against hours actually spent. All figures are
 * computed by code from the versioned fee dataset and logged time.
 *
 * The hour benchmark is INTERNAL capacity guidance, never a legal norm.
 */
export type OfficeRow = {
  dossierId: string;
  name: string;
  regime: string;
  schuldenbewind: boolean;
  status: string;
  fee: FeeComputation | null;
  minutesLogged: number;
  hoursLogged: number;
  benchmarkHours: number;
  hoursOverBenchmark: number;
  effectiveHourlyCents: number | null;
};

export type OfficeSummary = {
  periodStart: string;
  periodEnd: string;
  rows: OfficeRow[];
  totals: {
    dossiers: number;
    feeCents: number;
    minutesLogged: number;
    benchmarkHours: number;
    effectiveHourlyCents: number | null;
    /** VAT is never assumed applicable — shown as "if applicable" only. */
    vatIfApplicableCents: number;
    /** dossiers with no time logged at all — the number is only as good
     *  as the tijdschrijven behind it */
    dossiersWithoutTime: number;
  };
  /** every fee-schedule version that contributed to these figures */
  scheduleVersionsUsed: string[];
  byActor: { actorId: string; name: string; minutes: number; dossiers: number }[];
  byActivity: { activityKey: string; minutes: number }[];
};

export async function officeSummary(year: number): Promise<OfficeSummary> {
  const db = getDb();
  const periodStart = `${year}-01-01`;
  const periodEnd = `${year}-12-31`;

  const [dossierRows, timeRows, actorRows] = await Promise.all([
    db.query.dossiers.findMany(),
    db.query.timeEntries.findMany({
      where: and(
        gte(timeEntries.date, periodStart),
        lte(timeEntries.date, periodEnd)
      ),
    }),
    db.query.actors.findMany(),
  ]);

  const minutesByDossier = new Map<string, number>();
  for (const t of timeRows) {
    if (!t.dossierId) continue;
    minutesByDossier.set(
      t.dossierId,
      (minutesByDossier.get(t.dossierId) ?? 0) + t.minutes
    );
  }

  const billable = dossierRows.filter((d) =>
    ["actief", "uitstroom", "afgesloten"].includes(d.status)
  );
  const rows: OfficeRow[] = billable.map((d) => {
    const fee = computeFee({
      dossier: {
        regime: d.regime,
        schuldenbewind: d.schuldenbewind,
        feeCategory: d.feeCategory,
        startDate: d.startDate,
        endDate: d.endDate,
      },
      periodStart,
      periodEnd,
    });
    const minutesLogged = minutesByDossier.get(d.id) ?? 0;
    const econ = fee
      ? dossierEconomics({ fee, minutesLogged })
      : {
          hoursLogged: minutesLogged / 60,
          benchmarkHours: 0,
          hoursOverBenchmark: 0,
          effectiveHourlyCents: null,
        };
    return {
      dossierId: d.id,
      name: `${d.firstName} ${d.lastName}`,
      regime: d.regime,
      schuldenbewind: d.schuldenbewind,
      status: d.status,
      fee,
      minutesLogged,
      ...econ,
    };
  });

  const feeCents = rows.reduce((s, r) => s + (r.fee?.proratedCents ?? 0), 0);
  const minutesLogged = rows.reduce((s, r) => s + r.minutesLogged, 0);
  const benchmarkHours = rows.reduce((s, r) => s + r.benchmarkHours, 0);

  const byActorMap = new Map<string, { minutes: number; dossiers: Set<string> }>();
  for (const t of timeRows) {
    const cur = byActorMap.get(t.actorId) ?? { minutes: 0, dossiers: new Set() };
    cur.minutes += t.minutes;
    if (t.dossierId) cur.dossiers.add(t.dossierId);
    byActorMap.set(t.actorId, cur);
  }
  const byActivityMap = new Map<string, number>();
  for (const t of timeRows) {
    byActivityMap.set(
      t.activityKey,
      (byActivityMap.get(t.activityKey) ?? 0) + t.minutes
    );
  }

  return {
    periodStart,
    periodEnd,
    rows: rows.sort((a, b) => b.hoursOverBenchmark - a.hoursOverBenchmark),
    totals: {
      dossiers: rows.length,
      feeCents,
      minutesLogged,
      benchmarkHours,
      effectiveHourlyCents:
        minutesLogged > 0 ? Math.round(feeCents / (minutesLogged / 60)) : null,
      dossiersWithoutTime: rows.filter((r) => r.minutesLogged === 0).length,
      vatIfApplicableCents: rows.reduce(
        (s, r) => s + (r.fee?.vatIfApplicableCents ?? 0),
        0
      ),
    },
    scheduleVersionsUsed: [
      ...new Set(rows.flatMap((r) => r.fee?.scheduleVersions ?? [])),
    ],
    byActor: [...byActorMap.entries()]
      .map(([actorId, v]) => ({
        actorId,
        name: actorRows.find((a) => a.id === actorId)?.name ?? actorId,
        minutes: v.minutes,
        dossiers: v.dossiers.size,
      }))
      .sort((a, b) => b.minutes - a.minutes),
    byActivity: [...byActivityMap.entries()]
      .map(([activityKey, minutes]) => ({ activityKey, minutes }))
      .sort((a, b) => b.minutes - a.minutes),
  };
}

export async function dossierTimeEntries(dossierId: string) {
  return getDb().query.timeEntries.findMany({
    where: eq(timeEntries.dossierId, dossierId),
    orderBy: sql`${timeEntries.date} desc`,
  });
}
