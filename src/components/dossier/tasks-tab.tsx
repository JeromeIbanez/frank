import { getDossierTasks } from "@/lib/queries";
import { TaskList, type TaskForList } from "@/components/task-list";

export async function TasksTab({
  dossierId,
  tasksPromise,
}: {
  dossierId: string;
  tasksPromise: ReturnType<typeof getDossierTasks>;
}) {
  const tasks = await tasksPromise;
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
    dossierId,
  }));
  return <TaskList tasks={forList} />;
}
