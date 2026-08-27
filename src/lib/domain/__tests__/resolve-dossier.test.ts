import { describe, it, expect } from "vitest";
import {
  resolveDossier,
  RESOLUTION_FLOOR,
  type DossierCandidate,
} from "../resolve-dossier";

const vries: DossierCandidate = {
  id: "d-vries",
  dossierNumber: "BW-2024-0117",
  bsn: "123456782",
  ibans: ["NL91ABNA0417164300"],
  contactEmails: ["info@vestingfinance.nl"],
  debtReferences: ["VF-8842190"],
  firstName: "Jan",
  lastName: "de Vries",
};

const jansen: DossierCandidate = {
  id: "d-jansen",
  dossierNumber: "BW-2024-0118",
  ibans: ["NL02RABO0123456789"],
  firstName: "Maria",
  lastName: "Jansen",
};

const candidates = [vries, jansen];

describe("resolveDossier — deterministic matchers", () => {
  it("matches on dossiernummer with high confidence", () => {
    const r = resolveDossier({
      text: "Betreft dossier BW-2024-0117, openstaand bedrag.",
      candidates,
    });
    expect(r.dossierId).toBe("d-vries");
    expect(r.reason).toBe("matched");
    expect(r.evidence.map((e) => e.matcher)).toContain("dossiernummer");
  });

  it("matches on IBAN however it is spaced", () => {
    const r = resolveDossier({
      text: "Overboeking naar NL91 ABNA 0417 1643 00 ontvangen.",
      candidates,
    });
    expect(r.dossierId).toBe("d-vries");
    expect(r.evidence.map((e) => e.matcher)).toContain("iban");
  });

  it("never echoes a BSN back into the evidence", () => {
    const r = resolveDossier({
      text: "BSN 123456782 behorend bij deze aanvraag.",
      candidates,
    });
    expect(r.dossierId).toBe("d-vries");
    const bsnHit = r.evidence.find((e) => e.matcher === "bsn");
    expect(bsnHit?.value).toBe("[BSN]");
    expect(JSON.stringify(r)).not.toContain("123456782");
  });

  it("matches a debt reference but ignores short ones", () => {
    expect(
      resolveDossier({ text: "Kenmerk VF-8842190", candidates }).dossierId
    ).toBe("d-vries");
    const shortRef = resolveDossier({
      text: "Kenmerk 12",
      candidates: [{ ...vries, debtReferences: ["12"] }],
    });
    expect(shortRef.dossierId).toBeNull();
  });

  it("does not match a reference embedded in a longer number", () => {
    const r = resolveDossier({
      text: "Transactie 99VF-884219000123 verwerkt",
      candidates,
    });
    expect(r.dossierId).toBeNull();
  });

  it("raises confidence when several matchers corroborate", () => {
    const one = resolveDossier({ text: "dossier BW-2024-0117", candidates });
    const many = resolveDossier({
      text: "dossier BW-2024-0117, IBAN NL91ABNA0417164300, Jan de Vries",
      candidates,
    });
    expect(many.confidence).toBeGreaterThan(one.confidence);
  });

  it("never reports 100% confidence", () => {
    const r = resolveDossier({
      text: "BW-2024-0117 BSN 123456782 NL91ABNA0417164300 VF-8842190 Jan de Vries",
      candidates,
    });
    expect(r.confidence).toBeLessThanOrEqual(99);
  });
});

describe("resolveDossier — refusing to guess", () => {
  it("returns no link when nothing matches", () => {
    const r = resolveDossier({ text: "Algemene nieuwsbrief", candidates });
    expect(r.dossierId).toBeNull();
    expect(r.reason).toBe("no_candidate");
  });

  it("does NOT link on a name alone", () => {
    // A name is not an identification. This is the case that would put one
    // client's creditor letter into another client's file.
    const r = resolveDossier({ text: "Geachte heer Jan de Vries,", candidates });
    expect(r.dossierId).toBeNull();
    expect(r.reason).toBe("below_floor");
    expect(r.confidence).toBeLessThan(RESOLUTION_FLOOR);
  });

  it("does not link on a contact email alone", () => {
    // Vesting Finance writes about many clients from one address.
    const r = resolveDossier({
      text: "Betreft: openstaande vordering.",
      fromAddress: "info@vestingfinance.nl",
      candidates,
    });
    expect(r.dossierId).toBeNull();
    expect(r.reason).toBe("below_floor");
  });

  it("links when the creditor email is corroborated by a reference", () => {
    const r = resolveDossier({
      text: "Betreft kenmerk VF-8842190.",
      fromAddress: "info@vestingfinance.nl",
      candidates,
    });
    expect(r.dossierId).toBe("d-vries");
  });

  it("refuses to pick when two dossiers tie at the top", () => {
    const twins = [
      { ...vries, id: "a", dossierNumber: "SAME-001" },
      { ...jansen, id: "b", dossierNumber: "SAME-001" },
    ];
    const r = resolveDossier({ text: "dossier SAME-001", candidates: twins });
    expect(r.dossierId).toBeNull();
    expect(r.ambiguous).toBe(true);
    expect(r.reason).toBe("ambiguous");
  });

  it("still picks the clear winner when a weaker candidate also matches", () => {
    const r = resolveDossier({
      text: "dossier BW-2024-0117 inzake Maria Jansen genoemd als contactpersoon",
      candidates,
    });
    expect(r.dossierId).toBe("d-vries");
    expect(r.ambiguous).toBe(false);
  });

  it("handles empty input without throwing", () => {
    expect(resolveDossier({ text: "", candidates }).dossierId).toBeNull();
    expect(resolveDossier({ text: "x", candidates: [] }).reason).toBe(
      "no_candidate"
    );
  });
});
