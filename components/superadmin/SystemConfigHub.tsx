
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { playSound } from '../../lib/audio';

interface ConfigItem { key: string; value: string; }

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

interface SystemConfigHubProps { onRefresh?: (quiet?: boolean) => void; }

// Toggle
const Toggle: React.FC<{ value: boolean; onChange: () => void; disabled?: boolean }> = ({ value, onChange, disabled }) => (
  <button onClick={onChange} disabled={disabled}
    className={`relative rounded-full transition-all duration-300 disabled:opacity-40 shrink-0 ${value ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-slate-200'}`}
    style={{ height: '24px', width: '44px' }}>
    <span className={`absolute top-[3px] w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-all duration-300 ${value ? 'left-[23px]' : 'left-[3px]'}`} />
  </button>
);

// Section card
const Section: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <div className="bg-white rounded-[28px] border border-slate-100 shadow-sm p-5 sm:p-6 space-y-4">
    <div>
      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
      {subtitle && <p className="text-[11px] text-slate-500 mt-1">{subtitle}</p>}
    </div>
    {children}
  </div>
);

// Row inside a section
const Row: React.FC<{ label: string; desc?: string; children: React.ReactNode }> = ({ label, desc, children }) => (
  <div className="flex items-center gap-4 py-3 border-t border-slate-50">
    <div className="flex-1 min-w-0">
      <p className="text-[12px] font-bold text-slate-800">{label}</p>
      {desc && <p className="text-[10px] text-slate-400 mt-0.5">{desc}</p>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

export const SystemConfigHub: React.FC<SystemConfigHubProps> = ({ onRefresh }) => {
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [localAppName, setLocalAppName] = useState('');
  const [localVersion, setLocalVersion] = useState('');
  const [localAuditTime, setLocalAuditTime] = useState('');
  const [localMaintenanceEnd, setLocalMaintenanceEnd] = useState('');
  const [brandingSaved, setBrandingSaved] = useState(false);

  const fetchConfigs = async () => {
    setIsLoading(true);
    const { data } = await supabase.from(DB_TABLES.SYSTEM_CONFIG).select('*');
    if (data) {
      const map = data.map((d: any) => ({ key: d[DB_COLUMNS.KEY], value: d[DB_COLUMNS.VALUE] }));
      setConfigs(map);
      setLocalAppName(map.find(c => c.key === 'app_name')?.value || 'Hilot Center - Core');
      setLocalVersion(map.find(c => c.key === 'version')?.value || '1.0.0');
      setLocalAuditTime(map.find(c => c.key === 'auto_refresh_daily_audit')?.value || '00:00');
      // "YYYY-MM-DD HH:MM" → datetime-local needs "YYYY-MM-DDTHH:MM"
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

  if (isLoading) return (
    <div className="flex items-center justify-center py-24 opacity-30">
      <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">

      {/* Maintenance */}
      <Section title="Maintenance" subtitle="Scheduled system operations">
        <Row label="Daily Audit Reset" desc="Branch auto-close time (Manila timezone)">
          <div className="flex items-center gap-2">
            <input type="time" value={localAuditTime} onChange={e => setLocalAuditTime(e.target.value)}
              className="h-9 px-3 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-bold text-slate-800 outline-none focus:border-emerald-400 focus:bg-white transition-all" />
            <button onClick={() => handleUpdate('auto_refresh_daily_audit', localAuditTime)}
              disabled={isSaving === 'auto_refresh_daily_audit'}
              className="h-9 px-4 rounded-2xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-40 shadow-sm">
              {isSaving === 'auto_refresh_daily_audit' ? '…' : 'Sync'}
            </button>
          </div>
        </Row>

        <Row
          label="Maintenance Mode"
          desc={bool('maintenance_mode') ? 'Portal is currently offline — users see the maintenance page' : 'Portal is live'}
        >
          <Toggle
            value={bool('maintenance_mode')}
            onChange={() => handleUpdate('maintenance_mode', bool('maintenance_mode') ? 'false' : 'true')}
            disabled={isSaving === 'maintenance_mode'}
          />
        </Row>

        <Row label="Maintenance End Date" desc="Optional countdown shown to users (Manila time)">
          <div className="flex items-center gap-2">
            <input
              type="datetime-local"
              value={localMaintenanceEnd}
              onChange={e => setLocalMaintenanceEnd(e.target.value)}
              className="h-9 px-3 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-bold text-slate-800 outline-none focus:border-emerald-400 focus:bg-white transition-all"
            />
            <button
              onClick={() => {
                // Save as "YYYY-MM-DD HH:MM" (replace T back to space, drop seconds if present)
                const val = localMaintenanceEnd
                  ? localMaintenanceEnd.replace('T', ' ').slice(0, 16)
                  : '';
                handleUpdate('maintenance_end_date', val);
              }}
              disabled={isSaving === 'maintenance_end_date'}
              className="h-9 px-4 rounded-2xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-40 shadow-sm">
              {isSaving === 'maintenance_end_date' ? '…' : 'Set'}
            </button>
            {localMaintenanceEnd && (
              <button
                onClick={() => { setLocalMaintenanceEnd(''); handleUpdate('maintenance_end_date', ''); }}
                disabled={isSaving === 'maintenance_end_date'}
                className="h-9 px-3 rounded-2xl bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-50 hover:text-red-500 active:scale-95 transition-all disabled:opacity-40">
                Clear
              </button>
            )}
          </div>
        </Row>
      </Section>

      {/* Branding */}
      <Section title="Branding" subtitle="Network identity across all branch interfaces">
        <Row label="Application Name" desc="Displayed in the app header and login screen">
          <input value={localAppName} onChange={e => setLocalAppName(e.target.value)}
            className="w-40 sm:w-48 h-9 px-3 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-bold text-slate-800 outline-none focus:border-emerald-400 focus:bg-white transition-all" />
        </Row>
        <Row label="Build Version" desc="Version string shown in the app footer">
          <input value={localVersion} onChange={e => setLocalVersion(e.target.value)}
            className="w-24 h-9 px-3 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-bold text-slate-800 outline-none focus:border-emerald-400 focus:bg-white transition-all" />
        </Row>
        <div className="flex items-center justify-between pt-3 border-t border-slate-50">
          <p className="text-[10px] text-slate-400 italic">
            {brandingSaved ? <span className="text-emerald-500 font-bold not-italic">✓ Saved.</span> : 'Changes apply instantly across connected branches.'}
          </p>
          <button onClick={handleSaveBranding}
            disabled={isSaving === 'app_name' || isSaving === 'version'}
            className="h-9 px-5 rounded-2xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-40 shadow-sm">
            Save Branding
          </button>
        </div>

        {/* Font picker */}
        <div className="pt-3 border-t border-slate-50 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-bold text-slate-800">Font Family</p>
            <p className="text-[10px] text-slate-400">Active: <span className="font-bold text-slate-600">{get('font_family', 'Outfit')}</span></p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {FONT_OPTIONS.map(font => {
              const active = get('font_family', 'Outfit') === font.value;
              return (
                <button key={font.value} onClick={() => handleUpdate('font_family', font.value)}
                  className={`py-2 px-2 rounded-2xl border-2 text-center transition-all ${active ? 'bg-slate-900 border-slate-900 text-white shadow-sm' : 'bg-slate-50 border-transparent text-slate-500 hover:border-slate-200 hover:bg-white'}`}>
                  <span className="text-[10px] font-bold block truncate" style={{ fontFamily: font.value }}>{font.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Section>

      {/* Integrations */}
      <Section title="Integrations" subtitle="Third-party service connections">
        <Row label="PayMongo" desc="Enables GCash, Maya, and card payments in POS">
          <Toggle value={bool('paymongo_enabled')}
            onChange={() => handleUpdate('paymongo_enabled', bool('paymongo_enabled') ? 'false' : 'true')}
            disabled={isSaving === 'paymongo_enabled'} />
        </Row>
      </Section>


    </div>
  );
};
