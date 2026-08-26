import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { paymentBatches } from "@/lib/db/schema";
import { currentActor } from "@/lib/identity";
import { writeAudit } from "@/lib/audit";
import { generatePain001Multi } from "@/lib/domain/pain001";

/**
 * pain.001 export of an APPROVED batch.
 * PERMANENTLY DEMO-ONLY in this MVP (Temujin code review finding 5): the XML
 * is valid, but every export is demo-labeled in filename, headers, and audit,
 * regardless of environment. A real production export is a P1 feature that
 * requires an explicit bank-profile configuration, XSD/profile validation,
 * an authenticated office, and a bank acceptance test — never a silent
 * environment-variable flip.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const { batchId } = await params;
  const actor = await currentActor();
  const db = getDb();

  const batch = await db.query.paymentBatches.findFirst({
    where: eq(paymentBatches.id, batchId),
    with: { items: { with: { debtorAccount: true } } },
  });
  if (!batch) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (batch.status !== "approved" && batch.status !== "exported") {
    return NextResponse.json(
      { error: "batch_not_approved" },
      { status: 409 }
    );
  }

  // Excluded items are held for court authorisation: they neither block the
  // export nor appear in it (same invariant as approveBatch).
  const blocking = batch.items.filter(
    (i) =>
      !i.excluded &&
      ((i.validationErrors && i.validationErrors.length > 0) ||
        (i.machtigingFlag?.triggered && !i.machtigingFlag.resolution))
  );
  if (blocking.length > 0) {
    return NextResponse.json(
      { error: "unresolved_validation", count: blocking.length },
      { status: 409 }
    );
  }

  // One PmtInf block per debtor account (each client's beheerrekening is its
  // own debtor). Every item in the batch is exported — no silent caps.
  const byAccount = new Map<
    string,
    { debtorName: string; items: typeof batch.items }
  >();
  for (const item of batch.items) {
    if (item.excluded) continue; // held for court authorisation — never exported
    const key = item.debtorAccount.iban;
    if (!byAccount.has(key)) {
      byAccount.set(key, {
        debtorName: `Beheerrekening ${item.debtorAccount.iban}`,
        items: [],
      });
    }
    byAccount.get(key)!.items.push(item);
  }
  if (byAccount.size === 0) {
    return NextResponse.json({ error: "empty_batch" }, { status: 409 });
  }

  const result = generatePain001Multi({
    messageId: `FRANK-DEMO-${batch.id.slice(0, 12)}`,
    creationDateTime: new Date().toISOString(),
    initiatingParty: "Frank Bewindvoering (DEMO)",
    requestedExecutionDate: batch.executionDate,
    groups: [...byAccount.entries()].map(([iban, group]) => ({
      debtorName: group.debtorName,
      debtorIban: iban,
      instructions: group.items.map((i) => ({
        creditorName: i.creditorName,
        creditorIban: i.creditorIban,
        amountCents: i.amountCents,
        remittanceInfo: i.remittanceInfo,
        endToEndId: `FRANK-${i.id.slice(0, 16)}`,
      })),
    })),
  });

  if ("errors" in result) {
    return NextResponse.json({ error: "validation", details: result.errors }, { status: 409 });
  }

  const demo = true; // MVP invariant — see header comment
  const filename = `DEMO-NIET-AANLEVEREN-pain001-${batch.executionDate}-${batch.id.slice(0, 8)}.xml`;

  await db
    .update(paymentBatches)
    .set({ status: "exported", exportedAt: new Date(), exportFilename: filename })
    .where(eq(paymentBatches.id, batchId));

  await writeAudit({
    actorId: actor.id,
    actorType: "human",
    action: "export",
    entityType: "payment_batch",
    entityId: batchId,
    versionAfter: {
      filename,
      demoExport: demo,
      controlSumCents: result.controlSumCents,
      count: result.count,
    },
    reason: "DEMO pain.001 export — not for bank submission",
  });

  return new NextResponse(result.xml, {
    headers: {
      "Content-Type": "application/xml",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Frank-Demo-Export": demo ? "true" : "false",
    },
  });
}
