"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateText, formatDateNL, SeverityDot, StatusBadge } from "@/components/format";
import { severity } from "@/lib/domain/deadlines";
import { transitionTask, confirmDeadline, toggleChecklistItem } from "@/lib/actions/tasks";
import { Checkbox } from "@/components/ui/checkbox";

export type TaskForList = {
  id: string;
  titleKey: string;
  titleFree: string | null;
  kind: string;
  tier: string;
  status: string;
  dueDate: string | null;
  deadlineConfirmed: boolean;
  legalSource: string | null;
  basisDate: string | null;
  calculationVersion: string | null;
  checklist: { key: string; label: string; done: boolean }[] | null;
  dossierName?: string;
  dossierId?: string | null;
};

const NEXT_TRANSITIONS: Record<string, string[]> = {
  open: ["prepared", "done"],
  prepared: ["submitted", "done"],
  submitted: ["confirmed"],
};

/** Whole days from `today` to `iso` (both ISO YYYY-MM-DD, parsed as UTC). */
function daysUntil(iso: string, today: string): number {
  return Math.round((Date.parse(iso) - Date.parse(today)) / 86_400_000);
}

export function TaskList({ tasks, showDossier }: { tasks: TaskForList[]; showDossier?: boolean }) {
  const t = useTranslations();
  const today = new Date().toISOString().slice(0, 10);
  const [openTask, setOpenTask] = useState<TaskForList | null>(null);
  const [pendingTransition, setPendingTransition] = useState<string | null>(null);

  const active = tasks.filter((x) =>
    ["open", "prepared", "submitted"].includes(x.status)
  );
  const closed = tasks.filter(
    (x) => !["open", "prepared", "submitted"].includes(x.status)
  );

  return (
    <div className="space-y-2">
      {active.length === 0 && (
        <p className="text-[13px] text-ink-400 py-2">{t("tasksUi.none")}</p>
      )}
      {active.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          today={today}
          showDossier={showDossier}
          onAction={(to) => {
            setOpenTask(task);
            setPendingTransition(to);
          }}
        />
      ))}
      {closed.length > 0 && (
        <div className="pt-4 space-y-2">
          <div className="type-section-label">
            {t("tasksUi.completed", { count: closed.length })}
          </div>
          {closed.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              today={today}
              showDossier={showDossier}
              closed
            />
          ))}
        </div>
      )}

      <TransitionDialog
        task={openTask}
        to={pendingTransition}
        onClose={() => {
          setOpenTask(null);
          setPendingTransition(null);
        }}
      />
    </div>
  );
}

function TaskRow({
  task,
  today,
  showDossier,
  onAction,
  closed,
}: {
  task: TaskForList;
  today: string;
  showDossier?: boolean;
  onAction?: (to: string) => void;
  closed?: boolean;
}) {
  const t = useTranslations();
  const [isPending, startTransition] = useTransition();
  const sev = task.dueDate
    ? severity(task.dueDate, today, task.deadlineConfirmed)
    : "green";
  const days = task.dueDate ? daysUntil(task.dueDate, today) : 0;
  const title = task.titleFree ?? t(task.titleKey);
  const nexts = closed ? [] : (NEXT_TRANSITIONS[task.status] ?? []);
  const checklist = task.checklist ?? [];
  const doneCount = checklist.filter((c) => c.done).length;

  const checklistItems = (
    <div className="space-y-1.5">
      {checklist.map((c) => (
        <label
          key={c.key}
          className={cn(
            "flex items-center gap-2 text-[13px]",
            c.done ? "text-ink-400" : "text-ink-600"
          )}
        >
          <Checkbox
            checked={c.done}
            onCheckedChange={() =>
              startTransition(async () => {
                await toggleChecklistItem(task.id, c.key);
              })
            }
          />
          {t(c.label)}
        </label>
      ))}
    </div>
  );

  return (
    <div
      className={cn(
        "rounded-[10px] border border-border px-4 py-3",
        closed ? "bg-surface-subtle" : "bg-surface"
      )}
    >
      <div className="flex items-start gap-3">
        <SeverityDot severity={sev} className="mt-[5px] h-[9px] w-[9px]" />
        <div className="flex-1 min-w-0">
          <div
            className={cn(
              "text-sm font-semibold",
              closed ? "text-ink-400 line-through" : "text-ink-900"
            )}
          >
            {title}
          </div>
          {((showDossier && task.dossierName) || task.legalSource) && (
            <div className="mt-0.5 text-xs text-ink-400 flex flex-wrap items-baseline gap-x-1.5">
              {showDossier && task.dossierName && <span>{task.dossierName}</span>}
              {showDossier && task.dossierName && task.legalSource && (
                <span aria-hidden>·</span>
              )}
              {task.legalSource && (
                <span className="font-mono">
                  {task.legalSource}
                  {task.basisDate &&
                    ` · ${t("tasksUi.basis")} ${formatDateNL(task.basisDate)}`}
                  {task.calculationVersion && ` · ${task.calculationVersion}`}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!closed && !task.deadlineConfirmed && task.kind === "statutory" && (
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await confirmDeadline(task.id);
                  toast.success(t("tasksUi.deadlineConfirmed"));
                })
              }
            >
              {t("tasksUi.confirmDeadline")}
            </Button>
          )}
          {onAction &&
            nexts.map((to) => (
              <Button key={to} size="sm" variant="ghost" onClick={() => onAction(to)}>
                {t(`tasksUi.to_${to}`)}
              </Button>
            ))}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <StatusBadge status={task.status} label={t(`taskStatus.${task.status}`)} />
          {task.dueDate && (
            <>
              <DateText iso={task.dueDate} className="text-ink-600" />
              {!closed && sev === "red" && (
                <span className="text-[11px] font-semibold text-[#B91C1C]">
                  {t("dashboard.deadlines.overdueTag")}
                </span>
              )}
              {!closed && sev === "amber" && (
                <span className="text-[11px] font-semibold text-[#B45309]">
                  {t("dashboard.deadlines.daysTag", { count: days })}
                </span>
              )}
            </>
          )}
        </div>
      </div>
      {checklist.length > 0 && (
        <div className="mt-2.5 ml-[21px] border-t border-hairline pt-2.5">
          {checklist.length > 4 ? (
            <details>
              <summary className="cursor-pointer text-[12.5px] font-[550] text-primary select-none">
                {t("tasksUi.subtasksDone", {
                  done: doneCount,
                  total: checklist.length,
                })}
              </summary>
              <div className="mt-2">{checklistItems}</div>
            </details>
          ) : (
            checklistItems
          )}
        </div>
      )}
    </div>
  );
}

function TransitionDialog({
  task,
  to,
  onClose,
}: {
  task: TaskForList | null;
  to: string | null;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [isPending, startTransition] = useTransition();
  const [method, setMethod] = useState("portal");
  const [note, setNote] = useState("");

  if (!task || !to) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t(`tasksUi.to_${to}`)}: {task.titleFree ?? t(task.titleKey)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("tasksUi.evidenceHint")}</p>
          <div className="space-y-2">
            <Label>{t("tasksUi.method")}</Label>
            <Select value={method} onValueChange={(v) => setMethod(v ?? "portal")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["portal", "letter", "phone", "email", "file_export", "internal"].map(
                  (m) => (
                    <SelectItem key={m} value={m}>
                      {t(`tasksUi.method_${m}`)}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("tasksUi.evidenceNote")}</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("tasksUi.evidencePlaceholder")}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={isPending || (to !== "done" && note.trim() === "")}
              onClick={() =>
                startTransition(async () => {
                  const res = await transitionTask({
                    taskId: task.id,
                    to: to as "prepared" | "submitted" | "confirmed" | "done",
                    method,
                    evidenceNote: note || undefined,
                  });
                  if (res.ok) {
                    toast.success(t("tasksUi.transitionDone"));
                    onClose();
                  } else {
                    toast.error(res.error);
                  }
                })
              }
            >
              {t("common.confirm")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
