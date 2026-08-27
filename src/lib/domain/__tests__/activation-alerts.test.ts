import { describe, it, expect } from "vitest";
import {
  isFailureOutstanding,
  outstandingFailures,
} from "../activation-alerts";

const fail = (dossierId: string, failedAt: string) => ({ dossierId, failedAt });
const rec = (dossierId: string, evaluatedAt: string) => ({
  dossierId,
  evaluatedAt,
});

describe("isFailureOutstanding", () => {
  it("is outstanding with no reconciliation at all", () => {
    expect(isFailureOutstanding(fail("a", "2026-08-27T10:00:00Z"), [])).toBe(
      true
    );
  });

  it("clears when THAT dossier was evaluated afterwards", () => {
    expect(
      isFailureOutstanding(fail("a", "2026-08-27T10:00:00Z"), [
        rec("a", "2026-08-27T11:00:00Z"),
      ])
    ).toBe(false);
  });

  it("does NOT clear from another dossier's reconciliation", () => {
    // Temujin PR-11 r5: an office-wide marker would silently clear an
    // unresolved failure on a different client.
    expect(
      isFailureOutstanding(fail("a", "2026-08-27T10:00:00Z"), [
        rec("b", "2026-08-27T11:00:00Z"),
        rec("c", "2026-08-27T12:00:00Z"),
      ])
    ).toBe(true);
  });

  it("does NOT clear from a reconciliation that ran BEFORE the failure", () => {
    expect(
      isFailureOutstanding(fail("a", "2026-08-27T10:00:00Z"), [
        rec("a", "2026-08-27T09:00:00Z"),
      ])
    ).toBe(true);
  });

  it("does NOT clear a failure that happened DURING the pass", () => {
    // The pass evaluated A at 10:00 and its row was written at 10:05, but A's
    // scheduling failed at 10:02 — after the pass had already looked at it.
    // Comparing write times would wrongly clear it; comparing evaluation
    // times does not.
    expect(
      isFailureOutstanding(fail("a", "2026-08-27T10:02:00Z"), [
        rec("a", "2026-08-27T10:00:00Z"),
      ])
    ).toBe(true);
  });

  it("clears on the next pass after a concurrent failure", () => {
    expect(
      isFailureOutstanding(fail("a", "2026-08-27T10:02:00Z"), [
        rec("a", "2026-08-27T10:00:00Z"),
        rec("a", "2026-08-27T10:30:00Z"),
      ])
    ).toBe(false);
  });

  it("treats an exactly-simultaneous reconciliation as not clearing", () => {
    // Strictly later, never equal: a tie means we cannot tell which came
    // first, and the safe direction is to leave the warning up.
    expect(
      isFailureOutstanding(fail("a", "2026-08-27T10:00:00Z"), [
        rec("a", "2026-08-27T10:00:00Z"),
      ])
    ).toBe(true);
  });
});

describe("outstandingFailures", () => {
  it("keeps only the dossiers that are genuinely unresolved", () => {
    const out = outstandingFailures(
      [
        fail("a", "2026-08-27T10:00:00Z"),
        fail("b", "2026-08-27T10:00:00Z"),
        fail("c", "2026-08-27T10:00:00Z"),
      ],
      [rec("a", "2026-08-27T11:00:00Z"), rec("c", "2026-08-27T09:00:00Z")]
    );
    expect(out.map((f) => f.dossierId)).toEqual(["b", "c"]);
  });

  it("returns nothing when there is nothing wrong", () => {
    expect(outstandingFailures([], [])).toEqual([]);
  });
});
