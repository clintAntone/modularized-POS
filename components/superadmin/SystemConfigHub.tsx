
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { playSound } from '../../lib/audio';

interface ConfigItem {
  key: string;
  value: string;
}

const FONT_OPTIONS = [
  { name: 'Outfit', value: 'Outfit' },
  { name: 'Inter', value: 'Inter' },
  { name: 'Space Grotesk', value: 'Space Grotesk' },
  { name: 'Playfair Display', value: 'Playfair Display' },
  { name: 'JetBrains Mono', value: 'JetBrains Mono' },
  { name: 'Montserrat', value: 'Montserrat' },
  { name: 'Lexend', value: 'Lexend' },
  { name: 'Plus Jakarta Sans', value: 'Plus Jakarta Sans' }
];

interface SystemConfigHubProps {
  onRefresh?: (quiet?: boolean) => void;
}

export const SystemConfigHub: React.FC<SystemConfigHubProps> = ({ onRefresh }) => {
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState<string | null>(null);
  
  // Local form state to prevent lag
  const [localAppName, setLocalAppName] = useState('');
  const [localVersion, setLocalVersion] = useState('');
  const [localAuditTime, setLocalAuditTime] = useState('');

  const fetchConfigs = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from(DB_TABLES.SYSTEM_CONFIG).select('*');
    if (data) {
      const configMap = data.map((d: any) => ({ key: d[DB_COLUMNS.KEY], value: d[DB_COLUMNS.VALUE] }));
      setConfigs(configMap);
      
      // Initialize local state
      const appName = configMap.find(c => c.key === 'app_name')?.value || 'Hilot Center - Core';
      const version = configMap.find(c => c.key === 'version')?.value || '1.0.0';
      const auditTime = configMap.find(c => c.key === 'auto_refresh_daily_audit')?.value || '00:00';
      
      setLocalAppName(appName);
      setLocalVersion(version);
      setLocalAuditTime(auditTime);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const handleUpdate = async (key: string, value: string) => {
    setIsSaving(key);
    try {
      const { error } = await supabase
        .from(DB_TABLES.SYSTEM_CONFIG)
        .upsert({ [DB_COLUMNS.KEY]: key, [DB_COLUMNS.VALUE]: value }, { onConflict: DB_COLUMNS.KEY });
      
      if (error) throw error;
      
      setConfigs(prev => {
        const exists = prev.some(c => c.key === key);
        if (exists) {
          return prev.map(c => c.key === key ? { ...c, value } : c);
        }
        return [...prev, { key, value }];
      });
      playSound('success');
      if (onRefresh) onRefresh(true);
    } catch (err) {
      playSound('warning');
    } finally {
      setIsSaving(null);
    }
  };

  const getConfigValue = (key: string, fallback: string) => {
    return configs.find(c => c.key === key)?.value || fallback;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 opacity-30">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin mb-4"></div>
        <p className="text-[10px] font-bold uppercase tracking-widest">Accessing Mainframe...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6 animate-in fade-in duration-500 pb-32">
      {/* SYSTEM HEARTBEAT CARD */}
      <div className="bg-white p-6 sm:p-8 md:p-10 rounded-[32px] sm:rounded-[44px] border border-slate-100 shadow-sm space-y-6 sm:space-y-8">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-600 text-white rounded-xl sm:rounded-2xl flex items-center justify-center text-lg sm:text-xl shadow-lg">🕛</div>
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 uppercase tracking-tighter">Maintenance Heartbeat</h3>
            <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-widest">Scheduled Daily Branch Refresh</p>
          </div>
        </div>

        <div className="p-4 sm:p-6 bg-slate-50 rounded-[24px] sm:rounded-[32px] border border-slate-100 space-y-4 sm:space-y-6">
          <div className="space-y-2">
            <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Daily Audit Reset Time (Manila)</label>
            <div className="flex gap-2 sm:gap-3">
              <input 
                type="time"
                value={localAuditTime}
                onChange={(e) => setLocalAuditTime(e.target.value)}
                className="flex-1 p-4 sm:p-5 bg-white border-2 border-transparent rounded-xl sm:rounded-2xl font-bold text-lg sm:text-xl outline-none focus:border-emerald-500 transition-all shadow-sm"
              />
              <button 
                onClick={() => handleUpdate('auto_refresh_daily_audit', localAuditTime)}
                disabled={isSaving === 'auto_refresh_daily_audit'}
                className="bg-slate-900 px-4 sm:px-6 flex items-center justify-center rounded-xl sm:rounded-2xl shrink-0 hover:bg-slate-800 transition-colors active:scale-95"
              >
                 {isSaving === 'auto_refresh_daily_audit' ? (
                   <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                 ) : (
                   <span className="text-[8px] sm:text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Sync</span>
                 )}
              </button>
            </div>
          </div>
          <p className="text-[8px] sm:text-[9px] font-medium text-slate-400 leading-relaxed italic px-2 uppercase">
            Note: The system force-closes branches daily to ensure ledger integrity.
          </p>
        </div>
      </div>

      {/* CORE BRANDING CARD */}
      <div className="bg-white p-6 sm:p-8 md:p-10 rounded-[32px] sm:rounded-[44px] border border-slate-100 shadow-sm space-y-6 sm:space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-900 text-white rounded-xl sm:rounded-2xl flex items-center justify-center text-lg sm:text-xl shadow-lg">🏷️</div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 uppercase tracking-tighter">Network Branding</h3>
              <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-widest">Global Branch Identity</p>
            </div>
          </div>
          <button 
            onClick={async () => {
              await handleUpdate('app_name', localAppName);
              await handleUpdate('version', localVersion);
            }}
            disabled={isSaving === 'app_name' || isSaving === 'version'}
            className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95"
          >
            {isSaving === 'app_name' || isSaving === 'version' ? 'Saving...' : 'Save Branding'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           <div className="space-y-2">
              <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Application Name</label>
              <input 
                value={localAppName}
                onChange={(e) => setLocalAppName(e.target.value)}
                className="w-full p-3 sm:p-4 bg-slate-50 border-2 border-transparent rounded-xl sm:rounded-2xl font-bold text-[10px] sm:text-xs uppercase outline-none focus:border-indigo-500 transition-all shadow-inner"
              />
           </div>
           <div className="space-y-2">
              <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Build Version</label>
              <input 
                value={localVersion}
                onChange={(e) => setLocalVersion(e.target.value)}
                className="w-full p-3 sm:p-4 bg-slate-50 border-2 border-transparent rounded-xl sm:rounded-2xl font-bold text-[10px] sm:text-xs uppercase outline-none focus:border-indigo-500 transition-all shadow-inner"
              />
           </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-slate-50">
           <div className="space-y-2">
              <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Global Typography (Font Family)</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                 {FONT_OPTIONS.map(font => (
                   <button
                     key={font.value}
                     onClick={() => handleUpdate('font_family', font.value)}
                     className={`p-2.5 sm:p-3 rounded-lg sm:rounded-xl border-2 transition-all text-center ${getConfigValue('font_family', 'Outfit') === font.value ? 'bg-slate-900 border-slate-900 text-white shadow-md' : 'bg-slate-50 border-transparent text-slate-400 hover:border-slate-200'}`}
                   >
                     <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-tighter" style={{ fontFamily: font.value }}>{font.name}</span>
                   </button>
                 ))}
              </div>
              <p className="text-[8px] font-medium text-slate-400 italic px-1 uppercase">Changes apply instantly across all connected branches.</p>
           </div>
        </div>
      </div>

      {/* PAYMENT GATEWAY CARD */}
      <div className="bg-white p-6 sm:p-8 md:p-10 rounded-[32px] sm:rounded-[44px] border border-slate-100 shadow-sm space-y-6 sm:space-y-8">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-50 text-emerald-600 rounded-xl sm:rounded-2xl flex items-center justify-center text-lg sm:text-xl shadow-inner">💳</div>
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 uppercase tracking-tighter">Payment Gateway</h3>
            <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-widest">Digital Settlement Configuration</p>
          </div>
        </div>

        <div className="p-6 bg-slate-50 rounded-[32px] border border-slate-100 flex items-center justify-between">
          <div className="space-y-1">
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight">PayMongo Integration</h4>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Enable GCash, Maya, and Card Payments</p>
          </div>
          <button
            onClick={() => handleUpdate('paymongo_enabled', getConfigValue('paymongo_enabled', 'false') === 'true' ? 'false' : 'true')}
            className={`w-14 h-8 rounded-full transition-all relative ${getConfigValue('paymongo_enabled', 'false') === 'true' ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]' : 'bg-slate-300'}`}
          >
            <div className={`absolute top-1.5 w-5 h-5 bg-white rounded-full transition-all ${getConfigValue('paymongo_enabled', 'false') === 'true' ? 'left-7.5' : 'left-1.5'}`}></div>
          </button>
        </div>
        <p className="text-[8px] font-medium text-slate-400 leading-relaxed italic px-2 uppercase">
          Note: Disabling PayMongo will hide the digital payment option from all POS branches.
        </p>
      </div>
    </div>
  );
};
