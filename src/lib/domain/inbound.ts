/**
 * Reading structured facts out of an inbound message — pure, no I/O.
 *
 * ITS OWN PROVENANCE CONTRACT (Temujin PR-9 r1)
 * --------------------------------------------
 * This is a SEPARATE extraction path from `intake.ts`, not a reuse of it, and
 * it should be judged on its own terms rather than borrowing that module's
 * guarantees. Stated explicitly, the contract here is:
 *
 *   1. LABEL-ANCHORED ONLY. A value is read solely from a line that carries
 *      a recognised label. An unlabelled number anywhere in the letter is
 *      never picked up — an amount with no label is not evidence of what it
 *      is. This is narrower than the AI extractor and deliberately so.
 *   2. VERBATIM SNIPPET, ALWAYS. Every returned value carries the exact
 *      source line it came from. A value without a snippet cannot exist,
 *      because the type makes the snippet mandatory.
 *   3. NO INFERENCE. Nothing is derived, combined, or guessed from context.
 *      What is not on a labelled line is `undefined`, and `undefined`
 *      propagates to abstention in the checks downstream.
 *   4. ONE PARSER. Amounts go through `parseEuro`, the same locale-aware
 *      parser manual entry uses, so "486.30" cannot mean two different
 *      things in two places.
 *
 * Because it makes no inferences it is stronger than the model path within
 * its small scope, and useless outside it. Its purpose is that the rule
 * checks still work when the AI gateway is rate-limited — the graceful-
 * fallback invariant. Free-form documents still go through `intake.ts`.
 */

import { parseEuro } from "@/lib/domain/money";

export type EvidencedValue<T> = {
  readonly value: T;
  /** The verbatim source text this was read from. */
  readonly snippet: string;
};

/**
 * Evidence that the CONSUMER collection regime applies to this claim
 * (Temujin PR-9 r1 #3).
 *
 * Frank previously inferred this from the dossier existing — everyone under
 * bewind is a natural person, so the reasoning went, the consumer rules
 * apply. That is an inference dressed as evidence, and it is wrong on its
 * own terms: a natural person can incur a debt from business activity, to
 * which the BIK consumer staffel and its €40 minimum do not apply the same
 * way. Asserting a cap breach on that footing would put a bewindvoerder in
 * front of a creditor with a claim we cannot support.
 *
 * So the basis must come from the DOCUMENT. These are the phrases by which
 * a Dutch collection letter signals that it is itself invoking the consumer
 * regime — which is the creditor's own statement, not our guess.
 */
const CONSUMER_REGIME_PHRASES = [
  "wet incassokosten",
  "wik",
  "besluit vergoeding voor buitengerechtelijke incassokosten",
  "buitengerechtelijke incassokosten",
  "wettelijke staffel",
  "veertien dagen",
  "14-dagenbrief",
];

export function readConsumerBasis(
  text: string
): EvidencedValue<"document_states_consumer"> | undefined {
  if (!text) return undefined;
  const lines = text.split("\n");
  for (const line of lines) {
    const lower = line.toLowerCase();
    for (const phrase of CONSUMER_REGIME_PHRASES) {
      // Word-boundary match so "wik" does not fire inside "wikkel".
      const re = new RegExp(`(^|[^a-z])${escape(phrase)}([^a-z]|$)`, "i");
      if (re.test(lower))
        return { value: "document_states_consumer", snippet: line.trim() };
    }
  }
  return undefined;
}

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
