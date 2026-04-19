import React from 'react';
import { Employee, Branch } from '../../../types';
import { UI_THEME } from '../../../constants/ui_designs';
import { RoleBadge } from './SharedComponents';
import { getEmployeeAllowance, getEmployeeRole, getInitials } from '../../../lib/payroll';

interface EmployeeMobileListProps {
  employees: Employee[];
  branches: Branch[];
  onEdit: (emp: Employee) => void;
  onReset: (emp: Employee) => void;
  onDelete: (emp: Employee) => void;
  currentBranchId?: string;
}

export const EmployeeMobileList: React.FC<EmployeeMobileListProps> = ({ employees, branches, onEdit, onReset, onDelete, currentBranchId }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:hidden">
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
          <div 
            key={emp.id} 
            className={`bg-white p-4 ${UI_THEME.radius.card} border transition-all duration-500 flex flex-col justify-between group hover:shadow-lg hover:translate-y-[-2px] cursor-pointer relative overflow-hidden ${emp.isActive ? 'border-slate-200 hover:border-emerald-500' : 'border-slate-100 opacity-60 grayscale bg-slate-50/50'}`}
          >
            <div className="flex items-start gap-3 mb-3" onClick={() => onEdit(emp)}>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg shadow-inner shrink-0 overflow-hidden ${emp.isActive ? 'bg-slate-100' : 'bg-white'}`}>
                {emp.profile ? <img src={emp.profile} className="w-full h-full object-cover" alt={emp.name || ''} /> : <span className="font-black italic text-slate-300 text-sm">{getInitials(emp.name)}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                    <h3 className={`text-sm font-bold text-slate-900 uppercase tracking-tight group-hover:text-emerald-700 transition-colors`}>{emp.name || 'UNNAMED'}</h3>
                    {emp.requestReset && <div className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse"></div>}
                </div>
                {emp.firstName && emp.lastName && (
                  <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest mb-1 truncate">
                    {emp.firstName} {emp.middleName ? emp.middleName + ' ' : ''}{emp.lastName}
                  </p>
                )}
                <div className="flex flex-wrap gap-1 mt-1 opacity-60">
                  {authorizedBranches.map((b, i) => (
                    <span key={i} className={`text-[6px] font-black px-1 py-0.5 rounded leading-none uppercase flex items-center gap-0.5 ${b.isManager ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {b.isManager && <svg className="w-2 h-2" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>}
                      {b.name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                 <button 
                    onClick={(e) => { e.stopPropagation(); onReset(emp); }}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-md border ${emp.requestReset ? 'bg-rose-600 border-rose-500 text-white animate-pulse' : 'bg-white border-slate-100 text-slate-300'}`}
                 >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                 </button>
                 {!emp.isActive && (
                   <button 
                      onClick={(e) => { e.stopPropagation(); onDelete(emp); }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center shadow-md border bg-rose-50 border-rose-100 text-rose-400 hover:bg-rose-600 hover:text-white transition-all"
                      title="Delete Suspended Personnel"
                   >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                   </button>
                 )}
              </div>
            </div>
            
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
               <RoleBadge role={getEmployeeRole(emp, currentBranchId || emp.branchId)} />
               <div className="flex flex-col items-end">
                  <p className="text-[13px] font-black text-slate-900 tabular-nums">
                    ₱{getEmployeeAllowance(emp, currentBranchId || 'all').toLocaleString()}
                  </p>
                  {emp.branchAllowances && Object.keys(emp.branchAllowances).length > 0 && (
                    <span className="text-[5px] font-black text-emerald-600 uppercase tracking-widest">
                      {currentBranchId && currentBranchId !== 'all' && emp.branchAllowances[currentBranchId] !== undefined ? 'Override Active' : 'Overrides Configured'}
                    </span>
                  )}
               </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};