import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MANILA_TZ = 'Asia/Manila';

function getManilaDateStr(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const todayStr = getManilaDateStr();

    // Find all employees currently marked on_leave whose leave_end_date has passed
    const { data: expired, error: fetchErr } = await supabase
      .from('employees')
      .select('id, name, leave_end_date')
      .eq('on_leave', true)
      .not('leave_end_date', 'is', null)
      .lt('leave_end_date', todayStr);

    if (fetchErr) return json({ error: fetchErr.message }, 500);
    if (!expired?.length) return json({ returned: [], reason: 'No expired leaves today' });

    const ids = expired.map((e: any) => e.id);

    const { error: updateErr } = await supabase
      .from('employees')
      .update({
        on_leave: false,
        leave_type: null,
        leave_start_date: null,
        leave_end_date: null,
      })
      .in('id', ids);

    if (updateErr) return json({ error: updateErr.message }, 500);

    return json({
      date: todayStr,
      returned: expired.map((e: any) => ({ id: e.id, name: e.name, leaveEndDate: e.leave_end_date })),
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
