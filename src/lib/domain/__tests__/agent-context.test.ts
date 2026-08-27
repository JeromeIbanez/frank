import { describe, it, expect } from "vitest";
import {
  agentContext,
  isAgentContext,
  assertAgentMay,
  agentActorId,
  agentCharter,
  isAgentGrant,
  AgentCeilingError,
  type AgentContext,
} from "@/lib/agent-context";

/**
 * The point of these tests (plan os-v2 N1b): identity must be nominal AT
 * RUNTIME. A structural type is erased, so anything that can reach an action
 * boundary — a route handler reading JSON, a tool result, a model's own
 * output — could otherwise name itself an agent and inherit its grants.
 */

describe("AgentContext is a real runtime boundary, not a shape", () => {
  it("accepts a context built by the only constructor", () => {
    const ctx = agentContext("postbode");
    expect(isAgentContext(ctx)).toBe(true);
    expect(ctx.agentKey).toBe("postbode");
    expect(ctx.correlationId).toBeTruthy();
  });

  it("rejects an object literal with the identical shape", () => {
    const forged = { agentKey: "postbode", correlationId: "abc" };
    expect(isAgentContext(forged)).toBe(false);
  });

  it("rejects a structurally-typed cast", () => {
    const forged = {
      agentKey: "postbode",
      correlationId: "abc",
    } as unknown as AgentContext;
    expect(isAgentContext(forged)).toBe(false);
  });

  it("rejects a shallow copy of a REAL context", () => {
    // Spreading a genuine context produces a new object that was never
    // registered — so a caller cannot launder one agent's identity.
    const real = agentContext("postbode");
    expect(isAgentContext({ ...real })).toBe(false);
  });

  it("rejects an object built from the real prototype", () => {
    const real = agentContext("postbode");
    const forged = Object.create(Object.getPrototypeOf(real));
    Object.assign(forged, real);
    expect(isAgentContext(forged)).toBe(false);
  });

  it("rejects JSON round-tripping, which is how a model would supply one", () => {
    const real = agentContext("waakhond");
    const forged = JSON.parse(JSON.stringify(real));
    expect(isAgentContext(forged)).toBe(false);
  });

  it("rejects structuredClone — the structural-clone boundary", () => {
    // Temujin PR-8 r1: structuredClone is the one serialisation path that
    // preserves more than JSON does, so it is worth proving explicitly.
    const real = agentContext("postbode");
    expect(isAgentContext(structuredClone(real))).toBe(false);
  });

  it("rejects non-objects", () => {
    for (const v of [null, undefined, "postbode", 42, true, Symbol("x")]) {
      expect(isAgentContext(v)).toBe(false);
    }
  });

  it("freezes the context so its identity cannot be mutated after creation", () => {
    const ctx = agentContext("postbode");
    expect(Object.isFrozen(ctx)).toBe(true);
    // Silently ignored in sloppy mode, throws in strict — either way the
    // key must not change.
    try {
      (ctx as { agentKey: string }).agentKey = "waakhond";
    } catch {
      /* strict mode */
    }
    expect(ctx.agentKey).toBe("postbode");
  });

  it("refuses to construct from an unregistered key", () => {
    expect(() =>
      agentContext("admin" as Parameters<typeof agentContext>[0])
    ).toThrow(AgentCeilingError);
    // Prototype keys must not slip through either.
    expect(() =>
      agentContext("constructor" as Parameters<typeof agentContext>[0])
    ).toThrow(AgentCeilingError);
  });

  it("gives each context its own correlation id unless one is supplied", () => {
    expect(agentContext("postbode").correlationId).not.toBe(
      agentContext("postbode").correlationId
    );
    expect(agentContext("postbode", "fixed-id").correlationId).toBe("fixed-id");
  });
});

describe("assertAgentMay — the gate", () => {
  it("passes a granted action and returns a grant for it", async () => {
    const grant = await assertAgentMay(agentContext("postbode"), "letter_draft");
    expect(isAgentGrant(grant)).toBe(true);
  });

  it("THROWS on an action outside the grant — never a silent no-op", async () => {
    // os-v1 PR-4 R2 found an unenforced permission that returned success and
    // wrote nothing. A control that fails quietly reads as working.
    const ctx = agentContext("postbode");
    await expect(assertAgentMay(ctx, "task_suggest")).rejects.toThrow(
      AgentCeilingError
    );
    await expect(assertAgentMay(ctx, "task_suggest")).rejects.toMatchObject({
      denial: "not_granted",
    });
  });

  it("throws with never_granted for an explicitly forbidden action", async () => {
    await expect(
      assertAgentMay(agentContext("postbode"), "safeguarding_case_open")
    ).rejects.toMatchObject({ denial: "never_granted" });
  });

  it("throws on a forged context before it ever consults the ceiling", async () => {
    const forged = {
      agentKey: "postbode",
      correlationId: "abc",
    } as unknown as AgentContext;
    // "letter_draft" IS granted to postbode — so this must fail on identity,
    // not on the grant, proving the forgery check runs first.
    await expect(assertAgentMay(forged, "letter_draft")).rejects.toMatchObject({
      denial: "forged_context",
    });
  });

  it("does not let a forged waakhond open a safeguarding case", async () => {
    const forged = {
      agentKey: "waakhond",
      correlationId: "abc",
    } as unknown as AgentContext;
    await expect(
      assertAgentMay(forged, "safeguarding_case_open")
    ).rejects.toMatchObject({ denial: "forged_context" });
  });
});

describe("AgentGrant — proof the gate actually ran", () => {
  it("is minted by assertAgentMay, scoped to the action", async () => {
    const ctx = agentContext("postbode");
    const grant = await assertAgentMay(ctx, "letter_draft");
    expect(isAgentGrant(grant)).toBe(true);
    expect(grant.agentKey).toBe("postbode");
    expect(grant.action).toBe("letter_draft");
    expect(grant.correlationId).toBe(ctx.correlationId);
  });

  it("cannot be forged from an authentic context alone", async () => {
    // The bypass Temujin found in r2: a genuine context proves WHO is
    // acting, not that anyone asked permission. Building one and skipping
    // the gate must not produce something a downstream writer accepts.
    const ctx = agentContext("postbode");
    expect(isAgentGrant(ctx)).toBe(false);
    expect(
      isAgentGrant({
        agentKey: "postbode",
        action: "letter_draft",
        correlationId: ctx.correlationId,
      })
    ).toBe(false);
  });

  it("does not survive cloning or serialisation", async () => {
    const grant = await assertAgentMay(agentContext("postbode"), "letter_draft");
    expect(isAgentGrant({ ...grant })).toBe(false);
    expect(isAgentGrant(structuredClone(grant))).toBe(false);
    expect(isAgentGrant(JSON.parse(JSON.stringify(grant)))).toBe(false);
  });

  it("is never minted when the ceiling denies", async () => {
    const ctx = agentContext("postbode");
    await expect(
      assertAgentMay(ctx, "safeguarding_case_open")
    ).rejects.toThrow(AgentCeilingError);
  });

  it("is frozen, so its action scope cannot be widened after minting", async () => {
    const grant = await assertAgentMay(agentContext("postbode"), "letter_draft");
    expect(Object.isFrozen(grant)).toBe(true);
    try {
      (grant as { action: string }).action = "safeguarding_case_open";
    } catch {
      /* strict mode */
    }
    expect(grant.action).toBe("letter_draft");
  });

  it("is accepted as audit attribution; a bare forged grant is not", async () => {
    const grant = await assertAgentMay(agentContext("waakhond"), "escalation_draft");
    expect(agentActorId(grant)).toBe("agent:waakhond");
    expect(() =>
      agentActorId({
        agentKey: "waakhond",
        action: "escalation_draft",
        correlationId: "x",
      } as unknown as AgentContext)
    ).toThrow(AgentCeilingError);
  });
});

describe("helpers", () => {
  it("namespaces the audit actor id", () => {
    expect(agentActorId(agentContext("waakhond"))).toBe("agent:waakhond");
  });

  it("refuses to attribute an audit row to a forged context", () => {
    // Audit attribution must never be forgeable: it is the provenance a
    // rechtbank auditor would rely on. Temujin PR-8 r1 #2.
    const forged = {
      agentKey: "postbode",
      correlationId: "abc",
    } as unknown as AgentContext;
    expect(() => agentActorId(forged)).toThrow(AgentCeilingError);
    expect(() => agentActorId(structuredClone(agentContext("postbode")))).toThrow(
      AgentCeilingError
    );
  });

  it("returns the charter in the requested language", () => {
    expect(agentCharter("postbode", "nl")).toContain("post");
    expect(agentCharter("postbode", "en")).toContain("mail");
    // Unknown locale falls back to English rather than throwing.
    expect(agentCharter("postbode", "de").length).toBeGreaterThan(20);
  });
});
