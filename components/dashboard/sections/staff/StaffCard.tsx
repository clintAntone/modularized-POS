
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
  onRequestDisable?: (emp: Employee) => void;
  onRemoveReliever?: (emp: Employee) => void;
  onViewID?: (emp: Employee) => void;
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
  onRequestDisable,
  onRemoveReliever,
  onViewID,
  onFaceTimeIn,
}) => {
  const isOngoing = shiftState === 'ONGOING';
  const isCompleted = shiftState === 'COMPLETED';
  const isActive = emp.isActive;
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
    if (!isReliever || !onPromote) return;
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
      className={`${isOngoing ? 'bg-emerald-50' : 'bg-white'} ${UI_THEME.radius.card} border transition-all duration-500 group relative overflow-hidden flex flex-col h-full select-none cursor-pointer ${
        !isActive
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
      onClick={() => { if (!didLongPress.current) onEdit(emp); }}
    >
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
            <span className="text-[9px] font-black text-white uppercase tracking-widest">Hold to Promote</span>
          </div>
        </div>
      )}

      {/* Reliever hint (idle) */}
      {isReliever && onPromote && !isLongPressing && (
        <div className="absolute bottom-0 inset-x-0 z-10 flex justify-center pb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
            Hold to Promote
          </span>
        </div>
      )}

      {/* Corner ribbons */}
      {isReliever && (
        <div className="absolute top-0 left-0 z-20 overflow-hidden w-20 h-20 pointer-events-none">
          <div className="absolute top-0 left-0 bg-indigo-600 text-white text-[7px] font-black uppercase tracking-widest py-1 w-[140%] -rotate-45 -translate-x-[30%] translate-y-[20%] text-center shadow-lg border-y border-indigo-400/30">
            RELIEVER
          </div>
        </div>
      )}
      {isMainManager && (
        <div className="absolute top-0 left-0 z-20 overflow-hidden w-24 h-24 pointer-events-none">
          <div className="absolute top-0 left-0 bg-emerald-600 text-white text-[7px] font-black uppercase tracking-widest py-1 w-[140%] -rotate-45 -translate-x-[30%] translate-y-[25%] text-center shadow-lg border-y border-emerald-400/30">
            MANAGER
          </div>
        </div>
      )}
      {isTempManager && !isMainManager && (
        <div className="absolute top-0 left-0 z-20 overflow-hidden w-24 h-24 pointer-events-none">
          <div className="absolute top-0 left-0 bg-amber-500 text-white text-[7px] font-black uppercase tracking-widest py-1 w-[140%] -rotate-45 -translate-x-[30%] translate-y-[25%] text-center shadow-lg border-y border-amber-400/30">
            DELEGATE
          </div>
        </div>
      )}

      {!isActive && (
        <div className="absolute top-0 right-0 px-4 py-1.5 rounded-bl-2xl text-[7px] font-black uppercase tracking-widest z-10 text-white shadow-lg bg-slate-400">
          Suspended
        </div>
      )}

      <div className="p-5 sm:p-8 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-4 sm:mb-8">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-[32px] overflow-hidden bg-slate-50 border-4 border-white shadow-xl transition-transform group-hover:scale-110 duration-500">
            <ProfileAvatar name={emp.name} src={emp.profile} initialsClassName="text-3xl" />
          </div>
          <div className="flex gap-2">
            {onViewID && (
              <button
                onMouseDown={e => e.stopPropagation()}
                onTouchStart={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onViewID(emp); }}
                className="p-2.5 rounded-xl bg-slate-50 text-slate-300 hover:bg-indigo-600 hover:text-white transition-all border border-transparent hover:border-white shadow-inner"
                title="View Company ID"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2" />
                </svg>
              </button>
            )}
            {onReset && (isMainManager || isTempManager) && (
              <button
                onMouseDown={e => e.stopPropagation()}
                onTouchStart={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onReset(emp); }}
                className="p-2.5 rounded-xl bg-slate-50 text-slate-300 hover:bg-rose-600 hover:text-white transition-all border border-transparent hover:border-white shadow-inner"
                title="Reset Credentials"
              >
                <Fingerprint className="w-4 h-4" strokeWidth={2.5} />
              </button>
            )}
            {onRemoveReliever && isReliever && (
              <button
                onMouseDown={e => e.stopPropagation()}
                onTouchStart={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onRemoveReliever(emp); }}
                className="p-2.5 rounded-xl bg-slate-50 text-slate-300 hover:bg-rose-600 hover:text-white transition-all border border-transparent hover:border-white shadow-inner"
                title="Remove from Branch Staff List"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                </svg>
              </button>
            )}
            {onRequestDisable && isActive && !isMainManager && !isTempManager && !isReliever && (
              <button
                onMouseDown={e => e.stopPropagation()}
                onTouchStart={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onRequestDisable(emp); }}
                className="p-2.5 rounded-xl bg-slate-50 text-slate-300 hover:bg-amber-500 hover:text-white transition-all border border-transparent hover:border-white shadow-inner"
                title="Request to Disable"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="space-y-4 flex-1">
          <div className="min-w-0">
            {emp.timestamp && (() => {
              const d = new Date(emp.timestamp);
              const empId = `EMP-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}-${emp.id}`.toUpperCase();
              return (
                <p className="text-[8px] font-black text-slate-400 font-mono tracking-wide mb-1">{empId}</p>
              );
            })()}
            <h3 className="text-lg font-bold text-slate-900 uppercase tracking-tighter truncate group-hover:text-emerald-700 transition-colors leading-none mb-2">{emp.name || 'UNNAMED'}</h3>
            {displayRole ? (
              <RoleBadge role={displayRole} />
            ) : (!isMainManager && !isTempManager) ? (
              <div className="flex items-center gap-2 text-rose-500 animate-pulse bg-rose-50/50 px-2 py-1 rounded-lg border border-rose-100 w-fit">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e]"></div>
                <span className="text-[8px] font-black uppercase tracking-widest">No Role Assigned</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-auto pt-6 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Employee Allowance</p>
            <p className="text-sm font-black text-slate-900 tabular-nums">₱{currentAllowance.toLocaleString()}</p>
          </div>

          {/* Time actions */}
          {isOngoing || isCompleted || !isActive ? (
            // Time-out / completed / inactive — single button
            <button
              disabled={!isActive || isCompleted}
              onMouseDown={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onTimeAction(emp); }}
              className={`h-11 px-6 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all active:scale-90 shadow-lg ${isOngoing ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
            >
              {isOngoing ? 'Time Out' : 'Shift Done'}
            </button>
          ) : hasFace && onFaceTimeIn && !isReliever ? (
            // Face enrolled + face ID required + regular staff — face scan button
            <button
              onMouseDown={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onFaceTimeIn(); }}
              className="h-11 px-5 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all active:scale-90 shadow-lg bg-slate-900 text-white hover:bg-emerald-600 flex items-center gap-2"
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
              className="h-11 px-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest bg-amber-100 text-amber-700 flex items-center gap-2 active:scale-90 transition-all"
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
              className="h-11 px-6 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all active:scale-90 shadow-lg bg-slate-900 text-white hover:bg-emerald-600"
            >
              Time In
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
