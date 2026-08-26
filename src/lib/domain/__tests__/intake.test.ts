import { describe, expect, it } from "vitest";
import {
  boedelChecklist,
  toProposalPayload,
  verifyProvenance,
  completeness,
  extractionResult,
  payloadHash,
  proposalPayload,
  type IntakeSnapshot,
} from "../intake";

const validLine = {
  kind: "budget_line",
  lineKind: "income",
  name: "Loon werkgever",
  categoryKey: "inkomen_loon",
  amountCents: 185_000,
  frequency: "monthly",
  expectedDay: 25,
  counterpartyName: "Werkgever BV",
  counterpartyIban: "NL01WERK0000000001",
};

describe("proposal payload contracts", () => {
  it("accepts a valid budget line", () => {
    expect(proposalPayload.safeParse(validLine).success).toBe(true);
  });

  it("rejects a negative amount", () => {
    expect(
      proposalPayload.safeParse({ ...validLine, amountCents: -5 }).success
    ).toBe(false);
  });

  it("rejects a non-integer amount (no floats in the ledger)", () => {
    expect(
      proposalPayload.safeParse({ ...validLine, amountCents: 100.5 }).success
    ).toBe(false);
  });

  it("rejects an unknown kind", () => {
    expect(
      proposalPayload.safeParse({ kind: "salary", name: "x" }).success
    ).toBe(false);
  });

  it("accepts a valid debt and contact", () => {
    expect(
      proposalPayload.safeParse({
        kind: "debt",
        creditor: "Vattenfall",
        currentAmountCents: 48_211,
      }).success
    ).toBe(true);
    expect(
      proposalPayload.safeParse({
        kind: "contact",
        contactKind: "zorgverzekeraar",
        name: "Zilveren Kruis",
      }).success
    ).toBe(true);
  });

  it("extraction result caps proposals and validates nested payloads", () => {
    const bad = extractionResult.safeParse({
      proposals: [
        { payload: { kind: "debt", creditor: "X" }, provenance: {}, confidence: 80 },
      ],
    });
    expect(bad.success).toBe(false); // missing currentAmountCents
    const good = extractionResult.safeParse({
      proposals: [
        {
          payload: { kind: "debt", creditor: "Vattenfall", currentAmountCents: 100 },
          provenance: { creditor: "Vattenfall Klantenservice" },
          confidence: 88,
        },
      ],
    });
    expect(good.success).toBe(true);
  });
});

describe("flat model item → strict payload mapping", () => {
  const flatBase = {
    kind: "debt" as const,
    lineKind: null, name: null, categoryKey: null, amountCents: null,
    frequency: null, expectedDay: null, counterpartyName: null,
    counterpartyIban: null, creditor: "KPN B.V.", reference: "8877-KPN-2026",
    currentAmountCents: 48630, originalAmountCents: 41200,
    viaDeurwaarder: "GGN", contactKind: null, email: null, phone: null,
    iban: null, bankName: null, accountType: null,
    openingBalanceCents: null, openingBalanceDate: null,
    provenance: [{ field: "creditor", snippet: "Schuldeiser: KPN B.V." }], confidence: 90,
  };

  it("maps a valid flat debt into the strict contract", () => {
    const p = toProposalPayload(flatBase);
    expect(p).not.toBeNull();
    expect(p!.kind).toBe("debt");
  });

  it("drops an item missing required fields for its kind", () => {
    expect(toProposalPayload({ ...flatBase, creditor: null })).toBeNull();
    expect(toProposalPayload({ ...flatBase, currentAmountCents: -5 })).toBeNull();
  });

  it("rounds float cents from the model into integers", () => {
    const p = toProposalPayload({ ...flatBase, currentAmountCents: 48630.4 });
    expect(p).not.toBeNull();
    expect((p as { currentAmountCents: number }).currentAmountCents).toBe(48630);
  });

  it("budget_line requires its own fields, ignores debt fields", () => {
    const p = toProposalPayload({
      ...flatBase,
      kind: "budget_line",
      lineKind: "income",
      name: "Loon Bakkerij",
      categoryKey: "inkomen_loon",
      amountCents: 184250,
      frequency: "monthly",
      expectedDay: 25,
    });
    expect(p).not.toBeNull();
    expect(p!.kind).toBe("budget_line");
  });
});

describe("verifyProvenance (Temujin PR-6 #2 + r2 #2)", () => {
  const doc = `AANMANING\nSchuldeiser: KPN B.V.\nOpenstaand saldo: EUR 486,30\nNettoloon: EUR 1.842,50 per maand`;
  const debtPayload = proposalPayload.parse({
    kind: "debt", creditor: "KPN B.V.", currentAmountCents: 48630,
  });
  const item = (prov: { field: string; snippet: string }[]) => ({
    kind: "debt" as const,
    lineKind: null, name: null, categoryKey: null,
    amountCents: null, frequency: null, expectedDay: null,
    counterpartyName: null, counterpartyIban: null,
    creditor: "KPN B.V.", reference: null, currentAmountCents: 48630,
    originalAmountCents: null, viaDeurwaarder: null, contactKind: null,
    email: null, phone: null, iban: null, bankName: null, accountType: null,
    openingBalanceCents: null, openingBalanceDate: null,
    provenance: prov, confidence: 80,
  });
  const bound = [
    { field: "creditor", snippet: "Schuldeiser: KPN B.V." },
    { field: "saldo", snippet: "Openstaand saldo: EUR 486,30" },
  ];

  it("amount + creditor evidenced nearby → ok", () => {
    const r = verifyProvenance(item(bound), debtPayload, doc);
    expect(r.ok).toBe(true);
    expect(r.verified.saldo).toBeDefined();
  });

  it("fabricated snippet (not in the document) is discarded", () => {
    const r = verifyProvenance(
      item([{ field: "saldo", snippet: "Openstaand saldo: EUR 999,99" }]),
      debtPayload, doc
    );
    expect(Object.keys(r.verified)).toHaveLength(0);
    expect(r.ok).toBe(false);
  });

  it("amount evidenced but creditor NOT evidenced → debt rejected", () => {
    const r = verifyProvenance(
      item([{ field: "saldo", snippet: "Openstaand saldo: EUR 486,30" }]),
      debtPayload, doc
    );
    expect(r.ok).toBe(false);
  });

  it("creditor evidenced but amount not → rejected", () => {
    const r = verifyProvenance(
      item([{ field: "x", snippet: "Schuldeiser: KPN B.V." }]),
      debtPayload, doc
    );
    expect(r.ok).toBe(false);
  });

  it("creditor and amount evidence too far apart in the source → rejected (binding)", () => {
    const farDoc = "Schuldeiser: KPN B.V.\n" + "x".repeat(800) + "\nOpenstaand saldo: EUR 486,30";
    const r = verifyProvenance(item(bound), debtPayload, farDoc);
    expect(r.ok).toBe(false);
  });

  it("whitespace differences do not break matching", () => {
    const r = verifyProvenance(
      item([
        { field: "creditor", snippet: "Schuldeiser:   KPN B.V." },
        { field: "saldo", snippet: "Openstaand   saldo:  EUR 486,30" },
      ]),
      debtPayload, doc
    );
    expect(r.ok).toBe(true);
  });

  it("unevidenced optional originalAmount is STRIPPED, not trusted", () => {
    const payload = proposalPayload.parse({
      kind: "debt", creditor: "KPN B.V.", currentAmountCents: 48630,
      originalAmountCents: 41200, reference: "8877-KPN-2026",
    });
    const r = verifyProvenance(
      { ...item(bound), originalAmountCents: 41200, reference: "8877-KPN-2026" },
      payload, doc
    );
    expect(r.ok).toBe(true);
    expect((r.sanitizedPayload as { originalAmountCents?: number | null }).originalAmountCents).toBeNull();
    expect((r.sanitizedPayload as { reference?: string | null }).reference).toBeNull();
  });

  it("negative opening balance requires a printed minus (sign enforcement)", () => {
    const posDoc = "Rekening NL01BANK: saldo 500,00 per 01-08-2026";
    const negPayload = proposalPayload.parse({
      kind: "account_opening_balance", iban: "NL01BANK0000000001",
      accountType: "beheer", openingBalanceCents: -50000,
    });
    const negItem = {
      ...item([{ field: "saldo", snippet: "saldo 500,00 per 01-08-2026" }]),
      kind: "account_opening_balance" as const,
    };
    expect(verifyProvenance(negItem, negPayload, posDoc).ok).toBe(false);
    const negDoc = "Rekening NL01BANK: saldo -500,00 per 01-08-2026";
    const negItem2 = {
      ...item([{ field: "saldo", snippet: "saldo -500,00 per 01-08-2026" }]),
      kind: "account_opening_balance" as const,
    };
    expect(verifyProvenance(negItem2, negPayload, negDoc).ok).toBe(true);
  });

  it("grouped euro form (1.842,50) is recognized", () => {
    const linePayload = proposalPayload.parse({
      kind: "budget_line", lineKind: "income", name: "Nettoloon",
      categoryKey: "inkomen_loon", amountCents: 184250, frequency: "monthly",
    });
    const r = verifyProvenance(
      { ...item([{ field: "loon", snippet: "Nettoloon: EUR 1.842,50" }]), kind: "budget_line" as const },
      linePayload, doc
    );
    expect(r.ok).toBe(true);
  });
});

describe("payloadHash idempotency", () => {
  it("is stable across key order", () => {
    const a = proposalPayload.parse(validLine);
    const b = proposalPayload.parse(
      JSON.parse(JSON.stringify(validLine, Object.keys(validLine).reverse()))
    );
    expect(payloadHash(a)).toBe(payloadHash(b));
  });

  it("differs when a field differs", () => {
    const a = proposalPayload.parse(validLine);
    const b = proposalPayload.parse({ ...validLine, amountCents: 185_001 });
    expect(payloadHash(a)).not.toBe(payloadHash(b));
  });
});

describe("boedel checklist", () => {
  const base: IntakeSnapshot = {
    accounts: [
      { type: "beheer", openingBalanceCents: 10000, openingBalanceDate: "2026-08-01" },
    ],
    incomeLines: 1,
    expenseLines: 2,
    debts: 0,
    schuldenbewind: false,
    contactsTotal: 3,
    contactsNotified: 3,
    inboedelNoteSet: true,
    leefgeldSet: true,
    pvaGoalsSet: true,
    pvaDebtStrategySet: false,
  };

  it("complete without schuldenbewind ignores debt items", () => {
    const items = boedelChecklist(base);
    const { done, total } = completeness(items);
    expect(done).toBe(total);
    expect(items.find((i) => i.key === "debts_recorded")?.applies).toBe(false);
    expect(items.find((i) => i.key === "pva_debt_strategy")?.applies).toBe(false);
  });

  it("schuldenbewind requires debts and a strategy", () => {
    const items = boedelChecklist({ ...base, schuldenbewind: true });
    const { done, total } = completeness(items);
    expect(total).toBe(9);
    expect(done).toBe(7); // debts_recorded + pva_debt_strategy missing
  });

  it("unnotified contacts and missing opening balance are incomplete", () => {
    const items = boedelChecklist({
      ...base,
      contactsNotified: 1,
      accounts: [{ type: "beheer", openingBalanceCents: 0, openingBalanceDate: null }],
    });
    expect(items.find((i) => i.key === "contacts_notified")?.done).toBe(false);
    expect(items.find((i) => i.key === "beheer_account_opening")?.done).toBe(false);
  });
});
