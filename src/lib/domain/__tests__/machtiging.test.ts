import { describe, expect, it } from "vitest";
import {
  checkMachtiging,
  MACHTIGING_THRESHOLD_CENTS,
} from "../machtiging";

const base = {
  categoryKey: "overige_uitgaven",
  purposeTag: "vakantie-2026",
  yearSpentOnPurposeCents: 0,
};

describe("machtiging guard (legal-review flag, never a conclusion)", () => {
  it("threshold is €2,000 (LOVT April 2025), not the outdated €1,500", () => {
    expect(MACHTIGING_THRESHOLD_CENTS).toBe(200000);
  });

  it("purchase at/over €2,000 triggers", () => {
    const res = checkMachtiging({ ...base, amountCents: 200000, kind: "purchase" });
    expect(res.triggered).toBe(true);
    expect(res.reasons).toContain("machtiging.reason.over2000");
  });

  it("purchase under €2,000 with no aggregation does not trigger", () => {
    const res = checkMachtiging({ ...base, amountCents: 150000, kind: "purchase" });
    expect(res.triggered).toBe(false);
  });

  it("same-purpose aggregation triggers: 1500 + 600 ≥ 2000", () => {
    const res = checkMachtiging({
      ...base,
      amountCents: 60000,
      yearSpentOnPurposeCents: 150000,
      kind: "purchase",
    });
    expect(res.triggered).toBe(true);
    expect(res.reasons).toContain("machtiging.reason.aggregation");
  });

  it("regular bill over threshold does not trigger on amount alone", () => {
    const res = checkMachtiging({
      ...base,
      amountCents: 250000,
      kind: "regular_bill",
    });
    expect(res.triggered).toBe(false);
  });

  it("leefgeld never triggers", () => {
    const res = checkMachtiging({ ...base, amountCents: 500000, kind: "leefgeld" });
    expect(res.triggered).toBe(false);
  });

  it("gift always triggers (LOVT B.J1)", () => {
    const res = checkMachtiging({ ...base, amountCents: 1000, kind: "gift" });
    expect(res.triggered).toBe(true);
    expect(res.reasons).toContain("machtiging.reason.gift");
  });

  it("loan always triggers (art. 1:441 lid 2c BW)", () => {
    const res = checkMachtiging({ ...base, amountCents: 1000, kind: "loan" });
    expect(res.triggered).toBe(true);
  });

  it("settlement over €700 triggers, under does not", () => {
    expect(
      checkMachtiging({ ...base, amountCents: 70100, kind: "settlement" }).triggered
    ).toBe(true);
    expect(
      checkMachtiging({ ...base, amountCents: 69900, kind: "settlement" }).triggered
    ).toBe(false);
  });

  it("housing always triggers (LOVT B.D2)", () => {
    const res = checkMachtiging({ ...base, amountCents: 1, kind: "housing" });
    expect(res.triggered).toBe(true);
  });
});
