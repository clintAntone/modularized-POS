
import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Request, Employee, Branch, Transaction, Attendance, SalesReport } from '../../types';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { playSound } from '../../lib/audio';
import { formatManilaDate, formatManilaTime } from '../../lib/time';

interface RequestsHubProps {
  requests: Request[];
  employees: Employee[];
  branches: Branch[];
  salesReports: SalesReport[];
  onRefresh?: () => void;
  isReadOnly?: boolean;
}

const TYPE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  BACKFILL_REPORT: {
    label: 'Backfill Report',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  BACKFILL_TRANSACTION: {
    label: 'Backfill Transaction',
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    ),
  },
  BACKFILL_ATTENDANCE: {
    label: 'Backfill Attendance',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  PASSWORD_RESET: {
    label: 'Password Reset',
    color: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
      </svg>
    ),
  },
};

const STATUS_STYLE = {
  PENDING:  'bg-amber-100 text-amber-800 border border-amber-200',
  APPROVED: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  REJECTED: 'bg-rose-100 text-rose-800 border border-rose-200',
};

const fmt = (n: number) => `₱${(n || 0).toLocaleString()}`;

export const RequestsHub: React.FC<RequestsHubProps> = ({ requests, employees, branches, salesReports = [], onRefresh, isReadOnly }) => {
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [confirmState, setConfirmState] = useState<{ request: Request; action: 'APPROVE' | 'REJECT'; hasConflict: boolean } | null>(null);

  const pendingCount = useMemo(() => requests.filter(r => r.status === 'PENDING').length, [requests]);

  const filteredRequests = useMemo(() => {
    if (filter === 'ALL') return requests;
    return requests.filter(r => r.status === filter);
  }, [requests, filter]);

  const triggerConfirm = (request: Request, action: 'APPROVE' | 'REJECT') => {
    const hasConflict = action === 'APPROVE' && request.type === 'BACKFILL_REPORT'
      && !!salesReports.find(r => r.branchId === request.branchId && r.reportDate === request.data.reportDate);
    setConfirmState({ request, action, hasConflict });
  };

  const handleAction = async (request: Request, action: 'APPROVE' | 'REJECT') => {
    setConfirmState(null);
    setIsProcessing(request.id);
    try {
      if (action === 'APPROVE') {
        if (request.type === 'BACKFILL_TRANSACTION') {
          const { error } = await supabase.from(DB_TABLES.TRANSACTIONS).insert(request.data);
          if (error) throw error;
        } else if (request.type === 'BACKFILL_ATTENDANCE') {
          const { error } = await supabase.from(DB_TABLES.ATTENDANCE).insert(request.data);
          if (error) throw error;
        } else if (request.type === 'BACKFILL_REPORT') {
          const { grossSales, totalExpenses, totalVaultProvision, staffBreakdown, reportDate } = request.data;
          const totalStaffPay = staffBreakdown.reduce((s: number, p: any) =>
            s + (p.salary || 0) + (p.commission || 0) + (p.otPay || 0) + (p.allowance || 0) - (p.lateDeduction || 0), 0);
          const netRoi = grossSales - totalExpenses - totalVaultProvision - totalStaffPay;
          const reportId = `${request.branchId}_${reportDate.replace(/-/g, '')}`;
          const existingReport = salesReports.find(r => r.branchId === request.branchId && r.reportDate === reportDate);
          const { error } = await supabase.from(DB_TABLES.SALES_REPORTS).upsert({
            [DB_COLUMNS.ID]: reportId,
            [DB_COLUMNS.BRANCH_ID]: request.branchId,
            [DB_COLUMNS.REPORT_DATE]: reportDate,
            [DB_COLUMNS.SUBMITTED_AT]: new Date().toISOString(),
            [DB_COLUMNS.GROSS_SALES]: grossSales,
            [DB_COLUMNS.TOTAL_STAFF_PAY]: totalStaffPay,
            [DB_COLUMNS.TOTAL_EXPENSES]: totalExpenses,
            [DB_COLUMNS.TOTAL_VAULT_PROVISION]: totalVaultProvision,
            [DB_COLUMNS.NET_ROI]: netRoi,
            [DB_COLUMNS.STAFF_BREAKDOWN]: staffBreakdown,
            [DB_COLUMNS.SESSION_DATA]: existingReport?.sessionData || [],
            [DB_COLUMNS.EXPENSE_DATA]: existingReport?.expenseData || [],
            [DB_COLUMNS.VAULT_DATA]: existingReport?.vaultData || [],
            [DB_COLUMNS.IS_VALIDATED]: existingReport?.isValidated || false,
          });
          if (error) throw error;
        } else if (request.type === 'PASSWORD_RESET') {
          const { error } = await supabase.from(DB_TABLES.EMPLOYEES)
            .update({ [DB_COLUMNS.REQUEST_RESET]: true, [DB_COLUMNS.RESET_APPROVED]: true })
            .eq(DB_COLUMNS.ID, request.data.employeeId);
          if (error) throw error;
        }
        await supabase.from(DB_TABLES.REQUESTS).update({
          [DB_COLUMNS.STATUS]: 'APPROVED',
          [DB_COLUMNS.REVIEWED_BY]: 'SUPERADMIN',
          [DB_COLUMNS.UPDATED_AT]: new Date().toISOString(),
        }).eq(DB_COLUMNS.ID, request.id);
        playSound('success');
      } else {
        if (request.type === 'PASSWORD_RESET') {
          await supabase.from(DB_TABLES.EMPLOYEES)
            .update({ [DB_COLUMNS.REQUEST_RESET]: false, [DB_COLUMNS.RESET_APPROVED]: false })
            .eq(DB_COLUMNS.ID, request.data.employeeId);
        }
        await supabase.from(DB_TABLES.REQUESTS).update({
          [DB_COLUMNS.STATUS]: 'REJECTED',
          [DB_COLUMNS.REVIEWED_BY]: 'SUPERADMIN',
          [DB_COLUMNS.UPDATED_AT]: new Date().toISOString(),
        }).eq(DB_COLUMNS.ID, request.id);
        playSound('warning');
      }
      onRefresh?.();
    } catch (err) {
      console.error(err);
      alert('Action failed. Check connection.');
    } finally {
      setIsProcessing(null);
    }
  };

  const FILTERS = [
    { key: 'PENDING',  label: 'Pending',  count: requests.filter(r => r.status === 'PENDING').length },
    { key: 'APPROVED', label: 'Approved', count: requests.filter(r => r.status === 'APPROVED').length },
    { key: 'REJECTED', label: 'Rejected', count: requests.filter(r => r.status === 'REJECTED').length },
    { key: 'ALL',      label: 'All',      count: requests.length },
  ] as const;

  const confirmMeta = confirmState ? TYPE_META[confirmState.request.type] : null;
  const confirmBranch = confirmState ? branches.find(b => b.id === confirmState.request.branchId) : null;

  return (
    <div className="space-y-6">

      {/* Confirmation Modal */}
      {confirmState && confirmMeta && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setConfirmState(null)}>
          <div className="bg-white rounded-[32px] w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header strip */}
            <div className={`px-7 pt-7 pb-5`}>
              <div className="flex items-center gap-4 mb-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${confirmMeta.color}`}>
                  {confirmMeta.icon}
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{confirmMeta.label}</p>
                  <p className="text-base font-black text-slate-900 uppercase tracking-tight leading-tight">{confirmBranch?.name ?? confirmState.request.branchId}</p>
                </div>
              </div>

              {confirmState.action === 'APPROVE' ? (
                <div className="space-y-3">
                  {confirmState.hasConflict ? (
                    <div className="bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3 flex items-start gap-3">
                      <svg className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                      <div>
                        <p className="text-xs font-black text-rose-700 uppercase tracking-widest">Conflict Warning</p>
                        <p className="text-sm text-rose-600 mt-0.5">A report already exists for <span className="font-black">{confirmState.request.data?.reportDate}</span>. Approving will <span className="font-black">overwrite</span> it permanently.</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600">Confirm approval of this <span className="font-black text-slate-900">{confirmMeta.label}</span> request?</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-600">Confirm rejection of this <span className="font-black text-slate-900">{confirmMeta.label}</span> request? This cannot be undone.</p>
              )}
            </div>

            {/* Actions */}
            <div className="px-7 pb-7 flex gap-3 justify-end">
              <button
                onClick={() => setConfirmState(null)}
                className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-all"
              >
                Cancel
              </button>
              {confirmState.action === 'REJECT' ? (
                <button
                  onClick={() => handleAction(confirmState.request, 'REJECT')}
                  disabled={!!isProcessing}
                  className="px-7 py-3 bg-rose-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-rose-700 transition-all active:scale-95 disabled:opacity-50"
                >
                  Reject Request
                </button>
              ) : (
                <button
                  onClick={() => handleAction(confirmState.request, 'APPROVE')}
                  disabled={!!isProcessing}
                  className="px-7 py-3 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-50"
                >
                  {confirmState.hasConflict ? 'Overwrite & Approve' : 'Approve Request'}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none">
            Approval Workflows
          </h2>
          <p className="text-xs font-medium text-slate-500 mt-1">
            Manage pending backfill and security requests
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-100 gap-0.5">
          {FILTERS.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`relative px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                filter === key ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {label}
              {count > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-black leading-none ${
                  filter === key
                    ? 'bg-white/20 text-white'
                    : key === 'PENDING' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      <div className="space-y-4">
        {filteredRequests.length === 0 ? (
          <div className="bg-white rounded-[32px] p-20 text-center border border-dashed border-slate-200">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-sm font-black text-slate-300 uppercase tracking-[0.2em]">No requests in this queue</p>
          </div>
        ) : (
          filteredRequests.map(request => {
            const branch = branches.find(b => b.id === request.branchId);
            const meta = TYPE_META[request.type] || {
              label: request.type.replace(/_/g, ' '),
              color: 'bg-slate-50 text-slate-700 border-slate-200',
              icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2" /></svg>,
            };
            const hasConflict = request.type === 'BACKFILL_REPORT' &&
              salesReports.some(r => r.branchId === request.branchId && r.reportDate === request.data.reportDate);
            const targetDate: string | null = request.type.startsWith('BACKFILL')
              ? (request.data.reportDate || request.data.date || null)
              : null;
            const formattedTargetDate = targetDate
              ? new Date(targetDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
              : null;

            return (
              <div
                key={request.id}
                className={`bg-white rounded-[28px] shadow-sm border overflow-hidden transition-shadow hover:shadow-md ${
                  hasConflict ? 'border-rose-200' :
                  request.status === 'PENDING' ? 'border-amber-200' :
                  request.status === 'APPROVED' ? 'border-emerald-200' :
                  'border-slate-100'
                }`}
              >
                {/* Card top strip */}
                <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-100">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Type icon */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${meta.color}`}>
                      {meta.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black text-slate-900 uppercase tracking-tight">{meta.label}</span>
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${STATUS_STYLE[request.status as keyof typeof STATUS_STYLE] || ''}`}>
                          {request.status}
                        </span>
                        {hasConflict && (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-rose-100 text-rose-700 border border-rose-200 animate-pulse">
                            ⚠ Conflict
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-medium text-slate-500 mt-0.5 truncate">
                        {branch?.name || 'Unknown Branch'}
                      </p>
                    </div>
                  </div>

                  {/* Action buttons */}
                  {request.status === 'PENDING' && !isReadOnly && (
                    <div className="flex gap-2 shrink-0 ml-4">
                      <button
                        onClick={() => triggerConfirm(request, 'REJECT')}
                        disabled={!!isProcessing}
                        className="px-4 py-2 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-rose-100 transition-all disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => triggerConfirm(request, 'APPROVE')}
                        disabled={!!isProcessing}
                        className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow disabled:opacity-50 flex items-center gap-2"
                      >
                        {isProcessing === request.id
                          ? <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                          : <>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                              Approve
                            </>
                        }
                      </button>
                    </div>
                  )}
                </div>

                <div className="p-6 space-y-5">

                  {/* Target date — prominent for backfills */}
                  {formattedTargetDate && (
                    <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3">
                      <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                        <svg className="w-4.5 h-4.5 w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" style={{color:'#4338ca'}}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Target Date</p>
                        <p className="text-sm font-black text-indigo-900">{formattedTargetDate}</p>
                      </div>
                    </div>
                  )}

                  {/* Requester + timestamp */}
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="font-semibold text-slate-700">{request.requesterName}</span>
                    <span className="text-slate-300">·</span>
                    <span>{formatManilaDate(new Date(request.timestamp))} {formatManilaTime(new Date(request.timestamp))}</span>
                  </div>

                  {/* Conflict warning */}
                  {hasConflict && (
                    <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-200 rounded-2xl">
                      <svg className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div>
                        <p className="text-sm font-black text-rose-700 uppercase tracking-tight">Conflict Detected</p>
                        <p className="text-xs font-medium text-rose-500 mt-0.5">A report already exists for this date. Approving will overwrite it.</p>
                      </div>
                    </div>
                  )}

                  {/* Detail body */}
                  {request.type === 'BACKFILL_REPORT' ? (
                    <div className="space-y-4">
                      {/* Financial tiles */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                          { label: 'Gross Sales',   value: request.data.grossSales || 0,           dark: false },
                          { label: 'Expenses',      value: request.data.totalExpenses || 0,         dark: false },
                          { label: 'Rent / Bills',  value: request.data.totalVaultProvision || 0,   dark: false },
                          {
                            label: 'Projected ROI',
                            value: (request.data.grossSales || 0) - (request.data.totalExpenses || 0) - (request.data.totalVaultProvision || 0) -
                              (request.data.staffBreakdown?.reduce((s: number, p: any) => s + (p.salary || 0) + (p.commission || 0) + (p.otPay || 0) + (p.allowance || 0) - (p.lateDeduction || 0), 0) || 0),
                            dark: true,
                          },
                        ].map(({ label, value, dark }) => (
                          <div key={label} className={`rounded-2xl p-4 border ${dark ? 'bg-slate-900 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                            <p className={`text-[10px] font-black uppercase tracking-widest mb-1.5 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{label}</p>
                            <p className={`text-base font-black tabular-nums ${dark ? (value >= 0 ? 'text-emerald-400' : 'text-rose-400') : 'text-slate-900'}`}>
                              {fmt(value)}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Staff breakdown */}
                      {request.data.staffBreakdown?.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                            <p className="text-xs font-black text-slate-700 uppercase tracking-widest whitespace-nowrap">Staff Payroll</p>
                            <div className="h-px flex-1 bg-slate-200" />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {request.data.staffBreakdown.map((s: any) => {
                              const total = (s.salary || 0) + (s.commission || 0) + (s.otPay || 0) + (s.allowance || 0) - (s.lateDeduction || 0);
                              return (
                                <div key={s.employeeId} className={`flex justify-between items-center p-3 rounded-xl gap-3 border ${s.isHalfDay ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="text-xs font-black text-slate-900 uppercase truncate">{s.name}</p>
                                      {s.isHalfDay && (
                                        <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 bg-amber-500 text-white rounded-md text-[8px] font-black uppercase tracking-widest">
                                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20V2z" fill="currentColor" stroke="none"/></svg>
                                          ½ Day
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[10px] font-medium text-slate-400 mt-0.5">
                                      S:{s.salary} · C:{s.commission} · OT:{s.otPay} · A:{s.allowance} · L:-{s.lateDeduction}
                                    </p>
                                  </div>
                                  <span className="text-sm font-black text-slate-900 shrink-0 tabular-nums">{fmt(total)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Manager notes */}
                      {request.data.notes && (
                        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                          <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Manager's Justification</p>
                          <p className="text-sm text-slate-700 font-medium italic leading-relaxed">"{request.data.notes}"</p>
                        </div>
                      )}
                    </div>
                  ) : request.type === 'PASSWORD_RESET' ? (
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2">
                      <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Request Details</p>
                      {request.data.employeeId && (
                        <p className="text-sm font-semibold text-slate-700">Employee ID: <span className="font-black text-slate-900">{request.data.employeeId}</span></p>
                      )}
                      {request.data.reason && (
                        <p className="text-sm text-slate-600 italic">"{request.data.reason}"</p>
                      )}
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                      <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Raw Payload</p>
                      <pre className="text-xs font-mono text-slate-600 whitespace-pre-wrap overflow-x-auto">
                        {JSON.stringify(request.data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
