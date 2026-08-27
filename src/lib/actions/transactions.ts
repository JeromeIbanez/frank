"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { accounts, imports, transactions } from "@/lib/db/schema";
import { currentActor } from "@/lib/identity";
import { writeAudit } from "@/lib/audit";
import { parseCamt053, dedupeHash } from "@/lib/domain/camt";
import { ruleCategorize, CATEGORIES } from "@/lib/domain/categories";
import { callStructured } from "@/lib/ai/gateway";
import { refreshSignalsSafe } from "@/lib/signals";
import { reconcileDebtPayments } from "@/lib/actions/debts";

/**
 * CAMT.053 import with the PRD §6.3 money invariants:
 * - raw file stored immutably with sha256
 * - idempotent: re-importing the same file creates zero duplicates
 * - per-entry uniqueness via dedupe hash (unique index)
 */
export async function importCamtFile(
  accountId: string,
  formData: FormData
): Promise<{ ok: boolean; imported?: number; duplicates?: number; errors?: string[] }> {
  const actor = await currentActor();
  const db = getDb();

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, errors: ["no_file"] };
  const xml = await file.text();
  const fileHash = createHash("sha256").update(xml).digest("hex");

  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, accountId),
  });
  if (!account) return { ok: false, errors: ["account_not_found"] };

  const parsed = parseCamt053(xml);
  if (parsed.errors.length > 0 && parsed.entries.length === 0) {
    return { ok: false, errors: parsed.errors };
  }
  if (
    parsed.accountIban &&
    parsed.accountIban.replace(/\s/g, "") !== account.iban.replace(/\s/g, "")
  ) {
    return {
      ok: false,
      errors: [`iban_mismatch:${parsed.accountIban}≠${account.iban}`],
    };
  }

  const [importRow] = await db
    .insert(imports)
    .values({
      accountId,
      filename: file.name,
      format: "camt053",
      fileHash,
      rawContent: xml,
      stats: { total: parsed.entries.length, imported: 0, duplicates: 0, errors: parsed.errors },
    })
    .returning();

  let imported = 0;
  let duplicates = 0;
  for (const entry of parsed.entries) {
    const hash = dedupeHash(entry);
    const cat = ruleCategorize(
      entry.counterpartyName,
      entry.description,
      entry.amountCents
    );
    try {
      await db
        .insert(transactions)
        .values({
          accountId,
          dossierId: account.dossierId,
          bookingDate: entry.bookingDate,
          amountCents: entry.amountCents,
          counterpartyName: entry.counterpartyName,
          counterpartyIban: entry.counterpartyIban,
          description: entry.description,
          endToEndId: entry.endToEndId,
          categoryKey: cat?.categoryKey ?? null,
          categorySource: cat ? "rule" : null,
          categoryConfidence: cat?.confidence ?? null,
          importId: importRow.id,
          dedupeHash: hash,
        })
        .onConflictDoNothing();
      // onConflictDoNothing: count actual inserts via returning would need
      // .returning(); do a cheap existence check instead
      const [existing] = await db
        .select({ importId: transactions.importId })
        .from(transactions)
        .where(
          and(
            eq(transactions.accountId, accountId),
            eq(transactions.dedupeHash, hash)
          )
        );
      if (existing?.importId === importRow.id) imported++;
      else duplicates++;
    } catch {
      duplicates++;
    }
  }

  await db
    .update(imports)
    .set({
      stats: {
        total: parsed.entries.length,
        imported,
        duplicates,
        errors: parsed.errors,
      },
    })
    .where(eq(imports.id, importRow.id));

  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "import",
    entityType: "import",
    entityId: importRow.id,
    sourceDocumentHash: fileHash,
    versionAfter: { imported, duplicates, file: file.name },
    reason: `CAMT.053 import for ${account.iban}`,
  });

  revalidatePath(`/dossiers/${account.dossierId}`);
  // Debt reconciliation runs on IMPORTED transactions only (plan os-v1 W4:
  // an export proves nothing; a bank statement does).
  try {
    await reconcileDebtPayments();
  } catch (e) {
    console.error("debt reconciliation failed:", e);
  }
  await refreshSignalsSafe();
  return { ok: true, imported, duplicates, errors: parsed.errors };
}

export async function addManualTransaction(
  accountId: string,
  formData: FormData
): Promise<void> {
  const actor = await currentActor();
  const db = getDb();
  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, accountId),
  });
  if (!account) return;

  const amountEuro = Number(
    String(formData.get("amount") || "0").replace(",", ".")
  );
  if (!Number.isFinite(amountEuro) || amountEuro === 0) return;
  const direction = String(formData.get("direction") || "out");
  const amountCents = Math.round(Math.abs(amountEuro) * 100) * (direction === "out" ? -1 : 1);
  const bookingDate = String(formData.get("bookingDate") || new Date().toISOString().slice(0, 10));
  const description = String(formData.get("description") || "") || null;
  const counterpartyName = String(formData.get("counterpartyName") || "") || null;
  // Counterparty IBAN is what debt reconciliation matches on — without it
  // a hand-entered regeling payment could never reduce a debt.
  const counterpartyIban =
    String(formData.get("counterpartyIban") || "").trim().toUpperCase() || null;

  const hash = createHash("sha256")
    .update(
      `manual|${account.iban}|${bookingDate}|${amountCents}|${counterpartyName}|${description}|${Date.now()}`
    )
    .digest("hex");

  const cat = ruleCategorize(counterpartyName, description, amountCents);

  const [row] = await db
    .insert(transactions)
    .values({
      accountId,
      dossierId: account.dossierId,
      bookingDate,
      amountCents,
      counterpartyName,
      counterpartyIban,
      description,
      categoryKey: cat?.categoryKey ?? null,
      categorySource: cat ? "rule" : null,
      categoryConfidence: cat?.confidence ?? null,
      dedupeHash: hash,
    })
    .returning();

  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "create",
    entityType: "transaction",
    entityId: row.id,
    versionAfter: { amountCents, bookingDate, counterpartyName },
  });

  revalidatePath(`/dossiers/${account.dossierId}`);
  // Manual transactions are human-entered bank facts — reconcile them too.
  try {
    await reconcileDebtPayments();
  } catch (e) {
    console.error("debt reconciliation failed:", e);
  }
  await refreshSignalsSafe();
}

export async function setTransactionCategory(
  transactionId: string,
  categoryKey: string
): Promise<void> {
  const actor = await currentActor();
  const db = getDb();
  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, transactionId),
  });
  if (!tx) return;
  await db
    .update(transactions)
    .set({
      categoryKey,
      categorySource: "human",
      categoryConfidence: 100,
      reviewed: true,
    })
    .where(eq(transactions.id, transactionId));
  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "update",
    entityType: "transaction",
    entityId: transactionId,
    versionBefore: { categoryKey: tx.categoryKey, source: tx.categorySource },
    versionAfter: { categoryKey, source: "human" },
  });
  revalidatePath(`/dossiers/${tx.dossierId}`);
  await refreshSignalsSafe();
}

const aiCategorySchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      categoryKey: z.string(),
      confidence: z.number().min(0).max(100),
    })
  ),
});

/**
 * AI-assisted categorization for uncategorized transactions (Level A —
 * suggestions carry source "ai" + confidence; humans can override).
 */
export async function aiCategorizeDossier(
  dossierId: string
): Promise<{ ok: boolean; categorized?: number; unavailable?: boolean }> {
  const actor = await currentActor();
  const db = getDb();
  const uncat = await db.query.transactions.findMany({
    where: and(
      eq(transactions.dossierId, dossierId),
      isNull(transactions.categoryKey)
    ),
    limit: 40,
  });
  if (uncat.length === 0) return { ok: true, categorized: 0 };

  const validKeys = CATEGORIES.map((c) => c.key);
  const listing = uncat
    .map(
      (t) =>
        `${t.id} | ${t.bookingDate} | ${(t.amountCents / 100).toFixed(2)} EUR | ${t.counterpartyName ?? "?"} | ${t.description ?? ""}`
    )
    .join("\n");

  const res = await callStructured({
    purpose: "categorize",
    schema: aiCategorySchema,
    system: `You categorize Dutch bank transactions for a bewindvoering office. Valid category keys: ${validKeys.join(", ")}. Assign the best key per transaction with a confidence 0-100. Positive amounts are income, negative are expenses.`,
    prompt: `Transactions (id | date | amount | counterparty | description):\n${listing}`,
  });

  if (!res.ok) return { ok: false, unavailable: true };

  let n = 0;
  for (const r of res.value.results) {
    if (!validKeys.includes(r.categoryKey)) continue;
    const match = uncat.find((t) => t.id === r.id);
    if (!match) continue;
    await db
      .update(transactions)
      .set({
        categoryKey: r.categoryKey,
        categorySource: "ai",
        categoryConfidence: Math.round(r.confidence),
      })
      .where(eq(transactions.id, r.id));
    n++;
  }

  await writeAudit({
    actorId: "frank-ai",
    actorType: "agent",
    action: "ai_call",
    entityType: "dossier",
    entityId: dossierId,
    versionAfter: { categorized: n },
    reason: `AI categorization proposed for ${n} transactions (approved surface: category suggestions)`,
    correlationId: actor.id,
  });

  revalidatePath(`/dossiers/${dossierId}`);
  return { ok: true, categorized: n };
}
