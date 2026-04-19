import React, { useState, useMemo, useEffect } from 'react';
import { Branch, SalesReport } from '../../types';
import { playSound } from '../../lib/audio';
import { getWeekRange, parseDate } from '../../src/utils/reportUtils';
import { getTrueDate } from '../../lib/time';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, CheckCircle, Circle, ChevronDown, CalendarDays, Paperclip, XCircle, Send } from 'lucide-react';
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
        if (data) setSubmissions(data.map(r => ({
          id: r.id, branchId: r.branch_id, periodLabel: r.period_label,
          status: r.status, reviewNote: r.review_note, submittedAt: r.submitted_at
        })));
      });
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

  const allGroupedReports = useMemo(() => {
    const groups: Record<string, { label: string; weekEnd: Date; branchAggregates: Record<string, any> }> = {};
    const now = getTrueDate();

    salesReports.forEach(report => {
      const branch = branches.find(b => b.id === report.branchId);
      if (!branch) return;
      const date = parseDate(report.reportDate);
      const { label, weekStart, weekEnd } = getWeekRange(date, branch);
      if (weekEnd > now) return;
      const key = weekStart.getTime().toString();

      if (!groups[key]) groups[key] = { label, weekEnd, branchAggregates: {} };

      if (!groups[key].branchAggregates[report.branchId]) {
        groups[key].branchAggregates[report.branchId] = {
          branchId: report.branchId, branchName: branch.name, owners: branch.owners || [],
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
        const row: any = {
          'Period': group.label, 'Branch': report.branchName,
          'Gross Sales': report.grossSales, 'Salary': report.totalStaffPay,
          'Expenses': report.totalExpenses, 'Vault': report.totalVaultProvision,
          'Net ROI': report.netRoi, 'Adjustments': totalAdj, 'Adjusted ROI': adjustedRoi,
          'Validated': report.isValidated ? 'YES' : 'NO'
        };
        report.owners.forEach((o: any) => { row[`${o.name} (${o.percentage}%)`] = adjustedRoi * (o.percentage / 100); });
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
              <div className="space-y-4">
                {group.reports.map((report: any) => {
                  const rowAdj = adjustments.filter(a => a.branchId === report.branchId && a.periodLabel === group.label);
                  const totalAdj = rowAdj.reduce((s, a) => s + a.amount, 0);
                  const adjustedRoi = report.netRoi + totalAdj;
                  const hasAdj = rowAdj.length > 0;
                  const formKey = `${report.branchId}::${group.label}`;
                  const isLoading = loadingBranchIds.has(report.branchId);

                  return (
                    <div key={report.branchId} className="bg-white rounded-[28px] border border-slate-100 shadow-sm overflow-hidden">

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
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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

                        {/* Owner distribution */}
                        {report.owners.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Owner Cut</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {report.owners.map((owner: any, oIdx: number) => {
                                const share = adjustedRoi * (owner.percentage / 100);
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
                                  {fmt(report.owners.reduce((s: number, o: any) => s + adjustedRoi * (o.percentage / 100), 0))}
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

                        {/* Adjustments — read-only, click row to view receipt */}
                        {rowAdj.length > 0 && (
                          <>
                            <div className="h-px bg-slate-100" />
                            <div className="space-y-1.5">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Adjustments</p>
                              {rowAdj.map(adj => (
                                <div
                                  key={adj.id}
                                  onClick={() => adj.receiptImage && window.open(adj.receiptImage, '_blank')}
                                  className={`flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 gap-4 ${adj.receiptImage ? 'cursor-pointer hover:bg-slate-100 transition-colors active:scale-[0.99]' : ''}`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${adj.amount >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                                    <span className="text-[10px] font-bold text-slate-700 uppercase tracking-tight truncate">{adj.description}</span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {adj.receiptImage
                                      ? <Paperclip className="w-3 h-3 text-slate-400" />
                                      : <span className="text-[8px] font-bold text-rose-400 uppercase tracking-widest">No receipt</span>
                                    }
                                    <span className={`text-[11px] font-black tabular-nums ${adj.amount < 0 ? 'text-rose-500' : 'text-slate-800'}`}>
                                      {adj.amount >= 0 ? '+' : ''}{fmt(adj.amount)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}

                        {/* Submission status + approve/reject */}
                        {(() => {
                          const sub = submissions.find(s => s.branchId === report.branchId && s.periodLabel === group.label);
                          const rKey = `${report.branchId}::${group.label}`;
                          if (!sub) return (
                            <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest italic pt-2">
                              Remittance not yet submitted by branch manager
                            </p>
                          );
                          return (
                            <div className="space-y-2 pt-2">
                              <div className="h-px bg-slate-100" />
                              {sub.status === 'submitted' && (
                                <>
                                  <div className="flex items-center gap-2 px-1">
                                    <Send className="w-3.5 h-3.5 text-slate-500" />
                                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Submitted — Awaiting Review</span>
                                  </div>
                                  {rejectFormKey === rKey ? (
                                    <div className="space-y-2">
                                      <input
                                        type="text"
                                        value={rejectNote}
                                        onChange={e => setRejectNote(e.target.value)}
                                        placeholder="Reason for rejection (required)"
                                        autoFocus
                                        className="w-full bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-[11px] font-bold outline-none focus:border-slate-400"
                                      />
                                      <div className="grid grid-cols-2 gap-2">
                                        <button onClick={() => { setRejectFormKey(null); setRejectNote(''); }}
                                          className="h-10 bg-white border border-slate-200 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest">
                                          Cancel
                                        </button>
                                        <button
                                          onClick={() => handleReview(sub.id, report.branchId, group.label, 'rejected', rejectNote)}
                                          disabled={isReviewing || !rejectNote.trim()}
                                          className="h-10 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-40">
                                          {isReviewing ? '…' : 'Confirm Reject'}
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-2 gap-2">
                                      <button
                                        onClick={() => { setRejectFormKey(rKey); setRejectNote(''); }}
                                        className="flex items-center justify-center gap-2 h-11 bg-slate-50 border border-slate-200 rounded-2xl text-[10px] font-black text-slate-600 uppercase tracking-widest active:scale-95 transition-all">
                                        <XCircle className="w-4 h-4" /> Reject
                                      </button>
                                      <button
                                        onClick={() => handleReview(sub.id, report.branchId, group.label, 'approved')}
                                        disabled={isReviewing}
                                        className="flex items-center justify-center gap-2 h-11 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all disabled:opacity-40">
                                        <CheckCircle className="w-4 h-4" /> Approve
                                      </button>
                                    </div>
                                  )}
                                </>
                              )}
                              {sub.status === 'approved' && (
                                <div className="flex items-center gap-2 px-1">
                                  <CheckCircle className="w-3.5 h-3.5 text-slate-600" />
                                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Approved</span>
                                </div>
                              )}
                              {sub.status === 'rejected' && (
                                <div className="flex items-start gap-2 px-1">
                                  <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                                  <div>
                                    <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest block">Rejected</span>
                                    {sub.reviewNote && <span className="text-[9px] font-bold text-slate-400">{sub.reviewNote}</span>}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}

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
