-- ============================================================
-- CLEANUP: Drop previous version if it exists
-- ============================================================

DROP TRIGGER IF EXISTS trg_sync_sales_report_to_monthly_bills ON sales_reports;
DROP TRIGGER IF EXISTS trg_sync_vault_to_monthly_bills        ON sales_reports;
DROP FUNCTION IF EXISTS sync_sales_report_to_monthly_bills();
DROP FUNCTION IF EXISTS sync_vault_data_to_monthly_bills();
DROP TABLE  IF EXISTS monthly_bills;


-- ============================================================
-- MONTHLY BILLS TABLE
-- One row per vault_data entry extracted from sales_reports.
-- Auto-populated by trigger; do not insert manually.
-- ============================================================

CREATE TABLE monthly_bills (
  id              TEXT          PRIMARY KEY,   -- vault entry's own id
  branch_id       TEXT          NOT NULL,
  sales_report_id TEXT          NOT NULL,
  report_date     DATE          NOT NULL,
  name            TEXT          NOT NULL DEFAULT 'VAULT PROVISION',
  amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  category        TEXT,                        -- 'PROVISION' | 'SETTLEMENT'
  vault_timestamp TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_monthly_bills_branch_id    ON monthly_bills (branch_id);
CREATE INDEX idx_monthly_bills_report_date  ON monthly_bills (report_date);
CREATE INDEX idx_monthly_bills_branch_date  ON monthly_bills (branch_id, report_date);
CREATE INDEX idx_monthly_bills_sales_report ON monthly_bills (sales_report_id);
CREATE INDEX idx_monthly_bills_category     ON monthly_bills (category);


-- ============================================================
-- FUNCTION: sync_vault_data_to_monthly_bills
-- Fires on every INSERT or UPDATE of vault_data in
-- sales_reports. Replaces all rows for that report
-- then re-inserts one row per vault entry.
-- ============================================================

CREATE OR REPLACE FUNCTION sync_vault_data_to_monthly_bills()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v        JSONB;
  entry_id TEXT;
  idx      INT := 0;
BEGIN
  -- Remove stale rows for this report (handles updates cleanly)
  DELETE FROM monthly_bills WHERE sales_report_id = NEW.id;

  -- Nothing to do if vault_data is null or empty
  IF NEW.vault_data IS NULL OR jsonb_array_length(NEW.vault_data) = 0 THEN
    RETURN NEW;
  END IF;

  FOR v IN SELECT value FROM jsonb_array_elements(NEW.vault_data)
  LOOP
    -- Use the entry's own id; fall back to reportId_index if missing
    entry_id := COALESCE(NULLIF(v->>'id', ''), NEW.id || '_' || idx);

    INSERT INTO monthly_bills (
      id,
      branch_id,
      sales_report_id,
      report_date,
      name,
      amount,
      category,
      vault_timestamp
    ) VALUES (
      entry_id,
      NEW.branch_id,
      NEW.id,
      NEW.report_date::DATE,
      COALESCE(NULLIF(v->>'name', ''), 'VAULT PROVISION'),
      COALESCE((v->>'amount')::NUMERIC, 0),
      NULLIF(v->>'category', ''),
      CASE
        WHEN v->>'timestamp' IS NOT NULL AND v->>'timestamp' <> ''
        THEN (v->>'timestamp')::TIMESTAMPTZ
        ELSE NULL
      END
    )
    ON CONFLICT (id) DO UPDATE SET
      branch_id       = EXCLUDED.branch_id,
      sales_report_id = EXCLUDED.sales_report_id,
      report_date     = EXCLUDED.report_date,
      name            = EXCLUDED.name,
      amount          = EXCLUDED.amount,
      category        = EXCLUDED.category,
      vault_timestamp = EXCLUDED.vault_timestamp;

    idx := idx + 1;
  END LOOP;

  RETURN NEW;
END;
$$;


-- ============================================================
-- TRIGGER
-- ============================================================

CREATE TRIGGER trg_sync_vault_to_monthly_bills
AFTER INSERT OR UPDATE OF vault_data
ON sales_reports
FOR EACH ROW
EXECUTE FUNCTION sync_vault_data_to_monthly_bills();


-- ============================================================
-- BACKFILL: Sync all existing sales_reports into monthly_bills
-- ============================================================

DO $$
DECLARE
  r        RECORD;
  v        JSONB;
  entry_id TEXT;
  idx      INT;
BEGIN
  FOR r IN
    SELECT id, branch_id, report_date, vault_data
    FROM   sales_reports
    WHERE  vault_data IS NOT NULL
      AND  jsonb_array_length(vault_data) > 0
  LOOP
    DELETE FROM monthly_bills WHERE sales_report_id = r.id;

    idx := 0;
    FOR v IN SELECT value FROM jsonb_array_elements(r.vault_data)
    LOOP
      entry_id := COALESCE(NULLIF(v->>'id', ''), r.id || '_' || idx);

      INSERT INTO monthly_bills (
        id, branch_id, sales_report_id, report_date,
        name, amount, category, vault_timestamp
      ) VALUES (
        entry_id,
        r.branch_id,
        r.id,
        r.report_date::DATE,
        COALESCE(NULLIF(v->>'name', ''), 'VAULT PROVISION'),
        COALESCE((v->>'amount')::NUMERIC, 0),
        NULLIF(v->>'category', ''),
        CASE
          WHEN v->>'timestamp' IS NOT NULL AND v->>'timestamp' <> ''
          THEN (v->>'timestamp')::TIMESTAMPTZ
          ELSE NULL
        END
      )
      ON CONFLICT (id) DO UPDATE SET
        branch_id       = EXCLUDED.branch_id,
        sales_report_id = EXCLUDED.sales_report_id,
        report_date     = EXCLUDED.report_date,
        name            = EXCLUDED.name,
        amount          = EXCLUDED.amount,
        category        = EXCLUDED.category,
        vault_timestamp = EXCLUDED.vault_timestamp;

      idx := idx + 1;
    END LOOP;
  END LOOP;
END;
$$;
