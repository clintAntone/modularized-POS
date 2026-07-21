-- Employee Leave Management
-- Run this in Supabase SQL editor

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS on_leave        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS leave_type      TEXT,
  ADD COLUMN IF NOT EXISTS leave_start_date TEXT,
  ADD COLUMN IF NOT EXISTS leave_end_date  TEXT;

-- Index for quick "who is on leave" queries
CREATE INDEX IF NOT EXISTS idx_employees_on_leave ON employees (on_leave) WHERE on_leave = TRUE;
