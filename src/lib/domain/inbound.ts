/**
 * Reading structured facts out of an inbound message — pure, no I/O.
 *
 * Deterministic, provenance-bearing extraction of the few labelled fields the
 * rule checks need (principal, collection costs, reference dates). Every value
 * carries the verbatim snippet it came from, exactly as `intake.ts` requires
 * of model output — the rule is the same whoever did the reading.
 *
 * This is NOT a replacement for the AI extractor. It handles the labelled
 * lines that Dutch aanmaningen and beschikkingen almost always carry, which
 * means the checks work when the AI gateway is rate-limited or unavailable —
 * the graceful-fallback invariant. Free-form documents still go through
 * `intake.ts`.
 */

import { parseEuro } from "@/lib/domain/money";

export type EvidencedValue<T> = {
  readonly value: T;
  /** The verbatim source text this was read from. */
  readonly snippet: string;
};

export type InboundFacts = {
  readonly principalCents?: EvidencedValue<number>;
  readonly collectionCostsCents?: EvidencedValue<number>;
  readonly totalCents?: EvidencedValue<number>;
  readonly reference?: EvidencedValue<string>;
  readonly dueDate?: EvidencedValue<string>;
  readonly noticeReceiptDate?: EvidencedValue<string>;
};

/** Labels seen on Dutch collection letters, per field. */
const LABELS: Record<keyof InboundFacts, string[]> = {
  principalCents: ["hoofdsom", "openstaande hoofdsom", "principal"],
  collectionCostsCents: [
    "incassokosten",
    "buitengerechtelijke incassokosten",
    "bik",
  ],
  totalCents: ["totaal te voldoen", "totaalbedrag", "totaal"],
  reference: ["kenmerk", "dossiernummer", "referentie", "ons kenmerk"],
  dueDate: ["uiterlijk", "vervaldatum", "te voldoen voor"],
  noticeReceiptDate: ["ontvangen op", "aangetekend ontvangen"],
};

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find "<label>: <value>" on one line. Anchored to the label so a number
 * elsewhere in the letter is never picked up — an unlabelled amount is not
 * evidence of what it is.
 */
function labelledMatch(text: string, labels: string[]): RegExpMatchArray | null {
  for (const label of labels) {
    const re = new RegExp(
      `^[^\\n]*\\b${escape(label)}\\b[^\\n]*?[:\\s]\\s*([^\\n]+)$`,
      "im"
    );
    const m = text.match(re);
    if (m) return m;
  }
  return null;
}

function readEuro(
  text: string,
  labels: string[]
): EvidencedValue<number> | undefined {
  const m = labelledMatch(text, labels);
  if (!m) return undefined;
  // Reuse the locale-aware parser: os-v1 PR-6 r2 shipped a bug where
  // "486.30" became €48.630 because a naive parse treated "." as a
  // thousands separator. One parser, one behaviour.
  //
  // parseEuro RETURNS INTEGER CENTS, not euros — do not scale it again.
  const cents = parseEuro(m[1].replace(/[^0-9.,\-]/g, "").trim());
  if (cents === null || !Number.isFinite(cents) || cents <= 0) return undefined;
  return { value: cents, snippet: m[0].trim() };
}

function readDate(
  text: string,
  labels: string[]
): EvidencedValue<string> | undefined {
  const m = labelledMatch(text, labels);
  if (!m) return undefined;
  const iso = m[1].match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { value: iso[0], snippet: m[0].trim() };
  const nl = m[1].match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (nl) {
    const [, d, mo, y] = nl;
    return {
      value: `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`,
      snippet: m[0].trim(),
    };
  }
  return undefined;
}

function readText(
  text: string,
  labels: string[]
): EvidencedValue<string> | undefined {
  const m = labelledMatch(text, labels);
  if (!m) return undefined;
  const value = m[1].trim().split(/\s{2,}/)[0].trim();
  if (value.length < 3) return undefined;
  return { value, snippet: m[0].trim() };
}

export function readInboundFacts(text: string): InboundFacts {
  if (!text) return {};
  return {
    principalCents: readEuro(text, LABELS.principalCents),
    collectionCostsCents: readEuro(text, LABELS.collectionCostsCents),
    totalCents: readEuro(text, LABELS.totalCents),
    reference: readText(text, LABELS.reference),
    dueDate: readDate(text, LABELS.dueDate),
    noticeReceiptDate: readDate(text, LABELS.noticeReceiptDate),
  };
}

/** Coarse kind classification from subject + body, deterministic. */
export type ObligationKind =
  | "payment_demand"
  | "information_request"
  | "court_filing"
  | "decision_notice"
  | "client_request"
  | "appointment"
  | "other";

const KIND_HINTS: [ObligationKind, RegExp][] = [
  ["court_filing", /\b(rechtbank|kantonrechter|griffie|zitting|verzoekschrift)\b/i],
  ["payment_demand", /\b(aanmaning|sommatie|incasso|openstaand|vordering|herinnering)\b/i],
  ["decision_notice", /\b(beschikking|besluit|toekenning|afwijzing)\b/i],
  ["information_request", /\b(verzoek om informatie|aanleveren|opgave|wij verzoeken u)\b/i],
  ["appointment", /\b(afspraak|uitnodiging|gesprek op)\b/i],
];

export function classifyObligationKind(
  subject: string,
  body: string
): ObligationKind {
  const hay = `${subject}\n${body}`;
  for (const [kind, re] of KIND_HINTS) if (re.test(hay)) return kind;
  return "other";
}
