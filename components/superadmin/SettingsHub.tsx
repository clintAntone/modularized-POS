
import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { generateSalt, hashPin } from '../../lib/crypto';
import { playSound } from '../../lib/audio';
import { invalidateGlobalSessions, logAudit } from '../../lib/audit';

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────────

const Section: React.FC<{ title: string; subtitle?: string; accent?: string; children: React.ReactNode }> = ({ title, subtitle, accent = 'text-slate-400', children }) => (
  <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
    <div className="px-5 pt-5 pb-3 border-b border-slate-50">
      <p className={`text-[8px] font-black uppercase tracking-[0.15em] ${accent}`}>{title}</p>
      {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
    <div className="divide-y divide-slate-50">
      {children}
    </div>
  </div>
);

const Row: React.FC<{ label: string; desc?: string; children: React.ReactNode }> = ({ label, desc, children }) => (
  <div className="flex items-center gap-4 px-5 py-4">
    <div className="flex-1 min-w-0">
      <p className="text-[12px] font-bold text-slate-800 leading-none">{label}</p>
      {desc && <p className="text-[10px] text-slate-400 mt-1 leading-snug">{desc}</p>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

const Toggle: React.FC<{ value: boolean; onChange: () => void; disabled?: boolean }> = ({ value, onChange, disabled }) => (
  <button onClick={onChange} disabled={disabled}
    className={`relative rounded-full transition-all duration-300 disabled:opacity-40 shrink-0 ${value ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-slate-200'}`}
    style={{ height: '24px', width: '44px' }}>
    <span className={`absolute top-[3px] w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-all duration-300 ${value ? 'left-[23px]' : 'left-[3px]'}`} />
  </button>
);

// ─────────────────────────────────────────────────────────────────────────────
// PIN input
// ─────────────────────────────────────────────────────────────────────────────

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
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
        {hint && <p className={`text-[10px] font-bold ${hintColor ?? 'text-slate-400'}`}>{hint}</p>}
      </div>
      <div className="flex gap-2" onPaste={handlePaste}>
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
              className={`w-10 h-11 rounded-xl border-2 text-center text-lg font-black outline-none transition-all focus:scale-105
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

// ─────────────────────────────────────────────────────────────────────────────
// Combined Settings panel (Security + System Config)
// ─────────────────────────────────────────────────────────────────────────────

const FONT_OPTIONS = [
  { name: 'Outfit', value: 'Outfit' },
  { name: 'Inter', value: 'Inter' },
  { name: 'Space Grotesk', value: 'Space Grotesk' },
  { name: 'Playfair Display', value: 'Playfair Display' },
  { name: 'JetBrains Mono', value: 'JetBrains Mono' },
  { name: 'Montserrat', value: 'Montserrat' },
  { name: 'Lexend', value: 'Lexend' },
  { name: 'Plus Jakarta Sans', value: 'Plus Jakarta Sans' },
];

interface ConfigItem { key: string; value: string; }

const SettingsPanel: React.FC<{ onRefresh?: (quiet?: boolean) => void }> = ({ onRefresh }) => {
  // ── System config state ──────────────────────────────────────────────
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [localAppName, setLocalAppName] = useState('');
  const [localVersion, setLocalVersion] = useState('');
  const [localAuditTime, setLocalAuditTime] = useState('');
  const [localMaintenanceEnd, setLocalMaintenanceEnd] = useState('');
  const [brandingSaved, setBrandingSaved] = useState(false);

  // ── Security state ───────────────────────────────────────────────────
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinStatus, setPinStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [forceLogoutStatus, setForceLogoutStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isForceLoggingOut, setIsForceLoggingOut] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const pinMatch    = newPin.length === 6 && confirmPin.length === 6 && newPin === confirmPin;
  const pinMismatch = confirmPin.length > 0 && newPin.length > 0 && confirmPin.length === newPin.length && newPin !== confirmPin;
  const confirmState: PinInputProps['state'] = pinMatch ? 'match' : pinMismatch ? 'mismatch' : 'default';

  const fetchConfigs = async () => {
    setIsLoading(true);
    const { data } = await supabase.from(DB_TABLES.SYSTEM_CONFIG).select('*');
    if (data) {
      const map = data.map((d: any) => ({ key: d[DB_COLUMNS.KEY], value: d[DB_COLUMNS.VALUE] }));
      setConfigs(map);
      setLocalAppName(map.find(c => c.key === 'app_name')?.value || 'Hilot Center - Core');
      setLocalVersion(map.find(c => c.key === 'version')?.value || '1.0.0');
      setLocalAuditTime(map.find(c => c.key === 'auto_refresh_daily_audit')?.value || '00:00');
      const rawEnd = map.find(c => c.key === 'maintenance_end_date')?.value || '';
      setLocalMaintenanceEnd(rawEnd ? rawEnd.replace(' ', 'T') : '');
    }
    setIsLoading(false);
  };

  useEffect(() => { fetchConfigs(); }, []);

  const handleUpdate = async (key: string, value: string) => {
    setIsSaving(key);
    try {
      const { error } = await supabase.from(DB_TABLES.SYSTEM_CONFIG)
        .upsert({ [DB_COLUMNS.KEY]: key, [DB_COLUMNS.VALUE]: value }, { onConflict: DB_COLUMNS.KEY });
      if (error) throw error;
      setConfigs(prev => prev.some(c => c.key === key)
        ? prev.map(c => c.key === key ? { ...c, value } : c)
        : [...prev, { key, value }]);
      playSound('success');
      onRefresh?.(true);
    } catch { playSound('warning'); }
    finally { setIsSaving(null); }
  };

  const get = (key: string, fallback = '') => configs.find(c => c.key === key)?.value ?? fallback;
  const bool = (key: string) => get(key, 'false') === 'true';

  const handleSaveBranding = async () => {
    await handleUpdate('app_name', localAppName);
    await handleUpdate('version', localVersion);
    setBrandingSaved(true);
    setTimeout(() => setBrandingSaved(false), 2500);
  };

  const handleUpdatePin = async () => {
    if (!pinMatch) { setPinStatus('error'); playSound('warning'); return; }
    setPinStatus('saving');
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
      setPinStatus('success');
      setNewPin('');
      setConfirmPin('');
      playSound('success');
      setTimeout(() => setPinStatus('idle'), 3000);
    } catch {
      setPinStatus('error');
      playSound('warning');
    }
  };

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

  if (isLoading) return (
    <div className="flex items-center justify-center py-24 opacity-30">
      <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">

      {/* ── Row 1: Security + Branding ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

        {/* Master PIN */}
        <Section title="Security" subtitle="Update the superadmin authentication passcode">
          <div className="px-5 py-5 space-y-5">
            <PinInput label="New PIN" value={newPin} onChange={v => { setNewPin(v); setPinStatus('idle'); }} autoFocus />
            <PinInput
              label="Confirm PIN"
              value={confirmPin}
              onChange={v => { setConfirmPin(v); setPinStatus('idle'); }}
              state={confirmState}
              hint={pinMatch ? '✓ Match' : pinMismatch ? 'Does not match' : undefined}
              hintColor={pinMatch ? 'text-emerald-500' : 'text-rose-500'}
            />
            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="text-[11px]">
                {pinStatus === 'success' && <span className="text-emerald-600 font-bold">✓ PIN updated.</span>}
                {pinStatus === 'error'   && <span className="text-rose-500">Ensure both PINs are 6 digits and match.</span>}
              </div>
              <button
                onClick={handleUpdatePin}
                disabled={pinStatus === 'saving' || !pinMatch}
                className="h-9 px-5 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-30 flex items-center gap-2 shrink-0"
              >
                {pinStatus === 'saving'
                  ? <><div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Saving…</>
                  : 'Update PIN'}
              </button>
            </div>
          </div>
        </Section>

        {/* Branding */}
        <Section title="Branding" subtitle="Network identity across all branch interfaces">
          <Row label="App Name" desc="Displayed in the header and login screen">
            <input value={localAppName} onChange={e => setLocalAppName(e.target.value)}
              className="w-36 sm:w-44 h-9 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-800 outline-none focus:border-emerald-400 focus:bg-white transition-all" />
          </Row>
          <Row label="Build Version" desc="Version string shown in the app footer">
            <input value={localVersion} onChange={e => setLocalVersion(e.target.value)}
              className="w-24 h-9 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-800 outline-none focus:border-emerald-400 focus:bg-white transition-all" />
          </Row>
          <div className="px-5 py-3 flex items-center justify-between border-t border-slate-50">
            <p className="text-[10px] text-slate-400 italic">
              {brandingSaved ? <span className="text-emerald-500 font-bold not-italic">✓ Saved.</span> : 'Applies instantly across connected branches.'}
            </p>
            <button onClick={handleSaveBranding}
              disabled={isSaving === 'app_name' || isSaving === 'version'}
              className="h-9 px-5 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-40">
              Save
            </button>
          </div>
          <div className="px-5 pb-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-slate-700">Font Family</p>
              <p className="text-[10px] text-slate-400">Active: <span className="font-bold text-slate-600">{get('font_family', 'Outfit')}</span></p>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {FONT_OPTIONS.map(font => {
                const active = get('font_family', 'Outfit') === font.value;
                return (
                  <button key={font.value} onClick={() => handleUpdate('font_family', font.value)}
                    className={`py-2 px-3 rounded-xl border-2 text-left transition-all ${active ? 'bg-slate-900 border-slate-900 text-white' : 'bg-slate-50 border-transparent text-slate-500 hover:border-slate-200 hover:bg-white'}`}>
                    <span className="text-[10px] font-bold block truncate" style={{ fontFamily: font.value }}>{font.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Section>

      </div>

      {/* ── Row 2: Maintenance + Features ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

        {/* Maintenance */}
        <Section title="Maintenance" subtitle="Scheduled system operations">
          <Row label="Daily Audit Reset" desc="Branch auto-close time (Manila timezone)">
            <div className="flex items-center gap-2">
              <input type="time" value={localAuditTime} onChange={e => setLocalAuditTime(e.target.value)}
                className="h-9 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-800 outline-none focus:border-emerald-400 focus:bg-white transition-all" />
              <button onClick={() => handleUpdate('auto_refresh_daily_audit', localAuditTime)}
                disabled={isSaving === 'auto_refresh_daily_audit'}
                className="h-9 px-4 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-40">
                {isSaving === 'auto_refresh_daily_audit' ? '…' : 'Save'}
              </button>
            </div>
          </Row>
          <Row
            label="Maintenance Mode"
            desc={bool('maintenance_mode') ? 'Portal is offline — users see the maintenance page' : 'Portal is live'}
          >
            <Toggle
              value={bool('maintenance_mode')}
              onChange={() => handleUpdate('maintenance_mode', bool('maintenance_mode') ? 'false' : 'true')}
              disabled={isSaving === 'maintenance_mode'}
            />
          </Row>
          <div className="px-5 py-4 border-t border-slate-50 space-y-2">
            <div>
              <p className="text-[12px] font-bold text-slate-800 leading-none">End Date / Countdown</p>
              <p className="text-[10px] text-slate-400 mt-1">Optional — shown as countdown on the maintenance page (Manila time)</p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="datetime-local"
                value={localMaintenanceEnd}
                onChange={e => setLocalMaintenanceEnd(e.target.value)}
                className="flex-1 h-9 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-800 outline-none focus:border-emerald-400 focus:bg-white transition-all min-w-0"
              />
              <button
                onClick={() => handleUpdate('maintenance_end_date', localMaintenanceEnd ? localMaintenanceEnd.replace('T', ' ').slice(0, 16) : '')}
                disabled={isSaving === 'maintenance_end_date'}
                className="h-9 px-4 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-40 shrink-0">
                {isSaving === 'maintenance_end_date' ? '…' : 'Set'}
              </button>
              {localMaintenanceEnd && (
                <button
                  onClick={() => { setLocalMaintenanceEnd(''); handleUpdate('maintenance_end_date', ''); }}
                  disabled={isSaving === 'maintenance_end_date'}
                  className="h-9 px-3 rounded-xl bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest hover:bg-rose-50 hover:text-rose-500 active:scale-95 transition-all disabled:opacity-40 shrink-0">
                  Clear
                </button>
              )}
            </div>
          </div>
        </Section>

        {/* Features */}
        <Section title="Features" subtitle="Toggle integrations and announcements">
          <Row label="PayMongo" desc="GCash, Maya, and card payments in POS">
            <Toggle value={bool('paymongo_enabled')}
              onChange={() => handleUpdate('paymongo_enabled', bool('paymongo_enabled') ? 'false' : 'true')}
              disabled={isSaving === 'paymongo_enabled'} />
          </Row>
          <Row label="What's New Banner" desc="Show changelog to branch managers on next login">
            <Toggle value={bool('display_changes')}
              onChange={() => handleUpdate('display_changes', bool('display_changes') ? 'false' : 'true')}
              disabled={isSaving === 'display_changes'} />
          </Row>
        </Section>

      </div>

      {/* ── Row 3: Danger Zone (full width) ── */}
      <Section title="Danger Zone" subtitle="Destructive network-wide actions" accent="text-rose-400">
        <div className="px-5 py-4">
          <div className="flex items-center gap-4 bg-rose-50 rounded-2xl px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-black text-slate-800 leading-none">Force Logout All</p>
              <p className="text-[10px] text-slate-500 mt-1">
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
              className="h-9 px-4 rounded-xl bg-white border border-rose-200 text-rose-600 text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 hover:text-white hover:border-rose-600 active:scale-95 transition-all disabled:opacity-40 flex items-center gap-2 shrink-0"
            >
              {isForceLoggingOut
                ? <div className="w-3 h-3 border-2 border-rose-300 border-t-rose-600 rounded-full animate-spin" />
                : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>}
              Force Logout
            </button>
          </div>
        </div>
      </Section>

      {/* Force logout confirm dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-[28px] shadow-2xl w-full max-w-sm p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div>
              <p className="text-[8px] font-black text-rose-400 uppercase tracking-widest mb-1">Confirm Action</p>
              <p className="text-base font-black text-slate-900 uppercase tracking-tight">Force Logout All?</p>
              <p className="text-[12px] text-slate-500 mt-2 leading-relaxed">
                This will immediately terminate every active session across the entire network. All branches and portal users must re-authenticate. You will remain logged in.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowConfirm(false)}
                className="flex-1 h-10 rounded-2xl border border-slate-200 text-slate-500 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all">
                Cancel
              </button>
              <button onClick={doForceLogout}
                className="flex-1 h-10 rounded-2xl bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 active:scale-95 transition-all">
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface SettingsHubProps {
  onRefresh?: (quiet?: boolean) => void;
}

export const SettingsHub: React.FC<SettingsHubProps> = ({ onRefresh }) => {
  return (
    <div className="max-w-5xl mx-auto">
      <SettingsPanel onRefresh={onRefresh} />
    </div>
  );
};
