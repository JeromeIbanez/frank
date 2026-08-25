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
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
