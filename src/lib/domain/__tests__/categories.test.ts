import { describe, expect, it } from "vitest";
import { CATEGORIES, ruleCategorize } from "../categories";

describe("category taxonomy", () => {
  it("has required keys", () => {
    const keys = CATEGORIES.map((c) => c.key);
    for (const k of [
      "salaris",
      "uitkering",
      "huurtoeslag",
      "zorgtoeslag",
      "huur",
      "energie",
      "zorgverzekering",
      "leefgeld",
      "bewindvoerderskosten",
      "overige_uitgaven",
    ]) {
      expect(keys).toContain(k);
    }
  });

  it("every category has NL and EN labels and a kind", () => {
    for (const c of CATEGORIES) {
      expect(c.nl.length).toBeGreaterThan(0);
      expect(c.en.length).toBeGreaterThan(0);
      expect(["income", "expense"]).toContain(c.kind);
    }
  });
});

describe("ruleCategorize", () => {
  it("matches zorgverzekeraars", () => {
    const res = ruleCategorize("Zilveren Kruis", "premie augustus", -14500);
    expect(res?.categoryKey).toBe("zorgverzekering");
  });

  it("matches energy suppliers", () => {
    const res = ruleCategorize("Vattenfall N.V.", "termijnbedrag", -12000);
    expect(res?.categoryKey).toBe("energie");
  });

  it("matches huurtoeslag credit", () => {
    const res = ruleCategorize("Belastingdienst Toeslagen", "huurtoeslag aug", 36700);
    expect(res?.categoryKey).toBe("huurtoeslag");
  });

  it("returns null when nothing matches", () => {
    const res = ruleCategorize("Onbekende BV", "iets vaags", -1234);
    expect(res).toBeNull();
  });
});
