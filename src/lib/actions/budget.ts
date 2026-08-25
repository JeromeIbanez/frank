"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { budgetLines, dossiers } from "@/lib/db/schema";
import { currentActor } from "@/lib/identity";
import { writeAudit } from "@/lib/audit";

export async function addBudgetLine(
  dossierId: string,
  formData: FormData
): Promise<void> {
  const actor = await currentActor();
  const db = getDb();
  const amountCents = Math.round(
    Number(String(formData.get("amount") || "0").replace(",", ".")) * 100
  );
  const [row] = await db
    .insert(budgetLines)
    .values({
      dossierId,
      kind: String(formData.get("kind") || "expense") as
        | "income"
        | "expense"
        | "reserve",
      name: String(formData.get("name") || "").trim(),
      categoryKey: String(formData.get("categoryKey") || "overige_uitgaven"),
      amountCents,
      frequency: String(formData.get("frequency") || "monthly") as
        | "weekly"
        | "monthly"
        | "quarterly"
        | "yearly"
        | "once",
      expectedDay: Number(formData.get("expectedDay")) || null,
      counterpartyName: String(formData.get("counterpartyName") || "") || null,
      counterpartyIban:
        String(formData.get("counterpartyIban") || "")
          .trim()
          .toUpperCase() || null,
    })
    .returning();
  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "create",
    entityType: "budget_line",
    entityId: row.id,
    versionAfter: { name: row.name, amountCents, kind: row.kind },
  });
  revalidatePath(`/dossiers/${dossierId}`);
}

export async function deactivateBudgetLine(lineId: string): Promise<void> {
  const actor = await currentActor();
  const db = getDb();
  const line = await db.query.budgetLines.findFirst({
    where: eq(budgetLines.id, lineId),
  });
  if (!line) return;
  await db
    .update(budgetLines)
    .set({ active: false })
    .where(eq(budgetLines.id, lineId));
  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "update",
    entityType: "budget_line",
    entityId: lineId,
    versionBefore: { active: true },
    versionAfter: { active: false },
  });
  revalidatePath(`/dossiers/${line.dossierId}`);
}

export async function setLeefgeld(
  dossierId: string,
  formData: FormData
): Promise<void> {
  const actor = await currentActor();
  const db = getDb();
  const d = await db.query.dossiers.findFirst({
    where: eq(dossiers.id, dossierId),
  });
  if (!d) return;
  const amountCents = Math.round(
    Number(String(formData.get("amount") || "0").replace(",", ".")) * 100
  );
  const frequency = String(formData.get("frequency") || "weekly") as
    | "weekly"
    | "monthly";
  await db
    .update(dossiers)
    .set({
      leefgeldAmountCents: amountCents,
      leefgeldFrequency: frequency,
      updatedAt: new Date(),
    })
    .where(eq(dossiers.id, dossierId));
  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "update",
    entityType: "dossier",
    entityId: dossierId,
    versionBefore: {
      leefgeldAmountCents: d.leefgeldAmountCents,
      leefgeldFrequency: d.leefgeldFrequency,
    },
    versionAfter: { leefgeldAmountCents: amountCents, leefgeldFrequency: frequency },
    reason: "leefgeld schedule updated",
  });
  revalidatePath(`/dossiers/${dossierId}`);
}
