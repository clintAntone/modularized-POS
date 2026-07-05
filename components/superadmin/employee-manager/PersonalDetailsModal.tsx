import React, { useState, useRef } from 'react';
import { Employee, EmployeeDetails } from '../../../types';
import { UI_THEME } from '../../../constants/ui_designs';

interface PersonalDetailsPayload {
  name: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  details: EmployeeDetails;
}

interface PersonalDetailsModalProps {
  employee: Employee;
  isSaving: boolean;
  onClose: () => void;
  onSave: (payload: PersonalDetailsPayload, profileFile: File | null) => void;
}

export const PersonalDetailsModal: React.FC<PersonalDetailsModalProps> = ({ employee, isSaving, onClose, onSave }) => {
  const [firstName, setFirstName] = useState(employee.firstName || '');
  const [middleName, setMiddleName] = useState(employee.middleName || '');
  const [lastName, setLastName] = useState(employee.lastName || '');
  const [details, setDetails] = useState<EmployeeDetails>(employee.details || {});
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [empIdCopied, setEmpIdCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upd = (patch: Partial<EmployeeDetails>) => setDetails(prev => ({ ...prev, ...patch }));

  const displayName = `${firstName.trim()} ${middleName.trim() ? middleName.trim() + ' ' : ''}${lastName.trim()}`.trim().toUpperCase() || employee.name || '';

  const empId = employee.timestamp
    ? (() => { const d = new Date(employee.timestamp); return `EMP-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}-${employee.id}`.toUpperCase(); })()
    : null;

  const profileSrc = profileFile ? URL.createObjectURL(profileFile) : employee.profile;

  const inputCls = 'w-full p-3 sm:p-4 bg-slate-50 border-2 border-transparent rounded-[14px] sm:rounded-[18px] font-semibold text-xs sm:text-sm outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner';
  const inputClsUpper = inputCls + ' uppercase font-bold';
  const labelCls = 'text-xs sm:text-xs font-medium text-slate-400 uppercase tracking-wide ml-1 mb-1 block';

  const handleSave = () => {
    const fn = firstName.trim().toUpperCase();
    const ln = lastName.trim().toUpperCase();
    const mn = middleName.trim().toUpperCase() || null;
    const name = `${fn} ${mn ? mn + ' ' : ''}${ln}`.trim();
    onSave({ name, firstName: fn, middleName: mn, lastName: ln, details }, profileFile);
  };

  return (
    <div className={UI_THEME.layout.modalWrapper}>
      <div className={`${UI_THEME.layout.modalLarge} ${UI_THEME.radius.modal} flex flex-col overflow-hidden max-h-[95vh] border border-slate-100 p-5 md:p-8`}>

        {/* Header */}
        <div className="flex justify-between items-center mb-4 sm:mb-6 shrink-0">
          <div className="min-w-0 flex-1">
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 uppercase tracking-tighter leading-none truncate">{employee.name || 'UNNAMED'}</h3>
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest mt-1">Personal Details</p>
          </div>
          <button type="button" onClick={onClose} className="ml-4 p-2 sm:p-3 bg-slate-50 rounded-xl sm:rounded-2xl text-slate-300 hover:text-slate-900 transition-all active:scale-90 shadow-sm border border-slate-100 shrink-0">
            <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" strokeWidth="2.5" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar space-y-5 pr-1">

          {/* Photo + Employee ID */}
          <div className="flex items-center gap-4 bg-slate-50 rounded-2xl p-3 border border-slate-100">
            {/* Photo */}
            <div className="relative shrink-0 group">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-16 h-16 sm:w-24 sm:h-24 rounded-2xl bg-white border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden transition-all hover:border-emerald-500 hover:bg-emerald-50/30 relative shadow-sm active:scale-95"
              >
                {profileSrc ? (
                  <img src={profileSrc} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="Profile" />
                ) : (
                  <svg className="w-5 h-5 sm:w-7 sm:h-7 text-slate-300 group-hover:text-emerald-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  </svg>
                )}
                {profileSrc && (
                  <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>
                )}
              </button>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 sm:w-6 sm:h-6 bg-emerald-500 rounded-lg border-2 border-white flex items-center justify-center text-white z-10">
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </div>
            </div>

            {/* Employee ID */}
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">Employee ID</p>
              {empId ? (
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(empId); setEmpIdCopied(true); setTimeout(() => setEmpIdCopied(false), 2000); }}
                  className="w-full flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 sm:px-4 sm:py-3 hover:border-emerald-400 transition-all active:scale-[0.98] text-left"
                >
                  <p className="text-xs sm:text-sm font-black text-slate-700 tracking-wider font-mono flex-1 min-w-0 break-all">{empId}</p>
                  <span className="shrink-0 text-xs sm:text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {empIdCopied ? '✓ Copied' : 'Copy'}
                  </span>
                </button>
              ) : (
                <p className="text-xs font-bold text-slate-300 italic">No ID yet</p>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => setProfileFile(e.target.files?.[0] || null)} />
          </div>

          {/* Name fields */}
          <div className="space-y-3">
            <p className="text-xs font-black text-slate-400 uppercase tracking-[0.25em]">Name</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>First Name</label>
                <input
                  value={firstName}
                  onChange={e => setFirstName(e.target.value.toUpperCase())}
                  className={inputClsUpper}
                  placeholder="FIRST NAME"
                />
              </div>
              <div>
                <label className={labelCls}>Last Name</label>
                <input
                  value={lastName}
                  onChange={e => setLastName(e.target.value.toUpperCase())}
                  className={inputClsUpper}
                  placeholder="LAST NAME"
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Middle Name <span className="normal-case opacity-50">(optional)</span></label>
              <input
                value={middleName}
                onChange={e => setMiddleName(e.target.value.toUpperCase().replace(/[.,]/g, ''))}
                className={inputClsUpper}
                placeholder="OPTIONAL"
              />
            </div>
            {displayName && displayName !== employee.name && (
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
                <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-0.5">New Display Name</p>
                <p className="text-sm font-black text-amber-900 uppercase">{displayName}</p>
              </div>
            )}
          </div>

          {/* Personal info */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <p className="text-xs font-black text-slate-400 uppercase tracking-[0.25em]">Personal Information</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Date Started</label>
                <input type="date" value={details.dateStart || ''} onChange={e => upd({ dateStart: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Date of Birth</label>
                <input type="date" value={details.dateOfBirth || ''} onChange={e => upd({ dateOfBirth: e.target.value })} className={inputCls} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Gender</label>
                <select value={details.gender || ''} onChange={e => upd({ gender: e.target.value as any })} className={inputCls}>
                  <option value="">— Select —</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Marital Status</label>
                <select value={details.maritalStatus || ''} onChange={e => upd({ maritalStatus: e.target.value as any })} className={inputCls}>
                  <option value="">— Select —</option>
                  <option value="SINGLE">Single</option>
                  <option value="MARRIED">Married</option>
                  <option value="WIDOWED">Widowed</option>
                  <option value="SEPARATED">Separated</option>
                </select>
              </div>
            </div>

            <div>
              <label className={labelCls}>Contact Number</label>
              <input type="tel" value={details.contactNumber || ''} onChange={e => upd({ contactNumber: e.target.value })} placeholder="09XX XXX XXXX" className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>Address</label>
              <input type="text" value={details.address || ''} onChange={e => upd({ address: e.target.value })} placeholder="Street, City, Province" className={inputCls} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Facebook <span className="normal-case font-bold opacity-50">(optional)</span></label>
                <input type="text" value={details.facebookLink || ''} onChange={e => upd({ facebookLink: e.target.value })} placeholder="facebook.com/..." className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Gmail <span className="normal-case font-bold opacity-50">(optional)</span></label>
                <input type="email" value={details.gmail || ''} onChange={e => upd({ gmail: e.target.value })} placeholder="example@gmail.com" className={inputCls} />
              </div>
            </div>
          </div>

          {/* Emergency contact */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <p className="text-xs font-black text-slate-400 uppercase tracking-[0.25em]">Emergency Contact</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Contact Person</label>
                <input type="text" value={details.emergencyContactName || ''} onChange={e => upd({ emergencyContactName: e.target.value })} placeholder="Full name" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Relationship</label>
                <input type="text" value={details.emergencyContactRelationship || ''} onChange={e => upd({ emergencyContactRelationship: e.target.value })} placeholder="e.g. Spouse, Parent" className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Contact Number</label>
              <input type="tel" value={details.emergencyContactNumber || ''} onChange={e => upd({ emergencyContactNumber: e.target.value })} placeholder="09XX XXX XXXX" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Address</label>
              <input type="text" value={details.emergencyContactAddress || ''} onChange={e => upd({ emergencyContactAddress: e.target.value })} placeholder="Street, City, Province" className={inputCls} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-6 shrink-0 space-y-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            className="w-full bg-slate-900 text-white font-black py-5 sm:py-6 rounded-xl sm:rounded-2xl uppercase tracking-widest text-xs sm:text-xs shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {isSaving
              ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              : 'Save Personal Details'
            }
          </button>
          <button type="button" onClick={onClose} className="w-full py-3 text-slate-400 font-bold text-xs sm:text-xs uppercase tracking-widest text-center">Cancel</button>
        </div>
      </div>
    </div>
  );
};
