import { describe, it, expect } from "vitest";
import { draftWikDispute, draftInfoRequestAck } from "../reply-drafts";

const wikInput = {
  creditorName: "Santander Consumer Finance",
  reference: "REF-SAN-1006",
  principalCents: 41_230,
  chargedCostsCents: 7_500,
  maximumCents: 6_185,
  excessCents: 1_315,
  clientName: "Dennis Smit",
  sourceUrl: "https://wetten.overheid.nl/BWBR0031432/",
};

describe("draftWikDispute", () => {
  it("is written in Dutch, as official correspondence must be", () => {
    const d = draftWikDispute(wikInput);
    expect(d.body).toContain("Geachte heer/mevrouw");
    expect(d.body).toContain("Met vriendelijke groet");
    expect(d.body).not.toMatch(/\bDear\b|\bSincerely\b/);
  });

  it("states every amount from the finding, correctly formatted", () => {
    const d = draftWikDispute(wikInput);
    expect(d.body).toContain("€ 75,00"); // charged
    expect(d.body).toContain("€ 412,30"); // principal
    expect(d.body).toContain("€ 61,85"); // statutory maximum
    expect(d.body).toContain("€ 13,15"); // excess
  });

  it("computes the undisputed total as principal + statutory maximum", () => {
    // €412,30 + €61,85 = €474,15. Offering to pay the undisputed part is
    // what actually resolves these, so the number has to be right.
    expect(draftWikDispute(wikInput).body).toContain("€ 474,15");
  });

  it("disputes ONLY the excess, never the underlying debt", () => {
    const d = draftWikDispute(wikInput);
    expect(d.body).toContain("uitsluitend");
    expect(d.body).toContain("worden niet betwist");
    // It must not allege bad faith or refuse the principal — the check
    // established one thing, so the letter asserts one thing.
    expect(d.body).not.toMatch(/fraude|onrechtmatig|opzettelijk|weiger/i);
  });

  it("cites the besluit and carries the source URL", () => {
    const d = draftWikDispute(wikInput);
    expect(d.body).toContain("Besluit vergoeding voor");
    expect(d.body).toContain(wikInput.sourceUrl);
  });

  it("names the client and the reference in the subject", () => {
    const d = draftWikDispute(wikInput);
    expect(d.subject).toContain("Dennis Smit");
    expect(d.subject).toContain("REF-SAN-1006");
    expect(d.templateKey).toBe("wik_dispute");
  });

  it("omits the reference cleanly when there is none", () => {
    const d = draftWikDispute({ ...wikInput, reference: undefined });
    expect(d.subject).not.toContain("kenmerk");
    expect(d.body).not.toContain("(kenmerk )");
  });
});

describe("draftInfoRequestAck", () => {
  it("confirms receipt and names the deadline back", () => {
    const d = draftInfoRequestAck({
      senderName: "Gemeente Rotterdam",
      reference: "REF-VAT-1003",
      clientName: "Sandra Vermeulen",
      dueDate: "2026-09-15",
    });
    expect(d.body).toContain("ontvangst");
    expect(d.body).toContain("2026-09-15");
    expect(d.subject).toContain("Sandra Vermeulen");
    expect(d.templateKey).toBe("info_request_ack");
  });

  it("does not promise a date Frank cannot know the office will meet", () => {
    const d = draftInfoRequestAck({
      senderName: "Gemeente Rotterdam",
      clientName: "Sandra Vermeulen",
      dueDate: null,
    });
    expect(d.body).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(d.body).toContain("Geachte heer/mevrouw");
  });
});
