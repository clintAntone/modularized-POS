import React, { useState, useMemo } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { Branch, Transaction, Expense, Employee, Attendance, SalesReport } from '../../types';
import { UI_THEME } from '../../constants/ui_designs';
import { playSound } from '../../lib/audio';
import { PayrollSection } from '../dashboard/sections/PayrollSection';

interface PayrollHubProps {
  branches: Branch[];
  transactions: Transaction[];
  expenses: Expense[];
  employees: Employee[];
  attendance: Attendance[];
  salesReports: SalesReport[];
  onRefresh?: () => void;
}

export const PayrollHub: React.FC<PayrollHubProps> = ({ 
  branches, 
  transactions, 
  expenses, 
  employees, 
  attendance, 
  salesReports,
  onRefresh 
}) => {
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);

  const filteredBranches = useMemo(() => {
    return branches.filter(b =>
      b.name.toUpperCase().includes(debouncedSearch.toUpperCase()) ||
      b.id.toUpperCase().includes(debouncedSearch.toUpperCase())
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [branches, debouncedSearch]);

  const selectedBranch = useMemo(() => 
    branches.find(b => b.id === selectedBranchId)
  , [branches, selectedBranchId]);

  if (selectedBranch) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSelectedBranchId(null)}
              className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-900"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div>
              <h3 className="text-lg font-bold text-slate-900 uppercase tracking-tight">{selectedBranch.name}</h3>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Branch Payroll Management</p>
            </div>
          </div>
        </div>

        <PayrollSection 
          branch={selectedBranch}
          transactions={transactions}
          expenses={expenses}
          attendance={attendance}
          employees={employees}
          salesReports={salesReports}
          onRefresh={onRefresh}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 uppercase tracking-tight">Global Payroll Hub</h3>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Network-wide Compensation Audit</p>
            </div>
          </div>

          <div className="relative group max-w-md w-full">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-emerald-500 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <input
              type="text"
              placeholder="SEARCH BRANCH..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium uppercase tracking-wide focus:bg-white focus:border-emerald-500 transition-all outline-none"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBranches.map(branch => (
          <button
            key={branch.id}
            onClick={() => { playSound('click'); setSelectedBranchId(branch.id); }}
            className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl hover:border-emerald-500 transition-all duration-300 text-left group"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-xl group-hover:bg-emerald-50 transition-colors">🏢</div>
              <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                <div className={`w-1.5 h-1.5 rounded-full ${branch.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{branch.isOpen ? 'LIVE' : 'OFF'}</span>
              </div>
            </div>
            
            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight group-hover:text-emerald-700 transition-colors">{branch.name}</h4>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-1">Manager: {branch.manager || 'Unassigned'}</p>
            
            <div className="mt-6 flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">Weekly Cutoff</p>
                <p className="text-xs font-bold text-slate-600 uppercase">
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][Number(branch.weeklyCutoff)]}
                </p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M9 5l7 7-7 7" /></svg>
              </div>
            </div>
          </button>
        ))}
      </div>

      {filteredBranches.length === 0 && (
        <div className="py-20 text-center bg-white rounded-3xl border border-dashed border-slate-200">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">No branches found matching your search</p>
        </div>
      )}
    </div>
  );
};
