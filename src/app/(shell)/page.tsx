import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dashboardStats, getOpenTasks } from "@/lib/queries";
import { listOpenSignals, latestComputedAt } from "@/lib/signals";
import { severity } from "@/lib/domain/deadlines";
import { formatEuro } from "@/lib/domain/money";
import {
  DateText,
  EmptyState,
  SeverityDot,
  formatDateNL,
} from "@/components/format";
import {
  DismissSignalButton,
  RefreshSignalsButton,
} from "@/components/signals-client";
import { aiUsage } from "@/lib/ai/gateway";

export const dynamic = "force-dynamic";

/** Whole days from `today` to `iso` (both ISO YYYY-MM-DD, parsed as UTC). */
function daysUntil(iso: string, today: string): number {
  return Math.round((Date.parse(iso) - Date.parse(today)) / 86_400_000);
}

type SignalRow = Awaited<ReturnType<typeof listOpenSignals>>[number];

/** Deep link to the entity a signal points at. */
function signalHref(s: SignalRow): string {
  switch (s.entityType) {
    case "budget_line":
      return `/dossiers/${s.dossierId}?tab=budget`;
    case "account":
    case "transaction":
      return `/dossiers/${s.dossierId}?tab=transactions`;
    case "document":
      return "/inbox";
    case "payment_item":
      return `/payments/${s.payload?.batchId ?? ""}`;
    case "payment_batch":
      return `/payments/${s.entityId}`;
    case "task":
      return s.dossierId ? `/dossiers/${s.dossierId}?tab=tasks` : "/my-day";
    case "dossier":
      return s.detectorKey === "rv_window"
        ? `/dossiers/${s.entityId}?tab=filings`
        : `/dossiers/${s.entityId}?tab=transactions`;
    default:
      return s.dossierId ? `/dossiers/${s.dossierId}` : "/";
  }
}

const SEVERITY_ORDER = { red: 0, amber: 1, info: 2 } as const;

export default async function TodayPage() {
  const t = await getTranslations("dashboard");
  const ts = await getTranslations("signals");
  const tAll = await getTranslations();
  const [stats, signalRows, computedAt, tasks, usage] = await Promise.all([
    dashboardStats(),
    listOpenSignals(),
    latestComputedAt(),
    getOpenTasks(),
    aiUsage(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = tasks.filter((x) => x.dueDate).slice(0, 8);
  const sorted = [...signalRows].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      (a.dossier?.lastName ?? "").localeCompare(b.dossier?.lastName ?? "")
  );

  /** One human sentence per detector, params from the signal payload. */
  function sentence(s: SignalRow): string {
    const p = s.payload ?? {};
    switch (s.detectorKey) {
      case "income_missed":
        return ts("sentence.income_missed", {
          line: String(p.line ?? "?"),
          due: formatDateNL(String(p.dueDate ?? "")),
          amount: formatEuro(Number(p.amountCents ?? 0)),
        });
      case "leefgeld_low":
        return ts("sentence.leefgeld_low", {
          balance: formatEuro(Number(p.balanceCents ?? 0)),
          needed: formatEuro(Number(p.neededCents ?? 0)),
        });
      case "balance_floor":
        return ts("sentence.balance_floor", {
          balance: formatEuro(Number(p.balanceCents ?? 0)),
        });
      case "unexpected_debit":
        return ts("sentence.unexpected_debit", {
          counterparty: String(p.counterparty ?? "?"),
          amount: formatEuro(Math.abs(Number(p.amountCents ?? 0))),
          date: formatDateNL(String(p.date ?? "")),
        });
      case "doc_needs_triage":
        return ts("sentence.doc_needs_triage", {
          filename: String(p.filename ?? "?"),
        });
      case "machtiging_open":
        return ts("sentence.machtiging_open", {
          creditor: String(p.creditor ?? "?"),
        });
      case "task_deadline": {
        const days = Number(p.days ?? 0);
        return days < 0
          ? ts("sentence.task_overdue", {
              task: tAll(String(p.titleKey)),
              days: Math.abs(days),
            })
          : ts("sentence.task_due", {
              task: tAll(String(p.titleKey)),
              days,
            });
      }
      case "deadline_unconfirmed":
        return ts("sentence.deadline_unconfirmed", {
          task: tAll(String(p.titleKey)),
        });
      case "rv_window":
        return ts("sentence.rv_window", {
          dueDate: formatDateNL(String(p.dueDate ?? "")),
          days: Number(p.days ?? 0),
        });
      case "batch_waiting":
        return ts("sentence.batch_waiting", { hours: Number(p.hours ?? 0) });
      case "uncategorized_tx":
        return ts("sentence.uncategorized_tx", { count: Number(p.count ?? 0) });
      default:
        return s.detectorKey;
    }
  }

  const tiles = [
    { label: t("tiles.dossiers"), sub: t("tiles.dossiersSub"), value: stats.dossiers },
    { label: t("tiles.openTasks"), sub: t("tiles.openTasksSub"), value: stats.openTasks },
    {
      label: t("tiles.overdue"),
      sub: t("tiles.overdueSub"),
      value: stats.overdueTasks,
      alert: stats.overdueTasks > 0,
    },
    { label: t("tiles.newDocuments"), sub: t("tiles.newDocumentsSub"), value: stats.newDocuments },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <CardContent>
              <div className="type-section-label">{tile.label}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className={"type-kpi " + (tile.alert ? "text-[#DC2626]" : "text-ink-900")}>
                  {tile.value}
                </span>
                {tile.alert && <SeverityDot severity="red" />}
              </div>
              <div className="mt-0.5 text-xs text-ink-400">{tile.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-[7fr_5fr] gap-3.5 items-start">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-ink-900">
              {ts("title")}
              <span className="ml-2 font-mono text-xs font-normal tabular-nums text-ink-400">
                {sorted.length}
              </span>
            </CardTitle>
            <div className="flex items-center gap-3">
              {computedAt && (
                <span className="font-mono text-[11px] text-ink-400">
                  {ts("computedAt", {
                    time: computedAt.toISOString().slice(11, 16),
                    date: formatDateNL(computedAt.toISOString().slice(0, 10)),
                  })}
                </span>
              )}
              <RefreshSignalsButton />
            </div>
          </CardHeader>
          <CardContent className="space-y-0.5">
            {sorted.length === 0 && (
              <EmptyState title={ts("emptyTitle")} sentence={ts("emptySentence")} />
            )}
            {sorted.map((s) => (
              <div
                key={s.id}
                className="flex items-start gap-2.5 rounded-md px-2.5 py-2 hover:bg-surface-hover"
              >
                <SeverityDot severity={s.severity} className="mt-1.5" />
                <Link href={signalHref(s)} className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-[550] text-ink-900 truncate">
                    {s.dossier
                      ? `${s.dossier.firstName} ${s.dossier.lastName}`
                      : ts("office")}
                  </div>
                  <div className="text-[12.5px] text-ink-600">{sentence(s)}</div>
                  <div className="mt-0.5 font-mono text-[10.5px] text-ink-300">
                    {s.detectorKey} · {s.detectorVersion} ·{" "}
                    {formatDateNL(s.firstSeenAt.toISOString().slice(0, 10))}
                  </div>
                </Link>
                <DismissSignalButton signalId={s.id} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-baseline justify-between">
            <CardTitle className="text-sm font-semibold text-ink-900">
              {t("deadlines.title")}
            </CardTitle>
            <span className="font-mono text-xs tabular-nums text-ink-400">
              {upcoming.length}
            </span>
          </CardHeader>
          <CardContent className="space-y-0.5">
            {upcoming.length === 0 && (
              <EmptyState
                title={t("deadlines.emptyTitle")}
                sentence={t("deadlines.none")}
              />
            )}
            {upcoming.map((task) => {
              const sev = severity(task.dueDate!, today, task.deadlineConfirmed);
              const days = daysUntil(task.dueDate!, today);
              return (
                <Link
                  key={task.id}
                  href={
                    task.dossier ? `/dossiers/${task.dossier.id}?tab=tasks` : "/my-day"
                  }
                  className="flex items-start gap-2.5 rounded-md px-2.5 py-2 hover:bg-surface-hover"
                >
                  <SeverityDot severity={sev} className="mt-1.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-[550] text-ink-900 truncate">
                      {task.titleFree ?? tAll(task.titleKey)}
                    </div>
                    <div className="text-xs text-ink-400">
                      {task.dossier
                        ? `${task.dossier.firstName} ${task.dossier.lastName}`
                        : t("deadlines.office")}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <DateText iso={task.dueDate!} className="text-ink-600" />
                    {sev === "red" && (
                      <span className="text-[11px] font-semibold text-[#B91C1C]">
                        {t("deadlines.overdueTag")}
                      </span>
                    )}
                    {sev === "amber" && (
                      <span className="text-[11px] font-semibold text-[#B45309]">
                        {t("deadlines.daysTag", { count: days })}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <p className="font-mono text-[11px] text-ink-400">
        {t("aiUsage", {
          used: usage.totalTokens.toLocaleString(),
          cap: usage.cap.toLocaleString(),
        })}
      </p>
    </div>
  );
}
