/**
 * Routing an inbound message to a dossier — pure, no I/O (plan os-v2 §5).
 *
 * DETERMINISTIC FIRST, MODEL LAST. A dossiernummer, a BSN or the dossier's
 * own IBAN appearing in the text is a fact; asking a model to guess whose
 * letter this is would be inventing one. So the matchers below are plain
 * string work, each recording WHY it matched, and the model is only ever a
 * tiebreak between candidates the deterministic pass already surfaced.
 *
 * Two outcomes are correct here, not one:
 *   - a link, above the confidence floor, written PROVISIONALLY
 *     (linkSource "agent", linkReviewed false — plan §2.1 category B), or
 *   - no link at all, status `needs_dossier`, and a human picks.
 *
 * Never a silent guess. Misrouting puts one client's creditor letter into
 * another client's file, and the people in these dossiers cannot easily
 * detect or contest that.
 */

export type DossierCandidate = {
  readonly id: string;
  readonly dossierNumber?: string | null;
  readonly bsn?: string | null;
  readonly ibans?: readonly string[];
  readonly contactEmails?: readonly string[];
  readonly debtReferences?: readonly string[];
  readonly firstName?: string;
  readonly lastName?: string;
};

export type ResolutionMatcher =
  | "dossiernummer"
  | "bsn"
  | "iban"
  | "debt_reference"
  | "contact_email"
  | "name";

/**
 * How much each matcher is worth on its own. A name is deliberately far
 * below the floor: "J. de Vries" is not an identification, and treating it
 * as one is exactly how letters end up in the wrong file.
 */
export const MATCHER_WEIGHT: Record<ResolutionMatcher, number> = {
  dossiernummer: 95,
  bsn: 95,
  iban: 85,
  debt_reference: 70,
  contact_email: 55,
  name: 30,
};

/** Below this, no link is written and a human decides. */
export const RESOLUTION_FLOOR = 70;

/** Corroboration bonus per additional independent matcher. */
const CORROBORATION_BONUS = 4;
/** Never 100: certainty is not something this can honestly report. */
const MAX_CONFIDENCE = 99;

export type ResolutionEvidence = {
  readonly matcher: ResolutionMatcher;
  readonly value: string;
};

export type Resolution = {
  readonly dossierId: string | null;
  readonly confidence: number;
  readonly evidence: readonly ResolutionEvidence[];
  /** True when two or more candidates scored equally at the top. */
  readonly ambiguous: boolean;
  readonly reason: "matched" | "below_floor" | "ambiguous" | "no_candidate";
};

/** Digits only, so IBANs match regardless of how they were spaced. */
function squash(s: string): string {
  return s.replace(/\s+/g, "").toUpperCase();
}

/** Whole-token match, so a reference cannot match inside a longer number. */
function containsToken(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`, "i").test(
    haystack
  );
}

function scoreCandidate(
  candidate: DossierCandidate,
  haystack: string,
  squashedHaystack: string,
  fromAddress: string | null
): ResolutionEvidence[] {
  const hits: ResolutionEvidence[] = [];

  if (candidate.dossierNumber && containsToken(haystack, candidate.dossierNumber))
    hits.push({ matcher: "dossiernummer", value: candidate.dossierNumber });

  if (candidate.bsn && containsToken(haystack, candidate.bsn))
    hits.push({ matcher: "bsn", value: "[BSN]" }); // never echoed back

  for (const iban of candidate.ibans ?? []) {
    if (iban && squashedHaystack.includes(squash(iban))) {
      hits.push({ matcher: "iban", value: iban });
      break;
    }
  }

  for (const ref of candidate.debtReferences ?? []) {
    // Short references are not identifying — "12" appears everywhere.
    if (ref && ref.length >= 6 && containsToken(haystack, ref)) {
      hits.push({ matcher: "debt_reference", value: ref });
      break;
    }
  }

  if (fromAddress) {
    const from = fromAddress.trim().toLowerCase();
    for (const email of candidate.contactEmails ?? []) {
      if (email && email.trim().toLowerCase() === from) {
        hits.push({ matcher: "contact_email", value: email });
        break;
      }
    }
  }

  // Full name only, and only as corroboration — never enough alone.
  const full = `${candidate.firstName ?? ""} ${candidate.lastName ?? ""}`.trim();
  if (full.length > 4 && haystack.toLowerCase().includes(full.toLowerCase()))
    hits.push({ matcher: "name", value: full });

  return hits;
}

function confidenceOf(hits: readonly ResolutionEvidence[]): number {
  if (hits.length === 0) return 0;
  const best = Math.max(...hits.map((h) => MATCHER_WEIGHT[h.matcher]));
  return Math.min(best + (hits.length - 1) * CORROBORATION_BONUS, MAX_CONFIDENCE);
}

export function resolveDossier(input: {
  text: string;
  fromAddress?: string | null;
  candidates: readonly DossierCandidate[];
}): Resolution {
  const haystack = input.text ?? "";
  const squashedHaystack = squash(haystack);
  const from = input.fromAddress ?? null;

  const scored = input.candidates
    .map((c) => {
      const evidence = scoreCandidate(c, haystack, squashedHaystack, from);
      return { id: c.id, evidence, confidence: confidenceOf(evidence) };
    })
    .filter((s) => s.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence);

  if (scored.length === 0)
    return {
      dossierId: null,
      confidence: 0,
      evidence: [],
      ambiguous: false,
      reason: "no_candidate",
    };

  const top = scored[0];

  // A tie at the top is not a coin flip. Two dossiers matching equally well
  // means we do not know, and saying so is the only safe answer.
  if (scored.length > 1 && scored[1].confidence === top.confidence)
    return {
      dossierId: null,
      confidence: top.confidence,
      evidence: top.evidence,
      ambiguous: true,
      reason: "ambiguous",
    };

  if (top.confidence < RESOLUTION_FLOOR)
    return {
      dossierId: null,
      confidence: top.confidence,
      evidence: top.evidence,
      ambiguous: false,
      reason: "below_floor",
    };

  return {
    dossierId: top.id,
    confidence: top.confidence,
    evidence: top.evidence,
    ambiguous: false,
    reason: "matched",
  };
}
