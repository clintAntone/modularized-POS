-- ============================================================
-- HR notification trigger — fires when a CREATE_EMPLOYEE
-- request is submitted, then calls the already-deployed
-- notify-hr-new-employee edge function via pg_net.
--
-- Prerequisites:
--   pg_net extension must be enabled (see below).
--   The anon key must be set:
--     ALTER DATABASE postgres SET app.settings.anon_key = '<anon-key>';
--     SELECT pg_reload_conf();
--   The Supabase URL must be stored in system_config:
--     INSERT INTO system_config (key, value)
--     VALUES ('supabase_url', 'https://db.hilotcenter.cloud')
--     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION notify_hr_new_employee_requested()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supabase_url TEXT;
  v_anon_key     TEXT;
  v_branch_name  TEXT;
  v_body         TEXT;
BEGIN
  -- Only fire on INSERT of CREATE_EMPLOYEE requests
  IF NEW.type <> 'CREATE_EMPLOYEE' THEN
    RETURN NEW;
  END IF;

  -- Get Supabase URL from system_config and anon key from pg settings
  SELECT value INTO v_supabase_url FROM system_config WHERE key = 'supabase_url';
  v_anon_key := current_setting('app.settings.anon_key', true);

  IF v_supabase_url IS NULL OR trim(v_supabase_url) = ''
     OR v_anon_key IS NULL OR trim(v_anon_key) = ''
  THEN
    RETURN NEW;
  END IF;

  -- Look up branch name
  SELECT name INTO v_branch_name
  FROM branches
  WHERE id = COALESCE(NEW.data->>'branchId', NEW.branch_id);

  -- Serialize to TEXT first to avoid pg_net out-of-memory on inline JSONB
  v_body := jsonb_build_object(
    'employeeName', COALESCE(NEW.data->>'name', 'Unknown'),
    'branchName',   COALESCE(v_branch_name, NEW.branch_id),
    'role',         COALESCE(NEW.data->>'role', ''),
    'allowance',    (COALESCE(NEW.data->>'allowance', '0'))::numeric,
    'approvedBy',   'PENDING',
    'approvedAt',   now()::text,
    'reviewNote',   NULL
  )::text;

  PERFORM net.http_post(
    url     := trim(v_supabase_url) || '/functions/v1/notify-hr-new-employee',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || trim(v_anon_key)
               ),
    body    := v_body::jsonb
  );

  RETURN NEW;
END;
$$;

-- ── Trigger ──────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_notify_hr_new_employee ON requests;

CREATE TRIGGER trg_notify_hr_new_employee
  AFTER INSERT ON requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_hr_new_employee_requested();
