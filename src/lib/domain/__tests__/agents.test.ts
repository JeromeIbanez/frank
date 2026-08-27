import { describe, it, expect } from "vitest";
import {
  AGENTS,
  AGENT_KEYS,
  ACTION_CATEGORY,
  agentMay,
  isAgentKey,
  type AgentActionClass,
  type AgentKey,
} from "../agents";

/** Every action class, listed literally. If the union grows, this list must
 *  grow with it — the exhaustiveness check below fails otherwise. */
const ALL_ACTIONS: AgentActionClass[] = [
  "message_ingest",
  "document_create",
  "document_classify",
  "dossier_link",
  "proposal_create",
  "letter_draft",
  "obligation_create",
  "safeguarding_case_open",
  "clarification_draft",
  "escalation_draft",
  "task_suggest",
  "process_step_suggest",
  "batch_draft",
];

describe("agent action vocabulary", () => {
  it("classifies every action into a §2.1 write category", () => {
    // ACTION_CATEGORY is Record<AgentActionClass, …>, so a missing key is a
    // compile error; this asserts the runtime shape matches too.
    expect(Object.keys(ACTION_CATEGORY).sort()).toEqual(
      [...ALL_ACTIONS].sort()
    );
  });

  it("permits exactly one protective action — opening a safeguarding case", () => {
    const protective = ALL_ACTIONS.filter(
      (a) => ACTION_CATEGORY[a] === "protective"
    );
    expect(protective.sort()).toEqual(
      ["obligation_create", "safeguarding_case_open"].sort()
    );
  });

  it("contains no consequential act (os-v2 N3 / §2.1)", () => {
    // The compile-time guard is ASSERT_NO_CONSEQUENTIAL_LEAK in agents.ts.
    // This is the runtime mirror: these names must never be actions.
    const consequential = [
      "debt_event_apply",
      "payment_execute",
      "batch_approve",
      "batch_export",
      "letter_approve",
      "letter_mark_sent",
      "court_file",
      "message_send",
      "safeguarding_case_dispose",
      "machtiging_resolve",
      "rv_period_record",
      "actor_manage",
    ];
    for (const name of consequential) {
      expect(ALL_ACTIONS).not.toContain(name);
      expect(Object.keys(ACTION_CATEGORY)).not.toContain(name);
    }
  });
});

describe("agent registry", () => {
  it("keys every definition consistently", () => {
    for (const key of AGENT_KEYS) {
      expect(AGENTS[key].key).toBe(key);
    }
  });

  it("gives every agent a charter in both languages", () => {
    for (const key of AGENT_KEYS) {
      expect(AGENTS[key].charterNl.length).toBeGreaterThan(20);
      expect(AGENTS[key].charterEn.length).toBeGreaterThan(20);
    }
  });

  it("keeps grants and neverGrants disjoint", () => {
    for (const key of AGENT_KEYS) {
      const { grants, neverGrants } = AGENTS[key];
      const overlap = grants.filter((g) => neverGrants.includes(g));
      expect(overlap, `${key} grants and neverGrants overlap`).toEqual([]);
    }
  });

  it("only ever grants actions in the vocabulary", () => {
    for (const key of AGENT_KEYS) {
      for (const g of AGENTS[key].grants) expect(ALL_ACTIONS).toContain(g);
      for (const n of AGENTS[key].neverGrants) expect(ALL_ACTIONS).toContain(n);
    }
  });
});

describe("agentMay — the ceiling", () => {
  it("allows a granted action", () => {
    expect(agentMay("postbode", "letter_draft")).toEqual({ allowed: true });
  });

  it("denies an action the agent was never granted", () => {
    expect(agentMay("postbode", "task_suggest")).toEqual({
      allowed: false,
      reason: "not_granted",
    });
  });

  it("denies an explicitly never-granted action", () => {
    expect(agentMay("postbode", "safeguarding_case_open")).toEqual({
      allowed: false,
      reason: "never_granted",
    });
  });

  it("lets neverGrants beat grants if they ever overlap", () => {
    // Defence in depth: a bad edit that grants and forbids the same action
    // must fail SAFE. Constructed here rather than shipped in the registry.
    const rogue = {
      ...AGENTS.postbode,
      grants: ["safeguarding_case_open"] as AgentActionClass[],
      neverGrants: ["safeguarding_case_open"] as AgentActionClass[],
    };
    const saved = AGENTS.postbode;
    (AGENTS as Record<AgentKey, typeof rogue>).postbode = rogue;
    try {
      expect(agentMay("postbode", "safeguarding_case_open")).toEqual({
        allowed: false,
        reason: "never_granted",
      });
    } finally {
      (AGENTS as Record<AgentKey, typeof saved>).postbode = saved;
    }
  });

  it("does not let one agent inherit another's grants", () => {
    // Waakhond may open cases; Postbode may not. Postbode may ingest; Waakhond
    // may not. The two ceilings are genuinely separate.
    expect(agentMay("waakhond", "safeguarding_case_open").allowed).toBe(true);
    expect(agentMay("postbode", "safeguarding_case_open").allowed).toBe(false);
    expect(agentMay("postbode", "message_ingest").allowed).toBe(true);
    expect(agentMay("waakhond", "message_ingest").allowed).toBe(false);
  });

  it("denies every action for an agent that grants nothing", () => {
    const saved = AGENTS.griffier;
    (AGENTS as Record<string, unknown>).griffier = {
      ...saved,
      grants: [],
      neverGrants: [],
    };
    try {
      for (const a of ALL_ACTIONS) {
        expect(agentMay("griffier", a).allowed).toBe(false);
      }
    } finally {
      (AGENTS as Record<string, unknown>).griffier = saved;
    }
  });
});

describe("isAgentKey", () => {
  it("accepts registered keys and rejects everything else", () => {
    expect(isAgentKey("postbode")).toBe(true);
    expect(isAgentKey("waakhond")).toBe(true);
    expect(isAgentKey("admin")).toBe(false);
    expect(isAgentKey("")).toBe(false);
    expect(isAgentKey(null)).toBe(false);
    expect(isAgentKey(undefined)).toBe(false);
    expect(isAgentKey({ toString: () => "postbode" })).toBe(false);
    // Prototype keys must not read as registered agents.
    expect(isAgentKey("constructor")).toBe(false);
    expect(isAgentKey("toString")).toBe(false);
    expect(isAgentKey("__proto__")).toBe(false);
  });
});
