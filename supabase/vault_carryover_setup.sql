-- ============================================================
-- VAULT CARRYOVER
-- Records opening / carry-over cash balances for branches
-- that were operating before the POS system was set up.
-- The sum of all records for a branch is added to the vault balance.
-- ============================================================

CREATE TABLE IF NOT EXISTS vault_carryover (
  id             TEXT        DEFAULT gen_random_uuid()::TEXT PRIMARY KEY,
  branch_id      TEXT        NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  amount         NUMERIC(10,2) NOT NULL,
  effective_date DATE        NOT NULL,
  notes          TEXT,
  recorded_by    TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vault_carryover_branch ON vault_carryover (branch_id);
CREATE INDEX IF NOT EXISTS idx_vault_carryover_date   ON vault_carryover (branch_id, effective_date DESC);
