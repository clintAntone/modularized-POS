import React from 'react';
import { createPortal } from 'react-dom';
import { Employee, Branch } from '../../../../types';
import { UI_THEME } from '../../../../constants/ui_designs';
import { playSound } from '../../../../lib/audio';
import { getInitials } from '../../../../lib/payroll';
import { RecoveryModal } from './RecoveryModal';
import { Lock, Clock, X, UserPlus, Search, AlertCircle, Plus, Camera, RefreshCw, MapPin, ArrowRightLeft } from 'lucide-react';

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
}

export const StaffModals: React.FC<StaffModalsProps> = (props) => {
  const rolesList = ['THERAPIST', 'BONESETTER'];
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<Employee[]>([]);
  const [searchError, setSearchError] = React.useState<string | null>(null);

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
        const next = prev + (TICK_MS / HOLD_DURATION_MS) * 100;
        if (next >= 100 && !holdFiredRef.current) {
          holdFiredRef.current = true;
          clearInterval(holdIntervalRef.current!);
          holdIntervalRef.current = null;
          setHoldProgress(100);
          props.onTimeAction();
        }
        return Math.min(next, 100);
      });
    }, TICK_MS);
  };

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
    const term = searchQuery.toUpperCase().trim();
    setSearchError(null);
    setSearchResults([]);

    if (term.length < 3) {
      setSearchError('Enter at least 3 characters');
      playSound('warning');
      return;
    }

    const allMatches = (props.allEmployees || []).filter(emp => {
      const name = (emp.name || '').toUpperCase();
      const firstName = (emp.firstName || '').toUpperCase();
      const lastName = (emp.lastName || '').toUpperCase();
      const fullName = `${firstName} ${lastName}`.trim();
      const id = (emp.id || '').toUpperCase();

      return name.includes(term) || 
             firstName.includes(term) || 
             lastName.includes(term) || 
             fullName.includes(term) ||
             id.includes(term);
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

              {/* Hold-to-confirm button */}
              <div className="flex flex-col gap-3">
                <div className="relative select-none">
                  {/* Background track */}
                  <button
                    disabled={props.isSyncing || holdProgress >= 100}
                    onMouseDown={startHold}
                    onMouseUp={cancelHold}
                    onMouseLeave={cancelHold}
                    onTouchStart={e => { e.preventDefault(); startHold(); }}
                    onTouchEnd={cancelHold}
                    onTouchCancel={cancelHold}
                    className={`relative w-full py-5 rounded-2xl font-black uppercase tracking-widest text-[11px] sm:text-[12px] shadow-lg overflow-hidden transition-opacity select-none ${
                      isClockIn
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700'
                    } ${props.isSyncing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
                  >
                    {/* Fill overlay */}
                    <span
                      className={`absolute inset-0 origin-left transition-none rounded-2xl ${isClockIn ? 'bg-emerald-600' : 'bg-rose-600'}`}
                      style={{ transform: `scaleX(${holdProgress / 100})`, transformOrigin: 'left' }}
                    />
                    {/* Label */}
                    <span className="relative z-10 flex items-center justify-center gap-2 pointer-events-none">
                      {props.isSyncing ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin inline-block" />
                          Processing...
                        </span>
                      ) : holdProgress >= 100 ? (
                        <span className={isClockIn ? 'text-white' : 'text-white'}>Confirmed!</span>
                      ) : isHolding ? (
                        <span className={holdProgress > 50 ? 'text-white' : ''}>
                          Hold... {Math.round(holdProgress)}%
                        </span>
                      ) : (
                        <span>Hold to {label}</span>
                      )}
                    </span>
                  </button>
                </div>

                {/* Hint */}
                {!isHolding && holdProgress === 0 && !props.isSyncing && (
                  <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">
                    Press and hold the button to confirm
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
           <div className={`${UI_THEME.layout.modalLarge} ${UI_THEME.radius.modal} p-6 md:p-12 flex flex-col overflow-hidden max-h-[95vh] border border-slate-100`}>
              <div className="flex justify-between items-center mb-6 sm:mb-10 shrink-0">
                <div className="space-y-1">
                  <h3 className="text-xl sm:text-2xl font-bold text-slate-900 uppercase tracking-tighter">
                    {props.editingEmployee.id ? `Edit Staff Context` : props.isPullMode ? 'Enroll Reliever' : 'New Staff Access'}
                  </h3>
                  {props.editingEmployee.name && (
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest leading-none flex items-center gap-1.5">
                      <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></div>
                      Active Profile: {props.editingEmployee.name}
                    </p>
                  )}
                </div>
                <button onClick={props.onCloseModals} className="p-2 sm:p-3 bg-slate-50 rounded-xl sm:rounded-2xl text-slate-300 hover:text-slate-900 transition-all active:scale-90">
                  <X className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={2.5} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar space-y-6 sm:space-y-8 pr-1">
                {/* SEARCH EXISTING PERSONNEL (Only for Pull Mode) */}
                {isNewStaff && props.isPullMode && (
                  <div className="bg-emerald-50 border-emerald-200 p-4 sm:p-6 rounded-3xl border space-y-4 transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                          <UserPlus className="w-5 h-5" strokeWidth={2.5} />
                        </div>
                        <h4 className="text-[10px] font-black text-emerald-900 uppercase tracking-widest">
                          ✨ ENROLL RELIEVER FROM NETWORK
                        </h4>
                      </div>
                      <div className="px-2 py-0.5 bg-emerald-500 text-white text-[7px] font-black uppercase tracking-widest rounded-full animate-pulse">
                        Active Mode
                      </div>
                    </div>
                    <div className="relative flex gap-2">
                      <input 
                        type="text"
                        placeholder="SEARCH BY NAME OR ID..."
                        className="flex-1 p-4 bg-white border-2 border-emerald-100 focus:border-emerald-500 rounded-2xl font-bold text-[11px] uppercase outline-none transition-all shadow-sm"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSearch();
                          }
                        }}
                      />
                      <button 
                        onClick={handleSearch}
                        className="p-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl transition-all active:scale-95 shadow-md flex items-center justify-center"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </button>
                    </div>

                    {searchError && (
                      <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-100 rounded-xl animate-in fade-in slide-in-from-top-1">
                        <AlertCircle className="w-5 h-5 text-rose-500" strokeWidth={2.5} />
                        <p className="text-[9px] font-black text-rose-600 uppercase tracking-widest">{searchError}</p>
                      </div>
                    )}

                    {searchResults.length > 0 && (
                      <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                        <p className="text-[8px] font-black text-indigo-600 uppercase tracking-widest ml-1">Multiple Records Found ({searchResults.length})</p>
                        <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto no-scrollbar pr-1">
                          {searchResults.map(emp => (
                            <button
                              key={emp.id}
                              onClick={() => {
                                // RELIEVER status is derived from branchId mismatch.
                                // We no longer inject or require 'RELIEVER' in the role string.
                                const defaultRole = emp.role || '';

                                props.setEditingEmployee({
                                  ...emp,
                                  branchAllowances: {
                                    ...(emp.branchAllowances || {}),
                                    [props.branchId]: { 
                                      allowance: emp.allowance || 0, 
                                      role: defaultRole
                                    }
                                  }
                                });
                                setSearchQuery('');
                                setSearchResults([]);
                                playSound('success');
                              }}
                              className="flex items-center justify-between p-3 bg-white rounded-xl border border-indigo-100 hover:border-indigo-400 hover:shadow-md transition-all group text-left"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-[10px]">
                                  {getInitials(emp.name)}
                                </div>
                                <div>
                                  <p className="text-[10px] font-black text-slate-900 uppercase tracking-tight group-hover:text-indigo-600 transition-colors">{emp.name}</p>
                                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Node: {props.branches.find(b => b.id === emp.branchId)?.name || 'Unknown'}</p>
                                </div>
                              </div>
                              <div className="w-6 h-6 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Plus className="w-3 h-3" strokeWidth={3} />
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <p className="text-[8px] font-bold text-emerald-600 uppercase tracking-widest ml-1 leading-relaxed">Search for a staff member from another branch to enroll them as a reliever in this branch.</p>
                  </div>
                )}

                <div className="flex flex-col items-center gap-4">
                  <div className="relative group">
                    <button 
                      type="button"
                      onClick={() => props.fileInputRef.current?.click()} 
                      disabled={props.isPullMode}
                      className={`w-28 h-28 sm:w-36 sm:h-36 rounded-[36px] sm:rounded-[48px] bg-white border-4 border-dashed border-slate-200 flex flex-col items-center justify-center overflow-hidden transition-all ${props.isPullMode ? 'opacity-50 cursor-not-allowed' : 'hover:border-emerald-500 hover:bg-emerald-50/30 group relative shadow-xl active:scale-95'}`}
                    >
                      {props.profileFile || props.editingEmployee.profile ? (
                        <img 
                          src={props.profileFile ? URL.createObjectURL(props.profileFile) : props.editingEmployee.profile} 
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                          alt="Preview" 
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <div className={`w-10 h-10 sm:w-12 sm:h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 ${!props.isPullMode && 'group-hover:bg-emerald-100 group-hover:text-emerald-600'} transition-colors`}>
                            <Camera className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2.5} />
                          </div>
                          <span className={`text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest ${!props.isPullMode && 'group-hover:text-emerald-600'} transition-colors`}>Upload Photo</span>
                        </div>
                      )}

                      {/* Overlay on Hover when image exists */}
                      {(props.profileFile || props.editingEmployee.profile) && !props.isPullMode && (
                        <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                          <RefreshCw className="w-5 h-5 sm:w-6 sm:h-6 text-white" strokeWidth={2.5} />
                          <span className="text-white text-[7px] sm:text-[8px] font-black uppercase tracking-widest">Replace Photo</span>
                        </div>
                      )}
                    </button>

                    {/* Decorative Badge */}
                    {!props.isPullMode && (
                      <div className="absolute -bottom-1 -right-1 sm:-bottom-2 sm:-right-2 w-8 h-8 sm:w-10 sm:h-10 bg-emerald-500 rounded-xl sm:rounded-2xl border-4 border-white shadow-lg flex items-center justify-center text-white z-10">
                        <Plus className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />
                      </div>
                    )}
                  </div>

                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.2em]">Identity Verification Image</p>
                  <input ref={props.fileInputRef} type="file" className="hidden" accept="image/*" onChange={e => props.setProfileFile(e.target.files?.[0] || null)} />
                </div>

                <div className="space-y-4 sm:space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1 sm:space-y-2">
                      <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">First Name</label>
                      <input 
                        required 
                        disabled={props.isPullMode}
                        value={props.editingEmployee.firstName || ''} 
                        onChange={e => {
                          const val = e.target.value.toUpperCase();
                          const fullName = `${val} ${props.editingEmployee.middleName ? props.editingEmployee.middleName.trim() + ' ' : ''}${props.editingEmployee.lastName || ''}`.trim();
                          props.setEditingEmployee({...props.editingEmployee, firstName: val, name: fullName});
                        }} 
                        className={`w-full p-3.5 sm:p-5 bg-slate-50 border-2 border-transparent rounded-[16px] sm:rounded-[22px] font-bold text-xs sm:text-sm uppercase outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner ${props.isPullMode ? 'opacity-50 cursor-not-allowed' : ''}`} 
                        placeholder="FIRST NAME" 
                      />
                    </div>
                    <div className="space-y-1 sm:space-y-2">
                      <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Middle Name</label>
                      <input 
                        disabled={props.isPullMode}
                        value={props.editingEmployee.middleName || ''} 
                        onChange={e => {
                          const val = e.target.value.toUpperCase();
                          const fullName = `${props.editingEmployee.firstName || ''} ${val ? val.trim() + ' ' : ''}${props.editingEmployee.lastName || ''}`.trim();
                          props.setEditingEmployee({...props.editingEmployee, middleName: val, name: fullName});
                        }} 
                        className={`w-full p-3.5 sm:p-5 bg-slate-50 border-2 border-transparent rounded-[16px] sm:rounded-[22px] font-bold text-xs sm:text-sm uppercase outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner ${props.isPullMode ? 'opacity-50 cursor-not-allowed' : ''}`} 
                        placeholder="OPTIONAL" 
                      />
                    </div>
                    <div className="space-y-1 sm:space-y-2">
                      <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Last Name</label>
                      <input 
                        required 
                        disabled={props.isPullMode}
                        value={props.editingEmployee.lastName || ''} 
                        onChange={e => {
                          const val = e.target.value.toUpperCase();
                          const fullName = `${props.editingEmployee.firstName || ''} ${props.editingEmployee.middleName ? props.editingEmployee.middleName.trim() + ' ' : ''}${val}`.trim();
                          props.setEditingEmployee({...props.editingEmployee, lastName: val, name: fullName});
                        }} 
                        className={`w-full p-3.5 sm:p-5 bg-slate-50 border-2 border-transparent rounded-[16px] sm:rounded-[22px] font-bold text-xs sm:text-sm uppercase outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner ${props.isPullMode ? 'opacity-50 cursor-not-allowed' : ''}`} 
                        placeholder="LAST NAME" 
                      />
                    </div>
                  </div>

                  <div className="space-y-2 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                    <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Generated Display Name</label>
                    <div className="w-full p-4 sm:p-5 bg-white border-2 border-slate-100 rounded-[18px] sm:rounded-[24px] font-bold text-xs sm:text-sm uppercase text-slate-900 shadow-sm">
                      {props.editingEmployee.name || <span className="text-slate-300 italic">Auto-generated from full name...</span>}
                    </div>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest ml-1 mt-1">This name will be used in all transactions and reports.</p>
                  </div>

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

                  <div className="space-y-4 bg-slate-50/50 p-6 rounded-3xl border border-slate-100">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                        <MapPin className="w-4 h-4" strokeWidth={2.5} />
                      </div>
                      <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Branch-Specific Configuration</h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Daily Allowance (₱)</label>
                        <input 
                          type="number" 
                          value={(() => {
                            const allowance = props.editingEmployee.branchAllowances?.[(props as any).branchId];
                            if (typeof allowance === 'object' && allowance !== null) return allowance.allowance;
                            return allowance ?? props.editingEmployee.allowance ?? 0;
                          })()} 
                          onChange={e => {
                            const val = Number(e.target.value);
                            const current = props.editingEmployee.branchAllowances?.[(props as any).branchId];
                            const nextAllowance = typeof current === 'object' && current !== null 
                              ? { ...current, allowance: val }
                              : { allowance: val, role: props.editingEmployee.role };

                            props.setEditingEmployee({
                              ...props.editingEmployee, 
                              branchAllowances: {
                                ...(props.editingEmployee.branchAllowances || {}),
                                [(props as any).branchId]: nextAllowance
                              }
                            });
                          }} 
                          className="w-full p-4 sm:p-5 bg-white border-2 border-slate-100 rounded-[18px] sm:rounded-[24px] font-bold text-sm sm:text-lg outline-none focus:border-emerald-500 transition-all shadow-sm text-right" 
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Role in this Branch</label>
                        
                        {/* RELIEVER STATUS INDICATOR (Read-only since it's derived from branch mismatch) */}
                        {props.editingEmployee.branchId !== props.branchId && (
                          <div className="mb-4 p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center justify-between shadow-sm">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                                <ArrowRightLeft className="w-5 h-5" strokeWidth={2.5} />
                              </div>
                              <div className="space-y-0.5">
                                <p className="text-[11px] font-black text-indigo-900 uppercase tracking-tight">RELIEVER ACCESS: ON</p>
                                <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest leading-none">External branch node detected</p>
                              </div>
                            </div>
                            <div className="px-3 py-1 bg-indigo-100 text-indigo-700 text-[8px] font-black uppercase tracking-widest rounded-lg">
                              Verified
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          {rolesList.map(role => {
                            const current = props.editingEmployee.branchAllowances?.[props.branchId];
                            const currentRole = (typeof current === 'object' && current !== null && current.role) 
                              ? current.role 
                              : props.editingEmployee.role;
                            
                            const isSelected = (currentRole || '').split(',').includes(role);
                            
                            return (
                              <button
                                key={role}
                                type="button"
                                onClick={() => {
                                  const roles = (currentRole || '').split(',').filter(Boolean);
                                  let nextRoles;
                                  if (roles.includes(role)) {
                                    nextRoles = roles.filter(r => r !== role);
                                  } else {
                                    nextRoles = [...roles, role];
                                  }
                                  
                                  const val = nextRoles.join(',');
                                  const currentAllowance = typeof current === 'object' && current !== null 
                                    ? current.allowance 
                                    : (current ?? props.editingEmployee.allowance ?? 0);

                                  props.setEditingEmployee({
                                    ...props.editingEmployee,
                                    branchAllowances: {
                                      ...(props.editingEmployee.branchAllowances || {}),
                                      [props.branchId]: { allowance: currentAllowance, role: val }
                                    }
                                  });
                                  playSound('click');
                                }}
                                className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all flex-1 min-w-[120px] text-center ${isSelected ? 'bg-slate-900 border-slate-900 text-white shadow-lg scale-[1.02]' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
                              >
                                {role}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest ml-1 mt-1">These settings only apply when the staff is operating at this specific branch.</p>
                  </div>
                </div>
              </div>

              <div className="pt-6 sm:pt-8 shrink-0">
                <button 
                  onClick={props.onSaveEmployee}
                  disabled={props.isSyncing || !props.editingEmployee.firstName || !props.editingEmployee.lastName}
                  className="w-full bg-slate-900 text-white font-black py-5 sm:py-6 rounded-[20px] sm:rounded-[28px] uppercase tracking-widest text-[10px] sm:text-[11px] shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3"
                >
                  {props.isSyncing ? `Syncing ${props.uploadProgress}%...` : 'Commit to Registry'}
                </button>
              </div>
           </div>
        </div>
      )}
    </>
  );

  return createPortal(modalContent, document.body);
};
