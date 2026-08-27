"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/identity";
import { writeAudit } from "@/lib/audit";
import { activateProcesses } from "@/lib/processes";

export type ActivationResult = {
  ok: boolean;
  created: number;
  /** True when scheduling failed — the caller's own work still succeeded. */
  degraded?: boolean;
  error?: string;
};

/**
 * Activate any process whose trigger has occurred, for one dossier.
 *
 * Called from the actions that CAUSE a trigger — recording an R&V period,
 * creating a dossier, a payment item breaching the machtiging threshold —
 * so a procedure starts when the thing that starts it happens, not when
 * someone remembers to open a page (Temujin PR-11 r2 #2).
 *
 * Idempotent: the unique index on (dossier, definition, source) means a
 * second call creates nothing, and every source key is non-null so the index
 * actually bites. The instance and its audit row are written in ONE
 * statement, so an activation can never exist unattributably.
 *
 * ON FAILURE (Temujin PR-11 r3 #2): the triggering action is NOT rolled back
 * — a dossier should not fail to be created because scheduling had trouble —
 * but the failure is never silent. It writes a durable audit row that the
 * reconciliation pass and the audit log both surface, and it returns
 * `degraded` so a caller that can tell the user, does. "The system
 * schedules" must not fail invisibly.
 */
export async function activateProcessesFor(
  dossierId: string,
  actorId: string
): Promise<ActivationResult> {
  try {
    const r = await activateProcesses(actorId, dossierId);
    return { ok: true, created: r.created.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(
      "[frank:processes] activation failed for dossier",
      dossierId,
      message
    );
    try {
      await writeAudit({
        actorId,
        actorType: "system",
        action: "update",
        entityType: "process_activation_failure",
        entityId: dossierId,
        versionAfter: { error: message },
        reason:
          "process activation failed — scheduling degraded, repair with the " +
          "reconciliation pass on /processes",
      });
    } catch {
      // Last resort: the console line above is the only remaining record.
    }
    return { ok: false, created: 0, degraded: true, error: "activation_failed" };
  }
}

/**
 * Reconciliation pass over the whole office.
 *
 * A repair mechanism, not the primary path: it catches anything the
 * event-triggered calls missed — an import, a direct DB change, an
 * activation that failed and left the audit row above.
 */
export async function activateProcessesAction(): Promise<ActivationResult> {
  const actor = await currentActor();
  if (!actor.active) return { ok: false, created: 0, error: "inactive_actor" };

  try {
    const r = await activateProcesses(actor.id);
    // One row PER DOSSIER EVALUATED (Temujin PR-11 r5). An office-wide
    // marker cleared every dossier at once — including a different client's
    // unresolved failure, or one recorded while the pass was still running.
    // `evaluatedAt` is when this dossier was looked at, not when the row was
    // written, so a concurrent failure survives the pass that missed it.
    for (const e of r.evaluated) {
      await writeAudit({
        actorId: actor.id,
        actorType: "human",
        action: "update",
        entityType: "process_activation_reconciled",
        entityId: e.dossierId,
        versionAfter: { evaluatedAt: e.evaluatedAt },
        reason: "reconciliation pass evaluated this dossier",
      });
    }
    revalidatePath("/processes");
    revalidatePath("/");
    return { ok: true, created: r.created.length };
  } catch (e) {
    console.error(
      "[frank:processes] reconciliation pass failed",
      e instanceof Error ? e.message : String(e)
    );
    return { ok: false, created: 0, degraded: true, error: "activation_failed" };
  }
}
