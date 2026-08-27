/**
 * Debt domain — pure functions (plan os-v1 W4).
 *
 * Invariant (Temujin plan review): debt balances change ONLY via
 * provenance-bearing debt events — a pain.001 export never touches them.
 * deltaCents is signed: payments/waivers negative, added costs positive.
 */

export type DebtEventLike = {
  kind: "payment_reconciled" | "creditor_statement" | "correction";
  deltaCents: number;
  createdAtIso: string; // ISO datetime
};

/**
 * Schuldenverloop over a reporting period (for the R&V):
 * end   = cached current balance rolled BACK over events after periodEnd,
 * begin = end rolled back over events inside the period,
 * paid  = payments reconciled within the period (positive number).
 * Consistency: begin + Σ(other deltas) − paid = end, by construction.
 */
export function schuldenverloop(
  currentAmountCents: number,
  events: DebtEventLike[],
  periodStartIso: string,
  periodEndIso: string
): {
  beginCents: number;
  endCents: number;
  paidCents: number;
  otherDeltaCents: number;
  hasHistory: boolean;
} {
  const startTs = Date.parse(`${periodStartIso}T00:00:00Z`);
  const endTs = Date.parse(`${periodEndIso}T23:59:59Z`);
  let end = currentAmountCents;
  for (const e of events) {
    if (Date.parse(e.createdAtIso) > endTs) end -= e.deltaCents;
  }
  let begin = end;
  let paid = 0;
  let other = 0;
  for (const e of events) {
    const ts = Date.parse(e.createdAtIso);
    if (ts >= startTs && ts <= endTs) {
      begin -= e.deltaCents;
      if (e.kind === "payment_reconciled" && e.deltaCents < 0) {
        paid += -e.deltaCents;
      } else {
        other += e.deltaCents;
      }
    }
  }
  return {
    beginCents: begin,
    endCents: end,
    paidCents: paid,
    otherDeltaCents: other,
    hasHistory: events.length > 0,
  };
}

/**
 * Balance transition for one event — the SQL chokepoint mirrors exactly
 * this (Temujin PR-7 r2 gate A). A debt never goes negative: an
 * overpayment clamps at zero, and the clamped surplus is REPORTED rather
 * than silently folded into the balance, so the audit's before/after pair
 * stays truthful.
 */
export function applyDebtDelta(
  currentCents: number,
  deltaCents: number
): { beforeCents: number; afterCents: number; clampedCents: number } {
  const raw = currentCents + deltaCents;
  return {
    beforeCents: currentCents,
    afterCents: Math.max(0, raw),
    clampedCents: raw < 0 ? -raw : 0,
  };
}

// ---------- Reconciliation matching (conservative, code-only) ----------

export type RegelingLine = {
  budgetLineId: string;
  debtId: string;
  dossierId: string;
  counterpartyIban: string | null;
  amountCents: number; // positive expected payment
};

export type CandidateTx = {
  id: string;
  dossierId: string;
  bookingDate: string;
  amountCents: number; // negative = debit
  counterpartyIban: string | null;
};

export type ReconciledPayment = {
  transactionId: string;
  debtId: string;
  budgetLineId: string;
  deltaCents: number; // negative — reduces the debt
};

/**
 * Match imported debits to betalingsregeling lines: SAME dossier, EXACT
 * counterparty IBAN, EXACT amount. Anything weaker never reduces a debt
 * (a human records a creditor statement instead). One transaction settles
 * at most one line; each line consumes each matching transaction once —
 * uniqueness on sourceTransactionId backs this at the database.
 */
export function matchRegelingPayments(
  lines: RegelingLine[],
  txs: CandidateTx[]
): ReconciledPayment[] {
  const out: ReconciledPayment[] = [];
  const usedTx = new Set<string>();
  for (const line of lines) {
    if (!line.counterpartyIban || line.amountCents <= 0) continue;
    for (const tx of txs) {
      if (usedTx.has(tx.id)) continue;
      if (tx.dossierId !== line.dossierId) continue;
      if (tx.amountCents >= 0) continue; // must be a debit
      if (tx.counterpartyIban !== line.counterpartyIban) continue;
      if (-tx.amountCents !== line.amountCents) continue;
      usedTx.add(tx.id);
      out.push({
        transactionId: tx.id,
        debtId: line.debtId,
        budgetLineId: line.budgetLineId,
        deltaCents: tx.amountCents, // negative
      });
    }
  }
  return out;
}
