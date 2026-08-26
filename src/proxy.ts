import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Auth boundary (plan os-v1 W0). With Clerk keys configured, every route
 * except sign-in requires a session. Without keys (dev mode) requests pass
 * through and identity comes from seeded dev actors — see lib/identity.ts.
 * The mode is decided by deployment configuration only.
 */

const isPublicRoute = createRouteMatcher(["/sign-in(.*)"]);

const hasClerk =
  !!process.env.CLERK_SECRET_KEY &&
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default hasClerk
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
