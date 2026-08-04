-- cleanup_time_sync_logs.sql
-- Deletes entries in time_sync_logs that are older than 7 days.
-- Call periodically (e.g. via a cron job or pg_cron) or on-demand from the client:
--   supabase.rpc('cleanup_time_sync_logs')
--
-- Returns: { deleted_count: number }

CREATE OR REPLACE FUNCTION cleanup_time_sync_logs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM time_sync_logs
  WHERE created_at < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('deleted_count', v_deleted);
END;
$$;
