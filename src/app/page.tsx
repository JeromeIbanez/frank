import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  computeExceptions,
  dashboardStats,
  getOpenTasks,
} from "@/lib/queries";
import { severity } from "@/lib/domain/deadlines";
import { Money, SeverityDot } from "@/components/format";
import { aiUsage } from "@/lib/ai/gateway";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const tAll = await getTranslations();
  const [stats, exceptions, tasks, usage] = await Promise.all([
    dashboardStats(),
    computeExceptions(),
    getOpenTasks(),
    aiUsage(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = tasks.filter((x) => x.dueDate).slice(0, 8);

  const tiles = [
    { label: t("tiles.dossiers"), value: stats.dossiers },
    { label: t("tiles.openTasks"), value: stats.openTasks },
    { label: t("tiles.overdue"), value: stats.overdueTasks, alert: stats.overdueTasks > 0 },
    { label: t("tiles.newDocuments"), value: stats.newDocuments },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((tile) => (
          <Card key={tile.label} className="py-4">
            <CardContent className="px-5">
              <div
                className={
                  "text-3xl font-semibold tabular-nums " +
                  (tile.alert ? "text-red-600" : "")
                }
              >
                {tile.value}
              </div>
              <div className="text-sm text-muted-foreground mt-1">{tile.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("exceptions.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {exceptions.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("exceptions.none")}</p>
            )}
            {exceptions.slice(0, 10).map((e, i) => (
              <Link
                key={i}
                href={`/dossiers/${e.dossierId}`}
                className="flex items-start gap-2.5 rounded-md px-2.5 py-2 hover:bg-muted/50 text-sm"
              >
                <SeverityDot severity={e.kind === "uncategorized" ? "amber" : "red"} />
                <div className="min-w-0">
                  <div className="font-medium">{e.dossierName}</div>
                  <div className="text-muted-foreground">
                    {t(`exceptions.${e.kind}`)}
                    {e.kind === "missed_income" && (
                      <>
                        {" — "}
                        {String(e.detail.line)} (
                        <Money cents={Number(e.detail.amountCents)} />)
                      </>
                    )}
                    {e.kind === "balance_floor" && (
                      <>
                        {" — "}
                        <Money cents={Number(e.detail.balanceCents)} />
                      </>
                    )}
                    {e.kind === "uncategorized" && <> — {e.detail.count}×</>}
                  </div>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("deadlines.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {upcoming.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("deadlines.none")}</p>
            )}
            {upcoming.map((task) => (
              <Link
                key={task.id}
                href={
                  task.dossier ? `/dossiers/${task.dossier.id}?tab=tasks` : "/my-day"
                }
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 hover:bg-muted/50 text-sm"
              >
                <SeverityDot
                  severity={severity(task.dueDate!, today, task.deadlineConfirmed)}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {task.titleFree ?? tAll(task.titleKey)}
                  </div>
                  <div className="text-muted-foreground">
                    {task.dossier
                      ? `${task.dossier.firstName} ${task.dossier.lastName}`
                      : t("deadlines.office")}
                  </div>
                </div>
                <div className="text-muted-foreground tabular-nums">{task.dueDate}</div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground/70">
        {t("aiUsage", {
          used: usage.totalTokens.toLocaleString(),
          cap: usage.cap.toLocaleString(),
        })}
      </p>
    </div>
  );
}
