import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function createDb() {
  // Runtime prefers the restricted frank_app role (audit_events append-only
  // at the database level, plan os-v1 W0); DATABASE_URL stays the owner and
  // is used by migrations/scripts only.
  const url = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL!;
  const sql = neon(url);
  return drizzle(sql, { schema });
}

let _db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (!_db) _db = createDb();
  return _db;
}

export type Db = ReturnType<typeof createDb>;
export * as schema from "./schema";
