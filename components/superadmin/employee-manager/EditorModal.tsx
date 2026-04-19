import React, { useState, useRef, useEffect } from 'react';
import { Employee, Branch } from '../../../types';
import { DB_COLUMNS } from '../../../constants/db_schema';
import { WorkplaceAuthorizationGrid, ROLE_ORDER } from './SharedComponents';
import { UI_THEME } from '../../../constants/ui_designs';
import { playSound } from '../../../lib/audio';

interface EditorModalProps {
  employee: Partial<Employee>;
  branches: Branch[];
  isSaving: boolean;
  error: string;
  onClose: () => void;
  onSave: (payload: any, authorizedIds: string[], profile: File | null) => void;
  onWipe: (employee: Partial<Employee>) => void;
  onReset?: (employee: Employee) => void;
  onDelete?: (employee: Employee) => void;
}

export const EditorModal: React.FC<EditorModalProps> = ({ employee, branches, isSaving, error, onClose, onSave, onWipe, onReset, onDelete }) => {
  const [localEmployee, setLocalEmployee] = useState(employee);

  const [authorizedBranchIds, setAuthorizedBranchIds] = useState<string[]>([]);
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const finalHomeBranchId = authorizedBranchIds[0] || '';

  // SYNC: When home branch changes, ensure local role/allowance reflect that branch's specific config
  useEffect(() => {
    if (finalHomeBranchId && localEmployee.branchAllowances?.[finalHomeBranchId]) {
      const config = localEmployee.branchAllowances[finalHomeBranchId];
      const role = typeof config === 'object' ? config.role : localEmployee.role;
      const allowance = typeof config === 'object' ? config.allowance : config;
      
      setLocalEmployee(prev => {
        // Only update if actually different to avoid unnecessary re-renders
        if (prev.role === role && prev.allowance === allowance) return prev;
        return {
          ...prev,
          role: role || prev.role || '',
          allowance: allowance !== undefined ? Number(allowance) : (prev.allowance || 0)
        };
      });
    }
  }, [finalHomeBranchId]);

  useEffect(() => {
    if (employee.id) {
        if (branches.length === 0) return;

        const allowanceIds = employee.branchAllowances ? Object.keys(employee.branchAllowances) : [];
        const managingIds = branches
            .filter(b => b.manager?.toUpperCase() === employee.name?.toUpperCase())
            .map(b => b.id);
        const homeId = employee.branchId || '';
        
        const next = Array.from(new Set([homeId, ...allowanceIds, ...managingIds])).filter(Boolean);
        
        setAuthorizedBranchIds(prev => {
            if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
            return next;
        });
    } else {
        setAuthorizedBranchIds(prev => {
            const next = employee.branchId ? [employee.branchId] : [];
            if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
            return next;
        });
    }
  }, [employee.id, employee.name, employee.branchId, employee.branchAllowances, branches]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const firstName = localEmployee.firstName?.trim().toUpperCase() || '';
    const lastName = localEmployee.lastName?.trim().toUpperCase() || '';
    const displayName = localEmployee.name?.trim().toUpperCase() || `${firstName} ${lastName}`.trim();

    // Filter branchAllowances to only include authorized branches
    const filteredAllowances: Record<string, any> = {};
    authorizedBranchIds.forEach(id => {
      const config = localEmployee.branchAllowances?.[id];
      
      // Standardize to object form
      const allowanceObj = typeof config === 'object' && config !== null 
        ? { ...config } 
        : { allowance: Number(config || 0), role: '' };
      
      // Ensure role is a string
      if (allowanceObj.role === undefined) allowanceObj.role = '';

      // SANITIZATION: Strip RELIEVER if this is the home branch
      if (id === finalHomeBranchId && allowanceObj.role) {
        allowanceObj.role = allowanceObj.role.split(',').filter(r => r.trim().toUpperCase() !== 'RELIEVER').join(',');
      }
      
      filteredAllowances[id] = allowanceObj;
    });

    const homeAllowanceConfig = filteredAllowances[finalHomeBranchId] || { allowance: 0, role: '' };
    
    // SYNC: Maintain 'Primary Branch Cache' columns for backward compatibility
    const homeRoleValue = homeAllowanceConfig.role;
    const homeAllowanceValue = homeAllowanceConfig.allowance;

    const payload: any = {
      [DB_COLUMNS.NAME]: displayName,
      [DB_COLUMNS.FIRST_NAME]: firstName,
      [DB_COLUMNS.MIDDLE_NAME]: localEmployee.middleName?.trim().toUpperCase() || null,
      [DB_COLUMNS.LAST_NAME]: lastName,
      [DB_COLUMNS.ROLE]: homeRoleValue,
      [DB_COLUMNS.ALLOWANCE]: Number(homeAllowanceValue),
      [DB_COLUMNS.BRANCH_ALLOWANCES]: filteredAllowances,
      [DB_COLUMNS.IS_ACTIVE]: localEmployee.isActive !== undefined ? localEmployee.isActive : true,
      [DB_COLUMNS.BRANCH_ID]: finalHomeBranchId,
      [DB_COLUMNS.PROFILE]: localEmployee.profile
    };

    if (!localEmployee.id) {
        payload[DB_COLUMNS.USERNAME] = null;
        payload[DB_COLUMNS.LOGIN_PIN] = null;
        payload[DB_COLUMNS.PIN_SALT] = null;
        payload[DB_COLUMNS.REQUEST_RESET] = false;
    }

    onSave(payload, authorizedBranchIds, profileFile);
  };

  const toggleBranchRole = (branchId: string, role: string) => {
    setLocalEmployee(prev => {
      const config = prev.branchAllowances?.[branchId];
      const currentRoles = (typeof config === 'object' ? config.role : '') || '';
      const selectedRoles = currentRoles.split(',').filter(Boolean);
      
      const nextRoles = selectedRoles.includes(role) 
        ? selectedRoles.filter(r => r !== role) 
        : [...selectedRoles, role];
      
      const allowance = typeof config === 'object' ? config.allowance : (config || 0);
      
      return {
        ...prev,
        branchAllowances: {
          ...(prev.branchAllowances || {}),
          [branchId]: { allowance, role: nextRoles.join(',') }
        }
      };
    });
    playSound('click');
  };

  const handleManualReset = () => {
    if (employee.id && onReset) {
        onReset(employee as Employee);
    }
  };

  return (
    <div className={UI_THEME.layout.modalWrapper}>
      <form onSubmit={handleSubmit} className={`${UI_THEME.layout.modalLarge} ${UI_THEME.radius.modal} flex flex-col overflow-hidden max-h-[95vh] border border-slate-100 p-6 md:p-12`}>
        <div className="flex justify-between items-center mb-8 sm:mb-12 shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-xl shadow-lg">
              {localEmployee.id ? '👤' : '➕'}
            </div>
            <div className="min-w-0">
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 uppercase tracking-tighter leading-none">
                {localEmployee.id ? 'Edit Personnel' : 'New Personnel'}
              </h3>
              <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-widest mt-1">
                {localEmployee.id ? 'Modify Identity Parameters' : 'Network Registration Protocol'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 sm:p-3 bg-slate-50 rounded-xl sm:rounded-2xl text-slate-300 hover:text-slate-900 transition-all active:scale-90 shadow-sm border border-slate-100">
            <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" strokeWidth="2.5" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar space-y-8 sm:space-y-10 pr-1">
          {error && (
            <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-2 duration-300">
              <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e]"></div>
              <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest">{error}</p>
            </div>
          )}

          {localEmployee.id && localEmployee.requestReset && (
             <div className="bg-rose-600 text-white p-3 rounded-2xl flex items-center justify-center gap-3 animate-pulse shadow-lg shadow-rose-600/20">
               <span className="text-lg">🆘</span>
               <p className="text-[9px] font-black uppercase tracking-[0.2em]">Personnel Requested Credential Recovery</p>
             </div>
          )}

          <div className="flex flex-col items-center gap-4">
             <div className="relative group">
               <button 
                 type="button" 
                 onClick={() => fileInputRef.current?.click()} 
                 className="w-32 h-32 sm:w-40 sm:h-40 rounded-[40px] sm:rounded-[52px] bg-white border-4 border-dashed border-slate-200 flex flex-col items-center justify-center overflow-hidden transition-all hover:border-emerald-500 hover:bg-emerald-50/30 group relative shadow-xl active:scale-95"
               >
                 {profileFile || localEmployee.profile ? (
                   <img 
                     src={profileFile ? URL.createObjectURL(profileFile) : localEmployee.profile} 
                     className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                     alt="Preview" 
                   />
                 ) : (
                   <div className="flex flex-col items-center gap-2">
                     <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                       <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                       </svg>
                     </div>
                     <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest group-hover:text-emerald-600 transition-colors">Upload Photo</span>
                   </div>
                 )}
                 
                 {/* Overlay on Hover when image exists */}
                 {(profileFile || localEmployee.profile) && (
                   <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                     <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                     </svg>
                     <span className="text-white text-[8px] font-black uppercase tracking-widest">Replace Photo</span>
                   </div>
                 )}
               </button>
               
               {/* Decorative Badge */}
               <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-emerald-500 rounded-2xl border-4 border-white shadow-lg flex items-center justify-center text-white z-10">
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" />
                 </svg>
               </div>
             </div>
             
             <p className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.2em]">Identity Verification Image</p>
             <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => setProfileFile(e.target.files?.[0] || null)} />
          </div>

          <div className="space-y-6 sm:space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">First Name</label>
                <input 
                  required 
                  value={localEmployee.firstName || ''} 
                  onChange={e => {
                    const val = e.target.value.toUpperCase();
                    setLocalEmployee(prev => {
                      const fullName = `${val} ${prev.middleName ? prev.middleName.trim() + ' ' : ''}${prev.lastName || ''}`.trim();
                      return {...prev, firstName: val, name: fullName};
                    });
                  }} 
                  className="w-full p-4 sm:p-5 bg-slate-50 border-2 border-transparent rounded-[18px] sm:rounded-[24px] font-bold text-xs sm:text-sm uppercase outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner" 
                  placeholder="FIRST NAME" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Middle Name</label>
                <input 
                  value={localEmployee.middleName || ''} 
                  onChange={e => {
                    const val = e.target.value.toUpperCase();
                    setLocalEmployee(prev => {
                      const fullName = `${prev.firstName || ''} ${val ? val.trim() + ' ' : ''}${prev.lastName || ''}`.trim();
                      return {...prev, middleName: val, name: fullName};
                    });
                  }} 
                  className="w-full p-4 sm:p-5 bg-slate-50 border-2 border-transparent rounded-[18px] sm:rounded-[24px] font-bold text-xs sm:text-sm uppercase outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner" 
                  placeholder="OPTIONAL" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Last Name</label>
                <input 
                  required 
                  value={localEmployee.lastName || ''} 
                  onChange={e => {
                    const val = e.target.value.toUpperCase();
                    setLocalEmployee(prev => {
                      const fullName = `${prev.firstName || ''} ${prev.middleName ? prev.middleName.trim() + ' ' : ''}${val}`.trim();
                      return {...prev, lastName: val, name: fullName};
                    });
                  }} 
                  className="w-full p-4 sm:p-5 bg-slate-50 border-2 border-transparent rounded-[18px] sm:rounded-[24px] font-bold text-xs sm:text-sm uppercase outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner" 
                  placeholder="LAST NAME" 
                />
              </div>
            </div>

            <div className="space-y-2 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
              <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Generated Display Name</label>
              <div className="w-full p-4 sm:p-5 bg-white border-2 border-slate-100 rounded-[18px] sm:rounded-[24px] font-bold text-xs sm:text-sm uppercase text-slate-900 shadow-sm">
                {localEmployee.name || <span className="text-slate-300 italic">Auto-generated from full name...</span>}
              </div>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest ml-1 mt-1">This name will be used in all transactions and reports.</p>
            </div>

            {/* Duplicate Warning */}
            {(() => {
              const firstName = localEmployee.firstName?.trim().toUpperCase();
              const lastName = localEmployee.lastName?.trim().toUpperCase();
              const nickname = localEmployee.name?.trim().toUpperCase();
              const homeBranchId = localEmployee.id ? (localEmployee.branchId || authorizedBranchIds[0]) : authorizedBranchIds[0];
              
              if (!nickname && !firstName && !lastName) return null;

              const isDuplicate = (employee as any).allEmployees?.some((e: any) => {
                if (localEmployee.id && e.id === localEmployee.id) return false;
                if (e.branchId !== homeBranchId) return false;
                if (!e.isActive) return false;

                const newFullName = `${firstName || ''} ${localEmployee.middleName?.trim().toUpperCase() ? localEmployee.middleName.trim().toUpperCase() + ' ' : ''}${lastName || ''}`.trim().toUpperCase();
                const existingFullName = e.firstName && e.lastName ? `${e.firstName} ${e.middleName ? e.middleName + ' ' : ''}${e.lastName}`.trim().toUpperCase() : '';

                if (e.firstName && e.lastName && firstName && lastName) {
                  if (e.firstName.toUpperCase() === firstName && e.lastName.toUpperCase() === lastName) return true;
                }

                if (nickname && (e.name || '').toUpperCase() === nickname) return true;
                if (newFullName && (e.name || '').toUpperCase() === newFullName) return true;
                if (nickname && existingFullName === nickname) return true;

                return false;
              });

              if (isDuplicate) {
                return (
                  <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl flex items-center gap-2 animate-in slide-in-from-top-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></div>
                    <p className="text-[8px] font-bold text-rose-600 uppercase tracking-widest">Potential Duplicate in Target Branch</p>
                  </div>
                );
              }
              return null;
            })()}

            <div className="space-y-3">
              <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Authorized Workplace Assignment</label>
              <WorkplaceAuthorizationGrid 
                branches={branches}
                authorizedIds={authorizedBranchIds}
                onChange={(ids) => {
                  setAuthorizedBranchIds(ids);
                  // Ensure new branches have a default config in branchAllowances
                  const nextAllowances = { ...(localEmployee.branchAllowances || {}) };
                  ids.forEach(id => {
                    if (!nextAllowances[id]) {
                      nextAllowances[id] = { allowance: 0, role: 'THERAPIST' };
                    }
                  });
                  setLocalEmployee(prev => ({ ...prev, branchAllowances: nextAllowances }));
                }}
                disabled={isSaving}
              />
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest ml-1 mt-1">Select branches where this staff member is authorized to operate.</p>
            </div>

            {authorizedBranchIds.length > 0 && (
              <div className="space-y-3 bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100/50 animate-in slide-in-from-top-2">
                <label className="text-[9px] sm:text-[10px] font-bold text-indigo-400 uppercase tracking-widest ml-1">Primary Home Branch</label>
                <select 
                  value={finalHomeBranchId}
                  onChange={(e) => {
                    const newHomeId = e.target.value;
                    const others = authorizedBranchIds.filter(id => id !== newHomeId);
                    setAuthorizedBranchIds([newHomeId, ...others]);
                    playSound('click');
                  }}
                  className="w-full p-4 bg-white border-2 border-indigo-100 rounded-[18px] sm:rounded-[24px] font-bold text-xs sm:text-sm uppercase outline-none focus:border-indigo-500 transition-all shadow-sm"
                >
                  {authorizedBranchIds.map(id => {
                    const branch = branches.find(b => b.id === id);
                    return <option key={id} value={id}>{branch?.name || 'Unknown Branch'}</option>;
                  })}
                </select>
                <p className="text-[8px] font-bold text-indigo-400 uppercase tracking-widest ml-1">Select which authorized branch is the primary "Home" location.</p>
              </div>
            )}

            {/* Branch Specific Allowances */}
            {authorizedBranchIds.length > 0 && (
              <div className="space-y-4 bg-slate-50/50 p-4 rounded-3xl border border-slate-100 animate-in fade-in duration-500">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Workplace Configuration (Role & Allowance)</label>
                  <span className="text-[8px] font-black text-emerald-600 uppercase tracking-tighter bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">Source of Truth</span>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {authorizedBranchIds.map(id => {
                    const branch = branches.find(b => b.id === id);
                    if (!branch) return null;
                    const isHome = id === finalHomeBranchId;
                    const config = localEmployee.branchAllowances?.[id];
                    const allowance = typeof config === 'object' ? config.allowance : (config ?? 0);
                    const branchRole = typeof config === 'object' ? config.role : '';

                    return (
                      <div key={id} className={`flex flex-col gap-4 p-5 rounded-2xl border transition-all ${isHome ? 'bg-white border-indigo-200 shadow-md ring-2 ring-indigo-50' : 'bg-white border-slate-100 shadow-sm'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${isHome ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                              {isHome ? '🏠' : '🏢'}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] font-black text-slate-900 uppercase truncate">{branch.name}</p>
                              <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">{isHome ? 'Primary Home Branch' : 'Authorized Branch'}</p>
                            </div>
                          </div>
                          
                          <div className="w-32 relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">₱</span>
                            <input 
                              type="text"
                              inputMode="decimal"
                              value={allowance === 0 ? '' : allowance}
                              onChange={(e) => {
                                const rawVal = e.target.value;
                                // Allow empty or valid decimal numbers
                                if (rawVal !== '' && !/^\d*\.?\d*$/.test(rawVal)) return;
                                
                                const val = rawVal === '' ? 0 : Number(rawVal);
                                setLocalEmployee(prev => {
                                  const currentConfig = prev.branchAllowances?.[id];
                                  const currentRole = typeof currentConfig === 'object' ? currentConfig.role : '';
                                  
                                  return {
                                    ...prev,
                                    branchAllowances: {
                                      ...(prev.branchAllowances || {}),
                                      [id]: { allowance: val, role: currentRole }
                                    }
                                  };
                                });
                              }}
                              className="w-full pl-6 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold outline-none focus:border-emerald-500 transition-all text-right shadow-inner"
                              placeholder="0.00"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest ml-1">Assigned Roles</p>
                          <div className="flex flex-wrap gap-2">
                            {ROLE_ORDER.filter(r => r !== 'RELIEVER' || !isHome).map(role => {
                              const isActive = (branchRole || '').split(',').includes(role);
                              return (
                                <button
                                  key={role}
                                  type="button"
                                  onClick={() => toggleBranchRole(id, role)}
                                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${
                                    isActive 
                                      ? 'bg-slate-900 border-slate-900 text-white shadow-sm' 
                                      : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-200'
                                  }`}
                                >
                                  {role}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* BRANCH SPECIFIC CONFIGURATION */}

            {localEmployee.id && (
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-[22px] border border-slate-100">
                 <div className="space-y-0.5">
                   <p className="text-[9px] font-black uppercase text-slate-900 tracking-widest">Global Status</p>
                   <p className="text-[7px] font-bold text-slate-400 uppercase leading-relaxed">Staff availability across branches.</p>
                 </div>
                 <div className="flex items-center gap-2">
                    <button 
                      type="button"
                      title="Reset Credentials"
                      onClick={handleManualReset}
                      className="w-9 h-9 bg-white border border-slate-200 rounded-lg flex items-center justify-center hover:border-indigo-500 hover:bg-indigo-50/30 transition-all active:scale-[0.98] shadow-sm"
                    >
                      <span className="text-sm">🔑</span>
                    </button>
                    <button 
                      type="button"
                      title="Clear Login Data"
                      onClick={() => onWipe(localEmployee)}
                      className="w-9 h-9 bg-white border border-slate-200 rounded-lg flex items-center justify-center hover:border-rose-500 hover:bg-rose-50/30 transition-all active:scale-[0.98] shadow-sm"
                    >
                      <span className="text-sm">🛡️</span>
                    </button>
                    <div className="w-px h-6 bg-slate-200 mx-1"></div>
                    {localEmployee.isActive === false && onDelete && (
                      <button 
                        type="button"
                        title="Delete Personnel"
                        onClick={() => onDelete(localEmployee as Employee)}
                        className="w-9 h-9 bg-rose-50 border border-rose-100 rounded-lg flex items-center justify-center hover:border-rose-500 hover:bg-rose-500 hover:text-white transition-all active:scale-[0.98] shadow-sm text-rose-500"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                    <button 
                      type="button"
                      onClick={() => setLocalEmployee(prev => ({...prev, isActive: !prev.isActive}))}
                      className={`px-4 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border-2 transition-all ${localEmployee.isActive ? 'bg-emerald-600 border-emerald-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-400'}`}
                    >
                      {localEmployee.isActive ? 'Active' : 'Suspended'}
                    </button>
                 </div>
              </div>
            )}
          </div>
        </div>
        <div className="pt-6 sm:pt-8 shrink-0">
           <button type="submit" disabled={isSaving || !localEmployee.firstName || !localEmployee.lastName || authorizedBranchIds.length === 0} className="w-full bg-slate-900 text-white font-black py-5 sm:py-6 rounded-[20px] sm:rounded-[28px] uppercase tracking-widest text-[10px] sm:text-[11px] shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50">
             {isSaving ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : (localEmployee.id ? 'Commit Authorization' : 'Commit Registration')}
           </button>
           <button type="button" onClick={onClose} className="w-full py-3 text-slate-400 font-bold text-[9px] sm:text-[10px] uppercase tracking-widest text-center mt-2">Abort Process</button>
        </div>
      </form>
    </div>
  );
};