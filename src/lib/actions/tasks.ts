"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { taskEvents, tasks } from "@/lib/db/schema";
import { currentActor } from "@/lib/identity";
import { writeAudit } from "@/lib/audit";
import { refreshSignalsSafe } from "@/lib/signals";

const TRANSITIONS: Record<string, string[]> = {
  open: ["prepared", "done", "cancelled"],
  prepared: ["submitted", "done", "open", "cancelled"],
  submitted: ["confirmed", "prepared"],
  confirmed: [],
  done: [],
  cancelled: ["open"],
};

/**
 * Task state machine with evidence semantics (Temujin #9):
 * open → prepared → submitted → confirmed. Every transition records method,
 * performer, timestamp and optional evidence reference.
 */
export async function transitionTask(input: {
  taskId: string;
  to: "prepared" | "submitted" | "confirmed" | "done" | "cancelled" | "open";
  method?: string;
  evidenceNote?: string;
  evidenceDocumentId?: string;
  followUpDate?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const actor = await currentActor();
  const db = getDb();
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, input.taskId),
  });
  if (!task) return { ok: false, error: "not_found" };

  const allowed = TRANSITIONS[task.status] ?? [];
  if (!allowed.includes(input.to)) {
    return { ok: false, error: `invalid_transition:${task.status}->${input.to}` };
  }

  await db
    .update(tasks)
    .set({ status: input.to, updatedAt: new Date() })
    .where(eq(tasks.id, input.taskId));

  await db.insert(taskEvents).values({
    taskId: input.taskId,
    transition: `${task.status}->${input.to}`,
    method: input.method ?? null,
    performedBy: actor.id,
    evidenceNote: input.evidenceNote ?? null,
    evidenceDocumentId: input.evidenceDocumentId ?? null,
    followUpDate: input.followUpDate ?? null,
  });

  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "transition",
    entityType: "task",
    entityId: input.taskId,
    versionBefore: { status: task.status },
    versionAfter: { status: input.to },
    reason: input.evidenceNote,
  });

  if (task.dossierId) revalidatePath(`/dossiers/${task.dossierId}`);
  revalidatePath("/my-day");
  await refreshSignalsSafe();
  return { ok: true };
}

/** Human confirmation of a computed statutory deadline (Temujin #4). */
export async function confirmDeadline(
  taskId: string,
  overrideDueDate?: string,
  reason?: string
): Promise<void> {
  const actor = await currentActor();
  const db = getDb();
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) return;

  await db
    .update(tasks)
    .set({
      deadlineConfirmed: true,
      ...(overrideDueDate ? { dueDate: overrideDueDate } : {}),
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "update",
    entityType: "task",
    entityId: taskId,
    versionBefore: { dueDate: task.dueDate, deadlineConfirmed: false },
    versionAfter: {
      dueDate: overrideDueDate ?? task.dueDate,
      deadlineConfirmed: true,
    },
    reason: reason ?? "deadline confirmed by human review",
  });

  if (task.dossierId) revalidatePath(`/dossiers/${task.dossierId}`);
  revalidatePath("/my-day");
  await refreshSignalsSafe();
}

export async function toggleChecklistItem(
  taskId: string,
  itemKey: string
): Promise<void> {
  const actor = await currentActor();
  const db = getDb();
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task || !task.checklist) return;
  const next = task.checklist.map((c) =>
    c.key === itemKey ? { ...c, done: !c.done } : c
  );
  await db
    .update(tasks)
    .set({ checklist: next, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "update",
    entityType: "task",
    entityId: taskId,
    versionAfter: { checklist: next },
  });
  if (task.dossierId) revalidatePath(`/dossiers/${task.dossierId}`);
}

export async function createManualTask(
  dossierId: string | null,
  formData: FormData
): Promise<void> {
  const actor = await currentActor();
  const db = getDb();
  const [row] = await db
    .insert(tasks)
    .values({
      dossierId,
      titleKey: "tasks.manual",
      titleFree: String(formData.get("title") || "").trim(),
      kind: "manual",
      tier: "internal",
      dueDate: String(formData.get("dueDate") || "") || null,
      deadlineConfirmed: true,
      status: "open",
      assignee: actor.id,
    })
    .returning();
  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "create",
    entityType: "task",
    entityId: row.id,
    versionAfter: { title: row.titleFree },
  });
  if (dossierId) revalidatePath(`/dossiers/${dossierId}`);
  revalidatePath("/my-day");
}
