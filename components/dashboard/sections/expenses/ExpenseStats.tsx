import React from 'react';

interface ExpenseStatsProps {
  totalAmount: number;
  count: number;
}

export const ExpenseStats: React.FC<ExpenseStatsProps> = ({ totalAmount, count }) => {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-8 px-1">
      <div className="flex-1 bg-slate-900 p-6 sm:p-8 rounded-[36px] shadow-xl relative overflow-hidden group border border-slate-800">
        <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-rose-500/20 transition-all duration-700"></div>
        <div className="relative z-10">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-3">Today's Expense Burn</p>
          <p className="text-4xl sm:text-5xl font-black text-rose-500 tracking-tighter tabular-nums leading-none">₱{totalAmount.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-white px-8 py-5 rounded-2xl border border-slate-100 shadow-sm flex flex-row sm:flex-col items-center sm:items-start justify-between sm:justify-center gap-2 sm:min-w-[140px]">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Indexed Logs</p>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <p className="text-xl font-black text-slate-900 tracking-tight leading-none tabular-nums">{count}</p>
        </div>
      </div>
    </div>
  );
};