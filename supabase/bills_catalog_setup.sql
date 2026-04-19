-- ============================================================
-- BILLS CATALOG
-- Global bill templates defined by superadmin.
-- Branches get assigned bills from this catalog.
-- ============================================================

CREATE TABLE IF NOT EXISTS bills_catalog (
  id            TEXT        DEFAULT gen_random_uuid()::TEXT PRIMARY KEY,
  name          TEXT        NOT NULL,
  category      TEXT        NOT NULL CHECK (category IN ('MONTHLY', 'AS_NEEDED')),
  due_day       INTEGER     CHECK (due_day >= 1 AND due_day <= 31),
  suggested_amount NUMERIC(10,2) DEFAULT 0,
  notes         TEXT,
  is_active     BOOLEAN     DEFAULT true NOT NULL,
  created_by    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bills_catalog_active ON bills_catalog (is_active);

-- Add catalog_id FK to branch_bills so we can trace which template a bill came from.
-- Nullable — bills added directly by branch manager won't have a catalog origin.
ALTER TABLE branch_bills
  ADD COLUMN IF NOT EXISTS catalog_id TEXT REFERENCES bills_catalog(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_branch_bills_catalog ON branch_bills (catalog_id);
