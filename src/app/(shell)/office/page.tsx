import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { officeSummary } from "@/lib/office";
import { FEE_SCHEDULES, scheduleFor } from "@/lib/domain/fees";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Money, SeverityDot } from "@/components/format";
import { LogTimeForm } from "@/components/office-client";

export const dynamic = "force-dynamic";

function hours(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

/**
 * Office (plan os-v1 W5): the tariff-cap thesis in numbers. Fee revenue is
 * capped by the Regeling; margin comes from hours. The hour benchmark is
 * the office's internal capacity yardstick — NOT a legal norm.
 */
export default async function OfficePage() {
  const t = await getTranslations("office");
  const year = new Date().getFullYear();
  const summary = await officeSummary(year);
  const schedule = scheduleFor(`${year}-01-01`) ?? FEE_SCHEDULES.at(-1)!;

  const tiles = [
    { label: t("tiles.dossiers"), value: String(summary.totals.dossiers) },
    {
      label: t("tiles.feeRevenue"),
      value: (summary.totals.feeCents / 100).toLocaleString("nl-NL", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }),
      sub: t("tiles.exclVat", {
        vat: (summary.totals.vatIfApplicableCents / 100).toLocaleString("nl-NL", {
          style: "currency",
          currency: "EUR",
          maximumFractionDigits: 0,
        }),
      }),
    },
    {
      label: t("tiles.hours"),
      value: hours(summary.totals.minutesLogged),
      sub: t("tiles.benchmark", { hours: summary.totals.benchmarkHours }),
    },
    {
      label: t("tiles.effectiveRate"),
      value:
        summary.totals.effectiveHourlyCents !== null
          ? (summary.totals.effectiveHourlyCents / 100).toLocaleString("nl-NL", {
              style: "currency",
              currency: "EUR",
              maximumFractionDigits: 0,
            }) + t("perHour")
          : "—",
      sub: t("tiles.effectiveRateSub"),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <CardContent>
              <div className="type-section-label">{tile.label}</div>
              <div className="type-kpi mt-1 text-ink-900">{tile.value}</div>
              {tile.sub && (
                <div className="mt-0.5 text-xs text-ink-400">{tile.sub}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {summary.totals.dossiersWithoutTime > 0 && (
        <p className="rounded-[8px] border border-hairline bg-surface-subtle px-3 py-2 text-[12.5px] text-ink-600">
          {t("timeCoverageNote", {
            count: summary.totals.dossiersWithoutTime,
            total: summary.totals.dossiers,
          })}
        </p>
      )}

      <div className="grid lg:grid-cols-[7fr_5fr] gap-3.5 items-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-ink-900">
              {t("perDossier")}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <p className="mb-2 text-[12px] text-ink-400">{t("benchmarkNote")}</p>
            {summary.rows.length === 0 && (
              <EmptyState title={t("emptyTitle")} sentence={t("emptySentence")} />
            )}
            {summary.rows.length > 0 && (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-hairline text-left">
                    <th className="py-1.5 type-section-label text-left">
                      {t("cols.dossier")}
                    </th>
                    <th className="py-1.5 type-section-label text-right">
                      {t("cols.fee")}
                    </th>
                    <th className="py-1.5 type-section-label text-right">
                      {t("cols.hours")}
                    </th>
                    <th className="py-1.5 type-section-label text-right">
                      {t("cols.vsBenchmark")}
                    </th>
                    <th className="py-1.5 type-section-label text-right">
                      {t("cols.rate")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((r) => (
                    <tr key={r.dossierId} className="border-b border-hairline">
                      <td className="py-1.5">
                        <Link
                          href={`/dossiers/${r.dossierId}`}
                          className="hover:underline"
                        >
                          {r.name}
                        </Link>
                        {r.fee && (
                          <span className="ml-2 font-mono text-[10.5px] text-ink-300">
                            {t(`category.${r.fee.category}`)}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right font-mono tabular-nums">
                        {r.fee ? <Money cents={r.fee.proratedCents} /> : "—"}
                      </td>
                      <td className="py-1.5 text-right font-mono tabular-nums">
                        {r.minutesLogged > 0 ? hours(r.minutesLogged) : "—"}
                      </td>
                      <td className="py-1.5 text-right">
                        {r.minutesLogged > 0 ? (
                          <span className="inline-flex items-center justify-end gap-1.5 font-mono tabular-nums">
                            {r.hoursOverBenchmark > 0 && (
                              <SeverityDot
                                severity={
                                  r.hoursOverBenchmark > r.benchmarkHours * 0.25
                                    ? "red"
                                    : "amber"
                                }
                              />
                            )}
                            {r.hoursOverBenchmark > 0 ? "+" : ""}
                            {r.hoursOverBenchmark.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-ink-300">
                            {t("noTimeLogged")}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right font-mono tabular-nums">
                        {r.effectiveHourlyCents !== null ? (
                          <Money cents={r.effectiveHourlyCents} />
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-3 font-mono text-[10.5px] text-ink-300">
              {t("feeSource", {
                source: schedule.legalSource,
                version: summary.scheduleVersionsUsed.join(", ") || schedule.sourceVersion,
                calc: summary.rows[0]?.fee?.calcVersion ?? "—",
              })}
            </p>
            <p className="mt-1 text-[11.5px] text-ink-400">{t("vatNote")}</p>
          </CardContent>
        </Card>

        <div className="space-y-3.5">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-ink-900">
                {t("logTime")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LogTimeForm
                dossiers={summary.rows.map((r) => ({
                  id: r.dossierId,
                  name: r.name,
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-ink-900">
                {t("byActor")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {summary.byActor.length === 0 && (
                <p className="text-[12.5px] text-ink-400">{t("noTime")}</p>
              )}
              {summary.byActor.map((a) => (
                <div
                  key={a.actorId}
                  className="flex items-center justify-between text-[13px]"
                >
                  <span>{a.name}</span>
                  <span className="font-mono tabular-nums text-ink-600">
                    {hours(a.minutes)} {t("h")} · {a.dossiers}{" "}
                    {t("dossiersShort")}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-ink-900">
                {t("byActivity")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {summary.byActivity.length === 0 && (
                <p className="text-[12.5px] text-ink-400">{t("noTime")}</p>
              )}
              {summary.byActivity.map((a) => (
                <div
                  key={a.activityKey}
                  className="flex items-center justify-between text-[13px]"
                >
                  <span>{t(`activity.${a.activityKey}`)}</span>
                  <span className="font-mono tabular-nums text-ink-600">
                    {hours(a.minutes)} {t("h")}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
