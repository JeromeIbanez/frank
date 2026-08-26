"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { accounts, contacts, dossiers, tasks } from "@/lib/db/schema";
import { currentActor } from "@/lib/identity";
import { writeAudit } from "@/lib/audit";
import { computeStatutoryTasks, CALC_VERSION } from "@/lib/domain/deadlines";
import { isValidIban } from "@/lib/domain/pain001";
import { NIEUW_DOSSIER_PLAYBOOK, DEFAULT_INSTANTIES } from "@/lib/playbooks";
import { refreshSignalsSafe } from "@/lib/signals";

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function createDossier(formData: FormData): Promise<void> {
  const actor = await currentActor();
  const db = getDb();

  const regime = String(formData.get("regime") || "bewind");
  const grondslag = String(formData.get("grondslag") || "geestelijk_lichamelijk");

  const [row] = await db
    .insert(dossiers)
    .values({
      firstName: String(formData.get("firstName") || "").trim(),
      lastName: String(formData.get("lastName") || "").trim(),
      dateOfBirth: String(formData.get("dateOfBirth") || "") || null,
      addressStreet: String(formData.get("addressStreet") || "") || null,
      addressPostcode: String(formData.get("addressPostcode") || "") || null,
      addressCity: String(formData.get("addressCity") || "") || null,
      gemeente: String(formData.get("gemeente") || "") || null,
      regime: regime as "bewind" | "curatele" | "mentorschap" | "bewind_mentorschap",
      grondslag: grondslag as "geestelijk_lichamelijk" | "schulden" | "verkwisting",
      schuldenbewind: grondslag === "schulden" || grondslag === "verkwisting",
      rechtbank: String(formData.get("rechtbank") || "") || null,
      zaaknummer: String(formData.get("zaaknummer") || "") || null,
      beschikkingDate: String(formData.get("beschikkingDate") || "") || null,
      startDate: String(formData.get("startDate") || "") || null,
      status: "aanmelding",
    })
    .returning();

  await db.insert(contacts).values(
    DEFAULT_INSTANTIES.map((c) => ({
      dossierId: row.id,
      kind: c.kind,
      name: c.name,
    }))
  );

  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "create",
    entityType: "dossier",
    entityId: row.id,
    versionAfter: { name: `${row.firstName} ${row.lastName}`, regime },
  });

  revalidatePath("/dossiers");
  redirect(`/dossiers/${row.id}`);
}

export async function addAccount(
  dossierId: string,
  formData: FormData
): Promise<{ ok: boolean; error?: string; entityId?: string }> {
  const actor = await currentActor();
  const db = getDb();
  // Validate at the boundary (Temujin code review finding 8): invalid data
  // must not enter the ledger model.
  const type = String(formData.get("type") || "");
  const iban = String(formData.get("iban") || "").trim().toUpperCase();
  const balance = Number(
    String(formData.get("openingBalance") || "0").replace(",", ".")
  );
  if (!["beheer", "leefgeld", "spaar"].includes(type)) {
    return { ok: false, error: "invalid_type" };
  }
  if (!isValidIban(iban)) return { ok: false, error: "invalid_iban" };
  if (!Number.isFinite(balance)) return { ok: false, error: "invalid_amount" };
  // Idempotent materialization (Temujin PR-6 r2 #1).
  const sourceProposalId =
    String(formData.get("sourceProposalId") || "") || null;
  if (sourceProposalId) {
    const existing = await db.query.accounts.findFirst({
      where: eq(accounts.sourceProposalId, sourceProposalId),
    });
    if (existing) return { ok: true, entityId: existing.id };
  }
  // DB-boundary race handling (Temujin PR-6 r3 #3): a concurrent retry
  // that loses the unique-index race resumes on the existing row instead
  // of throwing.
  const [row] = await db
    .insert(accounts)
    .values({
      dossierId,
      sourceProposalId,
      type: type as "beheer" | "leefgeld" | "spaar",
      iban,
      bankName: String(formData.get("bankName") || "") || null,
      openingBalanceCents: Math.round(balance * 100),
      openingBalanceDate: /^\d{4}-\d{2}-\d{2}$/.test(
        String(formData.get("openingBalanceDate") || "")
      )
        ? String(formData.get("openingBalanceDate"))
        : isoToday(),
    })
    .onConflictDoNothing()
    .returning();
  if (!row) {
    if (sourceProposalId) {
      const existing = await db.query.accounts.findFirst({
        where: eq(accounts.sourceProposalId, sourceProposalId),
      });
      if (existing) return { ok: true, entityId: existing.id };
    }
    return { ok: false, error: "insert_conflict" };
  }
  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "create",
    entityType: "account",
    entityId: row.id,
    versionAfter: { iban: row.iban, type: row.type },
  });
  revalidatePath(`/dossiers/${dossierId}`);
  return { ok: true, entityId: row.id };
}

/**
 * Activate the dossier: set status actief, generate statutory tasks with
 * deadline provenance, and instantiate the "nieuw dossier" playbook.
 */
export async function activateDossier(dossierId: string): Promise<void> {
  const actor = await currentActor();
  const db = getDb();
  const dossier = await db.query.dossiers.findFirst({
    where: eq(dossiers.id, dossierId),
  });
  if (!dossier) return;
  if (!dossier.startDate) {
    throw new Error("startDate required to activate");
  }

  const before = { status: dossier.status };
  // Idempotent, race-safe transition (Temujin code review finding 3): the
  // conditional update succeeds at most once; retries/concurrent calls see
  // zero updated rows and never duplicate statutory obligations.
  const updated = await db
    .update(dossiers)
    .set({ status: "actief", updatedAt: new Date() })
    .where(and(eq(dossiers.id, dossierId), ne(dossiers.status, "actief")))
    .returning({ id: dossiers.id });
  if (updated.length === 0) return;

  // Statutory tasks with provenance (Temujin #4). If the R&V schedule is not
  // confirmed, no R&V task is generated — the exception feed flags it.
  const specs = computeStatutoryTasks({
    startDate: dossier.startDate,
    beschikkingDate: dossier.beschikkingDate,
    schuldenbewind: dossier.schuldenbewind,
    rvScheduleMonth: dossier.rvScheduleConfirmed ? dossier.rvScheduleMonth : null,
    today: isoToday(),
  });

  for (const spec of specs) {
    await db.insert(tasks).values({
      dossierId,
      titleKey: spec.titleKey,
      kind: "statutory",
      tier: spec.tier,
      legalSource: spec.legalSource,
      basisDate: spec.basisDate,
      calculationVersion: spec.calculationVersion,
      dueDate: spec.dueDate,
      deadlineConfirmed: false,
      status: "open",
      assignee: actor.id,
    });
  }

  for (const def of NIEUW_DOSSIER_PLAYBOOK) {
    await db.insert(tasks).values({
      dossierId,
      titleKey: def.titleKey,
      kind: "playbook",
      tier: def.tier,
      playbookKey: def.key,
      basisDate: dossier.startDate,
      calculationVersion: CALC_VERSION,
      dueDate: addDays(dossier.startDate, def.offsetDays),
      deadlineConfirmed: true, // playbook offsets are internal, not statutory
      status: "open",
      checklist: def.checklist?.map((c) => ({
        key: c.key,
        label: c.labelKey,
        done: false,
      })),
      assignee: actor.id,
    });
  }

  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "transition",
    entityType: "dossier",
    entityId: dossierId,
    versionBefore: before,
    versionAfter: { status: "actief" },
    reason: "activation: statutory tasks + nieuw-dossier playbook generated",
  });

  revalidatePath(`/dossiers/${dossierId}`);
  await refreshSignalsSafe();
}

/** Record the court-imposed R&V schedule (explicit dossier fact, never inferred). */
export async function setRvSchedule(
  dossierId: string,
  month: number
): Promise<void> {
  const actor = await currentActor();
  const db = getDb();
  const dossier = await db.query.dossiers.findFirst({
    where: eq(dossiers.id, dossierId),
  });
  if (!dossier || month < 1 || month > 12) return;

  // Race-safe first-confirmation (Temujin round 2 minor): the conditional
  // update wins at most once; only the winner generates the statutory task.
  const confirmed = await db
    .update(dossiers)
    .set({ rvScheduleMonth: month, rvScheduleConfirmed: true, updatedAt: new Date() })
    .where(
      and(eq(dossiers.id, dossierId), eq(dossiers.rvScheduleConfirmed, false))
    )
    .returning({ id: dossiers.id });
  if (confirmed.length === 0) {
    // already confirmed: allow updating the month, but never re-generate tasks
    await db
      .update(dossiers)
      .set({ rvScheduleMonth: month, updatedAt: new Date() })
      .where(eq(dossiers.id, dossierId));
  }

  if (confirmed.length > 0 && dossier.startDate && dossier.status === "actief") {
    const specs = computeStatutoryTasks({
      startDate: dossier.startDate,
      beschikkingDate: dossier.beschikkingDate,
      schuldenbewind: dossier.schuldenbewind,
      rvScheduleMonth: month,
      today: isoToday(),
    }).filter((s) => s.key === "rekening_verantwoording");
    for (const spec of specs) {
      await db.insert(tasks).values({
        dossierId,
        titleKey: spec.titleKey,
        kind: "statutory",
        tier: spec.tier,
        legalSource: spec.legalSource,
        basisDate: spec.basisDate,
        calculationVersion: spec.calculationVersion,
        dueDate: spec.dueDate,
        deadlineConfirmed: true, // schedule came from the court, human-entered
        status: "open",
        assignee: actor.id,
      });
    }
  }

  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "update",
    entityType: "dossier",
    entityId: dossierId,
    versionAfter: { rvScheduleMonth: month, rvScheduleConfirmed: true },
    reason: "court R&V schedule recorded",
  });

  revalidatePath(`/dossiers/${dossierId}`);
  await refreshSignalsSafe();
}
