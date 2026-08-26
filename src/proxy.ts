import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { resolveAuthMode } from "@/lib/auth-config";

/**
 * Auth boundary (plan os-v1 W0). Uses the SAME configuration predicate as
 * the identity layer (lib/auth-config.ts) — they can never disagree
 * (Temujin PR-4 round-2 #2). An invalid configuration (one Clerk key
 * without the other, or clerk mode without a bootstrap allowlist) throws
 * here at module load, failing every request fast instead of running
 * half-protected.
 *
 * clerk mode: every route except sign-in requires a session.
 * dev mode: requests pass through; identity comes from seeded dev actors.
 */

const isPublicRoute = createRouteMatcher(["/sign-in(.*)"]);

export default resolveAuthMode() === "clerk"
  ? clerkMiddleware(async (auth, req) => {
      if (!isPublicRoute(req)) await auth.protect();
    })
  : function proxy() {
      return NextResponse.next();
    };

export const config = {
  matcher: [
    // All routes except static assets and Next internals.
    "/((?!_next|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|woff2?|css|js|map)$).*)",
  ],
};
