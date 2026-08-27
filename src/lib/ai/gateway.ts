/**
 * The single server-side AI chokepoint (PRD §5a).
 *
 * All model calls in Frank OS go through this module:
 *  - BSN / IBAN redaction by default (allowlist per purpose)
 *  - only explicitly selected text/fields are sent — callers pass strings,
 *    never whole entities
 *  - structured outputs are schema-validated server-side (zod)
 *  - every call is logged to ai_calls with model + prompt version + data class
 *  - office-wide demo token cap; visible fallback when AI is unavailable
 */
import {
  convertToModelMessages,
  generateObject,
  generateText,
  stepCountIs,
  streamText,
  type ToolSet,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { count, sum } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiCalls } from "@/lib/db/schema";
import { isAgentGrant, type AgentGrant } from "@/lib/agent-context";

export const PROMPT_VERSION = "2026-08.1";
export const DATA_CLASS = "synthetic_demo"; // only value until auth exists

// Low-cost model for structured extraction; stronger model only for
// human-invoked drafting/chat (Temujin review §8 answer 3).
// Defaults work on the Vercel AI Gateway FREE tier; once the team tops up
// credits, set FRANK_MODEL_STRUCTURED=anthropic/claude-haiku-4-5 and
// FRANK_MODEL_DRAFTING=anthropic/claude-sonnet-5 (no code change needed).
export const MODEL_STRUCTURED =
  process.env.FRANK_MODEL_STRUCTURED ?? "openai/gpt-5-nano";
export const MODEL_DRAFTING =
  process.env.FRANK_MODEL_DRAFTING ?? "google/gemini-2.5-flash-lite";

// Demo office-wide cap (tokens). Gateway-enforced, visible in UI.
export const DEMO_TOKEN_CAP = 2_000_000;

const BSN_RE = /\b\d{9}\b/g;
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z]{4}\d{10}\b/g;

export function redact(text: string, opts?: { keepIban?: boolean }): string {
  let out = text.replace(BSN_RE, "[BSN]");
  if (!opts?.keepIban) out = out.replace(IBAN_RE, "[IBAN]");
  return out;
}

export async function aiUsage(): Promise<{
  totalTokens: number;
  cap: number;
  calls: number;
}> {
  const db = getDb();
  const [row] = await db
    .select({
      calls: count(),
      input: sum(aiCalls.inputTokens),
      output: sum(aiCalls.outputTokens),
    })
    .from(aiCalls);
  const totalTokens = Number(row?.input ?? 0) + Number(row?.output ?? 0);
  return { totalTokens, cap: DEMO_TOKEN_CAP, calls: Number(row?.calls ?? 0) };
}

async function capExceeded(): Promise<boolean> {
  try {
    const { totalTokens, cap } = await aiUsage();
    return totalTokens >= cap;
  } catch {
    return false;
  }
}

/**
 * Attribution is EARNED, not asserted (Temujin PR-8 r1 #1, r2 #1).
 *
 * These signatures first took a raw `agentKey` — any caller could mint
 * agent-attributed `ai_calls` rows without passing the ceiling. Taking an
 * `AgentContext` instead was still not enough: a context proves only WHO is
 * acting, so a future entry point could build an authentic one and never
 * gate it.
 *
 * So the gateway demands an `AgentGrant`, which `assertAgentMay` mints only
 * after the ceiling passes and only for a specific action. Attribution now
 * requires proof that the gate actually ran. A forged grant degrades the row
 * to UNATTRIBUTED — the model call itself is not a mutation, so failing it
 * would turn a logging concern into an outage — and raises a security event.
 */
function attributedAgent(grant?: AgentGrant): string | undefined {
  if (grant === undefined) return undefined;
  if (!isAgentGrant(grant)) {
    console.error(
      "[frank:security] AI call supplied an AgentGrant that assertAgentMay " +
        "never minted; logging the call as unattributed"
    );
    return undefined;
  }
  return grant.agentKey;
}

async function logCall(input: {
  purpose: string;
  model: string;
  /** Derived INTERNALLY from a verified AgentGrant — never accepted from a
   *  caller (Temujin PR-8 r1 #1, r2 #1). Null for human-invoked calls. */
  agentKey?: string;
  inputTokens?: number;
  outputTokens?: number;
  ok: boolean;
  error?: string;
}) {
  try {
    const db = getDb();
    await db.insert(aiCalls).values({
      purpose: input.purpose,
      model: input.model,
      agentKey: input.agentKey ?? null,
      promptVersion: PROMPT_VERSION,
      dataClass: DATA_CLASS,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      ok: input.ok,
      error: input.error ?? null,
    });
  } catch {
    // logging must never break the main flow
  }
}

export type AiResult<T> =
  | { ok: true; value: T; model: string }
  | { ok: false; unavailable: true; reason: string };

/**
 * Structured call: prompt in, zod-validated object out.
 * Redaction is applied to the prompt unless a field is explicitly allowlisted.
 */
export async function callStructured<T>(input: {
  purpose: "classify" | "extract" | "categorize";
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  keepIban?: boolean;
  /** The grant returned by `assertAgentMay` for this action. Attribution
   *  requires proof the ceiling was checked — not merely who is calling. */
  grant?: AgentGrant;
}): Promise<AiResult<T>> {
  if (await capExceeded()) {
    return { ok: false, unavailable: true, reason: "token_cap" };
  }
  try {
    const res = await generateObject({
      model: MODEL_STRUCTURED,
      schema: input.schema,
      system: input.system,
      prompt: redact(input.prompt, { keepIban: input.keepIban }),
    });
    await logCall({
      purpose: input.purpose,
      model: MODEL_STRUCTURED,
      agentKey: attributedAgent(input.grant),
      inputTokens: res.usage?.inputTokens,
      outputTokens: res.usage?.outputTokens,
      ok: true,
    });
    // generateObject already validates against the schema; parse again for
    // defense in depth (server-side validation is the contract).
    const parsed = input.schema.safeParse(res.object);
    if (!parsed.success) {
      return { ok: false, unavailable: true, reason: "schema_mismatch" };
    }
    return { ok: true, value: parsed.data, model: MODEL_STRUCTURED };
  } catch (e) {
    await logCall({
      purpose: input.purpose,
      model: MODEL_STRUCTURED,
      agentKey: attributedAgent(input.grant),
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, unavailable: true, reason: "model_error" };
  }
}

/**
 * Streaming chat through the gateway (the ONLY way to stream a model in
 * Frank OS — Temujin code review finding 1). Applies the cap, redacts user
 * message text before model transit, and logs usage on finish. Tool outputs
 * must already be redacted by the tools themselves; the copilot tools all
 * route their text through redact() and mask account numbers.
 */
export async function callChatStream(input: {
  purpose: "copilot";
  system: string;
  messages: UIMessage[];
  tools: ToolSet;
  maxSteps?: number;
}): Promise<
  | { ok: true; result: ReturnType<typeof streamText> }
  | { ok: false; unavailable: true; reason: string }
> {
  if (await capExceeded()) {
    return { ok: false, unavailable: true, reason: "token_cap" };
  }
  const redactedMessages = input.messages.map((m) => ({
    ...m,
    parts: m.parts.map((p) =>
      p.type === "text" ? { ...p, text: redact(p.text) } : p
    ),
  }));
  try {
    const result = streamText({
      model: MODEL_DRAFTING,
      system: input.system,
      messages: await convertToModelMessages(redactedMessages),
      tools: input.tools,
      stopWhen: stepCountIs(input.maxSteps ?? 6),
      onFinish: async ({ totalUsage }) => {
        await logCall({
          purpose: input.purpose,
          model: MODEL_DRAFTING,
          inputTokens: totalUsage?.inputTokens,
          outputTokens: totalUsage?.outputTokens,
          ok: true,
        });
      },
      onError: async ({ error }) => {
        await logCall({
          purpose: input.purpose,
          model: MODEL_DRAFTING,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      },
    });
    return { ok: true, result };
  } catch (e) {
    // No agentKey: the copilot runs as the human who opened it, not as an
    // agent. Only agent-driven calls are attributed to an agent.
    await logCall({
      purpose: input.purpose,
      model: MODEL_DRAFTING,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, unavailable: true, reason: "model_error" };
  }
}

/** Drafting call (letters, client messages, copilot summaries). */
export async function callDraft(input: {
  purpose: "draft" | "copilot";
  system: string;
  prompt: string;
  keepIban?: boolean;
  /** See callStructured. */
  grant?: AgentGrant;
}): Promise<AiResult<string>> {
  if (await capExceeded()) {
    return { ok: false, unavailable: true, reason: "token_cap" };
  }
  try {
    const res = await generateText({
      model: MODEL_DRAFTING,
      system: input.system,
      prompt: redact(input.prompt, { keepIban: input.keepIban }),
    });
    await logCall({
      purpose: input.purpose,
      model: MODEL_DRAFTING,
      agentKey: attributedAgent(input.grant),
      inputTokens: res.usage?.inputTokens,
      outputTokens: res.usage?.outputTokens,
      ok: true,
    });
    return { ok: true, value: res.text, model: MODEL_DRAFTING };
  } catch (e) {
    await logCall({
      purpose: input.purpose,
      model: MODEL_DRAFTING,
      agentKey: attributedAgent(input.grant),
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, unavailable: true, reason: "model_error" };
  }
}
