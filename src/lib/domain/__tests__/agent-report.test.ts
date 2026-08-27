import { describe, it, expect } from "vitest";
import { automationCandidacy } from "@/lib/agent-report";
import type { AgentActivity } from "@/lib/agent-report";

const base: AgentActivity = {
  key: "postbode",
  calls: 0,
  failedCalls: 0,
  tokens: 0,
  proposed: 0,
  accepted: 0,
  rejected: 0,
  acceptedUnedited: 0,
  acceptedWithEdits: 0,
  acceptRate: null,
  medianMinutesToDecision: null,
  denials: 0,
};

describe("automationCandidacy — a recommendation, never a control", () => {
  it("says nothing at all on thin evidence", () => {
    const r = automationCandidacy({ ...base, acceptedUnedited: 10 });
    expect(r.status).toBe("insufficient_evidence");
    expect(r.uneditedShare).toBeNull();
  });

  it("calls a consistently-unedited class a candidate", () => {
    const r = automationCandidacy({ ...base, acceptedUnedited: 200 });
    expect(r.status).toBe("candidate");
    expect(r.uneditedShare).toBe(1);
  });

  it("does NOT call it a candidate when humans keep editing", () => {
    const r = automationCandidacy({
      ...base,
      acceptedUnedited: 60,
      acceptedWithEdits: 40,
    });
    expect(r.status).toBe("not_yet");
    expect(r.uneditedShare).toBeCloseTo(0.6);
  });

  it("counts rejections against the class, not just edits", () => {
    // 96 unedited out of 96 accepted looks perfect until you notice 30
    // rejections — the class is not reliable, it is merely unedited when it
    // happens to be right.
    const r = automationCandidacy({
      ...base,
      acceptedUnedited: 96,
      rejected: 30,
    });
    expect(r.status).toBe("not_yet");
  });

  it("is a pure observation — it exposes no way to enable anything", () => {
    // Plan os-v2 N3: rev 1 proposed auto-apply and it was cut in review.
    // The shape of the return value is the guarantee: a status and a share,
    // with nothing to flip.
    const r = automationCandidacy({ ...base, acceptedUnedited: 500 });
    expect(Object.keys(r).sort()).toEqual(["status", "uneditedShare"]);
  });
});
