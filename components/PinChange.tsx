
import React, { useState, useEffect, useMemo } from 'react';
import { Branch, Employee } from '../types';
import { DB_TABLES, DB_COLUMNS } from '../constants/db_schema';
import { supabase } from '../lib/supabase';
import { playSound } from '../lib/audio';
import { generateSalt, hashPin } from '../lib/crypto';
import { getTrueISOString } from '../lib/time';

const ROLE_ORDER = ['MANAGER', 'THERAPIST', 'BONESETTER', 'TRAINEE'];

const RoleBadge = ({ role, centered = false }: { role: string, centered?: boolean }) => {
  const styles: Record<string, string> = {
    MANAGER: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    THERAPIST: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    BONESETTER: 'bg-amber-50 text-amber-700 border-amber-100',
    TRAINEE: 'bg-slate-50 text-slate-500 border-slate-100'
  };
  
  const roles = (role || '').split(',')
    .filter(Boolean)
    .sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
    
  return (
    <div className={`flex flex-wrap gap-1 ${centered ? 'justify-center' : ''}`}>
      {roles.map(r => (
        <span key={r} className={`px-2 py-0.5 rounded-lg text-xs font-semibold uppercase tracking-wide border ${styles[r] || styles.TRAINEE}`}>
          {r}
        </span>
      ))}
    </div>
  );
};

interface ProfileSetupProps {
  branch: Branch;
  employee?: Employee; // Prop to pass the specific logged in employee
  providedPin?: string;
  onSetupComplete: (updatedBranch: Branch) => void;
  onRefresh?: (quiet?: boolean) => void;
  onCancel?: () => void;
}

const ProfileSetup: React.FC<ProfileSetupProps> = ({ branch, employee: initialEmployee, onSetupComplete, onRefresh, onCancel, providedPin }) => {
  const [username, setUsername] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [identifiedManager, setIdentifiedManager] = useState<Employee | null>(initialEmployee || null);
  const [isSyncingIdentity, setIsSyncingIdentity] = useState(!initialEmployee);
  const [useExistingAccount, setUseExistingAccount] = useState(false);

  const hasExistingAccount = useMemo(() => {
    return !!(identifiedManager?.hasPinSet || (identifiedManager as any)?.login_pin);
  }, [identifiedManager]);

  useEffect(() => {
    if (hasExistingAccount) {
      setUseExistingAccount(true);
      if (identifiedManager?.username) setUsername(identifiedManager.username);
    }
  }, [hasExistingAccount, identifiedManager]);

  const isRelief = useMemo(() => {
    if (!identifiedManager || !branch.tempManager) return false;
    const isPrimary = branch.manager?.toUpperCase().trim() === identifiedManager.name.toUpperCase().trim();
    const isTemp = branch.tempManager.toUpperCase().trim() === identifiedManager.name.toUpperCase().trim();
    return !isPrimary && isTemp;
  }, [identifiedManager, branch.tempManager, branch.manager]);

  const fetchIdentifiedManager = async (forceRefresh = false) => {
    setIsSyncingIdentity(true);
    setError('');
    try {
      if (forceRefresh && onRefresh) {
        await onRefresh(true);
      }

      const managerName = branch.manager?.toUpperCase().trim();
      if (!managerName) {
          setError('System Error: No manager assigned to this node.');
          return;
      }

      const { data, error: fetchError } = await supabase
          .from(DB_TABLES.EMPLOYEES)
          .select('id, name, username')
          .eq(DB_COLUMNS.NAME, managerName)
          .maybeSingle();
      
      if (fetchError) throw fetchError;
      
      if (data) {
          setIdentifiedManager(data);
          if (data.username) setUsername(data.username);
          setError('');
      } else {
          setError(`Identity Mismatch: Record not found in global registry.`);
      }
    } catch (err) {
      setError('Connection Fault: Failed to verify node assignment.');
    } finally {
      setIsSyncingIdentity(false);
    }
  };

  useEffect(() => {
    if (initialEmployee) {
        setIdentifiedManager(initialEmployee);
        if (initialEmployee.username) setUsername(initialEmployee.username);
        setIsSyncingIdentity(false);
        setError('');
        return;
    }

    fetchIdentifiedManager();
  }, [branch.id, branch.manager, initialEmployee]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || !identifiedManager) return;
    setError('');

    if (username.length < 2) {
      setError('Username too short.');
      return;
    }

    // Restrict special characters in username
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(username.trim())) {
      setError('Username can only contain letters, numbers, and underscores.');
      return;
    }

    if (!useExistingAccount) {
        if (newPin.length !== 6) {
          setError('PIN must be exactly 6 digits.');
          return;
        }

        if (newPin !== confirmPin) {
          setError('PINs do not match.');
          return;
        }
    }
    
    setIsSaving(true);
    try {
      if (!useExistingAccount) {
          const { data: existing } = await supabase
            .from(DB_TABLES.EMPLOYEES)
            .select('id')
            .eq(DB_COLUMNS.USERNAME, username.trim().toLowerCase());
          
          if (existing && existing.length > 0 && existing.some(ext => ext.id !== identifiedManager.id)) {
              setError('Username already claimed in the global network.');
              setIsSaving(false);
              return;
          }

          // ENCRYPT CREDENTIALS
          const salt = generateSalt();
          const hash = await hashPin(newPin, salt);

          const { error: empError } = await supabase
            .from(DB_TABLES.EMPLOYEES)
            .update({ 
              [DB_COLUMNS.USERNAME]: username.trim().toLowerCase(), 
              [DB_COLUMNS.LOGIN_PIN]: hash,
              [DB_COLUMNS.PIN_SALT]: salt,
              [DB_COLUMNS.REQUEST_RESET]: false 
            })
            .eq(DB_COLUMNS.ID, identifiedManager.id);

          if (empError) throw empError;
      }

      // Only set branch as setup if it was a setup mode login (no PIN changed yet)
      if (!branch.isPinChanged) {
          const { error: dbError } = await supabase
            .from(DB_TABLES.BRANCHES)
            .update({ [DB_COLUMNS.IS_PIN_CHANGED]: true })
            .eq(DB_COLUMNS.ID, branch.id);

          if (dbError) throw dbError;
      }

      // RECORD AUDIT
      await supabase.from(DB_TABLES.AUDIT_LOGS).insert({
        [DB_COLUMNS.BRANCH_ID]: branch.id,
        [DB_COLUMNS.TIMESTAMP]: getTrueISOString(),
        [DB_COLUMNS.ACTIVITY_TYPE]: 'UPDATE',
        [DB_COLUMNS.ENTITY_TYPE]: 'SECURITY',
        [DB_COLUMNS.DESCRIPTION]: `Secure identity update complete for ${isRelief ? 'Relief' : 'Node'} Manager ${identifiedManager.name} (user: ${username})`,
        [DB_COLUMNS.PERFORMER_NAME]: identifiedManager.name
      });

      playSound('success');
      onSetupComplete({ ...branch, isPinChanged: true });
    } catch (err) {
      setError('Identity Sync Failed. Try again.');
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-emerald-500/5 blur-[120px] rounded-full -top-[20%] -left-[10%]"></div>
      <div className="absolute inset-0 bg-indigo-500/5 blur-[120px] rounded-full -bottom-[20%] -right-[10%]"></div>
      
      <div className={`w-full max-w-md bg-white rounded-[48px] shadow-xl p-8 sm:p-10 relative z-10 animate-in zoom-in duration-300 ${isSaving ? 'opacity-90 grayscale-[0.5]' : ''}`}>
        <div className="text-center mb-10">
          <div className={`w-16 h-16 rounded-[22px] flex items-center justify-center mx-auto mb-6 shadow-xl transition-transform hover:scale-110 duration-500 ${isRelief ? 'bg-indigo-600 shadow-indigo-100' : 'bg-emerald-600 shadow-emerald-100'}`}>
             <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
             </svg>
          </div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Profile Setup</h2>
          <p className="text-slate-400 text-xs font-black uppercase tracking-wide mt-3">
            {isRelief ? 'Relief Authorization' : 'Node Initialization'} • {branch?.name}
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-6">
            <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">
                    {isRelief ? 'Verified Relief Manager' : 'Verified Node Manager'}
                </label>
                {isSyncingIdentity ? (
                  <div className="w-full p-6 bg-slate-50 rounded-2xl flex items-center justify-center gap-3">
                    <div className="w-4 h-4 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div>
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Verifying Registry...</span>
                  </div>
                ) : identifiedManager ? (
                  <div className="space-y-3">
                    <div className={`w-full p-5 rounded-2xl flex items-center justify-between shadow-lg relative overflow-hidden group ${isRelief ? 'bg-slate-800' : 'bg-slate-900'}`}>
                       <div className={`absolute top-0 right-0 w-24 h-24 blur-2xl rounded-full ${isRelief ? 'bg-indigo-500/10' : 'bg-emerald-500/10'}`}></div>
                       <div className="flex items-center gap-4 relative z-10">
                          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white text-xl">
                              {isRelief ? '👤' : '👑'}
                          </div>
                          <div className="overflow-hidden">
                             <p className="font-black text-white uppercase text-sm tracking-tight truncate">{identifiedManager.name}</p>
                             <p className={`text-xs font-semibold uppercase tracking-wide ${isRelief ? 'text-indigo-400' : 'text-emerald-400'}`}>Identity Confirmed</p>
                          </div>
                       </div>
                       <svg className={`w-5 h-5 shrink-0 ${isRelief ? 'text-indigo-500' : 'text-emerald-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => fetchIdentifiedManager(true)}
                      className="w-full py-2 text-xs font-medium text-slate-400 uppercase tracking-wide hover:text-emerald-600 transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeWidth="3"/></svg>
                      Sync Identity
                    </button>
                  </div>
                ) : (
                  <div className="p-6 bg-rose-50 border border-rose-100 rounded-2xl text-center space-y-4">
                    <div className="text-2xl">⚠️</div>
                    <p className="text-xs font-black text-rose-600 uppercase tracking-widest leading-relaxed">{error || 'Registry Link Broken'}</p>
                    <button 
                      type="button" 
                      onClick={() => fetchIdentifiedManager(true)}
                      className="px-6 py-2 bg-rose-600 text-white rounded-xl text-xs font-semibold uppercase tracking-wide shadow-lg active:scale-95 transition-all"
                    >
                      Retry Sync
                    </button>
                  </div>
                )}
            </div>

            {hasExistingAccount && (
                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xs shrink-0">✅</div>
                    <div className="flex-1">
                        <p className="text-xs font-black text-emerald-900 uppercase tracking-tight">Existing Account Detected</p>
                        <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">You can use your current credentials for this node.</p>
                    </div>
                    <button 
                        type="button"
                        onClick={() => setUseExistingAccount(!useExistingAccount)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide transition-all ${useExistingAccount ? 'bg-emerald-600 text-white' : 'bg-white text-slate-400 border border-slate-200'}`}
                    >
                        {useExistingAccount ? 'LINKED' : 'USE NEW'}
                    </button>
                </div>
            )}

            <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">Personal Username</label>
                <input 
                    type="text"
                    required
                    disabled={!identifiedManager || useExistingAccount}
                    value={username}
                    onChange={e => setUsername(e.target.value.toLowerCase())}
                    placeholder="CHOOSE A UNIQUE ID"
                    className="w-full p-5 bg-white border border-slate-200 rounded-xl font-semibold text-xs uppercase outline-none focus:border-emerald-500 shadow-inner placeholder:text-slate-300 disabled:opacity-50"
                />
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide text-center mt-2">Only letters, numbers, and underscores allowed. No spaces.</p>
            </div>

            {!useExistingAccount && (
                <div className="grid grid-cols-1 gap-4 animate-in slide-in-from-top-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">New 6-Digit PIN</label>
                      <input 
                        type="password"
                        maxLength={6}
                        inputMode="numeric"
                        required
                        disabled={!identifiedManager}
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                        className="w-full p-5 bg-slate-50 border-2 border-transparent rounded-2xl text-center text-3xl font-black tracking-[0.5em] pl-[0.5em] focus:border-emerald-500 outline-none shadow-inner"
                        placeholder="••••••"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">Confirm PIN</label>
                      <input 
                        type="password"
                        maxLength={6}
                        inputMode="numeric"
                        required
                        disabled={!identifiedManager}
                        value={confirmPin}
                        onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                        className="w-full p-5 bg-slate-50 border-2 border-transparent rounded-2xl text-center text-3xl font-black tracking-[0.5em] pl-[0.5em] focus:border-emerald-500 outline-none shadow-inner"
                        placeholder="••••••"
                      />
                    </div>
                </div>
            )}
          </div>

          {error && identifiedManager && (
            <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl text-center animate-in fade-in slide-in-from-top-2">
              <p className="text-xs font-black text-rose-600 uppercase tracking-widest">{error}</p>
            </div>
          )}

          <div className="flex flex-col gap-4 pt-4">
            <button 
              type="submit" 
              disabled={isSaving || !identifiedManager || username.length < 2 || (!useExistingAccount && newPin.length < 6)}
              className={`w-full text-white font-black py-6 rounded-2xl shadow-xl active:scale-[0.98] transition-all uppercase tracking-wider text-xs disabled:opacity-30 flex items-center justify-center gap-3 ${isRelief ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-900 hover:bg-emerald-700'}`}
            >
              {isSaving ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : useExistingAccount ? 'Confirm & Link Node' : 'Commit Identity Link'}
            </button>
            
            {onCancel && (
              <button type="button" onClick={onCancel} className="text-xs font-medium text-slate-400 uppercase tracking-wide py-2 hover:text-slate-600 transition-colors">Abort & Exit</button>
            )}
          </div>
        </form>
        
        <p className="text-xs text-center font-bold text-slate-300 uppercase tracking-wide mt-12">Mainframe Identity Verified v4.5</p>
      </div>
    </div>
  );
};

export default ProfileSetup;
