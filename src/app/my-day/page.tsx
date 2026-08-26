import { getTranslations } from "next-intl/server";
import { getOpenTasks } from "@/lib/queries";
import { TaskList, type TaskForList } from "@/components/task-list";

export const dynamic = "force-dynamic";

export default async function MyDayPage() {
  const t = await getTranslations("myDay");
  const tasks = await getOpenTasks();

  const forList: TaskForList[] = tasks.map((task) => ({
    id: task.id,
    titleKey: task.titleKey,
    titleFree: task.titleFree,
    kind: task.kind,
    tier: task.tier,
    status: task.status,
    dueDate: task.dueDate,
    deadlineConfirmed: task.deadlineConfirmed,
    legalSource: task.legalSource,
    basisDate: task.basisDate,
    calculationVersion: task.calculationVersion,
    checklist: task.checklist,
    dossierId: task.dossierId,
    dossierName: task.dossier
      ? `${task.dossier.firstName} ${task.dossier.lastName}`
      : undefined,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>
      <TaskList tasks={forList} showDossier />
    </div>
  );
}
