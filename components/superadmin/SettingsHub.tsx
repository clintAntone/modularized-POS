
import React, { useState, useRef, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { generateSalt, hashPin } from '../../lib/crypto';
import { playSound } from '../../lib/audio';
import { invalidateGlobalSessions, logAudit } from '../../lib/audit';

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────────

const Section: React.FC<{ title?: string; subtitle?: string; accent?: string; children: React.ReactNode }> = ({ title, subtitle, accent = 'text-slate-400', children }) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
    {title && (
      <div className="px-5 pt-5 pb-3 border-b border-slate-50">
        <p className={`text-xs font-black uppercase tracking-wide ${accent}`}>{title}</p>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    )}
    <div className="divide-y divide-slate-50">
      {children}
    </div>
  </div>
);

const Row: React.FC<{ label: string; desc?: string; children: React.ReactNode }> = ({ label, desc, children }) => (
  <div className="flex items-center gap-4 px-5 py-4">
    <div className="flex-1 min-w-0">
      <p className="text-xs font-bold text-slate-800 leading-none">{label}</p>
      {desc && <p className="text-xs text-slate-400 mt-1 leading-snug">{desc}</p>}
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
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</p>
        {hint && <p className={`text-xs font-bold ${hintColor ?? 'text-slate-400'}`}>{hint}</p>}
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
              className={`flex-1 min-w-0 h-11 rounded-xl border-2 text-center text-lg font-black outline-none transition-all focus:scale-105
                ${filled
                  ? state === 'match'    ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                  : state === 'mismatch' ? 'bg-rose-50 border-rose-400 text-rose-600'
                  : 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 text-slate-900'
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
  const [localHrEmail, setLocalHrEmail] = useState('');

  // ── Custom roles state ───────────────────────────────────────────────
  const [customRoles, setCustomRoles] = useState<string[]>([]);
  const [newRoleName, setNewRoleName] = useState('');
  const [roleError, setRoleError] = useState('');

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
      setLocalHrEmail(map.find(c => c.key === 'hr_email')?.value || '');
      try {
        const raw = map.find(c => c.key === 'custom_roles')?.value;
        setCustomRoles(raw ? JSON.parse(raw) : []);
      } catch { setCustomRoles([]); }
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

  const RESERVED_ROLES = ['THERAPIST', 'BONESETTER', 'MANAGER', 'TRAINEE', 'RELIEVER'];

  const handleAddRole = async () => {
    const name = newRoleName.trim().toUpperCase();
    if (!name) { setRoleError('Enter a role name'); return; }
    if (RESERVED_ROLES.includes(name)) { setRoleError('That name is reserved'); return; }
    if (customRoles.includes(name)) { setRoleError('Role already exists'); return; }
    if (!/^[A-Z0-9 ]+$/.test(name)) { setRoleError('Letters and numbers only'); return; }
    const updated = [...customRoles, name];
    setCustomRoles(updated);
    setNewRoleName('');
    setRoleError('');
    await handleUpdate('custom_roles', JSON.stringify(updated));
  };

  const handleRemoveRole = async (role: string) => {
    const updated = customRoles.filter(r => r !== role);
    setCustomRoles(updated);
    await handleUpdate('custom_roles', JSON.stringify(updated));
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
    <div className="space-y-3 sm:space-y-0 sm:bg-white sm:dark:bg-slate-800 sm:rounded-2xl sm:border sm:border-slate-100 sm:dark:border-slate-700 sm:shadow-sm sm:overflow-hidden">

      {/* ── 1. Security ── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden sm:bg-transparent sm:dark:bg-transparent sm:rounded-none sm:border-0 sm:shadow-none sm:overflow-visible">
      <div className="bg-slate-50 dark:bg-slate-700/50 px-6 py-2.5 border-b border-slate-100 dark:border-slate-700 sm:border-t sm:border-t-slate-100 sm:dark:border-t-slate-700">
        <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500">Security</p>
      </div>
      <div className="px-6 py-5 border-b border-slate-50 dark:border-slate-700">
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="sm:w-52 shrink-0">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Admin PIN</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 leading-snug">SHA-256 salted 6-digit passcode</p>
          </div>
          <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2">
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="New PIN (6 digits)"
              value={newPin}
              onChange={e => { setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setPinStatus('idle'); }}
              className={`w-full sm:w-36 h-10 sm:h-8 px-3 rounded-lg border text-xs font-normal tracking-normal outline-none transition-all bg-slate-50 dark:bg-slate-700 dark:text-slate-100 placeholder:text-slate-400 placeholder:font-normal ${
                newPin.length === 6 && pinMatch ? 'border-emerald-400' : 'border-slate-200 dark:border-slate-600 focus:border-emerald-500'
              }`}
            />
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="Confirm PIN"
              value={confirmPin}
              onChange={e => { setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setPinStatus('idle'); }}
              className={`w-full sm:w-36 h-10 sm:h-8 px-3 rounded-lg border text-xs font-normal tracking-normal outline-none transition-all bg-slate-50 dark:bg-slate-700 dark:text-slate-100 placeholder:text-slate-400 placeholder:font-normal ${
                pinMatch ? 'border-emerald-400' : pinMismatch ? 'border-rose-400' : 'border-slate-200 dark:border-slate-600 focus:border-emerald-500'
              }`}
            />
            <div className="flex items-center gap-2 shrink-0">
              {pinStatus === 'success' && <span className="text-xs text-emerald-600 font-bold whitespace-nowrap">✓ Updated</span>}
              {pinStatus === 'error'   && <span className="text-xs text-rose-500 whitespace-nowrap">No match</span>}
              {pinMismatch && pinStatus === 'idle' && <span className="text-xs text-rose-400 whitespace-nowrap">No match</span>}
              <button
                onClick={handleUpdatePin}
                disabled={pinStatus === 'saving' || !pinMatch}
                className="w-full sm:w-auto h-10 sm:h-8 px-3 rounded-lg bg-slate-900 dark:bg-slate-600 text-white text-xs font-semibold uppercase tracking-wide hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center gap-1.5"
              >
                {pinStatus === 'saving'
                  ? <><div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Saving…</>
                  : 'Update PIN'}
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>{/* end section 2 */}

      {/* ── 3. Maintenance ── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden sm:bg-transparent sm:dark:bg-transparent sm:rounded-none sm:border-0 sm:shadow-none sm:overflow-visible">
      <div className="bg-slate-50 dark:bg-slate-700/50 px-6 py-2.5 border-b border-slate-100 dark:border-slate-700 sm:border-t sm:border-t-slate-100 sm:dark:border-t-slate-700">
        <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500">Maintenance</p>
      </div>
      <div className="divide-y divide-slate-50 dark:divide-slate-700">
        {/* Daily Audit Reset */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-6 py-4">
          <div className="sm:w-52 shrink-0">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Daily Audit Reset</p>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 dark:text-slate-500 leading-snug">Branch auto-close time (Manila timezone)</p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <input type="time" value={localAuditTime} onChange={e => setLocalAuditTime(e.target.value)}
              className="h-9 px-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-normal text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all" />
            <button onClick={() => handleUpdate('auto_refresh_daily_audit', localAuditTime)}
              disabled={isSaving === 'auto_refresh_daily_audit'}
              className="h-9 px-4 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-semibold uppercase tracking-wide hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-40">
              {isSaving === 'auto_refresh_daily_audit' ? '…' : 'Save'}
            </button>
          </div>
        </div>
        {/* Maintenance Mode */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-6 py-4">
          <div className="sm:w-52 shrink-0">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Maintenance Mode</p>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 dark:text-slate-500 leading-snug">
              {bool('maintenance_mode') ? 'Portal is offline — users see the maintenance page' : 'Portal is live'}
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <Toggle
              value={bool('maintenance_mode')}
              onChange={() => handleUpdate('maintenance_mode', bool('maintenance_mode') ? 'false' : 'true')}
              disabled={isSaving === 'maintenance_mode'}
            />
          </div>
        </div>
        {/* End Date / Countdown */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-6 py-4">
          <div className="sm:w-52 shrink-0">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">End Date / Countdown</p>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 dark:text-slate-500 leading-snug">Optional — countdown on the maintenance page</p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <input
              type="datetime-local"
              value={localMaintenanceEnd}
              onChange={e => setLocalMaintenanceEnd(e.target.value)}
              className="h-9 px-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-normal text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all min-w-0"
            />
            <button
              onClick={() => handleUpdate('maintenance_end_date', localMaintenanceEnd ? localMaintenanceEnd.replace('T', ' ').slice(0, 16) : '')}
              disabled={isSaving === 'maintenance_end_date'}
              className="h-9 px-4 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-semibold uppercase tracking-wide hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-40 shrink-0">
              {isSaving === 'maintenance_end_date' ? '…' : 'Set'}
            </button>
            {localMaintenanceEnd && (
              <button
                onClick={() => { setLocalMaintenanceEnd(''); handleUpdate('maintenance_end_date', ''); }}
                disabled={isSaving === 'maintenance_end_date'}
                className="h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-500 active:scale-95 transition-all disabled:opacity-40 shrink-0">
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
      </div>{/* end section 3 */}

      {/* ── 4. Integrations ── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden sm:bg-transparent sm:dark:bg-transparent sm:rounded-none sm:border-0 sm:shadow-none sm:overflow-visible">
      <div className="bg-slate-50 dark:bg-slate-700/50 px-6 py-2.5 border-b border-slate-100 dark:border-slate-700 sm:border-t sm:border-t-slate-100 sm:dark:border-t-slate-700">
        <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500">Integrations</p>
      </div>
      <div className="divide-y divide-slate-50 dark:divide-slate-700">
        {/* PayMongo */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-6 py-4">
          <div className="sm:w-52 shrink-0">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">PayMongo</p>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 dark:text-slate-500 leading-snug">GCash, Maya, and card payments in POS</p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <Toggle value={bool('paymongo_enabled')}
              onChange={() => handleUpdate('paymongo_enabled', bool('paymongo_enabled') ? 'false' : 'true')}
              disabled={isSaving === 'paymongo_enabled'} />
          </div>
        </div>
        {/* HR Email */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-6 py-4">
          <div className="sm:w-52 shrink-0">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">HR Email</p>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 dark:text-slate-500 leading-snug">Notified every time a complaint is filed</p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <input
              type="email"
              value={localHrEmail}
              onChange={e => setLocalHrEmail(e.target.value)}
              placeholder="hr@example.com"
              className="h-9 px-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-normal text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all min-w-0 w-48"
            />
            <button
              onClick={() => handleUpdate('hr_email', localHrEmail.trim())}
              disabled={isSaving === 'hr_email'}
              className="h-9 px-4 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-semibold uppercase tracking-wide hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-40 shrink-0"
            >
              {isSaving === 'hr_email' ? '…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      </div>{/* end section 4 */}

      {/* ── 5. Branding ── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden sm:bg-transparent sm:dark:bg-transparent sm:rounded-none sm:border-0 sm:shadow-none sm:overflow-visible">
      <div className="bg-slate-50 dark:bg-slate-700/50 px-6 py-2.5 border-b border-slate-100 dark:border-slate-700 sm:border-t sm:border-t-slate-100 sm:dark:border-t-slate-700">
        <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500">Branding</p>
      </div>
      <div className="divide-y divide-slate-50 dark:divide-slate-700">
        {/* App Name */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-6 py-4">
          <div className="sm:w-52 shrink-0">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">App Name</p>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 dark:text-slate-500 leading-snug">Displayed in the header and login screen</p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <input value={localAppName} onChange={e => setLocalAppName(e.target.value)}
              className="w-44 h-9 px-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-normal text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all" />
          </div>
        </div>
        {/* Build Version */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-6 py-4">
          <div className="sm:w-52 shrink-0">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Build Version</p>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 dark:text-slate-500 leading-snug">Version string shown in the app footer</p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <input value={localVersion} onChange={e => setLocalVersion(e.target.value)}
              className="w-28 h-9 px-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-normal text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all" />
            <button onClick={handleSaveBranding}
              disabled={isSaving === 'app_name' || isSaving === 'version'}
              className="h-9 px-5 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-semibold uppercase tracking-wide hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-40">
              {brandingSaved ? '✓ Saved' : 'Save'}
            </button>
          </div>
        </div>
        {/* Font Family — full-width row */}
        <div className="px-6 py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="sm:w-52 shrink-0">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Font Family</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 leading-snug">
                Active: <span className="font-bold text-slate-600 dark:text-slate-300">{get('font_family', 'Outfit')}</span>
              </p>
            </div>
            <div className="flex-1 min-w-0">
              <div className="grid grid-cols-4 gap-1.5">
                {FONT_OPTIONS.map(font => {
                  const active = get('font_family', 'Outfit') === font.value;
                  return (
                    <button key={font.value} onClick={() => handleUpdate('font_family', font.value)}
                      className={`py-2 px-2 rounded-xl border-2 text-center transition-all ${active ? 'bg-slate-900 dark:bg-slate-600 border-slate-900 dark:border-slate-500 text-white' : 'bg-slate-50 dark:bg-slate-700/50 border-transparent text-slate-500 dark:text-slate-400 hover:border-slate-200 dark:hover:border-slate-600 hover:bg-white dark:hover:bg-slate-700'}`}>
                      <span className="text-xs font-medium block truncate" style={{ fontFamily: font.value }}>{font.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      </div>{/* end section 5 */}

      {/* ── 6. Custom Roles ── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden sm:bg-transparent sm:dark:bg-transparent sm:rounded-none sm:border-0 sm:shadow-none sm:overflow-visible">
      <div className="bg-slate-50 dark:bg-slate-700/50 px-6 py-2.5 border-b border-slate-100 dark:border-slate-700 sm:border-t sm:border-t-slate-100 sm:dark:border-t-slate-700">
        <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500">Custom Roles</p>
      </div>
      <div className="px-6 py-4 border-b border-slate-50 dark:border-slate-700">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="sm:w-52 shrink-0">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Role Definitions</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 leading-snug">Additional roles admin can assign to specific staff</p>
          </div>
          <div className="flex-1 space-y-3">
            {customRoles.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic">No custom roles defined yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {customRoles.map(role => (
                  <div key={role} className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-xl">
                    <span className="text-xs font-medium text-violet-700 dark:text-violet-400 uppercase tracking-wide">{role}</span>
                    <button
                      onClick={() => handleRemoveRole(role)}
                      disabled={isSaving === 'custom_roles'}
                      className="w-4 h-4 flex items-center justify-center text-violet-400 dark:text-violet-500 hover:text-rose-500 transition-colors"
                    >
                      <X className="w-3 h-3" strokeWidth={3} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={newRoleName}
                onChange={e => { setNewRoleName(e.target.value); setRoleError(''); }}
                onKeyDown={e => { if (e.key === 'Enter') handleAddRole(); }}
                placeholder="e.g. RECEPTIONIST"
                className="flex-1 h-9 px-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 uppercase outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400/20 transition-all placeholder:normal-case placeholder:font-normal placeholder:text-slate-400"
              />
              <button
                onClick={handleAddRole}
                disabled={isSaving === 'custom_roles'}
                className="h-9 px-3 rounded-xl bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={3} />
                Add
              </button>
            </div>
            {roleError && <p className="text-xs font-bold text-rose-500">{roleError}</p>}
          </div>
        </div>
      </div>
      </div>{/* end section 6 */}


      {/* ── 8. Danger Zone ── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-rose-100 dark:border-rose-900/40 shadow-sm overflow-hidden sm:bg-transparent sm:dark:bg-transparent sm:rounded-none sm:border-0 sm:shadow-none sm:overflow-visible">
      <div className="bg-rose-50 dark:bg-rose-950/20 px-6 py-2.5 border-b border-rose-100 dark:border-rose-900/40 sm:border-t sm:border-t-rose-100 sm:dark:border-t-rose-900/40">
        <p className="text-[10px] font-medium uppercase tracking-widest text-rose-400 dark:text-rose-500">Danger Zone</p>
      </div>
      <div className="bg-rose-50 dark:bg-rose-950/20">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-6 py-4">
          <div className="sm:w-52 shrink-0">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Force Logout All</p>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 dark:text-slate-500 leading-snug">
              {forceLogoutStatus === 'success'
                ? <span className="text-emerald-600 dark:text-emerald-400 font-bold">Signal broadcasted — all sessions terminated.</span>
                : forceLogoutStatus === 'error'
                ? <span className="text-rose-500 font-bold">Broadcast failed. Try again.</span>
                : 'Terminates every active session across the network.'}
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <button
              onClick={() => setShowConfirm(true)}
              disabled={isForceLoggingOut}
              className="h-9 px-4 rounded-xl bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs font-semibold uppercase tracking-wide hover:bg-rose-600 hover:text-white hover:border-rose-600 dark:hover:bg-rose-700 dark:hover:border-rose-700 dark:hover:text-white active:scale-95 transition-all disabled:opacity-40 flex items-center gap-2 shrink-0"
            >
              {isForceLoggingOut
                ? <div className="w-3 h-3 border-2 border-rose-300 border-t-rose-600 rounded-full animate-spin" />
                : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>}
              Force Logout
            </button>
          </div>
        </div>
      </div>
      </div>{/* end section 8 */}

      {/* Force logout confirm dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div>
              <p className="text-xs font-black text-rose-400 uppercase tracking-widest mb-1">Confirm Action</p>
              <p className="text-base font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">Force Logout All?</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                This will immediately terminate every active session across the entire network. All branches and portal users must re-authenticate. You will remain logged in.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowConfirm(false)}
                className="flex-1 h-10 rounded-2xl border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">
                Cancel
              </button>
              <button onClick={doForceLogout}
                className="flex-1 h-10 rounded-2xl bg-rose-600 text-white text-xs font-semibold uppercase tracking-wide hover:bg-rose-700 active:scale-95 transition-all">
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
    <div>
      <SettingsPanel onRefresh={onRefresh} />
    </div>
  );
};
