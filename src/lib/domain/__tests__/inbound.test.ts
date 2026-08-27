import { describe, it, expect } from "vitest";
import {
  readInboundFacts,
  readConsumerBasis,
  classifyObligationKind,
} from "../inbound";
import { checkWikAmount } from "../wik";
import { INBOX_FIXTURES } from "@/lib/inbox-fixtures";

const aanmaning = INBOX_FIXTURES[0];
const gemeente = INBOX_FIXTURES[1];
const vague = INBOX_FIXTURES[2];
const raw = (f: (typeof INBOX_FIXTURES)[number]) => `${f.subject}\n${f.body}`;

describe("readInboundFacts", () => {
  it("reads the labelled amounts off a real aanmaning fixture", () => {
    const f = readInboundFacts(raw(aanmaning));
    expect(f.principalCents?.value).toBe(41_230);
    expect(f.collectionCostsCents?.value).toBe(7_500);
    expect(f.totalCents?.value).toBe(48_730);
  });

  it("carries a verbatim snippet for every value it reads", () => {
    const f = readInboundFacts(raw(aanmaning));
    expect(f.principalCents?.snippet).toContain("412,30");
    expect(f.collectionCostsCents?.snippet).toContain("75,00");
  });

  it("parses Dutch and ISO dates alike", () => {
    expect(readInboundFacts(raw(aanmaning)).dueDate?.value).toBe("2026-09-10");
    expect(readInboundFacts(raw(gemeente)).dueDate?.value).toBe("2026-09-15");
  });

  it("reads the reference", () => {
    expect(readInboundFacts(raw(aanmaning)).reference?.value).toBe("REF-SAN-1006");
  });

  it("does not invent values from an unlabelled letter", () => {
    const f = readInboundFacts(raw(vague));
    expect(f.principalCents).toBeUndefined();
    expect(f.collectionCostsCents).toBeUndefined();
    expect(f.dueDate).toBeUndefined();
  });

  it("ignores an amount that is not attached to a label", () => {
    // An unlabelled number is not evidence of what it is.
    const f = readInboundFacts("Wij schrijven u over € 999,00 en meer.");
    expect(f.principalCents).toBeUndefined();
  });

  it("uses the locale-aware euro parser", () => {
    // os-v1 PR-6 r2: "486.30" once became €48.630 under a naive parse.
    const f = readInboundFacts("Hoofdsom: 486.30");
    expect(f.principalCents?.value).toBe(48_630);
  });

  it("survives empty input", () => {
    expect(readInboundFacts("")).toEqual({});
  });
});

describe("classifyObligationKind", () => {
  it("recognises a payment demand", () => {
    expect(classifyObligationKind(aanmaning.subject, aanmaning.body)).toBe(
      "payment_demand"
    );
  });

  it("recognises an information request", () => {
    expect(classifyObligationKind(gemeente.subject, gemeente.body)).toBe(
      "information_request"
    );
  });

  it("puts court correspondence first", () => {
    expect(
      classifyObligationKind("Oproep zitting kantonrechter", "Aanmaning bijgevoegd")
    ).toBe("court_filing");
  });

  it("falls back to other rather than guessing", () => {
    expect(classifyObligationKind("Nieuwsbrief", "Fijne feestdagen")).toBe("other");
  });
});

describe("readConsumerBasis — evidenced, never inferred", () => {
  it("finds the creditor's own invocation of the regime", () => {
    const b = readConsumerBasis(raw(aanmaning));
    expect(b?.value).toBe("document_states_consumer");
    expect(b?.snippet).toContain("Wet Incassokosten");
  });

  it("returns nothing when the document says nothing about it", () => {
    // Temujin PR-9 r1 #3: a natural person under bewind can still incur a
    // business debt, so dossier existence is NOT evidence of the consumer
    // regime. No statement in the document → no basis → the check abstains.
    expect(readConsumerBasis(raw(vague))).toBeUndefined();
    expect(readConsumerBasis("Geachte heer, u bent ons geld schuldig.")).toBeUndefined();
  });

  it("does not fire on a substring inside another word", () => {
    expect(readConsumerBasis("De wikkel zat om het pakket.")).toBeUndefined();
  });

  it("carries the verbatim line as its snippet", () => {
    const b = readConsumerBasis("regel een\nBerekend conform de Wet Incassokosten.\nregel drie");
    expect(b?.snippet).toBe("Berekend conform de Wet Incassokosten.");
  });
});

describe("the demo motion end to end (pure part)", () => {
  it("produces an UNAMBIGUOUS WIK finding on the aanmaning fixture", () => {
    // Temujin os-v2 r1 #3: the rev-1 demo numbers were wrong, so the fixture
    // arithmetic is asserted rather than hand-written. €412,30 principal →
    // €61,85 cap; €75,00 charged → €13,15 excess, far clear of de-minimis.
    const facts = readInboundFacts(raw(aanmaning));
    const r = checkWikAmount({
      principalCents: facts.principalCents?.value,
      chargedCostsCents: facts.collectionCostsCents?.value,
      consumerBasis: readConsumerBasis(raw(aanmaning))?.value,
      onDate: "2026-08-27",
    });
    if (r.finding !== "wik_amount_exceeds_cap") throw new Error("expected finding");
    expect(r.maximumCents).toBe(6_185);
    expect(r.excessCents).toBe(1_315);
    expect(r.excessCents).toBeGreaterThan(100); // de-minimis
  });

  it("produces NO finding on the routine gemeente letter", () => {
    const facts = readInboundFacts(raw(gemeente));
    const r = checkWikAmount({
      principalCents: facts.principalCents?.value,
      chargedCostsCents: facts.collectionCostsCents?.value,
      consumerBasis: readConsumerBasis(raw(gemeente))?.value,
      onDate: "2026-08-27",
    });
    expect(r.finding).toBe("none");
  });

  it("ABSTAINS on the same overcharge when the regime is not evidenced", () => {
    // Strip the creditor's WIK line and the finding must disappear, even
    // though the arithmetic is identical. This is the regression guard for
    // the inference Temujin caught.
    const stripped = raw(aanmaning)
      .split("\n")
      .filter((l) => !/Wet Incassokosten/i.test(l))
      .join("\n");
    const facts = readInboundFacts(stripped);
    expect(facts.collectionCostsCents?.value).toBe(7_500); // still read
    const r = checkWikAmount({
      principalCents: facts.principalCents?.value,
      chargedCostsCents: facts.collectionCostsCents?.value,
      consumerBasis: readConsumerBasis(stripped)?.value,
      onDate: "2026-08-27",
    });
    if (r.finding !== "none") throw new Error("expected abstention");
    expect(r.missing).toContain("consumerBasis");
  });
});
