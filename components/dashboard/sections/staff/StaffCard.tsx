
import React, { useRef, useState } from 'react';
import { Attendance, Employee } from '../../../../types';
import { RoleBadge } from './RoleBadge';
import { getEmployeeAllowance, getEmployeeRole, getInitials } from '../../../../lib/payroll';
import { UI_THEME } from '../../../../constants/ui_designs';
import { Key, Pencil } from 'lucide-react';
import { playSound } from '../../../../lib/audio';
import { ProfileAvatar } from '../../../ui/ProfileAvatar';

const LONG_PRESS_MS = 800;

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
}) => {
  const isOngoing = shiftState === 'ONGOING';
  const isCompleted = shiftState === 'COMPLETED';
  const isActive = emp.isActive;
  const currentAllowance = getEmployeeAllowance(emp, branchId);
  const currentRole = getEmployeeRole(emp, branchId);
  const isReliever = isRelieverProp ?? (emp.branchId !== branchId);

  const [isLongPressing, setIsLongPressing] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const displayRole = currentRole.split(',')
    .filter(r => r.trim().toUpperCase() !== 'MANAGER')
    .join(',');

  const startLongPress = () => {
    if (!isReliever || !onPromote) return;
    didLongPress.current = false;
    setIsLongPressing(true);
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setIsLongPressing(false);
      playSound('click');
      onPromote(emp);
    }, LONG_PRESS_MS);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setIsLongPressing(false);
  };

  return (
    <div
      className={`${isOngoing ? 'bg-emerald-50' : 'bg-white'} ${UI_THEME.radius.card} border transition-all duration-500 group relative overflow-hidden flex flex-col h-full select-none ${
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

       {/* Reliever Ribbon */}
       {isReliever && (
         <div className="absolute top-0 left-0 z-20 overflow-hidden w-20 h-20 pointer-events-none">
           <div className="absolute top-0 left-0 bg-indigo-600 text-white text-[7px] font-black uppercase tracking-widest py-1 w-[140%] -rotate-45 -translate-x-[30%] translate-y-[20%] text-center shadow-lg border-y border-indigo-400/30">
             RELIEVER
           </div>
         </div>
       )}

       {/* Manager Ribbon */}
       {isMainManager && (
         <div className="absolute top-0 left-0 z-20 overflow-hidden w-24 h-24 pointer-events-none">
           <div className="absolute top-0 left-0 bg-emerald-600 text-white text-[7px] font-black uppercase tracking-widest py-1 w-[140%] -rotate-45 -translate-x-[30%] translate-y-[25%] text-center shadow-lg border-y border-emerald-400/30">
             MAIN MANAGER
           </div>
         </div>
       )}

       {isTempManager && !isMainManager && (
         <div className="absolute top-0 left-0 z-20 overflow-hidden w-24 h-24 pointer-events-none">
           <div className="absolute top-0 left-0 bg-amber-600 text-white text-[7px] font-black uppercase tracking-widest py-1 w-[140%] -rotate-45 -translate-x-[30%] translate-y-[25%] text-center shadow-lg border-y border-amber-400/30">
             TEMP MANAGER
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
               {onReset && (
                 <button
                   onMouseDown={e => e.stopPropagation()}
                   onTouchStart={e => e.stopPropagation()}
                   onClick={() => onReset(emp)}
                   className="p-2.5 rounded-xl bg-slate-50 text-slate-300 hover:bg-rose-600 hover:text-white transition-all border border-transparent hover:border-white shadow-inner"
                   title="Reset Credentials"
                 >
                   <Key className="w-4 h-4" strokeWidth={3} />
                 </button>
               )}
               {onRequestDisable && isActive && !isMainManager && !isTempManager && (
                 <button
                   onMouseDown={e => e.stopPropagation()}
                   onTouchStart={e => e.stopPropagation()}
                   onClick={() => onRequestDisable(emp)}
                   className="p-2.5 rounded-xl bg-slate-50 text-slate-300 hover:bg-amber-500 hover:text-white transition-all border border-transparent hover:border-white shadow-inner"
                   title="Request to Disable"
                 >
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                     <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                   </svg>
                 </button>
               )}
               <button
                 onMouseDown={e => e.stopPropagation()}
                 onTouchStart={e => e.stopPropagation()}
                 onClick={() => onEdit(emp)}
                 className="p-2.5 rounded-xl bg-slate-50 text-slate-300 hover:bg-slate-900 hover:text-white transition-all border border-transparent hover:border-white shadow-inner"
                 title="Edit Profile"
               >
                 <Pencil className="w-4 h-4" strokeWidth={3} />
               </button>
            </div>
          </div>

          <div className="space-y-4 flex-1">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-slate-900 uppercase tracking-tighter truncate group-hover:text-emerald-700 transition-colors leading-none mb-2">{emp.name || 'UNNAMED'}</h3>
              {emp.firstName && emp.lastName && (
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2 truncate">
                  {emp.firstName} {emp.middleName ? emp.middleName + ' ' : ''}{emp.lastName}
                </p>
              )}
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

          <div className="mt-auto pt-6 border-t border-slate-100 flex items-center justify-between">
             <div className="space-y-1">
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                  {emp.branchAllowances?.[branchId] ? 'Override Rate' : 'Base Rate'}
                </p>
                <p className="text-sm font-black text-slate-900 tabular-nums">₱{currentAllowance.toLocaleString()}</p>
             </div>
             <button
               disabled={!isActive || isCompleted}
               onMouseDown={e => e.stopPropagation()}
               onTouchStart={e => e.stopPropagation()}
               onClick={() => onTimeAction(emp)}
               className={`h-11 px-6 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all active:scale-90 shadow-lg ${isOngoing ? 'bg-rose-600 text-white' : isCompleted ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-slate-900 text-white hover:bg-emerald-600'}`}
             >
               {isOngoing ? 'Time Out' : isCompleted ? 'Shift Done' : 'Time In'}
             </button>
          </div>
       </div>
    </div>
  );
};
