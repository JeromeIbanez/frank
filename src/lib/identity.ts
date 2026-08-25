/**
 * Auth stub — single implicit office + fixed demo identity.
 *
 * When real auth lands (e.g. Clerk), this module is the only place that
 * changes: `currentActor()` reads the session instead of returning the stub.
 * Nothing else in the codebase may identify the user another way.
 */
export type Actor = {
  id: string;
  name: string;
  role: "bewindvoerder" | "backoffice" | "admin";
};

export async function currentActor(): Promise<Actor> {
  return { id: "demo-user", name: "Demo bewindvoerder", role: "bewindvoerder" };
}

/** True when this deployment is an authenticated production environment.
 *  Hard gate for real-bank exports (Temujin review round 2). */
export function isProductionOffice(): boolean {
  return process.env.FRANK_PRODUCTION_OFFICE === "true";
}
