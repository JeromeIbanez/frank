import { asc, eq } from "drizzle-orm";
import { UserButton } from "@clerk/nextjs";
import { getDb } from "@/lib/db";
import { actors } from "@/lib/db/schema";
import { authMode, currentActor } from "@/lib/identity";
import { DevActorSwitcher } from "./dev-actor-switcher";

/**
 * Topbar identity control. Clerk mode: the real account menu (sign out
 * lives there). Dev mode: an explicitly labeled demo-identity switcher —
 * it exists so role/vier-ogen invariants are exercisable before Clerk keys
 * arrive, and is unavailable once Clerk is configured.
 */
export async function IdentityControl() {
  if (authMode() === "clerk") {
    return <UserButton />;
  }
  const db = getDb();
  const [rows, actor] = await Promise.all([
    db.query.actors.findMany({
      where: eq(actors.active, true),
      orderBy: asc(actors.createdAt),
    }),
    currentActor(),
  ]);
  return (
    <DevActorSwitcher
      actors={rows.map((r) => ({ id: r.id, name: r.name, role: r.role }))}
      currentId={actor.id}
    />
  );
}
