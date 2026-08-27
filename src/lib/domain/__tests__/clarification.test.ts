import { describe, it, expect } from "vitest";
import { draftClarification, hasClientQuestion } from "../clarification";
import { CLIENT_DETECTORS, SAFEGUARDING_VERSION } from "../safeguarding";

const CLIENT_KEYS = [
  "cash_withdrawal_spike",
  "structuring",
  "rapid_in_out",
  "new_payee_high_value",
  "high_risk_merchant",
  "leefgeld_diversion",
  "direct_debit_without_recorded_mandate",
];

const draftFor = (key: string) =>
  draftClarification({
    detectorKey: key,
    clientFirstName: "Dennis",
    evidence: {
      recentTotalCents: 80_000,
      creditCents: 120_000,
      amountCents: 80_000,
      counterparty: "Q Trading BV",
      merchant: "Holland Casino",
    },
  });

describe("every client-facing question obeys the N4 wording rules", () => {
  it.each(CLIENT_KEYS)("%s never says fraude or accuses", (key) => {
    const d = draftFor(key);
    expect(d).not.toBeNull();
    const body = d!.body.toLowerCase();
    for (const word of [
      "fraude",
      "frauduleus",
      "misbruik",
      "verdacht",
      "onrechtmatig",
      "diefstal",
      "gestolen",
      "illegaal",
    ]) {
      expect(body, `${key} used "${word}"`).not.toContain(word);
    }
  });

  it.each(CLIENT_KEYS)("%s actually asks a question", (key) => {
    expect(draftFor(key)!.body).toContain("?");
  });

  it.each(CLIENT_KEYS)("%s explains why we are asking", (key) => {
    // A question with no reason reads as surveillance.
    expect(draftFor(key)!.body).toContain("Dat hoort bij ons werk");
  });

  it.each(CLIENT_KEYS)("%s says not remembering is fine", (key) => {
    expect(draftFor(key)!.body).toContain("niet meer weet");
  });

  it.each(CLIENT_KEYS)("%s affirms the money is the client's own", (key) => {
    // Under bewind the bewindvoerder administers; the client is still an
    // adult with their own life. The message must not imply otherwise.
    expect(draftFor(key)!.body).toContain("Het is uw geld");
    expect(draftFor(key)!.body).toContain("geen toestemming");
  });

  it.each(CLIENT_KEYS)("%s addresses the client by name", (key) => {
    expect(draftFor(key)!.body).toContain("Beste Dennis");
  });

  it.each(CLIENT_KEYS)("%s is written in short, B1-register sentences", (key) => {
    const sentences = draftFor(key)!
      .body.split(/[.?!]\s/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("["));
    for (const s of sentences) {
      const words = s.split(/\s+/).length;
      expect(words, `too long in ${key}: "${s}"`).toBeLessThanOrEqual(30);
    }
  });

  it.each(CLIENT_KEYS)("%s uses no legal or financial jargon", (key) => {
    const body = draftFor(key)!.body.toLowerCase();
    for (const jargon of [
      "conform",
      "krachtens",
      "dientengevolge",
      "vordering",
      "debiteur",
      "saldering",
      "transactiepatroon",
    ]) {
      expect(body, `${key} used jargon "${jargon}"`).not.toContain(jargon);
    }
  });
});

describe("the gentler cases stay gentle", () => {
  it("does not moralise about how the client spends their own money", () => {
    const body = draftFor("high_risk_merchant")!.body.toLowerCase();
    for (const word of ["gokken", "verslaving", "probleem", "gevaarlijk"]) {
      expect(body).not.toContain(word);
    }
    // It offers help rather than passing judgement.
    expect(body).toContain("rond te komen");
    expect(body).toContain("wilt u dat wij meekijken");
  });

  it("asks about pressure without naming or accusing anyone", () => {
    // "Did someone ask you to do this" is the safeguarding question that
    // matters, and it can be asked without implicating a specific person.
    const body = draftFor("leefgeld_diversion")!.body;
    expect(body).toContain("heeft iemand u gevraagd");
    expect(body).not.toMatch(/familie|zoon|dochter|partner|buurman/i);
  });
});

describe("questions that must NOT be put to the client", () => {
  it("has no client question for a beneficiary-name mismatch", () => {
    // The client cannot know whose account number a company uses; asking
    // them would be asking a question they have no way to answer.
    expect(draftClarification({
      detectorKey: "beneficiary_name_mismatch",
      clientFirstName: "Dennis",
      evidence: {},
    })).toBeNull();
    expect(hasClientQuestion("beneficiary_name_mismatch")).toBe(false);
  });

  it("has no client question for any office-scope detector", () => {
    // You do not ask a client to explain their bewindvoerder's conduct.
    for (const key of [
      "office_linked_beneficiary_outside_fee_basis",
      "fee_above_schedule",
      "four_eyes_violation",
    ]) {
      expect(hasClientQuestion(key)).toBe(false);
    }
  });

  it("returns null for an unknown detector rather than improvising", () => {
    expect(hasClientQuestion("something_new")).toBe(false);
  });
});

describe("coverage", () => {
  it("keeps the detector set and the question set in step", () => {
    // If a client detector ships without a decision about whether it has a
    // question, that is a gap worth failing on.
    expect(CLIENT_DETECTORS.length).toBe(8);
    expect(CLIENT_KEYS.length + 1).toBe(8); // +1 = beneficiary_name_mismatch
    expect(SAFEGUARDING_VERSION).toBe("safeguarding-v1");
  });
});
