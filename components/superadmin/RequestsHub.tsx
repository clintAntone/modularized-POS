
import React, { useState, useMemo, useRef, useCallback, useEffect, useDeferredValue, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Request, Employee, Branch, Transaction, Attendance, SalesReport } from '../../types';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { playSound } from '../../lib/audio';
import { formatManilaDate, formatManilaTime, formatPeso, getTrueISOString } from '../../lib/time';
import { BranchCheckboxDropdown } from '../shared/BranchCheckboxDropdown';

interface RequestsHubProps {
  requests: Request[];
  employees: Employee[];
  branches: Branch[];
  salesReports: SalesReport[];
  onRefresh?: () => void;
  isReadOnly?: boolean;
  reviewerName?: string;
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
  DISABLE_EMPLOYEE: {
    label: 'Disable Employee',
    color: 'bg-slate-50 text-slate-700 border-slate-200',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
      </svg>
    ),
  },
  CREATE_EMPLOYEE: {
    label: 'New Employee',
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
      </svg>
    ),
  },
  EMPLOYEE_REPORT: {
    label: 'Employee Report',
    color: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6H11.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
      </svg>
    ),
  },
  LEAVE_REQUEST: {
    label: 'Leave Request',
    color: 'bg-purple-50 text-purple-700 border-purple-200',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
};

const STATUS_STYLE = {
  PENDING:  'bg-amber-100 text-amber-800 border border-amber-200',
  APPROVED: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  REJECTED: 'bg-rose-100 text-rose-800 border border-rose-200',
};

const fmt = (n: number) => formatPeso(n || 0);

export const RequestsHub: React.FC<RequestsHubProps> = ({ requests, employees, branches, salesReports = [], onRefresh, isReadOnly, reviewerName = 'SUPERADMIN' }) => {
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const isProcessingRef = useRef(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, 'APPROVED' | 'REJECTED'>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);
  const [confirmState, setConfirmState] = useState<{ request: Request; action: 'APPROVE' | 'REJECT'; hasConflict: boolean; duplicateEmployee?: string } | null>(null);
  const [adminComment, setAdminComment] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteRevealId, setDeleteRevealId] = useState<string | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startHold = useCallback((cardId: string) => {
    holdTimerRef.current = setTimeout(() => {
      setDeleteRevealId(cardId);
    }, 600);
  }, []);

  const cancelHold = useCallback(() => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
  }, []);

  // Auto-dismiss delete button after 4s
  useEffect(() => {
    if (!deleteRevealId) return;
    const t = setTimeout(() => setDeleteRevealId(null), 4000);
    return () => clearTimeout(t);
  }, [deleteRevealId]);

  // Realtime for requests is already handled by useGlobalData's global channel —
  // no local listener needed here to avoid double full-refresh on every change.

  // Once Realtime delivers the real status, drop the optimistic override
  useEffect(() => {
    setOptimisticStatus(prev => {
      const updated = { ...prev };
      let changed = false;
      for (const id of Object.keys(updated)) {
        const real = requests.find(r => r.id === id);
        if (real && real.status === updated[id]) { delete updated[id]; changed = true; }
      }
      return changed ? updated : prev;
    });
  }, [requests]);

  // Merge optimistic overrides so the card moves tabs instantly after action
  const effectiveRequests = useMemo(() =>
    Object.keys(optimisticStatus).length === 0
      ? requests
      : requests.map(r => optimisticStatus[r.id] ? { ...r, status: optimisticStatus[r.id] } : r),
  [requests, optimisticStatus]);

  const pendingCount = useMemo(() => effectiveRequests.filter(r => r.status === 'PENDING').length, [effectiveRequests]);

  const branchScopedRequests = useMemo(() =>
    selectedBranchIds.length > 0 ? effectiveRequests.filter(r => selectedBranchIds.includes(r.branchId)) : effectiveRequests,
  [effectiveRequests, selectedBranchIds]);

  const filteredRequests = useMemo(() => {
    let list = filter === 'ALL' ? effectiveRequests : effectiveRequests.filter(r => r.status === filter);
    if (selectedBranchIds.length > 0) list = list.filter(r => selectedBranchIds.includes(r.branchId));
    if (deferredSearch.trim()) {
      const q = deferredSearch.trim().toLowerCase();
      list = list.filter(r => {
        const branch = branches.find(b => b.id === r.branchId);
        return (
          (branch?.name || '').toLowerCase().includes(q) ||
          (r.requesterName || '').toLowerCase().includes(q) ||
          (r.type || '').toLowerCase().includes(q) ||
          (r.data?.reportDate || '').includes(q) ||
          (r.data?.notes || '').toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [effectiveRequests, filter, selectedBranchIds, deferredSearch, branches]);

  const triggerConfirm = (request: Request, action: 'APPROVE' | 'REJECT') => {
    const hasConflict = action === 'APPROVE' && request.type === 'BACKFILL_REPORT'
      && !!salesReports.find(r => r.branchId === request.branchId && r.reportDate === request.data.reportDate);

    let duplicateEmployee: string | undefined;
    if (action === 'APPROVE' && request.type === 'CREATE_EMPLOYEE') {
      const reqName = (request.data?.name || '').trim().toUpperCase();
      // Check against existing active employees in the same branch
      const existingEmp = employees.find(e =>
        e.branchId === request.branchId &&
        e.isActive &&
        (e.name || '').trim().toUpperCase() === reqName
      );
      // Also check if another approved CREATE_EMPLOYEE request already created this person
      const alreadyApproved = requests.find(r =>
        r.id !== request.id &&
        r.type === 'CREATE_EMPLOYEE' &&
        r.status === 'APPROVED' &&
        r.branchId === request.branchId &&
        (r.data?.name || '').trim().toUpperCase() === reqName
      );
      if (existingEmp) duplicateEmployee = existingEmp.name;
      else if (alreadyApproved) duplicateEmployee = alreadyApproved.data?.name || reqName;
    }

    setConfirmState({ request, action, hasConflict, duplicateEmployee });
  };

  const handleAction = async (request: Request, action: 'APPROVE' | 'REJECT') => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setConfirmState(null);
    setAdminComment('');
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
          const { grossSales, totalVaultProvision, staffBreakdown, reportDate, expenseData, vaultData, vaultDeposits } = request.data;

          // Relievers go to expenseData, not totalStaffPay
          const relieverExpenses = (staffBreakdown || [])
            .filter((p: any) => p.isReliever)
            .map((p: any) => {
              const att = p.attendance || {};
              const pay = Math.max(0,
                (Number(p.commission) || 0) + (Number(p.salary) || 0) +
                (Number(p.allowance) || 0) +
                (Number(att.otPay ?? att.ot_pay) || 0) -
                (Number(att.lateDeduction ?? att.late_deduction) || 0)
              );
              const name = p.name || p.staffName || 'UNKNOWN';
              return { id: `reliever_${p.employeeId}`, branchId: request.branchId, name: `RELIEVER PAYOUT: ${name.toUpperCase()}`, amount: pay, category: 'OPERATIONAL', timestamp: `${reportDate}T12:00:00.000Z` };
            });

          const totalStaffPay = (staffBreakdown || [])
            .filter((p: any) => !p.isReliever)
            .reduce((s: number, p: any) => {
              const att = p.attendance || {};
              const otPay = Number(att.otPay ?? att.ot_pay ?? p.otPay) || 0;
              const lateDeduction = Number(att.lateDeduction ?? att.late_deduction ?? p.lateDeduction) || 0;
              const commission = (Number(p.commission) || 0) + (Number(p.salary) || 0);
              return s + commission + (Number(p.allowance) || 0) + otPay - lateDeduction;
            }, 0);

          // Merge reliever expenses with manual expenses (avoid duplicates by name)
          const existingRelieverNames = new Set(relieverExpenses.map((e: any) => e.name.toUpperCase()));
          const manualExpenses = (expenseData || []).filter((e: any) => !existingRelieverNames.has((e.name || '').toUpperCase()));
          const finalExpenseData = [...relieverExpenses, ...manualExpenses];
          const totalExpenses = finalExpenseData.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);

          const netRoi = grossSales - totalExpenses - totalVaultProvision - totalStaffPay;
          const dateCompact = reportDate.replace(/-/g, '');
          const standardId = `${request.branchId}_${dateCompact}`;
          const backfillId = `${request.branchId}_${dateCompact}_BACKFILL_INCOMPLETE`;
          // Use the backfill ID if a _BACKFILL_INCOMPLETE record already exists, otherwise standard
          const existingBackfill = salesReports.find(r => r.id === backfillId);
          const reportId = existingBackfill ? backfillId : standardId;
          const existingReport = salesReports.find(r => r.branchId === request.branchId && r.reportDate === reportDate);

          // session_data is intentionally omitted — backfills adjust totals only and should not
          // overwrite (or clear) the original POS transaction log stored in that column
          // Run sales_report upsert and vault_transactions chain in parallel — they touch different tables
          const [{ error }] = await Promise.all([
            supabase.from(DB_TABLES.SALES_REPORTS).upsert({
              [DB_COLUMNS.ID]: reportId,
              [DB_COLUMNS.BRANCH_ID]: request.branchId,
              [DB_COLUMNS.REPORT_DATE]: reportDate,
              [DB_COLUMNS.SUBMITTED_AT]: getTrueISOString(),
              [DB_COLUMNS.GROSS_SALES]: grossSales,
              [DB_COLUMNS.TOTAL_STAFF_PAY]: totalStaffPay,
              [DB_COLUMNS.TOTAL_EXPENSES]: totalExpenses,
              [DB_COLUMNS.TOTAL_VAULT_PROVISION]: totalVaultProvision,
              [DB_COLUMNS.NET_ROI]: netRoi,
              [DB_COLUMNS.STAFF_BREAKDOWN]: staffBreakdown,
              [DB_COLUMNS.EXPENSE_DATA]: finalExpenseData,
              [DB_COLUMNS.VAULT_DATA]: vaultData || existingReport?.vaultData || [],
              [DB_COLUMNS.BACKFILLED]: true,
            }),
            // Sync vault deposits — fetch existing, delete old, insert new, update balance
            (async () => {
              const { data: existingTx } = await supabase
                .from(DB_TABLES.VAULT_TRANSACTIONS)
                .select(`${DB_COLUMNS.ID},${DB_COLUMNS.AMOUNT}`)
                .eq(DB_COLUMNS.REPORT_ID, reportId)
                .eq(DB_COLUMNS.TYPE, 'DEPOSIT');

              const previousTotal = (existingTx || []).reduce((s: number, t: any) => s + (Number(t[DB_COLUMNS.AMOUNT]) || 0), 0);
              const newTotal = (vaultDeposits || []).reduce((s: number, d: any) => s + (Number(d.amount) || 0), 0);

              // Delete old, then insert new (sequential — same table, same report)
              if ((existingTx || []).length > 0) {
                await supabase.from(DB_TABLES.VAULT_TRANSACTIONS).delete()
                  .eq(DB_COLUMNS.REPORT_ID, reportId).eq(DB_COLUMNS.TYPE, 'DEPOSIT');
              }
              if ((vaultDeposits || []).length > 0) {
                const txRows = vaultDeposits.map((d: any) => ({
                  [DB_COLUMNS.ID]: d.id,
                  [DB_COLUMNS.BRANCH_ID]: request.branchId,
                  [DB_COLUMNS.REPORT_ID]: reportId,
                  [DB_COLUMNS.TYPE]: 'DEPOSIT',
                  [DB_COLUMNS.AMOUNT]: d.amount,
                  [DB_COLUMNS.NAME]: d.name ?? 'VAULT DEPOSIT',
                  [DB_COLUMNS.TIMESTAMP]: d.timestamp,
                  [DB_COLUMNS.PERFORMED_BY]: null,
                }));
                const { error: txErr } = await supabase.from(DB_TABLES.VAULT_TRANSACTIONS).insert(txRows);
                if (txErr) throw txErr;
              }

              // Apply delta to vault balance
              const delta = newTotal - previousTotal;
              if (delta !== 0) {
                const { data: vaultRow } = await supabase.from(DB_TABLES.BRANCH_VAULTS)
                  .select(DB_COLUMNS.VAULT_BALANCE).eq(DB_COLUMNS.BRANCH_ID, request.branchId).single();
                if (vaultRow) {
                  await supabase.from(DB_TABLES.BRANCH_VAULTS)
                    .update({ [DB_COLUMNS.VAULT_BALANCE]: (Number(vaultRow[DB_COLUMNS.VAULT_BALANCE]) || 0) + delta })
                    .eq(DB_COLUMNS.BRANCH_ID, request.branchId);
                }
              }
            })(),
          ]);
          if (error) throw error;
        } else if (request.type === 'PASSWORD_RESET') {
          const { error } = await supabase.from(DB_TABLES.EMPLOYEES)
            .update({ [DB_COLUMNS.REQUEST_RESET]: true, [DB_COLUMNS.RESET_APPROVED]: true })
            .eq(DB_COLUMNS.ID, request.data.employeeId);
          if (error) throw error;
        } else if (request.type === 'DISABLE_EMPLOYEE') {
          const { error } = await supabase.from(DB_TABLES.EMPLOYEES)
            .update({ [DB_COLUMNS.IS_ACTIVE]: false })
            .eq(DB_COLUMNS.ID, request.data.employeeId);
          if (error) throw error;
        } else if (request.type === 'LEAVE_REQUEST') {
          const { error } = await supabase.from(DB_TABLES.EMPLOYEES)
            .update({
              [DB_COLUMNS.ON_LEAVE]: true,
              [DB_COLUMNS.LEAVE_TYPE]: request.data.leaveType,
              [DB_COLUMNS.LEAVE_START_DATE]: request.data.startDate,
              [DB_COLUMNS.LEAVE_END_DATE]: request.data.endDate || null,
            })
            .eq(DB_COLUMNS.ID, request.data.employeeId);
          if (error) throw error;
        } else if (request.type === 'EMPLOYEE_REPORT') {
          // No side effects — approval just marks the report as acknowledged
        } else if (request.type === 'CREATE_EMPLOYEE') {
          const d = request.data;
          const homeBranchId = d.branchId || request.branchId;
          const allowanceVal = Number(d.allowance) || 0;
          const { error } = await supabase.from(DB_TABLES.EMPLOYEES).insert({
            [DB_COLUMNS.ID]: Math.random().toString(36).substr(2, 9),
            [DB_COLUMNS.BRANCH_ID]: homeBranchId,
            [DB_COLUMNS.TIMESTAMP]: getTrueISOString(),
            [DB_COLUMNS.NAME]: d.name,
            [DB_COLUMNS.FIRST_NAME]: d.firstName,
            [DB_COLUMNS.MIDDLE_NAME]: d.middleName || null,
            [DB_COLUMNS.LAST_NAME]: d.lastName,
            [DB_COLUMNS.ROLE]: d.role,
            [DB_COLUMNS.ALLOWANCE]: allowanceVal,
            [DB_COLUMNS.BRANCH_ALLOWANCES]: { [homeBranchId]: { allowance: allowanceVal, role: d.role || '' } },
            [DB_COLUMNS.IS_ACTIVE]: true,
          });
          if (error) throw error;
        }
        // For BACKFILL_REPORT, snapshot the pre-approval values so the Approved tab can show Before/After
        const approvalDataPatch: Record<string, any> = {};
        if (request.type === 'BACKFILL_REPORT') {
          const preReport = salesReports.find(r => r.branchId === request.branchId && r.reportDate === request.data?.reportDate);
          if (preReport) {
            approvalDataPatch[DB_COLUMNS.DATA] = {
              ...request.data,
              previousReport: {
                grossSales: preReport.grossSales,
                totalStaffPay: preReport.totalStaffPay,
                totalExpenses: preReport.totalExpenses,
                totalVaultProvision: preReport.totalVaultProvision,
                netRoi: preReport.netRoi,
              },
            };
          }
        }
        await supabase.from(DB_TABLES.REQUESTS).update({
          [DB_COLUMNS.STATUS]: 'APPROVED',
          [DB_COLUMNS.REVIEWED_BY]: reviewerName,
          [DB_COLUMNS.UPDATED_AT]: getTrueISOString(),
          [DB_COLUMNS.REVIEW_NOTE]: adminComment.trim() || null,
          ...approvalDataPatch,
        }).eq(DB_COLUMNS.ID, request.id);
        setOptimisticStatus(prev => ({ ...prev, [request.id]: 'APPROVED' }));
        setActionSuccess('Request approved.');
        setTimeout(() => setActionSuccess(null), 1000);
        playSound('success');
      } else {
        if (request.type === 'PASSWORD_RESET') {
          await supabase.from(DB_TABLES.EMPLOYEES)
            .update({ [DB_COLUMNS.REQUEST_RESET]: false, [DB_COLUMNS.RESET_APPROVED]: false })
            .eq(DB_COLUMNS.ID, request.data.employeeId);
        }
        await supabase.from(DB_TABLES.REQUESTS).update({
          [DB_COLUMNS.STATUS]: 'REJECTED',
          [DB_COLUMNS.REVIEWED_BY]: reviewerName,
          [DB_COLUMNS.UPDATED_AT]: getTrueISOString(),
          [DB_COLUMNS.REVIEW_NOTE]: adminComment.trim() || null,
        }).eq(DB_COLUMNS.ID, request.id);
        setOptimisticStatus(prev => ({ ...prev, [request.id]: 'REJECTED' }));
        setActionSuccess('Request rejected.');
        setTimeout(() => setActionSuccess(null), 1000);
        playSound('warning');
      }
      // Force a fresh fetch so the real DB status replaces the optimistic immediately
      await queryClient.invalidateQueries({ queryKey: ['requests'] });
      // useGlobalData's Realtime channel handles targeted refreshes for requests/employees/salesReports
    } catch (err) {
      console.error(err);
      alert('Action failed. Check connection.');
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(null);
    }
  };

  const handleDeleteRequest = async () => {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);
    setIsProcessing(id);
    try {
      const { error } = await supabase.from(DB_TABLES.REQUESTS).delete().eq(DB_COLUMNS.ID, id);
      if (error) throw error;
      playSound('success');
      // Realtime DELETE event handled by useGlobalData
    } catch (err) {
      console.error(err);
      alert('Failed to delete request. Check connection.');
    } finally {
      setIsProcessing(null);
    }
  };

  const FILTERS = [
    { key: 'PENDING',  label: 'Pending',  count: branchScopedRequests.filter(r => r.status === 'PENDING').length },
    { key: 'APPROVED', label: 'Approved', count: branchScopedRequests.filter(r => r.status === 'APPROVED').length },
    { key: 'REJECTED', label: 'Rejected', count: branchScopedRequests.filter(r => r.status === 'REJECTED').length },
  ] as const;

  const confirmMeta = confirmState ? TYPE_META[confirmState.request.type] : null;
  const confirmBranch = confirmState ? branches.find(b => b.id === confirmState.request.branchId) : null;

  return (
    <div className="space-y-6">

      {/* Action success banner */}
      {actionSuccess && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 bg-slate-900 text-white text-sm font-semibold rounded-xl shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          {actionSuccess}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmState && confirmMeta && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4" onClick={() => { setConfirmState(null); setAdminComment(''); }}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl animate-in zoom-in-95 duration-200 overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header strip */}
            <div className={`px-7 pt-7 pb-5`}>
              <div className="flex items-center gap-4 mb-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${confirmMeta.color}`}>
                  {confirmMeta.icon}
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{confirmMeta.label}</p>
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
                  ) : confirmState.duplicateEmployee ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-3">
                      <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                      <div>
                        <p className="text-xs font-black text-amber-700 uppercase tracking-widest">Duplicate Employee</p>
                        <p className="text-sm text-amber-700 mt-0.5"><span className="font-black">{confirmState.duplicateEmployee}</span> already exists in this branch. Approving will create a second record.</p>
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

            {/* Admin comment */}
            <div className="px-7 pb-4">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wide block mb-1.5">
                Comment for manager <span className="text-slate-300 normal-case font-medium">(optional)</span>
              </label>
              <textarea
                rows={2}
                placeholder="Leave a note visible to the manager..."
                value={adminComment}
                onChange={e => setAdminComment(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-medium text-slate-900 placeholder:text-slate-300 focus:ring-2 focus:ring-slate-400 focus:outline-none resize-none transition-all"
              />
            </div>

            {/* Actions */}
            <div className="px-7 pb-7 flex gap-3 justify-end">
              <button
                onClick={() => { setConfirmState(null); setAdminComment(''); }}
                className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-900 transition-all"
              >
                Cancel
              </button>
              {confirmState.action === 'REJECT' ? (
                <button
                  onClick={() => handleAction(confirmState.request, 'REJECT')}
                  disabled={!!isProcessing}
                  className="px-7 py-3 bg-rose-600 text-white rounded-2xl text-xs font-semibold uppercase tracking-wide hover:bg-rose-700 transition-all active:scale-95 disabled:opacity-50"
                >
                  Reject Request
                </button>
              ) : (
                <button
                  onClick={() => handleAction(confirmState.request, 'APPROVE')}
                  disabled={!!isProcessing}
                  className="px-7 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-semibold uppercase tracking-wide hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-50"
                >
                  {confirmState.hasConflict ? 'Overwrite & Approve' : confirmState.duplicateEmployee ? 'Approve Anyway' : 'Approve Request'}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl animate-in zoom-in-95 duration-200 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-8 text-center space-y-5">
              <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter">Delete Request?</h3>
                <p className="text-xs font-bold text-slate-500 leading-relaxed">This will permanently remove the request. This action cannot be undone.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="py-4 rounded-2xl text-xs font-semibold uppercase tracking-wide text-slate-400 hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteRequest}
                  disabled={!!isProcessing}
                  className="py-4 rounded-2xl text-xs font-semibold uppercase tracking-wide bg-rose-600 text-white hover:bg-rose-700 shadow-lg shadow-rose-100 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Header */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg sm:text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none">
            Approval Workflows
          </h2>
          <p className="text-xs sm:text-xs font-medium text-slate-500 mt-1">
            Manage pending backfill and security requests
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2.5">
          {/* Search */}
          <div className="relative sm:flex-1">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search branch, date, type…"
              className="w-full h-11 pl-9 pr-3 text-xs rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-slate-400 dark:focus:border-slate-500 focus:ring-2 focus:ring-slate-100 dark:focus:ring-slate-700 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            )}
          </div>

          {/* Branch filter — full width on mobile */}
          <BranchCheckboxDropdown
            branches={branches}
            selectedIds={selectedBranchIds}
            onChange={ids => startTransition(() => setSelectedBranchIds(ids))}
            className="sm:w-48"
          />

          {/* Filter tabs — evenly distributed on mobile so nothing overflows */}
          <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-100 gap-0.5">
            {FILTERS.map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => startTransition(() => setFilter(key))}
                className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-xs font-semibold uppercase tracking-wide transition-all whitespace-nowrap ${
                  filter === key ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {label}
                {count > 0 && (
                  <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs font-black leading-none ${
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
      </div>

      {/* Cards */}
      <div className="space-y-4">
        {filteredRequests.length === 0 ? (
          <div className="bg-white rounded-2xl p-20 text-center border border-dashed border-slate-200">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-sm font-black text-slate-300 uppercase tracking-wider">No requests in this queue</p>
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
            const hasDuplicateEmployee = request.type === 'CREATE_EMPLOYEE' && request.status === 'PENDING' && (() => {
              const reqName = (request.data?.name || '').trim().toUpperCase();
              return employees.some(e => e.branchId === request.branchId && e.isActive && (e.name || '').trim().toUpperCase() === reqName) ||
                requests.some(r => r.id !== request.id && r.type === 'CREATE_EMPLOYEE' && r.status === 'APPROVED' && r.branchId === request.branchId && (r.data?.name || '').trim().toUpperCase() === reqName);
            })();
            const targetDate: string | null = request.type.startsWith('BACKFILL')
              ? (request.data.reportDate || request.data.date || null)
              : null;
            const formattedTargetDate = targetDate
              ? new Date(targetDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
              : null;

            return (
              <div
                key={request.id}
                className={`group bg-white rounded-2xl shadow-sm border overflow-hidden transition-shadow hover:shadow-md select-none ${
                  hasConflict ? 'border-rose-200' :
                  hasDuplicateEmployee ? 'border-amber-200' :
                  request.status === 'PENDING' ? 'border-amber-100' :
                  request.status === 'APPROVED' ? 'border-emerald-100' :
                  'border-slate-100'
                }`}
                onPointerDown={() => startHold(request.id)}
                onPointerUp={cancelHold}
                onPointerLeave={cancelHold}
                onPointerCancel={cancelHold}
              >
                {/* Card header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${meta.color}`}>
                      {meta.icon}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-black text-slate-900 uppercase tracking-tight">{meta.label}</span>
                      <p className="text-xs font-medium text-slate-400 mt-0.5 truncate">
                        {branch?.name || 'Unknown Branch'}
                      </p>
                    </div>
                  </div>
                  {!isReadOnly && (
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={() => { setDeleteRevealId(null); setDeleteConfirmId(request.id); }}
                      disabled={!!isProcessing}
                      className={`w-8 h-8 flex items-center justify-center rounded-xl bg-rose-50 text-rose-500 border border-rose-200 transition-all duration-150 disabled:opacity-50 shrink-0
                        ${deleteRevealId === request.id ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none'}
                        md:pointer-events-auto md:opacity-0 md:scale-90 md:group-hover:opacity-100 md:group-hover:scale-100
                      `}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>

                <div className="px-5 py-4 space-y-4">

                  {/* Target date — prominent for backfills */}
                  {formattedTargetDate && (
                    <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                        <svg className="w-4.5 h-4.5 w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" style={{color:'#4338ca'}}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs font-black text-indigo-400 uppercase tracking-widest">Target Date</p>
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

                  {/* Duplicate employee warning */}
                  {hasDuplicateEmployee && (
                    <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                      <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div>
                        <p className="text-sm font-black text-amber-700 uppercase tracking-tight">Duplicate Employee</p>
                        <p className="text-xs font-medium text-amber-600 mt-0.5">An employee with this name already exists in this branch.</p>
                      </div>
                    </div>
                  )}

                  {/* Detail body */}
                  {request.type === 'BACKFILL_REPORT' ? (() => {
                    // For approved requests, use the snapshot saved at approval time.
                    // For pending requests, look up the live report.
                    const snapshot = request.data?.previousReport;
                    const liveReport = !snapshot
                      ? salesReports.find(r => r.branchId === request.branchId && r.reportDate === request.data?.reportDate)
                      : null;
                    const prior = snapshot ?? liveReport;

                    const getOtPay  = (p: any) => Number(p.otPay ?? p.attendance?.otPay ?? p.attendance?.ot_pay ?? 0);
                    const getLateDed = (p: any) => Number(p.lateDeduction ?? p.attendance?.lateDeduction ?? p.attendance?.late_deduction ?? 0);
                    // Relievers are included in totalExpenses, not staffPay — matches the approval logic
                    const newStaffPay = (request.data.staffBreakdown ?? [])
                      .filter((p: any) => !p.isReliever)
                      .reduce((s: number, p: any) =>
                        s + (p.salary || 0) + (p.commission || 0) + getOtPay(p) + (p.allowance || 0) - getLateDed(p), 0);
                    const newRoi = (request.data.grossSales || 0) - (request.data.totalExpenses || 0) - (request.data.totalVaultProvision || 0) - newStaffPay;

                    const rows: { label: string; before: number | null; after: number; roiColor?: boolean }[] = [
                      { label: 'Gross Sales',  before: prior?.grossSales ?? null,         after: request.data.grossSales || 0 },
                      { label: 'Staff Pay',    before: prior?.totalStaffPay ?? null,       after: newStaffPay },
                      { label: 'Expenses',     before: prior?.totalExpenses ?? null,       after: request.data.totalExpenses || 0 },
                      { label: 'Provision',    before: prior?.totalVaultProvision ?? null, after: request.data.totalVaultProvision || 0 },
                      { label: 'Net ROI',      before: prior?.netRoi ?? null,              after: newRoi, roiColor: true },
                    ];

                    return (
                    <div className="space-y-4">
                      {/* Before / After summary */}
                      <div className="rounded-2xl overflow-hidden bg-slate-50 dark:bg-slate-800/60">
                        {/* Column headers */}
                        <div className="grid grid-cols-3 px-4 py-2 border-b border-slate-200/60 dark:border-slate-700/60">
                          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Metric</div>
                          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">
                            {prior ? 'Before' : '—'}
                          </div>
                          <div className="text-xs font-black text-emerald-500 uppercase tracking-widest text-right">After</div>
                        </div>
                        {rows.map(({ label, before, after, roiColor }) => {
                          const changed = before !== null && before !== after;
                          const delta = before !== null ? after - before : null;
                          return (
                            <div key={label} className={`grid grid-cols-3 px-4 py-3 ${changed ? 'bg-amber-50/60 dark:bg-amber-900/20' : ''}`}>
                              <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider self-center">{label}</div>
                              <div className="text-right self-center">
                                {before !== null
                                  ? <span className={`text-sm font-bold tabular-nums ${changed ? 'text-slate-400 dark:text-slate-500 line-through decoration-slate-400' : 'text-slate-600 dark:text-slate-300'}`}>{fmt(before)}</span>
                                  : <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                                }
                              </div>
                              <div className="text-right flex flex-col items-end gap-0.5 self-center">
                                {!changed && before !== null ? (
                                  <span className="text-xs text-slate-400 dark:text-slate-600">—</span>
                                ) : (
                                  <>
                                    <span className={`text-sm font-black tabular-nums ${
                                      roiColor ? (after >= 0 ? 'text-emerald-500' : 'text-rose-500') : 'text-slate-900 dark:text-slate-100'
                                    }`}>{fmt(after)}</span>
                                    {delta !== null && changed && (
                                      <span className={`text-xs font-bold tabular-nums ${delta > 0 ? 'text-emerald-500' : 'text-rose-400'}`}>
                                        {delta > 0 ? '+' : ''}{fmt(delta)}
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Staff breakdown */}
                      {request.data.staffBreakdown?.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1">Staff Payroll</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {(() => {
                              // Handles both auto-save format (nested under .attendance) and backfill format (top level)
                              const getOt   = getOtPay;
                              const getLate = getLateDed;
                              const priorStaffMap: Record<string, any> = {};
                              (prior?.staffBreakdown ?? []).forEach((p: any) => {
                                priorStaffMap[p.employeeId] = p;
                              });
                              return request.data.staffBreakdown.map((s: any) => {
                              const total = (s.salary || 0) + (s.commission || 0) + getOt(s) + (s.allowance || 0) - getLate(s);
                              const priorEntry = priorStaffMap[s.employeeId] ?? null;
                              const priorTotal = priorEntry !== null ? (priorEntry.salary || 0) + (priorEntry.commission || 0) + getOt(priorEntry) + (priorEntry.allowance || 0) - getLate(priorEntry) : null;
                              const delta = priorTotal !== null ? total - priorTotal : null;
                              const hasChange = delta !== null && delta !== 0;
                              const fieldDeltas = priorEntry ? [
                                { k: 'Com',   d: (s.commission || 0) - (priorEntry.commission || 0) },
                                { k: 'Allow', d: (s.allowance || 0) - (priorEntry.allowance || 0) },
                                { k: 'OT',    d: getOt(s) - getOt(priorEntry) },
                                { k: 'Late',  d: -(getLate(s) - getLate(priorEntry)) },
                                { k: 'Base',  d: (s.salary || 0) - (priorEntry.salary || 0) },
                              ].filter(x => x.d !== 0) : [];
                              return (
                                <div key={s.employeeId} className={`flex justify-between items-center p-3 rounded-xl gap-3 border ${hasChange ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-transparent' : s.isHalfDay ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-transparent' : 'bg-slate-50 border-slate-100 dark:bg-slate-700/50 dark:border-transparent'}`}>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase truncate">{s.name}</p>
                                      {s.isHalfDay && (
                                        <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 bg-amber-500 text-white rounded-md text-xs font-semibold uppercase tracking-wide">
                                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20V2z" fill="currentColor" stroke="none"/></svg>
                                          ½ Day
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {[
                                        { k: 'Base', v: s.salary || 0 },
                                        { k: 'Com', v: s.commission || 0 },
                                        { k: 'OT', v: getOt(s) },
                                        { k: 'Allow', v: s.allowance || 0 },
                                      ].filter(x => x.v > 0).map(x => (
                                        <span key={x.k} className="px-1.5 py-0.5 bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-100 rounded text-xs font-bold">
                                          {x.k} ₱{x.v.toLocaleString()}
                                        </span>
                                      ))}
                                      {getLate(s) > 0 && (
                                        <span className="px-1.5 py-0.5 bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 rounded text-xs font-bold">
                                          −Late ₱{getLate(s).toLocaleString()}
                                        </span>
                                      )}
                                    </div>
                                    {fieldDeltas.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1.5">
                                        {fieldDeltas.map(x => (
                                          <span key={x.k} className={`px-1.5 py-0.5 rounded text-xs font-black ${x.d > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300'}`}>
                                            {x.k} {x.d > 0 ? '+' : ''}₱{Math.abs(x.d).toLocaleString()}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-end shrink-0 gap-0.5">
                                    <span className="text-sm font-black text-slate-900 dark:text-slate-100 tabular-nums">{fmt(total)}</span>
                                    {hasChange && (
                                      <span className={`text-xs font-black tabular-nums ${delta! > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                        {delta! > 0 ? '+' : ''}{fmt(delta!)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            });
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Manager notes */}
                      {request.data.notes && (
                        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                          <p className="text-xs font-black text-amber-600 uppercase tracking-widest mb-1">Manager's Justification</p>
                          <p className="text-sm text-slate-700 font-medium italic leading-relaxed">"{request.data.notes}"</p>
                        </div>
                      )}
                    </div>
                    );
                  })() : request.type === 'PASSWORD_RESET' ? (
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Request Details</p>
                      {request.data.employeeId && (
                        <p className="text-sm font-semibold text-slate-700">Employee ID: <span className="font-black text-slate-900">{request.data.employeeId}</span></p>
                      )}
                      {request.data.reason && (
                        <p className="text-sm text-slate-600 italic">"{request.data.reason}"</p>
                      )}
                    </div>
                  ) : request.type === 'DISABLE_EMPLOYEE' ? (
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2.5">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Disable Request</p>
                      {request.data.employeeName && (
                        <p className="text-sm font-semibold text-slate-700">Employee: <span className="font-black text-slate-900">{request.data.employeeName}</span></p>
                      )}
                      {request.data.reasonType && (() => {
                        const reasonMeta: Record<string, { label: string; cls: string }> = {
                          RESIGNED:   { label: 'Resigned',   cls: 'bg-slate-200 text-slate-700' },
                          TERMINATED: { label: 'Terminated', cls: 'bg-rose-100 text-rose-700' },
                        };
                        const m = reasonMeta[request.data.reasonType];
                        return m ? (
                          <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-semibold uppercase tracking-wide ${m.cls}`}>{m.label}</span>
                        ) : null;
                      })()}
                      {request.data.reason && (
                        <p className="text-sm text-slate-600 italic">"{request.data.reason}"</p>
                      )}
                      {(() => {
                        const emp = employees.find(e => e.id === request.data.employeeId);
                        if (!emp || emp.isActive !== false) return null;
                        return (
                          <div className="flex items-center gap-2 pt-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">No Changes — Employee is already inactive</p>
                          </div>
                        );
                      })()}
                    </div>
                  ) : request.type === 'CREATE_EMPLOYEE' ? (
                    <div className="rounded-2xl border border-slate-200 overflow-hidden">
                      {/* Name — most important, shown prominently */}
                      <div className="px-4 py-4 bg-slate-50 border-b border-slate-200">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">New Employee</p>
                        <p className="text-base font-black text-slate-900 uppercase tracking-tight leading-tight">{request.data.name}</p>
                      </div>
                      {/* Detail rows */}
                      <div className="divide-y divide-slate-100">
                        <div className="flex items-center justify-between px-4 py-3">
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Role</span>
                          <span className="text-xs font-black text-indigo-700 uppercase bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">
                            {(request.data.role || '—').replace(',', ' + ')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-4 py-3">
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Daily Allowance</span>
                          <span className="text-sm font-black text-slate-900 tabular-nums">{fmt(request.data.allowance)}</span>
                        </div>
                        {(() => {
                          const reqBranch = branches.find(b => b.id === (request.data.branchId || request.branchId));
                          return reqBranch ? (
                            <div className="flex items-center justify-between px-4 py-3">
                              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Branch</span>
                              <div className="flex items-center gap-1.5">
                                <svg className="w-3.5 h-3.5 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                                <span className="text-xs font-black text-slate-700 uppercase">{reqBranch.name.replace('BRANCH - ', '')}</span>
                              </div>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  ) : request.type === 'BACKFILL_TRANSACTION' ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        {request.data.amount != null && (
                          <div className="rounded-2xl p-4 bg-slate-900 border border-slate-100">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Amount</p>
                            <p className="text-base font-black tabular-nums text-emerald-400">{fmt(request.data.amount)}</p>
                          </div>
                        )}
                        {request.data.service && (
                          <div className="rounded-2xl p-4 bg-slate-50 border border-slate-100">
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">Service</p>
                            <p className="text-sm font-black text-slate-900 uppercase truncate">{request.data.service}</p>
                          </div>
                        )}
                        {request.data.quantity != null && (
                          <div className="rounded-2xl p-4 bg-slate-50 border border-slate-100">
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">Quantity</p>
                            <p className="text-sm font-black text-slate-900">{request.data.quantity}</p>
                          </div>
                        )}
                        {request.data.discount != null && request.data.discount > 0 && (
                          <div className="rounded-2xl p-4 bg-rose-50 border border-rose-100">
                            <p className="text-xs font-black text-rose-400 uppercase tracking-widest mb-1.5">Discount</p>
                            <p className="text-sm font-black text-rose-700">{fmt(request.data.discount)}</p>
                          </div>
                        )}
                      </div>
                      {request.data.employeeId && (
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-100 rounded-xl">
                          <svg className="w-4 h-4 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                          <p className="text-xs font-black text-indigo-700 uppercase tracking-widest">
                            {employees.find(e => e.id === request.data.employeeId)?.name || request.data.employeeId}
                          </p>
                        </div>
                      )}
                      {request.data.notes && (
                        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                          <p className="text-xs font-black text-amber-600 uppercase tracking-widest mb-1">Notes</p>
                          <p className="text-sm text-slate-700 font-medium italic">"{request.data.notes}"</p>
                        </div>
                      )}
                    </div>
                  ) : request.type === 'BACKFILL_ATTENDANCE' ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        {request.data.employeeId && (
                          <div className="col-span-2 flex items-center gap-3 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-2xl">
                            <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                              <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                            </div>
                            <div>
                              <p className="text-xs font-black text-indigo-400 uppercase tracking-widest">Employee</p>
                              <p className="text-sm font-black text-indigo-900 uppercase">
                                {employees.find(e => e.id === request.data.employeeId)?.name || request.data.employeeId}
                              </p>
                            </div>
                          </div>
                        )}
                        {request.data.clockIn && (
                          <div className="rounded-2xl p-4 bg-slate-50 border border-slate-100">
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">Clock In</p>
                            <p className="text-sm font-black text-slate-900 tabular-nums">{request.data.clockIn}</p>
                          </div>
                        )}
                        {request.data.clockOut && (
                          <div className="rounded-2xl p-4 bg-slate-50 border border-slate-100">
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">Clock Out</p>
                            <p className="text-sm font-black text-slate-900 tabular-nums">{request.data.clockOut}</p>
                          </div>
                        )}
                        {request.data.isHalfDay != null && (
                          <div className={`rounded-2xl p-4 border ${request.data.isHalfDay ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
                            <p className={`text-xs font-semibold uppercase tracking-wide mb-1.5 ${request.data.isHalfDay ? 'text-amber-500' : 'text-slate-400'}`}>Day Type</p>
                            <p className={`text-sm font-black ${request.data.isHalfDay ? 'text-amber-700' : 'text-slate-900'}`}>{request.data.isHalfDay ? 'Half Day' : 'Full Day'}</p>
                          </div>
                        )}
                        {request.data.overtimeHours != null && request.data.overtimeHours > 0 && (
                          <div className="rounded-2xl p-4 bg-emerald-50 border border-emerald-100">
                            <p className="text-xs font-black text-emerald-600 uppercase tracking-widest mb-1.5">Overtime</p>
                            <p className="text-sm font-black text-emerald-900">{request.data.overtimeHours}h</p>
                          </div>
                        )}
                      </div>
                      {request.data.notes && (
                        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                          <p className="text-xs font-black text-amber-600 uppercase tracking-widest mb-1">Notes</p>
                          <p className="text-sm text-slate-700 font-medium italic">"{request.data.notes}"</p>
                        </div>
                      )}
                    </div>
                  ) : request.type === 'LEAVE_REQUEST' ? (
                    <div className={`${request.data.leaveType === 'SUSPENDED' ? 'bg-amber-50 border-amber-100' : 'bg-purple-50 border-purple-100'} border rounded-2xl p-4 space-y-3`}>
                      <p className={`text-xs font-semibold uppercase tracking-wide ${request.data.leaveType === 'SUSPENDED' ? 'text-amber-600' : 'text-purple-500'}`}>
                        {request.data.leaveType === 'SUSPENDED' ? 'On-Hold Request — Suspension' : 'On-Hold Request — Leave'}
                      </p>
                      {request.data.employeeName && (
                        <p className="text-sm font-semibold text-slate-700">Employee: <span className="font-black text-slate-900">{request.data.employeeName}</span></p>
                      )}
                      {request.data.leaveType && (() => {
                        const leaveMeta: Record<string, { label: string; cls: string }> = {
                          VACATION:  { label: 'Vacation Leave',  cls: 'bg-blue-100 text-blue-700' },
                          SICK:      { label: 'Sick Leave',      cls: 'bg-rose-100 text-rose-700' },
                          MATERNITY: { label: 'Maternity Leave', cls: 'bg-pink-100 text-pink-700' },
                          PATERNITY: { label: 'Paternity Leave', cls: 'bg-indigo-100 text-indigo-700' },
                          EMERGENCY: { label: 'Emergency Leave', cls: 'bg-amber-100 text-amber-700' },
                          SUSPENDED: { label: 'Suspended',       cls: 'bg-amber-100 text-amber-700' },
                        };
                        const m = leaveMeta[request.data.leaveType];
                        return m ? (
                          <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-semibold uppercase tracking-wide ${m.cls}`}>{m.label}</span>
                        ) : null;
                      })()}
                      <div className="grid grid-cols-2 gap-2">
                        {request.data.startDate && (
                          <div className="bg-white rounded-xl p-3 border border-purple-100">
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Start Date</p>
                            <p className="text-sm font-black text-slate-900">{request.data.startDate}</p>
                          </div>
                        )}
                        {request.data.endDate && (
                          <div className="bg-white rounded-xl p-3 border border-purple-100">
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">End Date</p>
                            <p className="text-sm font-black text-slate-900">{request.data.endDate}</p>
                          </div>
                        )}
                      </div>
                      {request.data.notes && (
                        <p className="text-sm text-slate-600 italic">"{request.data.notes}"</p>
                      )}
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Request Details</p>
                      <div className="space-y-1.5">
                        {Object.entries(request.data as Record<string, any>).map(([k, v]) => (
                          <div key={k} className="flex items-start gap-2 text-xs">
                            <span className="font-medium text-slate-400 uppercase tracking-widest shrink-0 min-w-[100px]">{k.replace(/_/g, ' ')}</span>
                            <span className="font-medium text-slate-700 break-all">{typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Action footer — pending only */}
                {request.status === 'PENDING' && !isReadOnly && (
                  <div className="flex gap-2 px-5 py-4 border-t border-slate-100" onPointerDown={e => e.stopPropagation()}>
                    <button
                      onClick={() => triggerConfirm(request, 'REJECT')}
                      disabled={!!isProcessing}
                      className="flex-1 py-2.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold uppercase tracking-wide hover:bg-rose-100 transition-all disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => triggerConfirm(request, 'APPROVE')}
                      disabled={!!isProcessing}
                      className="flex-1 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-semibold uppercase tracking-wide hover:bg-emerald-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
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
            );
          })
        )}
      </div>
    </div>
  );
};
