
import React, { useMemo } from 'react';
import { Branch, SalesReport } from '../../../types';
import { TabID } from '../../BranchManagerDashboard';
import { playSound } from '../../../lib/audio';

const manilaYMD = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d);

interface MonthlySectionProps {
  branch: Branch;
  salesReports: SalesReport[];
  setActiveTab?: (id: TabID) => void;
}

export const MonthlySection: React.FC<MonthlySectionProps> = ({ branch, salesReports, setActiveTab }) => {
  const monthCycles = useMemo(() => {
    const data: any[] = [];
    const now = new Date();
    
    const anchorDateString = branch.cycleStartDate || `${now.getFullYear()}-01-01`;
    const [startYear, startMonth] = anchorDateString.split('-').map(v => parseInt(v, 10));
    
    // Start from the 1st of the anchor month
    let iterDate = new Date(startYear, startMonth - 1, 1, 0, 0, 0, 0);
    const currentDate = new Date();
    const filteredReports = salesReports.filter(r => {
      if (r.branchId !== branch.id) return false;
      return true;
    });

    while (iterDate <= currentDate) {
      const cycleStart = new Date(iterDate.getFullYear(), iterDate.getMonth(), 1);
      const cycleEnd = new Date(iterDate.getFullYear(), iterDate.getMonth() + 1, 0);
      cycleEnd.setHours(23, 59, 59, 999);
      
      const startStr = manilaYMD(cycleStart);
      const endStr = manilaYMD(cycleEnd);

      // Sum finalized reports within this month
      const cycleReports = filteredReports.filter(r => r.reportDate >= startStr && r.reportDate <= endStr);

      const gross = cycleReports.reduce((s, r) => s + r.grossSales, 0);
      const salary = cycleReports.reduce((s, r) => s + r.totalStaffPay, 0);
      const expenses = cycleReports.reduce((s, r) => s + r.totalExpenses, 0);
      const vault = cycleReports.reduce((s, r) => s + r.totalVaultProvision, 0);
      const net = cycleReports.reduce((s, r) => s + r.netRoi, 0);

      const isCurrent = currentDate >= cycleStart && currentDate <= cycleEnd;

      data.push({
        label: cycleStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }).toUpperCase(),
        scope: `${cycleStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${cycleEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`,
        gross,
        salary,
        expenses,
        vault,
        net,
        isCurrent,
        finalizedDays: cycleReports.length
      });

      iterDate.setMonth(iterDate.getMonth() + 1);
      
      if (data.length > 500) break;
    }
    
    return data.reverse();
  }, [salesReports, branch.id, branch.cycleStartDate]);

  const handleMonthClick = () => {
    if (setActiveTab) {
      setActiveTab('reports_master');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-10 pb-32 max-w-6xl mx-auto px-2">
      <div className="px-4 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-200 pb-10">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 uppercase tracking-tighter leading-none mb-3">Monthly Archive</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.4em]">Finalized Monthly Audit Reports</p>
        </div>
        <div className="flex items-center gap-4 bg-white px-6 py-3 rounded-2xl border border-slate-100 shadow-sm">
           <div className="relative">
             <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></div>
             <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
           </div>
           <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Archive Synced</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {monthCycles.map((m) => (
          <div 
            key={m.scope} 
            onClick={handleMonthClick}
            className={`group bg-white rounded-[40px] border transition-all duration-500 hover:shadow-2xl cursor-pointer active:scale-[0.98] flex flex-col overflow-hidden ${m.isCurrent ? 'border-emerald-500/30 ring-4 ring-emerald-500/5' : 'border-slate-100 hover:border-slate-300'}`}
          >
            <div className={`p-8 flex justify-between items-start transition-colors duration-500 ${m.isCurrent ? 'bg-[#064E3B]' : 'bg-[#0F172A]'}`}>
              <div className="space-y-1">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border ${m.isCurrent ? 'bg-emerald-400 text-emerald-950 border-emerald-300' : 'bg-white/10 text-white border-white/10'}`}>
                    {m.label}
                  </div>
                  <span className="text-[8px] font-bold text-emerald-300 uppercase tracking-[0.2em]">{m.finalizedDays} Finalized Logs</span>
                </div>
                <h3 className="text-xl font-bold text-white uppercase tracking-widest leading-none">{m.scope}</h3>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-xl">📂</div>
            </div>

            <div className="p-10 grid grid-cols-2 gap-8 bg-white relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 opacity-50"></div>
              
              <div className="space-y-1.5 relative z-10">
                <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>Gross Collection
                </p>
                <p className="text-2xl font-bold text-slate-900 tracking-tighter">₱{m.gross.toLocaleString()}</p>
              </div>

              <div className="space-y-1.5 relative z-10">
                <p className="text-[9px] font-bold text-amber-600 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>Staff Payout
                </p>
                <p className="text-2xl font-bold text-slate-900 tracking-tighter">₱{m.salary.toLocaleString()}</p>
              </div>

              <div className="space-y-1.5 pt-6 border-t border-slate-50 relative z-10">
                <p className="text-[9px] font-bold text-rose-500 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>Expenses
                </p>
                <p className="text-2xl font-bold text-slate-900 tracking-tighter">₱{m.expenses.toLocaleString()}</p>
              </div>

              <div className="space-y-1.5 pt-6 border-t border-slate-50 relative z-10">
                <p className="text-[9px] font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>R&B Reserve
                </p>
                <p className="text-2xl font-bold text-slate-900 tracking-tighter">₱{m.vault.toLocaleString()}</p>
              </div>
            </div>

            <div className="px-10 pb-10">
              <div className={`p-6 rounded-[28px] flex items-center justify-between transition-all duration-500 shadow-xl group-hover:translate-y-[-4px] ${m.net >= 0 ? 'bg-[#0F172A] group-hover:bg-[#1e293b]' : 'bg-rose-50 border border-rose-100'}`}>
                <div className="space-y-1">
                  <p className={`text-[8px] font-bold uppercase tracking-[0.3em] ${m.net >= 0 ? 'text-slate-400' : 'text-rose-400'}`}>Net ROI Archive</p>
                  <p className={`text-2xl font-bold tracking-tighter leading-none ${m.net >= 0 ? 'text-emerald-400' : 'text-rose-600'}`}>
                    {m.net < 0 ? '−' : ''}₱{Math.abs(m.net).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                   <span className={`text-[9px] font-bold uppercase tracking-widest ${m.net >= 0 ? 'text-white/40' : 'text-rose-400'}`}>View Details</span>
                   <div className={`p-3 rounded-2xl transition-all duration-500 group-hover:rotate-12 ${m.net >= 0 ? 'bg-white/10 text-white' : 'bg-rose-100 text-rose-600'}`}>
                     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                   </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
