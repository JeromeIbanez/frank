import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { asc, count, eq, and, inArray } from "drizzle-orm";
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

/** Ids the dev mode may ever impersonate (Temujin PR-4 review P2-4): the
 *  cookie, the switcher, and the fallback are all pinned to this set, so a
 *  database that also holds non-demo actors can never be impersonated. */
export const DEV_ACTOR_IDS = DEV_ACTORS.map((a) => a.id);

async function ensureDevActors(): Promise<void> {
  // Idempotent per actor — not gated on the table being empty.
  await getDb()
    .insert(actors)
    .values(DEV_ACTORS.map((a) => ({ ...a, active: true })))
    .onConflictDoNothing({ target: actors.id });
}

async function currentDevActor(): Promise<Actor> {
  await ensureDevActors();
  const db = getDb();
  const wanted = (await cookies()).get(DEV_ACTOR_COOKIE)?.value;
  if (wanted && DEV_ACTOR_IDS.includes(wanted)) {
    const row = await db.query.actors.findFirst({
      where: and(eq(actors.id, wanted), eq(actors.active, true)),
    });
    if (row) return row;
  }
  const fallback = await db.query.actors.findFirst({
    where: and(
      inArray(actors.id, DEV_ACTOR_IDS),
      eq(actors.role, "bewindvoerder"),
      eq(actors.active, true)
    ),
    orderBy: asc(actors.createdAt),
  });
  if (!fallback) throw new Error("no active dev bewindvoerder actor seeded");
  return fallback;
}

/**
 * Bootstrap rule for clerk mode (Temujin PR-4 review P1-2): the role is a
 * pure function of the VERIFIED primary email against the
 * FRANK_BEWINDVOERDER_EMAILS allowlist — never of arrival order, so
 * concurrent first sign-ins cannot race into privilege. With an empty
 * allowlist every sign-in starts as assistent (fail closed) until roles
 * are granted on the audited Team page.
 */
function bootstrapRole(
  email: string,
  emailVerified: boolean
): "bewindvoerder" | "assistent" {
  if (!emailVerified) return "assistent";
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
  const primary = user?.primaryEmailAddress;
  const email =
    primary?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    `${userId}@unknown.invalid`;
  const name =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || email;
  const [row] = await db
    .insert(actors)
    .values({
      clerkUserId: userId,
      email,
      name,
      role: bootstrapRole(
        email,
        primary?.verification?.status === "verified"
      ),
      active: true,
    })
    .onConflictDoNothing({ target: actors.clerkUserId })
    .returning();
  if (row) return row;
  // A concurrent request for the SAME user created it; read it back.
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
