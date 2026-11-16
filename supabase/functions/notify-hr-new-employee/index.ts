import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function buildEmailHtml(p: {
  employeeName: string;
  branchName: string;
  role: string;
  allowance: number;
  approvedBy: string;
  approvedAt: string;
  reviewNote: string | null;
}): string {
  const noteRow = p.reviewNote
    ? `<div style="margin-top:20px;background:#f8fafc;border-left:4px solid #10b981;border-radius:0 8px 8px 0;padding:16px 20px">
        <p style="margin:0 0 6px;color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Admin Note</p>
        <p style="margin:0;color:#0f172a;font-size:13px;line-height:1.6">${p.reviewNote}</p>
       </div>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">

        <!-- Header -->
        <tr>
          <td style="background:#0f172a;padding:28px 32px">
            <p style="margin:0;color:#94a3b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">Hilot Center HR</p>
            <h1 style="margin:6px 0 0;color:#fff;font-size:20px;font-weight:800">New Employee Approved</h1>
          </td>
        </tr>

        <!-- Alert banner -->
        <tr>
          <td style="background:#ecfdf5;border-bottom:2px solid #6ee7b7;padding:14px 32px">
            <p style="margin:0;color:#059669;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">
              ✅ New hire approved — please complete onboarding records
            </p>
          </td>
        </tr>

        <!-- Details -->
        <tr>
          <td style="padding:28px 32px">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:8px 0;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;width:140px">Employee</td>
                <td style="padding:8px 0;color:#0f172a;font-size:13px;font-weight:700">${p.employeeName}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Branch</td>
                <td style="padding:8px 0;color:#0f172a;font-size:13px">${p.branchName}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Role</td>
                <td style="padding:8px 0">
                  <span style="background:#dbeafe;color:#1d4ed8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;padding:3px 10px;border-radius:99px">${p.role || 'Not specified'}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Allowance</td>
                <td style="padding:8px 0;color:#0f172a;font-size:13px">₱${p.allowance.toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Approved By</td>
                <td style="padding:8px 0;color:#0f172a;font-size:13px">${p.approvedBy}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Approved At</td>
                <td style="padding:8px 0;color:#64748b;font-size:12px">${p.approvedAt}</td>
              </tr>
            </table>

            ${noteRow}

            <p style="margin:24px 0 0;color:#94a3b8;font-size:11px">
              This is an automated notification from Hilot Center. The employee has been added to the system and is ready for onboarding.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px">
            <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center">Hilot Center · Employee Management System</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendKey   = Deno.env.get('RESEND_API_KEY')!;

    if (!resendKey) return json({ error: 'RESEND_API_KEY not configured' }, 500);

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Read HR email from system_config
    const { data: configRow } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'hr_email')
      .maybeSingle();

    const hrEmail = configRow?.value?.trim();
    if (!hrEmail) return json({ skipped: true, reason: 'hr_email not configured in system_config' });

    const body = await req.json();
    const { employeeName, branchName, role, allowance, approvedBy, approvedAt, reviewNote } = body;

    if (!employeeName || !branchName) {
      return json({ error: 'Missing required fields' }, 400);
    }

    const html = buildEmailHtml({
      employeeName,
      branchName,
      role: role || '',
      allowance: Number(allowance) || 0,
      approvedBy: approvedBy || 'Admin',
      approvedAt: approvedAt || new Date().toISOString(),
      reviewNote: reviewNote || null,
    });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Hilot Center <noreply@hilotcenter.cloud>',
        to: hrEmail,
        subject: `✅ New Employee Approved: ${employeeName} — ${branchName}`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('Resend error:', err);
      return json({ error: 'Email delivery failed', details: err }, 500);
    }

    return json({ sent: true, to: hrEmail });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
