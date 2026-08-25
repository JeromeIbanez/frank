import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dedupeHash, parseCamt053 } from "../camt";

const fixturePath = join(process.cwd(), "fixtures", "camt053-demo.xml");
const fixtureXml = readFileSync(fixturePath, "utf8");

describe("parseCamt053", () => {
  it("parses the demo fixture: account, 14 entries, no errors", () => {
    const res = parseCamt053(fixtureXml);
    expect(res.errors).toEqual([]);
    expect(res.accountIban).toBe("NL91ABNA0417164300");
    expect(res.entries).toHaveLength(14);
    for (const e of res.entries) {
      expect(e.accountIban).toBe("NL91ABNA0417164300");
      expect(e.bookingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isInteger(e.amountCents)).toBe(true);
    }
  });

  it("reads OPBD/CLBD balances and reconciles opening + entries == closing", () => {
    const res = parseCamt053(fixtureXml);
    expect(res.openingBalanceCents).toBe(85025);
    expect(res.closingBalanceCents).toBe(129775);
    const sum = res.entries.reduce((acc, e) => acc + e.amountCents, 0);
    expect(sum).toBe(44750);
    expect((res.openingBalanceCents ?? 0) + sum).toBe(res.closingBalanceCents);
  });

  it("signs DBIT negative and CRDT positive, with the right counterparty side", () => {
    const res = parseCamt053(fixtureXml);
    const uitkering = res.entries.find((e) => e.description?.includes("Participatiewet"));
    expect(uitkering?.amountCents).toBe(145000);
    expect(uitkering?.counterpartyName).toBe("Gemeente Amsterdam");
    const huur = res.entries.find((e) => e.description?.startsWith("Huur juni"));
    expect(huur?.amountCents).toBe(-71250);
    expect(huur?.counterpartyName).toBe("Woonstichting De Sleutel");
    expect(huur?.counterpartyIban).toBe("NL44RABO0198765432");
  });

  it("maps missing optional fields to null (POS entries without counterparty IBAN)", () => {
    const res = parseCamt053(fixtureXml);
    const pos = res.entries.find((e) => e.counterpartyName?.startsWith("Albert Heijn"));
    expect(pos).toBeDefined();
    expect(pos?.counterpartyIban).toBeNull();
  });

  it("populates errors for malformed XML instead of throwing", () => {
    const res = parseCamt053("<Document><BkToCstmrStmt><Stmt>");
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.entries).toEqual([]);
  });

  it("reports unexpected structure as an error", () => {
    const res = parseCamt053("<Whatever><Foo>bar</Foo></Whatever>");
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("handles a statement with zero entries", () => {
    const xml = `<?xml version="1.0"?>
<Document><BkToCstmrStmt><Stmt>
  <Acct><Id><IBAN>NL91ABNA0417164300</IBAN></Id></Acct>
</Stmt></BkToCstmrStmt></Document>`;
    const res = parseCamt053(xml);
    expect(res.errors).toEqual([]);
    expect(res.entries).toEqual([]);
    expect(res.openingBalanceCents).toBeNull();
    expect(res.closingBalanceCents).toBeNull();
  });
});

describe("dedupeHash", () => {
  it("is stable for the same entry", () => {
    const res = parseCamt053(fixtureXml);
    const e = res.entries[0]!;
    expect(dedupeHash(e)).toBe(dedupeHash({ ...e }));
    expect(dedupeHash(e)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for the near-duplicate pair (same date/amount/party, different endToEndId)", () => {
    const res = parseCamt053(fixtureXml);
    const pair = res.entries.filter((e) => e.description === "OV-chipkaart oplading");
    expect(pair).toHaveLength(2);
    const [a, b] = pair;
    expect(a!.amountCents).toBe(b!.amountCents);
    expect(a!.bookingDate).toBe(b!.bookingDate);
    expect(a!.counterpartyIban).toBe(b!.counterpartyIban);
    expect(a!.endToEndId).not.toBe(b!.endToEndId);
    expect(dedupeHash(a!)).not.toBe(dedupeHash(b!));
  });

  it("gives identical hashes on re-parse of the same file (idempotent import basis)", () => {
    const first = parseCamt053(fixtureXml).entries.map(dedupeHash);
    const second = parseCamt053(fixtureXml).entries.map(dedupeHash);
    expect(second).toEqual(first);
    // All 14 hashes are unique within the file.
    expect(new Set(first).size).toBe(14);
  });
});
