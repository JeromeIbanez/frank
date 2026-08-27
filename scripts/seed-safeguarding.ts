/**
 * Synthetic safeguarding scenario (plan os-v2 N6 — demo data only).
 *
 * The base seed contains no cash withdrawals at all, so the detector that
 * matters most — a spike against the client's OWN baseline — has nothing to
 * work with. This adds a realistic history for one client: several months of
 * modest, regular cash withdrawals, then a cluster well above that habit.
 *
 * The numbers are chosen so the case is unambiguous rather than marginal:
 * roughly €120 a month for three months, then €800 inside four days. Both the
 * ratio and the absolute floor are cleared comfortably, so the demo does not
 * depend on a threshold judgement call.
 *
 * Idempotent: transactions carry a stable dedupeHash, and the unique index on
 * (accountId, dedupeHash) means re-running changes nothing.
 *
 * Run: npx dotenv -e .env.local -- npx tsx scripts/seed-safeguarding.ts
 */
import { eq, and } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { dossiers, accounts, transactions } from "../src/lib/db/schema";

/** Baseline months must sit OUTSIDE the 30-day recent window. */
const BASELINE: { date: string; cents: number }[] = [
  { date: "2026-05-06", cents: 6_000 },
  { date: "2026-05-21", cents: 6_000 },
  { date: "2026-06-04", cents: 6_000 },
  { date: "2026-06-19", cents: 6_000 },
  { date: "2026-07-03", cents: 6_000 },
  { date: "2026-07-17", cents: 6_000 },
];

/** The cluster, inside the window. */
const SPIKE: { date: string; cents: number }[] = [
  { date: "2026-08-18", cents: 20_000 },
  { date: "2026-08-19", cents: 20_000 },
  { date: "2026-08-20", cents: 20_000 },
  { date: "2026-08-21", cents: 20_000 },
];

async function main() {
  const db = getDb();

  const dossier = await db.query.dossiers.findFirst({
    where: eq(dossiers.lastName, "Vermeulen"),
  });
  if (!dossier) throw new Error("expected a seeded dossier for Vermeulen");

  const account = await db.query.accounts.findFirst({
    where: and(eq(accounts.dossierId, dossier.id), eq(accounts.type, "beheer")),
  });
  if (!account) throw new Error("expected a beheer account");

  const rows = [...BASELINE, ...SPIKE].map((t) => ({
    accountId: account.id,
    dossierId: dossier.id,
    bookingDate: t.date,
    amountCents: -t.cents,
    counterpartyName: null,
    counterpartyIban: null,
    description: "Geldautomaat Rotterdam",
    categoryKey: null,
    dedupeHash: `sg-demo-${t.date}-${t.cents}`,
    reviewed: false,
  }));

  const inserted = await db
    .insert(transactions)
    .values(rows)
    .onConflictDoNothing()
    .returning();

  console.log(
    `safeguarding scenario: ${inserted.length} inserted, ` +
      `${rows.length - inserted.length} already present ` +
      `(${dossier.firstName} ${dossier.lastName})`
  );
}

main();
