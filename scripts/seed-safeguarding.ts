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
import {
  dossiers,
  accounts,
  transactions,
  officeAccounts,
  actors,
} from "../src/lib/db/schema";

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
    `client scenario: ${inserted.length} inserted, ` +
      `${rows.length - inserted.length} already present ` +
      `(${dossier.firstName} ${dossier.lastName})`
  );

  // ---- Office scope (N5): Frank watching its own operators ----------------
  //
  // Registering the office's own IBAN is real configuration, not demo
  // trickery — without it the office detectors have nothing to compare
  // against and correctly stay silent. The transaction below IS synthetic:
  // a payment to that account categorised as something other than the fee,
  // which is exactly the shape the detector is meant to surface.
  const actor = await db.query.actors.findFirst({
    where: eq(actors.role, "bewindvoerder"),
  });

  const [office] = await db
    .insert(officeAccounts)
    .values({
      iban: "NL10FRNK0000000010",
      actorId: actor?.id ?? null,
      label: `${actor?.name ?? "Kantoor"} (kantoorrekening)`,
    })
    .onConflictDoNothing()
    .returning();
  if (office) console.log(`office account registered: ${office.label}`);

  const [officeTx] = await db
    .insert(transactions)
    .values({
      accountId: account.id,
      dossierId: dossier.id,
      bookingDate: "2026-08-14",
      amountCents: -75_000,
      counterpartyName: "Kantoorrekening",
      counterpartyIban: "NL10FRNK0000000010",
      description: "Overboeking",
      categoryKey: "overige_uitgaven", // NOT the fee category
      dedupeHash: "sg-demo-office-2026-08-14",
      reviewed: false,
    })
    .onConflictDoNothing()
    .returning();
  console.log(
    officeTx
      ? "office-scope scenario inserted"
      : "office-scope scenario already present"
  );
}

main();
