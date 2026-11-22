-- ============================================================
-- REMITTANCE SUBMISSIONS — snapshot columns
-- Makes each approved submission row self-contained so Analytics
-- and reporting can read a single table instead of joining
-- sales_reports + remittance_adjustments + remittance_notes.
--
-- gross_sales   sum of grossSales across all reports in the period
-- salary        sum of totalStaffPay
-- expenses      sum of totalExpenses
-- adjusted_roi  net_roi + adjustments excluding VAULT DEPOSIT and
--               owner-transfer pairs (descriptions containing → or ←)
-- notes         period note text from remittance_notes
-- adjustments   JSONB array of {description, amount, target_owner}
--               for all adjustments in the period (full snapshot)
--
-- All numeric columns default to 0; notes/adjustments default to
-- NULL/'[]'. Rows created before this migration are backfilled via
-- the per-branch "Backfill" button in WeeklyRemittancesHub.
-- ============================================================

ALTER TABLE public.remittance_submissions
  ADD COLUMN IF NOT EXISTS gross_sales   NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salary        NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expenses      NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjusted_roi  NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes         TEXT,
  ADD COLUMN IF NOT EXISTS adjustments   JSONB NOT NULL DEFAULT '[]'::jsonb;
