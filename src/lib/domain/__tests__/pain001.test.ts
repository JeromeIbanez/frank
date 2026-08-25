import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { generatePain001, isValidIban, type PaymentInstruction } from "../pain001";

const validInput = {
  messageId: "FRANK-BATCH-2026-08-25-001",
  creationDateTime: "2026-08-25T10:00:00",
  initiatingParty: "Frank Bewindvoering B.V.",
  debtorName: "J. de Vries (beheerrekening)",
  debtorIban: "NL91ABNA0417164300",
  requestedExecutionDate: "2026-08-27",
  instructions: [
    {
      creditorName: "Woonstichting De Sleutel",
      creditorIban: "NL20INGB0001234567",
      amountCents: 71250,
      remittanceInfo: "Huur september 2026 contract 88123",
      endToEndId: "E2E-HUUR-2026-09",
    },
    {
      creditorName: "Zilveren Kruis & Co",
      creditorIban: "DE89370400440532013000",
      amountCents: 15895,
      remittanceInfo: null,
      endToEndId: "E2E-ZORG-2026-09",
    },
  ] satisfies PaymentInstruction[],
};

function assertOk(
  result: ReturnType<typeof generatePain001>,
): asserts result is { xml: string; controlSumCents: number; count: number } {
  expect("errors" in result ? result.errors : []).toEqual([]);
}

describe("isValidIban", () => {
  it("accepts valid IBANs (mod-97)", () => {
    expect(isValidIban("NL91ABNA0417164300")).toBe(true);
    expect(isValidIban("NL20INGB0001234567")).toBe(true);
    expect(isValidIban("DE89370400440532013000")).toBe(true);
    expect(isValidIban("nl91 abna 0417 1643 00")).toBe(true); // spacing/case tolerant
  });

  it("rejects invalid IBANs", () => {
    expect(isValidIban("NL91ABNA0417164301")).toBe(false); // checksum off by one
    expect(isValidIban("NL02RABO0123456789")).toBe(false); // bad mod-97
    expect(isValidIban("XX00")).toBe(false);
    expect(isValidIban("")).toBe(false);
  });
});

describe("generatePain001", () => {
  it("produces well-formed XML that round-trips through fast-xml-parser", () => {
    const result = generatePain001(validInput);
    assertOk(result);
    expect(XMLValidator.validate(result.xml)).toBe(true);

    const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
    const doc = parser.parse(result.xml) as {
      Document: {
        CstmrCdtTrfInitn: {
          GrpHdr: { MsgId: string; NbOfTxs: string; CtrlSum: string };
          PmtInf: {
            ReqdExctnDt: string;
            DbtrAcct: { Id: { IBAN: string } };
            CdtTrfTxInf: Array<{
              Amt: { InstdAmt: { "#text": string; "@_Ccy": string } };
            }>;
          };
        };
      };
    };
    const grpHdr = doc.Document.CstmrCdtTrfInitn.GrpHdr;
    expect(grpHdr.MsgId).toBe(validInput.messageId);
    expect(grpHdr.NbOfTxs).toBe("2");
    expect(grpHdr.CtrlSum).toBe("871.45"); // 712.50 + 158.95
    const pmtInf = doc.Document.CstmrCdtTrfInitn.PmtInf;
    expect(pmtInf.ReqdExctnDt).toBe("2026-08-27");
    expect(pmtInf.DbtrAcct.Id.IBAN).toBe("NL91ABNA0417164300");
    expect(pmtInf.CdtTrfTxInf).toHaveLength(2);
    expect(pmtInf.CdtTrfTxInf[0]?.Amt.InstdAmt["#text"]).toBe("712.50");
    expect(pmtInf.CdtTrfTxInf[0]?.Amt.InstdAmt["@_Ccy"]).toBe("EUR");
  });

  it("returns correct control sum and count", () => {
    const result = generatePain001(validInput);
    assertOk(result);
    expect(result.controlSumCents).toBe(87145);
    expect(result.count).toBe(2);
  });

  it("escapes & (and other specials) in names and remittance", () => {
    const result = generatePain001({
      ...validInput,
      instructions: [
        {
          ...validInput.instructions[0]!,
          creditorName: "Bakker & Zonen <B.V.>",
          remittanceInfo: 'Factuur "2026" & rente',
        },
      ],
    });
    assertOk(result);
    expect(result.xml).toContain("Bakker &amp; Zonen &lt;B.V.&gt;");
    expect(result.xml).toContain("Factuur &quot;2026&quot; &amp; rente");
    expect(XMLValidator.validate(result.xml)).toBe(true);
    // Parses back to the original text.
    const parsed = new XMLParser({ parseTagValue: false }).parse(result.xml) as {
      Document: { CstmrCdtTrfInitn: { PmtInf: { CdtTrfTxInf: { Cdtr: { Nm: string } } } } };
    };
    expect(parsed.Document.CstmrCdtTrfInitn.PmtInf.CdtTrfTxInf.Cdtr.Nm).toBe(
      "Bakker & Zonen <B.V.>",
    );
  });

  it("rejects an invalid creditor IBAN", () => {
    const result = generatePain001({
      ...validInput,
      instructions: [{ ...validInput.instructions[0]!, creditorIban: "NL00FAKE0000000000" }],
    });
    expect("errors" in result).toBe(true);
    if ("errors" in result) {
      expect(result.errors.some((e) => e.includes("invalid creditor IBAN"))).toBe(true);
    }
  });

  it("rejects an invalid debtor IBAN", () => {
    const result = generatePain001({ ...validInput, debtorIban: "NL02RABO0123456789" });
    expect("errors" in result).toBe(true);
  });

  it("rejects zero and negative amounts", () => {
    for (const amountCents of [0, -100]) {
      const result = generatePain001({
        ...validInput,
        instructions: [{ ...validInput.instructions[0]!, amountCents }],
      });
      expect("errors" in result).toBe(true);
      if ("errors" in result) {
        expect(result.errors.some((e) => e.includes("positive"))).toBe(true);
      }
    }
  });

  it("rejects an empty batch", () => {
    const result = generatePain001({ ...validInput, instructions: [] });
    expect("errors" in result).toBe(true);
  });

  it("rejects a missing execution date", () => {
    const result = generatePain001({ ...validInput, requestedExecutionDate: "" });
    expect("errors" in result).toBe(true);
  });
});
