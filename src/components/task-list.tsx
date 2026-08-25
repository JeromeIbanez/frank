"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
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
import { SeverityDot, StatusBadge } from "@/components/format";
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
    <div className="space-y-1.5">
      {active.length === 0 && (
        <p className="text-sm text-neutral-500 py-2">{t("tasksUi.none")}</p>
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
        <details className="pt-2">
          <summary className="text-sm text-neutral-500 cursor-pointer">
            {t("tasksUi.completed", { count: closed.length })}
          </summary>
          <div className="mt-1.5 space-y-1.5 opacity-60">
            {closed.map((task) => (
              <TaskRow key={task.id} task={task} today={today} showDossier={showDossier} />
            ))}
          </div>
        </details>
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
}: {
  task: TaskForList;
  today: string;
  showDossier?: boolean;
  onAction?: (to: string) => void;
}) {
  const t = useTranslations();
  const [isPending, startTransition] = useTransition();
  const sev = task.dueDate
    ? severity(task.dueDate, today, task.deadlineConfirmed)
    : "green";
  const title = task.titleFree ?? t(task.titleKey);
  const nexts = NEXT_TRANSITIONS[task.status] ?? [];

  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5">
      <div className="flex items-center gap-3">
        <SeverityDot severity={sev} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{title}</div>
          <div className="text-xs text-neutral-500 flex flex-wrap items-center gap-x-2">
            {showDossier && task.dossierName && <span>{task.dossierName}</span>}
            {task.dueDate && (
              <span className="tabular-nums">
                {t("tasksUi.due")} {task.dueDate}
              </span>
            )}
            {task.legalSource && (
              <span
                className="text-neutral-400"
                title={`${t("tasksUi.basis")}: ${task.basisDate} · ${task.calculationVersion}`}
              >
                {task.legalSource}
              </span>
            )}
            <span className="uppercase text-[10px] tracking-wide text-neutral-400">
              {task.tier}
            </span>
          </div>
        </div>
        {!task.deadlineConfirmed && task.kind === "statutory" && (
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
        <StatusBadge status={task.status} label={t(`taskStatus.${task.status}`)} />
        {onAction &&
          nexts.map((to) => (
            <Button key={to} size="sm" variant="ghost" onClick={() => onAction(to)}>
              {t(`tasksUi.to_${to}`)}
            </Button>
          ))}
      </div>
      {task.checklist && task.checklist.length > 0 && (
        <div className="mt-2 ml-5 space-y-1">
          {task.checklist.map((c) => (
            <label key={c.key} className="flex items-center gap-2 text-sm text-neutral-600">
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
          <p className="text-sm text-neutral-500">{t("tasksUi.evidenceHint")}</p>
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
