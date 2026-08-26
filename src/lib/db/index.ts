import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function createDb() {
  // The app runs as the restricted frank_app role (audit_events append-only
  // at the database level, plan os-v1 W0). Deployed environments FAIL
  // CLOSED: no DATABASE_URL_APP means no database — the owner URL is never
  // a silent fallback (Temujin PR-4 review P1-1). Local dev/tests may fall
  // back to DATABASE_URL so scripts and a fresh clone keep working.
  const appUrl = process.env.DATABASE_URL_APP;
  const deployed = !!process.env.VERCEL;
  if (!appUrl && deployed) {
    throw new Error(
      "DATABASE_URL_APP (restricted frank_app role) is required in deployed environments"
    );
  }
  const sql = neon(appUrl ?? process.env.DATABASE_URL!);
  return drizzle(sql, { schema });
}

let _db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (!_db) _db = createDb();
  return _db;
}

export type Db = ReturnType<typeof createDb>;
export * as schema from "./schema";
