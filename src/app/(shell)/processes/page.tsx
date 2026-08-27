import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, SeverityDot } from "@/components/format";
import { officeProcesses } from "@/lib/processes";
import { ActivateProcessesButton } from "@/components/activate-processes-button";

export const dynamic = "force-dynamic";

/**
 * The process view — the "OS" claim made literal (plan os-v2 W3).
 *
 * Not a task list. A task list tells you what is undone; this tells you what
 * is undone, why, and whether it is even yours to move. The three numbers a
 * curator actually wants on a Monday are: what needs me, what is late, and
 * what am I waiting on someone else for.
 *
 * Processes waiting on a court, a client or a creditor are shown separately
 * and NOT counted as "needs you" — inflating that figure with work nobody
 * here can do is how a dashboard stops being read.
 */
export default async function ProcessesPage() {
  const t = await getTranslations("processes");
  const { rows, summary } = await officeProcesses();

  const tiles = [
    { label: t("tiles.running"), value: summary.running },
    { label: t("tiles.waitingOnYou"), value: summary.waitingOnYou },
    { label: t("tiles.blocked"), value: summary.blocked },
    { label: t("tiles.overdue"), value: summary.overdue },
  ];

  // Most urgent first: overdue, then what needs the office.
  const ordered = [...rows].sort((a, b) => {
    const score = (r: (typeof rows)[number]) =>
      r.processes.reduce((n, p) => n + p.overdueCount * 10 + p.readyCount, 0);
    return score(b) - score(a);
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <CardContent>
              <div className="type-section-label">{tile.label}</div>
              <div className="type-kpi mt-1 text-ink-900">{tile.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-2">
        <ActivateProcessesButton />
        <p className="max-w-2xl text-[12.5px] text-ink-600">{t("intro")}</p>
      </div>

      {rows.length === 0 && (
        <EmptyState title={t("emptyTitle")} sentence={t("emptySentence")} />
      )}

      <div className="space-y-3">
        {ordered.map((row) => (
          <Card key={row.dossierId}>
            <CardContent className="space-y-2.5">
              <Link
                href={`/dossiers/${row.dossierId}`}
                className="text-[14px] font-semibold text-ink-900 hover:underline"
              >
                {row.dossierName}
              </Link>

              {row.processes.map((p) => (
                <div
                  key={p.instanceId}
                  className="rounded-[8px] border border-hairline px-3 py-2"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-medium text-ink-900">
                      {t(`definition.${p.definitionKey}`)}
                      {p.periodLabel && (
                        <span className="ml-1.5 font-mono text-[11px] font-normal text-ink-400">
                          {p.periodLabel}
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-[11px] text-ink-400">
                      {t(`status.${p.status}`)}
                    </span>
                  </div>

                  {/* Where the deadlines come from — traceable to a fact,
                      never to the calendar. */}
                  <div className="mt-0.5 font-mono text-[11px] text-ink-400">
                    {t("startedOn", {
                      date: p.startedOn,
                      source: t(`source.${p.startSource}`),
                    })}
                  </div>

                  <div className="mt-1.5 space-y-1">
                    {p.steps.map((s) => (
                      <div
                        key={s.key}
                        className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12.5px]"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {s.overdue ? (
                            <SeverityDot severity="red" />
                          ) : s.status === "done" ? (
                            <SeverityDot severity="green" />
                          ) : s.status === "ready" ? (
                            <SeverityDot severity="amber" />
                          ) : (
                            <SeverityDot severity="info" />
                          )}
                          <span
                            className={
                              s.status === "done"
                                ? "text-ink-400 line-through"
                                : "text-ink-900"
                            }
                          >
                            {t(`step.${p.definitionKey}.${s.key}`)}
                          </span>
                        </span>

                        {/* Whose move it is — the distinction a task list loses. */}
                        {s.status === "awaiting" && (
                          <span className="text-ink-600">
                            {t(`awaiting.${s.owner}`)}
                          </span>
                        )}

                        {/* Why it is stuck, without reconstructing the chain. */}
                        {s.status === "blocked" && s.blockedBy.length > 0 && (
                          <span className="text-ink-400">
                            {t("blockedBy", {
                              steps: s.blockedBy
                                .map((b) => t(`step.${p.definitionKey}.${b}`))
                                .join(", "),
                            })}
                          </span>
                        )}

                        {s.dueDate && s.status !== "done" && (
                          <span className="font-mono text-[11px] text-ink-400 tabular-nums">
                            {s.overdue
                              ? t("overdueSince", { date: s.dueDate })
                              : t("due", { date: s.dueDate })}
                          </span>
                        )}

                        {s.legalSource && (
                          <span className="font-mono text-[11px] text-ink-400">
                            {s.legalSource}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="max-w-2xl text-[12px] text-ink-400">{t("derivedNote")}</p>
    </div>
  );
}
