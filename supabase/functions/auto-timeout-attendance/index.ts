import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Config ────────────────────────────────────────────────────────────────────

const MANILA_TZ = 'Asia/Manila';

// ── Helpers ───────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** Returns Manila date string for N days ago as YYYY-MM-DD */
function getManilaDateStr(daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // The function runs at 00:00 Manila time, so "yesterday" is the day
    // employees clocked in but may not have clocked out.
    const yesterday = getManilaDateStr(1);
    const nowIso = new Date().toISOString();

    // Find all attendance records from yesterday with no clock_out
    const { data: openRecords, error: fetchErr } = await supabase
      .from('attendance')
      .select('id, employee_id, staff_name, branch_id, clock_in')
      .eq('date', yesterday)
      .is('clock_out', null);

    if (fetchErr) return json({ error: fetchErr.message }, 500);
    if (!openRecords || openRecords.length === 0) {
      return json({ date: yesterday, auto_timed_out: 0, message: 'No open records found.' });
    }

    const ids = openRecords.map((r: { id: string }) => r.id);

    // Stamp clock_out as midnight (the exact moment this function ran)
    const { error: updateErr } = await supabase
      .from('attendance')
      .update({ clock_out: nowIso })
      .in('id', ids);

    if (updateErr) return json({ error: updateErr.message }, 500);

    // Write audit log entries for each auto-timed-out record
    const auditRows = openRecords.map((r: {
      id: string; employee_id: string; staff_name: string; branch_id: string;
    }) => ({
      action: 'AUTO_TIMEOUT',
      table_name: 'attendance',
      record_id: r.id,
      branch_id: r.branch_id,
      performed_by: 'SYSTEM',
      details: JSON.stringify({
        employee_id: r.employee_id,
        staff_name: r.staff_name,
        clock_out_set: nowIso,
        reason: 'Automatic timeout at midnight — no clock-out recorded for previous day.',
      }),
      created_at: nowIso,
    }));

    await supabase.from('audit_logs').insert(auditRows);

    return json({
      date: yesterday,
      auto_timed_out: ids.length,
      records: openRecords.map((r: { id: string; staff_name: string; branch_id: string }) => ({
        id: r.id,
        staff_name: r.staff_name,
        branch_id: r.branch_id,
      })),
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
