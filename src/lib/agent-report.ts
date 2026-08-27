import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { AGENTS, AGENT_KEYS, type AgentKey } from "@/lib/domain/agents";

/**
 * Read-only agent activity for the /office Agents panel (plan os-v2 PR-8).
 *
 * Everything here is DERIVED from `ai_calls` and `ai_proposals` rather than
 * kept in a counter table. A denormalised counter drifts from the rows it
 * claims to summarise, and this panel exists precisely to be trusted; the
 * volumes are small enough that a live aggregate is the honest choice.
 *
 * The richer measures the pitch wants — accepted-unedited vs accepted-with-
 * edits, time-to-decision, share of work that arrived ready — are plan §7
 * and land in PR-11. This ships what the current data can actually support.
 */

export type AgentActivity = {
  key: AgentKey;
  calls: number;
  failedCalls: number;
  tokens: number;
  proposed: number;
  accepted: number;
  rejected: number;
  /** accepted / (accepted + rejected), or null when nothing is decided yet. */
  acceptRate: number | null;
  /** Refused ceiling violations (audit action `security_denied`). */
  denials: number;
};

export async function agentActivity(): Promise<AgentActivity[]> {
  const db = getDb();

  const base: Record<AgentKey, AgentActivity> = Object.fromEntries(
    AGENT_KEYS.map((key) => [
      key,
      {
        key,
        calls: 0,
        failedCalls: 0,
        tokens: 0,
        proposed: 0,
        accepted: 0,
        rejected: 0,
        acceptRate: null,
        denials: 0,
      },
    ])
  ) as Record<AgentKey, AgentActivity>;

  try {
    const calls = await db.execute<{
      agent_key: string;
      calls: number;
      failed: number;
      tokens: number;
    }>(sql`
      SELECT agent_key,
             COUNT(*)::int                                    AS calls,
             COUNT(*) FILTER (WHERE ok = false)::int          AS failed,
             COALESCE(SUM(COALESCE(input_tokens, 0) +
                          COALESCE(output_tokens, 0)), 0)::int AS tokens
        FROM ai_calls
       WHERE agent_key IS NOT NULL
       GROUP BY agent_key
    `);
    for (const r of calls.rows ?? []) {
      const row = base[r.agent_key as AgentKey];
      if (!row) continue; // an agent removed from the registry; ignore
      row.calls = Number(r.calls);
      row.failedCalls = Number(r.failed);
      row.tokens = Number(r.tokens);
    }

    const proposals = await db.execute<{
      agent_key: string;
      status: string;
      n: number;
    }>(sql`
      SELECT agent_key, status, COUNT(*)::int AS n
        FROM ai_proposals
       WHERE agent_key IS NOT NULL
       GROUP BY agent_key, status
    `);
    for (const r of proposals.rows ?? []) {
      const row = base[r.agent_key as AgentKey];
      if (!row) continue;
      const n = Number(r.n);
      if (r.status === "accepted") row.accepted += n;
      else if (r.status === "rejected") row.rejected += n;
      else row.proposed += n; // proposed | accepting
    }

    const denials = await db.execute<{ actor_id: string; n: number }>(sql`
      SELECT actor_id, COUNT(*)::int AS n
        FROM audit_events
       WHERE action = 'security_denied'
       GROUP BY actor_id
    `);
    for (const r of denials.rows ?? []) {
      const key = r.actor_id.replace(/^agent:/, "") as AgentKey;
      const row = base[key];
      if (!row) continue;
      row.denials = Number(r.n);
    }
  } catch {
    // A read-only panel must never take the Office page down. Zeroed rows
    // still show every agent's charter and ceiling, which is the point.
  }

  for (const key of AGENT_KEYS) {
    const row = base[key];
    const decided = row.accepted + row.rejected;
    row.acceptRate = decided > 0 ? row.accepted / decided : null;
  }

  return AGENT_KEYS.map((k) => base[k]);
}

/** Charter + ceiling for display; no I/O, straight from the registry. */
export function agentCeilings(key: AgentKey) {
  const def = AGENTS[key];
  return {
    grants: [...def.grants].sort(),
    neverGrants: [...def.neverGrants].sort(),
  };
}
