-- ============================================================
-- BRANCH BILLS TABLE
-- Defines recurring or as-needed bills per branch
-- (e.g. RENT, ELECTRICITY, WATER, WIFI)
-- Managed by branch managers or superadmin.
-- ============================================================

DROP TABLE IF EXISTS branch_bills CASCADE;

CREATE TABLE branch_bills (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  branch_id   TEXT        NOT NULL,
  name        TEXT        NOT NULL,                        -- e.g. 'RENT', 'ELECTRICITY'
  category    TEXT        NOT NULL DEFAULT 'MONTHLY',      -- 'MONTHLY' | 'AS_NEEDED'
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,            -- expected/standard amount (0 if variable)
  due_day       INT,                                       -- day of month (1-31); NULL for AS_NEEDED
  due_next_month BOOLEAN  NOT NULL DEFAULT false,          -- if true, due_day is in the month AFTER the period (e.g. April bill due May 1)
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_branch_bills_branch_id ON branch_bills (branch_id);
CREATE INDEX idx_branch_bills_active    ON branch_bills (branch_id, is_active);
