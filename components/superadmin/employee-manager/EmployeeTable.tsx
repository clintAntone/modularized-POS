import React from 'react';
import { Employee, Branch } from '../../../types';
import { UI_THEME } from '../../../constants/ui_designs';
import { RoleBadge } from './SharedComponents';
import { getEmployeeRole } from '../../../lib/payroll';
import { ProfileAvatar } from '../../ui/ProfileAvatar';

interface EmployeeTableProps {
  employees: Employee[];
  branches: Branch[];
  onEdit?: (emp: Employee) => void;
  onReset?: (emp: Employee) => void;
  onDelete?: (emp: Employee) => void;
  onEndLeave?: (emp: Employee) => void;
  currentBranchId?: string;
}

export const EmployeeTable: React.FC<EmployeeTableProps> = ({ employees, branches, onEdit, onReset, onDelete, onEndLeave, currentBranchId }) => {
  return (
    <div className={`hidden md:block bg-white ${UI_THEME.radius.card} border border-slate-200 shadow-sm overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse table-fixed">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className={`px-8 py-5 w-[20%] ${UI_THEME.text.metadata}`}>Name</th>
              <th className={`px-4 py-5 w-[14%] ${UI_THEME.text.metadata}`}>Home</th>
              <th className={`px-4 py-5 w-[18%] ${UI_THEME.text.metadata}`}>R-Branch</th>
              <th className={`px-4 py-5 w-[14%] text-center ${UI_THEME.text.metadata}`}>Specialization</th>
              <th className={`px-4 py-5 w-[10%] text-center ${UI_THEME.text.metadata}`}>Status</th>
              <th className={`px-4 py-5 w-[10%] text-center ${UI_THEME.text.metadata}`}>Position</th>
              <th className={`px-8 py-5 w-[14%] text-right ${UI_THEME.text.metadata}`}>Control</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.map(emp => {
              const empId = emp.timestamp
                ? (() => { const d = new Date(emp.timestamp); return `EMP-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}-${emp.id}`; })()
                : null;

              const empNameUpper = (emp.name || '').toUpperCase();
              const homeBranch = branches.find(b => b.id === emp.branchId);
              const relieverBranches = branches.filter(b =>
                b.id !== emp.branchId && (
                  b.manager?.toUpperCase() === empNameUpper ||
                  b.tempManager?.toUpperCase() === empNameUpper ||
                  (emp.branchAllowances && typeof emp.branchAllowances === 'object' && b.id in (emp.branchAllowances as any))
                )
              ).sort((a, b) => a.name.localeCompare(b.name));

              const position = branches.some(b => b.manager?.toUpperCase() === empNameUpper) ? 'manager' : 'regular';

              return (
                <tr
                  key={emp.id}
                  className={`hover:bg-slate-50 transition-colors group ${onEdit ? 'cursor-pointer' : ''} ${!emp.isActive ? 'opacity-60 grayscale-[0.5]' : ''}`}
                >
                  <td className="px-8 py-5" onClick={() => onEdit?.(emp)}>
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg overflow-hidden shrink-0 shadow-inner ${emp.isActive ? 'bg-slate-100' : 'bg-slate-50'}`}>
                        <ProfileAvatar name={emp.name || ''} src={emp.profile} />
                      </div>
                      <div className="min-w-0">
                        {empId && (
                          <p className="text-[8px] font-black text-slate-400 font-mono tracking-wide mb-1">{empId.toUpperCase()}</p>
                        )}
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-bold text-slate-900 uppercase text-sm tracking-tight group-hover:text-emerald-700 transition-colors leading-none">{emp.name || 'UNNAMED'}</p>
                        </div>
                        {emp.requestReset && (
                            <span className="text-[8px] font-bold bg-rose-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse mt-1.5 inline-block">Reset Requested</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-5" onClick={() => onEdit?.(emp)}>
                    {homeBranch
                      ? <span title={homeBranch.name} className="text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-tighter bg-emerald-50 text-emerald-700 border-emerald-200 max-w-[140px] truncate inline-block">{homeBranch.name}</span>
                      : <span className="text-[10px] font-semibold text-slate-300 italic">—</span>}
                  </td>
                  <td className="px-4 py-5" onClick={() => onEdit?.(emp)}>
                    <div className="flex flex-wrap gap-1.5">
                      {relieverBranches.length > 0 ? relieverBranches.map((b, i) => (
                        <span key={i} title={b.name} className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-tighter flex items-center gap-1 max-w-[140px] truncate
                          ${b.manager?.toUpperCase() === empNameUpper
                            ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                            : 'bg-violet-50 text-violet-700 border-violet-200'}`}>
                          {b.manager?.toUpperCase() === empNameUpper && <svg className="w-2.5 h-2.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>}
                          <span className="truncate">{b.name}</span>
                        </span>
                      )) : <span className="text-[10px] font-semibold text-slate-300">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-5 text-center" onClick={() => onEdit?.(emp)}>
                    <RoleBadge role={getEmployeeRole(emp, currentBranchId || emp.branchId).split(',').filter(r => !['MANAGER','RELIEVER'].includes(r.trim().toUpperCase())).join(',')} />
                  </td>
                  <td className="px-4 py-5 text-center" onClick={() => onEdit?.(emp)}>
                    <div className="flex items-center justify-center gap-2.5">
                      {emp.onLeave ? (
                        <>
                          <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-purple-500">On Leave</span>
                        </>
                      ) : (
                        <>
                          <div className={`w-1.5 h-1.5 rounded-full ${emp.isActive ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]' : 'bg-slate-300'}`} />
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${emp.isActive ? 'text-emerald-600' : 'text-slate-500'}`}>{emp.isActive ? 'Active' : 'Off'}</span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-5 text-center" onClick={() => onEdit?.(emp)}>
                    {position === 'manager'
                      ? <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Manager</span>
                      : <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Regular</span>
                    }
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex items-center justify-end gap-2.5">
                        {onReset && emp.isActive !== false && (
                          <button
                              onClick={(e) => { e.stopPropagation(); onReset(emp); }}
                              className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-lg transition-all active:scale-90 ${emp.requestReset ? 'bg-rose-600 text-white animate-pulse' : 'bg-slate-100 text-slate-400 hover:bg-indigo-600 hover:text-white'}`}
                              title={emp.requestReset ? "Resolve Reset Request" : "Manual Credential Reset"}
                          >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                              </svg>
                          </button>
                        )}
                        {onEndLeave && emp.onLeave && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onEndLeave(emp); }}
                            className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-purple-50 text-purple-400 hover:bg-purple-600 hover:text-white transition-all shadow-sm border border-purple-100 active:scale-90"
                            title="End Leave (Admin Override)"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        )}
                        {onDelete && !emp.isActive && (
                          <button
                              onClick={(e) => { e.stopPropagation(); onDelete(emp); }}
                              className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-rose-50 text-rose-400 hover:bg-rose-600 hover:text-white transition-all shadow-sm border border-rose-100 active:scale-90"
                              title="Delete Suspended Personnel"
                          >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                          </button>
                        )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};