/**
 * R&V reconciliation (Temujin code review finding 6): the category totals
 * shown in the review pack must reconcile exactly to the balance movement of
 * the non-leefgeld accounts. Categorized income − categorized expenses +
 * uncategorized net must equal (closing − opening) summed over those
 * accounts; any non-zero delta means the pack's figures are inconsistent
 * (miscategorization, missing import, or an internal-transfer artifact) and
 * the pack must say so instead of looking plausible.
 */
export type RvReconciliation = {
  balanceMovementCents: number; // closing - opening over included accounts
  categorizedNetCents: number; // income - expenses (as displayed)
  uncategorizedNetCents: number; // net of transactions without a category
  deltaCents: number; // movement - (categorizedNet + uncategorizedNet)
  reconciles: boolean;
};

export function reconcileRv(input: {
  accountMovements: { openingCents: number; closingCents: number }[];
  totalIncomeCents: number; // positive
  totalExpenseCents: number; // positive
  uncategorizedNetCents: number; // signed
}): RvReconciliation {
  const balanceMovementCents = input.accountMovements.reduce(
    (s, a) => s + (a.closingCents - a.openingCents),
    0
  );
  const categorizedNetCents = input.totalIncomeCents - input.totalExpenseCents;
  const deltaCents =
    balanceMovementCents - (categorizedNetCents + input.uncategorizedNetCents);
  return {
    balanceMovementCents,
    categorizedNetCents,
    uncategorizedNetCents: input.uncategorizedNetCents,
    deltaCents,
    reconciles: deltaCents === 0,
  };
}
