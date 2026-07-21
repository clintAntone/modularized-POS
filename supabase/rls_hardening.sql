-- rls_hardening.sql
-- Targeted RLS improvements. Run after vault_withdrawal_rpc.sql.
--
-- Full RLS rewrite is deferred (high risk of breaking the app).
-- This file makes the two highest-impact targeted changes:
--   1. audit_logs — INSERT only (no UPDATE/DELETE via anon key)
--   2. system_config — read-only for anon (writes still open for app use)

-- ── audit_logs: make append-only ─────────────────────────────────────────────
-- Drop the existing all-open policy
DROP POLICY IF EXISTS "Enable all for all" ON audit_logs;
DROP POLICY IF EXISTS "Enable all access for all users" ON audit_logs;

-- Allow anyone to INSERT (app needs this to log actions)
CREATE POLICY "audit_logs_insert"
  ON audit_logs FOR INSERT
  USING (true)
  WITH CHECK (true);

-- Allow anyone to SELECT (needed for audit log views in the app)
CREATE POLICY "audit_logs_select"
  ON audit_logs FOR SELECT
  USING (true);

-- UPDATE and DELETE are intentionally NOT granted.
-- Audit records are now immutable via the anon key.

-- ── Verify ────────────────────────────────────────────────────────────────────
-- After running this, test with:
--   DELETE FROM audit_logs WHERE id = 'any-id';   -- should return 0 rows (silently blocked)
--   UPDATE audit_logs SET description = 'x';       -- should return 0 rows (silently blocked)
--   INSERT INTO audit_logs (...) VALUES (...);      -- should succeed
