/**
 * Machtiging guard — a "requires legal review" FLAG, never a legal
 * conclusion (PRD §6 M3). It flags potential art. 1:441 lid 2 BW / LOVT 2025
 * triggers so a human reviewer records consent, court authorization, or
 * not-applicable with rationale. The guard cannot be overridden silently;
 * override handling (recorded justification) lives at the application layer.
 *
 * Threshold basis: LOVT Aanbevelingen April 2025 (B.D2/B.D3) — purchases and
 * same-purpose yearly aggregation above EUR 2,000. NOT the outdated EUR 1,500
 * that many older kanton court pages still cite.
 */

export type MachtigingCheckInput = {
  amountCents: number;
  categoryKey: string;
  purposeTag: string | null; // same-purpose grouping tag, e.g. "vakantie-2026"
  yearSpentOnPurposeCents: number; // prior spend this calendar year on same purposeTag
  kind: "purchase" | "gift" | "loan" | "settlement" | "housing" | "regular_bill" | "leefgeld";
};

export type MachtigingFlagResult = {
  triggered: boolean;
  reasons: string[]; // i18n keys like "machtiging.reason.over2000"
};

/** EUR 2,000 — LOVT April 2025 (B.D2/B.D3). */
export const MACHTIGING_THRESHOLD_CENTS = 200000;

/** EUR 700 — vaststellingsovereenkomst de-minimis (art. 1:441 lid 2e BW). */
export const SETTLEMENT_THRESHOLD_CENTS = 70000;

export function checkMachtiging(input: MachtigingCheckInput): MachtigingFlagResult {
  const reasons: string[] = [];

  // Kind-based absolute triggers.
  switch (input.kind) {
    case "gift":
      // All schenkingen require review (LOVT B.J1).
      reasons.push("machtiging.reason.gift");
      break;
    case "loan":
      // Borrowing / committing the client (art. 1:441 lid 2c BW).
      reasons.push("machtiging.reason.loan");
      break;
    case "housing":
      // Woning transactions / lease changes (LOVT B.D2).
      reasons.push("machtiging.reason.housing");
      break;
    case "settlement":
      // Vaststellingsovereenkomst above EUR 700 (art. 1:441 lid 2e BW).
      if (input.amountCents > SETTLEMENT_THRESHOLD_CENTS) {
        reasons.push("machtiging.reason.settlement");
      }
      break;
    default:
      break;
  }

  // Amount threshold: regular bills and leefgeld are normal management and
  // never trigger on amount alone; other kinds do at >= EUR 2,000 (B.D2).
  const normalManagement = input.kind === "regular_bill" || input.kind === "leefgeld";
  if (!normalManagement && input.amountCents >= MACHTIGING_THRESHOLD_CENTS) {
    reasons.push("machtiging.reason.over2000");
  }

  // Same-purpose yearly aggregation toward EUR 2,000 (B.D3): multiple
  // expenditures for one purpose (holidays, driving lessons, furnishing)
  // are summed within the calendar year.
  if (
    !normalManagement &&
    input.purposeTag !== null &&
    input.amountCents + input.yearSpentOnPurposeCents >= MACHTIGING_THRESHOLD_CENTS
  ) {
    reasons.push("machtiging.reason.aggregation");
  }

  return { triggered: reasons.length > 0, reasons };
}
