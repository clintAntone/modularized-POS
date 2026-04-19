import React, { useState, useMemo, useEffect } from 'react';
import { Branch, SalesReport } from '../../types';
import { playSound } from '../../lib/audio';
import { getWeekRange, parseDate } from '../../src/utils/reportUtils';
import { getTrueDate } from '../../lib/time';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, CheckCircle, Circle, ChevronDown, CalendarDays, Paperclip, XCircle, Send, Plus, Minus, Trash2 } from 'lucide-react';
import { BranchCheckboxDropdown } from '../shared/BranchCheckboxDropdown';

interface WeeklyRemittancesHubProps {
  branches: Branch[];
  salesReports: SalesReport[];
  onRefresh?: () => void;
}

interface RemittanceAdjustment {
  id: string;
  branchId: string;
  periodLabel: string;
  description: string;
  amount: number;
  receiptImage?: string | null;
  createdAt: string;
}

type SubmissionStatus = 'submitted' | 'approved' | 'rejected' | null;
interface RemittanceSubmission {
  id: string;
  branchId: string;
  periodLabel: string;
  status: SubmissionStatus;
  reviewNote?: string | null;
  submittedAt: string;
}

const fmt = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const WeeklyRemittancesHub: React.FC<WeeklyRemittancesHubProps> = ({ branches, salesReports, onRefresh }) => {
  const [selectedPeriod, setSelectedPeriod] = useState<string>('ALL');
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [optimisticValidations, setOptimisticValidations] = useState<Record<string, boolean>>({});
  const [loadingBranchIds, setLoadingBranchIds] = useState<Set<string>>(new Set());
  const [adjustments, setAdjustments] = useState<RemittanceAdjustment[]>([]);
  const [submissions, setSubmissions] = useState<RemittanceSubmission[]>([]);
  const [rejectFormKey, setRejectFormKey] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);
  const [adjFormKey, setAdjFormKey] = useState<string | null>(null);
  const [adjFormMode, setAdjFormMode] = useState<'add' | 'deduct'>('add');
  const [adjForm, setAdjForm] = useState({ description: '', amount: '' });
  const [isSavingAdj, setIsSavingAdj] = useState(false);

  const mapSubmission = (r: any): RemittanceSubmission => ({
    id: r.id, branchId: r.branch_id, periodLabel: r.period_label,
    status: r.status, reviewNote: r.review_note, submittedAt: r.submitted_at
  });

  useEffect(() => {
    supabase
      .from(DB_TABLES.REMITTANCE_ADJUSTMENTS)
      .select('*')
      .order(DB_COLUMNS.CREATED_AT, { ascending: true })
      .then(({ data }) => {
        if (data) setAdjustments(data.map(r => ({
          id: r.id, branchId: r.branch_id, periodLabel: r.period_label,
          description: r.description, amount: Number(r.amount),
          receiptImage: r.receipt_image ?? null, createdAt: r.created_at
        })));
      });

    supabase
      .from(DB_TABLES.REMITTANCE_SUBMISSIONS)
      .select('*')
      .order(DB_COLUMNS.SUBMITTED_AT, { ascending: false })
      .then(({ data }) => {
        if (data) setSubmissions(data.map(mapSubmission));
      });

    // Realtime: update submission list whenever a branch submits or a review is saved
    const channel = supabase
      .channel('remittance_submissions_superadmin')
      .on('postgres_changes', { event: '*', schema: 'public', table: DB_TABLES.REMITTANCE_SUBMISSIONS }, payload => {
        const row = payload.new as any;
        if (!row?.id) return;
        const updated = mapSubmission(row);
        setSubmissions(prev => {
          const exists = prev.some(s => s.id === updated.id);
          if (exists) return prev.map(s => s.id === updated.id ? updated : s);
          return [updated, ...prev];
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleReview = async (submissionId: string, branchId: string, periodLabel: string, status: 'approved' | 'rejected', note?: string) => {
    setIsReviewing(true);
    try {
      const { error } = await supabase
        .from(DB_TABLES.REMITTANCE_SUBMISSIONS)
        .update({ status, review_note: note || null, reviewed_at: new Date().toISOString() })
        .eq(DB_COLUMNS.ID, submissionId);
      if (error) throw error;
      setSubmissions(prev => prev.map(s =>
        s.id === submissionId ? { ...s, status, reviewNote: note || null } : s
      ));
      setRejectFormKey(null);
      setRejectNote('');
      playSound('success');
    } catch (err) {
      console.error(err);
      playSound('warning');
    } finally {
      setIsReviewing(false);
    }
  };

  const handleDeleteAdjustment = async (id: string) => {
    try {
      await supabase.from(DB_TABLES.REMITTANCE_ADJUSTMENTS).delete().eq(DB_COLUMNS.ID, id);
      setAdjustments(prev => prev.filter(a => a.id !== id));
      playSound('click');
    } catch (err) {
      console.error(err);
      playSound('warning');
    }
  };

  const handleAddAdjustment = async (branchId: string, periodLabel: string) => {
    const raw = parseFloat(adjForm.amount);
    if (!adjForm.description.trim() || isNaN(raw) || raw === 0) return;
    const amt = adjFormMode === 'deduct' ? -Math.abs(raw) : Math.abs(raw);
    setIsSavingAdj(true);
    try {
      const { data, error } = await supabase
        .from(DB_TABLES.REMITTANCE_ADJUSTMENTS)
        .insert({
          branch_id: branchId,
          period_label: periodLabel,
          description: adjForm.description.trim().toUpperCase(),
          amount: amt,
          receipt_image: null,
        })
        .select().single();
      if (error) throw error;
      setAdjustments(prev => [...prev, {
        id: data.id, branchId: data.branch_id, periodLabel: data.period_label,
        description: data.description, amount: Number(data.amount),
        receiptImage: null, createdAt: data.created_at,
      }]);
      setAdjForm({ description: '', amount: '' });
      setAdjFormKey(null);
      playSound('success');
    } catch (err) {
      console.error(err);
      playSound('warning');
    } finally {
      setIsSavingAdj(false);
    }
  };

  const allGroupedReports = useMemo(() => {
    const groups: Record<string, { label: string; weekEnd: Date; branchAggregates: Record<string, any> }> = {};
    const now = getTrueDate();
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    salesReports.forEach(report => {
      const branch = branches.find(b => b.id === report.branchId);
      if (!branch) return;
      const date = parseDate(report.reportDate);
      const { label, weekStart, weekEnd } = getWeekRange(date, branch);
      const weekEndDate = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate());
      if (weekEndDate > todayDate) return;
      const key = weekStart.getTime().toString();

      if (!groups[key]) groups[key] = { label, weekEnd, branchAggregates: {} };

      if (!groups[key].branchAggregates[report.branchId]) {
        groups[key].branchAggregates[report.branchId] = {
          branchId: report.branchId, branchName: branch.name, owners: branch.owners || [],
          groupLevy: branch.groupLevy || null,
          grossSales: 0, totalStaffPay: 0, totalExpenses: 0, totalVaultProvision: 0, netRoi: 0,
          isValidated: true, reportIds: []
        };
      }

      const agg = groups[key].branchAggregates[report.branchId];
      agg.grossSales          += report.grossSales || 0;
      agg.totalStaffPay       += report.totalStaffPay || 0;
      agg.totalExpenses       += report.totalExpenses || 0;
      agg.totalVaultProvision += report.totalVaultProvision || 0;
      agg.netRoi              += report.netRoi || 0;

      const effectiveValidated = report.id in optimisticValidations ? optimisticValidations[report.id] : report.isValidated;
      if (!effectiveValidated) agg.isValidated = false;
      agg.reportIds.push(report.id);
    });

    return Object.keys(groups)
      .sort((a, b) => Number(b) - Number(a))
      .map(key => ({
        label: groups[key].label,
        reports: Object.values(groups[key].branchAggregates)
          .sort((a: any, b: any) => a.branchName.localeCompare(b.branchName))
      }));
  }, [salesReports, branches, optimisticValidations]);

  const availablePeriods = useMemo(() =>
    Array.from(new Set(allGroupedReports.map(g => g.label))),
    [allGroupedReports]
  );

  const displayGroups = useMemo(() => {
    let groups = selectedPeriod === 'ALL' ? allGroupedReports : allGroupedReports.filter(g => g.label === selectedPeriod);
    if (selectedBranchIds.length > 0) {
      groups = groups.map(g => ({
        ...g,
        reports: g.reports.filter((r: any) => selectedBranchIds.includes(r.branchId))
      })).filter(g => g.reports.length > 0);
    }
    return groups;
  }, [allGroupedReports, selectedPeriod, selectedBranchIds]);

  const handleValidate = (branchId: string, reportIds: string[], value: boolean) => {
    if (loadingBranchIds.has(branchId)) return;
    playSound('click');
    setLoadingBranchIds(prev => new Set([...prev, branchId]));
    setOptimisticValidations(prev => {
      const next = { ...prev };
      reportIds.forEach(id => { next[id] = value; });
      return next;
    });

    supabase.from(DB_TABLES.SALES_REPORTS)
      .update({ [DB_COLUMNS.IS_VALIDATED]: value })
      .in(DB_COLUMNS.ID, reportIds)
      .then(({ error }) => {
        if (error) {
          setOptimisticValidations(prev => { const next = { ...prev }; reportIds.forEach(id => { delete next[id]; }); return next; });
          setLoadingBranchIds(prev => { const next = new Set(prev); next.delete(branchId); return next; });
          playSound('warning');
          return;
        }
        playSound('success');
        onRefresh?.();
        setTimeout(() => {
          setOptimisticValidations(prev => { const next = { ...prev }; reportIds.forEach(id => { delete next[id]; }); return next; });
          setLoadingBranchIds(prev => { const next = new Set(prev); next.delete(branchId); return next; });
        }, 1200);
      });
  };

  const handleExportExcel = () => {
    playSound('click');
    const data: any[] = [];
    displayGroups.forEach(group => {
      group.reports.forEach((report: any) => {
        const rowAdj = adjustments.filter(a => a.branchId === report.branchId && a.periodLabel === group.label);
        const totalAdj = rowAdj.reduce((s, a) => s + a.amount, 0);
        const adjustedRoi = report.netRoi + totalAdj;
        const levy = report.groupLevy as { name: string; percentage: number } | null;
        const levyCut = levy ? adjustedRoi * (levy.percentage / 100) : 0;
        const distributableRoi = adjustedRoi - levyCut;
        const row: any = {
          'Period': group.label, 'Branch': report.branchName,
          'Gross Sales': report.grossSales, 'Salary': report.totalStaffPay,
          'Expenses': report.totalExpenses, 'Vault': report.totalVaultProvision,
          'Net ROI': report.netRoi, 'Adjustments': totalAdj, 'Adjusted ROI': adjustedRoi,
          'Validated': report.isValidated ? 'YES' : 'NO'
        };
        if (levy) row[`${levy.name} (${levy.percentage}% Levy)`] = -levyCut;
        report.owners.forEach((o: any) => { row[`${o.name} (${o.percentage}%)`] = distributableRoi * (o.percentage / 100); });
        if (rowAdj.length > 0) row['Adjustment Details'] = rowAdj.map(a => `${a.description}: ${a.amount >= 0 ? '+' : ''}${a.amount}`).join(' | ');
        data.push(row);
      });
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Weekly Remittances');
    XLSX.writeFile(wb, `Weekly_Remittances_${new Date().toISOString().split('T')[0]}.xlsx`);
    playSound('success');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">

      {/* ── Header ── */}
      <div className="bg-white p-6 sm:p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-xl shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter leading-none mb-0.5">Weekly Remittances</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Owner Distributions & Validation</p>
          </div>
        </div>

        {/* Filters row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Branch filter */}
          <BranchCheckboxDropdown
            branches={branches}
            selectedIds={selectedBranchIds}
            onChange={setSelectedBranchIds}
          />

          {/* Period dropdown */}
          <div className="relative shrink-0">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <select
              value={selectedPeriod}
              onChange={e => { setSelectedPeriod(e.target.value); playSound('click'); }}
              className="appearance-none h-10 pl-9 pr-8 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-black text-slate-700 uppercase tracking-widest focus:outline-none focus:border-slate-400 cursor-pointer transition-colors w-full sm:w-auto"
            >
              <option value="ALL">All Periods</option>
              {availablePeriods.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>

          <div className="flex-1 sm:flex-none sm:ml-auto">
            <button
              onClick={handleExportExcel}
              className="flex items-center justify-center gap-2 px-5 h-10 w-full sm:w-auto bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-700 transition-all shadow active:scale-95"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Export Excel
            </button>
          </div>
        </div>
      </div>

      {/* ── Empty ── */}
      {displayGroups.length === 0 ? (
        <div className="bg-white p-20 rounded-[40px] border border-slate-100 text-center space-y-4">
          <div className="text-6xl opacity-20">📭</div>
          <p className="text-xs font-black text-slate-300 uppercase tracking-[0.2em]">No weekly reports found for remittance.</p>
        </div>
      ) : (
        <div className="space-y-14">
          {displayGroups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-4">

              {/* Period header */}
              <div className="flex items-center gap-3 px-1">
                <span className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] whitespace-nowrap">
                  {group.label}
                </span>
                <div className="h-px bg-slate-200 flex-1" />
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest shrink-0">
                  {group.reports.length} branch{group.reports.length !== 1 ? 'es' : ''}
                </span>
              </div>

              {/* Branch cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {group.reports.map((report: any) => {
                  const rowAdj = adjustments.filter(a => a.branchId === report.branchId && a.periodLabel === group.label);
                  const totalAdj = rowAdj.reduce((s, a) => s + a.amount, 0);
                  const adjustedRoi = report.netRoi + totalAdj;
                  const levy = report.groupLevy as { name: string; percentage: number } | null;
                  const levyCut = levy ? adjustedRoi * (levy.percentage / 100) : 0;
                  const distributableRoi = adjustedRoi - levyCut;
                  const hasAdj = rowAdj.length > 0;
                  const isLoading = loadingBranchIds.has(report.branchId);
                  const sub = submissions.find(s => s.branchId === report.branchId && s.periodLabel === group.label);
                  const rKey = `${report.branchId}::${group.label}`;

                  return (
                    <div key={report.branchId} className={`bg-white rounded-[28px] shadow-sm overflow-hidden border ${
                      sub?.status === 'submitted' ? 'border-amber-300' :
                      sub?.status === 'approved'  ? 'border-emerald-300' :
                      sub?.status === 'rejected'  ? 'border-rose-300' :
                      'border-slate-100'
                    }`}>

                      {/* Card header */}
                      <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-100">
                        <div>
                          <p className="font-black text-slate-900 uppercase tracking-tight text-sm leading-none">
                            {report.branchName.replace('BRANCH - ', '')}
                          </p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                            {report.reportIds.length} day{report.reportIds.length !== 1 ? 's' : ''} aggregated
                          </p>
                        </div>

                        <button
                          onClick={() => handleValidate(report.branchId, report.reportIds, !report.isValidated)}
                          disabled={isLoading}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all active:scale-95 disabled:opacity-50"
                        >
                          {isLoading ? (
                            <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                          ) : report.isValidated ? (
                            <>
                              <CheckCircle className="w-4 h-4 text-slate-600" />
                              <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Validated</span>
                            </>
                          ) : (
                            <>
                              <Circle className="w-4 h-4 text-slate-300" />
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Validate</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* ── Submission Ribbon ── */}
                      {!sub && (
                        <div className="flex items-center gap-2.5 px-6 py-2.5 bg-slate-50 border-b border-slate-100">
                          <div className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Remittance not yet submitted</span>
                        </div>
                      )}

                      {sub?.status === 'submitted' && (
                        <div className="border-b border-amber-200 bg-amber-50">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-6 py-3">
                            <div className="flex items-center gap-2.5 flex-1 min-w-0">
                              <Send className="w-4 h-4 text-amber-600 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-[11px] font-black text-amber-800 uppercase tracking-widest leading-none">Remittance Submitted</p>
                                <p className="text-[9px] font-bold text-amber-600 mt-0.5">
                                  {new Date(sub.submittedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                                </p>
                              </div>
                            </div>
                            {rejectFormKey === rKey ? (
                              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                                <input
                                  type="text"
                                  value={rejectNote}
                                  onChange={e => setRejectNote(e.target.value)}
                                  placeholder="Reason for rejection (required)"
                                  autoFocus
                                  className="flex-1 sm:w-48 bg-white border border-amber-200 px-3 py-2 rounded-xl text-[11px] font-bold outline-none focus:border-amber-400"
                                />
                                <button
                                  onClick={() => { setRejectFormKey(null); setRejectNote(''); }}
                                  className="h-9 px-4 bg-white border border-slate-200 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest shrink-0">
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleReview(sub.id, report.branchId, group.label, 'rejected', rejectNote)}
                                  disabled={isReviewing || !rejectNote.trim()}
                                  className="h-9 px-4 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-40 shrink-0">
                                  {isReviewing ? '…' : 'Confirm Reject'}
                                </button>
                              </div>
                            ) : (
                              <div className="flex gap-2 shrink-0">
                                <button
                                  onClick={() => { setRejectFormKey(rKey); setRejectNote(''); }}
                                  className="flex items-center gap-1.5 h-9 px-4 bg-white border border-rose-200 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all hover:bg-rose-50">
                                  <XCircle className="w-3.5 h-3.5" /> Reject
                                </button>
                                <button
                                  onClick={() => handleReview(sub.id, report.branchId, group.label, 'approved')}
                                  disabled={isReviewing}
                                  className="flex items-center gap-1.5 h-9 px-4 bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all disabled:opacity-40 hover:bg-amber-700">
                                  <CheckCircle className="w-3.5 h-3.5" /> Approve
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {sub?.status === 'approved' && (
                        <div className="flex items-center gap-2.5 px-6 py-2.5 bg-emerald-50 border-b border-emerald-200">
                          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Remittance Approved</span>
                        </div>
                      )}

                      {sub?.status === 'rejected' && (
                        <div className="flex items-center gap-2.5 px-6 py-2.5 bg-rose-50 border-b border-rose-200">
                          <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                          <div className="min-w-0">
                            <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Remittance Rejected</span>
                            {sub.reviewNote && <span className="text-[9px] font-bold text-rose-400 ml-2">— {sub.reviewNote}</span>}
                          </div>
                        </div>
                      )}

                      <div className="p-5 sm:p-6 space-y-5">

                        {/* Adjusted ROI — hero */}
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                            {hasAdj ? 'Adjusted ROI' : 'Net ROI'}
                          </p>
                          <p className={`text-3xl font-black tabular-nums leading-none ${adjustedRoi < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                            {fmt(adjustedRoi)}
                          </p>
                          {hasAdj && (
                            <p className="text-[10px] font-bold text-slate-400 mt-1">
                              Base {fmt(report.netRoi)}&nbsp;&nbsp;{totalAdj >= 0 ? '+' : '−'}&nbsp;{fmt(Math.abs(totalAdj))} adjustments
                            </p>
                          )}
                        </div>

                        {/* Financial breakdown */}
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { label: 'Gross Sales', value: report.grossSales, prefix: '' },
                            { label: 'Salary',      value: report.totalStaffPay, prefix: '−' },
                            { label: 'Expenses',    value: report.totalExpenses, prefix: '−' },
                            { label: 'Vault / Bills', value: report.totalVaultProvision, prefix: '−' },
                          ].map(col => (
                            <div key={col.label} className="bg-slate-50 rounded-xl px-3 py-3">
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{col.label}</p>
                              <p className="text-[12px] font-black text-slate-600 tabular-nums">{col.prefix} {fmt(col.value || 0)}</p>
                            </div>
                          ))}
                        </div>

                        {/* Group levy */}
                        {levy && (
                          <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-7 h-7 rounded-xl bg-indigo-100 flex items-center justify-center text-[10px] font-black text-indigo-600 shrink-0">🏦</div>
                              <div className="min-w-0">
                                <p className="text-[11px] font-black text-indigo-800 uppercase tracking-tight leading-none truncate">{levy.name}</p>
                                <p className="text-[9px] font-bold text-indigo-400 mt-0.5">{levy.percentage}% group levy</p>
                              </div>
                            </div>
                            <span className="text-base font-black tabular-nums shrink-0 text-indigo-700">
                              −{fmt(levyCut)}
                            </span>
                          </div>
                        )}

                        {/* Owner distribution */}
                        {report.owners.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                              Owner Cut{levy ? ` (of ${fmt(distributableRoi)} after levy)` : ''}
                            </p>
                            <div className="grid grid-cols-1 gap-2">
                              {report.owners.map((owner: any, oIdx: number) => {
                                const share = distributableRoi * (owner.percentage / 100);
                                return (
                                  <div key={oIdx} className="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className="w-7 h-7 rounded-xl bg-slate-200 flex items-center justify-center text-[10px] font-black text-slate-600 shrink-0">
                                        {owner.name.charAt(0)}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-[11px] font-black text-slate-800 uppercase tracking-tight leading-none truncate">{owner.name}</p>
                                        <p className="text-[9px] font-bold text-slate-400 mt-0.5">{owner.percentage}%</p>
                                      </div>
                                    </div>
                                    <span className={`text-base font-black tabular-nums shrink-0 ${share < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                                      {fmt(share)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                            {report.owners.length > 1 && (
                              <div className="flex items-center justify-between px-4 py-2">
                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Total Distributed</span>
                                <span className="text-[11px] font-black tabular-nums text-slate-600">
                                  {fmt(report.owners.reduce((s: number, o: any) => s + distributableRoi * (o.percentage / 100), 0))}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                        {report.owners.length === 0 && (
                          <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest italic">
                            No owners configured — add them in Branch Editor → Owner Shares
                          </p>
                        )}

                        {/* Adjustments */}
                        <div className="h-px bg-slate-100" />
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Adjustments</p>
                            {adjFormKey !== rKey && (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => { setAdjFormMode('add'); setAdjFormKey(rKey); setAdjForm({ description: '', amount: '' }); playSound('click'); }}
                                  className="flex items-center gap-1 h-7 px-2.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-[9px] font-black text-slate-600 uppercase tracking-widest transition-colors"
                                >
                                  <Plus className="w-3 h-3" /> Add
                                </button>
                                <button
                                  onClick={() => { setAdjFormMode('deduct'); setAdjFormKey(rKey); setAdjForm({ description: '', amount: '' }); playSound('click'); }}
                                  className="flex items-center gap-1 h-7 px-2.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-[9px] font-black text-slate-600 uppercase tracking-widest transition-colors"
                                >
                                  <Minus className="w-3 h-3" /> Deduct
                                </button>
                              </div>
                            )}
                          </div>

                          {rowAdj.map(adj => (
                            <div
                              key={adj.id}
                              className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 gap-4"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${adj.amount >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                                <span className="text-[10px] font-bold text-slate-700 uppercase tracking-tight truncate">{adj.description}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {adj.receiptImage && (
                                  <button onClick={() => window.open(adj.receiptImage!, '_blank')} className="text-slate-400 hover:text-slate-600 transition-colors">
                                    <Paperclip className="w-3 h-3" />
                                  </button>
                                )}
                                <span className={`text-[11px] font-black tabular-nums ${adj.amount < 0 ? 'text-rose-500' : 'text-slate-800'}`}>
                                  {adj.amount >= 0 ? '+' : ''}{fmt(adj.amount)}
                                </span>
                                <button onClick={() => handleDeleteAdjustment(adj.id)} className="text-slate-300 hover:text-rose-500 transition-colors p-0.5">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}

                          {rowAdj.length === 0 && adjFormKey !== rKey && (
                            <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest italic">No adjustments</p>
                          )}

                          {adjFormKey === rKey && (
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5">
                              <div className="flex items-center gap-2">
                                {adjFormMode === 'add' ? <Plus className="w-3.5 h-3.5 text-slate-500" /> : <Minus className="w-3.5 h-3.5 text-slate-500" />}
                                <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                                  {adjFormMode === 'add' ? 'Add to ROI' : 'Deduct from ROI'}
                                </span>
                              </div>
                              <input
                                type="text"
                                value={adjForm.description}
                                onChange={e => setAdjForm(f => ({ ...f, description: e.target.value }))}
                                placeholder={adjFormMode === 'add' ? 'Reason (e.g. Boosting)' : 'Reason (e.g. Extra Expense)'}
                                autoFocus
                                className="w-full bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase outline-none focus:border-slate-400 transition-colors"
                              />
                              <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[12px] font-black text-slate-400">₱</span>
                                <input
                                  type="number" step="0.01" min="0"
                                  value={adjForm.amount}
                                  onChange={e => setAdjForm(f => ({ ...f, amount: e.target.value }))}
                                  placeholder="0.00"
                                  className="w-full bg-white border border-slate-200 pl-8 pr-4 py-2.5 rounded-xl text-[13px] font-black outline-none focus:border-slate-400 transition-colors tabular-nums"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => { setAdjFormKey(null); setAdjForm({ description: '', amount: '' }); }}
                                  className="h-10 bg-white border border-slate-200 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleAddAdjustment(report.branchId, group.label)}
                                  disabled={isSavingAdj || !adjForm.description.trim() || !adjForm.amount}
                                  className="h-10 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                                >
                                  {isSavingAdj ? '…' : 'Save'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>


                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
