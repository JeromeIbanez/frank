/**
 * THE auth configuration predicate (Temujin PR-4 round-2 #1/#2). Identity
 * (lib/identity.ts) and route protection (src/proxy.ts) both use this one
 * function, so they can never disagree about the mode. Invalid
 * configurations throw — every request fails fast rather than running
 * half-protected:
 *
 * - one Clerk key without the other → throw (a partial env must never
 *   silently fall back to public dev mode or run unprotected);
 * - clerk mode with an empty FRANK_BEWINDVOERDER_EMAILS → throw (only a
 *   bewindvoerder can manage roles, so an office bootstrapped without one
 *   would be unmanageable through the app).
 *
 * Edge-safe: no imports, reads env only.
 */

export type AuthMode = "clerk" | "dev";

export function bewindvoerderAllowlist(): string[] {
  return (process.env.FRANK_BEWINDVOERDER_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function resolveAuthMode(): AuthMode {
  const hasSecret = !!process.env.CLERK_SECRET_KEY;
  const hasPublishable = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (hasSecret !== hasPublishable) {
    throw new Error(
      "Clerk misconfigured: set both CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, or neither."
    );
  }
  if (hasSecret && bewindvoerderAllowlist().length === 0) {
    throw new Error(
      "Clerk mode requires FRANK_BEWINDVOERDER_EMAILS with at least one bootstrap bewindvoerder email."
    );
  }
  return hasSecret ? "clerk" : "dev";
}
