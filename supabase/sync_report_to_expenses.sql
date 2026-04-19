-- ============================================================
-- CLEANUP: Drop previous version if it exists
-- ============================================================

DROP TRIGGER IF EXISTS trg_sync_report_to_expenses ON sales_reports;
DROP FUNCTION IF EXISTS sync_report_data_to_expenses();


-- ============================================================
-- FUNCTION: sync_report_data_to_expenses
-- Fires on INSERT or UPDATE of expense_data / vault_data
-- in sales_reports. Upserts each entry into the expenses
-- table so the live expenses table stays in sync.
--
-- Uses ON CONFLICT DO UPDATE so manually added entries
-- from the Supabase UI get inserted without duplicating
-- entries that already exist.
-- ============================================================

CREATE OR REPLACE FUNCTION sync_report_data_to_expenses()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  e        JSONB;
  entry_id TEXT;
  idx      INT;
BEGIN

  -- ── EXPENSE DATA (OPERATIONAL) ──────────────────────────
  IF NEW.expense_data IS NOT NULL AND jsonb_array_length(NEW.expense_data) > 0 THEN
    idx := 0;
    FOR e IN SELECT value FROM jsonb_array_elements(NEW.expense_data)
    LOOP
      entry_id := COALESCE(NULLIF(e->>'id', ''), NEW.id || '_exp_' || idx);

      INSERT INTO expenses (
        id,
        branch_id,
        timestamp,
        name,
        amount,
        category,
        receipt_image
      ) VALUES (
        entry_id,
        NEW.branch_id,
        CASE
          WHEN e->>'timestamp' IS NOT NULL AND e->>'timestamp' <> ''
          THEN (e->>'timestamp')::TIMESTAMPTZ
          ELSE (NEW.report_date::TIMESTAMPTZ)
        END,
        COALESCE(NULLIF(e->>'name', ''), 'EXPENSE'),
        COALESCE((e->>'amount')::NUMERIC, 0),
        COALESCE(NULLIF(e->>'category', ''), 'OPERATIONAL'),
        NULLIF(e->>'receiptImage', '')
      )
      ON CONFLICT (id) DO UPDATE SET
        branch_id     = EXCLUDED.branch_id,
        name          = EXCLUDED.name,
        amount        = EXCLUDED.amount,
        category      = EXCLUDED.category,
        receipt_image = EXCLUDED.receipt_image;
      -- NOTE: timestamp is intentionally not updated on conflict
      -- to preserve the original log time.

      idx := idx + 1;
    END LOOP;
  END IF;

  -- ── VAULT DATA (PROVISION / SETTLEMENT) ─────────────────
  IF NEW.vault_data IS NOT NULL AND jsonb_array_length(NEW.vault_data) > 0 THEN
    idx := 0;
    FOR e IN SELECT value FROM jsonb_array_elements(NEW.vault_data)
    LOOP
      entry_id := COALESCE(NULLIF(e->>'id', ''), NEW.id || '_vlt_' || idx);

      INSERT INTO expenses (
        id,
        branch_id,
        timestamp,
        name,
        amount,
        category,
        receipt_image
      ) VALUES (
        entry_id,
        NEW.branch_id,
        CASE
          WHEN e->>'timestamp' IS NOT NULL AND e->>'timestamp' <> ''
          THEN (e->>'timestamp')::TIMESTAMPTZ
          ELSE (NEW.report_date::TIMESTAMPTZ)
        END,
        COALESCE(NULLIF(e->>'name', ''), 'VAULT PROVISION'),
        COALESCE((e->>'amount')::NUMERIC, 0),
        COALESCE(NULLIF(e->>'category', ''), 'PROVISION'),
        NULL
      )
      ON CONFLICT (id) DO UPDATE SET
        branch_id = EXCLUDED.branch_id,
        name      = EXCLUDED.name,
        amount    = EXCLUDED.amount,
        category  = EXCLUDED.category;

      idx := idx + 1;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;


-- ============================================================
-- TRIGGER
-- Only fires when expense_data or vault_data actually changes.
-- ============================================================

CREATE TRIGGER trg_sync_report_to_expenses
AFTER INSERT OR UPDATE OF expense_data, vault_data
ON sales_reports
FOR EACH ROW
EXECUTE FUNCTION sync_report_data_to_expenses();


-- ============================================================
-- BACKFILL: Fix existing missing entries in the expenses table
-- Syncs all expense_data and vault_data from historical
-- sales_reports into the expenses table.
-- Safe to run multiple times (ON CONFLICT DO UPDATE).
-- ============================================================

DO $$
DECLARE
  r        RECORD;
  e        JSONB;
  entry_id TEXT;
  idx      INT;
BEGIN
  FOR r IN
    SELECT id, branch_id, report_date, expense_data, vault_data
    FROM   sales_reports
  LOOP

    -- Sync expense_data
    IF r.expense_data IS NOT NULL AND jsonb_array_length(r.expense_data) > 0 THEN
      idx := 0;
      FOR e IN SELECT value FROM jsonb_array_elements(r.expense_data)
      LOOP
        entry_id := COALESCE(NULLIF(e->>'id', ''), r.id || '_exp_' || idx);

        INSERT INTO expenses (
          id, branch_id, timestamp, name, amount, category, receipt_image
        ) VALUES (
          entry_id,
          r.branch_id,
          CASE
            WHEN e->>'timestamp' IS NOT NULL AND e->>'timestamp' <> ''
            THEN (e->>'timestamp')::TIMESTAMPTZ
            ELSE r.report_date::TIMESTAMPTZ
          END,
          COALESCE(NULLIF(e->>'name', ''), 'EXPENSE'),
          COALESCE((e->>'amount')::NUMERIC, 0),
          COALESCE(NULLIF(e->>'category', ''), 'OPERATIONAL'),
          NULLIF(e->>'receiptImage', '')
        )
        ON CONFLICT (id) DO UPDATE SET
          branch_id     = EXCLUDED.branch_id,
          name          = EXCLUDED.name,
          amount        = EXCLUDED.amount,
          category      = EXCLUDED.category,
          receipt_image = EXCLUDED.receipt_image;

        idx := idx + 1;
      END LOOP;
    END IF;

    -- Sync vault_data
    IF r.vault_data IS NOT NULL AND jsonb_array_length(r.vault_data) > 0 THEN
      idx := 0;
      FOR e IN SELECT value FROM jsonb_array_elements(r.vault_data)
      LOOP
        entry_id := COALESCE(NULLIF(e->>'id', ''), r.id || '_vlt_' || idx);

        INSERT INTO expenses (
          id, branch_id, timestamp, name, amount, category, receipt_image
        ) VALUES (
          entry_id,
          r.branch_id,
          CASE
            WHEN e->>'timestamp' IS NOT NULL AND e->>'timestamp' <> ''
            THEN (e->>'timestamp')::TIMESTAMPTZ
            ELSE r.report_date::TIMESTAMPTZ
          END,
          COALESCE(NULLIF(e->>'name', ''), 'VAULT PROVISION'),
          COALESCE((e->>'amount')::NUMERIC, 0),
          COALESCE(NULLIF(e->>'category', ''), 'PROVISION'),
          NULL
        )
        ON CONFLICT (id) DO UPDATE SET
          branch_id = EXCLUDED.branch_id,
          name      = EXCLUDED.name,
          amount    = EXCLUDED.amount,
          category  = EXCLUDED.category;

        idx := idx + 1;
      END LOOP;
    END IF;

  END LOOP;

  RAISE NOTICE 'Backfill complete: expenses table synced from sales_reports.';
END;
$$;
