/**
 * CAMT.053.001.02 bank statement parser — ONE documented profile.
 *
 * Profile assumption (documented per PRD §6 M3):
 *  - Generic ISO 20022 camt.053.001.02 as exported by ABN AMRO-style bank
 *    portals: `Document > BkToCstmrStmt > Stmt` with the account IBAN at
 *    `Stmt > Acct > Id > IBAN`.
 *  - Balances as `Stmt > Bal` elements, coded `OPBD` (opening booked) and
 *    `CLBD` (closing booked) under `Tp > CdOrPrtry > Cd`, with `CdtDbtInd`
 *    (DBIT balances are negative).
 *  - Entries as `Stmt > Ntry` with `Amt` (decimal string, EUR), `CdtDbtInd`
 *    (CRDT = money in / positive, DBIT = money out / negative), booking date
 *    at `BookgDt > Dt`, and a single transaction's detail at
 *    `NtryDtls > TxDtls` (first TxDtls is used when the bank nests one
 *    transaction per entry, which this profile assumes): counterparty from
 *    `RltdPties` (`Cdtr`/`CdtrAcct` for DBIT, `Dbtr`/`DbtrAcct` for CRDT),
 *    remittance info from `RmtInf > Ustrd`, end-to-end reference from
 *    `Refs > EndToEndId`.
 *  - Missing optional fields map to null; a malformed or structurally
 *    unexpected file populates `errors` instead of throwing.
 *
 * Money invariant: amounts are integer cents, parsed from the decimal string
 * without floating-point arithmetic.
 */
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { createHash } from "node:crypto";

export type CamtEntry = {
  bookingDate: string; // ISO
  amountCents: number; // signed, negative = DBIT
  counterpartyName: string | null;
  counterpartyIban: string | null;
  description: string | null; // from RmtInf/Ustrd
  endToEndId: string | null;
  accountIban: string;
};

export type CamtResult = {
  accountIban: string;
  openingBalanceCents: number | null;
  closingBalanceCents: number | null;
  entries: CamtEntry[];
  errors: string[];
};

type Node = Record<string, unknown>;

function asNode(v: unknown): Node | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Node) : null;
}

function asArray(v: unknown): unknown[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Get the text content of a node that may be a string or {"#text": ...}. */
function text(v: unknown): string | null {
  if (typeof v === "string") return v.length > 0 ? v : null;
  if (typeof v === "number") return String(v);
  const node = asNode(v);
  if (node && typeof node["#text"] === "string") {
    return (node["#text"] as string).length > 0 ? (node["#text"] as string) : null;
  }
  if (node && typeof node["#text"] === "number") return String(node["#text"]);
  return null;
}

function child(v: unknown, key: string): unknown {
  const node = asNode(v);
  return node ? node[key] : undefined;
}

/** Parse a decimal amount string ("1234.56") to integer cents, no floats. */
function parseAmountCents(raw: string | null): number | null {
  if (raw === null) return null;
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(raw.trim());
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  const euros = parseInt(m[2] ?? "0", 10);
  const cents = parseInt((m[3] ?? "").padEnd(2, "0") || "0", 10);
  const total = euros * 100 + cents;
  return Number.isSafeInteger(total) ? sign * total : null;
}

export function parseCamt053(xml: string): CamtResult {
  const result: CamtResult = {
    accountIban: "",
    openingBalanceCents: null,
    closingBalanceCents: null,
    entries: [],
    errors: [],
  };

  const valid = XMLValidator.validate(xml);
  if (valid !== true) {
    result.errors.push(`Malformed XML: ${valid.err.msg} (line ${valid.err.line})`);
    return result;
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
  });

  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch (e) {
    result.errors.push(`XML parse error: ${e instanceof Error ? e.message : String(e)}`);
    return result;
  }

  const stmtRaw = child(child(child(doc, "Document"), "BkToCstmrStmt"), "Stmt");
  const stmts = asArray(stmtRaw);
  if (stmts.length === 0) {
    result.errors.push("No Document/BkToCstmrStmt/Stmt element found (unexpected structure).");
    return result;
  }
  // Profile: one statement per file; the first Stmt is used.
  const stmt = stmts[0];

  const accountIban = text(child(child(child(stmt, "Acct"), "Id"), "IBAN"));
  if (accountIban === null) {
    result.errors.push("Missing Stmt/Acct/Id/IBAN.");
    return result;
  }
  result.accountIban = accountIban;

  // Balances (OPBD / CLBD).
  for (const bal of asArray(child(stmt, "Bal"))) {
    const code = text(child(child(child(bal, "Tp"), "CdOrPrtry"), "Cd"));
    const amount = parseAmountCents(text(child(bal, "Amt")));
    if (amount === null) continue;
    const ind = text(child(bal, "CdtDbtInd"));
    const signed = ind === "DBIT" ? -amount : amount;
    if (code === "OPBD") result.openingBalanceCents = signed;
    else if (code === "CLBD") result.closingBalanceCents = signed;
  }

  // Entries.
  const ntries = asArray(child(stmt, "Ntry"));
  for (let i = 0; i < ntries.length; i++) {
    const ntry = ntries[i];
    const bookingDate = text(child(child(ntry, "BookgDt"), "Dt"));
    const amountAbs = parseAmountCents(text(child(ntry, "Amt")));
    const ind = text(child(ntry, "CdtDbtInd"));

    if (bookingDate === null || amountAbs === null || (ind !== "CRDT" && ind !== "DBIT")) {
      result.errors.push(
        `Entry ${i + 1}: missing/invalid BookgDt, Amt or CdtDbtInd — entry skipped.`,
      );
      continue;
    }
    const amountCents = ind === "DBIT" ? -amountAbs : amountAbs;

    // Profile: first TxDtls of NtryDtls carries the (single) transaction.
    const txDtls = asArray(child(child(ntry, "NtryDtls"), "TxDtls"))[0];

    const rltdPties = child(txDtls, "RltdPties");
    const partyKey = ind === "DBIT" ? "Cdtr" : "Dbtr";
    const acctKey = ind === "DBIT" ? "CdtrAcct" : "DbtrAcct";
    const counterpartyName = text(child(child(rltdPties, partyKey), "Nm"));
    const counterpartyIban = text(child(child(child(rltdPties, acctKey), "Id"), "IBAN"));

    const ustrdRaw = asArray(child(child(txDtls, "RmtInf"), "Ustrd"))
      .map((u) => text(u))
      .filter((u): u is string => u !== null);
    const description = ustrdRaw.length > 0 ? ustrdRaw.join(" ") : null;

    const endToEndId = text(child(child(txDtls, "Refs"), "EndToEndId"));

    result.entries.push({
      bookingDate,
      amountCents,
      counterpartyName,
      counterpartyIban,
      description,
      endToEndId,
      accountIban,
    });
  }

  return result;
}

/**
 * Stable deduplication hash for import idempotency (PRD §6 M3: idempotent
 * re-import, transaction uniqueness). sha256 hex over the pipe-joined tuple
 * accountIban|bookingDate|amountCents|endToEndId|counterpartyIban|description
 * with nulls encoded as the empty string.
 */
export function dedupeHash(e: CamtEntry): string {
  const material = [
    e.accountIban,
    e.bookingDate,
    String(e.amountCents),
    e.endToEndId ?? "",
    e.counterpartyIban ?? "",
    e.description ?? "",
  ].join("|");
  return createHash("sha256").update(material, "utf8").digest("hex");
}
