import React from 'react';
import { motion } from 'motion/react';

interface SalesKPIStripProps {
    gross: number;
    operationalExp: number;
    finalStaffPayTotal: number;
    provisionExp: number;
    net: number;
    totalAllowances: number;
    otAdditions: number;
    lateDeductions: number;
    totalCashAdvances: number;
    cashTotal?: number;
    gcashTotal?: number;
    connStatus?: 'connecting' | 'connected' | 'error' | 'offline';
    pendingSyncCount?: number;
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

const getFontSize = (val: number) => {
  const len = Math.abs(val).toLocaleString().length;
  if (len > 12) return 'text-base sm:text-lg';
  if (len > 10) return 'text-lg sm:text-xl'; 
  if (len > 8) return 'text-xl sm:text-2xl';
  return 'text-2xl sm:text-3xl';
};

export const SalesKPIStrip: React.FC<SalesKPIStripProps> = React.memo(({
                                                                 gross, operationalExp, finalStaffPayTotal, provisionExp, net,
                                                                 totalAllowances, otAdditions, lateDeductions, totalCashAdvances,
                                                                 cashTotal = 0, gcashTotal = 0,
                                                                 connStatus = 'connected', pendingSyncCount = 0
                                                             }) => {
    const netPayableCash = finalStaffPayTotal - totalCashAdvances;

    return (
        <div 
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4"
        >
            {/* Gross Sales - Large Bento Piece */}
            <div 
                className="col-span-2 md:col-span-2 lg:col-span-2 bg-[#E6F9F1] p-6 sm:p-8 rounded-[32px] border border-emerald-100/50 flex flex-col justify-center gap-1 min-h-[100px] sm:min-h-[120px] relative overflow-hidden group transition-all hover:shadow-lg print:bg-white print:border-slate-200"
            >
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-200/20 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-emerald-300/30 transition-colors"></div>
                <p className="text-[10px] sm:text-[12px] font-bold text-emerald-600 uppercase tracking-[0.2em] relative z-10">Gross Sales</p>
                <p className={`${getFontSize(gross)} font-black text-slate-900 tracking-tightest leading-none tabular-nums whitespace-nowrap relative z-10`}>
                    ₱{gross.toLocaleString()}
                </p>
                {(cashTotal > 0 || gcashTotal > 0) && (
                  <div className="flex gap-3 mt-2 relative z-10">
                    <div className="flex flex-col">
                      <span className="text-[7px] font-black text-emerald-600/60 uppercase tracking-widest">Cash</span>
                      <span className="text-[12px] sm:text-[14px] font-bold text-slate-700 tabular-nums">₱{cashTotal.toLocaleString()}</span>
                    </div>
                    <div className="w-px h-6 bg-emerald-200/30 self-end"></div>
                    <div className="flex flex-col">
                      <span className="text-[7px] font-black text-emerald-600/60 uppercase tracking-widest">GCash</span>
                      <span className="text-[12px] sm:text-[14px] font-bold text-slate-700 tabular-nums">₱{gcashTotal.toLocaleString()}</span>
                    </div>
                  </div>
                )}
            </div>

            {/* Expenses - Standard Piece */}
            <div 
                className="col-span-1 bg-[#FFF1F2] p-5 sm:p-6 rounded-[28px] border border-red-100/50 flex flex-col justify-center gap-0.5 min-h-[90px] transition-all hover:shadow-md print:bg-white print:border-slate-200"
            >
                <p className="text-[9px] sm:text-[11px] font-bold text-red-600 uppercase tracking-widest">Expenses</p>
                <p className={`${getFontSize(operationalExp)} font-bold text-slate-900 tracking-tightest leading-none tabular-nums whitespace-nowrap`}>
                    ₱{operationalExp.toLocaleString()}
                </p>
            </div>

            {/* Staff Payroll - Standard Piece */}
            <div 
                className="col-span-1 bg-[#FFFBEB] p-5 sm:p-6 rounded-[28px] border border-amber-100/50 flex flex-col justify-center gap-0.5 min-h-[90px] transition-all hover:shadow-md print:bg-white print:border-slate-200"
            >
                <p className="text-[9px] sm:text-[11px] font-bold text-amber-600 uppercase tracking-widest">Staff Payroll</p>
                <div className="flex flex-col gap-0.5">
                    <p className={`${getFontSize(finalStaffPayTotal)} font-bold text-slate-900 tracking-tightest leading-none tabular-nums whitespace-nowrap`}>
                        ₱{finalStaffPayTotal.toLocaleString()}
                    </p>
                    <div className="flex flex-wrap items-center gap-1 opacity-60">
                        <span className="text-[8px] sm:text-[10px] font-black text-amber-700 uppercase">
                           Net: ₱{netPayableCash.toLocaleString()}
                        </span>
                    </div>
                </div>
            </div>

            {/* Rent & Bills - Standard Piece */}
            <div 
                className="col-span-1 bg-indigo-50 p-5 sm:p-6 rounded-[28px] border border-indigo-100/50 flex flex-col justify-center gap-0.5 min-h-[90px] transition-all hover:shadow-md print:bg-white print:border-slate-200"
            >
                <p className="text-[9px] sm:text-[11px] font-bold text-indigo-600 uppercase tracking-widest">Rent & Bills</p>
                <p className={`${getFontSize(provisionExp)} font-bold text-slate-900 tracking-tightest leading-none tabular-nums whitespace-nowrap`}>
                    ₱{provisionExp.toLocaleString()}
                </p>
            </div>

            {/* Net ROI - Wide Highlight Piece */}
            <div 
                className={`col-span-1 md:col-span-2 lg:col-span-3 p-6 sm:p-8 rounded-[32px] shadow-2xl flex flex-col justify-center gap-1 min-h-[100px] sm:min-h-[120px] relative overflow-hidden group transition-all duration-500 hover:scale-[1.01] print:bg-white print:border-slate-200 print:shadow-none ${net < 0 ? 'bg-rose-950' : 'bg-[#0F172A]'}`}
            >
                <div className={`absolute top-0 right-0 w-48 h-48 blur-3xl rounded-full no-print ${net < 0 ? 'bg-rose-500/20' : 'bg-emerald-500/10'}`}></div>
                <div className="flex justify-between items-start relative z-10">
                    <p className="text-[10px] sm:text-[12px] font-bold text-slate-400 uppercase tracking-[0.2em] print:text-slate-600">Net ROI</p>
                    <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${net < 0 ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                        {net < 0 ? 'Deficit' : 'Growth'}
                    </div>
                </div>
                <p className={`${getFontSize(Math.abs(net))} font-black tracking-tightest leading-none relative z-10 tabular-nums whitespace-nowrap print:text-slate-900 ${net < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {net < 0 ? '−' : ''}₱{Math.abs(net).toLocaleString()}
                </p>
            </div>
        </div>
    );
});
