import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { asc, count, eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { actors } from "@/lib/db/schema";

/**
 * Identity chokepoint (plan os-v1 W0). Nothing else in the codebase may
 * identify the user another way.
 *
 * Two modes, decided by deployment configuration, never by request input:
 * - "clerk": CLERK_SECRET_KEY is set. Sessions come from Clerk; actors are
 *   provisioned just-in-time and linked by clerkUserId.
 * - "dev":   no Clerk keys. Seeded demo identities, selectable via a
 *   cookie, with a permanent banner in the UI. Exists so invariants
 *   (roles, vier-ogen) are enforceable and testable before real keys
 *   arrive; the invariant checks themselves are identical in both modes.
 */

export type Actor = {
  id: string;
  name: string;
  email: string;
  role: "bewindvoerder" | "assistent";
  active: boolean;
};

export type AuthMode = "clerk" | "dev";

export function authMode(): AuthMode {
  return process.env.CLERK_SECRET_KEY ? "clerk" : "dev";
}

export const DEV_ACTOR_COOKIE = "frank-dev-actor";

/** Fixed ids so the dev cookie stays valid across reseeds. */
export const DEV_ACTORS: ReadonlyArray<{
  id: string;
  name: string;
  email: string;
  role: "bewindvoerder" | "assistent";
}> = [
  {
    id: "dev-jerome",
    name: "Jerome Ibanez",
    email: "jeromeibanez95@gmail.com",
    role: "bewindvoerder",
  },
  {
    id: "dev-sanne",
    name: "Sanne de Vries",
    email: "sanne@frank.demo",
    role: "bewindvoerder",
  },
  {
    id: "dev-timo",
    name: "Timo Bakker",
    email: "timo@frank.demo",
    role: "assistent",
  },
];

async function ensureDevActors(): Promise<void> {
  const db = getDb();
  const [{ n }] = await db.select({ n: count() }).from(actors);
  if (n > 0) return;
  await db
    .insert(actors)
    .values(DEV_ACTORS.map((a) => ({ ...a, active: true })))
    .onConflictDoNothing();
}

async function currentDevActor(): Promise<Actor> {
  await ensureDevActors();
  const db = getDb();
  const wanted = (await cookies()).get(DEV_ACTOR_COOKIE)?.value;
  if (wanted) {
    const row = await db.query.actors.findFirst({
      where: and(eq(actors.id, wanted), eq(actors.active, true)),
    });
    if (row) return row;
  }
  const fallback = await db.query.actors.findFirst({
    where: and(eq(actors.role, "bewindvoerder"), eq(actors.active, true)),
    orderBy: asc(actors.createdAt),
  });
  if (!fallback) throw new Error("no active bewindvoerder actor seeded");
  return fallback;
}

/**
 * Bootstrap rule for clerk mode: the very first actor ever created becomes
 * bewindvoerder (someone must be able to run the office); afterwards, new
 * sign-ins start as assistent unless allow-listed via
 * FRANK_BEWINDVOERDER_EMAILS (comma-separated). Promotion afterwards is a
 * managed, audited action on the Team page.
 */
function bootstrapRole(
  email: string,
  isFirstActor: boolean
): "bewindvoerder" | "assistent" {
  if (isFirstActor) return "bewindvoerder";
  const allow = (process.env.FRANK_BEWINDVOERDER_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.toLowerCase()) ? "bewindvoerder" : "assistent";
}

async function currentClerkActor(): Promise<Actor> {
  const { auth, currentUser } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) throw new Error("unauthenticated"); // middleware should prevent this
  const db = getDb();
  const existing = await db.query.actors.findFirst({
    where: eq(actors.clerkUserId, userId),
  });
  if (existing) return existing;

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    `${userId}@unknown.invalid`;
  const name =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || email;
  const [{ n }] = await db.select({ n: count() }).from(actors);
  const [row] = await db
    .insert(actors)
    .values({
      clerkUserId: userId,
      email,
      name,
      role: bootstrapRole(email, n === 0),
      active: true,
    })
    .onConflictDoNothing({ target: actors.clerkUserId })
    .returning();
  if (row) return row;
  // Concurrent first request created it; read it back.
  const raced = await db.query.actors.findFirst({
    where: eq(actors.clerkUserId, userId),
  });
  if (!raced) throw new Error("actor provisioning failed");
  return raced;
}

/** Request-scoped: every caller in one request sees the same actor. */
export const currentActor = cache(async (): Promise<Actor> => {
  return authMode() === "clerk" ? currentClerkActor() : currentDevActor();
});

export async function countActiveBewindvoerders(): Promise<number> {
  const db = getDb();
  const [{ n }] = await db
    .select({ n: count() })
    .from(actors)
    .where(and(eq(actors.role, "bewindvoerder"), eq(actors.active, true)));
  return n;
}

/** True when this deployment is an authenticated production environment.
 *  Hard gate for real-bank exports (Temujin review round 2). */
export function isProductionOffice(): boolean {
  return process.env.FRANK_PRODUCTION_OFFICE === "true";
}
