import "server-only";

import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  dossiers,
  accounts,
  contacts,
  budgetLines,
  debts,
  rvPeriods,
  paymentItems,
} from "@/lib/db/schema";
import {
  PROCESS_DEFINITIONS,
  applicableProcesses,
  evaluateProcess,
  summariseProcesses,
  type EvaluatedProcess,
  type ProcessFacts,
  type ProcessDefinitionKey,
} from "@/lib/domain/processes";

/**
 * Process state, DERIVED rather than stored (plan os-v2 W3, with a
 * deliberate deviation).
 *
 * The plan called for `processes` and `process_steps` tables. I did not build
 * them, and the reason is the same one that kept the agent-activity panel off
 * a counter table: a stored step status is a second copy of something already
 * true elsewhere, and second copies drift. If `process_steps.status` says
 * "budgetplan done" and there are no budget lines, one of them is lying, and
 * the audit trail cannot say which.
 *
 * So the facts ARE the state. Every evaluation reads what is actually
 * recorded — accounts opened, contacts written to, debts inventoried, an R&V
 * period recorded — and computes step status from that. Nothing to migrate,
 * nothing to reconcile, and a step cannot be marked done by anything other
 * than the work itself being done.
 *
 * The cost is that this reads several tables per dossier. Fine at office
 * scale today; the first thing to revisit if the office grows, exactly as
 * with the safeguarding pass.
 */

export type DossierProcesses = {
  dossierId: string;
  dossierName: string;
  processes: EvaluatedProcess[];
};

function officeToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
  }).format(new Date());
}

/**
 * Observe the facts for every dossier in a handful of queries.
 *
 * Batched deliberately: the naive shape is one query per fact per dossier,
 * which is fine at 8 dossiers and indefensible at 400.
 */
async function observeFacts(
  dossierIds: string[],
  year: number
): Promise<Map<string, ProcessFacts>> {
  const db = getDb();
  const [
    accountRows,
    contactRows,
    budgetRows,
    debtRows,
    uncategorised,
    rvRows,
    machtigingRows,
    dossierRows,
  ] = await Promise.all([
    db
      .select({ dossierId: accounts.dossierId, type: accounts.type })
      .from(accounts)
      .where(inArray(accounts.dossierId, dossierIds)),
    db
      .select({ dossierId: contacts.dossierId, notified: contacts.notified })
      .from(contacts)
      .where(inArray(contacts.dossierId, dossierIds)),
    db
      .select({ dossierId: budgetLines.dossierId })
      .from(budgetLines)
      .where(inArray(budgetLines.dossierId, dossierIds)),
    db
      .select({ dossierId: debts.dossierId, status: debts.status })
      .from(debts)
      .where(inArray(debts.dossierId, dossierIds)),
    db.execute<{ dossier_id: string; n: number }>(sql`
      SELECT dossier_id, COUNT(*)::int AS n
        FROM transactions
       WHERE category_key IS NULL
       GROUP BY dossier_id
    `),
    db
      .select()
      .from(rvPeriods)
      .where(inArray(rvPeriods.dossierId, dossierIds)),
    db
      .select({
        dossierId: paymentItems.dossierId,
        flag: paymentItems.machtigingFlag,
      })
      .from(paymentItems)
      .where(inArray(paymentItems.dossierId, dossierIds)),
    db
      .select({
        id: dossiers.id,
        inboedelNote: dossiers.inboedelNote,
        pvaGoals: dossiers.pvaGoals,
      })
      .from(dossiers)
      .where(inArray(dossiers.id, dossierIds)),
  ]);

  const uncategorisedBy = new Map(
    (uncategorised.rows ?? []).map((r) => [r.dossier_id, Number(r.n)])
  );
  const out = new Map<string, ProcessFacts>();

  for (const id of dossierIds) {
    const accs = accountRows.filter((a) => a.dossierId === id);
    const dbts = debtRows.filter((d) => d.dossierId === id);
    const rv = rvRows.filter(
      (r) => r.dossierId === id && r.periodEnd.startsWith(String(year))
    );
    const mach = machtigingRows.filter((m) => m.dossierId === id);
    const d = dossierRows.find((x) => x.id === id);

    out.set(id, {
      beheerrekening_geopend: accs.some((a) => a.type === "beheer"),
      leefgeldrekening_geopend: accs.some((a) => a.type === "leefgeld"),
      instanties_aangeschreven: contactRows.some(
        (c) => c.dossierId === id && c.notified
      ),
      budgetplan_opgesteld: budgetRows.some((b) => b.dossierId === id),
      schulden_geinventariseerd: dbts.length > 0,
      regelingen_getroffen: dbts.some((x) => x.status === "regeling"),
      boedelbeschrijving_vastgelegd: Boolean(d?.inboedelNote),
      plan_van_aanpak_vastgelegd: Boolean(d?.pvaGoals),
      rv_periode_vastgelegd: rv.length > 0,
      // "Complete" means nothing is left uncategorised — the honest reading,
      // and one that reverts to false if an import adds new rows.
      transacties_gecategoriseerd: (uncategorisedBy.get(id) ?? 0) === 0,
      rv_bespreking_vastgelegd: rv.some((r) => r.besprekingDate !== null),
      rv_ondertekend: rv.some((r) => r.signedStatus === "signed"),
      machtiging_drempel_bereikt: mach.some((m) => m.flag?.triggered === true),
      machtiging_verzoek_opgesteld: mach.some(
        (m) => m.flag?.resolution !== undefined && m.flag?.resolution !== null
      ),
      machtiging_beschikking_vastgelegd: mach.some(
        (m) => m.flag?.resolution === "court_authorization"
      ),
      eindrekening_opgesteld: false, // no source yet; abstains rather than guesses
    });
  }
  return out;
}

/** The whole office's processes, evaluated. */
export async function officeProcesses(): Promise<{
  rows: DossierProcesses[];
  summary: ReturnType<typeof summariseProcesses>;
}> {
  const db = getDb();
  const today = officeToday();
  const year = Number(today.slice(0, 4));

  const ds = await db
    .select({
      id: dossiers.id,
      firstName: dossiers.firstName,
      lastName: dossiers.lastName,
      schuldenbewind: dossiers.schuldenbewind,
      startDate: dossiers.startDate,
      endDate: dossiers.endDate,
      status: dossiers.status,
    })
    .from(dossiers);

  const live = ds.filter((d) => d.status !== "afgesloten");
  if (live.length === 0)
    return { rows: [], summary: summariseProcesses([]) };

  const facts = await observeFacts(
    live.map((d) => d.id),
    year
  );

  const rows: DossierProcesses[] = live.map((d) => {
    const f = facts.get(d.id) ?? {};
    const keys = applicableProcesses(
      { schuldenbewind: d.schuldenbewind, endDate: d.endDate },
      f
    );
    return {
      dossierId: d.id,
      dossierName: `${d.firstName} ${d.lastName}`,
      processes: keys.map((k: ProcessDefinitionKey) =>
        evaluateProcess({
          definition: PROCESS_DEFINITIONS[k],
          facts: f,
          // Intake runs from the start of the measure; the others from the
          // start of the current court year. A dossier with no recorded
          // start date falls back to the year, and the UI says so rather
          // than presenting a derived deadline as if it were court-set.
          startDate:
            k === "intake" && d.startDate ? d.startDate : `${year}-01-01`,
          today,
        })
      ),
    };
  });

  return {
    rows,
    summary: summariseProcesses(rows.flatMap((r) => r.processes)),
  };
}

/** Processes for one dossier, for the dossier page. */
export async function dossierProcesses(
  dossierId: string
): Promise<EvaluatedProcess[]> {
  const db = getDb();
  const today = officeToday();
  const year = Number(today.slice(0, 4));
  const d = await db.query.dossiers.findFirst({
    where: eq(dossiers.id, dossierId),
  });
  if (!d) return [];
  const facts = (await observeFacts([dossierId], year)).get(dossierId) ?? {};
  return applicableProcesses(
    { schuldenbewind: d.schuldenbewind, endDate: d.endDate },
    facts
  ).map((k) =>
    evaluateProcess({
      definition: PROCESS_DEFINITIONS[k],
      facts,
      startDate: k === "intake" && d.startDate ? d.startDate : `${year}-01-01`,
      today,
    })
  );
}
