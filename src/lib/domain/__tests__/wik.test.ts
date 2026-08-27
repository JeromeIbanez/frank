import { describe, it, expect } from "vitest";
import {
  WIK_SCHEDULES,
  wikScheduleFor,
  wikMaximumCents,
  checkWikAmount,
  checkWikNotice,
} from "../wik";

const schedule = WIK_SCHEDULES[0];
const ON = "2026-08-27";

describe("WIK staffel — the dataset itself", () => {
  it("matches the BIK bands, minimum and maximum", () => {
    expect(schedule.bands.map((b) => [b.upToCents, b.basisPoints])).toEqual([
      [250_000, 1500],
      [500_000, 1000],
      [1_000_000, 500],
      [20_000_000, 100],
      [null, 50],
    ]);
    expect(schedule.minimumCents).toBe(4_000);
    expect(schedule.maximumCents).toBe(677_500);
  });

  it("documents its rounding rule and source", () => {
    expect(schedule.rounding).toBe("half_up_to_cent");
    expect(schedule.sourceUrl).toContain("wetten.overheid.nl");
  });

  it("selects a schedule by date and refuses pre-BIK dates", () => {
    expect(wikScheduleFor(ON)?.version).toBe(schedule.version);
    expect(wikScheduleFor("2010-01-01")).toBeNull();
  });
});

describe("wikMaximumCents", () => {
  it("computes the Temujin r1 example exactly: 15% of €412,30", () => {
    // 41230 * 1500 / 10000 = 6184.5 → half-up → 6185 = €61,85.
    // This is the case where my rev-1 demo was WRONG: €61,85 is the correctly
    // rounded CAP, not an overcharge.
    expect(wikMaximumCents(41_230, schedule)).toBe(6_185);
  });

  it("applies the €40 minimum on small principals", () => {
    expect(wikMaximumCents(10_000, schedule)).toBe(4_000);
  });

  it("finds the point where the percentage overtakes the minimum", () => {
    // 15% reaches €40 at a principal of €266,67.
    expect(wikMaximumCents(26_666, schedule)).toBe(4_000);
    expect(wikMaximumCents(26_667, schedule)).toBe(4_000);
    expect(wikMaximumCents(30_000, schedule)).toBe(4_500);
  });

  it("spans band boundaries correctly", () => {
    expect(wikMaximumCents(250_000, schedule)).toBe(37_500); // €2.500 → €375
    expect(wikMaximumCents(500_000, schedule)).toBe(62_500); // €5.000 → €625
    expect(wikMaximumCents(1_000_000, schedule)).toBe(87_500); // €10.000 → €875
    expect(wikMaximumCents(20_000_000, schedule)).toBe(277_500); // €200.000 → €2.775
  });

  it("caps at €6.775 however large the principal", () => {
    expect(wikMaximumCents(100_000_000, schedule)).toBe(677_500);
    expect(wikMaximumCents(999_999_999, schedule)).toBe(677_500);
  });

  it("returns 0 for non-positive or non-integer principals", () => {
    expect(wikMaximumCents(0, schedule)).toBe(0);
    expect(wikMaximumCents(-100, schedule)).toBe(0);
    expect(wikMaximumCents(12.5, schedule)).toBe(0);
  });
});

describe("checkWikAmount — abstains unless every precondition is evidenced", () => {
  const base = {
    principalCents: 41_230,
    chargedCostsCents: 7_500,
    applicabilityBasis: "creditor_invoked_bik" as const,
    onDate: ON,
  };

  it("finds a genuine overcharge", () => {
    const r = checkWikAmount(base);
    if (r.finding !== "wik_amount_exceeds_cap") throw new Error("expected finding");
    expect(r.maximumCents).toBe(6_185);
    expect(r.excessCents).toBe(1_315); // €75,00 charged vs €61,85 cap
  });

  it("does NOT fire on the correctly rounded cap", () => {
    // The rev-1 demo figure — the regression guard for that mistake.
    expect(checkWikAmount({ ...base, chargedCostsCents: 6_185 }).finding).toBe(
      "none"
    );
  });

  it("does not fire on a sub-de-minimis difference", () => {
    expect(checkWikAmount({ ...base, chargedCostsCents: 6_186 }).finding).toBe(
      "none"
    );
  });

  it("abstains without a principal", () => {
    const r = checkWikAmount({ ...base, principalCents: undefined });
    if (r.finding !== "none") throw new Error("expected abstention");
    expect(r.missing).toContain("principal");
  });

  it("abstains without an evidenced applicability basis", () => {
    const r = checkWikAmount({ ...base, applicabilityBasis: undefined });
    if (r.finding !== "none") throw new Error("expected abstention");
    expect(r.missing).toContain("applicabilityBasis");
  });

  it("abstains without charged costs", () => {
    const r = checkWikAmount({ ...base, chargedCostsCents: undefined });
    if (r.finding !== "none") throw new Error("expected abstention");
    expect(r.missing).toContain("chargedCosts");
  });

  it("carries the dataset version and source on any finding", () => {
    const r = checkWikAmount(base);
    if (r.finding !== "wik_amount_exceeds_cap") throw new Error("expected finding");
    expect(r.datasetVersion).toBe(schedule.version);
    expect(r.sourceUrl).toBe(schedule.sourceUrl);
  });
});

describe("checkWikNotice — receipt, not dispatch", () => {
  it("abstains without delivery evidence, even with the notice in hand", () => {
    // N4b: Frank not having seen delivery proves nothing about what the
    // creditor sent. This is the common case, and abstention is correct.
    const r = checkWikNotice({
      consumerStatusEvidenced: true,
      noticeContentEvidenced: true,
      costsChargedOn: "2026-08-20",
    });
    if (r.finding !== "none") throw new Error("expected abstention");
    expect(r.missing).toContain("receiptEvidence");
  });

  it("abstains without the notice content", () => {
    const r = checkWikNotice({
      consumerStatusEvidenced: true,
      receiptEvidencedOn: "2026-08-01",
      costsChargedOn: "2026-08-20",
    });
    if (r.finding !== "none") throw new Error("expected abstention");
    expect(r.missing).toContain("noticeContent");
  });

  it("abstains without documented CONSUMER status — the notice duty is consumer-specific", () => {
    // Temujin PR-9 r2 #3: a creditor invoking the BIK regime is not evidence
    // that the debtor acted outside a profession or business, and the 14-day
    // notice duty is exactly the part where that distinction bites.
    const r = checkWikNotice({
      noticeContentEvidenced: true,
      receiptEvidencedOn: "2026-08-01",
      costsChargedOn: "2026-08-10",
    });
    if (r.finding !== "none") throw new Error("expected abstention");
    expect(r.missing).toContain("consumerStatus");
  });

  it("fires when costs were charged inside the 14-day window", () => {
    expect(
      checkWikNotice({
        consumerStatusEvidenced: true,
        noticeContentEvidenced: true,
        receiptEvidencedOn: "2026-08-01",
        costsChargedOn: "2026-08-10",
      }).finding
    ).toBe("wik_notice_period_short");
  });

  it("does not fire once a full 14 days have passed since RECEIPT", () => {
    expect(
      checkWikNotice({
        consumerStatusEvidenced: true,
        noticeContentEvidenced: true,
        receiptEvidencedOn: "2026-08-01",
        costsChargedOn: "2026-08-16",
      }).finding
    ).toBe("none");
  });

  it("treats exactly 14 days as still inside the window", () => {
    expect(
      checkWikNotice({
        consumerStatusEvidenced: true,
        noticeContentEvidenced: true,
        receiptEvidencedOn: "2026-08-01",
        costsChargedOn: "2026-08-15",
      }).finding
    ).toBe("wik_notice_period_short");
  });
});
