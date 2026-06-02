
import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { UI_THEME } from '../../../../constants/ui_designs';
import { SalesReport, Branch, BranchVault } from '../../../../types';
import { parseDate } from '@/src/utils/reportUtils';
import { PerformanceRow } from './PerformanceRow';
import { supabase } from '../../../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../../../constants/db_schema';
import { playSound } from '../../../../lib/audio';

interface ReportTableProps {
  reports: SalesReport[];
  branches: Branch[];
  branchVaults?: BranchVault[];
  viewMode: 'daily' | 'weekly' | 'monthly';
  currentBranchId: string;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: any) => void;
  onSelect: (report: SalesReport) => void;
  vaultStartDate?: string | null;
  canDelete?: boolean;
  onDeleted?: () => void;
}

export const ReportTable: React.FC<ReportTableProps> = ({ reports, branches, branchVaults = [], viewMode, currentBranchId, sortField, sortOrder, onSort, onSelect, vaultStartDate, canDelete = false, onDeleted }) => {
  const HOLD_MS = 5000;
  const TICK_MS = 30;
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [reportToDelete, setReportToDelete] = useState<SalesReport | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [refundVault, setRefundVault] = useState(true);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdFiredRef = useRef(false);

  const startHold = (report: SalesReport) => {
    if (!canDelete) return;
    holdFiredRef.current = false;
    setHoldingId(report.id);
    setHoldProgress(0);
    holdIntervalRef.current = setInterval(() => {
      setHoldProgress(prev => {
        const next = Math.min(prev + (TICK_MS / HOLD_MS) * 100, 100);
        if (next >= 100 && holdIntervalRef.current) {
          clearInterval(holdIntervalRef.current);
          holdIntervalRef.current = null;
        }
        return next;
      });
    }, TICK_MS);
  };

  const cancelHold = () => {
    if (holdIntervalRef.current) { clearInterval(holdIntervalRef.current); holdIntervalRef.current = null; }
    setHoldingId(null);
    setHoldProgress(0);
  };

  useEffect(() => {
    if (holdProgress >= 100 && holdingId && !holdFiredRef.current) {
      holdFiredRef.current = true;
      const report = reports.find(r => r.id === holdingId);
      if (report) { playSound('warning'); setReportToDelete(report); setRefundVault(true); }
      setHoldingId(null);
      setHoldProgress(0);
    }
  }, [holdProgress, holdingId, reports]);

  const getReportVaultDeposit = (report: SalesReport) => {
    const reportBranch = branches.find(b => b.id === report.branchId);
    const branchVaultEnabled = reportBranch?.vaultEnabled ?? false;
    const branchVaultStartDate = branchVaults.find(v => v.branchId === report.branchId)?.startDate ?? vaultStartDate ?? null;
    const isLegacy = !branchVaultEnabled || (branchVaultStartDate ? report.reportDate < branchVaultStartDate : false);
    return isLegacy ? 0 : Number(report.totalVaultProvision || 0);
  };

  const handleDeleteReport = async () => {
    if (!reportToDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      const vaultDeposit = getReportVaultDeposit(reportToDelete);
      if (refundVault && vaultDeposit > 0) {
        const currentVault = branchVaults.find(v => v.branchId === reportToDelete.branchId);
        const currentBalance = currentVault?.balance ?? 0;
        const { error: vaultError } = await supabase
          .from(DB_TABLES.BRANCH_VAULTS)
          .update({ [DB_COLUMNS.VAULT_BALANCE]: currentBalance - vaultDeposit })
          .eq(DB_COLUMNS.BRANCH_ID, reportToDelete.branchId);
        if (vaultError) throw vaultError;
      }
      const { error } = await supabase.from(DB_TABLES.SALES_REPORTS).delete().eq(DB_COLUMNS.ID, reportToDelete.id);
      if (error) throw error;
      playSound('success');
      setReportToDelete(null);
      onDeleted?.();
    } catch (err: any) {
      console.error('Delete report failed:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const SortIndicator = ({ field }: { field: string }) => {
    if (sortField !== field) return <div className="w-4 h-4 opacity-20 ml-2 shrink-0">↕</div>;
    return (
        <div className={`ml-2 transition-transform duration-300 ${sortOrder === 'asc' ? 'rotate-180' : ''} text-emerald-500 font-bold shrink-0`}>
          ↓
        </div>
    );
  };

  const rowData = reports.map((r) => {
    let label = r.reportDate;
    let sublabel = `TRACE: ${r.id.slice(-8).toUpperCase()}`;

    if (viewMode === 'daily') {
      const d = parseDate(r.reportDate);
      label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
    } else if (viewMode === 'weekly') {
      sublabel = "CONSOLIDATED WEEKLY CYCLE";
    } else if (viewMode === 'monthly') {
      sublabel = "MONTHLY AUDIT BATCH";
    }

    const reportDateStr = viewMode === 'daily' ? r.reportDate : ((r as any).sortDate || r.reportDate);
    const reportBranch = branches.find(b => b.id === r.branchId);
    const branchVaultEnabled = reportBranch?.vaultEnabled ?? false;
    const branchVaultStartDate = branchVaults.find(v => v.branchId === r.branchId)?.startDate ?? vaultStartDate ?? null;
    const isLegacy = !branchVaultEnabled || (branchVaultStartDate ? reportDateStr < branchVaultStartDate : false);
    const vaultProvision = Number(r.totalVaultProvision || 0);
    // Compute vault-covered portion from expense_data for reports where totalExpenses
    // was saved as the full amount (before vault withdrawal was subtracted at save time).
    const vaultCoveredFromData = (() => {
      const expData: any[] = r.expenseData || [];
      const fromRecords = expData
        .filter(e => e.category === 'VAULT_WITHDRAWAL')
        .reduce((s, e) => s + Number(e.amount || 0), 0);
      if (fromRecords > 0) return 0; // totalExpenses already excludes vault (ROI-only)
      return expData
        .filter(e => e.category === 'OPERATIONAL')
        .reduce((s, e) => s + Number(e.from_vault || 0), 0);
    })();
    // For non-legacy: show only the ROI-shouldered portion of expenses.
    // For legacy: totalExpenses stores gross operational; provision is separate.
    const pureOperational = r.totalExpenses - (isLegacy ? 0 : vaultCoveredFromData);
    const legacyProvision = isLegacy ? vaultProvision : 0;
    const vaultDeposit = isLegacy ? 0 : vaultProvision;

    return {
      r, label, sublabel, isLegacy, pureOperational, legacyProvision, vaultDeposit,
      branchName: r.branchId === 'all' ? 'NETWORK CONSOLIDATED' : (branches.find(b => b.id === r.branchId)?.name || 'BRANCH NODE'),
    };
  });

  return (
    <>
    <div className="no-print">
      {/* Mobile cards — no min-width constraint */}
      <div className="md:hidden space-y-0">
        {rowData.map(({ r, label, sublabel, isLegacy, pureOperational, legacyProvision, vaultDeposit, branchName }) => {
          const isHolding = holdingId === r.id;
          return (
            <div
              key={r.id}
              className={`relative select-none ${isHolding ? 'bg-rose-50' : ''}`}
              onPointerDown={() => startHold(r)}
              onPointerUp={cancelHold}
              onPointerLeave={cancelHold}
              onPointerCancel={cancelHold}
            >
              {isHolding && (
                <div className="absolute top-0 left-0 h-0.5 bg-rose-500 transition-none z-10" style={{ width: `${holdProgress}%` }} />
              )}
              <PerformanceRow
                branchName={branchName}
                label={label}
                sublabel={sublabel}
                gross={r.grossSales}
                pay={r.totalStaffPay}
                exp={pureOperational}
                vault={legacyProvision}
                vaultDeposit={vaultDeposit}
                isLegacy={isLegacy}
                net={r.netRoi}
                onClick={() => { if (!holdFiredRef.current) onSelect(r); }}
              />
            </div>
          );
        })}
      </div>

      {/* Desktop table — horizontally scrollable at min 1000px */}
      <div className="hidden md:block overflow-x-auto no-scrollbar">
        <div className="min-w-[1100px]">
          <div className="flex border-b border-slate-100">
            <div className="px-8 py-4 w-[15%]">
              <button onClick={() => onSort('identity')} className="flex items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">
                Registry Date <SortIndicator field="identity" />
              </button>
            </div>
            <div className="px-6 py-4 w-[17%]">
              <button onClick={() => onSort('terminal')} className="flex items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">
                Branch Node <SortIndicator field="terminal" />
              </button>
            </div>
            <div className="px-6 py-4 w-[13%]">
              <button onClick={() => onSort('yield')} className="flex items-center justify-end w-full text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">
                Gross <SortIndicator field="yield" />
              </button>
            </div>
            <div className="px-6 py-4 w-[13%]">
              <button onClick={() => onSort('payroll')} className="flex items-center justify-end w-full text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">
                Salary <SortIndicator field="payroll" />
              </button>
            </div>
            <div className="px-6 py-4 w-[13%]">
              <button onClick={() => onSort('expenses')} className="flex items-center justify-end w-full text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">
                Expenses <SortIndicator field="expenses" />
              </button>
            </div>
            <div className="px-6 py-4 w-[13%]">
              <button onClick={() => onSort('reserve')} className="flex items-center justify-end w-full text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">
                Provision <SortIndicator field="reserve" />
              </button>
            </div>
            <div className="px-8 py-4 w-[16%]">
              <button onClick={() => onSort('roi')} className="flex items-center justify-end w-full text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">
                NET ROI <SortIndicator field="roi" />
              </button>
            </div>
          </div>

          {rowData.map(({ r, label, sublabel, isLegacy, pureOperational, legacyProvision, vaultDeposit, branchName }) => {
            const isHolding = holdingId === r.id;
            return (
              <div
                key={r.id}
                className={`relative select-none ${isHolding ? 'bg-rose-50' : ''}`}
                onPointerDown={() => startHold(r)}
                onPointerUp={cancelHold}
                onPointerLeave={cancelHold}
                onPointerCancel={cancelHold}
              >
                {isHolding && (
                  <div className="absolute top-0 left-0 h-0.5 bg-rose-500 transition-none z-10" style={{ width: `${holdProgress}%` }} />
                )}
                <PerformanceRow
                  branchName={branchName}
                  label={label}
                  sublabel={sublabel}
                  gross={r.grossSales}
                  pay={r.totalStaffPay}
                  exp={pureOperational}
                  vault={legacyProvision}
                  vaultDeposit={vaultDeposit}
                  isLegacy={isLegacy}
                  net={r.netRoi}
                  onClick={() => { if (!holdFiredRef.current) onSelect(r); }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>

    {/* Delete Confirmation Modal */}
    {reportToDelete && ReactDOM.createPortal(
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200"
        onClick={() => !isDeleting && setReportToDelete(null)}
      >
        <div
          className="w-full max-w-sm bg-white rounded-[28px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
          onClick={e => e.stopPropagation()}
        >
          <div className="bg-rose-600 px-6 pt-6 pb-5 text-white">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-[15px] font-black uppercase tracking-tight">Delete Sales Report?</h3>
            <p className="text-[9px] font-bold text-white/70 uppercase tracking-widest mt-1">This action cannot be undone</p>
          </div>

          <div className="px-6 py-5 space-y-3">
            {/* Identity */}
            <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Branch</span>
                <span className="text-[11px] font-black text-slate-800 uppercase truncate max-w-[160px]">
                  {branches.find(b => b.id === reportToDelete.branchId)?.name ?? reportToDelete.branchId}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Date</span>
                <span className="text-[11px] font-black text-slate-800">
                  {new Date(reportToDelete.reportDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Trace ID</span>
                <span className="text-[10px] font-black text-slate-500 font-mono">{reportToDelete.id.slice(-8).toUpperCase()}</span>
              </div>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-50 rounded-xl p-3 space-y-0.5">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Gross Sales</p>
                <p className="text-[13px] font-black text-slate-800 tabular-nums">₱{reportToDelete.grossSales.toLocaleString()}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 space-y-0.5">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Staff Pay</p>
                <p className="text-[13px] font-black text-slate-800 tabular-nums">₱{reportToDelete.totalStaffPay.toLocaleString()}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 space-y-0.5">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Expenses</p>
                <p className="text-[13px] font-black text-slate-800 tabular-nums">₱{reportToDelete.totalExpenses.toLocaleString()}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 space-y-0.5">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Vault Reserve</p>
                <p className="text-[13px] font-black text-slate-800 tabular-nums">₱{(reportToDelete.totalVaultProvision || 0).toLocaleString()}</p>
              </div>
            </div>

            {/* Net ROI — full width highlight */}
            <div className={`rounded-xl p-3 flex justify-between items-center ${reportToDelete.netRoi >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
              <p className={`text-[9px] font-black uppercase tracking-widest ${reportToDelete.netRoi >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>Net ROI</p>
              <p className={`text-[16px] font-black tabular-nums ${reportToDelete.netRoi >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {reportToDelete.netRoi < 0 ? '−' : ''}₱{Math.abs(reportToDelete.netRoi).toLocaleString()}
              </p>
            </div>

            {/* Vault refund option */}
            {(() => {
              const vaultDeposit = getReportVaultDeposit(reportToDelete);
              if (vaultDeposit <= 0) return null;
              return (
                <button
                  type="button"
                  onClick={() => setRefundVault(v => !v)}
                  className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${refundVault ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200'}`}
                >
                  <div className="text-left">
                    <p className={`text-[10px] font-black uppercase tracking-widest ${refundVault ? 'text-indigo-700' : 'text-slate-500'}`}>
                      Refund Vault Deposit
                    </p>
                    <p className={`text-[8px] font-bold uppercase tracking-widest mt-0.5 ${refundVault ? 'text-indigo-400' : 'text-slate-400'}`}>
                      Deduct ₱{vaultDeposit.toLocaleString()} from vault balance
                    </p>
                  </div>
                  <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${refundVault ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                    {refundVault && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })()}

            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center">
              Report record will be permanently removed. Expenses logged that day remain intact.
            </p>
          </div>

          <div className="px-6 pb-6 grid grid-cols-2 gap-3">
            <button
              onClick={() => setReportToDelete(null)}
              disabled={isDeleting}
              className="h-12 bg-white border-2 border-slate-200 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteReport}
              disabled={isDeleting}
              className="h-12 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all disabled:opacity-40 hover:bg-rose-700 shadow-lg"
            >
              {isDeleting ? 'Deleting…' : 'Delete Report'}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  );
};
