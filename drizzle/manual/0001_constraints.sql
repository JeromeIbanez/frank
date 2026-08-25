-- Manual constraints not expressible in the Drizzle schema.
-- Applied by scripts/db-extras.ts (npm run db:extras). Keep idempotent.

-- At most ONE open (draft/approved) payment batch may exist at a time —
-- DB-level backstop for the createPaymentProposals idempotency guard
-- (Temujin code review finding 2).
CREATE UNIQUE INDEX IF NOT EXISTS one_open_payment_batch
  ON payment_batches ((true))
  WHERE status IN ('draft', 'approved');

-- Append-only audit log (Temujin code review finding 4).
-- NOTE: full enforcement requires a dedicated application role that is NOT
-- the table owner (P1, together with auth). The Neon integration currently
-- provisions a single owner role, and Postgres owners bypass grants. The
-- REVOKE below documents the intent and takes effect the moment the app
-- connects with a non-owner role:
--   REVOKE UPDATE, DELETE ON audit_events FROM frank_app;
