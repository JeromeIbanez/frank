import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

/**
 * Dossiers whose process scheduling failed and has NOT since succeeded.
 *
 * Temujin PR-11 r4: the durable audit row was being written, but the person
 * who created the triggering fact still saw a green success path. A failure
 * nobody is told about is only marginally better than one nobody records —
 * "the system schedules" cannot fail invisibly and still be the claim.
 *
 * Outstanding is DERIVED, not stored, because `audit_events` is append-only
 * by DB grant (os-v1 PR-1) and there is nothing to mark resolved.
 *
 * A failure counts as repaired once a RECONCILIATION PASS has completed
 * successfully after it. An earlier version looked for a process instance
 * created after the failure, which was wrong in the common case: if the
 * dossier already had its instances, reconciliation correctly creates
 * nothing, and the alert could never clear. Running the repair IS the
 * repair, whether or not it had anything left to do.
 */
export type ActivationFailure = {
  dossierId: string;
  dossierName: string;
  failedAt: string;
};

export async function outstandingActivationFailures(): Promise<
  ActivationFailure[]
> {
  try {
    const db = getDb();
    const r = await db.execute<{
      dossier_id: string;
      name: string;
      failed_at: string;
    }>(sql`
      SELECT DISTINCT ON (a.entity_id)
             a.entity_id AS dossier_id,
             d.first_name || ' ' || d.last_name AS name,
             to_char(a.created_at, 'YYYY-MM-DD HH24:MI') AS failed_at
        FROM audit_events a
        JOIN dossiers d ON d.id = a.entity_id
       WHERE a.entity_type = 'process_activation_failure'
         AND NOT EXISTS (
           SELECT 1 FROM audit_events r
            WHERE r.entity_type = 'process_activation_reconciled'
              AND r.created_at > a.created_at
         )
       ORDER BY a.entity_id, a.created_at DESC
    `);
    return (r.rows ?? []).map((x) => ({
      dossierId: x.dossier_id,
      dossierName: x.name,
      failedAt: x.failed_at,
    }));
  } catch {
    // The alert must never take the shell down.
    return [];
  }
}
