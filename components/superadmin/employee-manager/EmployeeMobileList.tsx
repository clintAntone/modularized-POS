import React from 'react';
import { Employee, Branch } from '../../../types';
import { UI_THEME } from '../../../constants/ui_designs';
import { RoleBadge } from './SharedComponents';
import { getEmployeeAllowance, getEmployeeRole, getInitials } from '../../../lib/payroll';
import { ProfileAvatar } from '../../ui/ProfileAvatar';

interface EmployeeMobileListProps {
  employees: Employee[];
  branches: Branch[];
  onEdit?: (emp: Employee) => void;
  onReset?: (emp: Employee) => void;
  onDelete?: (emp: Employee) => void;
  onEndLeave?: (emp: Employee) => void;
  currentBranchId?: string;
}

export const EmployeeMobileList: React.FC<EmployeeMobileListProps> = ({ employees, branches, onEdit, onReset, onDelete, onEndLeave, currentBranchId }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:hidden">
      {employees.map(emp => {
        const empId = emp.timestamp
          ? (() => { const d = new Date(emp.timestamp); const mm = String(d.getUTCMonth() + 1).padStart(2, '0'); const dd = String(d.getUTCDate()).padStart(2, '0'); return `EMP-${mm}-${dd}-${emp.id}`; })()
          : null;

        const empNameUpper = (emp.name || '').toUpperCase();
        const homeBranch = branches.find(b => b.id === emp.branchId);
        const relieverBranches = branches.filter(b =>
          b.id !== emp.branchId &&
          (b.manager?.toUpperCase() === empNameUpper ||
           b.tempManager?.toUpperCase() === empNameUpper ||
           (emp.branchAllowances && typeof emp.branchAllowances === 'object' && b.id in (emp.branchAllowances as any)))
        ).sort((a, b) => a.name.localeCompare(b.name));
        const isManager = homeBranch ? homeBranch.manager?.toUpperCase() === empNameUpper : false;

        const branchRelation = (() => {
          if (!currentBranchId) return null;
          const b = branches.find(br => br.id === currentBranchId);
          if (!b) return null;
          if (b.manager?.toUpperCase() === (emp.name || '').toUpperCase()) return 'manager';
          if (emp.branchId === currentBranchId) return 'regular';
          if (emp.branchAllowances && typeof emp.branchAllowances === 'object' && currentBranchId in (emp.branchAllowances as any)) return 'reliever';
          return null;
        })();

        return (
          <div
            key={emp.id}
            className={`bg-white p-4 ${UI_THEME.radius.card} border transition-all duration-500 flex flex-col gap-3 group hover:shadow-lg hover:translate-y-[-2px] cursor-pointer relative overflow-hidden ${emp.isActive ? 'border-slate-200 hover:border-emerald-500' : 'border-slate-100 opacity-60 grayscale bg-slate-50/50'}`}
            onClick={() => onEdit?.(emp)}
          >
            {/* Header: two-column — left: label+avatar | right: empId+name+actions */}
            <div className="flex items-start gap-3">
              {/* Left col: avatar */}
              <div className="shrink-0">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg shadow-inner overflow-hidden ${emp.isActive ? 'bg-slate-100' : 'bg-white'}`}>
                  <ProfileAvatar name={emp.name || ''} src={emp.profile} />
                </div>
              </div>

              {/* Right col: empId + name + relation badges */}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {empId && (
                      <p className="text-xs font-black text-slate-400 font-mono tracking-wide mb-1">{empId.toUpperCase()}</p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-[15px] font-black text-slate-900 uppercase tracking-tight group-hover:text-emerald-700 transition-colors leading-tight">{emp.name || 'UNNAMED'}</h3>
                      {emp.onLeave && (
                        <span className="text-xs font-semibold uppercase tracking-wide text-purple-500 leading-none">● On Leave</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {emp.requestReset && <div className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />}
                    </div>
                  </div>
                  {/* Action buttons */}
                  {(onReset || onDelete || onEndLeave) && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {onReset && emp.isActive !== false && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onReset(emp); }}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center border ${emp.requestReset ? 'bg-rose-600 border-rose-500 text-white animate-pulse' : 'bg-white border-slate-100 text-slate-300'}`}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                          </svg>
                        </button>
                      )}
                      {onEndLeave && emp.onLeave && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onEndLeave(emp); }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center border bg-purple-50 border-purple-100 text-purple-400 hover:bg-purple-600 hover:text-white transition-all"
                          title="End Leave (Admin Override)"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </button>
                      )}
                      {onDelete && !emp.isActive && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(emp); }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center border bg-rose-50 border-rose-100 text-rose-400 hover:bg-rose-600 hover:text-white transition-all"
                          title="Delete Suspended Personnel"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Row 3: Branch info */}
            <div className="space-y-1">
              {homeBranch && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0 w-14">Home</span>
                  <span className="flex items-center gap-1 text-xs font-bold text-slate-700 uppercase truncate">
                    {isManager && <svg className="w-2.5 h-2.5 shrink-0 text-indigo-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>}
                    {homeBranch.name}
                  </span>
                </div>
              )}
              {relieverBranches.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0 w-14 pt-px">Reliever</span>
                  <p className="text-xs font-bold text-violet-500 uppercase leading-snug">
                    {relieverBranches.map(b => b.name).join(' · ')}
                  </p>
                </div>
              )}
            </div>

            {/* Row 4: Role badge + Pay */}
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-1 flex-wrap min-w-0">
                {getEmployeeRole(emp, currentBranchId || emp.branchId)
                  .split(',')
                  .filter(r => !['MANAGER','RELIEVER'].includes(r.trim().toUpperCase()))
                  .filter(Boolean)
                  .map(r => {
                    const color = r.trim().toUpperCase() === 'THERAPIST' ? 'bg-emerald-600 border-emerald-700' : 'bg-amber-500 border-amber-600';
                    return (
                      <span key={r} className={`px-2 py-0.5 rounded-lg text-xs font-semibold uppercase tracking-wide border text-white ${color}`}>
                        {r.trim()}
                      </span>
                    );
                  })}
              </div>
              {(() => {
                const baMap = emp.branchAllowances && typeof emp.branchAllowances === 'object' ? emp.branchAllowances as Record<string, any> : {};
                const baValues = Object.values(baMap).map(v => Number(typeof v === 'object' && v !== null ? v.allowance : v) || 0);
                const uniqueValues = [...new Set(baValues)];
                const hasVaried = uniqueValues.length > 1;

                if (currentBranchId && currentBranchId !== 'all') {
                  const branchAllowance = getEmployeeAllowance(emp, currentBranchId);
                  const isOverride = baMap[currentBranchId] !== undefined;
                  return (
                    <div className="flex flex-col items-end shrink-0">
                      <p className="text-sm font-black text-slate-900 tabular-nums">₱{branchAllowance.toLocaleString()}</p>
                      {isOverride && <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest whitespace-nowrap">Override Active</span>}
                    </div>
                  );
                }

                if (hasVaried) {
                  const min = Math.min(...uniqueValues);
                  const max = Math.max(...uniqueValues);
                  return (
                    <div className="flex flex-col items-end shrink-0">
                      <p className="text-sm font-black text-slate-900 tabular-nums">₱{min.toLocaleString()}–₱{max.toLocaleString()}</p>
                      <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest whitespace-nowrap">Varies per branch</span>
                    </div>
                  );
                }

                return (
                  <div className="flex flex-col items-end shrink-0">
                    <p className="text-sm font-black text-slate-900 tabular-nums">₱{getEmployeeAllowance(emp, emp.branchId).toLocaleString()}</p>
                    {uniqueValues.length > 0 && <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest whitespace-nowrap">Multi-branch</span>}
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })}
    </div>
  );
};