import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { toEmail, employeeName, username, pin, branchName } = await req.json();

    if (!toEmail || !employeeName || !username || !pin) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Hilot Center <noreply@hilotcenter.cloud>',
        to: toEmail,
        subject: 'Your Login Credentials — Hilot Center',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
            <div style="background:#0f172a;padding:24px;border-radius:12px;margin-bottom:24px;text-align:center;">
              <h1 style="color:#fff;font-size:18px;font-weight:900;letter-spacing:0.1em;margin:0;text-transform:uppercase;">Hilot Center</h1>
              <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;margin:6px 0 0;">Management System</p>
            </div>
            <h2 style="font-size:16px;font-weight:900;color:#0f172a;text-transform:uppercase;letter-spacing:0.05em;">Hi, ${employeeName}</h2>
            <p style="font-size:13px;color:#475569;margin-bottom:24px;">
              Your login credentials for <strong>${branchName || 'Hilot Center'}</strong> have been set up by your administrator.
            </p>
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin-bottom:24px;">
              <div style="margin-bottom:16px;">
                <p style="font-size:9px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:0.2em;margin:0 0 4px;">Username</p>
                <p style="font-size:18px;font-weight:900;color:#0f172a;text-transform:uppercase;margin:0;">${username}</p>
              </div>
              <div>
                <p style="font-size:9px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:0.2em;margin:0 0 4px;">Security PIN</p>
                <p style="font-size:32px;font-weight:900;color:#059669;letter-spacing:0.3em;margin:0;font-variant-numeric:tabular-nums;">${pin}</p>
              </div>
            </div>
            <p style="font-size:11px;color:#94a3b8;text-align:center;margin:0;">
              Keep your PIN confidential. Do not share it with anyone.<br/>
              Contact your branch manager if you did not expect this email.
            </p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      return new Response(JSON.stringify({ error: 'Resend API error', details: err }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
