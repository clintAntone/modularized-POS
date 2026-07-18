import React, { useState } from 'react';
import { TrendingUp, TrendingDown, Minus, Users, Landmark } from 'lucide-react';

interface SalesKPIStripProps {
    gross: number;
    operationalExp: number;
    vaultDeposit?: number;
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
  '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const SalesKPIStrip: React.FC<SalesKPIStripProps> = React.memo(({
  gross, operationalExp, vaultDeposit = 0,
  vaultCoveredExp = 0, vaultBalance = 0, vaultTarget = 0,
  rentAndBillsTotal = 0, finalStaffPayTotal, net,
  totalAllowances, otAdditions, lateDeductions, totalCashAdvances,
  cashTotal = 0, gcashTotal = 0,
  isLegacy = false
}) => {
  const [showPayrollDetail, setShowPayrollDetail] = useState(false);
  const netPayableCash = finalStaffPayTotal - totalCashAdvances;
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
        <TrendingUp className="w-5 h-5 text-emerald-500 shrink-0 opacity-70" strokeWidth={2} />
      </div>

      {/* ── Row 2: Expenses + Staff (2-col) — legacy adds Rent & Bills as third col ── */}
      <div className={`grid gap-2.5 ${isLegacy ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {/* Expenses */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 print:shadow-none">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-slate-400">Expenses</p>
            <Minus className="w-4 h-4 text-rose-400 opacity-70 shrink-0" strokeWidth={2.5} />
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
              <Landmark className="w-4 h-4 text-indigo-400 opacity-70 shrink-0" strokeWidth={2} />
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
            <Users className="w-4 h-4 text-amber-400 opacity-70 shrink-0" strokeWidth={2} />
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

      {/* ── Vault Deposit ── */}
      {!isLegacy && vaultDeposit > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center justify-between print:shadow-none">
          <div>
            <p className="text-xs font-semibold text-slate-400 mb-1">Vault Deposit</p>
            <p className="text-2xl font-black text-slate-900 tabular-nums leading-none">{fmt(vaultDeposit)}</p>
            {vaultTarget > 0 ? (
              <p className="text-xs text-indigo-500 font-medium mt-1.5">
                {/* Use whichever is higher — DB balance may lag briefly after a fresh deposit */}
                {(() => {
                  const displayBalance = Math.max(vaultBalance, vaultDeposit);
                  return (
                    <>
                      Fund total {fmt(displayBalance)}
                      {displayBalance < vaultTarget && (
                        <span className="text-slate-400"> · {fmt(vaultTarget - displayBalance)} to go</span>
                      )}
                    </>
                  );
                })()}
              </p>
            ) : (
              <p className="text-xs text-indigo-500 font-medium mt-1.5">Saved to vault fund</p>
            )}
          </div>
          <Landmark className="w-5 h-5 text-indigo-400 shrink-0 opacity-70" strokeWidth={2} />
        </div>
      )}

      {/* ── Net ROI (full width, dark card) ── */}
      <div className={`rounded-2xl p-5 flex items-center justify-between relative overflow-hidden print:bg-white print:border print:border-slate-200 print:shadow-none ${isNegative ? 'bg-slate-900 border border-rose-900/40' : 'bg-slate-900 border border-slate-700'}`}>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-semibold text-slate-400">Net ROI</p>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isNegative ? 'bg-rose-500/10 text-rose-500/70' : isPositive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
              {isNegative ? 'Deficit' : isPositive ? 'Growth' : 'Balanced'}
            </span>
          </div>
          <p className={`text-4xl font-black tabular-nums leading-none print:text-slate-900 ${isNegative ? 'text-rose-400/70' : isPositive ? 'text-emerald-400' : 'text-slate-400'}`}>
            {isNegative ? '−' : ''}{fmt(Math.abs(net))}
          </p>
        </div>
        {isNegative
          ? <TrendingDown className="w-6 h-6 text-rose-400 shrink-0 opacity-60" strokeWidth={1.5} />
          : <TrendingUp className="w-6 h-6 text-emerald-400 shrink-0 opacity-60" strokeWidth={1.5} />
        }
      </div>


    </div>
  );
});
