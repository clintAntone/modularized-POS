import React from 'react';
import { Employee, Branch } from '../../../types';
import { UI_THEME } from '../../../constants/ui_designs';
import { RoleBadge } from './SharedComponents';
import { playSound } from '../../../lib/audio';
import { getEmployeeAllowance, getEmployeeRole, getInitials } from '../../../lib/payroll';

interface EmployeeTableProps {
  employees: Employee[];
  branches: Branch[];
  onEdit: (emp: Employee) => void;
  onReset: (emp: Employee) => void;
  onDelete: (emp: Employee) => void;
  currentBranchId?: string;
}

export const EmployeeTable: React.FC<EmployeeTableProps> = ({ employees, branches, onEdit, onReset, onDelete, currentBranchId }) => {
  return (
    <div className={`hidden md:block bg-white ${UI_THEME.radius.card} border border-slate-200 shadow-sm overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse table-fixed">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className={`px-8 py-5 w-[22%] ${UI_THEME.text.metadata}`}>Identity</th>
              <th className={`px-6 py-5 w-[25%] ${UI_THEME.text.metadata}`}>Authorized Workplaces</th>
              <th className={`px-4 py-5 w-[15%] text-center ${UI_THEME.text.metadata}`}>Role / Skills</th>
              <th className={`px-4 py-5 w-[12%] text-center ${UI_THEME.text.metadata}`}>Status</th>
              <th className={`px-4 py-5 w-[12%] text-right ${UI_THEME.text.metadata}`}>Base Pay</th>
              <th className={`px-8 py-5 w-[14%] text-right ${UI_THEME.text.metadata}`}>Control</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.map(emp => {
              const authorizedBranches = branches.filter(b => 
                b.id === emp.branchId || 
                b.manager?.toUpperCase() === (emp.name || '').toUpperCase() ||
                (emp.branchAllowances && typeof emp.branchAllowances === 'object' && b.id in (emp.branchAllowances as any))
              ).map(b => ({
                name: b.name,
                isManager: b.manager?.toUpperCase() === (emp.name || '').toUpperCase()
              }));
              
              return (
                <tr 
                  key={emp.id} 
                  className={`hover:bg-slate-50 transition-colors group cursor-pointer ${!emp.isActive ? 'opacity-60 grayscale-[0.5]' : ''}`}
                >
                  <td className="px-8 py-5" onClick={() => onEdit(emp)}>
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg overflow-hidden shrink-0 shadow-inner ${emp.isActive ? 'bg-slate-100' : 'bg-slate-50'}`}>
                        {emp.profile ? <img src={emp.profile} className="w-full h-full object-cover" alt={emp.name || ''} /> : <span className="font-bold italic text-slate-300">{getInitials(emp.name)}</span>}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 uppercase text-sm tracking-tight group-hover:text-emerald-700 transition-colors leading-none">{emp.name || 'UNNAMED'}</p>
                        {emp.firstName && emp.lastName && (
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1 truncate">
                            {emp.firstName} {emp.middleName ? emp.middleName + ' ' : ''}{emp.lastName}
                          </p>
                        )}
                        {emp.requestReset && (
                            <span className="text-[8px] font-bold bg-rose-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse mt-1.5 inline-block">Reset Requested</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5" onClick={() => onEdit(emp)}>
                    <div className="flex flex-wrap gap-1.5">
                       {authorizedBranches.length > 0 ? authorizedBranches.map((b, i) => (
                         <span key={i} className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-tighter flex items-center gap-1 ${b.isManager ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                           {b.isManager && <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>}
                           {b.name}
                         </span>
                       )) : <span className="text-[10px] font-semibold text-slate-300 italic">No Branch Linked</span>}
                    </div>
                  </td>
                  <td className="px-4 py-5 text-center" onClick={() => onEdit(emp)}>
                    <RoleBadge role={getEmployeeRole(emp, currentBranchId || emp.branchId)} />
                  </td>
                  <td className="px-4 py-5 text-center" onClick={() => onEdit(emp)}>
                    <div className="flex items-center justify-center gap-2.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${emp.isActive ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]' : 'bg-slate-300'}`}></div>
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${emp.isActive ? 'text-emerald-600' : 'text-slate-500'}`}>{emp.isActive ? 'Active' : 'Off'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-5 text-right" onClick={() => onEdit(emp)}>
                    <div className="flex flex-col items-end">
                      <span className="text-sm font-bold text-slate-900 tabular-nums">
                        ₱{getEmployeeAllowance(emp, currentBranchId || 'all').toLocaleString()}
                      </span>
                      {emp.branchAllowances && Object.keys(emp.branchAllowances).length > 0 && (
                        <span className="text-[7px] font-black text-emerald-600 uppercase tracking-widest mt-0.5">
                          {currentBranchId && currentBranchId !== 'all' && emp.branchAllowances[currentBranchId] !== undefined ? 'Override Active' : 'Overrides Configured'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex items-center justify-end gap-2.5">
                        <button 
                            onClick={(e) => { e.stopPropagation(); onReset(emp); }}
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-lg transition-all active:scale-90 ${emp.requestReset ? 'bg-rose-600 text-white animate-pulse' : 'bg-slate-100 text-slate-400 hover:bg-indigo-600 hover:text-white'}`}
                            title={emp.requestReset ? "Resolve Reset Request" : "Manual Credential Reset"}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                            </svg>
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); onEdit(emp); }}
                            className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-slate-50 text-slate-300 hover:bg-slate-900 hover:text-white transition-all shadow-sm border border-slate-100 active:scale-90"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" strokeWidth="3" /></svg>
                        </button>
                        {!emp.isActive && (
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