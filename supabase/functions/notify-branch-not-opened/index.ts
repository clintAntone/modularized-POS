import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Config ────────────────────────────────────────────────────────────────────
// How many minutes past opening_time before we alert (grace period)
const GRACE_MINUTES = 30;

const MANILA_TZ = 'Asia/Manila';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns current Manila date as YYYY-MM-DD */
function getManilaDateStr(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** Returns current Manila HH:MM (24h) */
function getManilaTimeStr(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: MANILA_TZ,
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
}

/** Compares two HH:MM strings. Returns true if a >= b */
function timeGte(a: string, b: string): boolean {
  return a.localeCompare(b) >= 0;
}

/** Adds minutes to an HH:MM string, returns HH:MM */
function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + mins;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Mask an email address for display: ab*****@domain.com */
function maskEmail(email: string): string {
  return email.replace(/^(.{2})(.*)(@.*)$/, (_: string, a: string, b: string, c: string) =>
    a + b.replace(/./g, '*') + c
  );
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

// ── Email template ─────────────────────────────────────────────────────────────
function buildEmailHtml(managerName: string, branchName: string, openingTime: string, currentTime: string): string {
  const cleanBranch = branchName.replace(/BRANCH\s*-\s*/i, '');
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
      <div style="background:#0f172a;padding:24px;border-radius:12px;margin-bottom:24px;text-align:center;">
        <h1 style="color:#fff;font-size:18px;font-weight:900;letter-spacing:0.1em;margin:0;text-transform:uppercase;">Hilot Center</h1>
        <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;margin:6px 0 0;">Branch Monitoring</p>
      </div>

      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:20px 24px;margin-bottom:24px;display:flex;align-items:flex-start;gap:16px;">
        <div style="font-size:28px;line-height:1;flex-shrink:0;">⚠️</div>
        <div>
          <p style="font-size:13px;font-weight:900;color:#9a3412;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px;">Branch Not Yet Opened</p>
          <p style="font-size:12px;color:#c2410c;margin:0;">
            <strong>${cleanBranch.toUpperCase()}</strong> was scheduled to open at
            <strong>${openingTime}</strong> but has not been opened as of <strong>${currentTime}</strong>.
          </p>
        </div>
      </div>

      <h2 style="font-size:15px;font-weight:900;color:#0f172a;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px;">
        Hi, ${managerName}
      </h2>
      <p style="font-size:13px;color:#475569;line-height:1.6;margin:0 0 24px;">
        This is an automated reminder that your branch <strong>${cleanBranch.toUpperCase()}</strong>
        has not been marked as <strong>Open</strong> yet.
        Please log in to the Hilot Center dashboard and open the branch when operations begin.
      </p>

      <div style="background:#f1f5f9;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="font-size:9px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:0.15em;padding:4px 0;">Branch</td>
            <td style="font-size:12px;font-weight:700;color:#0f172a;text-align:right;padding:4px 0;">${cleanBranch.toUpperCase()}</td>
          </tr>
          <tr>
            <td style="font-size:9px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:0.15em;padding:4px 0;">Scheduled Opening</td>
            <td style="font-size:12px;font-weight:700;color:#0f172a;text-align:right;padding:4px 0;">${openingTime}</td>
          </tr>
          <tr>
            <td style="font-size:9px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:0.15em;padding:4px 0;">Time of Alert</td>
            <td style="font-size:12px;font-weight:700;color:#dc2626;text-align:right;padding:4px 0;">${currentTime}</td>
          </tr>
        </table>
      </div>

      <p style="font-size:11px;color:#94a3b8;text-align:center;margin:0;line-height:1.6;">
        If the branch is intentionally closed today, you may ignore this message.<br/>
        This alert is sent automatically when a branch hasn't opened ${GRACE_MINUTES} minutes past its scheduled time.
      </p>
    </div>
  `;
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return json({ error: 'RESEND_API_KEY not configured' }, 500);

    const todayStr = getManilaDateStr();
    const nowStr = getManilaTimeStr();

    // ── Load today's already-notified branch IDs from dedicated table ─────────
    const { data: notifRows } = await supabase
      .from('branch_opening_notifs')
      .select('branch_id')
      .eq('notif_date', todayStr);

    const alreadyNotified = new Set((notifRows ?? []).map((r: any) => r.branch_id));

    // ── Query all enabled non-test branches ───────────────────────────────────
    const { data: branches, error: branchErr } = await supabase
      .from('branches')
      .select('id, name, manager, opening_time')
      .eq('is_enabled', true);

    if (branchErr) return json({ error: branchErr.message }, 500);
    if (!branches?.length) return json({ notified: [], reason: 'No enabled branches' });

    // ── Query today's sales reports to find which branches already have an entry ─
    const { data: todayReports } = await supabase
      .from('sales_reports')
      .select('branch_id')
      .eq('report_date', todayStr);

    const branchesWithReport = new Set((todayReports ?? []).map((r: any) => r.branch_id));

    // Mirror the Live tab logic exactly:
    // eligible = enabled + non-TEST + opening time passed + no sales report for today
    const eligibleBranches = branches.filter(b => {
      if ((b.name || '').toUpperCase().includes('TEST')) return false;
      if (!b.opening_time) return false;
      // Use grace period: alert only after opening_time + GRACE_MINUTES
      const alertAfter = addMinutes(b.opening_time, GRACE_MINUTES);
      if (!timeGte(nowStr, alertAfter)) return false;
      return !branchesWithReport.has(b.id);
    });

    if (!eligibleBranches.length) return json({ notified: [], reason: 'All branches already have a report or are not yet due' });

    // ── Fetch all employees with a gmail in one query ─────────────────────────
    const { data: allEmps } = await supabase
      .from('employees')
      .select('name, details')
      .eq('is_active', true);

    // Build a name → gmail lookup map (uppercase keys for case-insensitive match)
    const gmailByName = new Map<string, string>();
    for (const e of (allEmps ?? [])) {
      const gmail = e.details?.gmail;
      if (gmail) gmailByName.set((e.name || '').toUpperCase().trim(), gmail);
    }

    // ── Build send jobs for eligible branches ────────────────────────────────
    type SendJob = {
      branchId: string;
      branchName: string;
      managerName: string;
      openingTime: string;
      email: string;
    };

    const skipResults: { branch: string; status: string }[] = [];
    const sendJobs: SendJob[] = [];

    for (const branch of eligibleBranches) {
      if (alreadyNotified.has(branch.id)) {
        skipResults.push({ branch: branch.name, status: 'skipped_already_notified' });
        continue;
      }
      if (!branch.manager) {
        skipResults.push({ branch: branch.name, status: 'skipped_no_manager' });
        continue;
      }
      const email = gmailByName.get(branch.manager.trim().toUpperCase()) ?? null;
      if (!email) {
        skipResults.push({ branch: branch.name, status: 'no_email_on_file' });
        continue;
      }
      sendJobs.push({ branchId: branch.id, branchName: branch.name, managerName: branch.manager.trim(), openingTime: branch.opening_time, email });
    }

    // ── Fire all emails in parallel ───────────────────────────────────────────
    const sendResults = await Promise.all(
      sendJobs.map(async job => {
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'Hilot Center <noreply@hilotcenter.cloud>',
              to: job.email,
              subject: `⚠️ Branch Not Yet Opened — ${job.branchName.replace(/BRANCH\s*-\s*/i, '')}`,
              html: buildEmailHtml(job.managerName, job.branchName, job.openingTime, nowStr),
            }),
          });
          const ok = res.ok;
          if (!ok) console.error(`Resend error for ${job.branchName}:`, await res.json().catch(() => ({})));
          return { branchId: job.branchId, branchName: job.branchName, ok, email: maskEmail(job.email) };
        } catch (e) {
          console.error(`Fetch error for ${job.branchName}:`, e);
          return { branchId: job.branchId, branchName: job.branchName, ok: false, email: maskEmail(job.email) };
        }
      })
    );

    // ── Persist notified branch IDs ───────────────────────────────────────────
    const newlyNotified = sendResults.filter(r => r.ok).map(r => r.branchId);
    if (newlyNotified.length > 0) {
      await supabase
        .from('branch_opening_notifs')
        .upsert(
          newlyNotified.map(branchId => ({ branch_id: branchId, notif_date: todayStr })),
          { onConflict: 'branch_id,notif_date' }
        );
    }

    const results = [
      ...skipResults,
      ...sendResults.map(r => ({ branch: r.branchName, status: r.ok ? 'notified' : 'email_failed', emails: [r.email] })),
    ];

    return json({ date: todayStr, currentTime: nowStr, results });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
