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
    vaultDeposit?: number;
    net: number;
    onClick: () => void;
    isMissing?: boolean;
    isLegacy?: boolean;
}

export const PerformanceRow: React.FC<PerformanceRowProps> = ({
    label, sublabel, branchName, gross, pay, exp, vault,
    vaultDeposit = 0, net, onClick, isMissing = false, isLegacy = false,
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

    // The vault column shows: legacy provision OR non-legacy vault deposit
    const vaultColValue = isLegacy ? vault : vaultDeposit;
    const vaultColLabel = isLegacy ? 'rent & bills' : 'vault deposit';

    return (
        <>
            {/* ── Desktop Table Row ── */}
            <div
                onClick={onClick}
                className={`hidden md:flex group transition-all cursor-pointer border-b border-slate-100 last:border-0 items-center ${isLegacy ? 'bg-slate-50/60' : 'bg-white'}`}
            >
                <div className="px-8 py-5 w-[18%]">
                    <div className="flex flex-col">
                        <span className="font-bold text-slate-900 uppercase text-sm tracking-tight group-hover:text-emerald-700 transition-colors whitespace-nowrap">{label}</span>
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mt-1 opacity-70">{sublabel}</span>
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
                <div className="px-6 py-5 w-[11%] text-right">
                    <div className="flex flex-col items-end gap-0.5">
                        <span className="font-semibold text-indigo-600 text-[15px] tabular-nums whitespace-nowrap">
                            ₱{vaultColValue.toLocaleString()}
                        </span>
                        {vaultColValue > 0 && (
                            <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest whitespace-nowrap">
                                {vaultColLabel}
                            </span>
                        )}
                    </div>
                </div>
                <div className="px-8 py-5 w-[16%] text-right">
                    <div className="flex flex-col items-end">
                        <span className={`font-bold tabular-nums leading-none whitespace-nowrap ${isPositive ? 'text-emerald-600' : 'text-rose-600'} ${
                            net.toLocaleString().length > 9 ? 'text-sm lg:text-base' :
                            net.toLocaleString().length > 7 ? 'text-base lg:text-lg' :
                            'text-xl lg:text-2xl'
                        }`}>{net < 0 ? '−' : ''}₱{Math.abs(net).toLocaleString()}</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest mt-1.5 text-slate-300 whitespace-nowrap">Finalized ROI</span>
                    </div>
                </div>
            </div>

            {/* ── Mobile Card View ── */}
            <div
                onClick={onClick}
                className={`md:hidden rounded-[20px] border shadow-sm mb-3 overflow-hidden active:scale-[0.98] transition-all cursor-pointer ${isLegacy ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200'}`}
            >
                {/* Top accent bar */}
                <div className={`h-1 w-full ${isPositive ? 'bg-emerald-500' : 'bg-rose-500'}`} />

                {/* Header */}
                <div className="px-4 pt-3 pb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1 truncate">{branchName}</p>
                        <h3 className="text-[16px] font-black text-slate-900 uppercase tracking-tight leading-snug">{label}</h3>
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{sublabel}</p>
                    </div>
                    <span className={`shrink-0 mt-0.5 px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border ${
                        isPositive
                            ? 'bg-white text-emerald-600 border-emerald-200'
                            : 'bg-rose-50 text-rose-600 border-rose-200'
                    }`}>
                        {isPositive ? 'Growth' : 'Deficit'}
                    </span>
                </div>

                {/* 3-column metrics */}
                <div className="grid grid-cols-3 border-t border-slate-100">
                    <div className="px-3 py-3">
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Gross</p>
                        <p className="text-[13px] font-black text-slate-900 tabular-nums leading-none">₱{gross.toLocaleString()}</p>
                    </div>
                    <div className="px-3 py-3 border-x border-slate-100">
                        <p className="text-[7px] font-black text-amber-500 uppercase tracking-widest mb-1">Salary</p>
                        <p className="text-[13px] font-black text-amber-500 tabular-nums leading-none">₱{pay.toLocaleString()}</p>
                    </div>
                    <div className="px-3 py-3">
                        <p className="text-[7px] font-black text-rose-500 uppercase tracking-widest mb-1">Expenses</p>
                        <p className="text-[13px] font-black text-rose-500 tabular-nums leading-none">₱{exp.toLocaleString()}</p>
                    </div>
                </div>

                {/* Dark footer: Vault column + Net ROI */}
                <div className="flex items-center justify-between px-4 py-3.5 bg-slate-900">
                    <div>
                        <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-0.5">
                            {isLegacy ? 'Rent & Bills' : 'Vault Deposit'}
                        </p>
                        <p className="text-[13px] font-black text-indigo-400 tabular-nums">₱{vaultColValue.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Net ROI</p>
                        <p className={`font-black tabular-nums leading-none ${isPositive ? 'text-emerald-400' : 'text-rose-400'} ${
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
