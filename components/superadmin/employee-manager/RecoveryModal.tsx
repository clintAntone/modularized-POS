
import React, { useState } from 'react';
import { Employee, Branch } from '../../../types';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';
import { supabase } from '../../../lib/supabase';
import { playSound } from '../../../lib/audio';
import { generateSalt, hashPin } from '../../../lib/crypto';
import { useUpdateEmployee, useUpdateBranch, useAddAuditLog } from '../../../hooks/useNetworkData';
import { invalidateBranchSessions } from '../../../lib/audit';

interface RecoveryModalProps {
  employee: Employee;
  branches: Branch[];
  isSaving: boolean;
  onClose: () => void;
  onRefresh?: () => void;
  onSyncStatusChange?: (isSyncing: boolean) => void;
}

export const RecoveryModal: React.FC<RecoveryModalProps> = ({ employee, branches, isSaving, onClose, onRefresh, onSyncStatusChange }) => {
  const [resetUsername, setResetUsername] = useState(employee.username || (employee.name || '').split(' ')[0].toLowerCase() + Math.floor(10 + Math.random() * 90));
  const [resetPin, setResetPin] = useState(Math.floor(100000 + Math.random() * 900000).toString());
  const [showPin, setShowPin] = useState(true);
  const [successData, setSuccessData] = useState<{username: string, pin: string} | null>(null);
  const [error, setError] = useState('');
  const [localSaving, setLocalSaving] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState('');

  const employeeEmail = employee.details?.gmail || '';
  const homeBranch = branches.find(b => b.id === employee.branchId);

  const updateEmployee = useUpdateEmployee();
  const updateBranch = useUpdateBranch();
  const addAuditLog = useAddAuditLog();

  const handleCommitReset = async () => {
    if (localSaving || isSaving) return;
    const cleanUser = resetUsername.trim().toLowerCase();
    if (cleanUser.length < 2 || resetPin.length < 6) {
        setError('VALID CREDENTIALS REQUIRED (User: 2+ chars, PIN: 6 digits)');
        return;
    }

    setLocalSaving(true);
    if (onSyncStatusChange) onSyncStatusChange(true);
    setError('');

    try {
        const { data: existing } = await supabase
            .from(DB_TABLES.EMPLOYEES)
            .select('id')
            .eq(DB_COLUMNS.USERNAME, resetUsername.toLowerCase().trim());
        
        if (existing && existing.length > 0 && existing.some(e => e.id !== employee.id)) {
            setError('USERNAME ALREADY TAKEN');
            setLocalSaving(false);
            if (onSyncStatusChange) onSyncStatusChange(false);
            return;
        }

        const salt = generateSalt();
        const hash = await hashPin(resetPin, salt);

        await updateEmployee.mutateAsync({
            id: employee.id,
            [DB_COLUMNS.USERNAME]: resetUsername.toLowerCase().trim(), 
            [DB_COLUMNS.LOGIN_PIN]: hash, 
            [DB_COLUMNS.PIN_SALT]: salt,
            [DB_COLUMNS.REQUEST_RESET]: false 
        });

        // If this employee is a manager, ensure their branch is marked as setup and manager name is synced
        const branchData = branches.find(b => b.id === employee.branchId);

        if (branchData) {
            const isManagerRole = (employee.role || '').includes('MANAGER');
            const isCurrentlyAssigned = branchData.manager?.toUpperCase() === (employee.name || '').toUpperCase();
            
            if (isCurrentlyAssigned || isManagerRole) {
                const updates: any = { id: branchData.id, [DB_COLUMNS.IS_PIN_CHANGED]: true };
                // Auto-sync manager name if it's a manager role but name is empty or mismatched
                if (isManagerRole && !isCurrentlyAssigned) {
                    updates[DB_COLUMNS.MANAGER] = (employee.name || '').toUpperCase();
                }
                
                await updateBranch.mutateAsync(updates);
            }
        }

        await addAuditLog.mutateAsync({
            [DB_COLUMNS.BRANCH_ID]: null,
            [DB_COLUMNS.TIMESTAMP]: new Date().toISOString(),
            [DB_COLUMNS.ACTIVITY_TYPE]: 'UPDATE',
            [DB_COLUMNS.ENTITY_TYPE]: 'SECURITY',
            [DB_COLUMNS.ENTITY_ID]: employee.id,
            [DB_COLUMNS.DESCRIPTION]: `Admin manually provisioned new credentials for: ${employee.name || 'UNNAMED'}.`,
            [DB_COLUMNS.PERFORMER_NAME]: 'SYSTEM ADMIN'
        });

        // Kick any active sessions for all branches this employee manages
        const managedBranchIds = branches
          .filter(b => b.manager?.toUpperCase() === (employee.name || '').toUpperCase())
          .map(b => b.id);
        if (managedBranchIds.length) await invalidateBranchSessions(managedBranchIds);

        playSound('success');
        setSuccessData({ username: resetUsername.toLowerCase().trim(), pin: resetPin });
        if (onRefresh) onRefresh();
    } catch (err) {
        setError('RESET SYNC FAULT');
        playSound('warning');
    } finally {
        setLocalSaving(false);
        if (onSyncStatusChange) onSyncStatusChange(false);
    }
  };

  const handleSendEmail = async () => {
    if (!successData || !employeeEmail || emailSending) return;
    setEmailSending(true);
    setEmailError('');
    try {
      const { error } = await supabase.functions.invoke('send-credentials', {
        body: {
          toEmail: employeeEmail,
          employeeName: employee.name,
          username: successData.username,
          pin: successData.pin,
          branchName: homeBranch?.name || '',
        },
      });
      if (error) throw new Error(error.message);
      setEmailSent(true);
      playSound('success');
    } catch {
      setEmailError('Failed to send email. Deliver credentials manually.');
      playSound('warning');
    } finally {
      setEmailSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-300">
       <div className="bg-white rounded-[44px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in duration-300 flex flex-col border border-white/10">
          {successData ? (
            <div className="p-10 space-y-8 text-center animate-in slide-in-from-bottom-2">
               <div className="w-20 h-20 bg-emerald-600 rounded-full flex items-center justify-center text-white mx-auto shadow-2xl mb-4">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="4"><path d="M5 13l4 4L19 7"/></svg>
               </div>
               <div className="space-y-2">
                  <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none">Security Provisioned</h4>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hand over these credentials to personnel</p>
               </div>
               
               <div className="space-y-4 bg-slate-50 p-8 rounded-[32px] border border-slate-100 shadow-inner">
                  <div className="space-y-1">
                     <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Username</p>
                     <p className="text-lg font-black text-slate-900 uppercase select-all bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100 text-center">{successData.username}</p>
                  </div>
                  <div className="space-y-1">
                     <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Security PIN</p>
                     <p className="text-3xl font-black text-emerald-600 tracking-widest text-center select-all bg-white px-4 py-4 rounded-xl shadow-sm border border-slate-100 tabular-nums">{successData.pin}</p>
                  </div>
               </div>

               {employeeEmail && (
                 <div className="space-y-2">
                   {emailSent ? (
                     <div className="flex items-center justify-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                       <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>
                       <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Sent to {employeeEmail}</p>
                     </div>
                   ) : (
                     <button
                       onClick={handleSendEmail}
                       disabled={emailSending}
                       className="w-full bg-emerald-600 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-[11px] shadow-lg active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                     >
                       {emailSending
                         ? <><div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Sending...</>
                         : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg> Send to {employeeEmail}</>}
                     </button>
                   )}
                   {emailError && <p className="text-[9px] font-black text-rose-600 text-center uppercase tracking-widest">{emailError}</p>}
                 </div>
               )}

               <button
                 onClick={onClose}
                 className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl uppercase tracking-widest text-[11px] shadow-lg active:scale-95 transition-all"
               >
                 Complete Audit & Close
               </button>
            </div>
          ) : (
            <>
              <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <h4 className="text-lg font-black text-slate-900 uppercase tracking-tighter">Credential Recovery</h4>
                <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-900"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
              
              <div className="p-10 space-y-8">
                 <div className="flex items-center gap-4 p-5 bg-rose-50 border border-rose-100 rounded-[28px] animate-pulse">
                    <div className="w-10 h-10 rounded-xl bg-rose-600 flex items-center justify-center text-white shadow-lg shrink-0">🆘</div>
                    <div>
                       <p className="text-[10px] font-black text-rose-700 uppercase tracking-widest">Action Required</p>
                       <p className="text-[12px] font-black text-slate-900 uppercase truncate max-w-[200px]">{employee.name}</p>
                    </div>
                 </div>

                 {error && (
                    <div className="p-4 bg-rose-50 text-rose-600 rounded-xl text-center text-[9px] font-black uppercase border border-rose-100 animate-in slide-in-from-top-2">{error}</div>
                 )}

                 <div className="space-y-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">New Branch Username</label>
                       <input 
                          value={resetUsername} 
                          onChange={e => setResetUsername(e.target.value.toLowerCase())} 
                          className="w-full p-4 bg-slate-50 border-2 border-transparent rounded-xl font-black text-sm uppercase outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner" 
                       />
                    </div>

                    <div className="space-y-2">
                       <div className="flex justify-between items-center ml-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Manual Security PIN</label>
                          <div className="flex gap-4">
                             <button type="button" onClick={() => setShowPin(!showPin)} className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{showPin ? 'Hide' : 'Show'}</button>
                             <button type="button" onClick={() => { setResetPin(Math.floor(100000 + Math.random() * 900000).toString()); playSound('click'); }} className="text-[8px] font-black text-emerald-600 uppercase tracking-widest">Generate New</button>
                          </div>
                       </div>
                       <input 
                          type={showPin ? "text" : "password"}
                          maxLength={6}
                          inputMode="numeric"
                          value={resetPin} 
                          onChange={e => setResetPin(e.target.value.replace(/\D/g, ''))} 
                          className="w-full p-6 bg-slate-50 border-2 border-transparent rounded-xl font-black text-2xl tracking-widest text-center outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner tabular-nums" 
                       />
                    </div>
                 </div>

                 <button 
                    onClick={handleCommitReset}
                    disabled={localSaving || isSaving}
                    className="w-full bg-slate-900 text-white font-black py-6 rounded-[28px] uppercase tracking-[0.25em] text-[12px] shadow-2xl hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-30 flex items-center justify-center gap-3"
                 >
                    {localSaving ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : 'Secure & Authorize'}
                 </button>
              </div>
            </>
          )}
       </div>
    </div>
  );
};
