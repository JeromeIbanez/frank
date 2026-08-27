import { describe, expect, it } from "vitest";
import {
  matchRegelingPayments,
  schuldenverloop,
  type CandidateTx,
  type DebtEventLike,
  type RegelingLine,
} from "../debts";

describe("schuldenverloop", () => {
  const period = ["2026-01-01", "2026-12-31"] as const;
  const ev = (
    kind: DebtEventLike["kind"],
    deltaCents: number,
    iso: string
  ): DebtEventLike => ({ kind, deltaCents, createdAtIso: iso });

  it("no events → begin = end = current, flagged", () => {
    const v = schuldenverloop(50_000, [], ...period);
    expect(v).toMatchObject({
      beginCents: 50_000,
      endCents: 50_000,
      paidCents: 0,
      hasHistory: false,
    });
  });

  it("payments inside the period reduce end and count as paid", () => {
    const v = schuldenverloop(
      40_000,
      [
        ev("payment_reconciled", -5_000, "2026-03-15T10:00:00Z"),
        ev("payment_reconciled", -5_000, "2026-04-15T10:00:00Z"),
      ],
      ...period
    );
    expect(v.beginCents).toBe(50_000);
    expect(v.endCents).toBe(40_000);
    expect(v.paidCents).toBe(10_000);
    // consistency: begin + other − paid = end
    expect(v.beginCents + v.otherDeltaCents - v.paidCents).toBe(v.endCents);
  });

  it("events AFTER the period are rolled back out of the end balance", () => {
    const v = schuldenverloop(
      30_000,
      [
        ev("payment_reconciled", -5_000, "2026-06-01T10:00:00Z"),
        ev("payment_reconciled", -5_000, "2027-01-10T10:00:00Z"), // next period
      ],
      ...period
    );
    expect(v.endCents).toBe(35_000); // current 30k + rolled-back 5k
    expect(v.beginCents).toBe(40_000);
    expect(v.paidCents).toBe(5_000);
  });

  it("cost increases count as other delta, not payments", () => {
    const v = schuldenverloop(
      52_000,
      [
        ev("creditor_statement", 7_000, "2026-05-01T10:00:00Z"), // costs added
        ev("payment_reconciled", -5_000, "2026-07-01T10:00:00Z"),
      ],
      ...period
    );
    expect(v.beginCents).toBe(50_000);
    expect(v.paidCents).toBe(5_000);
    expect(v.otherDeltaCents).toBe(7_000);
    expect(v.beginCents + v.otherDeltaCents - v.paidCents).toBe(v.endCents);
  });
});

describe("matchRegelingPayments (exact-only)", () => {
  const line: RegelingLine = {
    budgetLineId: "L1",
    debtId: "D1",
    dossierId: "DOS1",
    counterpartyIban: "NL55KPN00000000001",
    amountCents: 5_000,
  };
  const tx = (over: Partial<CandidateTx> = {}): CandidateTx => ({
    id: "T1",
    dossierId: "DOS1",
    bookingDate: "2026-08-01",
    amountCents: -5_000,
    counterpartyIban: "NL55KPN00000000001",
    ...over,
  });

  it("exact IBAN + exact amount + same dossier matches with negative delta", () => {
    const out = matchRegelingPayments([line], [tx()]);
    expect(out).toEqual([
      { transactionId: "T1", debtId: "D1", budgetLineId: "L1", deltaCents: -5_000 },
    ]);
  });

  it("different amount never matches (partial payments → human statement path)", () => {
    expect(matchRegelingPayments([line], [tx({ amountCents: -4_900 })])).toEqual([]);
  });

  it("different IBAN, different dossier, or a credit never match", () => {
    expect(matchRegelingPayments([line], [tx({ counterpartyIban: "NL99X0000000000001" })])).toEqual([]);
    expect(matchRegelingPayments([line], [tx({ dossierId: "DOS2" })])).toEqual([]);
    expect(matchRegelingPayments([line], [tx({ amountCents: 5_000 })])).toEqual([]);
  });

  it("one transaction settles at most one line", () => {
    const line2: RegelingLine = { ...line, budgetLineId: "L2", debtId: "D2" };
    const out = matchRegelingPayments([line, line2], [tx()]);
    expect(out).toHaveLength(1);
  });

  it("multiple months of payments each match once", () => {
    const out = matchRegelingPayments(
      [line],
      [tx(), tx({ id: "T2", bookingDate: "2026-09-01" })]
    );
    expect(out.map((o) => o.transactionId).sort()).toEqual(["T1", "T2"]);
  });

  it("a line without IBAN never matches", () => {
    expect(
      matchRegelingPayments([{ ...line, counterpartyIban: null }], [tx()])
    ).toEqual([]);
  });
});
