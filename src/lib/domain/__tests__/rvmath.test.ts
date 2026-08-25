import { describe, expect, it } from "vitest";
import { reconcileRv } from "../rvmath";

describe("R&V reconciliation", () => {
  it("balanced ledger reconciles", () => {
    const res = reconcileRv({
      accountMovements: [{ openingCents: 10000, closingCents: 60000 }],
      totalIncomeCents: 100000,
      totalExpenseCents: 52000,
      uncategorizedNetCents: 2000,
    });
    // movement 50000 = 100000 - 52000 + 2000
    expect(res.deltaCents).toBe(0);
    expect(res.reconciles).toBe(true);
  });

  it("unbalanced ledger reports the exact delta", () => {
    const res = reconcileRv({
      accountMovements: [
        { openingCents: 0, closingCents: 30000 },
        { openingCents: 5000, closingCents: 5000 },
      ],
      totalIncomeCents: 40000,
      totalExpenseCents: 15000,
      uncategorizedNetCents: 0,
    });
    // movement 30000 vs categorized net 25000 → delta 5000
    expect(res.deltaCents).toBe(5000);
    expect(res.reconciles).toBe(false);
  });

  it("uncategorized-only ledger reconciles via uncategorized net", () => {
    const res = reconcileRv({
      accountMovements: [{ openingCents: 1000, closingCents: 900 }],
      totalIncomeCents: 0,
      totalExpenseCents: 0,
      uncategorizedNetCents: -100,
    });
    expect(res.reconciles).toBe(true);
  });
});
