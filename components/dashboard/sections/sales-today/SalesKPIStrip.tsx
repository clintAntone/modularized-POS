import React, { useState } from 'react';

interface SalesKPIStripProps {
    gross: number;
    operationalExp: number;
    vaultDeposit?: number;
    vaultWithdrawal?: number;
    vaultCoveredExp?: number;
    vaultBalance?: number;
    vaultTarget?: number;
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

const fmt = (n: number) =>
  '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export const SalesKPIStrip: React.FC<SalesKPIStripProps> = React.memo(({
  gross, operationalExp, vaultDeposit = 0, vaultWithdrawal = 0,
  vaultCoveredExp = 0, vaultBalance = 0, vaultTarget = 0,
  rentAndBillsTotal = 0, finalStaffPayTotal, net,
  totalAllowances, otAdditions, lateDeductions, totalCashAdvances,
  cashTotal = 0, gcashTotal = 0,
  isLegacy = false
}) => {
  const [showPayrollDetail, setShowPayrollDetail] = useState(false);
  const netPayableCash = finalStaffPayTotal - totalCashAdvances;
  const vaultProgress = vaultTarget > 0 ? Math.min(100, Math.round((vaultBalance / vaultTarget) * 100)) : 0;
  const isVaultFull = vaultTarget > 0 && vaultBalance >= vaultTarget;
  const roiOnly = Math.max(0, operationalExp - vaultCoveredExp);

  const isPositive = net > 0;
  const isNegative = net < 0;

  return (
    <div className="space-y-2.5">

      {/* ── Row 1: Gross Sales (full width) ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center justify-between print:shadow-none">
        <div>
          <p className="text-xs font-semibold text-slate-400 mb-1">Gross Sales</p>
          <p className="text-3xl font-black text-slate-900 tabular-nums leading-none">{fmt(gross)}</p>
          {(cashTotal > 0 || gcashTotal > 0) && (
            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                <span className="text-xs text-slate-500">Cash <span className="font-semibold text-slate-700">{fmt(cashTotal)}</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                <span className="text-xs text-slate-500">GCash <span className="font-semibold text-slate-700">{fmt(gcashTotal)}</span></span>
              </div>
            </div>
          )}
        </div>
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
      </div>

      {/* ── Row 2: Expenses + Staff (2-col) — legacy adds Rent & Bills as third col ── */}
      <div className={`grid gap-2.5 ${isLegacy ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {/* Expenses */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 print:shadow-none">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-slate-400">Expenses</p>
            <span className="w-6 h-6 rounded-xl bg-rose-50 flex items-center justify-center">
              <svg className="w-3 h-3 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
              </svg>
            </span>
          </div>
          <p className="text-2xl font-black text-slate-900 tabular-nums leading-none">{fmt(roiOnly)}</p>
          {vaultCoveredExp > 0 && (
            <p className="text-xs text-amber-600 font-medium mt-1.5">+{fmt(vaultCoveredExp)} vault</p>
          )}
        </div>

        {/* Rent & Bills (legacy only) */}
        {isLegacy && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 print:shadow-none">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-slate-400">Rent & Bills</p>
              <span className="w-6 h-6 rounded-xl bg-indigo-50 flex items-center justify-center">
                <svg className="w-3 h-3 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0 0l-6-6m6 6l6-6" />
                </svg>
              </span>
            </div>
            <p className="text-2xl font-black text-slate-900 tabular-nums leading-none">{fmt(rentAndBillsTotal)}</p>
            <p className="text-xs text-indigo-500 font-medium mt-1.5">Daily provision</p>
          </div>
        )}

        {/* Staff Payroll */}
        <button
          onClick={() => setShowPayrollDetail(v => !v)}
          className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left w-full transition-colors active:bg-slate-50 print:shadow-none"
        >
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-slate-400">Staff Pay</p>
            <span className="w-6 h-6 rounded-xl bg-amber-50 flex items-center justify-center">
              <svg className="w-3 h-3 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
              </svg>
            </span>
          </div>
          <p className="text-2xl font-black text-slate-900 tabular-nums leading-none">{fmt(finalStaffPayTotal)}</p>
          <p className="text-xs text-slate-400 font-medium mt-1.5">Net {fmt(netPayableCash)}</p>
          {showPayrollDetail && (
            <div className="mt-2.5 pt-2.5 border-t border-slate-100 space-y-1.5 text-left">
              {totalAllowances > 0 && <div className="flex justify-between text-xs"><span className="text-slate-400">Allowances</span><span className="font-semibold text-slate-700">{fmt(totalAllowances)}</span></div>}
              {otAdditions > 0 && <div className="flex justify-between text-xs"><span className="text-slate-400">Overtime</span><span className="font-semibold text-emerald-600">+{fmt(otAdditions)}</span></div>}
              {lateDeductions > 0 && <div className="flex justify-between text-xs"><span className="text-slate-400">Late deductions</span><span className="font-semibold text-rose-500">−{fmt(lateDeductions)}</span></div>}
              {totalCashAdvances > 0 && <div className="flex justify-between text-xs"><span className="text-slate-400">Cash advance</span><span className="font-semibold text-rose-500">−{fmt(totalCashAdvances)}</span></div>}
            </div>
          )}
        </button>
      </div>

      {/* ── Vault Deposit — only in historical/report context (no live vault target) ── */}
      {!isLegacy && vaultDeposit > 0 && !vaultTarget && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center justify-between print:shadow-none">
          <div>
            <p className="text-xs font-semibold text-slate-400 mb-1">Vault Deposit</p>
            <p className="text-2xl font-black text-slate-900 tabular-nums leading-none">{fmt(vaultDeposit)}</p>
            <p className="text-xs text-indigo-500 font-medium mt-1.5">Saved to vault fund</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0 0l-6-6m6 6l6-6" />
            </svg>
          </div>
        </div>
      )}

      {/* ── Net ROI (full width, dark card) ── */}
      <div className={`rounded-2xl p-5 flex items-center justify-between relative overflow-hidden print:bg-white print:border print:border-slate-200 print:shadow-none ${isNegative ? 'bg-rose-950' : 'bg-slate-900'}`}>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-semibold text-slate-400">Net ROI</p>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isNegative ? 'bg-rose-500/20 text-rose-400' : isPositive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
              {isNegative ? 'Deficit' : isPositive ? 'Growth' : 'Balanced'}
            </span>
          </div>
          <p className={`text-4xl font-black tabular-nums leading-none print:text-slate-900 ${isNegative ? 'text-rose-400' : isPositive ? 'text-emerald-400' : 'text-slate-400'}`}>
            {isNegative ? '−' : ''}{fmt(Math.abs(net))}
          </p>
        </div>
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${isNegative ? 'bg-rose-500/10' : 'bg-emerald-500/10'}`}>
          <svg className={`w-6 h-6 ${isNegative ? 'text-rose-500' : 'text-emerald-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
            {isNegative
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.51l-5.511-3.181" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.286 4.286a11.948 11.948 0 010-6.43l.776-2.897m0 0l3.182 5.51m-3.182-5.51l-5.511 3.181" />
            }
          </svg>
        </div>
      </div>

      {/* ── Vault Fund balance (with today's deposit inline) ── */}
      {!isLegacy && vaultTarget > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3.5 print:shadow-none">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <span className="text-xs font-semibold text-slate-500">Vault Fund</span>
              {isVaultFull && <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Full</span>}
            </div>
            <div className="text-right">
              <span className="text-lg font-black text-slate-900 tabular-nums">
                {fmt(vaultDeposit > 0 ? vaultBalance + vaultDeposit : vaultBalance)}
              </span>
              <p className="text-xs font-semibold">
                {vaultDeposit > 0
                  ? <span className="text-indigo-500">incl. {fmt(vaultDeposit)} today</span>
                  : <span className="text-slate-400">no deposit yet</span>}
              </p>
            </div>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${isVaultFull ? 'bg-emerald-500' : 'bg-indigo-400'}`}
              style={{ width: `${vaultProgress}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-xs text-slate-400">{vaultProgress}% of target</span>
            <div className="flex items-center gap-3">
              {vaultWithdrawal > 0 && (
                <span className="text-xs text-rose-500 font-medium">−{fmt(vaultWithdrawal)} used</span>
              )}
              {!isVaultFull && (
                <span className="text-xs text-slate-400">{fmt(vaultTarget - vaultBalance)} to go</span>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
});
