-- ============================================================
-- REMITTANCE ADJUSTMENTS TABLE
-- One-time credits or deductions applied to a branch's weekly
-- remittance period before distributing to owners.
-- e.g. loan repayments, bonus payouts, one-time fees.
-- ============================================================

CREATE TABLE IF NOT EXISTS remittance_adjustments (
  id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  branch_id    TEXT        NOT NULL,
  period_label TEXT        NOT NULL,    -- week label, e.g. "Apr 7 - Apr 13, 2026"
  description  TEXT        NOT NULL,    -- e.g. "LOAN REPAYMENT", "BONUS"
  amount       NUMERIC(12,2) NOT NULL,  -- positive = credit, negative = deduction
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_remittance_adj_branch   ON remittance_adjustments (branch_id);
CREATE INDEX IF NOT EXISTS idx_remittance_adj_period   ON remittance_adjustments (period_label);
CREATE INDEX IF NOT EXISTS idx_remittance_adj_branch_period ON remittance_adjustments (branch_id, period_label);

-- ============================================================
-- MIGRATION: Add owners column to branches (run if not exists)
-- ============================================================
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS owners JSONB NOT NULL DEFAULT '[]';
