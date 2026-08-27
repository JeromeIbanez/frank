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
): Promise<void> {
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
  } catch {
    // Never let logging failure mask the refusal.
  }
}

/** Audit actor id for a permitted agent write. */
export function agentActorId(ctx: AgentContext): string {
  return `agent:${ctx.agentKey}`;
}

/** Charter text for the UI, in the requested language. */
export function agentCharter(key: AgentKey, locale: string): string {
  const def = AGENTS[key];
  return locale.startsWith("nl") ? def.charterNl : def.charterEn;
}
