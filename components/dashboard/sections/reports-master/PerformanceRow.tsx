import React from 'react';
import { UI_THEME } from '../../../../constants/ui_designs';

interface PerformanceRowProps {
    label: string;
    sublabel: string;
    branchName: string;
    gross: number;
    pay: number;
    exp: number;
    vault: number;
    net: number;
    onClick: () => void;
    isMissing?: boolean;
}

export const PerformanceRow: React.FC<PerformanceRowProps> = ({
                                                                  label,
                                                                  sublabel,
                                                                  branchName,
                                                                  gross,
                                                                  pay,
                                                                  exp,
                                                                  vault,
                                                                  net,
                                                                  onClick,
                                                                  isMissing = false
                                                              }) => {
    const isPositive = net >= 0;

    if (isMissing) {
        return (
            <div
                onClick={onClick}
                className={`bg-rose-50/30 ${UI_THEME.radius.card} border border-rose-100 p-6 flex flex-col gap-4 mb-4 relative overflow-hidden cursor-pointer`}
            >
                <div className="absolute left-0 top-0 h-full w-2 bg-rose-500"></div>
                <div className="flex justify-between items-start">
                    <div className="min-w-0 pr-4">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100">MISSING DATA</span>
                        </div>
                        <span className="font-bold text-slate-900 uppercase text-lg tracking-tight block leading-none">{label}</span>
                        <p className="text-[10px] font-semibold text-rose-400 uppercase tracking-widest mt-1.5 opacity-60">No operational data submitted</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-300 text-lg">⚠️</div>
                </div>
            </div>
        );
    }

    return (
        <>
            {/* Desktop Table Row */}
            <div
                onClick={onClick}
                className="hidden md:flex group transition-all cursor-pointer border-b border-slate-100 last:border-0 items-center"
            >
                <div className="px-8 py-5 w-[18%]">
                    <div className="flex flex-col">
            <span className="font-bold text-slate-900 uppercase text-sm tracking-tight group-hover:text-emerald-700 transition-colors whitespace-nowrap">
              {label}
            </span>
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mt-1 opacity-70">
               {sublabel}
            </span>
                    </div>
                </div>
                <div className="px-6 py-5 w-[22%]">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 text-lg shadow-inner shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                            🏢
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span className="font-bold text-slate-900 uppercase text-[12px] tracking-wider leading-tight">{branchName}</span>
                            <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mt-0.5">Finalized Archive</span>
                        </div>
                    </div>
                </div>
                <div className="px-6 py-5 w-[11%] text-right font-bold text-slate-900 text-[15px] tabular-nums whitespace-nowrap">₱{gross.toLocaleString()}</div>
                <div className="px-6 py-5 w-[11%] text-right font-semibold text-amber-600 text-[15px] tabular-nums whitespace-nowrap">₱{pay.toLocaleString()}</div>
                <div className="px-6 py-5 w-[11%] text-right font-semibold text-rose-500 text-[15px] tabular-nums whitespace-nowrap">₱{exp.toLocaleString()}</div>
                <div className="px-6 py-5 w-[11%] text-right font-bold text-indigo-700 text-[15px] tabular-nums whitespace-nowrap">₱{vault.toLocaleString()}</div>
                <div className="px-8 py-5 w-[16%] text-right">
                    <div className="flex flex-col items-end">
            <span className={`font-bold tabular-nums leading-none whitespace-nowrap ${isPositive ? 'text-emerald-600' : 'text-rose-600'} ${
                net.toLocaleString().length > 9 ? 'text-sm lg:text-base' :
                net.toLocaleString().length > 7 ? 'text-base lg:text-lg' :
                'text-xl lg:text-2xl'
            }`}>
              {net < 0 ? '−' : ''}₱{Math.abs(net).toLocaleString()}
            </span>
                        <span className="text-[10px] font-bold uppercase tracking-widest mt-1.5 text-slate-300 whitespace-nowrap">Finalized ROI</span>
                    </div>
                </div>
            </div>

            {/* Mobile Card View */}
            <div
                onClick={onClick}
                className="md:hidden bg-white rounded-[24px] border border-slate-100 shadow-sm mb-3 overflow-hidden active:scale-[0.98] transition-all cursor-pointer"
            >
                {/* Top accent bar */}
                <div className={`h-1 w-full ${isPositive ? 'bg-emerald-500' : 'bg-rose-500'}`} />

                {/* Header */}
                <div className="px-4 pt-3.5 pb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1 truncate">{branchName}</p>
                        <h3 className="text-[15px] font-black text-slate-900 uppercase tracking-tight leading-tight">{label}</h3>
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 opacity-70">{sublabel}</p>
                    </div>
                    <span className={`shrink-0 px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border ${
                        isPositive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                            : 'bg-rose-50 text-rose-700 border-rose-100'
                    }`}>
                        {isPositive ? 'Growth' : 'Deficit'}
                    </span>
                </div>

                {/* Metrics strip: Gross / Salary / Expenses */}
                <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100">
                    <div className="px-3.5 py-3">
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Gross</p>
                        <p className="text-[13px] font-black text-slate-900 tabular-nums leading-tight">₱{gross.toLocaleString()}</p>
                    </div>
                    <div className="px-3.5 py-3">
                        <p className="text-[7px] font-black text-amber-500 uppercase tracking-widest mb-0.5">Salary</p>
                        <p className="text-[13px] font-black text-amber-600 tabular-nums leading-tight">₱{pay.toLocaleString()}</p>
                    </div>
                    <div className="px-3.5 py-3">
                        <p className="text-[7px] font-black text-rose-400 uppercase tracking-widest mb-0.5">Expenses</p>
                        <p className="text-[13px] font-black text-rose-500 tabular-nums leading-tight">₱{exp.toLocaleString()}</p>
                    </div>
                </div>

                {/* Footer: Vault + Net ROI */}
                <div className={`flex items-center justify-between px-4 py-3.5 ${isPositive ? 'bg-[#0F172A]' : 'bg-rose-950'}`}>
                    <div>
                        <p className="text-[7px] font-black text-indigo-300/80 uppercase tracking-widest mb-0.5">Vault Reserve</p>
                        <p className="text-[13px] font-black text-indigo-200 tabular-nums">₱{vault.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[7px] font-black uppercase tracking-widest mb-0.5 text-white/30">Net ROI</p>
                        <p className={`font-black tabular-nums leading-none ${isPositive ? 'text-emerald-400' : 'text-rose-300'} ${
                            Math.abs(net).toLocaleString().length > 9 ? 'text-base' :
                            Math.abs(net).toLocaleString().length > 7 ? 'text-lg' :
                            'text-xl'
                        }`}>
                            {net < 0 ? '−' : ''}₱{Math.abs(net).toLocaleString()}
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
};
