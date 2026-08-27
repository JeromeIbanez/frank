import { describe, it, expect } from "vitest";
import { VERJARING_RULES, checkVerjaring, verjaringRule } from "../verjaring";

const TODAY = "2026-08-27";

describe("verjaring dataset", () => {
  it("cites a statutory article for every rule", () => {
    for (const r of VERJARING_RULES) {
      expect(r.article).toMatch(/^art\. \d/);
      expect(r.years).toBeGreaterThan(0);
      expect(r.labelNl.length).toBeGreaterThan(5);
      expect(r.labelEn.length).toBeGreaterThan(5);
    }
  });

  it("carries the periods it claims", () => {
    expect(verjaringRule("algemeen_nakoming")?.years).toBe(5);
    expect(verjaringRule("periodiek")?.years).toBe(5);
    expect(verjaringRule("consumentenkoop")?.years).toBe(2);
    expect(verjaringRule("rechterlijke_uitspraak")?.years).toBe(20);
    expect(verjaringRule("nonsense")).toBeNull();
  });
});

describe("checkVerjaring", () => {
  it("NEVER says verjaard — only possible, review required", () => {
    const r = checkVerjaring({
      ruleKey: "algemeen_nakoming",
      accrualDate: "2018-01-01",
      today: TODAY,
    });
    if (r.finding !== "verjaring_possible") throw new Error("expected finding");
    expect(r.labelNl).toBe("mogelijke verjaring — juridische toetsing vereist");
    expect(r.labelNl).not.toContain("is verjaard");
    expect(r.labelEn).toContain("possible");
    expect(r.labelEn).not.toMatch(/\bis time-barred\b/);
  });

  it("attaches the N4b caveat to every finding, in both languages", () => {
    const r = checkVerjaring({
      ruleKey: "algemeen_nakoming",
      accrualDate: "2018-01-01",
      today: TODAY,
    });
    if (r.finding !== "verjaring_possible") throw new Error("expected finding");
    // The caveat is not optional: it is what keeps the finding honest.
    expect(r.caveatNl).toContain("stuiting");
    expect(r.caveatNl).toContain("bewijst niet");
    expect(r.caveatEn).toContain("not proof that none");
  });

  it("abstains when the debt type is unknown", () => {
    const r = checkVerjaring({ accrualDate: "2010-01-01", today: TODAY });
    if (r.finding !== "none") throw new Error("expected abstention");
    expect(r.missing).toContain("debtType");
  });

  it("abstains without an evidenced accrual date", () => {
    const r = checkVerjaring({ ruleKey: "algemeen_nakoming", today: TODAY });
    if (r.finding !== "none") throw new Error("expected abstention");
    expect(r.missing).toContain("accrualDate");
  });

  it("does not fire while the period is still running", () => {
    expect(
      checkVerjaring({
        ruleKey: "algemeen_nakoming",
        accrualDate: "2024-01-01",
        today: TODAY,
      }).finding
    ).toBe("none");
  });

  it("fires exactly on the day the period elapses, not before", () => {
    const base = { ruleKey: "algemeen_nakoming", accrualDate: "2021-08-27" };
    expect(checkVerjaring({ ...base, today: "2026-08-26" }).finding).toBe("none");
    expect(checkVerjaring({ ...base, today: "2026-08-27" }).finding).toBe(
      "verjaring_possible"
    );
  });

  it("restarts the clock from a known stuiting", () => {
    const base = {
      ruleKey: "algemeen_nakoming",
      accrualDate: "2015-01-01",
      today: TODAY,
    };
    // Without an interruption the period elapsed long ago.
    expect(checkVerjaring(base).finding).toBe("verjaring_possible");
    // A 2024 interruption pushes it out to 2029.
    const r = checkVerjaring({ ...base, lastKnownStuiting: "2024-06-01" });
    expect(r.finding).toBe("none");
  });

  it("ignores a stuiting recorded BEFORE accrual as noise", () => {
    const r = checkVerjaring({
      ruleKey: "algemeen_nakoming",
      accrualDate: "2018-01-01",
      lastKnownStuiting: "2016-01-01",
      today: TODAY,
    });
    if (r.finding !== "verjaring_possible") throw new Error("expected finding");
    expect(r.clockFrom).toBe("2018-01-01");
  });

  it("handles the 2-year consumer sale period", () => {
    expect(
      checkVerjaring({
        ruleKey: "consumentenkoop",
        accrualDate: "2024-01-01",
        today: TODAY,
      }).finding
    ).toBe("verjaring_possible");
  });

  it("does not fire on a 20-year judgment from 2015", () => {
    expect(
      checkVerjaring({
        ruleKey: "rechterlijke_uitspraak",
        accrualDate: "2015-01-01",
        today: TODAY,
      }).finding
    ).toBe("none");
  });

  it("handles a 29 February accrual without drifting", () => {
    const r = checkVerjaring({
      ruleKey: "algemeen_nakoming",
      accrualDate: "2020-02-29",
      today: "2025-03-01",
    });
    if (r.finding !== "verjaring_possible") throw new Error("expected finding");
    // 2025 has no 29 Feb; JS rolls to 1 March, which is the conservative
    // direction (later, not earlier) for a "possible" finding.
    expect(r.periodElapsedOn).toBe("2025-03-01");
  });
});
