/**
 * When is a scheduling failure repaired? — pure, no I/O.
 *
 * Extracted so the rule can be regression-tested (Temujin PR-11 r5). The SQL
 * in `lib/activation-alerts.ts` mirrors this exactly; the two must agree, and
 * a pure function is the only version that can be tested cheaply.
 *
 * TWO WAYS THE OBVIOUS RULE IS WRONG
 * ----------------------------------
 *  1. CROSS-DOSSIER. A reconciliation pass that succeeded for dossier A says
 *     nothing about dossier B. An office-wide "the pass ran" marker would
 *     silently clear an unresolved failure on a different client.
 *  2. CONCURRENT. A pass evaluates dossier A, then A's scheduling fails a
 *     moment later while the pass is still running. The reconciliation row
 *     is WRITTEN after that failure, so comparing write times would clear a
 *     failure the pass never saw.
 *
 * So the comparison is against when the dossier was actually EVALUATED, not
 * when the row happened to be written. `evaluatedAt <= created_at` always,
 * which makes the rule strictly conservative: it errs towards leaving an
 * alert up, which is the right direction for a warning that deadlines are
 * not being tracked.
 */

export type SchedulingFailure = {
  readonly dossierId: string;
  /** When the failure was recorded. */
  readonly failedAt: string;
};

export type Reconciliation = {
  readonly dossierId: string;
  /** When this dossier was evaluated — NOT when the row was written. */
  readonly evaluatedAt: string;
};

export function isFailureOutstanding(
  failure: SchedulingFailure,
  reconciliations: readonly Reconciliation[]
): boolean {
  return !reconciliations.some(
    (r) =>
      r.dossierId === failure.dossierId &&
      Date.parse(r.evaluatedAt) > Date.parse(failure.failedAt)
  );
}

export function outstandingFailures(
  failures: readonly SchedulingFailure[],
  reconciliations: readonly Reconciliation[]
): SchedulingFailure[] {
  return failures.filter((f) => isFailureOutstanding(f, reconciliations));
}
