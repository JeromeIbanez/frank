import "server-only";

import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  dossiers,
  accounts,
  contacts,
  debts,
  rvPeriods,
  paymentItems,
  tasks,
  processInstances,
} from "@/lib/db/schema";
import {
  PROCESS_DEFINITIONS,
  PROCESS_DEFINITION_VERSION,
  evaluateProcess,
  summariseProcesses,
  type EvaluatedProcess,
  type ProcessFacts,
  type ProcessDefinitionKey,
} from "@/lib/domain/processes";

/**
 * Process state: ACTIVATION is stored, STEP STATUS is derived.
 *
 * The plan asked for `processes` and `process_steps`. I built the first and
 * refused the second, and Temujin agreed with the split (PR-11 r1 #1).
 *
 *  - A stored step status is a second copy of something already true
 *    elsewhere. If it said "budgetplan done" with no budget lines, one of
 *    them is lying and the audit cannot say which. So steps are recomputed
 *    from what is recorded, and a step is done because the work is done.
 *
 *  - Activation cannot be derived. When a process began, and from what, is a
 *    fact in its own right — and getting it wrong fabricates deadlines. An
 *    earlier version dated every non-intake process from 1 January, which
 *    invented due dates out of the calendar. `process_instances` records the
 *    date and its source, immutably.
 */

export type ProcessRow = EvaluatedProcess & {
  instanceId: string;
  startedOn: string;
  startSource: string;
  /** Present for R&V: the court-set period this instance belongs to. */
  periodLabel?: string;
};

export type DossierProcesses = {
  dossierId: string;
  dossierName: string;
  processes: ProcessRow[];
};

function officeToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
  }).format(new Date());
}

/** Task statuses that count as an explicit, auditable completion. */
const TASK_DONE: readonly string[] = ["done", "confirmed"];

/**
 * Observe the facts.
 *
 * WHAT CHANGED AFTER REVIEW (Temujin PR-11 r1 #2, #3)
 * ---------------------------------------------------
 * Several observations were inferences dressed as evidence:
 *
 *  - "one contact is marked notified" is not the agencies having been
 *    written to, and "a budget line exists" is not a budget plan. Both now
 *    rest on the corresponding playbook TASK being done or confirmed — an
 *    explicit act by a named person with an audit row, which is the kind of
 *    evidence a step being "done" should rest on.
 *  - "a debt row exists" is not an inventory being complete. Same fix.
 *  - R&V facts were filtered by YEAR, so a bespreking from one period could
 *    combine with a signature from another, and transaction categorisation
 *    was measured across the dossier's whole history. Every R&V fact is now
 *    scoped to ONE period record, transaction window included.
 */
async function observeDossierFacts(
  dossierIds: string[]
): Promise<Map<string, ProcessFacts>> {
  const db = getDb();
  const [accountRows, contactRows, debtRows, taskRows, machtigingRows, dossierRows] =
    await Promise.all([
      db
        .select({ dossierId: accounts.dossierId, type: accounts.type })
        .from(accounts)
        .where(inArray(accounts.dossierId, dossierIds)),
      db
        .select({ dossierId: contacts.dossierId, notified: contacts.notified })
        .from(contacts)
        .where(inArray(contacts.dossierId, dossierIds)),
      db
        .select({ dossierId: debts.dossierId, status: debts.status })
        .from(debts)
        .where(inArray(debts.dossierId, dossierIds)),
      db
        .select({
          dossierId: tasks.dossierId,
          playbookKey: tasks.playbookKey,
          status: tasks.status,
        })
        .from(tasks)
        .where(inArray(tasks.dossierId, dossierIds)),
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

  const taskDone = (dossierId: string, key: string) =>
    taskRows.some(
      (t) =>
        t.dossierId === dossierId &&
        t.playbookKey === key &&
        TASK_DONE.includes(t.status)
    );

  const out = new Map<string, ProcessFacts>();
  for (const id of dossierIds) {
    const accs = accountRows.filter((a) => a.dossierId === id);
    const dbts = debtRows.filter((d) => d.dossierId === id);
    const mach = machtigingRows.filter((m) => m.dossierId === id);
    const cts = contactRows.filter((c) => c.dossierId === id);
    const d = dossierRows.find((x) => x.id === id);

    out.set(id, {
      // Unambiguous: the account either exists or it does not.
      beheerrekening_geopend: accs.some((a) => a.type === "beheer"),
      leefgeldrekening_geopend: accs.some((a) => a.type === "leefgeld"),

      // Explicit completion, not a partial signal. The task is the evidence;
      // "every known contact notified" is corroboration, not a substitute.
      instanties_aangeschreven:
        taskDone(id, "aanschrijven_instanties") ||
        (cts.length > 0 && cts.every((c) => c.notified)),
      budgetplan_opgesteld: taskDone(id, "budgetplan_opstellen"),
      schulden_geinventariseerd: taskDone(id, "schulden_inventarisatie"),

      // A human wrote these werkdocument sections; that IS the record.
      boedelbeschrijving_vastgelegd: Boolean(d?.inboedelNote),
      plan_van_aanpak_vastgelegd: Boolean(d?.pvaGoals),

      // Arrangements are "made" only when nothing is still sitting untouched.
      regelingen_getroffen:
        dbts.length > 0 &&
        dbts.some((x) => x.status === "regeling") &&
        !dbts.some((x) => x.status === "open"),

      machtiging_drempel_bereikt: mach.some((m) => m.flag?.triggered === true),
      // A human resolved the guard and recorded a ground. That is ALL this
      // claims — not that a beschikking is on file, which Frank never stores.
      machtiging_afgehandeld: mach.some(
        (m) => m.flag?.triggered === true && Boolean(m.flag?.resolution)
      ),
    });
  }
  return out;
}

/** R&V facts for one court-set period, scoped to that period alone. */
async function observeRvFacts(periodIds: string[]): Promise<Map<string, ProcessFacts>> {
  const db = getDb();
  const out = new Map<string, ProcessFacts>();
  if (periodIds.length === 0) return out;

  const rows = await db
    .select()
    .from(rvPeriods)
    .where(inArray(rvPeriods.id, periodIds));

  for (const row of rows) {
    const uncat = await db.execute<{ n: number }>(sql`
      SELECT COUNT(*)::int AS n
        FROM transactions
       WHERE dossier_id = ${row.dossierId}
         AND category_key IS NULL
         AND booking_date >= ${row.periodStart}
         AND booking_date <= ${row.periodEnd}
    `);
    out.set(row.id, {
      // The instance exists BECAUSE the period was recorded.
      rv_periode_vastgelegd: true,
      transacties_gecategoriseerd: Number(uncat.rows?.[0]?.n ?? 0) === 0,
      rv_bespreking_vastgelegd: row.besprekingDate !== null,
      rv_ondertekend: row.signedStatus === "signed",
    });
  }
  return out;
}

/**
 * Create any missing process instances. Event-triggered, never during render.
 *
 * Immutable on insert: an instance records the date and the source that made
 * the process begin, and is never updated afterwards.
 */
export async function activateProcesses(): Promise<{
  ok: boolean;
  created: number;
}> {
  const db = getDb();
  const today = officeToday();

  const ds = await db
    .select({
      id: dossiers.id,
      schuldenbewind: dossiers.schuldenbewind,
      startDate: dossiers.startDate,
      status: dossiers.status,
    })
    .from(dossiers);
  const live = ds.filter((d) => d.status !== "afgesloten");
  if (live.length === 0) return { ok: true, created: 0 };

  const ids = live.map((d) => d.id);
  const [periods, machtiging] = await Promise.all([
    db.select().from(rvPeriods).where(inArray(rvPeriods.dossierId, ids)),
    db
      .select({
        dossierId: paymentItems.dossierId,
        id: paymentItems.id,
        flag: paymentItems.machtigingFlag,
      })
      .from(paymentItems)
      .where(inArray(paymentItems.dossierId, ids)),
  ]);

  const pending: {
    dossierId: string;
    definitionKey: ProcessDefinitionKey;
    startedOn: string;
    startSource: string;
    sourceEntityId: string | null;
  }[] = [];

  for (const d of live) {
    // Intake runs from the start of the measure. With no recorded start date
    // there is no honest date to run it from, so it does not start at all —
    // rather than being dated from the calendar.
    if (d.startDate) {
      pending.push({
        dossierId: d.id,
        definitionKey: "intake",
        startedOn: d.startDate,
        startSource: "dossier_start_date",
        sourceEntityId: null,
      });
      if (d.schuldenbewind) {
        pending.push({
          dossierId: d.id,
          definitionKey: "schuldtraject",
          startedOn: d.startDate,
          startSource: "dossier_start_date",
          sourceEntityId: null,
        });
      }
    }

    // One R&V process per COURT-SET period, dated from the period itself.
    for (const p of periods.filter((x) => x.dossierId === d.id)) {
      pending.push({
        dossierId: d.id,
        definitionKey: "rv_jaarlijks",
        startedOn: p.periodStart,
        startSource: "rv_period",
        sourceEntityId: p.id,
      });
    }

    // Machtiging is event-started: the guard fired on a specific item.
    const trigger = machtiging.find(
      (m) => m.dossierId === d.id && m.flag?.triggered === true
    );
    if (trigger) {
      pending.push({
        dossierId: d.id,
        definitionKey: "machtiging",
        startedOn: today,
        startSource: "machtiging_threshold",
        sourceEntityId: trigger.id,
      });
    }
  }

  if (pending.length === 0) return { ok: true, created: 0 };
  const inserted = await db
    .insert(processInstances)
    .values(
      pending.map((p) => ({ ...p, definitionVersion: PROCESS_DEFINITION_VERSION }))
    )
    .onConflictDoNothing()
    .returning();
  return { ok: true, created: inserted.length };
}

async function buildRows(dossierId?: string): Promise<DossierProcesses[]> {
  const db = getDb();
  const today = officeToday();

  const q = db
    .select({
      i: processInstances,
      firstName: dossiers.firstName,
      lastName: dossiers.lastName,
      status: dossiers.status,
    })
    .from(processInstances)
    .innerJoin(dossiers, eq(processInstances.dossierId, dossiers.id));

  const instances = dossierId
    ? await q.where(eq(processInstances.dossierId, dossierId))
    : await q;

  const live = instances.filter((r) => r.status !== "afgesloten");
  if (live.length === 0) return [];

  const dossierIds = [...new Set(live.map((r) => r.i.dossierId))];
  const periodIds = live
    .filter((r) => r.i.definitionKey === "rv_jaarlijks" && r.i.sourceEntityId)
    .map((r) => r.i.sourceEntityId!) as string[];

  const [byDossier, rvFacts, periodRows] = await Promise.all([
    observeDossierFacts(dossierIds),
    observeRvFacts(periodIds),
    periodIds.length > 0
      ? db.select().from(rvPeriods).where(inArray(rvPeriods.id, periodIds))
      : Promise.resolve([]),
  ]);

  const byDossierId = new Map<string, DossierProcesses>();
  for (const r of live) {
    const key = r.i.definitionKey as ProcessDefinitionKey;
    const def = PROCESS_DEFINITIONS[key];
    if (!def) continue; // a definition retired since activation

    const base = byDossier.get(r.i.dossierId) ?? {};
    // R&V facts belong to the instance's own period, never to the dossier.
    const facts: ProcessFacts =
      key === "rv_jaarlijks"
        ? { ...base, ...(rvFacts.get(r.i.sourceEntityId ?? "") ?? {}) }
        : base;

    const evaluated = evaluateProcess({
      definition: def,
      facts,
      startDate: r.i.startedOn,
      today,
    });

    const period = periodRows.find((p) => p.id === r.i.sourceEntityId);
    const entry = byDossierId.get(r.i.dossierId) ?? {
      dossierId: r.i.dossierId,
      dossierName: `${r.firstName} ${r.lastName}`,
      processes: [],
    };
    entry.processes.push({
      ...evaluated,
      instanceId: r.i.id,
      startedOn: r.i.startedOn,
      startSource: r.i.startSource,
      periodLabel: period
        ? `${period.periodStart} – ${period.periodEnd}`
        : undefined,
    });
    byDossierId.set(r.i.dossierId, entry);
  }

  return [...byDossierId.values()];
}

/** The whole office's processes. */
export async function officeProcesses(): Promise<{
  rows: DossierProcesses[];
  summary: ReturnType<typeof summariseProcesses>;
}> {
  const rows = await buildRows();
  return {
    rows,
    summary: summariseProcesses(rows.flatMap((r) => r.processes)),
  };
}

/** Processes for one dossier. */
export async function dossierProcesses(dossierId: string): Promise<ProcessRow[]> {
  const rows = await buildRows(dossierId);
  return rows[0]?.processes ?? [];
}
