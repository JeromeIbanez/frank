/**
 * Agent registry and capability ceilings — pure functions, no I/O
 * (plan os-v2 W0 / PR-8).
 *
 * THE POINT OF THIS MODULE
 * ------------------------
 * A prompt is not a permission system. An agent's limits are decided here,
 * in code that is reviewed like any other code, and enforced server-side at
 * the mutating entry point (see lib/agent-context.ts). No model output can
 * widen a grant, and no model output can name its own actor.
 *
 * The strongest guarantee is structural rather than a deny-list: the
 * `AgentActionClass` vocabulary contains ONLY the pre-decision writes that
 * plan os-v2 §2.1 permits. Applying a debt event, moving money, approving,
 * filing with a court, sending outbound, and disposing of a safeguarding
 * case are not in the vocabulary at all, so an agent cannot ask for them.
 * `ASSERT_NO_CONSEQUENTIAL_LEAK` below makes that a compile error rather
 * than a convention.
 *
 * Charters are code, not configuration: changing what an agent may do is a
 * reviewed diff, not a toggle.
 */

export type AgentKey =
  | "postbode"
  | "waakhond"
  | "griffier"
  | "kassier"
  | "rechtenjager";

/**
 * Every mutating entry point an agent can reach. Deliberately distinct from
 * `PrivilegedAction` in authz.ts, which enumerates human-reserved acts
 * (Temujin os-v2 r1 #2): the two vocabularies describe different things and
 * conflating them would let an agent inherit a human's legal authority.
 */
export type AgentActionClass =
  // Postbode — the intake driver
  | "message_ingest"
  | "document_create"
  | "document_classify"
  | "dossier_link"
  | "proposal_create"
  | "letter_draft"
  // Waakhond — safeguarding
  | "safeguarding_case_open"
  | "clarification_draft"
  | "escalation_draft"
  // Griffier / Kassier — later PRs, declared now so the ceiling exists first
  | "task_suggest"
  | "process_step_suggest"
  | "batch_draft";

/**
 * Which of plan os-v2 §2.1's four categories each action falls in. The
 * `Record` is exhaustive by construction: adding a member to
 * `AgentActionClass` without classifying it here is a compile error, so a
 * new agent capability cannot ship unclassified.
 */
export type WriteCategory =
  /** A — immutable inbound fact: asserts only that something arrived. */
  | "inbound_fact"
  /** B — attributable, revisable interpretation; never presented as confirmed. */
  | "interpretation"
  /** C — draft or proposal; inert until a human accepts it. */
  | "draft"
  /**
   * D — protective work item. Opening a safeguarding case is neither a draft
   * nor inert (Temujin os-v2 r3): it creates a real work item about a real
   * person. It is permitted because FAILING to open one is the more dangerous
   * error, and it is non-conclusive by construction — immutable detector
   * evidence, wording that asserts nothing, and no agent disposition.
   */
  | "protective";

export const ACTION_CATEGORY: Record<AgentActionClass, WriteCategory> = {
  message_ingest: "inbound_fact",
  document_create: "inbound_fact",
  document_classify: "interpretation",
  dossier_link: "interpretation",
  proposal_create: "draft",
  letter_draft: "draft",
  safeguarding_case_open: "protective",
  clarification_draft: "draft",
  escalation_draft: "draft",
  task_suggest: "draft",
  process_step_suggest: "draft",
  batch_draft: "draft",
};

/**
 * Acts that materialize or alter consequential domain state. These are NOT
 * `AgentActionClass` members and must never become members — the assertion
 * below fails to compile if one ever leaks in.
 */
type ConsequentialAction =
  | "debt_event_apply"
  | "payment_execute"
  | "batch_approve"
  | "batch_export"
  | "letter_approve"
  | "letter_mark_sent"
  | "court_file"
  | "message_send"
  | "safeguarding_case_dispose"
  | "machtiging_resolve"
  | "rv_period_record"
  | "actor_manage";

/** Compile-time proof that the agent vocabulary and the consequential-act
 *  vocabulary are disjoint (plan os-v2 N3 / §2.1). */
type NoConsequentialLeak =
  Extract<AgentActionClass, ConsequentialAction> extends never ? true : never;
export const ASSERT_NO_CONSEQUENTIAL_LEAK: NoConsequentialLeak = true;

export type AgentDefinition = {
  readonly key: AgentKey;
  /** Shown in the UI. Dutch is the office language; English for the toggle. */
  readonly charterNl: string;
  readonly charterEn: string;
  readonly grants: readonly AgentActionClass[];
  /** Defence in depth: always beats `grants`, even on overlap. */
  readonly neverGrants: readonly AgentActionClass[];
};

export const AGENTS: Record<AgentKey, AgentDefinition> = {
  postbode: {
    key: "postbode",
    charterNl:
      "Neemt inkomende post aan, herkent het document, stelt een dossier voor " +
      "en bereidt een concept-antwoord voor. Beslist nooit zelf.",
    charterEn:
      "Receives inbound mail, recognises the document, proposes a dossier and " +
      "prepares a draft reply. Never decides anything itself.",
    grants: [
      "message_ingest",
      "document_create",
      "document_classify",
      "dossier_link",
      "proposal_create",
      "letter_draft",
    ],
    neverGrants: [
      "safeguarding_case_open",
      "clarification_draft",
      "escalation_draft",
      "batch_draft",
    ],
  },
  waakhond: {
    key: "waakhond",
    charterNl:
      "Signaleert onverklaarde betaalpatronen bij de cliënt én bij het kantoor " +
      "zelf, en stelt een vraag ter verduidelijking op. Trekt geen conclusies.",
    charterEn:
      "Flags unexplained payment patterns, for the client and for the office " +
      "itself, and drafts a question seeking clarification. Draws no conclusions.",
    grants: [
      "safeguarding_case_open",
      "clarification_draft",
      "escalation_draft",
    ],
    neverGrants: [
      "message_ingest",
      "dossier_link",
      "proposal_create",
      "batch_draft",
    ],
  },
  griffier: {
    key: "griffier",
    charterNl:
      "Bewaakt termijnen en bereidt stukken voor de rechtbank voor als concept. " +
      "Dient nooit zelf in.",
    charterEn:
      "Tracks deadlines and prepares court documents as drafts. Never files.",
    grants: ["letter_draft", "task_suggest", "process_step_suggest"],
    neverGrants: ["message_ingest", "dossier_link", "batch_draft"],
  },
  kassier: {
    key: "kassier",
    charterNl:
      "Kijkt vooruit op de maand en bereidt een betaalvoorstel voor. " +
      "Keurt nooit goed en verstuurt nooit.",
    charterEn:
      "Looks ahead over the month and prepares a payment proposal. Never " +
      "approves and never sends.",
    grants: ["batch_draft", "task_suggest", "proposal_create"],
    neverGrants: ["message_ingest", "dossier_link", "safeguarding_case_open"],
  },
  rechtenjager: {
    key: "rechtenjager",
    charterNl:
      "Controleert of de cliënt alle toeslagen en regelingen krijgt waar recht " +
      "op bestaat, en stelt aanvragen als concept voor.",
    charterEn:
      "Checks whether the client receives every benefit and scheme they are " +
      "entitled to, and proposes applications as drafts.",
    grants: ["proposal_create", "letter_draft", "task_suggest"],
    neverGrants: ["message_ingest", "dossier_link", "safeguarding_case_open"],
  },
};

export type AgentVerdict =
  | { allowed: true }
  | { allowed: false; reason: "never_granted" | "not_granted" | "unknown_agent" };

/**
 * The ceiling. Pure: the caller supplies the agent key, this decides.
 *
 * `neverGrants` is checked FIRST so that an accidental overlap resolves to
 * denial rather than permission. (A test asserts the two lists are disjoint
 * for every agent — an overlap is a bug, but it must fail safe meanwhile.)
 */
export function agentMay(
  key: AgentKey,
  action: AgentActionClass
): AgentVerdict {
  // Guard even though the type forbids it: a prototype key like
  // "constructor" would otherwise resolve to a function with no grants
  // array and throw rather than deny.
  if (!isAgentKey(key)) return { allowed: false, reason: "unknown_agent" };
  const def = AGENTS[key];
  if (def.neverGrants.includes(action))
    return { allowed: false, reason: "never_granted" };
  if (!def.grants.includes(action))
    return { allowed: false, reason: "not_granted" };
  return { allowed: true };
}

export const AGENT_KEYS = Object.keys(AGENTS) as AgentKey[];

export function isAgentKey(v: unknown): v is AgentKey {
  // `hasOwn`, NOT `in`: `"constructor" in AGENTS` and `"__proto__" in AGENTS`
  // are both true via the prototype chain, which would make them valid agent
  // keys and hand an attacker-controlled string a ceiling lookup.
  return typeof v === "string" && Object.hasOwn(AGENTS, v);
}
