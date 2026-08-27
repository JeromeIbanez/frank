"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dossiers, timeEntries } from "@/lib/db/schema";
import { currentActor } from "@/lib/identity";
import { canPerform } from "@/lib/domain/authz";
import { writeAudit } from "@/lib/audit";
import { isActivityKey, isFeeCategory } from "@/lib/domain/fees";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Log time (plan os-v1 W5). `source: "suggested"` records that the entry
 * came from a post-action suggestion the human accepted — Frank offers,
 * never auto-logs.
 */
export async function logTime(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const actor = await currentActor();
  const db = getDb();
  const minutes = Number(formData.get("minutes"));
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 24 * 60)
    return { ok: false, error: "invalid_minutes" };
  const activityKey = String(formData.get("activityKey") || "overig");
  if (!isActivityKey(activityKey))
    return { ok: false, error: "invalid_activity" };
  const date = String(formData.get("date") || "");
  const source = String(formData.get("source") || "manual");
  const dossierId = String(formData.get("dossierId") || "") || null;

  const [row] = await db
    .insert(timeEntries)
    .values({
      dossierId,
      actorId: actor.id,
      date: ISO.test(date) ? date : new Date().toISOString().slice(0, 10),
      minutes,
      activityKey,
      note: String(formData.get("note") || "").trim() || null,
      source: source === "suggested" ? "suggested" : "manual",
    })
    .returning();
  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "create",
    entityType: "time_entry",
    entityId: row.id,
    versionAfter: { minutes, activityKey, dossierId, source: row.source },
  });
  if (dossierId) revalidatePath(`/dossiers/${dossierId}`);
  revalidatePath("/office");
  return { ok: true };
}

export async function deleteTimeEntry(
  entryId: string
): Promise<{ ok: boolean; error?: string }> {
  const actor = await currentActor();
  const db = getDb();
  const entry = await db.query.timeEntries.findFirst({
    where: eq(timeEntries.id, entryId),
  });
  if (!entry) return { ok: false, error: "not_found" };
  // Own entries only — time records are personal statements of work.
  if (entry.actorId !== actor.id) return { ok: false, error: "not_owner" };
  await db.delete(timeEntries).where(eq(timeEntries.id, entryId));
  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "delete",
    entityType: "time_entry",
    entityId: entryId,
    versionBefore: {
      minutes: entry.minutes,
      activityKey: entry.activityKey,
      date: entry.date,
    },
  });
  if (entry.dossierId) revalidatePath(`/dossiers/${entry.dossierId}`);
  revalidatePath("/office");
  return { ok: true };
}

/**
 * Override the beloning category for a dossier. The category is normally
 * derived from regime + schuldenbewind; an override is a legal-position
 * change, so it is bewindvoerder-only and REQUIRES a reason (audited).
 */
export async function setFeeCategory(
  dossierId: string,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const actor = await currentActor();
  if (!canPerform(actor, "fee_category_override").allowed)
    return { ok: false, error: "role_required" };
  const db = getDb();
  const dossier = await db.query.dossiers.findFirst({
    where: eq(dossiers.id, dossierId),
  });
  if (!dossier) return { ok: false, error: "not_found" };
  const raw = String(formData.get("feeCategory") || "").trim();
  const reason = String(formData.get("reason") || "").trim();
  if (raw && !isFeeCategory(raw)) return { ok: false, error: "invalid_category" };
  if (raw && !reason) return { ok: false, error: "reason_required" };

  await db
    .update(dossiers)
    .set({
      feeCategory: raw || null,
      feeCategoryReason: raw ? reason : null,
      updatedAt: new Date(),
    })
    .where(eq(dossiers.id, dossierId));
  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "update",
    entityType: "dossier",
    entityId: dossierId,
    versionBefore: {
      feeCategory: dossier.feeCategory,
      feeCategoryReason: dossier.feeCategoryReason,
    },
    versionAfter: { feeCategory: raw || null, feeCategoryReason: reason || null },
    reason: raw
      ? `beloning category override: ${raw} — ${reason}`
      : "beloning category override removed (back to derived)",
  });
  revalidatePath(`/dossiers/${dossierId}`);
  revalidatePath("/office");
  return { ok: true };
}

export async function myTimeToday(): Promise<number> {
  const actor = await currentActor();
  const today = new Date().toISOString().slice(0, 10);
  const rows = await getDb().query.timeEntries.findMany({
    where: and(eq(timeEntries.actorId, actor.id), eq(timeEntries.date, today)),
  });
  return rows.reduce((s, r) => s + r.minutes, 0);
}
