-- Add shift column to attendance for dual-shift branch support.
-- Values: 1 = Shift 1 (morning), 2 = Shift 2 (afternoon).
-- NULL = single-shift branch or legacy record (falls back to midpoint auto-detection).

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS shift SMALLINT CHECK (shift IN (1, 2));

-- Add dual-shift columns to branches table.
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS shift2_opening_time TEXT;

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS shift2_closing_time TEXT;
