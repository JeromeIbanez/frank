import { describe, it, expect } from "vitest";
import {
  SAFEGUARDING_VERSION,
  HIGH_RISK_MERCHANTS,
  isCashWithdrawal,
  detectCashWithdrawalSpike,
  detectStructuring,
  detectRapidInOut,
  detectNewPayeeHighValue,
  detectHighRiskMerchant,
  detectLeefgeldDiversion,
  detectDirectDebitWithoutRecordedMandate,
  detectBeneficiaryNameMismatch,
  runClientDetectors,
  runOfficeDetectors,
  detectOfficeLinkedBeneficiary,
  detectFeeAboveSchedule,
  detectFourEyesViolation,
  canDisposeCase,
  isEscalationDestination,
  type SafeguardingTransaction,
} from "../safeguarding";

const TODAY = "2026-08-27";
const D = "d-1";

let seq = 0;
function tx(o: Partial<SafeguardingTransaction> = {}): SafeguardingTransaction {
  seq += 1;
  return {
    id: `t${seq}`,
    dossierId: D,
    accountId: "a-beheer",
    accountType: "beheer",
    bookingDate: TODAY,
    amountCents: -10_000,
    counterpartyName: null,
    counterpartyIban: null,
    description: null,
    categoryKey: null,
    ...o,
  };
}

/** Cash withdrawals in month `m`, `n` of them at `cents` each. */
function cashMonth(m: string, n: number, cents: number) {
  return Array.from({ length: n }, (_, i) =>
    tx({
      bookingDate: `${m}-${String(i + 1).padStart(2, "0")}`,
      amountCents: -cents,
      description: "Geldautomaat Amsterdam",
    })
  );
}

describe("isCashWithdrawal", () => {
  it("recognises Dutch bank cash markers", () => {
    expect(isCashWithdrawal(tx({ description: "Geldautomaat Utrecht" }))).toBe(true);
    expect(isCashWithdrawal(tx({ description: "GEA NR:00012" }))).toBe(true);
  });

  it("does not treat a credit as a withdrawal", () => {
    expect(
      isCashWithdrawal(tx({ amountCents: 10_000, description: "Geldautomaat" }))
    ).toBe(false);
  });

  it("does not fire on an ordinary card payment", () => {
    expect(
      isCashWithdrawal(tx({ description: "Albert Heijn 1234 BETAALAUTOMAAT" }))
    ).toBe(false);
  });
});

describe("detectCashWithdrawalSpike — per-client baseline", () => {
  it("ABSTAINS without enough history rather than guessing", () => {
    // Two months of history is not enough to know what is normal for someone.
    const transactions = [
      ...cashMonth("2026-06", 1, 5_000),
      ...cashMonth("2026-07", 1, 5_000),
      ...cashMonth("2026-08", 4, 20_000),
    ];
    expect(
      detectCashWithdrawalSpike({ dossierId: D, transactions, today: TODAY })
    ).toEqual([]);
  });

  it("flags a genuine spike against the client's own habit", () => {
    const transactions = [
      ...cashMonth("2026-04", 2, 6_000),
      ...cashMonth("2026-05", 2, 6_000),
      ...cashMonth("2026-06", 2, 6_000),
      ...cashMonth("2026-08", 4, 20_000), // €800 vs a €120 baseline
    ];
    const cases = detectCashWithdrawalSpike({
      dossierId: D,
      transactions,
      today: TODAY,
    });
    expect(cases).toHaveLength(1);
    expect(cases[0].detectorKey).toBe("cash_withdrawal_spike");
    expect(cases[0].evidence.recentTotalCents).toBe(80_000);
    expect(cases[0].evidence.baselineMonthlyCents).toBe(12_000);
  });

  it("does NOT flag a client who habitually withdraws a lot", () => {
    // The false-positive shape that matters most: someone who lives in cash
    // must not be flagged for being themselves.
    const transactions = [
      ...cashMonth("2026-04", 4, 20_000),
      ...cashMonth("2026-05", 4, 20_000),
      ...cashMonth("2026-06", 4, 20_000),
      ...cashMonth("2026-08", 4, 20_000),
    ];
    expect(
      detectCashWithdrawalSpike({ dossierId: D, transactions, today: TODAY })
    ).toEqual([]);
  });

  it("does not flag a small absolute amount even against a tiny baseline", () => {
    const transactions = [
      ...cashMonth("2026-04", 1, 500),
      ...cashMonth("2026-05", 1, 500),
      ...cashMonth("2026-06", 1, 500),
      ...cashMonth("2026-08", 1, 4_000), // €40 — 8x baseline, but trivial
    ];
    expect(
      detectCashWithdrawalSpike({ dossierId: D, transactions, today: TODAY })
    ).toEqual([]);
  });

  it("dedupes per month so the same spike does not reopen daily", () => {
    const transactions = [
      ...cashMonth("2026-04", 2, 6_000),
      ...cashMonth("2026-05", 2, 6_000),
      ...cashMonth("2026-06", 2, 6_000),
      ...cashMonth("2026-08", 4, 20_000),
    ];
    const a = detectCashWithdrawalSpike({ dossierId: D, transactions, today: TODAY });
    const b = detectCashWithdrawalSpike({
      dossierId: D,
      transactions,
      today: "2026-08-28",
    });
    expect(a[0].dedupeKey).toBe(b[0].dedupeKey);
  });
});

describe("detectStructuring", () => {
  it("flags repeated withdrawals just under a round threshold", () => {
    const transactions = Array.from({ length: 3 }, (_, i) =>
      tx({
        bookingDate: `2026-08-1${i}`,
        amountCents: -49_900, // €499, just under €500
        description: "Geldautomaat",
      })
    );
    const cases = detectStructuring({ dossierId: D, transactions, today: TODAY });
    expect(cases).toHaveLength(1);
    expect(cases[0].evidence.thresholdCents).toBe(50_000);
  });

  it("does not fire on two occurrences", () => {
    const transactions = Array.from({ length: 2 }, (_, i) =>
      tx({ bookingDate: `2026-08-1${i}`, amountCents: -49_900, description: "GEA" })
    );
    expect(detectStructuring({ dossierId: D, transactions, today: TODAY })).toEqual([]);
  });

  it("does not fire on ordinary round-number withdrawals", () => {
    // €200 four times in a month is what living on leefgeld looks like, not
    // structuring. An earlier version fired here via a €250 threshold — the
    // exact false positive that would turn this into an accusation machine.
    const transactions = Array.from({ length: 4 }, (_, i) =>
      tx({ bookingDate: `2026-08-1${i}`, amountCents: -20_000, description: "GEA" })
    );
    expect(detectStructuring({ dossierId: D, transactions, today: TODAY })).toEqual([]);
  });

  it("does not fire €25 below the threshold band either", () => {
    const transactions = Array.from({ length: 4 }, (_, i) =>
      tx({ bookingDate: `2026-08-1${i}`, amountCents: -45_000, description: "GEA" })
    );
    expect(detectStructuring({ dossierId: D, transactions, today: TODAY })).toEqual([]);
  });
});

describe("detectRapidInOut", () => {
  it("pairs a credit with a near-equal debit within the window", () => {
    const transactions = [
      tx({ bookingDate: "2026-08-20", amountCents: 120_000 }),
      tx({
        bookingDate: "2026-08-21",
        amountCents: -119_000,
        counterpartyName: "Onbekend",
      }),
    ];
    const cases = detectRapidInOut({ dossierId: D, transactions, today: TODAY });
    expect(cases).toHaveLength(1);
    expect(cases[0].evidence.gapDays).toBe(1);
  });

  it("does not pair amounts that differ materially", () => {
    const transactions = [
      tx({ bookingDate: "2026-08-20", amountCents: 120_000 }),
      tx({ bookingDate: "2026-08-21", amountCents: -60_000 }),
    ];
    expect(detectRapidInOut({ dossierId: D, transactions, today: TODAY })).toEqual([]);
  });

  it("does not pair across a long gap — that is just normal spending", () => {
    const transactions = [
      tx({ bookingDate: "2026-08-01", amountCents: 120_000 }),
      tx({ bookingDate: "2026-08-20", amountCents: -119_000 }),
    ];
    expect(detectRapidInOut({ dossierId: D, transactions, today: TODAY })).toEqual([]);
  });

  it("never pairs a debit that PRECEDES the credit", () => {
    const transactions = [
      tx({ bookingDate: "2026-08-21", amountCents: 120_000 }),
      tx({ bookingDate: "2026-08-20", amountCents: -119_000 }),
    ];
    expect(detectRapidInOut({ dossierId: D, transactions, today: TODAY })).toEqual([]);
  });
});

describe("detectNewPayeeHighValue", () => {
  it("flags a first-ever transfer above the floor", () => {
    const transactions = [
      tx({
        bookingDate: "2026-08-20",
        amountCents: -80_000,
        counterpartyIban: "NL99BANK0000000001",
        counterpartyName: "Onbekend",
      }),
    ];
    const cases = detectNewPayeeHighValue({ dossierId: D, transactions, today: TODAY });
    expect(cases).toHaveLength(1);
  });

  it("does not flag a payee seen before the window", () => {
    const transactions = [
      tx({
        bookingDate: "2026-01-10",
        amountCents: -80_000,
        counterpartyIban: "NL99BANK0000000001",
      }),
      tx({
        bookingDate: "2026-08-20",
        amountCents: -80_000,
        counterpartyIban: "NL99BANK0000000001",
      }),
    ];
    expect(
      detectNewPayeeHighValue({ dossierId: D, transactions, today: TODAY })
    ).toEqual([]);
  });

  it("does not flag a small first payment", () => {
    const transactions = [
      tx({
        bookingDate: "2026-08-20",
        amountCents: -2_000,
        counterpartyIban: "NL99BANK0000000009",
      }),
    ];
    expect(
      detectNewPayeeHighValue({ dossierId: D, transactions, today: TODAY })
    ).toEqual([]);
  });
});

describe("detectHighRiskMerchant", () => {
  it("uses the curated list, never inference", () => {
    for (const m of HIGH_RISK_MERCHANTS) {
      expect(m.match).toBe(m.match.toLowerCase());
      expect(["gokken", "crypto", "pandhuis"]).toContain(m.category);
    }
  });

  it("flags a listed merchant at INFO severity — a question, not an alarm", () => {
    const transactions = [
      tx({ bookingDate: "2026-08-20", amountCents: -5_000, counterpartyName: "Holland Casino Utrecht" }),
    ];
    const cases = detectHighRiskMerchant({ dossierId: D, transactions, today: TODAY });
    expect(cases).toHaveLength(1);
    expect(cases[0].severity).toBe("info");
  });

  it("does not flag an unlisted merchant", () => {
    const transactions = [
      tx({ bookingDate: "2026-08-20", counterpartyName: "Coffeeshop De Vriendschap" }),
    ];
    expect(
      detectHighRiskMerchant({ dossierId: D, transactions, today: TODAY })
    ).toEqual([]);
  });
});

describe("detectLeefgeldDiversion", () => {
  it("flags leefgeld drained the day it arrives", () => {
    const transactions = [
      tx({ accountType: "leefgeld", bookingDate: "2026-08-20", amountCents: 5_000 }),
      tx({ accountType: "leefgeld", bookingDate: "2026-08-20", amountCents: -4_800 }),
    ];
    const cases = detectLeefgeldDiversion({ dossierId: D, transactions, today: TODAY });
    expect(cases).toHaveLength(1);
  });

  it("does not flag ordinary spending across the week", () => {
    const transactions = [
      tx({ accountType: "leefgeld", bookingDate: "2026-08-20", amountCents: 5_000 }),
      tx({ accountType: "leefgeld", bookingDate: "2026-08-23", amountCents: -4_800 }),
    ];
    expect(
      detectLeefgeldDiversion({ dossierId: D, transactions, today: TODAY })
    ).toEqual([]);
  });

  it("ignores activity on the beheer account", () => {
    const transactions = [
      tx({ accountType: "beheer", bookingDate: "2026-08-20", amountCents: 5_000 }),
      tx({ accountType: "beheer", bookingDate: "2026-08-20", amountCents: -4_800 }),
    ];
    expect(
      detectLeefgeldDiversion({ dossierId: D, transactions, today: TODAY })
    ).toEqual([]);
  });
});

describe("detectDirectDebitWithoutRecordedMandate", () => {
  const base = {
    dossierId: D,
    today: TODAY,
    recordedMandateIbans: ["NL01KNOWN0000000001"],
  };

  it("flags an incasso from an IBAN with no mandate on file", () => {
    const transactions = [
      tx({
        bookingDate: "2026-08-20",
        amountCents: -3_000,
        counterpartyIban: "NL02OTHER0000000002",
        description: "SEPA Incasso algemeen doorlopend",
      }),
    ];
    const cases = detectDirectDebitWithoutRecordedMandate({ ...base, transactions });
    expect(cases).toHaveLength(1);
    // The name must not claim more than Frank can know (N4b).
    expect(cases[0].detectorKey).toBe("direct_debit_without_recorded_mandate");
    expect(cases[0].detectorKey).not.toContain("unauthorised");
    expect(cases[0].detectorKey).not.toContain("unmandated");
  });

  it("does not flag a known mandate, however it is spaced", () => {
    const transactions = [
      tx({
        bookingDate: "2026-08-20",
        counterpartyIban: "NL01 KNOWN 0000 0000 01",
        description: "SEPA Incasso",
      }),
    ];
    expect(
      detectDirectDebitWithoutRecordedMandate({ ...base, transactions })
    ).toEqual([]);
  });

  it("ABSTAINS entirely when no mandates are recorded at all", () => {
    // With nothing on file there is no basis to compare, so flagging every
    // direct debit would be noise dressed as vigilance.
    const transactions = [
      tx({
        bookingDate: "2026-08-20",
        counterpartyIban: "NL02OTHER0000000002",
        description: "SEPA Incasso",
      }),
    ];
    expect(
      detectDirectDebitWithoutRecordedMandate({
        dossierId: D,
        today: TODAY,
        transactions,
        recordedMandateIbans: [],
      })
    ).toEqual([]);
  });

  it("ignores a normal transfer that is not an incasso", () => {
    const transactions = [
      tx({
        bookingDate: "2026-08-20",
        counterpartyIban: "NL02OTHER0000000002",
        description: "Overboeking huur",
      }),
    ];
    expect(
      detectDirectDebitWithoutRecordedMandate({ ...base, transactions })
    ).toEqual([]);
  });
});

describe("detectBeneficiaryNameMismatch", () => {
  const base = {
    dossierId: D,
    today: TODAY,
    expectedCreditorByIban: { NL03CRED0000000003: "Vattenfall" },
  };

  it("flags a name that does not match the creditor on file", () => {
    const transactions = [
      tx({
        bookingDate: "2026-08-20",
        counterpartyIban: "NL03CRED0000000003",
        counterpartyName: "Q Trading BV",
      }),
    ];
    const cases = detectBeneficiaryNameMismatch({ ...base, transactions });
    expect(cases).toHaveLength(1);
    // Never framed as fraud (Temujin r2 #3) — legitimate mismatches abound.
    expect(cases[0].detectorKey).not.toContain("fraud");
  });

  it("tolerates a partial-name match such as a trading style", () => {
    const transactions = [
      tx({
        bookingDate: "2026-08-20",
        counterpartyIban: "NL03CRED0000000003",
        counterpartyName: "Vattenfall Klantenservice",
      }),
    ];
    expect(detectBeneficiaryNameMismatch({ ...base, transactions })).toEqual([]);
  });

  it("stays silent about an IBAN it has no expectation for", () => {
    const transactions = [
      tx({
        bookingDate: "2026-08-20",
        counterpartyIban: "NL09UNKNOWN000009",
        counterpartyName: "Iemand Anders",
      }),
    ];
    expect(detectBeneficiaryNameMismatch({ ...base, transactions })).toEqual([]);
  });
});

describe("no relationship-based detector exists (plan rev 2 cut)", () => {
  it("does not flag a payment to a person, absent anything else", () => {
    // A family label is not suspicious evidence. Normal support between
    // relatives is common in exactly these households, and the false-positive
    // harm lands on a real relationship.
    const transactions = [
      tx({
        bookingDate: "2026-08-20",
        amountCents: -4_000,
        counterpartyName: "M. de Vries",
        counterpartyIban: "NL08FAMILY00000008",
      }),
    ];
    const cases = runClientDetectors({ dossierId: D, transactions, today: TODAY });
    expect(cases.map((c) => c.detectorKey)).not.toContain(
      "payment_to_related_contact"
    );
    expect(cases).toEqual([]);
  });
});

describe("office-scope detectors (N5)", () => {
  const officeLinkedIbans = [
    { iban: "NL10OFFICE00000010", actorId: "actor-1", label: "J. Ibanez (kantoor)" },
  ];

  it("flags an office-linked beneficiary outside the fee basis", () => {
    const cases = detectOfficeLinkedBeneficiary({
      officeLinkedIbans,
      feeBasisCategoryKeys: ["beloning_bewindvoerder"],
      today: TODAY,
      transactions: [
        tx({
          bookingDate: "2026-08-20",
          amountCents: -75_000,
          counterpartyIban: "NL10OFFICE00000010",
          categoryKey: "overige_uitgaven",
        }),
      ],
    });
    expect(cases).toHaveLength(1);
    expect(cases[0].scope).toBe("office");
    expect(cases[0].concernsActorId).toBe("actor-1");
    // A neutral observation, not an accusation (Temujin r2 #3).
    expect(cases[0].detectorKey).toBe(
      "office_linked_beneficiary_outside_fee_basis"
    );
    expect(cases[0].detectorKey).not.toContain("self_dealing");
  });

  it("does NOT flag the legitimate fee payment", () => {
    expect(
      detectOfficeLinkedBeneficiary({
        officeLinkedIbans,
        feeBasisCategoryKeys: ["beloning_bewindvoerder"],
        today: TODAY,
        transactions: [
          tx({
            bookingDate: "2026-08-20",
            amountCents: -16_810,
            counterpartyIban: "NL10OFFICE00000010",
            categoryKey: "beloning_bewindvoerder",
          }),
        ],
      })
    ).toEqual([]);
  });

  it("flags a fee above the versioned schedule, deterministically", () => {
    const cases = detectFeeAboveSchedule({
      officeLinkedIbans: [],
      feeBasisCategoryKeys: [],
      today: TODAY,
      transactions: [],
      feeComparisons: [
        { dossierId: D, chargedCents: 200_000, permittedCents: 168_100, year: 2026 },
      ],
    });
    expect(cases).toHaveLength(1);
    expect(cases[0].evidence.excessCents).toBe(31_900);
  });

  it("does not flag a fee at or below the permitted amount", () => {
    expect(
      detectFeeAboveSchedule({
        officeLinkedIbans: [],
        feeBasisCategoryKeys: [],
        today: TODAY,
        transactions: [],
        feeComparisons: [
          { dossierId: D, chargedCents: 168_100, permittedCents: 168_100, year: 2026 },
        ],
      })
    ).toEqual([]);
  });

  it("fires four_eyes_violation ONLY on an evidenced breach", () => {
    const cases = detectFourEyesViolation({
      officeLinkedIbans: [],
      feeBasisCategoryKeys: [],
      today: TODAY,
      transactions: [],
      sameActorApprovals: [
        {
          batchId: "b-1",
          actorId: "actor-1",
          createdAuditId: "a-1",
          approvedAuditId: "a-2",
          activeBewindvoerderCount: 2,
        },
      ],
    });
    expect(cases).toHaveLength(1);
    // It must be able to point at the rule and the two audit rows.
    expect(cases[0].evidence.auditIds).toEqual(["a-1", "a-2"]);
    expect(String(cases[0].evidence.rule)).toContain("canApproveBatch");
  });

  it("stays silent in a solo office, where the rule does not apply", () => {
    expect(
      detectFourEyesViolation({
        officeLinkedIbans: [],
        feeBasisCategoryKeys: [],
        today: TODAY,
        transactions: [],
        sameActorApprovals: [
          {
            batchId: "b-1",
            actorId: "actor-1",
            createdAuditId: "a-1",
            approvedAuditId: "a-2",
            activeBewindvoerderCount: 1,
          },
        ],
      })
    ).toEqual([]);
  });

  it("runs all office detectors together without interference", () => {
    const cases = runOfficeDetectors({
      officeLinkedIbans,
      feeBasisCategoryKeys: ["beloning_bewindvoerder"],
      today: TODAY,
      transactions: [
        tx({
          bookingDate: "2026-08-20",
          counterpartyIban: "NL10OFFICE00000010",
          categoryKey: "overige_uitgaven",
        }),
      ],
      feeComparisons: [
        { dossierId: D, chargedCents: 200_000, permittedCents: 168_100, year: 2026 },
      ],
    });
    expect(cases.map((c) => c.detectorKey).sort()).toEqual([
      "fee_above_schedule",
      "office_linked_beneficiary_outside_fee_basis",
    ]);
  });
});

describe("canDisposeCase — office cases are immutable to the actor they concern", () => {
  const bewind = {
    actorId: "actor-1",
    actorRole: "bewindvoerder" as const,
    actorActive: true,
  };

  it("lets a bewindvoerder dispose of a client case", () => {
    expect(canDisposeCase({ ...bewind, scope: "client" })).toEqual({ allowed: true });
  });

  it("REFUSES when the office case concerns the actor themselves", () => {
    expect(
      canDisposeCase({ ...bewind, scope: "office", concernsActorId: "actor-1" })
    ).toEqual({ allowed: false, reason: "concerns_self" });
  });

  it("lets a different bewindvoerder dispose of it", () => {
    expect(
      canDisposeCase({
        ...bewind,
        actorId: "actor-2",
        scope: "office",
        concernsActorId: "actor-1",
      })
    ).toEqual({ allowed: true });
  });

  it("refuses an assistent regardless of scope", () => {
    expect(
      canDisposeCase({ ...bewind, actorRole: "assistent", scope: "client" })
    ).toEqual({ allowed: false, reason: "role_required" });
  });

  it("refuses an inactive actor first of all", () => {
    expect(
      canDisposeCase({ ...bewind, actorActive: false, scope: "client" })
    ).toEqual({ allowed: false, reason: "inactive_actor" });
  });

  it("does not restrict a client case that happens to name an actor", () => {
    expect(
      canDisposeCase({ ...bewind, scope: "client", concernsActorId: "actor-1" })
    ).toEqual({ allowed: true });
  });
});

describe("escalation destinations", () => {
  it("includes the kantonrechter, the solo-office default", () => {
    expect(isEscalationDestination("kantonrechter")).toBe(true);
    expect(isEscalationDestination("veilig_thuis")).toBe(true);
    expect(isEscalationDestination("whatever")).toBe(false);
    expect(isEscalationDestination(null)).toBe(false);
  });
});

describe("detector output shape", () => {
  it("stamps the version on every case, for restamping on change", () => {
    const transactions = [
      ...cashMonth("2026-04", 2, 6_000),
      ...cashMonth("2026-05", 2, 6_000),
      ...cashMonth("2026-06", 2, 6_000),
      ...cashMonth("2026-08", 4, 20_000),
    ];
    for (const c of runClientDetectors({ dossierId: D, transactions, today: TODAY })) {
      expect(c.detectorVersion).toBe(SAFEGUARDING_VERSION);
      expect(c.dedupeKey.length).toBeGreaterThan(0);
    }
  });

  it("produces nothing at all for a quiet dossier", () => {
    expect(
      runClientDetectors({
        dossierId: D,
        transactions: [tx({ bookingDate: "2026-08-20", amountCents: -3_500, counterpartyName: "Albert Heijn" })],
        today: TODAY,
      })
    ).toEqual([]);
  });
});
