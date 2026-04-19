-- ============================================================
-- CLEANUP: Drop previous version if it exists
-- ============================================================

DROP TRIGGER IF EXISTS trg_sync_expense_data_to_expense_bills ON sales_reports;
DROP FUNCTION IF EXISTS sync_expense_data_to_expense_bills();
DROP TABLE IF EXISTS expense_bills;


-- ============================================================
-- EXPENSE BILLS TABLE
-- One row per expense_data entry extracted from sales_reports.
-- Contains OPERATIONAL expenses per branch per report.
-- Auto-populated by trigger; do not insert manually.
-- ============================================================

CREATE TABLE expense_bills (
  id                TEXT          PRIMARY KEY,   -- expense entry's own id
  branch_id         TEXT          NOT NULL,
  sales_report_id   TEXT          NOT NULL,
  report_date       DATE          NOT NULL,
  name              TEXT          NOT NULL DEFAULT 'EXPENSE',
  amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
  category          TEXT,                        -- 'OPERATIONAL' etc.
  receipt_image     TEXT,
  expense_timestamp TIMESTAMPTZ,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_expense_bills_branch_id    ON expense_bills (branch_id);
CREATE INDEX idx_expense_bills_report_date  ON expense_bills (report_date);
CREATE INDEX idx_expense_bills_branch_date  ON expense_bills (branch_id, report_date);
CREATE INDEX idx_expense_bills_sales_report ON expense_bills (sales_report_id);
CREATE INDEX idx_expense_bills_category     ON expense_bills (category);


-- ============================================================
-- FUNCTION: sync_expense_data_to_expense_bills
-- Fires on every INSERT or UPDATE of expense_data in
-- sales_reports. Replaces all rows for that report
-- then re-inserts one row per expense entry.
-- ============================================================

CREATE OR REPLACE FUNCTION sync_expense_data_to_expense_bills()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  e        JSONB;
  entry_id TEXT;
  idx      INT := 0;
BEGIN
  -- Remove stale rows for this report (handles updates cleanly)
  DELETE FROM expense_bills WHERE sales_report_id = NEW.id;

  -- Nothing to do if expense_data is null or empty
  IF NEW.expense_data IS NULL OR jsonb_array_length(NEW.expense_data) = 0 THEN
    RETURN NEW;
  END IF;

  FOR e IN SELECT value FROM jsonb_array_elements(NEW.expense_data)
  LOOP
    -- Use the entry's own id; fall back to reportId_index if missing
    entry_id := COALESCE(NULLIF(e->>'id', ''), NEW.id || '_exp_' || idx);

    INSERT INTO expense_bills (
      id,
      branch_id,
      sales_report_id,
      report_date,
      name,
      amount,
      category,
      receipt_image,
      expense_timestamp
    ) VALUES (
      entry_id,
      NEW.branch_id,
      NEW.id,
      NEW.report_date::DATE,
      COALESCE(NULLIF(e->>'name', ''), 'EXPENSE'),
      COALESCE((e->>'amount')::NUMERIC, 0),
      NULLIF(e->>'category', ''),
      NULLIF(e->>'receiptImage', ''),
      CASE
        WHEN e->>'timestamp' IS NOT NULL AND e->>'timestamp' <> ''
        THEN (e->>'timestamp')::TIMESTAMPTZ
        ELSE NULL
      END
    )
    ON CONFLICT (id) DO UPDATE SET
      branch_id         = EXCLUDED.branch_id,
      sales_report_id   = EXCLUDED.sales_report_id,
      report_date       = EXCLUDED.report_date,
      name              = EXCLUDED.name,
      amount            = EXCLUDED.amount,
      category          = EXCLUDED.category,
      receipt_image     = EXCLUDED.receipt_image,
      expense_timestamp = EXCLUDED.expense_timestamp;

    idx := idx + 1;
  END LOOP;

  RETURN NEW;
END;
$$;


-- ============================================================
-- TRIGGER
-- ============================================================

CREATE TRIGGER trg_sync_expense_data_to_expense_bills
AFTER INSERT OR UPDATE OF expense_data
ON sales_reports
FOR EACH ROW
EXECUTE FUNCTION sync_expense_data_to_expense_bills();


-- ============================================================
-- BACKFILL: Sync all existing expense_data into expense_bills
-- ============================================================

DO $$
DECLARE
  r        RECORD;
  e        JSONB;
  entry_id TEXT;
  idx      INT;
BEGIN
  FOR r IN
    SELECT id, branch_id, report_date, expense_data
    FROM   sales_reports
    WHERE  expense_data IS NOT NULL
      AND  jsonb_array_length(expense_data) > 0
  LOOP
    DELETE FROM expense_bills WHERE sales_report_id = r.id;

    idx := 0;
    FOR e IN SELECT value FROM jsonb_array_elements(r.expense_data)
    LOOP
      entry_id := COALESCE(NULLIF(e->>'id', ''), r.id || '_exp_' || idx);

      INSERT INTO expense_bills (
        id, branch_id, sales_report_id, report_date,
        name, amount, category, receipt_image, expense_timestamp
      ) VALUES (
        entry_id,
        r.branch_id,
        r.id,
        r.report_date::DATE,
        COALESCE(NULLIF(e->>'name', ''), 'EXPENSE'),
        COALESCE((e->>'amount')::NUMERIC, 0),
        NULLIF(e->>'category', ''),
        NULLIF(e->>'receiptImage', ''),
        CASE
          WHEN e->>'timestamp' IS NOT NULL AND e->>'timestamp' <> ''
          THEN (e->>'timestamp')::TIMESTAMPTZ
          ELSE NULL
        END
      )
      ON CONFLICT (id) DO UPDATE SET
        branch_id         = EXCLUDED.branch_id,
        sales_report_id   = EXCLUDED.sales_report_id,
        report_date       = EXCLUDED.report_date,
        name              = EXCLUDED.name,
        amount            = EXCLUDED.amount,
        category          = EXCLUDED.category,
        receipt_image     = EXCLUDED.receipt_image,
        expense_timestamp = EXCLUDED.expense_timestamp;

      idx := idx + 1;
    END LOOP;
  END LOOP;
END;
$$;
