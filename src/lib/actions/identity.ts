"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { actors } from "@/lib/db/schema";
import {
  DEV_ACTOR_COOKIE,
  authMode,
  countActiveBewindvoerders,
  currentActor,
} from "@/lib/identity";
import { canChangeActor } from "@/lib/domain/authz";
import { writeAudit } from "@/lib/audit";

/** Dev-mode only: pick one of the seeded demo identities. */
export async function switchDevActor(actorId: string): Promise<void> {
  if (authMode() !== "dev") return;
  const db = getDb();
  const row = await db.query.actors.findFirst({
    where: and(eq(actors.id, actorId), eq(actors.active, true)),
  });
  if (!row) return;
  (await cookies()).set(DEV_ACTOR_COOKIE, actorId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}

export type ActorChangeResult =
  | { ok: true }
  | { ok: false; error: string };

async function applyActorChange(
  targetId: string,
  change: { role?: "bewindvoerder" | "assistent"; active?: boolean }
): Promise<ActorChangeResult> {
  const manager = await currentActor();
  const db = getDb();
  const target = await db.query.actors.findFirst({
    where: eq(actors.id, targetId),
  });
  if (!target) return { ok: false, error: "not_found" };
  const verdict = canChangeActor(
    manager,
    target,
    change,
    await countActiveBewindvoerders()
  );
  if (!verdict.allowed) return { ok: false, error: verdict.reason };
  await db.update(actors).set(change).where(eq(actors.id, targetId));
  await writeAudit({
    actorId: manager.id,
    actorType: "human",
    action: "update",
    entityType: "actor",
    entityId: targetId,
    versionBefore: { role: target.role, active: target.active },
    versionAfter: {
      role: change.role ?? target.role,
      active: change.active ?? target.active,
    },
    reason: "team management",
  });
  revalidatePath("/team");
  return { ok: true };
}

export async function setActorRole(
  targetId: string,
  role: "bewindvoerder" | "assistent"
): Promise<ActorChangeResult> {
  return applyActorChange(targetId, { role });
}

export async function setActorActive(
  targetId: string,
  active: boolean
): Promise<ActorChangeResult> {
  return applyActorChange(targetId, { active });
}
