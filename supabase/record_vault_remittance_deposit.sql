-- record_vault_remittance_deposit.sql
-- Atomic REMITTANCE_DEPOSIT: inserts the vault_transaction AND increments the
-- vault balance in a single DB transaction using SELECT … FOR UPDATE to prevent
-- concurrent writes from clobbering the balance.
--
-- Accepts two call patterns:
--   RemittanceSection:  { p_id, p_branch_id, p_amount, p_timestamp, p_performed_by }
--   VaultAuditHub:      { p_branch_id, p_amount, p_transaction_id, p_period_label }
--
-- Returns: { new_balance: number }

-- Step 1: replace the function
CREATE OR REPLACE FUNCTION record_vault_remittance_deposit(
  p_branch_id      TEXT,
  p_amount         NUMERIC,
  p_id             TEXT         DEFAULT NULL,  -- RemittanceSection
  p_transaction_id TEXT         DEFAULT NULL,  -- VaultAuditHub (alias for p_id)
  p_timestamp      TIMESTAMPTZ  DEFAULT NULL,  -- RemittanceSection (defaults to NOW())
  p_performed_by   TEXT         DEFAULT NULL,
  p_period_label   TEXT         DEFAULT NULL   -- VaultAuditHub (appended to name)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_live_bal  NUMERIC;
  v_new_bal   NUMERIC;
  v_id        TEXT;
  v_timestamp TIMESTAMPTZ;
  v_name      TEXT;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Deposit amount must be positive';
  END IF;

  -- Resolve ID: p_id takes priority, then p_transaction_id, then generate one
  v_id        := COALESCE(p_id, p_transaction_id, gen_random_uuid()::text);
  v_timestamp := COALESCE(p_timestamp, NOW());
  v_name      := CASE
                   WHEN p_period_label IS NOT NULL
                   THEN 'VAULT DEPOSIT (REMITTANCE) — ' || p_period_label
                   ELSE 'VAULT DEPOSIT (REMITTANCE)'
                 END;

  -- Lock the vault row to prevent concurrent balance drift
  SELECT balance INTO v_live_bal
  FROM   branch_vaults
  WHERE  branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vault not found for branch %', p_branch_id;
  END IF;

  INSERT INTO vault_transactions (id, branch_id, type, amount, name, timestamp, performed_by)
  VALUES (v_id, p_branch_id, 'DEPOSIT', p_amount, v_name, v_timestamp, p_performed_by);

  v_new_bal := v_live_bal + p_amount;

  UPDATE branch_vaults
  SET    balance = v_new_bal
  WHERE  branch_id = p_branch_id;

  RETURN jsonb_build_object('new_balance', v_new_bal);
END;
$$;
