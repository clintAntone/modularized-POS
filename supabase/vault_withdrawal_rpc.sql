-- vault_withdrawal_rpc.sql
-- Atomic vault withdrawal: inserts the transaction AND decrements the balance
-- in a single DB transaction. Eliminates the partial-write window where the
-- transaction is recorded but the balance update never lands.
--
-- Usage from the client:
--   supabase.rpc('process_vault_withdrawal', { p_id, p_branch_id, p_amount,
--     p_label, p_timestamp, p_receipt_url, p_performed_by })
--
-- Returns: { new_balance: number } on success, raises exception on failure.

CREATE OR REPLACE FUNCTION process_vault_withdrawal(
  p_id            TEXT,
  p_branch_id     TEXT,
  p_amount        NUMERIC,
  p_label         TEXT,
  p_timestamp     TIMESTAMPTZ,
  p_receipt_url   TEXT DEFAULT NULL,
  p_performed_by  TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_balance NUMERIC;
  v_new_balance     NUMERIC;
BEGIN
  -- Lock the vault row for this branch to prevent concurrent balance drift
  -- NOTE: column is named 'balance', not 'vault_balance'
  SELECT balance
  INTO   v_current_balance
  FROM   branch_vaults
  WHERE  branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vault not found for branch %', p_branch_id;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be positive';
  END IF;

  IF p_amount > v_current_balance THEN
    RAISE EXCEPTION 'Insufficient vault balance. Available: %, Requested: %',
      v_current_balance, p_amount;
  END IF;

  -- Insert the vault transaction record
  INSERT INTO vault_transactions (id, branch_id, type, amount, name, timestamp, receipt_image, performed_by)
  VALUES (p_id, p_branch_id, 'WITHDRAWAL', p_amount, p_label, p_timestamp, p_receipt_url, p_performed_by);

  -- Decrement the balance atomically
  v_new_balance := GREATEST(0, v_current_balance - p_amount);

  UPDATE branch_vaults
  SET    balance = v_new_balance
  WHERE  branch_id = p_branch_id;

  RETURN jsonb_build_object('new_balance', v_new_balance);
END;
$$;
