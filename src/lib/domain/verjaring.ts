/**
 * Verjaring (limitation) as a VERSIONED LEGAL DATASET — pure, no I/O.
 *
 * THE WORDING IS THE FEATURE (Temujin os-v2 r1 #4)
 * -----------------------------------------------
 * This module never says "verjaard". It says *mogelijke verjaring —
 * juridische toetsing vereist*. The difference is not cosmetic: telling a
 * bewindvoerder a debt IS time-barred, on the strength of what Frank happens
 * to have on file, invites them to stop paying a claim that is in fact still
 * enforceable — and the client bears that consequence, not us.
 *
 * The reason it can never be more than "possible" is invariant N4b: absence
 * of a record in Frank is not evidence of absence in the world. A stuiting
 * (interruption) can be a letter we never saw, an acknowledgement the client
 * made by phone, a payment to a different account, or proceedings we were
 * never told about. Each resets the clock, and each is invisible here.
 *
 * So the finding is an INVITATION TO CHECK, addressed to a professional who
 * can obtain what we cannot.
 */

export const VERJARING_DATASET_VERSION = "verjaring-2026.1";

export type VerjaringRule = {
  readonly key: string;
  /** Statutory basis, shown verbatim in the finding. */
  readonly article: string;
  readonly years: number;
  readonly labelNl: string;
  readonly labelEn: string;
};

/**
 * Deliberately small. Every rule here is one whose applicability can be
 * decided from a debt type Frank already records; the general five-year
 * rule is the safe default and anything genuinely uncertain is simply
 * absent, which produces abstention.
 */
export const VERJARING_RULES: readonly VerjaringRule[] = [
  {
    key: "algemeen_nakoming",
    article: "art. 3:307 BW",
    years: 5,
    labelNl: "vordering tot nakoming van een verbintenis uit overeenkomst",
    labelEn: "claim to performance of a contractual obligation",
  },
  {
    key: "periodiek",
    article: "art. 3:308 BW",
    years: 5,
    labelNl: "periodieke betalingen (huur, rente, loon, alimentatie)",
    labelEn: "periodic payments (rent, interest, wages, maintenance)",
  },
  {
    key: "consumentenkoop",
    article: "art. 7:28 BW",
    years: 2,
    labelNl: "consumentenkoop",
    labelEn: "consumer sale",
  },
  {
    key: "schadevergoeding",
    article: "art. 3:310 BW",
    years: 5,
    labelNl: "vordering tot schadevergoeding",
    labelEn: "claim for damages",
  },
  {
    key: "rechterlijke_uitspraak",
    article: "art. 3:324 BW",
    years: 20,
    labelNl: "bevoegdheid tot tenuitvoerlegging van een rechterlijke uitspraak",
    labelEn: "power to enforce a court judgment",
  },
];

export function verjaringRule(key: string): VerjaringRule | null {
  return VERJARING_RULES.find((r) => r.key === key) ?? null;
}

export type VerjaringInput = {
  /** Which rule applies. Undefined = we cannot classify it → abstain. */
  ruleKey?: string;
  /**
   * When the limitation period began — evidenced, not guessed. For most
   * claims this is the day after the claim became due.
   */
  accrualDate?: string;
  /**
   * The most recent interruption Frank KNOWS ABOUT. Its absence does not
   * mean none happened, which is exactly why the finding stays "possible".
   */
  lastKnownStuiting?: string;
  /** Evaluation date (office timezone, supplied by the caller). */
  today: string;
};

export type VerjaringFinding =
  | { finding: "none"; abstained: true; missing: readonly string[] }
  | {
      finding: "verjaring_possible";
      /** The ONLY phrasing this module emits. */
      labelNl: "mogelijke verjaring — juridische toetsing vereist";
      labelEn: "possible limitation — legal review required";
      article: string;
      years: number;
      /** The date the clock ran from, after any interruption we know of. */
      clockFrom: string;
      periodElapsedOn: string;
      datasetVersion: string;
      /** Rendered next to every finding; not optional. */
      caveatNl: string;
      caveatEn: string;
    };

const CAVEAT_NL =
  "Een stuiting, erkenning of procedure die niet in Frank is vastgelegd, " +
  "verlengt deze termijn. Het ontbreken van zo'n vastlegging bewijst niet " +
  "dat die er niet is.";
const CAVEAT_EN =
  "An interruption, acknowledgement or proceeding not recorded in Frank " +
  "extends this period. The absence of such a record is not proof that none " +
  "exists.";

function addYears(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  // Date-only arithmetic in UTC; no local-timezone drift.
  const dt = new Date(Date.UTC(y + years, m - 1, d));
  return dt.toISOString().slice(0, 10);
}

export function checkVerjaring(input: VerjaringInput): VerjaringFinding {
  const missing: string[] = [];
  const rule = input.ruleKey ? verjaringRule(input.ruleKey) : null;
  if (!rule) missing.push("debtType");
  if (!input.accrualDate) missing.push("accrualDate");
  if (missing.length > 0 || !rule || !input.accrualDate) {
    return { finding: "none", abstained: true, missing };
  }

  // An interruption we know of restarts the clock from that date.
  const clockFrom =
    input.lastKnownStuiting && input.lastKnownStuiting > input.accrualDate
      ? input.lastKnownStuiting
      : input.accrualDate;

  const periodElapsedOn = addYears(clockFrom, rule.years);
  if (input.today < periodElapsedOn) {
    return { finding: "none", abstained: true, missing: [] };
  }

  return {
    finding: "verjaring_possible",
    labelNl: "mogelijke verjaring — juridische toetsing vereist",
    labelEn: "possible limitation — legal review required",
    article: rule.article,
    years: rule.years,
    clockFrom,
    periodElapsedOn,
    datasetVersion: VERJARING_DATASET_VERSION,
    caveatNl: CAVEAT_NL,
    caveatEn: CAVEAT_EN,
  };
}
