import React, { useState } from 'react';

interface SalesKPIStripProps {
    gross: number;
    operationalExp: number;
    vaultDeposit?: number;
    vaultWithdrawal?: number;
    // How much of operationalExp was vault-covered (matched by VAULT_WITHDRAWAL pairs)
    vaultCoveredExp?: number;
    // Live vault fund (current branch vault balance — for today's view)
    vaultBalance?: number;
    vaultTarget?: number;
    // Legacy provision tile (historical reports that recorded daily R&B deposits)
    rentAndBillsTotal?: number;
    finalStaffPayTotal: number;
    net: number;
    totalAllowances: number;
    otAdditions: number;
    lateDeductions: number;
    totalCashAdvances: number;
    cashTotal?: number;
    gcashTotal?: number;
    connStatus?: 'connecting' | 'connected' | 'error' | 'offline';
    pendingSyncCount?: number;
    isLegacy?: boolean;
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
                                                                 gross, operationalExp, vaultDeposit = 0, vaultWithdrawal = 0, vaultCoveredExp = 0, vaultBalance = 0, vaultTarget = 0, rentAndBillsTotal = 0, finalStaffPayTotal, net,
                                                                 totalAllowances, otAdditions, lateDeductions, totalCashAdvances,
                                                                 cashTotal = 0, gcashTotal = 0,
                                                                 connStatus = 'connected', pendingSyncCount = 0, isLegacy = false
                                                             }) => {
    const [showExpenseDetail, setShowExpenseDetail] = useState(false);
    const vaultProgress = vaultTarget > 0 ? Math.min(100, Math.round((vaultBalance / vaultTarget) * 100)) : 0;
    const isVaultFull = vaultTarget > 0 && vaultBalance >= vaultTarget;
    const netPayableCash = finalStaffPayTotal - totalCashAdvances;

    return (
        <div className="space-y-3 sm:space-y-4">
        <div className={`grid gap-3 sm:gap-4 ${vaultDeposit > 0 || isLegacy ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-3'}`}>
            {/* Gross Sales */}
            <div className={`col-span-1 md:col-span-2 bg-[#E6F9F1] p-4 sm:p-8 rounded-[32px] border border-emerald-100/50 flex flex-col justify-center gap-1 min-h-[80px] sm:min-h-[120px] relative overflow-hidden group transition-all hover:shadow-lg print:bg-white print:border-slate-200`}>
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-200/20 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-emerald-300/30 transition-colors"></div>
                <p className="text-xs sm:text-xs font-bold text-emerald-600 uppercase tracking-[0.2em] relative z-10">Gross Sales</p>
                <p className={`${getFontSize(gross)} font-black text-slate-900 tracking-tightest leading-none tabular-nums whitespace-nowrap relative z-10`}>
                    ₱{gross.toLocaleString()}
                </p>
                {(cashTotal > 0 || gcashTotal > 0) && (
                  <div className="flex gap-3 mt-2 relative z-10">
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-emerald-600/60 uppercase tracking-widest">Cash</span>
                      <span className="text-xs sm:text-sm font-bold text-slate-700 tabular-nums">₱{cashTotal.toLocaleString()}</span>
                    </div>
                    <div className="w-px h-6 bg-emerald-200/30 self-end"></div>
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-emerald-600/60 uppercase tracking-widest">GCash</span>
                      <span className="text-xs sm:text-sm font-bold text-slate-700 tabular-nums">₱{gcashTotal.toLocaleString()}</span>
                    </div>
                  </div>
                )}
            </div>

            {/* Expenses */}
            <div className="col-span-1 bg-[#FFF1F2] p-3 sm:p-6 rounded-[28px] border border-red-100/50 flex flex-col justify-center gap-1 min-h-[72px] sm:min-h-[90px] transition-all hover:shadow-md print:bg-white print:border-slate-200">
                <p className="text-xs sm:text-xs font-bold text-red-600 uppercase tracking-widest">Expenses</p>
                {/* Main number: what daily sales actually shouldered (ROI portion only) */}
                <p className={`${getFontSize(Math.max(0, operationalExp - vaultCoveredExp))} font-bold text-slate-900 tracking-tightest leading-none tabular-nums whitespace-nowrap`}>
                    ₱{Math.max(0, operationalExp - vaultCoveredExp).toLocaleString()}
                </p>
                {vaultCoveredExp > 0 && (
                  <div className="mt-1.5">
                    {/* Mobile toggle button */}
                    <button
                      onClick={() => setShowExpenseDetail(v => !v)}
                      className="sm:hidden flex items-center gap-1 text-xs font-bold text-rose-400 uppercase tracking-widest mb-1"
                    >
                      <svg className={`w-3 h-3 transition-transform ${showExpenseDetail ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                      {showExpenseDetail ? 'Hide' : 'Breakdown'}
                    </button>
                    <div className={`space-y-1 border-t border-rose-200/60 pt-1.5 ${showExpenseDetail ? 'block' : 'hidden'} sm:block`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-rose-400">ROI Expenses</span>
                        <span className="text-xs font-bold text-rose-500 tabular-nums">₱{Math.max(0, operationalExp - vaultCoveredExp).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-amber-600">+ Vault Covered</span>
                        <span className="text-xs font-bold text-amber-600 tabular-nums">₱{vaultCoveredExp.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t border-rose-200/60 pt-1 mt-0.5">
                        <span className="text-xs font-semibold text-slate-400">Total Exp</span>
                        <span className="text-xs font-bold text-slate-500 tabular-nums">₱{operationalExp.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )}
            </div>

            {/* Staff Payroll */}
            <div className="col-span-1 bg-[#FFFBEB] p-3 sm:p-6 rounded-[28px] border border-amber-100/50 flex flex-col justify-center gap-0.5 min-h-[72px] sm:min-h-[90px] transition-all hover:shadow-md print:bg-white print:border-slate-200">
                <p className="text-xs sm:text-xs font-bold text-amber-600 uppercase tracking-widest">Staff Payroll</p>
                <div className="flex flex-col gap-0.5">
                    <p className={`${getFontSize(finalStaffPayTotal)} font-bold text-slate-900 tracking-tightest leading-none tabular-nums whitespace-nowrap`}>
                        ₱{finalStaffPayTotal.toLocaleString()}
                    </p>
                    <div className="flex flex-wrap items-center gap-1 opacity-60">
                        <span className="text-xs sm:text-xs font-black text-amber-700 uppercase">
                           Net: ₱{netPayableCash.toLocaleString()}
                        </span>
                    </div>
                </div>
            </div>

            {/* Vault Deposit KPI — shown whenever a deposit exists */}
            {vaultDeposit > 0 && (
              <div className="col-span-1 md:col-span-2 bg-[#EEF2FF] p-3 sm:p-6 rounded-[28px] border border-indigo-100/50 flex flex-col justify-center gap-0.5 min-h-[72px] sm:min-h-[90px] transition-all hover:shadow-md print:bg-white print:border-slate-200">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <svg className="w-3 h-3 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 20V4m0 0l-6 6m6-6l6 6" />
                  </svg>
                  <p className="text-xs sm:text-xs font-bold text-indigo-500 uppercase tracking-widest">Vault Deposit</p>
                </div>
                <p className={`${getFontSize(vaultDeposit)} font-bold text-slate-900 tracking-tightest leading-none tabular-nums whitespace-nowrap`}>
                  ₱{vaultDeposit.toLocaleString()}
                </p>
                <p className="text-xs font-bold text-indigo-300 uppercase tracking-widest mt-0.5">Saved to vault fund</p>
              </div>
            )}

            {/* Rent & Bills — legacy only */}
            {isLegacy && (
              <div className="col-span-2 md:col-span-1 bg-[#EEF2FF] p-3 sm:p-6 rounded-[28px] border border-indigo-100/50 flex flex-col justify-center gap-0.5 min-h-[72px] sm:min-h-[90px] transition-all hover:shadow-md print:bg-white print:border-slate-200">
                <p className="text-xs sm:text-xs font-bold text-indigo-500 uppercase tracking-widest">Rent & Bills</p>
                <p className={`${getFontSize(rentAndBillsTotal)} font-bold text-slate-900 tracking-tightest leading-none tabular-nums whitespace-nowrap`}>
                  ₱{rentAndBillsTotal.toLocaleString()}
                </p>
                <p className="text-xs font-bold text-indigo-300 uppercase tracking-widest mt-0.5">Daily Provision</p>
              </div>
            )}

            {/* Net ROI */}
            <div className={`${isLegacy ? 'col-span-2 md:col-span-3' : 'col-span-2'} p-4 sm:p-8 rounded-[32px] shadow-2xl flex flex-col justify-center gap-1 min-h-[80px] sm:min-h-[120px] relative overflow-hidden group transition-all duration-500 hover:scale-[1.01] print:bg-white print:border-slate-200 print:shadow-none ${net < 0 ? 'bg-rose-950' : 'bg-[#0F172A]'}`}>
                <div className={`absolute top-0 right-0 w-48 h-48 blur-3xl rounded-full no-print ${net < 0 ? 'bg-rose-500/20' : 'bg-emerald-500/10'}`}></div>
                <div className="flex justify-between items-start relative z-10">
                    <p className="text-xs sm:text-xs font-bold text-slate-400 uppercase tracking-[0.2em] print:text-slate-600">Net ROI</p>
                    <div className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest ${net < 0 ? 'bg-rose-500/20 text-rose-400' : net === 0 ? 'bg-slate-500/20 text-slate-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                        {net < 0 ? 'Deficit' : net === 0 ? 'Balanced' : 'Growth'}
                    </div>
                </div>
                <p className={`${getFontSize(Math.abs(net))} font-black tracking-tightest leading-none relative z-10 tabular-nums whitespace-nowrap print:text-slate-900 ${net < 0 ? 'text-rose-400' : net === 0 ? 'text-slate-400' : 'text-emerald-400'}`}>
                    {net < 0 ? '−' : ''}₱{Math.abs(net).toLocaleString()}
                </p>
            </div>
        </div>

        {/* ── Vault Fund — non-legacy only, separate from P&L computation ── */}
        {!isLegacy && (
          vaultTarget > 0 && (
            <div className={`rounded-[24px] border px-5 sm:px-6 py-4 flex items-center justify-between gap-4 print:bg-white print:border-slate-200 ${isVaultFull ? 'bg-[#ECFDF5] border-emerald-200/60' : 'bg-white border-slate-200'}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isVaultFull ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                  <svg className={`w-4 h-4 ${isVaultFull ? 'text-emerald-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-xs sm:text-xs font-black uppercase tracking-widest leading-none ${isVaultFull ? 'text-emerald-600' : 'text-slate-500'}`}>Vault Fund</p>
                    <span className={`text-xs font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${isVaultFull ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {isVaultFull ? '✓ Full' : `${vaultProgress}%`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="w-24 sm:w-32 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${isVaultFull ? 'bg-emerald-500' : 'bg-indigo-400'}`} style={{ width: `${vaultProgress}%` }} />
                    </div>
                    <p className={`text-xs font-bold uppercase tracking-widest tabular-nums whitespace-nowrap ${isVaultFull ? 'text-emerald-500' : 'text-slate-400'}`}>
                      {isVaultFull ? 'Target reached' : `₱${(vaultTarget - vaultBalance).toLocaleString()} to go`}
                    </p>
                  </div>
                  {(vaultWithdrawal ?? 0) > 0 && (
                    <p className="text-xs font-bold text-rose-500 uppercase tracking-widest tabular-nums mt-0.5">
                      −₱{(vaultWithdrawal ?? 0).toLocaleString()} used today
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className={`${getFontSize(vaultBalance)} font-black tabular-nums whitespace-nowrap ${isVaultFull ? 'text-emerald-700' : 'text-slate-900'}`}>
                  ₱{vaultBalance.toLocaleString()}
                </p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">Savings Balance</p>
              </div>
            </div>
          )
        )}

        </div>
    );
});
