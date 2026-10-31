-- record_vault_remittance_deposit.sql
-- Atomic REMITTANCE_DEPOSIT: inserts the vault_transaction AND increments the
-- vault balance in a single DB transaction using SELECT … FOR UPDATE to prevent
-- concurrent writes from clobbering the balance.
--
-- Replaces the non-atomic pattern in RemittanceSection.tsx where the client
-- read vaultBalance from local state then did a plain UPDATE — susceptible to
-- last-write-wins corruption when any other write (auto-save deposit, withdrawal,
-- another tab) landed between the component mount and the user's submit.
--
-- Usage from the client:
--   supabase.rpc('record_vault_remittance_deposit', {
--     p_id, p_branch_id, p_amount, p_timestamp, p_performed_by
--   })
--
-- Returns: { new_balance: number }

CREATE OR REPLACE FUNCTION record_vault_remittance_deposit(
  p_id            TEXT,
  p_branch_id     TEXT,
  p_amount        NUMERIC,
  p_timestamp     TIMESTAMPTZ,
  p_performed_by  TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_live_bal  NUMERIC;
  v_new_bal   NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Deposit amount must be positive';
  END IF;

  -- Lock the vault row to prevent concurrent balance drift
  SELECT balance INTO v_live_bal
  FROM   branch_vaults
  WHERE  branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vault not found for branch %', p_branch_id;
  END IF;

  INSERT INTO vault_transactions (id, branch_id, type, amount, name, timestamp, performed_by)
  VALUES (p_id, p_branch_id, 'REMITTANCE_DEPOSIT', p_amount,
          'VAULT DEPOSIT (REMITTANCE)', p_timestamp, p_performed_by);

  v_new_bal := v_live_bal + p_amount;

  UPDATE branch_vaults
  SET    balance = v_new_bal
  WHERE  branch_id = p_branch_id;

  RETURN jsonb_build_object('new_balance', v_new_bal);
END;
$$;
