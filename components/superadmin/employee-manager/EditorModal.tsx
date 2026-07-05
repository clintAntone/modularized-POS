import React, { useState, useEffect, useRef } from 'react';
import { Employee, Branch, EmployeeDetails } from '../../../types';
import { DB_COLUMNS } from '../../../constants/db_schema';
import { WorkplaceAuthorizationGrid, ROLE_ORDER } from './SharedComponents';
import { UI_THEME } from '../../../constants/ui_designs';
import { playSound } from '../../../lib/audio';
import { getManilaTodayStr } from '../../../lib/time';
import { ProfileAvatar } from '../../ui/ProfileAvatar';

interface PersonalDetailsPayload {
  name: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  details: EmployeeDetails;
}

interface EditorModalProps {
  employee: Partial<Employee>;
  branches: Branch[];
  isSaving: boolean;
  error: string;
  onClose: () => void;
  onSave: (payload: any, authorizedIds: string[], profile: File | null) => void;
  onSavePersonalDetails?: (payload: PersonalDetailsPayload, profileFile: File | null) => void;
  onWipe: (employee: Partial<Employee>) => void;
  onReset?: (employee: Employee) => void;
  onDelete?: (employee: Employee) => void;
  onViewID?: (employee: Employee) => void;
}

const PillDropdown = ({ value, onChange, options, placeholder, className }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  className?: string;
}) => {
  const [open, setOpen] = React.useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const selected = options.find(o => o.value === value);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`${className} flex items-center justify-between w-full text-left ${selected ? 'text-slate-900' : 'text-slate-400'}`}
      >
        <span className="font-semibold">{selected ? selected.label : placeholder}</span>
        <svg className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-[calc(100%+6px)] left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden p-1 animate-in zoom-in-95 fade-in duration-150">
          {value && (
            <button type="button" onClick={() => { onChange(''); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-slate-300 hover:bg-slate-50 transition-colors">
              — Clear —
            </button>
          )}
          {options.map(opt => (
            <button key={opt.value} type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-between ${
                value === opt.value ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'
              }`}>
              {opt.label}
              {value === opt.value && (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const EditorModal: React.FC<EditorModalProps> = ({
  employee, branches, isSaving, error, onClose, onSave, onSavePersonalDetails, onWipe, onReset, onDelete, onViewID
}) => {
  const isExisting = !!employee.id;
  const [activeTab, setActiveTab] = useState<'assignment' | 'personal'>('assignment');

  // ── Assignment tab state ──────────────────────────────────────────
  const [localEmployee, setLocalEmployee] = useState(employee);
  const [authorizedBranchIds, setAuthorizedBranchIds] = useState<string[]>([]);
  const [pendingHomeId, setPendingHomeId] = useState<string | null>(null);
  const finalHomeBranchId = authorizedBranchIds[0] || '';

  useEffect(() => {
    if (finalHomeBranchId && localEmployee.branchAllowances?.[finalHomeBranchId]) {
      const config = localEmployee.branchAllowances[finalHomeBranchId];
      const role = typeof config === 'object' ? config.role : localEmployee.role;
      const allowance = typeof config === 'object' ? config.allowance : config;
      setLocalEmployee(prev => {
        if (prev.role === role && prev.allowance === allowance) return prev;
        return { ...prev, role: role || prev.role || '', allowance: allowance !== undefined ? Number(allowance) : (prev.allowance || 0) };
      });
    }
  }, [finalHomeBranchId]);

  useEffect(() => {
    if (employee.id) {
      if (branches.length === 0) return;
      const allowanceIds = employee.branchAllowances ? Object.keys(employee.branchAllowances) : [];
      const managingIds = branches.filter(b => b.manager?.toUpperCase() === employee.name?.toUpperCase()).map(b => b.id);
      const homeId = employee.branchId || '';
      const next = Array.from(new Set([homeId, ...allowanceIds, ...managingIds])).filter(Boolean);
      setAuthorizedBranchIds(prev => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
    } else {
      const next = employee.branchId ? [employee.branchId] : [];
      setAuthorizedBranchIds(prev => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
    }
  }, [employee.id, employee.name, employee.branchId, employee.branchAllowances, branches]);

  const handleSubmitAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    const firstName = localEmployee.firstName?.trim().toUpperCase() || '';
    const lastName = localEmployee.lastName?.trim().toUpperCase() || '';
    const displayName = localEmployee.name?.trim().toUpperCase() || `${firstName} ${lastName}`.trim();
    const filteredAllowances: Record<string, any> = {};
    authorizedBranchIds.forEach(id => {
      const config = localEmployee.branchAllowances?.[id];
      const allowanceObj = typeof config === 'object' && config !== null
        ? { ...config } : { allowance: Number(config || 0), role: '' };
      if (allowanceObj.role === undefined) allowanceObj.role = '';
      if (id === finalHomeBranchId && allowanceObj.role)
        allowanceObj.role = allowanceObj.role.split(',').filter((r: string) => r.trim().toUpperCase() !== 'RELIEVER').join(',');
      filteredAllowances[id] = allowanceObj;
    });
    const homeConfig = filteredAllowances[finalHomeBranchId] || { allowance: 0, role: '' };
    const payload: any = {
      [DB_COLUMNS.NAME]: displayName,
      [DB_COLUMNS.FIRST_NAME]: firstName,
      [DB_COLUMNS.MIDDLE_NAME]: localEmployee.middleName?.trim().toUpperCase() || null,
      [DB_COLUMNS.LAST_NAME]: lastName,
      [DB_COLUMNS.ROLE]: homeConfig.role,
      [DB_COLUMNS.ALLOWANCE]: Number(homeConfig.allowance),
      [DB_COLUMNS.BRANCH_ALLOWANCES]: filteredAllowances,
      [DB_COLUMNS.IS_ACTIVE]: localEmployee.isActive !== undefined ? localEmployee.isActive : true,
      [DB_COLUMNS.BRANCH_ID]: finalHomeBranchId,
      [DB_COLUMNS.PROFILE]: localEmployee.profile ?? null,
      [DB_COLUMNS.DETAILS]: localEmployee.details ?? null,
    };
    if (!localEmployee.id) {
      payload[DB_COLUMNS.USERNAME] = null;
      payload[DB_COLUMNS.LOGIN_PIN] = null;
      payload[DB_COLUMNS.PIN_SALT] = null;
      payload[DB_COLUMNS.REQUEST_RESET] = false;
    }
    onSave(payload, authorizedBranchIds, null);
  };

  const toggleBranchRole = (branchId: string, role: string) => {
    setLocalEmployee(prev => {
      const config = prev.branchAllowances?.[branchId];
      const currentRoles = (typeof config === 'object' ? config.role : '') || '';
      const selectedRoles = currentRoles.split(',').filter(Boolean);
      const nextRoles = selectedRoles.includes(role) ? selectedRoles.filter(r => r !== role) : [...selectedRoles, role];
      const allowance = typeof config === 'object' ? config.allowance : (config || 0);
      return { ...prev, branchAllowances: { ...(prev.branchAllowances || {}), [branchId]: { allowance, role: nextRoles.join(',') } } };
    });
    playSound('click');
  };

  // ── Personal Details tab state ────────────────────────────────────
  const [pdFirstName, setPdFirstName] = useState(employee.firstName || '');
  const [pdMiddleName, setPdMiddleName] = useState(employee.middleName || '');
  const [pdLastName, setPdLastName] = useState(employee.lastName || '');
  const [pdDetails, setPdDetails] = useState<EmployeeDetails>(employee.details || {});
  const [pdProfileFile, setPdProfileFile] = useState<File | null>(null);
  const [pdErrors, setPdErrors] = useState<Record<string, string>>({});
  const [empIdCopied, setEmpIdCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updPd = (patch: Partial<EmployeeDetails>) => {
    setPdDetails(prev => ({ ...prev, ...patch }));
    // Clear errors for updated fields
    const keys = Object.keys(patch);
    if (keys.some(k => pdErrors[k])) setPdErrors(prev => { const next = { ...prev }; keys.forEach(k => delete next[k]); return next; });
  };

  const validatePhone = (v: string) => {
    if (!v) return '';
    const digits = v.replace(/\D/g, '');
    if (digits.length !== 11) return 'Must be exactly 11 digits';
    if (!digits.startsWith('09')) return 'Must start with 09';
    return '';
  };

  const validateGmailField = (v: string) => {
    if (!v) return '';
    if (!v.toLowerCase().endsWith('@gmail.com')) return 'Must be a valid @gmail.com address';
    const local = v.toLowerCase().replace('@gmail.com', '');
    if (!local || !/^[a-z0-9._%+-]+$/.test(local)) return 'Invalid Gmail address';
    return '';
  };

  const validatePd = () => {
    const errors: Record<string, string> = {};
    if (!pdFirstName.trim()) errors.firstName = 'First name is required';
    if (!pdLastName.trim()) errors.lastName = 'Last name is required';
    if (pdDetails.dateStart && new Date(pdDetails.dateStart) > new Date()) errors.dateStart = 'Date started cannot be in the future';
    if (pdDetails.dateOfBirth && new Date(pdDetails.dateOfBirth) >= new Date()) errors.dateOfBirth = 'Date of birth must be in the past';
    const phoneErr = validatePhone(pdDetails.contactNumber || '');
    if (phoneErr) errors.contactNumber = phoneErr;
    const gmailErr = validateGmailField(pdDetails.gmail || '');
    if (gmailErr) errors.gmail = gmailErr;
    const emergencyPhoneErr = validatePhone(pdDetails.emergencyContactNumber || '');
    if (emergencyPhoneErr) errors.emergencyContactNumber = emergencyPhoneErr;
    setPdErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const pdDisplayName = `${pdFirstName.trim()} ${pdMiddleName.trim() ? pdMiddleName.trim() + ' ' : ''}${pdLastName.trim()}`.trim().toUpperCase() || employee.name || '';
  const profileSrc = pdProfileFile ? URL.createObjectURL(pdProfileFile) : employee.profile;

  const empId = employee.id && employee.timestamp
    ? (() => { const d = new Date(employee.timestamp); return `EMP-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}-${employee.id}`.toUpperCase(); })()
    : null;

  const handleSavePersonal = () => {
    if (!onSavePersonalDetails) return;
    if (!validatePd()) { playSound('warning'); return; }
    const fn = pdFirstName.trim().toUpperCase();
    const ln = pdLastName.trim().toUpperCase();
    const mn = pdMiddleName.trim().toUpperCase() || null;
    const name = `${fn} ${mn ? mn + ' ' : ''}${ln}`.trim();
    onSavePersonalDetails({ name, firstName: fn, middleName: mn, lastName: ln, details: pdDetails }, pdProfileFile);
  };

  // ── Shared styles ─────────────────────────────────────────────────
  const inputCls = 'w-full p-3 sm:p-4 bg-slate-50 border-2 border-transparent rounded-[14px] sm:rounded-[18px] font-bold text-xs sm:text-sm uppercase outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner';
  const pdInputCls = 'w-full p-3 sm:p-4 bg-slate-50 border-2 border-transparent rounded-[14px] sm:rounded-[18px] font-semibold text-xs sm:text-sm outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner';
  const pdInputErrCls = 'w-full p-3 sm:p-4 bg-rose-50 border-2 border-rose-200 rounded-[14px] sm:rounded-[18px] font-semibold text-xs sm:text-sm outline-none focus:border-rose-400 focus:bg-white transition-all shadow-inner';
  const labelCls = 'text-xs sm:text-xs font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1 block';
  const fieldErr = (key: string) => pdErrors[key]
    ? <p className="text-xs font-black text-rose-500 uppercase tracking-widest mt-1 ml-1">{pdErrors[key]}</p>
    : null;

  return (
    <div className={UI_THEME.layout.modalWrapper}>
      <form
        onSubmit={activeTab === 'assignment' ? handleSubmitAssignment : (e) => { e.preventDefault(); handleSavePersonal(); }}
        className={`relative ${UI_THEME.layout.modalLarge} ${UI_THEME.radius.modal} flex flex-col overflow-hidden max-h-[95vh] border border-slate-100 p-5 md:p-8`}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-4 shrink-0 -mx-5 md:-mx-8 -mt-5 md:-mt-8 px-4 md:px-8 pt-4 md:pt-6 pb-4 md:pb-5 bg-slate-100 border-b border-slate-200">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-900 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg overflow-hidden ring-2 ring-white ring-offset-1 ring-offset-slate-100">
                {isExisting
                  ? <ProfileAvatar name={localEmployee.name || ''} src={profileSrc || localEmployee.profile} size={48} />
                  : <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                }
              </div>
              {isExisting && (
                <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${localEmployee.isActive !== false ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-0.5">
                {isExisting ? 'Edit Employee' : 'New Registration'}
              </p>
              <h3 className="text-base sm:text-xl font-black text-slate-900 uppercase tracking-tighter leading-none truncate">
                {isExisting ? (localEmployee.name || 'UNNAMED') : 'New Personnel'}
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-3 shrink-0">
            {onViewID && isExisting && (
              <button
                type="button"
                onClick={() => onViewID(employee as Employee)}
                className="w-8 h-8 sm:w-9 sm:h-9 bg-slate-100 hover:bg-indigo-600 hover:text-white rounded-lg sm:rounded-xl text-slate-400 transition-all active:scale-90 flex items-center justify-center shadow-sm"
                title="View Company ID"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 sm:w-9 sm:h-9 bg-rose-500 hover:bg-rose-600 rounded-lg sm:rounded-xl text-white transition-all active:scale-90 flex items-center justify-center shadow-md shadow-rose-200"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" strokeWidth="3" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs — only for existing employees */}
        {isExisting && (
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-4 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('assignment')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 sm:px-3 rounded-lg text-xs sm:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                activeTab === 'assignment'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Assignment
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('personal')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 sm:px-3 rounded-lg text-xs sm:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                activeTab === 'personal'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Personal Details
            </button>
          </div>
        )}

        {/* Alerts */}
        {error && (
          <div className="bg-rose-50 border border-rose-100 p-3 rounded-2xl flex items-center gap-3 mb-3 shrink-0">
            <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e]"></div>
            <p className="text-xs font-black text-rose-600 uppercase tracking-widest">{error}</p>
          </div>
        )}
        {isExisting && localEmployee.requestReset && (
          <div className="bg-rose-600 text-white p-3 rounded-2xl flex items-center justify-center gap-3 animate-pulse shadow-lg shadow-rose-600/20 mb-3 shrink-0">
            <span>🆘</span>
            <p className="text-xs font-black uppercase tracking-[0.2em]">Personnel Requested Credential Recovery</p>
          </div>
        )}

        {/* ── ASSIGNMENT TAB ─────────────────────────────────────── */}
        {activeTab === 'assignment' && (
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-5 pr-1">

            {/* New employee name fields */}
            {!isExisting && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className={labelCls}>First Name</label>
                    <input required value={localEmployee.firstName || ''} onChange={e => { const v = e.target.value.toUpperCase(); setLocalEmployee(p => ({ ...p, firstName: v, name: `${v} ${p.middleName ? p.middleName.trim()+' ' : ''}${p.lastName||''}`.trim() })); }} className={inputCls} placeholder="FIRST NAME" />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>Last Name</label>
                    <input required value={localEmployee.lastName || ''} onChange={e => { const v = e.target.value.toUpperCase(); setLocalEmployee(p => ({ ...p, lastName: v, name: `${p.firstName||''} ${p.middleName ? p.middleName.trim()+' ' : ''}${v}`.trim() })); }} className={inputCls} placeholder="LAST NAME" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Middle Name <span className="normal-case opacity-50">(optional)</span></label>
                  <input value={localEmployee.middleName || ''} onChange={e => { const v = e.target.value.toUpperCase().replace(/[.,]/g,''); setLocalEmployee(p => ({ ...p, middleName: v, name: `${p.firstName||''} ${v ? v.trim()+' ' : ''}${p.lastName||''}`.trim() })); }} className={inputCls} placeholder="OPTIONAL" />
                </div>
                {(localEmployee.firstName || localEmployee.lastName) && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-0.5">Display Name</p>
                    <p className="text-sm font-black text-slate-900 uppercase">{localEmployee.name || '—'}</p>
                  </div>
                )}
                {(() => {
                  const fn = localEmployee.firstName?.trim().toUpperCase();
                  const ln = localEmployee.lastName?.trim().toUpperCase();
                  if (!fn && !ln) return null;
                  const isDup = (employee as any).allEmployees?.some((e: any) => {
                    if (e.branchId !== authorizedBranchIds[0] || !e.isActive) return false;
                    if (e.firstName?.toUpperCase() === fn && e.lastName?.toUpperCase() === ln) return true;
                    const full = `${fn} ${localEmployee.middleName?.trim().toUpperCase() ? localEmployee.middleName.trim().toUpperCase()+' ' : ''}${ln}`.trim();
                    return full && (e.name||'').toUpperCase() === full;
                  });
                  if (!isDup) return null;
                  return <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" /><p className="text-xs font-bold text-rose-600 uppercase tracking-widest">Potential Duplicate in Target Branch</p></div>;
                })()}
              </div>
            )}

            {/* Workplace Assignment */}
            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-2.5 px-4 py-3 bg-slate-50 border-b border-slate-200">
                <p className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">Authorized Workplaces</p>
              </div>
              <WorkplaceAuthorizationGrid
                branches={branches}
                authorizedIds={authorizedBranchIds}
                onChange={ids => {
                  setAuthorizedBranchIds(ids);
                  const next = { ...(localEmployee.branchAllowances || {}) };
                  ids.forEach(id => { if (!next[id]) next[id] = { allowance: 0, role: 'THERAPIST' }; });
                  setLocalEmployee(prev => ({ ...prev, branchAllowances: next }));
                }}
                disabled={isSaving}
              />
            </div>

            {/* Branch config cards */}
            {authorizedBranchIds.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Branch Configuration</p>
                  <span className="text-xs font-black text-emerald-600 uppercase tracking-tighter bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">Source of Truth</span>
                </div>
                {authorizedBranchIds.map(id => {
                  const branch = branches.find(b => b.id === id);
                  if (!branch) return null;
                  const isHome = id === finalHomeBranchId;
                  const config = localEmployee.branchAllowances?.[id];
                  const allowance = typeof config === 'object' ? config.allowance : (config ?? 0);
                  const branchRole = typeof config === 'object' ? config.role : '';
                  return (
                    <div key={id} className={`rounded-2xl border overflow-hidden ${isHome ? 'border-indigo-200' : 'border-slate-200'}`}>
                      <div className={`flex items-center justify-between gap-2 px-4 py-3 ${isHome ? 'bg-indigo-500' : 'bg-slate-600'}`}>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black text-white uppercase tracking-tight leading-tight truncate">{branch.name}</p>
                          {branch.manager && <p className="text-xs font-medium text-white/80 truncate mt-0.5">{branch.manager}</p>}
                        </div>
                        {!isHome ? (
                          <button type="button" onClick={() => { setPendingHomeId(id); playSound('click'); }} className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-white/20 hover:bg-white/30 active:scale-95 transition-all text-white">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                            <span className="text-xs font-black uppercase tracking-widest">Set Home</span>
                          </button>
                        ) : (
                          <div className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-white/20 text-white pointer-events-none">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" /></svg>
                            <span className="text-xs font-black uppercase tracking-widest">Home</span>
                          </div>
                        )}
                      </div>
                      <div className="bg-white divide-y divide-slate-100">
                        <div className="px-4 py-3">
                          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Daily Allowance</p>
                          <div className="relative">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₱</span>
                            <input type="text" inputMode="decimal" value={allowance === 0 ? '' : allowance}
                              onChange={e => {
                                const raw = e.target.value;
                                if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                                const val = raw === '' ? 0 : Number(raw);
                                setLocalEmployee(prev => { const cur = prev.branchAllowances?.[id]; const curRole = typeof cur === 'object' ? cur.role : ''; return { ...prev, branchAllowances: { ...(prev.branchAllowances||{}), [id]: { allowance: val, role: curRole } } }; });
                              }}
                              className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-emerald-500 focus:bg-white transition-all"
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                        <div className="px-4 py-3">
                          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Assigned Roles</p>
                          <div className="flex flex-wrap gap-2">
                            {ROLE_ORDER.filter(r => r !== 'MANAGER' && (r !== 'RELIEVER' || !isHome)).map(role => {
                              const isActive = (branchRole || '').split(',').includes(role);
                              return (
                                <button key={role} type="button" onClick={() => toggleBranchRole(id, role)}
                                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border-2 transition-all active:scale-95 ${
                                    isActive && role === 'THERAPIST' ? 'bg-emerald-100 border-emerald-200 text-emerald-700'
                                    : isActive && role === 'BONESETTER' ? 'bg-amber-100 border-amber-200 text-amber-700'
                                    : 'bg-white border-slate-200 text-slate-400 hover:border-slate-400 hover:text-slate-700'
                                  }`}
                                >
                                  {isActive && <svg className={`w-3 h-3 shrink-0 ${role === 'THERAPIST' ? 'text-emerald-600' : 'text-amber-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                  {role}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Status & Account */}
            {isExisting && (
              <div className="space-y-2">
                <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Status</p>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <p className="text-xs font-black uppercase text-slate-900 tracking-widest">Global Status</p>
                    <p className="text-xs font-bold text-slate-400 uppercase leading-relaxed mt-0.5">Staff availability across branches.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {localEmployee.isActive === false && onDelete && (
                      <button type="button" onClick={() => onDelete(localEmployee as Employee)} className="w-9 h-9 bg-rose-50 border border-rose-100 rounded-lg flex items-center justify-center hover:bg-rose-500 hover:text-white hover:border-rose-500 transition-all active:scale-95 text-rose-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    )}
                    <button type="button" onClick={() => setLocalEmployee(prev => ({ ...prev, isActive: !prev.isActive }))} className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest border-2 transition-all ${localEmployee.isActive ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-rose-50 border-rose-200 text-rose-500'}`}>
                      {localEmployee.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PERSONAL DETAILS TAB ───────────────────────────────── */}
        {activeTab === 'personal' && isExisting && (
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-5 pr-1">

            {/* Personal info */}
            <div className="rounded-2xl border-2 border-slate-200 overflow-hidden">
              <div className="flex items-center gap-2.5 px-4 py-3 bg-slate-100 border-b-2 border-slate-200">
                <div className="w-6 h-6 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <p className="text-xs font-black text-slate-700 uppercase tracking-widest">Personal Information</p>
              </div>
              <div className="p-4 space-y-3">

                {/* Photo + Employee ID */}
                <div className="flex items-center gap-4 bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <div className="relative shrink-0 group">
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden hover:border-emerald-500 hover:bg-emerald-50/30 relative shadow-sm active:scale-95 transition-all">
                      {profileSrc
                        ? <img src={profileSrc} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="Profile" />
                        : <svg className="w-6 h-6 text-slate-300 group-hover:text-emerald-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg>
                      }
                      {profileSrc && <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></div>}
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Employee ID</p>
                    {empId ? (
                      <button type="button" onClick={() => { navigator.clipboard.writeText(empId); setEmpIdCopied(true); setTimeout(() => setEmpIdCopied(false), 2000); }} className="w-full flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 hover:border-emerald-400 transition-all active:scale-[0.98] text-left">
                        <p className="text-xs font-black text-slate-700 font-mono flex-1 min-w-0 truncate">{empId}</p>
                        <span className="shrink-0 text-xs font-black uppercase tracking-widest text-slate-400">{empIdCopied ? '✓' : 'Copy'}</span>
                      </button>
                    ) : <p className="text-xs font-bold text-slate-300 italic">No ID yet</p>}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => setPdProfileFile(e.target.files?.[0] || null)} />
                </div>

                {/* Name fields */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>First Name</label>
                    <input value={pdFirstName} onChange={e => { setPdFirstName(e.target.value.toUpperCase()); if (pdErrors.firstName) setPdErrors(p => ({ ...p, firstName: '' })); }} className={pdErrors.firstName ? pdInputErrCls + ' uppercase font-bold' : inputCls} placeholder="FIRST NAME" />
                    {fieldErr('firstName')}
                  </div>
                  <div>
                    <label className={labelCls}>Last Name</label>
                    <input value={pdLastName} onChange={e => { setPdLastName(e.target.value.toUpperCase()); if (pdErrors.lastName) setPdErrors(p => ({ ...p, lastName: '' })); }} className={pdErrors.lastName ? pdInputErrCls + ' uppercase font-bold' : inputCls} placeholder="LAST NAME" />
                    {fieldErr('lastName')}
                  </div>
                </div>
                <div><label className={labelCls}>Middle Name <span className="normal-case opacity-50">(optional)</span></label><input value={pdMiddleName} onChange={e => setPdMiddleName(e.target.value.toUpperCase().replace(/[.,]/g, ''))} className={inputCls} placeholder="OPTIONAL" /></div>
                {pdDisplayName && pdDisplayName !== employee.name && (
                  <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
                    <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-0.5">New Display Name</p>
                    <p className="text-sm font-black text-amber-900 uppercase">{pdDisplayName}</p>
                  </div>
                )}
                <div className="border-t border-slate-100 pt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                  <label className={labelCls}>Date Started</label>
                  <input type="date" value={pdDetails.dateStart||''} max={getManilaTodayStr()} onChange={e => updPd({ dateStart: e.target.value })} className={`${pdErrors.dateStart ? pdInputErrCls : pdInputCls}${!pdDetails.dateStart ? ' date-empty' : ''}`} />
                  {fieldErr('dateStart')}
                </div>
                  <div>
                    <label className={labelCls}>Date of Birth</label>
                    <input type="date" value={pdDetails.dateOfBirth||''} max={getManilaTodayStr()} onChange={e => updPd({ dateOfBirth: e.target.value })} className={`${pdErrors.dateOfBirth ? pdInputErrCls : pdInputCls}${!pdDetails.dateOfBirth ? ' date-empty' : ''}`} />
                    {fieldErr('dateOfBirth')}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Gender</label>
                    <PillDropdown
                      value={pdDetails.gender || ''}
                      onChange={v => updPd({ gender: v as any || undefined })}
                      options={[
                        { value: 'MALE', label: 'Male' },
                        { value: 'FEMALE', label: 'Female' },
                        { value: 'OTHER', label: 'Other' },
                      ]}
                      placeholder="Select gender"
                      className={pdInputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Marital Status</label>
                    <PillDropdown
                      value={pdDetails.maritalStatus || ''}
                      onChange={v => updPd({ maritalStatus: v as any || undefined })}
                      options={[
                        { value: 'SINGLE', label: 'Single' },
                        { value: 'MARRIED', label: 'Married' },
                        { value: 'WIDOWED', label: 'Widowed' },
                        { value: 'SEPARATED', label: 'Separated' },
                      ]}
                      placeholder="Select status"
                      className={pdInputCls}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Contact Number</label>
                  <input type="tel" value={pdDetails.contactNumber||''} maxLength={11}
                    onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0,11); updPd({ contactNumber: v }); }}
                    placeholder="09XXXXXXXXX" className={pdErrors.contactNumber ? pdInputErrCls : pdInputCls} />
                  {fieldErr('contactNumber')}
                  {!pdErrors.contactNumber && pdDetails.contactNumber && (
                    <p className="text-xs font-bold text-slate-400 mt-1 ml-1">{pdDetails.contactNumber.length}/11 digits</p>
                  )}
                </div>
                <div><label className={labelCls}>Address</label><input type="text" value={pdDetails.address||''} onChange={e => updPd({ address: e.target.value })} placeholder="Street, City, Province" className={pdInputCls} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelCls}>Facebook <span className="normal-case opacity-50">(optional)</span></label><input type="text" value={pdDetails.facebookLink||''} onChange={e => updPd({ facebookLink: e.target.value })} placeholder="facebook.com/..." className={pdInputCls} /></div>
                  <div>
                    <label className={labelCls}>Gmail <span className="normal-case opacity-50">(optional)</span></label>
                    <input type="email" value={pdDetails.gmail||''} onChange={e => updPd({ gmail: e.target.value })} placeholder="example@gmail.com" className={pdErrors.gmail ? pdInputErrCls : pdInputCls} />
                    {fieldErr('gmail')}
                  </div>
                </div>
                </div>{/* end pt-3 */}
              </div>
            </div>

            {/* Emergency contact */}
            <div className="rounded-2xl border-2 border-rose-200 overflow-hidden">
              <div className="flex items-center gap-2.5 px-4 py-3 bg-rose-50 border-b-2 border-rose-200">
                <div className="w-6 h-6 rounded-lg bg-rose-500 flex items-center justify-center shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <p className="text-xs font-black text-rose-700 uppercase tracking-widest">Emergency Contact</p>
              </div>
              <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Contact Person</label><input type="text" value={pdDetails.emergencyContactName||''} onChange={e => updPd({ emergencyContactName: e.target.value })} placeholder="Full name" className={pdInputCls} /></div>
                <div><label className={labelCls}>Relationship</label><input type="text" value={pdDetails.emergencyContactRelationship||''} onChange={e => updPd({ emergencyContactRelationship: e.target.value })} placeholder="e.g. Spouse, Parent" className={pdInputCls} /></div>
              </div>
              <div>
                <label className={labelCls}>Contact Number</label>
                <input type="tel" value={pdDetails.emergencyContactNumber||''} maxLength={11}
                  onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0,11); updPd({ emergencyContactNumber: v }); }}
                  placeholder="09XXXXXXXXX" className={pdErrors.emergencyContactNumber ? pdInputErrCls : pdInputCls} />
                {fieldErr('emergencyContactNumber')}
                {!pdErrors.emergencyContactNumber && pdDetails.emergencyContactNumber && (
                  <p className="text-xs font-bold text-slate-400 mt-1 ml-1">{pdDetails.emergencyContactNumber.length}/11 digits</p>
                )}
              </div>
              <div><label className={labelCls}>Address</label><input type="text" value={pdDetails.emergencyContactAddress||''} onChange={e => updPd({ emergencyContactAddress: e.target.value })} placeholder="Street, City, Province" className={pdInputCls} /></div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-3 sm:pt-5 shrink-0 space-y-1.5">
          {activeTab === 'assignment' && (() => {
            const zeroIds = authorizedBranchIds.filter(id => { const cfg = localEmployee.branchAllowances?.[id]; const v = typeof cfg === 'object' && cfg !== null ? cfg.allowance : (typeof cfg === 'number' ? cfg : 0); return (v ?? 0) <= 0; });
            const ok = zeroIds.length === 0;
            const canSubmit = isExisting ? authorizedBranchIds.length > 0 && ok : !!localEmployee.firstName && !!localEmployee.lastName && authorizedBranchIds.length > 0 && ok;
            return (
              <>
                {!ok && (localEmployee.firstName || isExisting) && <p className="text-center text-xs font-black text-rose-500 uppercase tracking-widest animate-pulse">All branches must have a non-zero allowance</p>}
                <button type="submit" disabled={isSaving || !canSubmit} className="w-full bg-slate-900 text-white font-black py-3.5 sm:py-5 rounded-[16px] sm:rounded-[20px] uppercase tracking-widest text-xs shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                  {isSaving ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : (isExisting ? 'Save Assignment' : 'Register Employee')}
                </button>
              </>
            );
          })()}
          {activeTab === 'personal' && (
            <>
              {Object.keys(pdErrors).filter(k => pdErrors[k]).length > 0 && (
                <p className="text-center text-xs font-black text-rose-500 uppercase tracking-widest">Please fix the errors above before saving</p>
              )}
              <button type="submit" disabled={isSaving} className="w-full bg-slate-900 text-white font-black py-3.5 sm:py-5 rounded-[16px] sm:rounded-[20px] uppercase tracking-widest text-xs shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                {isSaving ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : 'Save Personal Details'}
              </button>
            </>
          )}
          <button type="button" onClick={onClose} className="w-full py-2.5 text-slate-400 font-bold text-xs uppercase tracking-widest text-center">Cancel</button>
        </div>

        {/* Set Home Branch confirmation */}
        {pendingHomeId && (() => {
        const pendingBranch = branches.find(b => b.id === pendingHomeId);
        const currentHome = branches.find(b => b.id === finalHomeBranchId);
        return (
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 rounded-[inherit] p-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95 fade-in duration-150">
              <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight text-center mb-1">Change Home Branch?</h4>
              <p className="text-xs font-semibold text-slate-400 text-center leading-relaxed mb-1">
                From <span className="font-black text-slate-600">{currentHome?.name || 'None'}</span>
              </p>
              <p className="text-xs font-semibold text-slate-400 text-center leading-relaxed mb-5">
                To <span className="font-black text-indigo-600">{pendingBranch?.name}</span>
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPendingHomeId(null)}
                  className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-xs font-black uppercase tracking-widest text-slate-500 hover:border-slate-300 transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthorizedBranchIds([pendingHomeId, ...authorizedBranchIds.filter(x => x !== pendingHomeId)]);
                    setPendingHomeId(null);
                    playSound('success');
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-xs font-black uppercase tracking-widest text-white hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-200"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      </form>
    </div>
  );
};
