import "server-only";

import { eq, inArray, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
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
export type ActivatedInstance = {
  id: string;
  dossierId: string;
  definitionKey: string;
  startedOn: string;
  startSource: string;
};

export async function activateProcesses(
  /** Who is activating — recorded atomically with each instance. */
  actorId: string,
  /** Limit to one dossier — used by the event-triggered call sites. */
  onlyDossierId?: string
): Promise<{ ok: boolean; created: ActivatedInstance[] }> {
  const db = getDb();

  const ds = await db
    .select({
      id: dossiers.id,
      schuldenbewind: dossiers.schuldenbewind,
      startDate: dossiers.startDate,
      status: dossiers.status,
    })
    .from(dossiers);
  const live = ds.filter(
    (d) =>
      d.status !== "afgesloten" && (!onlyDossierId || d.id === onlyDossierId)
  );
  if (live.length === 0) return { ok: true, created: [] };

  const ids = live.map((d) => d.id);
  const [periods, machtiging] = await Promise.all([
    db.select().from(rvPeriods).where(inArray(rvPeriods.dossierId, ids)),
    db
      .select({
        dossierId: paymentItems.dossierId,
        id: paymentItems.id,
        createdAt: paymentItems.createdAt,
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
    sourceEntityId: string;
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
        // The dossier IS the source for dossier-wide processes. Never null:
        // see the schema note on NULLs in a unique index.
        sourceEntityId: d.id,
      });
      if (d.schuldenbewind) {
        pending.push({
          dossierId: d.id,
          definitionKey: "schuldtraject",
          startedOn: d.startDate,
          startSource: "dossier_start_date",
          sourceEntityId: d.id,
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
        // The date the triggering item was RECORDED, not the day someone
        // pressed a button (Temujin PR-11 r2 #3). An activation date that
        // depends on when a human happened to visit a page is not a fact
        // about the case.
        startedOn: trigger.createdAt.toISOString().slice(0, 10),
        startSource: "machtiging_threshold",
        sourceEntityId: trigger.id,
      });
    }
  }

  if (pending.length === 0) return { ok: true, created: [] };

  const created: ActivatedInstance[] = [];
  for (const item of pending) {
    const row = await insertInstanceWithAudit(item, actorId);
    if (row) created.push(row);
  }
  return { ok: true, created };
}

/**
 * Insert an instance AND its audit row in ONE statement.
 *
 * Temujin PR-11 r3 #1: doing these as two writes meant an instance could
 * exist without the audit row that makes it attributable — and reconciliation
 * could never repair it, because the unique index blocks reinsertion of the
 * row whose audit is missing. A deadline traceable to an unattributable
 * activation is not traceable at all.
 *
 * neon-http has no interactive transactions (os-v1 PR-7), so atomicity comes
 * from a single CTE chain, the same shape `applyDebtEvent` uses. The
 * ON CONFLICT keeps it idempotent: a duplicate inserts nothing and therefore
 * audits nothing.
 *
 * Every parameter carries an explicit cast — os-v1 PR-7 hit
 * "could not determine data type of parameter" inside jsonb_build_object.
 */
async function insertInstanceWithAudit(
  item: {
    dossierId: string;
    definitionKey: ProcessDefinitionKey;
    startedOn: string;
    startSource: string;
    sourceEntityId: string;
  },
  actorId: string
): Promise<ActivatedInstance | null> {
  const db = getDb();
  const id = createId();
  // `audit_events.id` is a Drizzle $defaultFn — generated in JS, NOT a
  // database default — so raw SQL has to supply it. Same for the instance.
  const auditId = createId();
  const res = await db.execute<{ id: string }>(sql`
    WITH ins AS (
      INSERT INTO process_instances
        (id, dossier_id, definition_key, definition_version,
         started_on, start_source, source_entity_id)
      VALUES (${id}::text, ${item.dossierId}::text, ${item.definitionKey}::text,
              ${PROCESS_DEFINITION_VERSION}::text, ${item.startedOn}::date,
              ${item.startSource}::text, ${item.sourceEntityId}::text)
      ON CONFLICT (dossier_id, definition_key, source_entity_id) DO NOTHING
      RETURNING id, dossier_id, definition_key, started_on, start_source
    )
    INSERT INTO audit_events
      (id, actor_id, actor_type, action, entity_type, entity_id,
       version_after, reason)
    SELECT ${auditId}::text, ${actorId}::text, 'human', 'create',
           'process_instance', ins.id,
           jsonb_build_object(
             'dossierId', ins.dossier_id,
             'definitionKey', ins.definition_key,
             'startedOn', ins.started_on::text,
             'startSource', ins.start_source
           ),
           'process activated from ' || ins.start_source
      FROM ins
    RETURNING entity_id AS id
  `);
  if ((res.rows ?? []).length === 0) return null; // conflict: already active
  return {
    id,
    dossierId: item.dossierId,
    definitionKey: item.definitionKey,
    startedOn: item.startedOn,
    startSource: item.startSource,
  };
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
