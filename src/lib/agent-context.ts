import "server-only";

import { createId } from "@paralleldrive/cuid2";
import {
  AGENTS,
  agentMay,
  isAgentKey,
  type AgentActionClass,
  type AgentKey,
} from "@/lib/domain/agents";
import { writeAudit } from "@/lib/audit";

/**
 * Agent identity and ceiling enforcement (plan os-v2 N1 / N1b, PR-8).
 *
 * WHY THIS IS NOT JUST A TYPE
 * ---------------------------
 * A structural TypeScript type is erased at runtime: `{ agentKey: "postbode" }`
 * would satisfy it, so anything that could reach an action boundary — a route
 * handler reading JSON, a tool result, a model's own output — could name
 * itself an agent and inherit that agent's grants. A model that can name its
 * own actor has no ceiling at all (N1b).
 *
 * So identity is nominal AT RUNTIME. Every real context is registered in a
 * module-private WeakSet that only `agentContext()` can add to. Membership
 * cannot be forged: not by an object literal, not by a cast, not by
 * `Object.create()` against a prototype, not by copying the fields. If it did
 * not come from this module, `isAgentContext()` returns false and
 * `assertAgentMay()` throws.
 *
 * `import "server-only"` makes importing this from a client component a build
 * error, so an AgentContext can never be constructed in the browser.
 */

const REAL_CONTEXTS = new WeakSet<object>();

export type AgentContext = {
  readonly agentKey: AgentKey;
  /** Ties every write this agent makes back to the event that triggered it. */
  readonly correlationId: string;
};

/**
 * The ONLY constructor. Takes a registry key — never a request field, never a
 * model-supplied value. Callers name the agent they are running as at the
 * call site, in code.
 */
export function agentContext(
  key: AgentKey,
  correlationId?: string
): AgentContext {
  // `isAgentKey` guards the boundary even though the type says it cannot be
  // wrong: this is exactly where a bad value would be most dangerous.
  if (!isAgentKey(key)) {
    throw new AgentCeilingError(
      `unknown agent key: ${String(key)}`,
      "unknown_agent"
    );
  }
  const ctx: AgentContext = Object.freeze({
    agentKey: key,
    correlationId: correlationId ?? createId(),
  });
  REAL_CONTEXTS.add(ctx);
  return ctx;
}

export function isAgentContext(v: unknown): v is AgentContext {
  return typeof v === "object" && v !== null && REAL_CONTEXTS.has(v as object);
}

/**
 * Proof that the ceiling was actually checked for a SPECIFIC action
 * (Temujin PR-8 r2 #1).
 *
 * An authentic `AgentContext` proves only who is acting — not that anyone
 * asked permission. Without this, a future entry point could write
 * agent-attributed rows with a genuine context it never gated:
 *
 *     const ctx = agentContext("postbode");
 *     await callStructured({ agent: ctx, … });   // authentic, ungated
 *
 * So `assertAgentMay` MINTS one of these, and only on success. Downstream
 * writers demand the grant rather than the context, which makes "the gate
 * ran for this action" a value you must hold, not a convention you must
 * remember. Same WeakSet trick: unforgeable, and it cannot survive
 * serialisation, so it can never arrive from outside the process.
 */
const REAL_GRANTS = new WeakSet<object>();

export type AgentGrant = {
  readonly agentKey: AgentKey;
  readonly action: AgentActionClass;
  readonly correlationId: string;
};

export function isAgentGrant(v: unknown): v is AgentGrant {
  return typeof v === "object" && v !== null && REAL_GRANTS.has(v as object);
}

export type CeilingDenial =
  | "forged_context"
  | "unknown_agent"
  | "never_granted"
  | "not_granted";

export class AgentCeilingError extends Error {
  readonly denial: CeilingDenial;
  constructor(message: string, denial: CeilingDenial) {
    super(message);
    this.name = "AgentCeilingError";
    this.denial = denial;
  }
}

/**
 * Gate. MUST be the first statement of every mutating agent entry point.
 *
 * Throws on denial — never a silent no-op. os-v1 PR-4 R2 found exactly that
 * failure mode in `markLetterSent`, where an unenforced permission produced a
 * success toast and no write; a security control that fails quietly is worse
 * than none, because it reads as working.
 *
 * The denial audit is best-effort and deliberately does not swallow the
 * throw: if the log write fails the action is still refused.
 */
export async function assertAgentMay(
  ctx: AgentContext,
  action: AgentActionClass,
  entity?: { type: string; id: string }
): Promise<AgentGrant> {
  if (!isAgentContext(ctx)) {
    await auditDenial("unknown", action, "forged_context", entity);
    throw new AgentCeilingError(
      `agent context was not created by agentContext() (action: ${action})`,
      "forged_context"
    );
  }
  const verdict = agentMay(ctx.agentKey, action);
  if (!verdict.allowed) {
    await auditDenial(ctx.agentKey, action, verdict.reason, entity, ctx);
    throw new AgentCeilingError(
      `agent ${ctx.agentKey} may not ${action} (${verdict.reason})`,
      verdict.reason
    );
  }
  // Minted ONLY here, only after the ceiling passed, and scoped to this
  // exact action. Downstream writers require it as evidence.
  const grant: AgentGrant = Object.freeze({
    agentKey: ctx.agentKey,
    action,
    correlationId: ctx.correlationId,
  });
  REAL_GRANTS.add(grant);
  return grant;
}

async function auditDenial(
  agentKey: AgentKey | "unknown",
  action: AgentActionClass,
  denial: CeilingDenial,
  entity?: { type: string; id: string },
  ctx?: AgentContext
): Promise<void> {
  try {
    await writeAudit({
      actorId: `agent:${agentKey}`,
      actorType: "agent",
      action: "security_denied",
      entityType: entity?.type ?? "agent_action",
      entityId: entity?.id ?? action,
      versionAfter: { action, denial },
      correlationId: ctx?.correlationId,
      reason: denial,
    });
  } catch (e) {
    // Never let logging failure mask the refusal — the throw stands either
    // way, because a refusal must not depend on database availability
    // (Temujin PR-8 r1, answer to (b)). But an unlogged denial is itself a
    // security-relevant event, so it must not vanish silently.
    console.error(
      "[frank:security] FAILED TO AUDIT a refused agent action",
      JSON.stringify({ agentKey, action, denial }),
      e instanceof Error ? e.message : String(e)
    );
  }
}

/**
 * Audit actor id for a permitted agent write.
 *
 * Verifies membership rather than trusting the object's shape (Temujin PR-8
 * r1 #2): without this, a cast object could mint `agent:postbode` audit
 * attribution and the log would carry a provenance claim nothing backs.
 * Audit attribution is the one thing that must never be forgeable, since
 * it is what a rechtbank auditor would rely on.
 */
export function agentActorId(proof: AgentContext | AgentGrant): string {
  if (isAgentGrant(proof)) return `agent:${proof.agentKey}`;
  if (isAgentContext(proof)) return `agent:${proof.agentKey}`;
  throw new AgentCeilingError(
    "refusing to attribute an audit row to an unverified agent context",
    "forged_context"
  );
}

/** Charter text for the UI, in the requested language. */
export function agentCharter(key: AgentKey, locale: string): string {
  const def = AGENTS[key];
  return locale.startsWith("nl") ? def.charterNl : def.charterEn;
}
