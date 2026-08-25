"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { accounts, contacts, dossiers, tasks } from "@/lib/db/schema";
import { currentActor } from "@/lib/identity";
import { writeAudit } from "@/lib/audit";
import { computeStatutoryTasks, CALC_VERSION } from "@/lib/domain/deadlines";
import { NIEUW_DOSSIER_PLAYBOOK, DEFAULT_INSTANTIES } from "@/lib/playbooks";

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

export async function addAccount(dossierId: string, formData: FormData) {
  const actor = await currentActor();
  const db = getDb();
  const [row] = await db
    .insert(accounts)
    .values({
      dossierId,
      type: String(formData.get("type") || "beheer") as
        | "beheer"
        | "leefgeld"
        | "spaar",
      iban: String(formData.get("iban") || "").trim().toUpperCase(),
      bankName: String(formData.get("bankName") || "") || null,
      openingBalanceCents: Math.round(
        Number(String(formData.get("openingBalance") || "0").replace(",", ".")) *
          100
      ),
      openingBalanceDate: isoToday(),
    })
    .returning();
  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "create",
    entityType: "account",
    entityId: row.id,
    versionAfter: { iban: row.iban, type: row.type },
  });
  revalidatePath(`/dossiers/${dossierId}`);
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
  await db
    .update(dossiers)
    .set({ status: "actief", updatedAt: new Date() })
    .where(eq(dossiers.id, dossierId));

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

  await db
    .update(dossiers)
    .set({ rvScheduleMonth: month, rvScheduleConfirmed: true, updatedAt: new Date() })
    .where(eq(dossiers.id, dossierId));

  // Generate the R&V task now that the schedule is confirmed
  if (dossier.startDate && dossier.status === "actief") {
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
}
