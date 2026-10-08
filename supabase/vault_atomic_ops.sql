-- vault_atomic_ops.sql
-- Atomic RPCs for all vault write paths.
-- Each function uses SELECT ... FOR UPDATE to lock the vault row before
-- writing, so concurrent requests from multiple tabs/replicas cannot produce
-- interleaved partial writes that drift balance away from the transaction ledger.
--
-- Existing RPC (already deployed): process_vault_withdrawal
-- New RPCs (this file):
--   record_vault_deposit        — branch-manager deposit from daily ROI
--   record_vault_admin_deposit  — superadmin deposit (accumulates onto same-day row)
--   reverse_vault_deposit       — undo a deposit (deletes tx + subtracts balance)
--   reverse_vault_withdrawal    — undo a withdrawal (deletes tx + restores balance)
--
-- Deploy: paste into Supabase SQL editor and run once.
-- Safe to re-run — all functions use CREATE OR REPLACE.


-- ── 1. record_vault_deposit ──────────────────────────────────────────────────
-- Handles both INSERT (new deposit) and UPDATE (editing an existing deposit).
--
-- p_existing_tx_id : ID of the existing DEPOSIT transaction if one already exists
--                    for this date. Pass NULL to insert a new one.
-- p_new_tx_id      : Deterministic ID used for INSERT
--                    (pattern: vault_deposit_{branchId}_{YYYYMMDD}).
-- p_amount         : The final desired deposit amount — not a delta.
--                    The RPC reads the old amount and computes the delta internally.
-- p_report_id      : sales_reports.id to keep net_roi / total_vault_provision in sync.
--                    Pass NULL if no linked report.

CREATE OR REPLACE FUNCTION record_vault_deposit(
  p_branch_id       TEXT,
  p_amount          NUMERIC,
  p_timestamp       TIMESTAMPTZ,
  p_new_tx_id       TEXT,
  p_existing_tx_id  TEXT        DEFAULT NULL,
  p_report_id       TEXT        DEFAULT NULL,
  p_performed_by    TEXT        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_live_bal   NUMERIC;
  v_old_amount NUMERIC := 0;
  v_delta      NUMERIC;
  v_new_bal    NUMERIC;
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

  IF p_existing_tx_id IS NOT NULL THEN
    -- UPDATE path: read old amount so we can compute the correct delta
    SELECT COALESCE(amount, 0) INTO v_old_amount
    FROM   vault_transactions
    WHERE  id = p_existing_tx_id;

    UPDATE vault_transactions
    SET    amount    = p_amount,
           timestamp = p_timestamp
    WHERE  id = p_existing_tx_id;
  ELSE
    -- INSERT path: new deposit for this date
    INSERT INTO vault_transactions
      (id, branch_id, report_id, type, amount, name, timestamp, performed_by)
    VALUES
      (p_new_tx_id, p_branch_id, p_report_id, 'DEPOSIT', p_amount,
       'VAULT DEPOSIT', p_timestamp, p_performed_by);
  END IF;

  v_delta   := p_amount - v_old_amount;
  v_new_bal := v_live_bal + v_delta;

  UPDATE branch_vaults
  SET    balance = v_new_bal
  WHERE  branch_id = p_branch_id;

  -- Keep the linked sales report in sync
  IF p_report_id IS NOT NULL AND v_delta <> 0 THEN
    UPDATE sales_reports
    SET    net_roi               = net_roi - v_delta,
           total_vault_provision = COALESCE(total_vault_provision, 0) + v_delta
    WHERE  id = p_report_id;
  END IF;

  RETURN jsonb_build_object('new_balance', v_new_bal, 'delta', v_delta);
END;
$$;


-- ── 2. record_vault_admin_deposit ────────────────────────────────────────────
-- Superadmin deposits always ADD to the existing same-day row (accumulate),
-- unlike branch-manager deposits which REPLACE the amount.
--
-- p_existing_tx_id  : ID of same-day ADMIN_DEPOSIT if one exists. NULL to insert.
-- p_existing_amount : Current amount on the existing row (used to compute new total).
--                     Pass 0 (or omit) when inserting.
-- p_report_id       : Optional — only when pulling from a specific report's ROI.

CREATE OR REPLACE FUNCTION record_vault_admin_deposit(
  p_branch_id        TEXT,
  p_amount           NUMERIC,
  p_timestamp        TIMESTAMPTZ,
  p_new_tx_id        TEXT,
  p_existing_tx_id   TEXT        DEFAULT NULL,
  p_existing_amount  NUMERIC     DEFAULT 0,
  p_report_id        TEXT        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_live_bal   NUMERIC;
  v_new_bal    NUMERIC;
  v_new_tx_amt NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Deposit amount must be positive';
  END IF;

  SELECT balance INTO v_live_bal
  FROM   branch_vaults
  WHERE  branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vault not found for branch %', p_branch_id;
  END IF;

  v_new_tx_amt := p_existing_amount + p_amount;

  IF p_existing_tx_id IS NOT NULL THEN
    UPDATE vault_transactions
    SET    amount    = v_new_tx_amt,
           timestamp = p_timestamp
    WHERE  id = p_existing_tx_id;
  ELSE
    INSERT INTO vault_transactions
      (id, branch_id, type, amount, name, timestamp, performed_by)
    VALUES
      (p_new_tx_id, p_branch_id, 'ADMIN_DEPOSIT', p_amount,
       'VAULT DEPOSIT (ADMIN)', p_timestamp, 'ADMIN');
  END IF;

  v_new_bal := v_live_bal + p_amount;

  UPDATE branch_vaults
  SET    balance = v_new_bal
  WHERE  branch_id = p_branch_id;

  IF p_report_id IS NOT NULL THEN
    UPDATE sales_reports
    SET    net_roi               = net_roi - p_amount,
           total_vault_provision = COALESCE(total_vault_provision, 0) + p_amount
    WHERE  id = p_report_id;
  END IF;

  RETURN jsonb_build_object('new_balance', v_new_bal);
END;
$$;


-- ── 3. reverse_vault_deposit ─────────────────────────────────────────────────
-- Deletes a DEPOSIT vault_transaction and subtracts its amount from balance.
-- The client handles the paired sales_report ROI restoration separately
-- (not vault-critical — does not affect the audit formula).

CREATE OR REPLACE FUNCTION reverse_vault_deposit(
  p_tx_id     TEXT,
  p_branch_id TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_refund_amt NUMERIC;
  v_live_bal   NUMERIC;
  v_new_bal    NUMERIC;
BEGIN
  SELECT balance INTO v_live_bal
  FROM   branch_vaults
  WHERE  branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vault not found for branch %', p_branch_id;
  END IF;

  SELECT COALESCE(amount, 0) INTO v_refund_amt
  FROM   vault_transactions
  WHERE  id = p_tx_id AND branch_id = p_branch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit % not found — vault balance unchanged', p_tx_id;
  END IF;

  DELETE FROM vault_transactions
  WHERE  id = p_tx_id AND branch_id = p_branch_id;

  v_new_bal := GREATEST(0, v_live_bal - v_refund_amt);

  UPDATE branch_vaults
  SET    balance = v_new_bal
  WHERE  branch_id = p_branch_id;

  RETURN jsonb_build_object('new_balance', v_new_bal, 'refund_amount', v_refund_amt);
END;
$$;


-- ── 4. reverse_vault_withdrawal ──────────────────────────────────────────────
-- Deletes a WITHDRAWAL vault_transaction and restores its amount to balance.
-- Also used for vault-covered expense reversals (same-ID pattern where the
-- vault_transaction ID matches the VAULT_WITHDRAWAL expense ID).
-- The client handles paired expense record deletions separately.

CREATE OR REPLACE FUNCTION reverse_vault_withdrawal(
  p_tx_id     TEXT,
  p_branch_id TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_refund_amt NUMERIC;
  v_live_bal   NUMERIC;
  v_new_bal    NUMERIC;
BEGIN
  SELECT balance INTO v_live_bal
  FROM   branch_vaults
  WHERE  branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vault not found for branch %', p_branch_id;
  END IF;

  SELECT COALESCE(amount, 0) INTO v_refund_amt
  FROM   vault_transactions
  WHERE  id = p_tx_id AND branch_id = p_branch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal % not found — vault balance unchanged', p_tx_id;
  END IF;

  DELETE FROM vault_transactions
  WHERE  id = p_tx_id AND branch_id = p_branch_id;

  v_new_bal := v_live_bal + v_refund_amt;

  UPDATE branch_vaults
  SET    balance = v_new_bal
  WHERE  branch_id = p_branch_id;

  RETURN jsonb_build_object('new_balance', v_new_bal, 'refund_amount', v_refund_amt);
END;
$$;


-- ── 5. sync_backfill_vault_deposits ─────────────────────────────────────────
-- Used by the backfill request approval flow (RequestsHub).
-- Atomically replaces all DEPOSIT vault_transactions for a given report and
-- applies the net delta to the vault balance.
--
-- p_deposits: JSONB array of deposit objects —
--   [{ "id": "...", "amount": 1000, "name": "VAULT DEPOSIT", "timestamp": "..." }, ...]
--   Pass an empty array [] to clear all deposits for the report with a full refund.

CREATE OR REPLACE FUNCTION sync_backfill_vault_deposits(
  p_branch_id TEXT,
  p_report_id TEXT,
  p_deposits  JSONB
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_live_bal       NUMERIC;
  v_previous_total NUMERIC;
  v_new_total      NUMERIC := 0;
  v_delta          NUMERIC;
  v_new_bal        NUMERIC;
  v_dep            JSONB;
BEGIN
  -- Lock vault row to prevent concurrent balance drift
  SELECT balance INTO v_live_bal
  FROM   branch_vaults
  WHERE  branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vault not found for branch %', p_branch_id;
  END IF;

  -- Sum of previously recorded deposits for this report (to compute delta)
  SELECT COALESCE(SUM(amount), 0) INTO v_previous_total
  FROM   vault_transactions
  WHERE  report_id = p_report_id
    AND  branch_id = p_branch_id
    AND  type = 'DEPOSIT';

  -- Delete all existing DEPOSIT records for this report
  DELETE FROM vault_transactions
  WHERE  report_id = p_report_id
    AND  branch_id = p_branch_id
    AND  type = 'DEPOSIT';

  -- Insert the new deposit rows
  FOR v_dep IN SELECT * FROM jsonb_array_elements(p_deposits)
  LOOP
    INSERT INTO vault_transactions
      (id, branch_id, report_id, type, amount, name, timestamp, performed_by)
    VALUES (
      v_dep->>'id',
      p_branch_id,
      p_report_id,
      'DEPOSIT',
      (v_dep->>'amount')::NUMERIC,
      COALESCE(NULLIF(v_dep->>'name', ''), 'VAULT DEPOSIT'),
      (v_dep->>'timestamp')::TIMESTAMPTZ,
      NULL
    );
    v_new_total := v_new_total + (v_dep->>'amount')::NUMERIC;
  END LOOP;

  -- Apply net delta to vault balance
  v_delta   := v_new_total - v_previous_total;
  v_new_bal := GREATEST(0, v_live_bal + v_delta);

  UPDATE branch_vaults
  SET    balance = v_new_bal
  WHERE  branch_id = p_branch_id;

  RETURN jsonb_build_object('new_balance', v_new_bal, 'delta', v_delta);
END;
$$;
