import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function sha256hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const resendKey = Deno.env.get('RESEND_API_KEY')!;

    const { action, username, otp, newPin } = await req.json();
    if (!username) return json({ error: 'Username required' }, 400);

    const { data: emp, error: empErr } = await supabase
      .from('employees')
      .select('id, name, details, otp_hash, otp_salt, otp_expires_at')
      .eq('username', username.trim().toLowerCase())
      .maybeSingle();

    if (empErr || !emp) return json({ error: 'Employee not found' }, 404);

    // ── REQUEST: generate & email OTP ───────────────────────────────────────
    if (action === 'request') {
      const email = emp.details?.gmail;
      if (!email) return json({ error: 'No email on file. Contact your administrator.' }, 400);

      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const salt = generateHex(16);
      const hash = await sha256hex(otpCode + salt);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      await supabase.from('employees').update({
        otp_hash: hash,
        otp_salt: salt,
        otp_expires_at: expiresAt,
      }).eq('id', emp.id);

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Hilot Center <noreply@hilotcenter.cloud>',
          to: email,
          subject: 'Your PIN Reset OTP — Hilot Center',
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
              <div style="background:#0f172a;padding:24px;border-radius:12px;margin-bottom:24px;text-align:center;">
                <h1 style="color:#fff;font-size:18px;font-weight:900;letter-spacing:0.1em;margin:0;text-transform:uppercase;">Hilot Center</h1>
                <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;margin:6px 0 0;">PIN Reset Request</p>
              </div>
              <h2 style="font-size:16px;font-weight:900;color:#0f172a;text-transform:uppercase;letter-spacing:0.05em;">Hi, ${emp.name}</h2>
              <p style="font-size:13px;color:#475569;margin-bottom:24px;">
                Use this one-time password to reset your PIN. It expires in <strong>5 minutes</strong>.
              </p>
              <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;text-align:center;margin-bottom:24px;">
                <p style="font-size:9px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:0.2em;margin:0 0 12px;">One-Time Password</p>
                <p style="font-size:48px;font-weight:900;color:#059669;letter-spacing:0.4em;margin:0;font-variant-numeric:tabular-nums;">${otpCode}</p>
              </div>
              <p style="font-size:11px;color:#94a3b8;text-align:center;margin:0;">
                If you did not request this, ignore this email.<br/>Your PIN will not change unless you complete the process.
              </p>
            </div>
          `,
        }),
      });

      if (!emailRes.ok) {
        const err = await emailRes.json();
        return json({ error: 'Email failed', details: err }, 500);
      }

      const masked = email.replace(/^(.{2})(.*)(@.*)$/, (_: string, a: string, b: string, c: string) =>
        a + b.replace(/./g, '*') + c
      );
      return json({ success: true, maskedEmail: masked });
    }

    // ── VERIFY: check OTP only (no changes) ────────────────────────────────
    if (action === 'verify') {
      if (!otp) return json({ error: 'OTP required' }, 400);

      if (!emp.otp_expires_at || new Date(emp.otp_expires_at) < new Date()) {
        return json({ error: 'OTP expired. Request a new one.' }, 400);
      }

      const hash = await sha256hex(otp + emp.otp_salt);
      if (hash !== emp.otp_hash) return json({ error: 'Invalid OTP' }, 400);

      return json({ success: true });
    }

    // ── RESET: verify OTP + set new PIN atomically ─────────────────────────
    if (action === 'reset') {
      if (!otp || !newPin) return json({ error: 'OTP and new PIN required' }, 400);

      if (!emp.otp_expires_at || new Date(emp.otp_expires_at) < new Date()) {
        return json({ error: 'OTP expired. Request a new one.' }, 400);
      }

      const otpHash = await sha256hex(otp + emp.otp_salt);
      if (otpHash !== emp.otp_hash) return json({ error: 'Invalid OTP' }, 400);

      // Hash new PIN — same algorithm as lib/crypto.ts: SHA-256(pin + salt)
      const pinSalt = generateHex(16);
      const pinHash = await sha256hex(newPin + pinSalt);

      await supabase.from('employees').update({
        login_pin: pinHash,
        pin_salt: pinSalt,
        otp_hash: null,
        otp_salt: null,
        otp_expires_at: null,
        request_reset: false,
      }).eq('id', emp.id);

      return json({ success: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
