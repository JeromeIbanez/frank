"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { rvPeriods } from "@/lib/db/schema";
import { currentActor } from "@/lib/identity";
import { canPerform } from "@/lib/domain/authz";
import { writeAudit } from "@/lib/audit";
import { activateProcessesFor } from "@/lib/actions/processes";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Record the court-set reporting period + bespreking facts for the R&V
 * (official LOV form fields). Explicit dossier facts — never inferred.
 * Upserts on (dossier, periodEnd); every change audited.
 */
export async function recordRvPeriod(
  dossierId: string,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const actor = await currentActor();
  // Court-period, discussion and signature facts are legal-position
  // statements for the filing — bewindvoerder-only (Temujin PR-7 gate A).
  if (!canPerform(actor, "rv_period_record").allowed)
    return { ok: false, error: "role_required" };
  const db = getDb();
  const periodStart = String(formData.get("periodStart") || "");
  const periodEnd = String(formData.get("periodEnd") || "");
  if (!ISO.test(periodStart) || !ISO.test(periodEnd) || periodStart >= periodEnd)
    return { ok: false, error: "invalid_period" };
  const besprekingDate = String(formData.get("besprekingDate") || "");
  const besprekingOutcome = String(formData.get("besprekingOutcome") || "");
  const signedStatus = String(formData.get("signedStatus") || "pending");
  const note = String(formData.get("note") || "").trim() || null;

  const values = {
    dossierId,
    periodStart,
    periodEnd,
    besprekingDate: ISO.test(besprekingDate) ? besprekingDate : null,
    besprekingOutcome: ["understood", "not_understood", "not_possible"].includes(
      besprekingOutcome
    )
      ? (besprekingOutcome as "understood" | "not_understood" | "not_possible")
      : null,
    signedStatus: ["signed", "declined", "pending"].includes(signedStatus)
      ? (signedStatus as "signed" | "declined" | "pending")
      : ("pending" as const),
    note,
  };
  const [row] = await db
    .insert(rvPeriods)
    .values(values)
    .onConflictDoUpdate({
      target: [rvPeriods.dossierId, rvPeriods.periodEnd],
      set: values,
    })
    .returning();
  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "update",
    entityType: "rv_period",
    entityId: row.id,
    versionAfter: values,
    reason: "court R&V period / bespreking recorded",
  });
  // The court set the period; the R&V process starts from it.
  // Scheduling must not fail invisibly: the period IS recorded either way,
  // but a degraded result is surfaced rather than swallowed.
  const scheduling = await activateProcessesFor(dossierId, actor.id);
  if (scheduling.degraded) {
    console.error(
      "[frank:rv] R&V period recorded but its process was not scheduled",
      dossierId
    );
  }
  revalidatePath(`/dossiers/${dossierId}`);
  return { ok: true };
}
