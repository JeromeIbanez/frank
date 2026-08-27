"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/identity";
import { writeAudit } from "@/lib/audit";
import { activateProcesses } from "@/lib/processes";

/**
 * Activate any process whose trigger has occurred.
 *
 * Called from the actions that CAUSE a trigger — recording an R&V period,
 * creating a dossier, a payment item breaching the machtiging threshold —
 * so a procedure starts when the thing that starts it happens, not when
 * someone remembers to open a page (Temujin PR-11 r2 #2).
 *
 * Idempotent: the unique index on (dossier, definition, source) means a
 * second call creates nothing, and every source key is non-null so the index
 * actually bites.
 */
export async function activateProcessesFor(
  dossierId: string,
  actorId: string
): Promise<number> {
  try {
    const r = await activateProcesses(dossierId);
    await auditActivations(r.created, actorId);
    return r.created.length;
  } catch {
    // Activation must never break the action that triggered it. A missed
    // instance is repaired by the reconciliation pass below.
    return 0;
  }
}

/**
 * One audit row PER INSTANCE, referencing its real id.
 *
 * An earlier version wrote a single `batch:<n>` row, which is not an entity
 * and cannot establish who activated a particular process (Temujin PR-11
 * r2 #3). A deadline that traces to an activation needs the activation to be
 * attributable.
 */
async function auditActivations(
  created: { id: string; dossierId: string; definitionKey: string; startedOn: string; startSource: string }[],
  actorId: string
): Promise<void> {
  for (const i of created) {
    await writeAudit({
      actorId,
      actorType: "human",
      action: "create",
      entityType: "process_instance",
      entityId: i.id,
      versionAfter: {
        dossierId: i.dossierId,
        definitionKey: i.definitionKey,
        startedOn: i.startedOn,
        startSource: i.startSource,
      },
      reason: `process activated from ${i.startSource}`,
    });
  }
}

/**
 * Reconciliation pass over the whole office.
 *
 * Kept as a repair mechanism, not the primary path: it catches anything the
 * event-triggered calls missed (an import, a direct DB change, a bug).
 */
export async function activateProcessesAction(): Promise<{
  ok: boolean;
  created: number;
  error?: string;
}> {
  const actor = await currentActor();
  if (!actor.active) return { ok: false, created: 0, error: "inactive_actor" };

  const r = await activateProcesses();
  await auditActivations(r.created, actor.id);
  revalidatePath("/processes");
  revalidatePath("/");
  return { ok: true, created: r.created.length };
}
