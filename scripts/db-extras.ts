/** Applies drizzle/manual/*.sql (idempotent constraints drizzle-kit can't express). */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const dir = join(process.cwd(), "drizzle", "manual");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const content = readFileSync(join(dir, file), "utf-8");
    const statements = content
      .split(";")
      .map((s) =>
        s
          .split("\n")
          .filter((line) => !line.trim().startsWith("--"))
          .join("\n")
          .trim()
      )
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      await sql.query(stmt);
      console.log(`${file}: applied ${stmt.split("\n")[0].slice(0, 60)}…`);
    }
  }
  console.log("Manual constraints applied.");

  // Restricted app role (plan os-v1 W0): the running app connects as
  // frank_app, which cannot UPDATE/DELETE audit_events — append-only audit
  // enforced by the database, not by convention. Runs only when a password
  // is provided (FRANK_APP_DB_PASSWORD); DATABASE_URL must be the owner.
  const appPassword = process.env.FRANK_APP_DB_PASSWORD;
  if (appPassword) {
    const stmts = [
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'frank_app') THEN
           CREATE ROLE frank_app LOGIN;
         END IF;
       END $$`,
      `ALTER ROLE frank_app LOGIN PASSWORD '${appPassword.replace(/'/g, "''")}'`,
      `GRANT USAGE ON SCHEMA public TO frank_app`,
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO frank_app`,
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO frank_app`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO frank_app`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO frank_app`,
      // The point of the role: audit is append-only at the database level.
      `REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM frank_app`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM frank_app`,
    ];
    for (const stmt of stmts) await sql.query(stmt);
    console.log(
      "frank_app role configured (audit_events append-only for the app)."
    );
  } else {
    console.log(
      "FRANK_APP_DB_PASSWORD not set — skipped frank_app role setup."
    );
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
