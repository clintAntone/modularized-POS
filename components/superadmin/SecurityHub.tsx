
import React, { useState, useRef } from 'react';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { supabase } from '../../lib/supabase';
import { generateSalt, hashPin } from '../../lib/crypto';
import { playSound } from '../../lib/audio';
import { invalidateGlobalSessions, logAudit } from '../../lib/audit';

// ── OTP PIN input ────────────────────────────────────────────────────
interface PinInputProps {
  label: string;
  hint?: string;
  hintColor?: string;
  value: string;
  onChange: (val: string) => void;
  state?: 'default' | 'match' | 'mismatch';
  autoFocus?: boolean;
}

const PinInput: React.FC<PinInputProps> = ({ label, hint, hintColor, value, onChange, state = 'default', autoFocus }) => {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const focusAt = (i: number) => inputsRef.current[Math.max(0, Math.min(5, i))]?.focus();

  const handleChange = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const digit = e.target.value.replace(/\D/g, '').slice(-1);
    const arr = (value + '      ').slice(0, 6).split('');
    arr[i] = digit;
    onChange(arr.join('').trimEnd().slice(0, 6));
    if (digit) focusAt(i + 1);
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') {
      if (value[i]) {
        const arr = (value + '      ').slice(0, 6).split('');
        arr[i] = '';
        onChange(arr.join('').trimEnd());
      } else {
        const arr = (value + '      ').slice(0, 6).split('');
        arr[Math.max(0, i - 1)] = '';
        onChange(arr.slice(0, i).join(''));
        focusAt(i - 1);
      }
    } else if (e.key === 'ArrowLeft') focusAt(i - 1);
    else if (e.key === 'ArrowRight') focusAt(i + 1);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pasted);
    focusAt(Math.min(5, pasted.length));
    e.preventDefault();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{label}</p>
        {hint && <p className={`text-xs font-bold ${hintColor ?? 'text-slate-400'}`}>{hint}</p>}
      </div>
      <div className="flex gap-2 sm:gap-3" onPaste={handlePaste}>
        {Array.from({ length: 6 }).map((_, i) => {
          const filled = i < value.length;
          return (
            <input
              key={i}
              ref={el => { inputsRef.current[i] = el; }}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={value[i] || ''}
              autoFocus={autoFocus && i === 0}
              onChange={e => handleChange(i, e)}
              onKeyDown={e => handleKeyDown(i, e)}
              onFocus={e => e.target.select()}
              className={`w-11 h-12 rounded-2xl border-2 text-center text-lg font-black outline-none transition-all focus:scale-105
                ${filled
                  ? state === 'match'    ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                  : state === 'mismatch' ? 'bg-rose-50 border-rose-400 text-rose-600'
                  : 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300 focus:border-emerald-400 focus:bg-white text-slate-900'
                }`}
            />
          );
        })}
      </div>
    </div>
  );
};

// ── Main component ───────────────────────────────────────────────────
export const SecurityHub: React.FC = () => {
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [forceLogoutStatus, setForceLogoutStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isForceLoggingOut, setIsForceLoggingOut] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const pinMatch    = newPin.length === 6 && confirmPin.length === 6 && newPin === confirmPin;
  const pinMismatch = confirmPin.length > 0 && newPin.length > 0 && confirmPin.length === newPin.length && newPin !== confirmPin;
  const confirmState: PinInputProps['state'] = pinMatch ? 'match' : pinMismatch ? 'mismatch' : 'default';

  const doForceLogout = async () => {
    setShowConfirm(false);
    setIsForceLoggingOut(true);
    try {
      await invalidateGlobalSessions();
      playSound('success');
      setForceLogoutStatus('success');
      setTimeout(() => setForceLogoutStatus('idle'), 4000);
    } catch {
      playSound('warning');
      setForceLogoutStatus('error');
      setTimeout(() => setForceLogoutStatus('idle'), 4000);
    } finally {
      setIsForceLoggingOut(false);
    }
  };

  const handleUpdatePin = async () => {
    if (!pinMatch) { setStatus('error'); playSound('warning'); return; }
    setStatus('saving');
    try {
      const salt = generateSalt();
      const hash = await hashPin(newPin, salt);
      const { error } = await supabase.from(DB_TABLES.SYSTEM_CONFIG).upsert([
        { [DB_COLUMNS.KEY]: 'master_admin_pin', [DB_COLUMNS.VALUE]: hash },
        { [DB_COLUMNS.KEY]: 'master_admin_pin_salt', [DB_COLUMNS.VALUE]: salt },
      ], { onConflict: DB_COLUMNS.KEY });
      if (error) throw error;
      await invalidateGlobalSessions();
      await logAudit({
        branchId: null,
        activityType: 'UPDATE',
        entityType: 'SECURITY',
        description: 'Master Authorization Key updated with SHA-256 salted encryption.',
        performerName: 'SYSTEM ADMIN',
      });
      setStatus('success');
      setNewPin('');
      setConfirmPin('');
      playSound('success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch {
      setStatus('error');
      playSound('warning');
    }
  };

  return (
    <div className="space-y-4 max-w-lg">

      {/* Master PIN card */}
      <div className="bg-white rounded-[28px] border border-slate-100 shadow-sm p-5 sm:p-6 space-y-5">
        <div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Master PIN</p>
          <p className="text-xs text-slate-500 mt-1">Update the superadmin authentication passcode</p>
        </div>

        <div className="space-y-5">
          <PinInput
            label="New PIN"
            value={newPin}
            onChange={v => { setNewPin(v); setStatus('idle'); }}
            autoFocus
          />
          <PinInput
            label="Confirm PIN"
            value={confirmPin}
            onChange={v => { setConfirmPin(v); setStatus('idle'); }}
            state={confirmState}
            hint={pinMatch ? '✓ Match' : pinMismatch ? 'Does not match' : undefined}
            hintColor={pinMatch ? 'text-emerald-500' : 'text-rose-500'}
          />
        </div>

        <div className="flex items-center justify-between gap-4 pt-1">
          <div className="text-xs">
            {status === 'success' && <span className="text-emerald-600 font-bold">✓ PIN updated.</span>}
            {status === 'error' && <span className="text-rose-500">Ensure both PINs are 6 digits and match.</span>}
          </div>
          <button
            onClick={handleUpdatePin}
            disabled={status === 'saving' || !pinMatch}
            className="h-10 px-6 rounded-2xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-30 flex items-center gap-2 shrink-0 shadow-sm"
          >
            {status === 'saving'
              ? <><div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Saving…</>
              : 'Update PIN'}
          </button>
        </div>
      </div>

      {/* Danger Zone card */}
      <div className="bg-white rounded-[28px] border border-rose-100 shadow-sm p-5 sm:p-6 space-y-4">
        <div>
          <p className="text-xs font-black text-rose-400 uppercase tracking-widest">Danger Zone</p>
          <p className="text-xs text-slate-500 mt-1">Destructive network-wide actions</p>
        </div>

        <div className="bg-rose-50 rounded-[20px] p-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black text-slate-800 uppercase tracking-wide leading-none">Force Logout All</p>
            <p className="text-xs text-slate-500 mt-1">
              {forceLogoutStatus === 'success'
                ? <span className="text-emerald-600 font-bold">Signal broadcasted — all sessions terminated.</span>
                : forceLogoutStatus === 'error'
                ? <span className="text-rose-500 font-bold">Broadcast failed. Try again.</span>
                : 'Terminates every active session across the network.'}
            </p>
          </div>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={isForceLoggingOut}
            className="h-10 px-4 rounded-2xl bg-white border border-rose-200 text-rose-600 text-xs font-black uppercase tracking-widest hover:bg-rose-600 hover:text-white hover:border-rose-600 active:scale-95 transition-all disabled:opacity-40 flex items-center gap-2 shrink-0 shadow-sm"
          >
            {isForceLoggingOut
              ? <div className="w-3 h-3 border-2 border-rose-300 border-t-rose-600 rounded-full animate-spin" />
              : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>}
            Force Logout
          </button>
        </div>
      </div>

      {/* Confirm dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-sm p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div>
              <p className="text-xs font-black text-rose-400 uppercase tracking-widest mb-1">Confirm Action</p>
              <p className="text-base font-black text-slate-900 uppercase tracking-tight">Force Logout All?</p>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                This will immediately terminate every active session across the entire network. All branches and portal users must re-authenticate. You will remain logged in.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowConfirm(false)}
                className="flex-1 h-10 rounded-2xl border border-slate-200 text-slate-500 text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all">
                Cancel
              </button>
              <button onClick={doForceLogout}
                className="flex-1 h-10 rounded-2xl bg-rose-600 text-white text-xs font-black uppercase tracking-widest hover:bg-rose-700 active:scale-95 transition-all">
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
