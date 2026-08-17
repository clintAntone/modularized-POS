-- record_vault_covered_expense.sql
-- Atomic vault-covered expense: inserts the OPERATIONAL expense, deducts vault balance,
-- and records the VAULT_WITHDRAWAL expense + vault_transaction — all in one DB transaction.
-- Eliminates the partial-write windows that caused negative net_roi when any step failed.
--
-- Usage from the client:
--   supabase.rpc('record_vault_covered_expense', {
--     p_expense_id, p_vault_tx_id, p_branch_id, p_expense_name,
--     p_expense_amount, p_vault_cover, p_timestamp, p_receipt_url, p_report_id
--   })
--
-- Returns: { new_balance: number, vault_cover_applied: number }
--   vault_cover_applied may be less than p_vault_cover if the live balance was lower.

CREATE OR REPLACE FUNCTION record_vault_covered_expense(
  p_expense_id      TEXT,
  p_vault_tx_id     TEXT,
  p_branch_id       TEXT,
  p_expense_name    TEXT,
  p_expense_amount  NUMERIC,
  p_vault_cover     NUMERIC,
  p_timestamp       TIMESTAMPTZ,
  p_receipt_url     TEXT    DEFAULT NULL,
  p_report_id       TEXT    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_balance  NUMERIC;
  v_safe_cover       NUMERIC;
  v_new_balance      NUMERIC;
BEGIN
  IF p_expense_amount <= 0 THEN
    RAISE EXCEPTION 'Expense amount must be positive';
  END IF;
  IF p_vault_cover <= 0 THEN
    RAISE EXCEPTION 'Vault cover amount must be positive';
  END IF;

  -- Lock the vault row for this branch to prevent concurrent balance drift.
  -- Any concurrent vault withdrawal or deposit will wait until this transaction commits.
  SELECT balance
  INTO   v_current_balance
  FROM   branch_vaults
  WHERE  branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vault not found for branch %', p_branch_id;
  END IF;

  -- Cap withdrawal against live balance — UI balance may be stale if another
  -- write landed between the user opening the modal and tapping Save.
  v_safe_cover  := LEAST(p_vault_cover, v_current_balance);
  v_new_balance := GREATEST(0, v_current_balance - v_safe_cover);

  -- 1. Insert OPERATIONAL expense
  INSERT INTO expenses (id, branch_id, timestamp, name, amount, category, receipt_image)
  VALUES (p_expense_id, p_branch_id, p_timestamp, p_expense_name, p_expense_amount,
          'OPERATIONAL', p_receipt_url);

  -- 2. Deduct vault balance
  UPDATE branch_vaults
  SET    balance = v_new_balance
  WHERE  branch_id = p_branch_id;

  IF v_safe_cover > 0 THEN
    -- 3. Record VAULT_WITHDRAWAL expense — authoritative source for net ROI credit
    --    in useTodayData. Without this record, vault coverage is invisible to the
    --    auto-save formula and net_roi goes negative.
    INSERT INTO expenses (id, branch_id, timestamp, name, amount, category)
    VALUES (p_vault_tx_id, p_branch_id, p_timestamp,
            'VAULT: ' || p_expense_name, v_safe_cover, 'VAULT_WITHDRAWAL');

    -- 4. Record vault_transaction — withdrawal history used by Remittance tab
    INSERT INTO vault_transactions (id, branch_id, type, amount, name, timestamp, receipt_image, report_id)
    VALUES (p_vault_tx_id, p_branch_id, 'WITHDRAWAL', v_safe_cover,
            'VAULT: ' || p_expense_name, p_timestamp, p_receipt_url, p_report_id);
  END IF;

  RETURN jsonb_build_object(
    'new_balance',         v_new_balance,
    'vault_cover_applied', v_safe_cover
  );
END;
$$;
