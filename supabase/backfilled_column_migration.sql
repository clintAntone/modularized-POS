-- Migration: rename sort_date → backfilled (boolean), drop is_validated and vault_balance_snapshot
--
-- Run this in Supabase SQL editor (or via psql).
-- Safe to run multiple times — uses IF EXISTS guards.

-- Step 1: Rename sort_date → backfilled and convert to boolean.
-- Old sentinel value: 'BACKFILL RECORDS - Re:INCOMPLETE REPORT' → true
-- All other values (dates, NULL) → false
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales_reports' AND column_name = 'sort_date'
  ) THEN
    ALTER TABLE sales_reports RENAME COLUMN sort_date TO backfilled;
    ALTER TABLE sales_reports
      ALTER COLUMN backfilled TYPE boolean
      USING (backfilled = 'BACKFILL RECORDS - Re:INCOMPLETE REPORT');
    ALTER TABLE sales_reports ALTER COLUMN backfilled SET DEFAULT false;
  END IF;
END $$;

-- Step 2: Back-fill existing _BACKFILL_ records that were created before this column
-- existed (they have backfilled = false but their ID contains '_BACKFILL_').
UPDATE sales_reports
SET backfilled = true
WHERE id LIKE '%_BACKFILL_%' AND (backfilled IS NULL OR backfilled = false);

-- Step 3: Drop unused columns.
ALTER TABLE sales_reports DROP COLUMN IF EXISTS is_validated;
ALTER TABLE sales_reports DROP COLUMN IF EXISTS vault_balance_snapshot;
