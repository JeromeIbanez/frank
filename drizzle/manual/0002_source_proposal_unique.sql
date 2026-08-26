-- Idempotent-materialization keys (Temujin PR-6 r2 #1): at most ONE real
-- row may ever be created from a given AI proposal, enforced by the DB.
CREATE UNIQUE INDEX IF NOT EXISTS budget_lines_source_proposal_unique ON budget_lines (source_proposal_id) WHERE source_proposal_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS debts_source_proposal_unique ON debts (source_proposal_id) WHERE source_proposal_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_source_proposal_unique ON contacts (source_proposal_id) WHERE source_proposal_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_source_proposal_unique ON accounts (source_proposal_id) WHERE source_proposal_id IS NOT NULL
