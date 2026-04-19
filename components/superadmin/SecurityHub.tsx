
import React, { useState } from 'react';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { supabase } from '../../lib/supabase';
import { generateSalt, hashPin } from '../../lib/crypto';
import { playSound } from '../../lib/audio';

export const SecurityHub: React.FC = () => {
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  const [isForceLoggingOut, setIsForceLoggingOut] = useState(false);

  const handleGlobalForceLogout = async () => {
    if (!window.confirm('FORCE LOGOUT ALL SESSIONS?\n\nThis will immediately terminate every active session across the entire network, including all branches and other administrators. You will remain logged in, but all others must re-authenticate.')) {
      return;
    }

    setIsForceLoggingOut(true);
    try {
      const { data: configData } = await supabase.from(DB_TABLES.SYSTEM_CONFIG).select('*').eq(DB_COLUMNS.KEY, 'force_logout_registry').single();
      let registry: Record<string, number> = {};
      if (configData) {
        try { registry = JSON.parse(configData.value); } catch {}
      }
      registry['GLOBAL'] = Date.now();
      
      const { error } = await supabase.from(DB_TABLES.SYSTEM_CONFIG).upsert({
        [DB_COLUMNS.KEY]: 'force_logout_registry',
        [DB_COLUMNS.VALUE]: JSON.stringify(registry)
      }, { onConflict: DB_COLUMNS.KEY });
      
      if (error) throw error;

      await supabase.from(DB_TABLES.AUDIT_LOGS).insert({
        [DB_COLUMNS.BRANCH_ID]: null,
        [DB_COLUMNS.TIMESTAMP]: new Date().toISOString(),
        [DB_COLUMNS.ACTIVITY_TYPE]: 'UPDATE',
        [DB_COLUMNS.ENTITY_TYPE]: 'SECURITY',
        [DB_COLUMNS.DESCRIPTION]: 'Global Network Session Termination triggered by SuperAdmin.',
        [DB_COLUMNS.PERFORMER_NAME]: 'SYSTEM ADMIN'
      });

      playSound('success');
      alert('Global Logout Signal Broadcasted.');
    } catch (err) {
      playSound('warning');
      alert('Failed to broadcast signal.');
    } finally {
      setIsForceLoggingOut(false);
    }
  };

  const handleUpdateMasterPin = async () => {
    if (newPin.length !== 6 || newPin !== confirmPin) { 
      setStatus('error'); 
      playSound('warning');
      return; 
    }
    
    setStatus('saving');
    try {
      // 1. GENERATE SECURE SALT & HASH
      const salt = generateSalt();
      const hash = await hashPin(newPin, salt);

      // 2. ATOMIC UPSERT TO SYSTEM CONFIG
      // We use upsert to ensure the salt key is created if it doesn't exist
      const { error } = await supabase
        .from(DB_TABLES.SYSTEM_CONFIG)
        .upsert([
          { [DB_COLUMNS.KEY]: 'master_admin_pin', [DB_COLUMNS.VALUE]: hash },
          { [DB_COLUMNS.KEY]: 'master_admin_pin_salt', [DB_COLUMNS.VALUE]: salt }
        ], { onConflict: DB_COLUMNS.KEY });
      
      if (error) throw error;

      // 3. RECORD GLOBAL AUDIT
      await supabase.from(DB_TABLES.AUDIT_LOGS).insert({
        [DB_COLUMNS.BRANCH_ID]: null,
        [DB_COLUMNS.TIMESTAMP]: new Date().toISOString(),
        [DB_COLUMNS.ACTIVITY_TYPE]: 'UPDATE',
        [DB_COLUMNS.ENTITY_TYPE]: 'SECURITY',
        [DB_COLUMNS.DESCRIPTION]: 'Master Authorization Key updated with SHA-256 salted encryption.',
        [DB_COLUMNS.PERFORMER_NAME]: 'SYSTEM ADMIN'
      });

      setStatus('success'); 
      setNewPin(''); 
      setConfirmPin('');
      playSound('success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) { 
      setStatus('error'); 
      playSound('warning');
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 sm:p-10 bg-white rounded-[32px] sm:rounded-[56px] border border-slate-100 shadow-sm space-y-6 sm:space-y-8 animate-in fade-in duration-500">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 sm:w-16 sm:h-16 bg-slate-900 text-white rounded-2xl sm:rounded-3xl flex items-center justify-center mx-auto text-xl sm:text-2xl mb-2 sm:mb-4 shadow-lg">🔐</div>
        <h3 className="text-xl sm:text-2xl font-bold text-slate-900 uppercase tracking-tighter">Master Security Settings</h3>
        <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Update the SuperAdmin Login Passcode</p>
      </div>
      <div className="space-y-4 sm:space-y-6">
        <div className="space-y-2">
          <label className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">New Master PIN (6 Digits)</label>
          <input 
            type="password" 
            maxLength={6} 
            value={newPin} 
            onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))} 
            placeholder="••••••" 
            className="w-full p-4 sm:p-6 bg-slate-50 border-2 border-transparent rounded-[16px] sm:rounded-[24px] text-center text-2xl sm:text-4xl font-bold tracking-[0.5em] focus:border-indigo-500 outline-none transition-all shadow-inner" 
          />
        </div>
        <div className="space-y-2">
          <label className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Confirm Master PIN</label>
          <input 
            type="password" 
            maxLength={6} 
            value={confirmPin} 
            onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))} 
            placeholder="••••••" 
            className="w-full p-4 sm:p-6 bg-slate-50 border-2 border-transparent rounded-[16px] sm:rounded-[24px] text-center text-2xl sm:text-4xl font-bold tracking-[0.5em] focus:border-indigo-500 outline-none transition-all shadow-inner" 
          />
        </div>
        
        {status === 'success' && (
          <div className="p-3 sm:p-4 bg-emerald-50 text-emerald-600 rounded-xl sm:rounded-2xl text-center text-[9px] sm:text-[10px] font-bold uppercase tracking-widest border border-emerald-100 animate-in slide-in-from-top-2">
            Master Registry Encrypted Successfully
          </div>
        )}
        
        {status === 'error' && (
          <div className="p-3 sm:p-4 bg-rose-50 text-rose-600 rounded-xl sm:rounded-2xl text-center text-[9px] sm:text-[10px] font-bold uppercase tracking-widest border border-rose-100 animate-in shake duration-300">
            Authorization Failed: Check Input Length
          </div>
        )}

        <button 
          onClick={handleUpdateMasterPin} 
          disabled={status === 'saving' || newPin.length !== 6} 
          className="w-full py-5 sm:py-7 bg-slate-900 text-white rounded-[20px] sm:rounded-[32px] font-bold uppercase tracking-widest text-[10px] sm:text-[11px] shadow-2xl hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-3"
        >
          {status === 'saving' ? (
            <>
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              <span>SALTING & ENCRYPTING...</span>
            </>
          ) : 'Update Master Authorization'}
        </button>
      </div>

      <div className="pt-6 sm:pt-10 border-t border-slate-100 space-y-4 sm:space-y-6">
        <div className="text-center space-y-1 sm:space-y-2">
          <h4 className="text-xs sm:text-sm font-bold text-rose-600 uppercase tracking-widest">Danger Zone</h4>
          <p className="text-[8px] sm:text-[9px] font-medium text-slate-400 uppercase tracking-widest leading-relaxed">Emergency Network-Wide Session Termination</p>
        </div>
        <button 
          onClick={handleGlobalForceLogout}
          disabled={isForceLoggingOut}
          className="w-full py-5 sm:py-6 bg-rose-50 text-rose-600 rounded-[20px] sm:rounded-[32px] font-bold uppercase tracking-widest text-[10px] sm:text-[11px] border-2 border-rose-100 hover:bg-rose-600 hover:text-white transition-all active:scale-[0.98] flex items-center justify-center gap-3"
        >
          {isForceLoggingOut ? <div className="w-4 h-4 border-2 border-rose-200 border-t-rose-600 rounded-full animate-spin"></div> : '📡'}
          <span>Force Logout All Active Sessions</span>
        </button>
      </div>
    </div>
  );
};
