"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/identity";
import { writeAudit } from "@/lib/audit";
import { activateProcesses } from "@/lib/processes";

/**
 * Human-triggered activation pass.
 *
 * Creating a process instance is a durable record of when a procedure began
 * and why, so it is audited. It is idempotent — the unique index on
 * (dossier, definition, source) means a second press creates nothing.
 */
export async function activateProcessesAction(): Promise<{
  ok: boolean;
  created: number;
  error?: string;
}> {
  const actor = await currentActor();
  if (!actor.active) return { ok: false, created: 0, error: "inactive_actor" };

  const r = await activateProcesses();
  if (r.created > 0) {
    await writeAudit({
      actorId: actor.id,
      actorType: "human",
      action: "create",
      entityType: "process_instance",
      entityId: `batch:${r.created}`,
      versionAfter: { created: r.created },
      reason: "process instances activated from their recorded triggers",
    });
  }
  revalidatePath("/processes");
  revalidatePath("/");
  return { ok: true, created: r.created };
}
