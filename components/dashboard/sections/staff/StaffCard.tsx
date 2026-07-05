
import React, { useRef, useState } from 'react';
import { Attendance, Employee } from '../../../../types';
import { RoleBadge } from './RoleBadge';
import { getEmployeeAllowance, getEmployeeRole, getInitials } from '../../../../lib/payroll';
import { UI_THEME } from '../../../../constants/ui_designs';
import { Fingerprint, ScanFace } from 'lucide-react';
import { playSound } from '../../../../lib/audio';
import { ProfileAvatar } from '../../../ui/ProfileAvatar';

const LONG_PRESS_MS = 800;
const LONG_PRESS_DELAY_MS = 300; // wait before showing the hold indicator


interface StaffCardProps {
  emp: Employee;
  branchId: string;
  isReliever?: boolean;
  isMainManager?: boolean;
  isTempManager?: boolean;
  shiftState: 'NOT_STARTED' | 'ONGOING' | 'COMPLETED';
  isClosedMode: boolean;
  onEdit: (emp: Employee) => void;
  onTimeAction: (emp: Employee) => void;
  onReset?: (emp: Employee) => void;
  onPromote?: (emp: Employee) => void;
  onRequestLeave?: (emp: Employee) => void;
  onReturnFromLeave?: (emp: Employee) => void;
  onRequestDisable?: (emp: Employee) => void;
  onRemoveReliever?: (emp: Employee) => void;
  onFaceTimeIn?: () => void;
}

export const StaffCard: React.FC<StaffCardProps> = ({
  emp,
  branchId,
  isReliever: isRelieverProp,
  isMainManager = false,
  isTempManager = false,
  shiftState,
  isClosedMode,
  onEdit,
  onTimeAction,
  onReset,
  onPromote,
  onRequestLeave,
  onReturnFromLeave,
  onRequestDisable,
  onRemoveReliever,
  onFaceTimeIn,
}) => {
  const isOngoing = shiftState === 'ONGOING';
  const isCompleted = shiftState === 'COMPLETED';
  const isActive = emp.isActive;
  const isOnLeave = emp.onLeave === true;
  const currentAllowance = getEmployeeAllowance(emp, branchId);
  const currentRole = getEmployeeRole(emp, branchId);
  const isReliever = isRelieverProp ?? (emp.branchId !== branchId);
  const hasFace = !!(emp.faceDescriptors && emp.faceDescriptors.length > 0);

  // Long press for reliever promote
  const [isLongPressing, setIsLongPressing] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const displayRole = currentRole.split(',')
    .filter(r => r.trim().toUpperCase() !== 'MANAGER')
    .join(',');

  const startLongPress = () => {
    if (!isReliever || !onPromote || isOnLeave) return;
    didLongPress.current = false;
    delayTimer.current = setTimeout(() => {
      setIsLongPressing(true);
      longPressTimer.current = setTimeout(() => {
        didLongPress.current = true;
        setIsLongPressing(false);
        playSound('click');
        onPromote(emp);
      }, LONG_PRESS_MS);
    }, LONG_PRESS_DELAY_MS);
  };

  const cancelLongPress = () => {
    if (delayTimer.current) { clearTimeout(delayTimer.current); delayTimer.current = null; }
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    setIsLongPressing(false);
  };

  return (
    <div
      className={`${isOngoing ? 'bg-emerald-50' : isOnLeave ? 'bg-purple-50' : 'bg-white'} ${UI_THEME.radius.card} border transition-all duration-500 group relative overflow-hidden flex flex-col h-full select-none cursor-pointer ${
        isOnLeave
          ? 'opacity-80 border-purple-200'
          : !isActive
          ? 'grayscale opacity-60 border-slate-200'
          : isLongPressing
          ? 'border-indigo-400 ring-4 ring-indigo-400/20 scale-[0.98]'
          : isOngoing
          ? 'border-emerald-400 shadow-xl ring-4 ring-emerald-500/10'
          : 'border-slate-200 hover:border-emerald-400 hover:shadow-lg'
      }`}
      onMouseDown={startLongPress}
      onMouseUp={cancelLongPress}
      onMouseLeave={cancelLongPress}
      onTouchStart={startLongPress}
      onTouchEnd={cancelLongPress}
      onTouchCancel={cancelLongPress}
      onClick={() => {
        if (didLongPress.current) return;
        if (isOnLeave && onReturnFromLeave) { onReturnFromLeave(emp); return; }
        if (!isOnLeave) onEdit(emp);
      }}
    >
      {/* On Leave overlay — only shown on home branch (where Return action is available) */}
      {isOnLeave && onReturnFromLeave && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] backdrop-blur-[1px] bg-slate-900/10 pointer-events-none opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200">
          {onReturnFromLeave ? (
            <button
              onMouseDown={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onReturnFromLeave(emp); }}
              className="pointer-events-auto flex flex-col items-center justify-center gap-2 bg-slate-800/60 hover:bg-slate-800/80 active:scale-95 backdrop-blur-sm border border-white/10 text-white rounded-2xl px-6 py-4 shadow-2xl transition-all mx-4"
              title="Return from Leave"
            >
              <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs font-black uppercase tracking-widest text-white/70">Return from Leave</span>
              <span className="text-sm font-black uppercase tracking-tight">{emp.firstName || emp.name.split(' ')[0]}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-slate-800/50 backdrop-blur-sm border border-white/10 text-white rounded-full px-4 py-2 shadow-lg">
              <svg className="w-3.5 h-3.5 text-purple-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs font-black uppercase tracking-widest text-purple-200">On Leave</span>
            </div>
          )}
        </div>
      )}

      {/* Long-press progress ring for relievers */}
      {isReliever && onPromote && isLongPressing && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div className="bg-slate-900/50 backdrop-blur-sm rounded-[inherit] absolute inset-0" />
          <div className="relative z-10 flex flex-col items-center gap-2">
            <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15" fill="none" stroke="white" strokeOpacity="0.2" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15" fill="none" stroke="white" strokeWidth="3"
                strokeDasharray="94.2"
                strokeDashoffset="94.2"
                strokeLinecap="round"
                style={{ animation: `stroke-fill ${LONG_PRESS_MS}ms linear forwards` }}
              />
            </svg>
            <span className="text-xs font-black text-white uppercase tracking-widest">Hold to Promote</span>
          </div>
        </div>
      )}

      {/* Reliever hint (idle) */}
      {isReliever && onPromote && !isLongPressing && !isOnLeave && (
        <div className="absolute bottom-0 inset-x-0 z-10 flex justify-center pb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <span className="text-xs font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
            Hold to Promote
          </span>
        </div>
      )}

      {/* Role / status badges — top right */}

      {/* Bookmark tags — hanging from top */}
      <div className="absolute top-0 left-6 flex gap-2 z-10 pointer-events-none">
        {isMainManager && (
          <div className="flex flex-col items-center" style={{clipPath:'polygon(0 0,100% 0,100% 75%,50% 100%,0 75%)'}}>
            <span className="bg-emerald-100 text-emerald-700 text-xs font-black uppercase tracking-widest px-2.5 pt-1.5 pb-3 leading-none">
              Manager
            </span>
          </div>
        )}
        {isTempManager && !isMainManager && (
          <div className="flex flex-col items-center" style={{clipPath:'polygon(0 0,100% 0,100% 75%,50% 100%,0 75%)'}}>
            <span className="bg-amber-100 text-amber-700 text-xs font-black uppercase tracking-widest px-2.5 pt-1.5 pb-3 leading-none">
              Delegate
            </span>
          </div>
        )}
        {isReliever && (
          <div className="flex flex-col items-center" style={{clipPath:'polygon(0 0,100% 0,100% 75%,50% 100%,0 75%)'}}>
            <span className="bg-indigo-100 text-indigo-600 text-xs font-black uppercase tracking-widest px-2.5 pt-1.5 pb-3 leading-none">
              Reliever
            </span>
          </div>
        )}
        {!isActive && !isOnLeave && (
          <div className="flex flex-col items-center" style={{clipPath:'polygon(0 0,100% 0,100% 75%,50% 100%,0 75%)'}}>
            <span className="bg-slate-100 text-slate-500 text-xs font-black uppercase tracking-widest px-2.5 pt-1.5 pb-3 leading-none">
              Disabled
            </span>
          </div>
        )}
        {isOnLeave && (
          <div className="flex flex-col items-center" style={{clipPath:'polygon(0 0,100% 0,100% 75%,50% 100%,0 75%)'}}>
            <span className="bg-purple-100 text-purple-600 text-xs font-black uppercase tracking-widest px-2.5 pt-1.5 pb-3 leading-none">
              On Leave
            </span>
          </div>
        )}
      </div>

      {/* Remove reliever — always visible */}
      {onRemoveReliever && isReliever && (
        <div className="absolute top-3 right-3 z-20">
          <button
            onMouseDown={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onRemoveReliever(emp); }}
            className="p-3 rounded-xl bg-slate-50 text-slate-300 hover:bg-rose-600 hover:text-white transition-all border border-transparent hover:border-white shadow-inner"
            title="Remove from Branch Staff List"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
            </svg>
          </button>
        </div>
      )}

      {/* Action buttons — absolute top-right, above avatar level */}
      <div className="absolute top-3 right-3 flex gap-1.5 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            {onReset && (isMainManager || isTempManager) && (
              <button
                onMouseDown={e => e.stopPropagation()}
                onTouchStart={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onReset(emp); }}
                className="p-3 rounded-xl bg-slate-50 text-slate-300 hover:bg-rose-600 hover:text-white transition-all border border-transparent hover:border-white shadow-inner"
                title="Reset Credentials"
              >
                <Fingerprint className="w-4 h-4" strokeWidth={2.5} />
              </button>
            )}
            {onRequestLeave && isActive && !isReliever && !isOnLeave && (
              <button
                onMouseDown={e => e.stopPropagation()}
                onTouchStart={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onRequestLeave(emp); }}
                className="p-3 rounded-xl bg-slate-50 text-slate-300 hover:bg-purple-500 hover:text-white transition-all border border-transparent hover:border-white shadow-inner"
                title="Request Leave / On-Hold"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
            )}
            {onRequestDisable && isActive && !isMainManager && !isTempManager && !isReliever && !isOnLeave && (
              <button
                onMouseDown={e => e.stopPropagation()}
                onTouchStart={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onRequestDisable(emp); }}
                className="p-3 rounded-xl bg-slate-50 text-slate-300 hover:bg-rose-600 hover:text-white transition-all border border-transparent hover:border-white shadow-inner"
                title="Request Disable (Resigned / Terminated)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </button>
            )}
      </div>

      <div className="p-5 sm:p-8 flex-1 flex flex-col">
        <div className="mb-4 sm:mb-8">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl sm:rounded-2xl overflow-hidden bg-slate-50 border-4 border-white shadow-xl transition-transform group-hover:scale-110 duration-500">
            <ProfileAvatar name={emp.name} src={emp.profile} initialsClassName="text-3xl" />
          </div>
        </div>

        <div className="space-y-4 flex-1">
          <div className="min-w-0">
            {emp.timestamp && (() => {
              const d = new Date(emp.timestamp);
              const empId = `EMP-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}-${emp.id}`.toUpperCase();
              return (
                <p className="text-xs font-black text-slate-400 font-mono tracking-wide mb-1">{empId}</p>
              );
            })()}
            <h3 className="text-lg font-bold text-slate-900 uppercase tracking-tighter truncate group-hover:text-emerald-700 transition-colors leading-none mb-2">{emp.name || 'UNNAMED'}</h3>
            {displayRole ? (
              <RoleBadge role={displayRole} />
            ) : (!isMainManager && !isTempManager) ? (
              <div className="flex items-center gap-2 text-rose-500 animate-pulse bg-rose-50/50 px-2 py-1 rounded-lg border border-rose-100 w-fit">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e]"></div>
                <span className="text-xs font-black uppercase tracking-widest">No Role Assigned</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-auto pt-6 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Employee Allowance</p>
            <p className="text-sm font-black text-slate-900 tabular-nums">₱{currentAllowance.toLocaleString()}</p>
          </div>

          {/* Time actions */}
          {isOnLeave ? (
            <div />
          ) : isOngoing || isCompleted || !isActive ? (
            // Time-out / completed / inactive — single button
            <button
              disabled={!isActive || isCompleted}
              onMouseDown={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onTimeAction(emp); }}
              className={`h-11 px-6 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all active:scale-90 shadow-lg ${isOngoing ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
            >
              {isOngoing ? 'Time Out' : 'Shift Done'}
            </button>
          ) : hasFace && onFaceTimeIn && !isReliever ? (
            // Face enrolled + face ID required + regular staff — face scan button
            <button
              onMouseDown={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onFaceTimeIn(); }}
              className="h-11 px-5 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all active:scale-90 shadow-lg bg-slate-800 text-white hover:bg-emerald-600 flex items-center gap-2"
            >
              <ScanFace className="w-4 h-4" strokeWidth={2} />
              Time In
            </button>
          ) : onFaceTimeIn && !hasFace && !isReliever ? (
            // Face ID required, not enrolled, regular staff — block and prompt enrollment
            <button
              onMouseDown={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onEdit?.(emp); }}
              className="h-11 px-4 rounded-2xl text-xs font-bold uppercase tracking-widest bg-amber-100 text-amber-700 flex items-center gap-2 active:scale-90 transition-all"
              title="Face not enrolled. Tap to open employee profile and register face."
            >
              <ScanFace className="w-4 h-4" strokeWidth={2} />
              Enroll Face
            </button>
          ) : (
            // Relievers always use plain time in (face ID enrollment is per home branch)
            <button
              onMouseDown={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onTimeAction(emp); }}
              className="h-11 px-6 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all active:scale-90 shadow-lg bg-slate-800 text-white hover:bg-emerald-600"
            >
              Time In
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
