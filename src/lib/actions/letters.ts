"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contacts, dossiers, letters } from "@/lib/db/schema";
import { currentActor } from "@/lib/identity";
import { canPerform } from "@/lib/domain/authz";
import { writeAudit } from "@/lib/audit";
import { LETTER_TEMPLATES, renderTemplate } from "@/lib/letter-templates";
import { callDraft } from "@/lib/ai/gateway";
import { formatEuro } from "@/lib/domain/money";

function dossierFields(d: {
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  addressCity: string | null;
  rechtbank: string | null;
  zaaknummer: string | null;
  beschikkingDate: string | null;
}, beheerIban?: string): Record<string, string> {
  return {
    clientNaam: `${d.firstName} ${d.lastName}`,
    geboortedatum: d.dateOfBirth ?? "[geboortedatum]",
    woonplaats: d.addressCity ?? "[woonplaats]",
    rechtbank: d.rechtbank ?? "[rechtbank]",
    zaaknummer: d.zaaknummer ?? "[zaaknummer]",
    beschikkingDatum: d.beschikkingDate ?? "[datum beschikking]",
    beheerIban: beheerIban ?? "[beheerrekening]",
    bewindvoerderNaam: "Demo bewindvoerder",
  };
}

/**
 * Generate the aanschrijfbrieven pack: one letter per un-notified instantie.
 * Letters are drafts (Level B) — human approves, then marks sent.
 */
export async function generateAanschrijfPack(
  dossierId: string
): Promise<{ created: number }> {
  const actor = await currentActor();
  const db = getDb();
  const dossier = await db.query.dossiers.findFirst({
    where: eq(dossiers.id, dossierId),
    with: { accounts: true, contacts: true },
  });
  if (!dossier) return { created: 0 };

  const beheer = dossier.accounts.find((a) => a.type === "beheer");
  const tpl = LETTER_TEMPLATES.find((t) => t.key === "aanschrijfbrief")!;
  const fields = dossierFields(dossier, beheer?.iban);

  let created = 0;
  for (const contact of dossier.contacts.filter((c) => !c.notified)) {
    const rendered = renderTemplate(tpl, fields);
    const [row] = await db
      .insert(letters)
      .values({
        dossierId,
        templateKey: tpl.key,
        recipientContactId: contact.id,
        recipientName: contact.name,
        subject: rendered.subject,
        body: `Aan: ${contact.name}\n\n${rendered.body}`,
        language: "nl",
        status: "draft",
      })
      .returning();
    created++;
    await writeAudit({
      actorId: actor.id,
      actorType: "human",
      action: "create",
      entityType: "letter",
      entityId: row.id,
      versionAfter: { template: tpl.key, recipient: contact.name },
    });
  }

  revalidatePath(`/dossiers/${dossierId}`);
  return { created };
}

/** Generate a single letter from a template, optionally AI-tailored. */
export async function generateLetter(
  dossierId: string,
  formData: FormData
): Promise<void> {
  const actor = await currentActor();
  const db = getDb();
  const dossier = await db.query.dossiers.findFirst({
    where: eq(dossiers.id, dossierId),
    with: { accounts: true },
  });
  if (!dossier) return;

  const templateKey = String(formData.get("templateKey") || "");
  const tpl = LETTER_TEMPLATES.find((t) => t.key === templateKey);
  if (!tpl) return;

  const beheer = dossier.accounts.find((a) => a.type === "beheer");
  const kenmerk = String(formData.get("kenmerk") || "") || "[kenmerk]";
  const amountRaw = String(formData.get("amount") || "");
  const monthlyRaw = String(formData.get("monthly") || "");
  const context = String(formData.get("context") || "").trim();

  const fields = {
    ...dossierFields(dossier, beheer?.iban),
    kenmerk,
    bedrag: amountRaw
      ? formatEuro(Math.round(Number(amountRaw.replace(",", ".")) * 100))
      : "[bedrag]",
    maandbedrag: monthlyRaw
      ? formatEuro(Math.round(Number(monthlyRaw.replace(",", ".")) * 100))
      : "[maandbedrag]",
  };

  const rendered = renderTemplate(tpl, fields);
  const subject = rendered.subject;
  let body = rendered.body;

  // Optional AI tailoring: keeps the legal skeleton, weaves in case context.
  // Always Dutch. Draft-only (Level B) — never auto-sent.
  if (context) {
    const res = await callDraft({
      purpose: "draft",
      system:
        "Je bent een juridisch-administratief medewerker van een Nederlands bewindvoerderskantoor. Je herschrijft conceptbrieven: behoud de formele structuur, alle juridische verwijzingen en placeholders die nog tussen [blokhaken] staan, en verwerk de extra context beknopt en zakelijk. Antwoord met ALLEEN de brieftekst, in het Nederlands.",
      prompt: `Conceptbrief:\n"""\n${body}\n"""\n\nExtra context van de bewindvoerder: ${context}`,
      keepIban: true,
    });
    if (res.ok) body = res.value;
  }

  const [row] = await db
    .insert(letters)
    .values({
      dossierId,
      templateKey,
      recipientName: String(formData.get("recipient") || "") || null,
      subject,
      body,
      language: "nl",
      status: "draft",
    })
    .returning();

  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "create",
    entityType: "letter",
    entityId: row.id,
    versionAfter: { template: templateKey, aiTailored: Boolean(context) },
  });

  revalidatePath(`/dossiers/${dossierId}`);
}

export async function approveLetter(letterId: string): Promise<void> {
  const actor = await currentActor();
  // Approving outgoing correspondence is a bewindvoerder act (plan os-v1 W0).
  if (!canPerform(actor, "letter_approve").allowed) return;
  const db = getDb();
  const letter = await db.query.letters.findFirst({
    where: eq(letters.id, letterId),
  });
  if (!letter || letter.status !== "draft") return;
  await db
    .update(letters)
    .set({ status: "approved", approvedBy: actor.id })
    .where(eq(letters.id, letterId));
  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "approve",
    entityType: "letter",
    entityId: letterId,
    versionBefore: { status: "draft" },
    versionAfter: { status: "approved" },
  });
  revalidatePath(`/dossiers/${letter.dossierId}`);
}

/** Mark as sent (demo: records the fact + flips contact to notified). */
export async function markLetterSent(letterId: string): Promise<void> {
  const actor = await currentActor();
  const db = getDb();
  const letter = await db.query.letters.findFirst({
    where: eq(letters.id, letterId),
  });
  if (!letter || letter.status !== "approved") return;
  await db
    .update(letters)
    .set({ status: "sent", sentAt: new Date() })
    .where(eq(letters.id, letterId));
  if (letter.recipientContactId) {
    await db
      .update(contacts)
      .set({ notified: true })
      .where(
        and(
          eq(contacts.id, letter.recipientContactId),
          eq(contacts.dossierId, letter.dossierId)
        )
      );
  }
  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "transition",
    entityType: "letter",
    entityId: letterId,
    versionBefore: { status: "approved" },
    versionAfter: { status: "sent" },
    reason: "letter marked sent (demo: no real dispatch)",
  });
  revalidatePath(`/dossiers/${letter.dossierId}`);
}
