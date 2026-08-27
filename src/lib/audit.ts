import { getDb } from "@/lib/db";
import { auditEvents } from "@/lib/db/schema";

export type AuditInput = {
  actorId: string;
  actorType: "human" | "agent" | "system";
  action:
    | "create"
    | "update"
    | "approve"
    | "transition"
    | "export"
    | "download"
    | "ai_call"
    | "import"
    | "delete"
    /** An agent tried to act outside its capability ceiling (os-v2 N1).
     *  Recorded so a refused action is visible, not merely absent. */
    | "security_denied";
  entityType: string;
  entityId: string;
  versionBefore?: unknown;
  versionAfter?: unknown;
  correlationId?: string;
  approvalId?: string;
  sourceDocumentHash?: string;
  reason?: string;
};

/**
 * Append-only audit log. The application role must never UPDATE/DELETE
 * audit rows (enforced via DB grants in production; in the demo the
 * application code simply has no code path that mutates them).
 */
export async function writeAudit(input: AuditInput): Promise<void> {
  const db = getDb();
  await db.insert(auditEvents).values({
    actorId: input.actorId,
    actorType: input.actorType,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    versionBefore: input.versionBefore ?? null,
    versionAfter: input.versionAfter ?? null,
    correlationId: input.correlationId ?? null,
    approvalId: input.approvalId ?? null,
    sourceDocumentHash: input.sourceDocumentHash ?? null,
    reason: input.reason ?? null,
  });
}
