import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Employee, Branch } from '../../../../types';
import { UI_THEME } from '../../../../constants/ui_designs';
import { playSound } from '../../../../lib/audio';
import { getInitials } from '../../../../lib/payroll';
import { RecoveryModal } from './RecoveryModal';
import { FaceEnrollment } from './FaceEnrollment';
import { Lock, Clock, X, UserPlus, Search, AlertCircle, Plus, Camera, RefreshCw, MapPin, ScanFace } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { DB_TABLES } from '../../../../constants/db_schema';

interface StaffModalsProps {
  isTimeModalOpen: boolean;
  isModalOpen: boolean;
  isPullMode?: boolean;
  showBranchClosedModal: boolean;
  recoveryEmployee: Employee | null;
  selectedEmpForTime: Employee | null;
  editingEmployee: Employee | null;
  isSyncing: boolean;
  uploadProgress: number;
  profileFile: File | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
  branches: Branch[];
  allEmployees?: Employee[];
  branchId: string;
  clockOutLocked?: boolean;
  onCloseModals: () => void;
  onCloseRecovery: () => void;
  onTimeAction: () => void;
  onSaveEmployee: () => void;
  onRefresh: (quiet?: boolean) => void;
  onSyncStatusChange: (isSyncing: boolean) => void;
  setEditingEmployee: (emp: Employee) => void;
  setProfileFile: (file: File | null) => void;
  toggleRole: (role: string) => void;
  getShiftState: (empId: string) => 'OFF' | 'ONGOING';
  isManagerView?: boolean;
}

export const StaffModals: React.FC<StaffModalsProps> = (props) => {
  const rolesList = ['THERAPIST', 'BONESETTER'];
  // True when editing an already-enrolled cross-branch employee (name is owned by their home branch)
  const isExistingReliever = !!(props.editingEmployee?.id && props.editingEmployee?.branchId && props.editingEmployee.branchId !== props.branchId);
  // Managers can edit allowance but never name
  const isNameLocked = props.isManagerView || props.isPullMode || isExistingReliever || !!props.editingEmployee?.id;
  // Photo can always be changed unless it's a pull-mode or cross-branch reliever
  const isPhotoLocked = props.isPullMode || isExistingReliever;
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<Employee[]>([]);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [empIdCopied, setEmpIdCopied] = React.useState(false);
  const [isSavingFace, setIsSavingFace] = React.useState(false);
  const [showFaceEnrollModal, setShowFaceEnrollModal] = React.useState(false);

  // ── Hold-to-confirm state ──────────────────────────────────────
  const [holdProgress, setHoldProgress] = React.useState(0);
  const holdIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const holdFiredRef = React.useRef(false);
  const HOLD_DURATION_MS = 1500;
  const TICK_MS = 20;

  const startHold = () => {
    if (props.isSyncing) return;
    holdFiredRef.current = false;
    setHoldProgress(0);
    holdIntervalRef.current = setInterval(() => {
      setHoldProgress(prev => {
        const next = Math.min(prev + (TICK_MS / HOLD_DURATION_MS) * 100, 100);
        if (next >= 100 && holdIntervalRef.current) {
          clearInterval(holdIntervalRef.current);
          holdIntervalRef.current = null;
        }
        return next;
      });
    }, TICK_MS);
  };

  // Fire onTimeAction once when hold completes — outside the state updater to avoid setState-in-render
  React.useEffect(() => {
    if (holdProgress >= 100 && !holdFiredRef.current) {
      holdFiredRef.current = true;
      props.onTimeAction();
    }
  }, [holdProgress]);

  const cancelHold = () => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    if (!holdFiredRef.current) setHoldProgress(0);
  };

  // Clean up on unmount
  React.useEffect(() => () => { if (holdIntervalRef.current) clearInterval(holdIntervalRef.current); }, []);

  // Reset hold when modal closes
  React.useEffect(() => {
    if (!props.isTimeModalOpen) {
      cancelHold();
      setHoldProgress(0);
      holdFiredRef.current = false;
    }
  }, [props.isTimeModalOpen]);

  if (!props.isTimeModalOpen && !props.isModalOpen && !props.showBranchClosedModal && !props.recoveryEmployee) return null;

  const isNewStaff = !props.editingEmployee?.id;

  const handleSearch = () => {
    const raw = searchQuery.toUpperCase().trim();
    // Strip legacy EMP-XX-XX- prefix so old-format IDs still resolve
    const term = raw.replace(/^EMP-\d{2}-\d{2}-/, '');
    setSearchError(null);
    setSearchResults([]);

    if (term.length < 3) {
      setSearchError('Enter at least 3 characters');
      playSound('warning');
      return;
    }

    const stripEmpPrefix = (s: string) => s.replace(/^EMP-\d{2}-\d{2}-/, '');

    const allMatches = (props.allEmployees || []).filter(emp => {
      if (!emp.isActive) return false;

      const name = (emp.name || '').toUpperCase();
      const firstName = (emp.firstName || '').toUpperCase();
      const lastName = (emp.lastName || '').toUpperCase();
      const fullName = `${firstName} ${lastName}`.trim();
      const id = (emp.id || '').toUpperCase();
      // Normalize stored ID the same way so EMP-04-05-YZKA7KYV ↔ YZKA7KYV both match
      const idNorm = stripEmpPrefix(id);

      return name.includes(term) ||
             firstName.includes(term) ||
             lastName.includes(term) ||
             fullName.includes(term) ||
             id.includes(term) ||
             idNorm.includes(term) ||
             term.includes(idNorm);
    });

    if (allMatches.length === 0) {
      setSearchError('No personnel found with that name or ID');
      playSound('warning');
      return;
    }

    const matchesOutside = allMatches.filter(emp => emp.branchId !== props.branchId);

    if (matchesOutside.length === 0) {
      setSearchError('Staff member is already registered in this branch');
      playSound('warning');
      return;
    }

    if (matchesOutside.length === 1) {
      const found = matchesOutside[0];
      
      // RELIEVER status is derived from branchId mismatch. 
      // We no longer inject or require 'RELIEVER' in the role string.
      const defaultRole = found.role || '';

      props.setEditingEmployee({
        ...found,
        branchAllowances: {
          ...(found.branchAllowances || {}),
          [props.branchId]: { 
            allowance: found.allowance || 0, 
            role: defaultRole
          }
        }
      });
      setSearchQuery('');
      setSearchResults([]);
      playSound('success');
    } else {
      setSearchResults(matchesOutside);
      playSound('click');
    }
  };

  const modalContent = (
    <>
      {/* Recovery Modal */}
      {props.recoveryEmployee && (
        <RecoveryModal 
          employee={props.recoveryEmployee}
          branches={props.branches}
          isSaving={props.isSyncing}
          onClose={props.onCloseRecovery}
          onRefresh={props.onRefresh}
          onSyncStatusChange={props.onSyncStatusChange}
        />
      )}

      {/* BRANCH CLOSED WARNING MODAL */}
      {props.showBranchClosedModal && (
        <div className={`${UI_THEME.layout.modalWrapper} no-print`}>
          <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-8 sm:p-12 text-center border border-rose-100 bg-white relative overflow-hidden`}>
            {/* Background Accent */}
            <div className="absolute top-0 left-0 w-full h-1.5 bg-rose-500"></div>
            
            <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner animate-bounce">
              <Lock className="w-10 h-10" strokeWidth={2.5} />
            </div>
            
            <h4 className="text-2xl font-bold text-slate-900 uppercase tracking-tighter mb-4">Branch is Closed</h4>
            
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed mb-10 max-w-[280px] mx-auto">
              Personnel clock-in is restricted while the branch is offline. Please initialize the branch operations first.
            </p>
            
            <button 
              onClick={props.onCloseModals}
              className="w-full py-5 bg-slate-900 text-white rounded-2xl font-bold uppercase tracking-widest text-[12px] shadow-xl active:scale-95 transition-all"
            >
              Acknowledged
            </button>
          </div>
        </div>
      )}

      {/* CLOCK MODAL */}
      {props.isTimeModalOpen && props.selectedEmpForTime && (() => {
        const isOngoing = props.getShiftState(props.selectedEmpForTime.id) === 'ONGOING';
        const isClockIn = !isOngoing;
        const accent = isClockIn ? 'emerald' : 'rose';
        const label = isClockIn ? 'Clock-In' : 'Clock-Out';
        const isHolding = holdProgress > 0 && holdProgress < 100;

        return (
          <div className={`${UI_THEME.layout.modalWrapper} no-print`}>
            <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-6 sm:p-10 text-center border border-slate-100 overflow-hidden`}>

              {/* Icon */}
              <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-xl ${isClockIn ? 'bg-emerald-600' : 'bg-rose-600'} text-white`}>
                <Clock className="w-8 h-8 sm:w-10 sm:h-10" strokeWidth={2.5} />
              </div>

              {/* Employee Info */}
              <h4 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tighter mb-1">
                {props.selectedEmpForTime.name}
              </h4>
              <p className={`text-[9px] font-black uppercase tracking-[0.3em] mb-1 ${isClockIn ? 'text-emerald-600' : 'text-rose-500'}`}>
                {label}
              </p>
              <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed mb-8 sm:mb-10">
                {isClockIn ? 'Initializing duty shift protocol.' : 'Terminating active duty session.'}
              </p>

              {/* Hold-to-confirm clock button */}
              <div className="flex flex-col items-center gap-4 select-none">
                {(() => {
                  const r = 54;
                  const circ = 2 * Math.PI * r;
                  const offset = circ * (1 - holdProgress / 100);
                  const color = isClockIn ? '#059669' : '#e11d48';
                  const trackColor = isClockIn ? '#d1fae5' : '#ffe4e6';
                  const confirmed = holdProgress >= 100;
                  const locked = !isClockIn && !!props.clockOutLocked;

                  return (
                    <button
                      disabled={props.isSyncing || confirmed || locked}
                      onMouseDown={locked ? undefined : startHold}
                      onMouseUp={locked ? undefined : cancelHold}
                      onTouchStart={locked ? undefined : () => startHold()}
                      onTouchEnd={locked ? undefined : cancelHold}
                      onTouchCancel={locked ? undefined : cancelHold}
                      onContextMenu={e => e.preventDefault()}
                      className={`relative w-36 h-36 sm:w-44 sm:h-44 rounded-full flex items-center justify-center shadow-xl transition-all ${locked || props.isSyncing ? 'opacity-40 cursor-not-allowed' : 'active:scale-95 cursor-pointer'}`}
                      style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'none', background: confirmed ? color : trackColor, pointerEvents: locked ? 'none' : undefined }}
                    >
                      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 128 128">
                        <circle cx="64" cy="64" r={r} fill="none" stroke={trackColor} strokeWidth="8" />
                        <circle
                          cx="64" cy="64" r={r}
                          fill="none"
                          stroke={color}
                          strokeWidth="8"
                          strokeLinecap="round"
                          strokeDasharray={circ}
                          strokeDashoffset={offset}
                          style={{ transition: 'stroke-dashoffset 20ms linear' }}
                        />
                        {[0, 90, 180, 270].map(deg => {
                          const rad = (deg * Math.PI) / 180;
                          const x1 = 64 + (r - 10) * Math.cos(rad);
                          const y1 = 64 + (r - 10) * Math.sin(rad);
                          const x2 = 64 + (r - 4) * Math.cos(rad);
                          const y2 = 64 + (r - 4) * Math.sin(rad);
                          return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />;
                        })}
                      </svg>

                      <span className="relative z-10 flex flex-col items-center gap-1 pointer-events-none">
                        {props.isSyncing ? (
                          <span className="w-6 h-6 border-2 border-current/30 border-t-current rounded-full animate-spin" style={{ borderTopColor: color }} />
                        ) : confirmed ? (
                          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <>
                            <span className="text-[11px] font-black uppercase tracking-widest" style={{ color }}>
                              {isHolding ? `${Math.round(holdProgress)}%` : label}
                            </span>
                            {!isHolding && (
                              <span className="text-[8px] font-bold uppercase tracking-widest opacity-60" style={{ color }}>Hold</span>
                            )}
                          </>
                        )}
                      </span>
                    </button>
                  );
                })()}

                {/* Hint */}
                {!isHolding && holdProgress === 0 && !props.isSyncing && (
                  <p className="text-[8px] font-bold uppercase tracking-widest text-center" style={{ color: (!isClockIn && props.clockOutLocked) ? '#fca5a5' : '#cbd5e1' }}>
                    {!isClockIn && props.clockOutLocked ? 'Available after 1 min from clock-in' : 'Press and hold to confirm'}
                  </p>
                )}

                <button
                  onClick={() => { cancelHold(); props.onCloseModals(); }}
                  disabled={props.isSyncing}
                  className="w-full py-3 text-slate-400 font-bold text-[9px] sm:text-[10px] uppercase tracking-widest hover:text-slate-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* EDITOR MODAL */}
      {props.isModalOpen && props.editingEmployee && (
        <div className={`${UI_THEME.layout.modalWrapper} no-print`}>
           <div className={`w-full max-w-lg bg-white shadow-2xl animate-in zoom-in-95 duration-300 ${UI_THEME.radius.modal} flex flex-col overflow-hidden max-h-[95vh] border border-slate-100`}>

              {/* ── Header ── */}
              <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-slate-100 shrink-0">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-200/60 flex items-center justify-center shrink-0 overflow-hidden">
                  {(props.profileFile || props.editingEmployee.profile) ? (
                    <img src={props.profileFile ? URL.createObjectURL(props.profileFile) : props.editingEmployee.profile} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <span className="text-[11px] font-black text-emerald-600">{getInitials(props.editingEmployee.name || (props.isPullMode ? 'ER' : 'NS'))}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.3em]">
                    {props.editingEmployee.id ? 'Staff Profile' : props.isPullMode ? 'Add Reliever' : 'New Employee'}
                  </p>
                  <h3 className="text-[13px] font-black text-slate-900 uppercase tracking-tight leading-tight truncate">
                    {props.editingEmployee.id ? props.editingEmployee.name : props.isPullMode ? 'Enroll from Another Branch' : 'Register New Employee'}
                  </h3>
                </div>
                <button onClick={props.onCloseModals} className="w-8 h-8 bg-slate-100 rounded-xl text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-all active:scale-90 flex items-center justify-center shrink-0">
                  <X className="w-4 h-4" strokeWidth={2.5} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 px-5 py-4 pr-1">

                {/* Context banner — New Employee */}
                {isNewStaff && !props.isPullMode && (
                  <div className="flex gap-3 bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3">
                    <div className="w-5 h-5 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-3 h-3 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-indigo-700 uppercase tracking-widest">New Employee — No Existing Record</p>
                      <p className="text-[8px] font-medium text-indigo-500 mt-0.5 leading-relaxed">Use this form only for staff who are brand new to the network. If this person already works at another branch, use <span className="font-black">Add Reliever</span> instead.</p>
                    </div>
                  </div>
                )}

                {/* Context banner — Reliever */}
                {isNewStaff && props.isPullMode && (
                  <div className="flex gap-3 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
                    <div className="w-5 h-5 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Enrolling a Reliever</p>
                      <p className="text-[8px] font-medium text-emerald-600 mt-0.5 leading-relaxed">Search for an employee already registered in another branch. They will be temporarily added to this branch's roster. Their home branch record stays unchanged.</p>
                    </div>
                  </div>
                )}

                {/* SEARCH EXISTING PERSONNEL (Only for Pull Mode) */}
                {isNewStaff && props.isPullMode && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                      <div className="w-5 h-5 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                        <Search className="w-3 h-3" strokeWidth={2.5} />
                      </div>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Search staff from another branch</p>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Name or employee ID..."
                        className="flex-1 h-11 px-4 bg-slate-50 border-2 border-slate-200 focus:border-emerald-400 focus:bg-white rounded-2xl font-semibold text-[11px] text-slate-700 placeholder:text-slate-300 outline-none transition-all"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(); } }}
                      />
                      <button
                        onClick={handleSearch}
                        className="h-11 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-1.5 font-black text-[10px] uppercase tracking-widest shrink-0"
                      >
                        <Search className="w-3.5 h-3.5" strokeWidth={2.5} />
                        <span>Search</span>
                      </button>
                    </div>

                    {searchError && (
                      <div className="flex items-center gap-2 px-3 py-2.5 bg-rose-50 border border-rose-100 rounded-xl">
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" strokeWidth={2.5} />
                        <p className="text-[10px] font-bold text-rose-600">{searchError}</p>
                      </div>
                    )}

                    {searchResults.length > 0 && (
                      <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">{searchResults.length} match{searchResults.length > 1 ? 'es' : ''} found</p>
                        <div className="space-y-1.5 max-h-[200px] overflow-y-auto no-scrollbar">
                          {searchResults.map(emp => (
                            <button
                              key={emp.id}
                              onClick={() => {
                                props.setEditingEmployee({
                                  ...emp,
                                  branchAllowances: {
                                    ...(emp.branchAllowances || {}),
                                    [props.branchId]: { allowance: emp.allowance || 0, role: emp.role || '' }
                                  }
                                });
                                setSearchQuery('');
                                setSearchResults([]);
                                playSound('success');
                              }}
                              className="w-full flex items-center gap-3 p-3 bg-white rounded-xl border-2 border-slate-100 hover:border-emerald-400 hover:shadow-sm transition-all group text-left"
                            >
                              <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 font-black text-[10px] shrink-0 group-hover:bg-emerald-100 group-hover:text-emerald-700 transition-colors">
                                {getInitials(emp.name)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-black text-slate-900 uppercase truncate">{emp.name}</p>
                                <div className="flex items-center gap-1 mt-0.5">
                                  <MapPin className="w-2.5 h-2.5 text-slate-300 shrink-0" strokeWidth={2} />
                                  <p className="text-[8px] font-bold text-slate-400 uppercase truncate">{props.branches.find(b => b.id === emp.branchId)?.name?.replace('BRANCH - ', '') || 'Unknown'}</p>
                                </div>
                              </div>
                              <div className="w-6 h-6 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 shrink-0">
                                <Plus className="w-3.5 h-3.5" strokeWidth={3} />
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="h-px bg-slate-100" />
                  </div>
                )}

                {/* Photo + Employee ID */}
                <div className="flex items-stretch gap-3">
                  {/* Photo */}
                  <div className="relative shrink-0 group">
                    <button
                      type="button"
                      onClick={() => props.fileInputRef.current?.click()}
                      disabled={isPhotoLocked}
                      className={`w-20 h-20 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden transition-all relative bg-slate-50 active:scale-95 ${isPhotoLocked ? 'opacity-50 cursor-not-allowed' : 'hover:border-emerald-400 hover:bg-emerald-50/40'}`}
                    >
                      {props.profileFile || props.editingEmployee.profile ? (
                        <img src={props.profileFile ? URL.createObjectURL(props.profileFile) : props.editingEmployee.profile} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt="Preview" />
                      ) : (
                        <Camera className={`w-6 h-6 text-slate-300 ${!isPhotoLocked && 'group-hover:text-emerald-500'} transition-colors`} strokeWidth={2} />
                      )}
                      {(props.profileFile || props.editingEmployee.profile) && !isPhotoLocked && (
                        <div className="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <RefreshCw className="w-4 h-4 text-white" strokeWidth={2} />
                        </div>
                      )}
                    </button>
                    {!isPhotoLocked && (
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-lg border-2 border-white flex items-center justify-center text-white z-10">
                        <Plus className="w-2.5 h-2.5" strokeWidth={3} />
                      </div>
                    )}
                  </div>

                  {/* Employee ID */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Employee ID</p>
                    {props.editingEmployee.id && props.editingEmployee.timestamp ? (() => {
                      const d = new Date(props.editingEmployee.timestamp);
                      const empId = `EMP-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}-${props.editingEmployee.id}`.toUpperCase();
                      return (
                        <button
                          type="button"
                          onClick={() => { navigator.clipboard.writeText(empId); setEmpIdCopied(true); setTimeout(() => setEmpIdCopied(false), 2000); }}
                          className={`w-full px-3 py-2 rounded-xl border text-left transition-all active:scale-95 ${empIdCopied ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200 hover:border-emerald-300'}`}
                        >
                          <p className={`text-[10px] font-black tracking-wider font-mono break-all leading-snug transition-colors ${empIdCopied ? 'text-emerald-600' : 'text-slate-600'}`}>
                            {empIdCopied ? '✓ Copied!' : empId}
                          </p>
                        </button>
                      );
                    })() : (
                      <p className="text-[9px] font-bold text-slate-400 italic">Assigned on save</p>
                    )}
                  </div>
                  <input ref={props.fileInputRef} type="file" className="hidden" accept="image/*" onChange={e => props.setProfileFile(e.target.files?.[0] || null)} />
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">First Name</label>
                      <input
                        required
                        disabled={isNameLocked}
                        value={props.editingEmployee.firstName || ''}
                        onChange={e => {
                          const val = e.target.value.toUpperCase();
                          const fullName = `${val} ${props.editingEmployee.middleName ? props.editingEmployee.middleName.trim() + ' ' : ''}${props.editingEmployee.lastName || ''}`.trim();
                          props.setEditingEmployee({...props.editingEmployee, firstName: val, name: fullName});
                        }}
                        className={`w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-[11px] uppercase outline-none focus:border-emerald-400 focus:bg-white transition-all ${isNameLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                        placeholder="FIRST NAME"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Last Name</label>
                      <input
                        required
                        disabled={isNameLocked}
                        value={props.editingEmployee.lastName || ''}
                        onChange={e => {
                          const val = e.target.value.toUpperCase();
                          const fullName = `${props.editingEmployee.firstName || ''} ${props.editingEmployee.middleName ? props.editingEmployee.middleName.trim() + ' ' : ''}${val}`.trim();
                          props.setEditingEmployee({...props.editingEmployee, lastName: val, name: fullName});
                        }}
                        className={`w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-[11px] uppercase outline-none focus:border-emerald-400 focus:bg-white transition-all ${isNameLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                        placeholder="LAST NAME"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Middle Name <span className="normal-case font-bold opacity-50">(optional)</span></label>
                    <input
                      disabled={isNameLocked}
                      value={props.editingEmployee.middleName || ''}
                      onChange={e => {
                        const val = e.target.value.toUpperCase();
                        const fullName = `${props.editingEmployee.firstName || ''} ${val ? val.trim() + ' ' : ''}${props.editingEmployee.lastName || ''}`.trim();
                        props.setEditingEmployee({...props.editingEmployee, middleName: val, name: fullName});
                      }}
                      className={`w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-[11px] uppercase outline-none focus:border-emerald-400 focus:bg-white transition-all ${isNameLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                      placeholder="MIDDLE NAME"
                    />
                  </div>
                </div>

                  {isExistingReliever && (
                    <div className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-xl">
                      <Lock className="w-3 h-3 text-indigo-400 shrink-0" strokeWidth={2.5} />
                      <p className="text-[8px] font-bold text-indigo-600 uppercase tracking-widest">Name is locked — changes must be made by the ADMIN.</p>
                    </div>
                  )}

                  {/* Duplicate Warning */}
                  {!props.editingEmployee.id && (() => {
                    const firstName = props.editingEmployee.firstName?.trim().toUpperCase();
                    const lastName = props.editingEmployee.lastName?.trim().toUpperCase();
                    const cleanName = `${firstName || ''} ${props.editingEmployee.middleName?.trim().toUpperCase() ? props.editingEmployee.middleName.trim().toUpperCase() + ' ' : ''}${lastName || ''}`.trim().toUpperCase();

                    if (!firstName || !lastName) return null;

                    const allEmployees = (props as any).allEmployees as any[] | undefined;
                    const branchId = (props as any).branchId as string;

                    const sameBranch = allEmployees?.some((e: any) => {
                      if (!e.isActive) return false;
                      if (e.branchId !== branchId) return false;
                      const n = e.firstName && e.lastName
                        ? `${e.firstName} ${e.middleName ? e.middleName + ' ' : ''}${e.lastName}`.trim().toUpperCase()
                        : (e.name || '').toUpperCase();
                      return n === cleanName;
                    });

                    if (sameBranch) {
                      return (
                        <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl flex items-center gap-2 animate-in slide-in-from-top-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shrink-0"></div>
                          <p className="text-[8px] font-bold text-rose-600 uppercase tracking-widest">Duplicate Detected — Already Registered in this Branch</p>
                        </div>
                      );
                    }

                    const otherBranch = allEmployees?.find((e: any) => {
                      if (!e.isActive) return false;
                      if (e.branchId === branchId) return false;
                      const n = e.firstName && e.lastName
                        ? `${e.firstName} ${e.middleName ? e.middleName + ' ' : ''}${e.lastName}`.trim().toUpperCase()
                        : (e.name || '').toUpperCase();
                      return n === cleanName;
                    });

                    if (otherBranch) {
                      return (
                        <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl flex items-center gap-2 animate-in slide-in-from-top-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0"></div>
                          <p className="text-[8px] font-bold text-amber-700 uppercase tracking-widest">Staff Exists in Network — Use "Enroll Reliever" Instead</p>
                        </div>
                      );
                    }

                    return null;
                  })()}

                  {/* BRANCH SPECIFIC CONFIGURATION */}
                  <div className="rounded-2xl border border-slate-100 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                      <MapPin className="w-3 h-3 text-emerald-500 shrink-0" strokeWidth={2.5} />
                      <h4 className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Branch Configuration</h4>
                    </div>

                    {(() => {
                      const current = props.editingEmployee.branchAllowances?.[props.branchId];
                      const currentRole = (typeof current === 'object' && current !== null && current.role)
                        ? current.role : props.editingEmployee.role;
                      return (
                        <div className="p-3 grid grid-cols-2 gap-3">
                          {/* Allowance */}
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Allowance (₱)</label>
                            <input
                              type="number"
                              value={(() => {
                                const allowance = props.editingEmployee.branchAllowances?.[(props as any).branchId];
                                if (typeof allowance === 'object' && allowance !== null) return allowance.allowance;
                                return allowance ?? props.editingEmployee.allowance ?? 0;
                              })()}
                              onChange={e => {
                                const val = Number(e.target.value);
                                const currentAllowanceObj = props.editingEmployee.branchAllowances?.[(props as any).branchId];
                                const nextAllowance = typeof currentAllowanceObj === 'object' && currentAllowanceObj !== null
                                  ? { ...currentAllowanceObj, allowance: val }
                                  : { allowance: val, role: props.editingEmployee.role };
                                props.setEditingEmployee({
                                  ...props.editingEmployee,
                                  branchAllowances: {
                                    ...(props.editingEmployee.branchAllowances || {}),
                                    [(props as any).branchId]: nextAllowance
                                  }
                                });
                              }}
                              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-sm outline-none focus:border-emerald-400 focus:bg-white transition-all text-center"
                            />
                          </div>

                          {/* Role toggles */}
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Role</label>
                            <div className="flex flex-col gap-1.5">
                              {rolesList.map(role => {
                                const isSelected = (currentRole || '').split(',').includes(role);
                                return (
                                  <button
                                    key={role}
                                    type="button"
                                    onClick={() => {
                                      const roles = (currentRole || '').split(',').filter(Boolean);
                                      const nextRoles = roles.includes(role) ? roles.filter(r => r !== role) : [...roles, role];
                                      const val = nextRoles.join(',');
                                      const currentAllowance = typeof current === 'object' && current !== null
                                        ? current.allowance : (current ?? props.editingEmployee.allowance ?? 0);
                                      props.setEditingEmployee({
                                        ...props.editingEmployee,
                                        branchAllowances: {
                                          ...(props.editingEmployee.branchAllowances || {}),
                                          [props.branchId]: { allowance: currentAllowance, role: val }
                                        }
                                      });
                                      playSound('click');
                                    }}
                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all active:scale-95 ${
                                      isSelected
                                        ? 'bg-emerald-500 border-emerald-500 text-white'
                                        : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600'
                                    }`}
                                  >
                                    {role}
                                    {isSelected && <svg className="w-2.5 h-2.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

              </div>


              {(() => {
                const branchCfg = props.editingEmployee.branchAllowances?.[props.branchId];
                const branchRole = typeof branchCfg === 'object' && branchCfg !== null ? branchCfg.role || '' : props.editingEmployee.role || '';
                const branchAllowance = typeof branchCfg === 'object' && branchCfg !== null ? branchCfg.allowance : (typeof branchCfg === 'number' ? branchCfg : props.editingEmployee.allowance ?? 0);
                const hasRole = rolesList.some(r => branchRole.split(',').includes(r));
                const currentBranch = props.branches.find(b => b.id === props.branchId);
                const isManager =
                  currentBranch?.manager?.toUpperCase() === (props.editingEmployee.name || '').toUpperCase() ||
                  currentBranch?.tempManager?.toUpperCase() === (props.editingEmployee.name || '').toUpperCase() ||
                  branchRole.includes('MANAGER');
                const roleOk = hasRole || isManager;
                const allowanceOk = (branchAllowance ?? 0) > 0;

                return (
                  <div className="px-5 pt-3 pb-5 shrink-0 space-y-2 border-t border-slate-100">
                    {!roleOk && props.editingEmployee.firstName && props.editingEmployee.lastName && (
                      <p className="text-center text-[9px] font-black text-rose-500 uppercase tracking-widest">
                        Select at least one role to save
                      </p>
                    )}
                    {!allowanceOk && props.editingEmployee.firstName && props.editingEmployee.lastName && (
                      <p className="text-center text-[9px] font-black text-rose-500 uppercase tracking-widest">
                        Allowance cannot be zero
                      </p>
                    )}
                    <button
                      onClick={props.onSaveEmployee}
                      disabled={props.isSyncing || !props.editingEmployee.firstName || !props.editingEmployee.lastName || !roleOk || !allowanceOk}
                      className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-[11px] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {props.isSyncing ? `Syncing ${props.uploadProgress}%...` : 'Save Employee Details'}
                    </button>

                    {/* Face ID Enrollment — home branch only */}
                    {props.editingEmployee.id && props.editingEmployee.branchId === props.branchId && (
                      <button
                        type="button"
                        onClick={() => setShowFaceEnrollModal(true)}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-slate-200 text-slate-500 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all text-[10px] font-black uppercase tracking-widest"
                      >
                        <ScanFace className="w-3.5 h-3.5" />
                        Face ID Enrollment
                        {props.editingEmployee.faceDescriptors && props.editingEmployee.faceDescriptors.length > 0 && (
                          <span className="bg-emerald-100 text-emerald-700 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest">
                            {props.editingEmployee.faceDescriptors.length} shots
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                );
              })()}
           </div>
        </div>
      )}

      {/* ── Face ID Enrollment Modal ── */}
      {showFaceEnrollModal && props.editingEmployee && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-[28px] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-[13px] font-black text-slate-900 uppercase tracking-tight">Face ID Enrollment</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 truncate">{props.editingEmployee.name}</p>
              </div>
              <button onClick={() => setShowFaceEnrollModal(false)} className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-900 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 pt-3 pb-5">
              <FaceEnrollment
                currentDescriptors={props.editingEmployee.faceDescriptors}
                onSave={async (descriptors, files) => {
                  setIsSavingFace(true);
                  try {
                    // Upload photos to storage
                    const empId = props.editingEmployee!.id;
                    const uploadPromises = files.map((file, i) => {
                      const ext = file.name.split('.').pop() || 'jpg';
                      const path = `${props.branchId}/${empId}/${Date.now()}-${i}.${ext}`;
                      return supabase.storage.from('face-photos').upload(path, file, { upsert: true });
                    });
                    await Promise.allSettled(uploadPromises);

                    // Save descriptors to employees table
                    const { error } = await supabase
                      .from(DB_TABLES.EMPLOYEES)
                      .update({ face_descriptors: descriptors })
                      .eq('id', empId);
                    if (error) {
                      alert(`Failed to save face data: ${error.message}`);
                    } else {
                      props.setEditingEmployee({ ...props.editingEmployee!, faceDescriptors: descriptors });
                      playSound('success');
                      setShowFaceEnrollModal(false);
                      props.onRefresh(true);
                    }
                  } catch (e) {
                    alert('Unexpected error saving face data.');
                  }
                  setIsSavingFace(false);
                }}
                isSaving={isSavingFace}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );

  return createPortal(modalContent, document.body);
};
