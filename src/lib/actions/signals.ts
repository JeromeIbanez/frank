"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { signals } from "@/lib/db/schema";
import { currentActor } from "@/lib/identity";
import { writeAudit } from "@/lib/audit";
import { refreshSignals } from "@/lib/signals";

/** Explicit refresh from the Today screen. */
export async function refreshSignalsAction(): Promise<{
  open: number;
  resolved: number;
}> {
  const result = await refreshSignals();
  revalidatePath("/");
  return result;
}

/**
 * Dismiss one signal — a human judgment call ("seen it, not actionable"),
 * so it requires a reason and is audited. The signal reopens only if its
 * condition clears and later recurs (lifecycle in domain/signals.ts).
 */
export async function dismissSignal(
  signalId: string,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  const actor = await currentActor();
  if (!reason.trim()) return { ok: false, error: "reason_required" };
  const db = getDb();
  const row = await db.query.signals.findFirst({
    where: eq(signals.id, signalId),
  });
  if (!row) return { ok: false, error: "not_found" };
  if (row.status !== "open") return { ok: false, error: "not_open" };
  const now = new Date();
  await db
    .update(signals)
    .set({
      status: "dismissed",
      dismissedBy: actor.id,
      dismissedReason: reason.trim(),
      dismissedAt: now,
    })
    .where(eq(signals.id, signalId));
  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "update",
    entityType: "signal",
    entityId: signalId,
    versionBefore: { status: "open", detectorKey: row.detectorKey },
    versionAfter: { status: "dismissed", dedupeKey: row.dedupeKey },
    reason: `signal dismissed: ${reason.trim()}`,
  });
  revalidatePath("/");
  return { ok: true };
}
