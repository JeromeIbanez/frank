import "server-only";

import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { obligations, messages, dossiers } from "@/lib/db/schema";

export type ObligationRow = {
  id: string;
  kind: string;
  summaryNl: string;
  summaryEn: string;
  dueDate: string | null;
  status: string;
  findings: Record<string, unknown>[];
  agentKey: string | null;
  message: {
    id: string;
    fromName: string | null;
    fromAddress: string | null;
    subject: string | null;
    bodyText: string | null;
    receivedAt: string;
    status: string;
    resolutionConfidence: number | null;
    resolutionEvidence: { matcher: string; value: string }[];
    linkSource: string | null;
    linkReviewed: boolean;
  };
  dossier: { id: string; name: string } | null;
};

/** Open obligations, newest first, with their source message and dossier. */
export async function listObligations(): Promise<ObligationRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      o: obligations,
      m: messages,
      dFirst: dossiers.firstName,
      dLast: dossiers.lastName,
      dId: dossiers.id,
    })
    .from(obligations)
    .innerJoin(messages, eq(obligations.sourceMessageId, messages.id))
    .leftJoin(dossiers, eq(obligations.dossierId, dossiers.id))
    .where(inArray(obligations.status, ["open", "in_review"]))
    .orderBy(desc(messages.receivedAt));

  return rows.map((r) => ({
    id: r.o.id,
    kind: r.o.kind,
    summaryNl: r.o.summaryNl,
    summaryEn: r.o.summaryEn,
    dueDate: r.o.dueDate,
    status: r.o.status,
    findings: (r.o.findings ?? []) as Record<string, unknown>[],
    agentKey: r.o.agentKey,
    message: {
      id: r.m.id,
      fromName: r.m.fromName,
      fromAddress: r.m.fromAddress,
      subject: r.m.subject,
      bodyText: r.m.bodyText,
      receivedAt: r.m.receivedAt.toISOString(),
      status: r.m.status,
      resolutionConfidence: r.m.resolutionConfidence,
      resolutionEvidence: (r.m.resolutionEvidence ?? []) as {
        matcher: string;
        value: string;
      }[],
      linkSource: r.m.linkSource,
      linkReviewed: r.m.linkReviewed,
    },
    dossier: r.dId ? { id: r.dId, name: `${r.dFirst} ${r.dLast}` } : null,
  }));
}
