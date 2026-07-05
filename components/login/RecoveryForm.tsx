
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { playSound } from '../../lib/audio';

type Step = 'username' | 'otp' | 'pin' | 'success';

interface RecoveryFormProps {
  onCancel: () => void;
}

export const RecoveryForm: React.FC<RecoveryFormProps> = ({ onCancel }) => {
  const [step, setStep] = useState<Step>('username');
  const [username, setUsername] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const mins = Math.floor(countdown / 60);
  const secs = countdown % 60;
  const countdownStr = `${mins}:${secs.toString().padStart(2, '0')}`;

  const invoke = async (body: object) => {
    const { data, error: fnErr } = await supabase.functions.invoke('reset-pin-with-otp', { body });
    if (fnErr) throw new Error(fnErr.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const handleRequestOTP = async () => {
    if (!username.trim() || loading) return;
    setLoading(true);
    setError('');
    try {
      const data = await invoke({ action: 'request', username });
      setMaskedEmail(data.maskedEmail);
      setCountdown(300);
      setStep('otp');
      playSound('success');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send OTP');
      playSound('warning');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 6 || loading) return;
    setLoading(true);
    setError('');
    try {
      await invoke({ action: 'verify', username, otp });
      setStep('pin');
      playSound('success');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Invalid OTP');
      playSound('warning');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPin = async () => {
    if (newPin.length !== 6) { setError('PIN must be 6 digits'); return; }
    if (newPin !== confirmPin) { setError('PINs do not match'); playSound('warning'); return; }
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      await invoke({ action: 'reset', username, otp, newPin });
      setStep('success');
      playSound('success');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Reset failed');
      playSound('warning');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (loading || countdown > 0) return;
    setOtp('');
    setError('');
    await handleRequestOTP();
  };

  // ── SUCCESS ───────────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div className="space-y-8 animate-in slide-in-from-bottom-2 duration-300">
        <div className="p-8 bg-emerald-50 rounded-[28px] border-2 border-emerald-100 text-center space-y-4 animate-in zoom-in">
          <div className="w-12 h-12 bg-emerald-600 rounded-full flex items-center justify-center text-white mx-auto shadow-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="4"><path d="M5 13l4 4L19 7"/></svg>
          </div>
          <p className="text-sm font-black text-emerald-800 uppercase tracking-tight">PIN Reset Successful</p>
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-widest">You can now log in with your new PIN.</p>
        </div>
        <button onClick={onCancel} className="w-full bg-slate-900 text-white font-black py-4 rounded-xl uppercase tracking-widest text-xs shadow-lg active:scale-95 transition-all">
          Back to Login
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
      {/* Step indicator */}
      <div className="flex items-center gap-2 justify-center">
        {(['username', 'otp', 'pin'] as Step[]).map((s, i) => (
          <React.Fragment key={s}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black transition-all ${
              step === s ? 'bg-emerald-600 text-white' :
              (['username', 'otp', 'pin'] as Step[]).indexOf(step) > i ? 'bg-emerald-200 text-emerald-700' : 'bg-slate-100 text-slate-400'
            }`}>{i + 1}</div>
            {i < 2 && <div className={`flex-1 h-0.5 ${(['username', 'otp', 'pin'] as Step[]).indexOf(step) > i ? 'bg-emerald-300' : 'bg-slate-100'}`} />}
          </React.Fragment>
        ))}
      </div>

      {error && (
        <div className="p-3 bg-rose-50 text-rose-600 rounded-xl text-center text-xs font-black uppercase border border-rose-100 animate-in slide-in-from-top-2">
          {error}
        </div>
      )}

      {/* ── STEP 1: USERNAME ─────────────────────────────────────────────── */}
      {step === 'username' && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-emerald-600 uppercase tracking-widest ml-1">Your Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value.toLowerCase())}
              placeholder="ENTER USERNAME"
              autoFocus
              className="w-full p-4 bg-slate-50 border-2 border-transparent text-xs rounded-xl font-bold uppercase outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner text-center tracking-widest"
            />
          </div>
          <p className="text-xs text-slate-400 font-semibold text-center uppercase tracking-widest">
            A one-time password will be sent to your registered email
          </p>
          <button
            onClick={handleRequestOTP}
            disabled={loading || !username.trim()}
            className="w-full bg-emerald-600 text-white font-black py-4 rounded-xl uppercase tracking-widest text-xs shadow-lg active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
          >
            {loading ? <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : null}
            Send OTP
          </button>
          <button onClick={onCancel} className="w-full text-xs font-semibold text-slate-400 uppercase tracking-widest py-2">Cancel</button>
        </div>
      )}

      {/* ── STEP 2: OTP ──────────────────────────────────────────────────── */}
      {step === 'otp' && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-50 rounded-2xl text-center space-y-1">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">OTP sent to</p>
            <p className="text-sm font-black text-slate-700">{maskedEmail}</p>
            {countdown > 0
              ? <p className="text-xs font-semibold text-emerald-600 uppercase tracking-widest">Expires in {countdownStr}</p>
              : <p className="text-xs font-semibold text-rose-500 uppercase tracking-widest">OTP expired</p>
            }
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-emerald-600 uppercase tracking-widest ml-1">One-Time Password</label>
            <input
              type="text"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="_ _ _ _ _ _"
              maxLength={6}
              inputMode="numeric"
              autoFocus
              className="w-full p-5 bg-slate-50 border-2 border-transparent rounded-xl font-black text-2xl tracking-[0.4em] outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner text-center tabular-nums"
            />
          </div>
          <button
            onClick={handleVerifyOTP}
            disabled={loading || otp.length !== 6}
            className="w-full bg-emerald-600 text-white font-black py-4 rounded-xl uppercase tracking-widest text-xs shadow-lg active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
          >
            {loading ? <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : null}
            Verify OTP
          </button>
          <button
            onClick={handleResend}
            disabled={loading || countdown > 0}
            className="w-full text-xs font-semibold text-slate-400 uppercase tracking-widest py-1 disabled:opacity-30"
          >
            {countdown > 0 ? `Resend available in ${countdownStr}` : 'Resend OTP'}
          </button>
        </div>
      )}

      {/* ── STEP 3: NEW PIN ───────────────────────────────────────────────── */}
      {step === 'pin' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center ml-1">
            <label className="text-xs font-semibold text-emerald-600 uppercase tracking-widest">New Security PIN</label>
            <button type="button" onClick={() => setShowPin(v => !v)} className="text-xs font-black text-slate-400 uppercase tracking-widest">
              {showPin ? 'Hide' : 'Show'}
            </button>
          </div>
          <input
            type={showPin ? 'text' : 'password'}
            value={newPin}
            onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="_ _ _ _ _ _"
            maxLength={6}
            inputMode="numeric"
            autoFocus
            className="w-full p-5 bg-slate-50 border-2 border-transparent rounded-xl font-black text-2xl tracking-[0.4em] outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner text-center tabular-nums"
          />
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1">Confirm New PIN</label>
          <input
            type={showPin ? 'text' : 'password'}
            value={confirmPin}
            onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="_ _ _ _ _ _"
            maxLength={6}
            inputMode="numeric"
            className={`w-full p-5 bg-slate-50 border-2 rounded-xl font-black text-2xl tracking-[0.4em] outline-none transition-all shadow-inner text-center tabular-nums ${
              confirmPin.length === 6
                ? confirmPin === newPin ? 'border-emerald-400 bg-emerald-50' : 'border-rose-400 bg-rose-50'
                : 'border-transparent focus:border-emerald-500 focus:bg-white'
            }`}
          />
          <button
            onClick={handleResetPin}
            disabled={loading || newPin.length !== 6 || confirmPin !== newPin}
            className="w-full bg-slate-900 text-white font-black py-4 rounded-xl uppercase tracking-widest text-xs shadow-lg hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-30 flex items-center justify-center gap-2"
          >
            {loading ? <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : null}
            Set New PIN
          </button>
        </div>
      )}
    </div>
  );
};
