/**
 * Canonical transaction category taxonomy + deterministic rule-based
 * categorization. AI-assisted categorization (schema-validated, PRD §6 M3)
 * layers on top; these rules are the fast, explainable first pass. A miss
 * returns null and routes to a human / the AI-assist path.
 */

export type CategoryKind = "income" | "expense";

export type Category = {
  key: string;
  nl: string;
  en: string;
  kind: CategoryKind;
};

export const CATEGORIES: readonly Category[] = [
  // Income
  { key: "salaris", nl: "Salaris", en: "Salary", kind: "income" },
  { key: "uitkering", nl: "Uitkering", en: "Benefits", kind: "income" },
  { key: "huurtoeslag", nl: "Huurtoeslag", en: "Rent allowance", kind: "income" },
  { key: "zorgtoeslag", nl: "Zorgtoeslag", en: "Healthcare allowance", kind: "income" },
  { key: "kindgebonden_budget", nl: "Kindgebonden budget", en: "Child budget", kind: "income" },
  { key: "overige_inkomsten", nl: "Overige inkomsten", en: "Other income", kind: "income" },
  // Expenses
  { key: "huur", nl: "Huur", en: "Rent", kind: "expense" },
  { key: "energie", nl: "Energie", en: "Energy", kind: "expense" },
  { key: "water", nl: "Water", en: "Water", kind: "expense" },
  { key: "zorgverzekering", nl: "Zorgverzekering", en: "Health insurance", kind: "expense" },
  { key: "telecom", nl: "Telecom", en: "Telecom", kind: "expense" },
  { key: "boodschappen", nl: "Boodschappen", en: "Groceries", kind: "expense" },
  { key: "leefgeld", nl: "Leefgeld", en: "Living allowance", kind: "expense" },
  { key: "verzekeringen", nl: "Verzekeringen", en: "Insurance", kind: "expense" },
  { key: "gemeentebelasting", nl: "Gemeentebelasting", en: "Municipal taxes", kind: "expense" },
  { key: "aflossing_schuld", nl: "Aflossing schuld", en: "Debt repayment", kind: "expense" },
  {
    key: "bewindvoerderskosten",
    nl: "Bewindvoerderskosten",
    en: "Administrator fees",
    kind: "expense",
  },
  { key: "abonnementen", nl: "Abonnementen", en: "Subscriptions", kind: "expense" },
  { key: "overige_uitgaven", nl: "Overige uitgaven", en: "Other expenses", kind: "expense" },
] as const;

type Rule = {
  categoryKey: string;
  pattern: RegExp;
  confidence: number;
  /** Optional sign constraint: "credit" = amount > 0, "debit" = amount < 0. */
  sign?: "credit" | "debit";
};

/**
 * Rules are evaluated in order over "counterpartyName description"; the
 * first match wins, so the more specific rules (toeslagen, leefgeld) come
 * before the broader ones (gemeente, huur).
 */
const RULES: readonly Rule[] = [
  // Allowances (before generic Belastingdienst / huur / zorg rules).
  { categoryKey: "huurtoeslag", pattern: /belastingdienst.*huurtoesl|huurtoesl/i, confidence: 0.95, sign: "credit" },
  { categoryKey: "zorgtoeslag", pattern: /belastingdienst.*zorgtoesl|zorgtoesl/i, confidence: 0.95, sign: "credit" },
  { categoryKey: "kindgebonden_budget", pattern: /kindgebonden/i, confidence: 0.95, sign: "credit" },
  // Benefits.
  {
    categoryKey: "uitkering",
    pattern: /sociale verzekeringsbank|\bsvb\b|\buwv\b|participatie|bijstand|\bwia\b|\bwajong\b/i,
    confidence: 0.9,
    sign: "credit",
  },
  { categoryKey: "salaris", pattern: /salaris|loonbetaling|\bloon\b|payroll/i, confidence: 0.85, sign: "credit" },
  // Living allowance transfers.
  { categoryKey: "leefgeld", pattern: /leefgeld/i, confidence: 0.95 },
  // Health insurers.
  {
    categoryKey: "zorgverzekering",
    pattern: /zilveren kruis|\bcz\b|\bvgz\b|menzis|\bdsw\b|\bonvz\b|zorgverzek/i,
    confidence: 0.95,
    sign: "debit",
  },
  // Energy suppliers.
  {
    categoryKey: "energie",
    pattern: /vattenfall|eneco|essent|greenchoice|budget energie|energiedirect|\bnuon\b/i,
    confidence: 0.95,
    sign: "debit",
  },
  // Water companies.
  {
    categoryKey: "water",
    pattern: /vitens|dunea|evides|waternet|brabant water|\bwml\b|waterbedrijf/i,
    confidence: 0.95,
    sign: "debit",
  },
  // Telecom.
  {
    categoryKey: "telecom",
    pattern: /\bkpn\b|ziggo|odido|vodafone|t-mobile|lebara|simyo|internet en tv/i,
    confidence: 0.9,
    sign: "debit",
  },
  // Groceries.
  {
    categoryKey: "boodschappen",
    pattern: /albert heijn|\bah\b|jumbo|\blidl\b|\baldi\b|picnic|dirk vd broek|dirk van den broek|\bplus\b/i,
    confidence: 0.9,
    sign: "debit",
  },
  // Municipal taxes (after toeslag rules so "gemeente ... toeslag" never lands here).
  { categoryKey: "gemeentebelasting", pattern: /gemeente|belastingsamenwerking|\bbsgr\b|waterschapsbelasting/i, confidence: 0.8, sign: "debit" },
  // Debt repayment.
  {
    categoryKey: "aflossing_schuld",
    pattern: /aflossing|afbetaling|schuldregeling|betalingsregeling|incasso.*regeling|\bcjib\b/i,
    confidence: 0.85,
    sign: "debit",
  },
  // Administrator fees.
  { categoryKey: "bewindvoerderskosten", pattern: /bewindvoer|beloning bewind/i, confidence: 0.9, sign: "debit" },
  // Subscriptions.
  { categoryKey: "abonnementen", pattern: /netflix|spotify|videoland|disney\+|abonnement/i, confidence: 0.85, sign: "debit" },
  // Other insurance (after zorgverzekering).
  {
    categoryKey: "verzekeringen",
    pattern: /nationale.?nederlanden|\basr\b|univ[eé]|interpolis|centraal beheer|aansprakelijkheidsverzekering|inboedelverzekering|verzekering/i,
    confidence: 0.75,
    sign: "debit",
  },
  // Rent (broad; keep after huurtoeslag).
  {
    categoryKey: "huur",
    pattern: /woonstichting|woningstichting|woningcorporatie|woonbedrijf|vestia|ymere|portaal|\bhuur\b/i,
    confidence: 0.85,
    sign: "debit",
  },
];

/**
 * Deterministic keyword categorization. Returns null when no rule matches —
 * the caller then falls through to AI-assist / manual categorization.
 */
export function ruleCategorize(
  counterpartyName: string | null,
  description: string | null,
  amountCents: number,
): { categoryKey: string; confidence: number } | null {
  const haystack = [counterpartyName ?? "", description ?? ""].join(" ").trim();
  if (haystack.length === 0) return null;

  for (const rule of RULES) {
    if (rule.sign === "credit" && amountCents <= 0) continue;
    if (rule.sign === "debit" && amountCents >= 0) continue;
    if (rule.pattern.test(haystack)) {
      return { categoryKey: rule.categoryKey, confidence: Math.round(rule.confidence * 100) };
    }
  }
  return null;
}
