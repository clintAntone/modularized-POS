
import React, { useState, useMemo } from 'react';
import { Branch, AuthState, Transaction, Attendance, Employee } from '../../../types';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';
import { supabase } from '../../../lib/supabase';
import { playSound } from '../../../lib/audio';
import { generateSalt, hashPin } from '../../../lib/crypto';
import { UI_THEME } from '../../../constants/ui_designs';
import { getEmployeeAllowance, getEmployeeRole, getInitials } from '../../../lib/payroll';
import { useUpdateBranch, useAddAuditLog, useUpdateEmployee } from '../../../hooks/useNetworkData';

interface SettingsSectionProps {
  user: Exclude<AuthState['user'], null>;
  branch: Branch;
  // Add missing branches prop to resolve reference error on line 280
  branches: Branch[];
  todayTxs: Transaction[];
  todayAtt: Attendance[];
  todayReportExists: boolean;
  employees: Employee[];
  onRefresh?: () => void;
}

type SettingsTab = 'operations' | 'access' | 'security';

// Destructure branches from props
export const SettingsSection: React.FC<SettingsSectionProps> = ({ user, branch, branches, todayTxs, todayAtt, todayReportExists, employees, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('operations');
  const [openingTime, setOpeningTime] = useState(branch.openingTime || '09:00');
  const [closingTime, setClosingTime] = useState(branch.closingTime || '22:00');
  const [username, setUsername] = useState(user.username || '');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingOperational, setIsSavingOperational] = useState(false);
  const [isSyncingRelief, setIsSyncingRelief] = useState(false);
  const [isResettingPin, setIsResettingPin] = useState(false);
  const [generatedPin, setGeneratedPin] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showReliefSelector, setShowReliefSelector] = useState(false);

  const updateBranch = useUpdateBranch();
  const updateEmployee = useUpdateEmployee();
  const addAuditLog = useAddAuditLog();

  const availableReliefManagers = useMemo(() => {
    return employees.filter(e =>
        e.branchId === branch.id &&
        (e.name || '').toUpperCase() !== (branch.manager || '').toUpperCase() &&
        e.isActive
    ).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [employees, branch.manager, branch.id]);

  const handleUpdateOperationalSettings = async () => {
    if (isSavingOperational) return;
    setError('');
    setSuccess('');

    const hasActivity = todayTxs.length > 0 || todayAtt.length > 0 || todayReportExists;
    const timeChanged = openingTime !== branch.openingTime || closingTime !== branch.closingTime;

    if (timeChanged && hasActivity) {
      playSound('warning');
      setError('Operational window is locked: Transactions or shifts are already recorded for today.');
      return;
    }

    setIsSavingOperational(true);
    playSound('click');

    try {
      const { error } = await supabase.from(DB_TABLES.BRANCHES).update({
        [DB_COLUMNS.OPENING_TIME]: openingTime,
        [DB_COLUMNS.CLOSING_TIME]: closingTime,
      }).eq(DB_COLUMNS.ID, branch.id);

      if (error) throw error;
      playSound('success');
      setSuccess('Parameters synchronized.');
      if (onRefresh) onRefresh();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Operational sync failed.');
    } finally {
      setIsSavingOperational(false);
    }
  };

  const handleSetRelief = async (name: string) => {
    if (isSyncingRelief) return;
    setIsSyncingRelief(true);
    setGeneratedPin(null);
    playSound('click');
    try {
      const { error } = await supabase
          .from(DB_TABLES.BRANCHES)
          .update({ [DB_COLUMNS.TEMP_MANAGER]: name || null })
          .eq(DB_COLUMNS.ID, branch.id);

      if (error) throw error;

      await supabase.from(DB_TABLES.AUDIT_LOGS).insert({
        [DB_COLUMNS.BRANCH_ID]: branch.id,
        [DB_COLUMNS.TIMESTAMP]: new Date().toISOString(),
        [DB_COLUMNS.ACTIVITY_TYPE]: 'UPDATE',
        [DB_COLUMNS.ENTITY_TYPE]: 'SECURITY',
        [DB_COLUMNS.DESCRIPTION]: name
            ? `Authorized relief access granted to: ${name}`
            : `Relief access revoked for this node terminal.`,
        [DB_COLUMNS.PERFORMER_NAME]: branch.manager || 'PRIMARY MANAGER'
      });

      if (name) {
        setGeneratedPin(branch.pin);
      } else {
        setGeneratedPin(null);
      }

      playSound('success');
      setSuccess(name ? 'Relief protocol established.' : 'Relief access revoked.');
      setShowReliefSelector(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      setError('Relief sync fault.');
    } finally {
      setIsSyncingRelief(false);
    }
  };

  const handleResetBranchPin = async () => {
    if (isResettingPin) return;
    setIsResettingPin(true);
    playSound('click');
    setError('');
    setSuccess('');
    
    console.log('[Settings] Resetting Branch PIN for branch:', branch.id);
    
    try {
      const newPinValue = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Use mutation hook for consistency and automatic cache invalidation
      await updateBranch.mutateAsync({
        id: branch.id,
        [DB_COLUMNS.PIN]: newPinValue
      });

      // If there's a relief manager assigned, update their PIN to the new setup key
      // so they can login with their existing username and the new PIN.
      // If they don't have a username yet, we clear the PIN to force them through the setup flow.
      if (branch.tempManager) {
        const delegateEmp = employees.find(e => (e.name || '').toUpperCase().trim() === branch.tempManager?.toUpperCase().trim());
        if (delegateEmp) {
          if (delegateEmp.username) {
            const salt = generateSalt();
            const hash = await hashPin(newPinValue, salt);
            
            await updateEmployee.mutateAsync({
              id: delegateEmp.id,
              [DB_COLUMNS.LOGIN_PIN]: hash,
              [DB_COLUMNS.PIN_SALT]: salt
            });
            
            console.log('[Settings] Delegate PIN updated to match new setup key for existing account');
          } else {
            // No username yet, clear PIN to force setup flow in Login.tsx
            await updateEmployee.mutateAsync({
              id: delegateEmp.id,
              [DB_COLUMNS.LOGIN_PIN]: null,
              [DB_COLUMNS.PIN_SALT]: null
            });
            console.log('[Settings] Delegate account not initialized, clearing PIN to force setup');
          }
        }
      }

      await addAuditLog.mutateAsync({
        [DB_COLUMNS.BRANCH_ID]: branch.id,
        [DB_COLUMNS.TIMESTAMP]: new Date().toISOString(),
        [DB_COLUMNS.ACTIVITY_TYPE]: 'UPDATE',
        [DB_COLUMNS.ENTITY_TYPE]: 'SECURITY',
        [DB_COLUMNS.ENTITY_ID]: branch.id,
        [DB_COLUMNS.DESCRIPTION]: `Branch setup PIN reset by manager. New key generated.`,
        [DB_COLUMNS.PERFORMER_NAME]: branch.manager || 'PRIMARY MANAGER'
      });

      setGeneratedPin(newPinValue);
      playSound('success');
      setSuccess('Setup Key Regenerated.');
      console.log('[Settings] Branch PIN reset successful. New PIN:', newPinValue);
      
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error('[Settings] Branch PIN reset failed:', err);
      setError(`Key reset failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsResettingPin(false);
    }
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || !user.employeeId) return;
    setError('');
    setSuccess('');

    if (!username.trim()) {
      setError('Username is required.');
      return;
    }

    // Restrict special characters in username
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(username.trim())) {
      setError('Username can only contain letters, numbers, and underscores.');
      return;
    }

    if (newPin && (newPin.length !== 6 || newPin !== confirmPin)) {
      setError(newPin.length !== 6 ? 'PIN must be 6 digits.' : 'PINs do not match.');
      return;
    }

    // Check for username collision
    const isUsernameTaken = employees.some(e => 
      e.id !== user.employeeId && 
      e.username?.toLowerCase() === username.trim().toLowerCase()
    );

    if (isUsernameTaken) {
      setError('Username is already taken by another user.');
      return;
    }

    setIsSaving(true);
    try {
      const updateData: any = {
        [DB_COLUMNS.USERNAME]: username.trim()
      };

      if (newPin) {
        const salt = generateSalt();
        const hash = await hashPin(newPin, salt);
        updateData[DB_COLUMNS.LOGIN_PIN] = hash;
        updateData[DB_COLUMNS.PIN_SALT] = salt;
      }

      const { error: dbError } = await supabase
        .from(DB_TABLES.EMPLOYEES)
        .update(updateData)
        .eq(DB_COLUMNS.ID, user.employeeId);

      if (dbError) throw dbError;

      playSound('success');
      setSuccess('Account updated successfully.');
      setNewPin('');
      setConfirmPin('');
      if (onRefresh) onRefresh();
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError('Update failed.');
    } finally {
      setIsSaving(false);
    }
  };

  const isLocked = todayTxs.length > 0 || todayAtt.length > 0 || todayReportExists;

  return (
      <div className="max-w-xl mx-auto space-y-8 animate-in fade-in duration-500 pb-32">
        <div className="px-2 space-y-4">
          <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tighter">Terminal Admin</h2>
          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner">
            <button onClick={() => { setActiveTab('operations'); playSound('click'); }} className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'operations' ? 'bg-white text-slate-900 shadow-md border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>Operations</button>
            <button onClick={() => { setActiveTab('access'); playSound('click'); }} className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'access' ? 'bg-white text-slate-900 shadow-md border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>My Account</button>
            <button onClick={() => { setActiveTab('security'); playSound('click'); }} className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'security' ? 'bg-white text-slate-900 shadow-md border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>Delegation</button>
          </div>
        </div>

        {success && <div className="mx-2 bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-2"><p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">{success}</p></div>}
        {error && <div className="mx-2 bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center gap-3 animate-in shake"><p className="text-[10px] font-bold text-rose-600 uppercase tracking-widest leading-relaxed">{error}</p></div>}

        <div className="animate-in fade-in duration-300">
          {activeTab === 'operations' && (
              <div className="space-y-6">
                <section className={`bg-white p-8 ${UI_THEME.radius.card} border border-slate-100 shadow-sm space-y-6 relative overflow-hidden`}>
                  {isLocked && <div className="absolute top-4 right-6 bg-amber-50 text-amber-600 border border-amber-100 px-2 py-0.5 rounded-lg text-[7px] font-black uppercase tracking-widest shadow-sm">Read Only Mode</div>}
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 uppercase tracking-tight text-sm">Operational Window</h3>
                    {isLocked && <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">Day Active</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Opening</label>
                      <input
                          type="time"
                          disabled={isLocked}
                          value={openingTime}
                          onChange={e => setOpeningTime(e.target.value)}
                          className={`w-full p-4 rounded-2xl font-bold text-sm uppercase outline-none transition-all ${isLocked ? 'bg-slate-50 text-slate-300 border-transparent cursor-not-allowed' : 'bg-slate-50 border-transparent focus:border-emerald-500 focus:bg-white text-slate-900'}`}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Closing</label>
                      <input
                          type="time"
                          disabled={isLocked}
                          value={closingTime}
                          onChange={e => setClosingTime(e.target.value)}
                          className={`w-full p-4 rounded-2xl font-bold text-sm uppercase outline-none transition-all ${isLocked ? 'bg-slate-50 text-slate-300 border-transparent cursor-not-allowed' : 'bg-slate-50 border-transparent focus:border-emerald-500 focus:bg-white text-slate-900'}`}
                      />
                    </div>
                  </div>
                  <button
                      onClick={handleUpdateOperationalSettings}
                      disabled={isSavingOperational || isLocked}
                      className={`w-full font-bold py-5 rounded-[22px] uppercase text-[11px] shadow-xl active:scale-95 disabled:opacity-30 transition-all ${isLocked ? 'bg-slate-100 text-slate-300' : 'bg-slate-900 text-white hover:bg-emerald-600'}`}
                  >
                    {isSavingOperational ? 'Synchronizing...' : isLocked ? 'Locked (Operational)' : 'Commit Window'}
                  </button>
                </section>
              </div>
          )}

          {activeTab === 'access' && (
              <div className="space-y-6">
                <section className={`bg-white p-8 ${UI_THEME.radius.card} border border-slate-100 shadow-sm space-y-8`}>
                  <h3 className="font-bold text-slate-900 uppercase tracking-tight text-sm">Account Settings</h3>
                  <form onSubmit={handleUpdateAccount} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Username</label>
                    <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="w-full p-5 bg-slate-50 rounded-[22px] text-center text-lg font-bold focus:border-slate-900 outline-none shadow-inner" placeholder="Enter Username" />
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest text-center mt-2">Only letters, numbers, and underscores allowed. No spaces.</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">New 6-Digit PIN (Optional)</label>
                    <input type="password" maxLength={6} value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))} className="w-full p-5 bg-slate-50 rounded-[22px] text-center text-2xl font-bold tracking-[0.5em] focus:border-slate-900 outline-none shadow-inner" placeholder="••••••" />
                  </div>
                  {newPin && (
                    <div className="space-y-2 animate-in slide-in-from-top-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Confirm New PIN</label>
                      <input type="password" maxLength={6} value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))} className="w-full p-5 bg-slate-50 rounded-[22px] text-center text-2xl font-bold tracking-[0.5em] focus:border-slate-900 outline-none shadow-inner" placeholder="••••••" />
                    </div>
                  )}
                  <button type="submit" disabled={isSaving} className="w-full bg-slate-900 text-white font-bold py-6 rounded-[28px] uppercase tracking-widest text-[11px] shadow-2xl hover:bg-emerald-600 active:scale-95 disabled:opacity-30">Update Account</button>
                </form>
              </section>
            </div>
          )}

          {activeTab === 'security' && (
              <section className="space-y-6">
                <div className={`bg-white p-8 ${UI_THEME.radius.card} border border-slate-100 shadow-sm space-y-8 relative overflow-hidden`}>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl rounded-full"></div>
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-slate-900 uppercase tracking-tight text-sm">Relief Manager Protocol</h3>
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${branch.tempManager ? 'bg-indigo-500 animate-pulse shadow-[0_0_8px_#6366f1]' : 'bg-slate-200'}`}></div>
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{branch.tempManager ? 'Link Active' : 'Registry Locked'}</span>
                    </div>
                  </div>

                  <div className="p-6 bg-slate-50 rounded-[28px] border border-slate-100 shadow-inner flex flex-col items-center text-center gap-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border shadow-sm ${
                        branch.isPinChanged ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                      }`}>
                        {branch.isPinChanged ? 'Secured' : 'Setup Mode'}
                      </span>
                    </div>
                    {branch.tempManager ? (
                        <>
                          <div className="w-16 h-16 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-2xl shadow-xl animate-in zoom-in">👤</div>
                          <div>
                            <p className="text-[14px] font-bold text-slate-900 uppercase tracking-tight">{branch.tempManager}</p>
                            <p className="text-[9px] font-semibold text-indigo-600 uppercase tracking-[0.2em] mt-1">Authorized Node Relief</p>
                          </div>

                          <div className="w-full space-y-3 pt-2">
                            {generatedPin ? (
                                <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl animate-in zoom-in">
                                  <p className="text-[8px] font-bold text-amber-600 uppercase tracking-widest mb-2">New Setup Key</p>
                                  <p className="text-3xl font-black text-amber-700 tracking-[0.3em] tabular-nums">{generatedPin}</p>
                                  <p className="text-[7px] font-bold text-amber-500 uppercase tracking-widest mt-2 leading-relaxed">Share this code with the delegate.<br/>They must use this to authorize their first login.</p>
                                  <button 
                                    onClick={() => {
                                      navigator.clipboard.writeText(generatedPin);
                                      playSound('success');
                                      setSuccess('Copied to clipboard');
                                      setTimeout(() => setSuccess(''), 2000);
                                    }}
                                    className="mt-3 text-[9px] font-bold text-amber-700 uppercase tracking-widest hover:underline"
                                  >
                                    Copy to Clipboard
                                  </button>
                                </div>
                            ) : (
                                <button
                                    onClick={handleResetBranchPin}
                                    disabled={isResettingPin}
                                    className="w-full py-4 rounded-xl bg-slate-900 text-white font-bold text-[10px] uppercase tracking-widest shadow-lg hover:bg-emerald-600 transition-all active:scale-95 flex items-center justify-center gap-2"
                                >
                                  {isResettingPin ? <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : '🔑'}
                                  {isResettingPin ? 'Regenerating...' : 'Reset Delegate Setup Key'}
                                </button>
                            )}

                            <button
                                onClick={() => handleSetRelief('')}
                                disabled={isSyncingRelief}
                                className="w-full py-4 rounded-xl bg-white border border-rose-100 text-rose-500 font-bold text-[10px] uppercase tracking-widest shadow-sm hover:bg-rose-500 hover:text-white transition-all active:scale-95"
                            >
                              {isSyncingRelief ? 'Revoking...' : 'Terminate Relief Access'}
                            </button>
                          </div>
                        </>
                    ) : (
                        <>
                          <div className="w-16 h-16 rounded-2xl bg-slate-200 text-slate-400 flex items-center justify-center text-2xl">∅</div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed max-w-[200px]">
                            No relief manager currently designated for this terminal.
                          </p>
                          <button
                              onClick={() => { playSound('click'); setShowReliefSelector(true); }}
                              className="w-full bg-slate-900 text-white font-bold py-5 rounded-[22px] uppercase text-[10px] tracking-widest shadow-lg active:scale-95"
                          >
                            Designate Relief Personnel
                          </button>
                        </>
                    )}
                  </div>
                </div>

                {showReliefSelector && (
                    <div className="fixed inset-0 z-[2000] bg-slate-950/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
                      <div className="bg-white w-full max-w-md rounded-t-[40px] sm:rounded-[40px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 sm:zoom-in duration-300">
                        <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                          <h4 className="text-lg font-bold text-slate-900 uppercase tracking-tighter">Select Network Delegate</h4>
                          <button onClick={() => setShowReliefSelector(false)} className="p-2 text-slate-300 hover:text-slate-900 transition-colors"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="2.5" /></svg></button>
                        </div>
                        <div className="p-6 max-h-[60vh] overflow-y-auto no-scrollbar space-y-2">
                          {availableReliefManagers.length > 0 ? availableReliefManagers.map(emp => (
                              <button
                                  key={emp.id}
                                  onClick={() => handleSetRelief(emp.name)}
                                  disabled={isSyncingRelief}
                                  className="w-full p-5 rounded-2xl border border-slate-100 bg-white hover:border-indigo-500 hover:bg-indigo-50/30 transition-all flex items-center justify-between group active:scale-[0.98]"
                              >
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-inner font-bold italic">{getInitials(emp.name)}</div>
                                  <div className="text-left overflow-hidden">
                                    <p className="font-bold text-slate-900 uppercase text-[12px] truncate pr-4">{emp.name}</p>
                                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{emp.role}</p>
                                  </div>
                                </div>
                                <svg className="w-5 h-5 text-slate-100 group-hover:text-indigo-500 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" strokeWidth="3" /></svg>
                              </button>
                          )) : (
                              <div className="py-20 text-center opacity-30">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">No available managers found</p>
                              </div>
                          )}
                        </div>
                        <div className="p-8 bg-slate-50 border-t border-slate-100">
                          <p className="text-[8px] font-bold text-slate-400 uppercase text-center leading-relaxed">
                            Selecting a manager allows them to use their own PIN to access this terminal.
                            Identity will be logged in the global audit registry.
                          </p>
                        </div>
                      </div>
                    </div>
                )}
              </section>
          )}
        </div>
      </div>
  );
};
