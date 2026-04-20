import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Branch, SalesReport } from '../../../types';
import { playSound } from '../../../lib/audio';
import { getWeekRange, parseDate } from '../../../src/utils/reportUtils';
import { getTrueDate } from '../../../lib/time';
import { supabase } from '../../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, CheckCircle, Clock, Plus, Minus, Trash2, XCircle, ChevronDown } from 'lucide-react';

type SubmissionStatus = 'submitted' | 'validated' | 'approved' | 'rejected' | null;

interface RemittanceSubmission {
  id: string;
  status: SubmissionStatus;
  reviewNote?: string | null;
  submittedAt: string;
}

interface RemittanceAdjustment {
  id: string;
  branchId: string;
  periodLabel: string;
  description: string;
  amount: number;
  targetOwner?: string | null;
  createdAt: string;
}

interface RemittanceSectionProps {
  branch: Branch;
  salesReports: SalesReport[];
}

const fmt = (n: number) =>
  `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const RemittanceSection: React.FC<RemittanceSectionProps> = ({ branch, salesReports }) => {
  const [adjustments, setAdjustments] = useState<RemittanceAdjustment[]>([]);
  const [adjFormKey, setAdjFormKey] = useState<string | null>(null);
  const [adjFormMode, setAdjFormMode] = useState<'add' | 'deduct'>('add');
  const [adjForm, setAdjForm] = useState({ description: '', amount: '' });
  const [isSavingAdj, setIsSavingAdj] = useState(false);
  const [adjError, setAdjError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<RemittanceSubmission | null>(null);
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string | null>(null);
  const [periodDropdownOpen, setPeriodDropdownOpen] = useState(false);
  const periodDropdownRef = useRef<HTMLDivElement>(null);

  const now = getTrueDate();

  useEffect(() => {
    supabase
      .from(DB_TABLES.REMITTANCE_ADJUSTMENTS)
      .select('*')
      .eq(DB_COLUMNS.BRANCH_ID, branch.id)
      .order(DB_COLUMNS.CREATED_AT, { ascending: true })
      .then(({ data }) => {
        if (data) setAdjustments(data.map(r => ({
          id: r.id, branchId: r.branch_id, periodLabel: r.period_label,
          description: r.description, amount: Number(r.amount),
          targetOwner: r.target_owner || null,
          createdAt: r.created_at,
        })));
      });
  }, [branch.id]);

  const fetchSubmission = async (periodLabel: string) => {
    const { data } = await supabase
      .from(DB_TABLES.REMITTANCE_SUBMISSIONS)
      .select('*')
      .eq(DB_COLUMNS.BRANCH_ID, branch.id)
      .eq(DB_COLUMNS.PERIOD_LABEL, periodLabel)
      .maybeSingle();
    if (data) {
      setSubmission({ id: data.id, status: data.status, reviewNote: data.review_note, submittedAt: data.submitted_at });
    } else {
      setSubmission(null);
    }
  };

  const handleAddAdjustment = async (periodLabel: string) => {
    const raw = parseFloat(adjForm.amount);
    if (!adjForm.description.trim() || isNaN(raw) || raw === 0) return;
    const amt = adjFormMode === 'deduct' ? -Math.abs(raw) : Math.abs(raw);
    setIsSavingAdj(true);
    setAdjError(null);
    try {
      const { data, error } = await supabase
        .from(DB_TABLES.REMITTANCE_ADJUSTMENTS)
        .insert({
          branch_id: branch.id,
          period_label: periodLabel,
          description: adjForm.description.trim().toUpperCase(),
          amount: amt,
          target_owner: null,
        })
        .select().single();
      if (error) throw error;
      setAdjustments(prev => [...prev, {
        id: data.id, branchId: data.branch_id, periodLabel: data.period_label,
        description: data.description, amount: Number(data.amount),
        targetOwner: null,
        createdAt: data.created_at,
      }]);
      setAdjForm({ description: '', amount: '' });
      setAdjFormKey(null);
      playSound('success');
    } catch (err: any) {
      console.error('[Remittance] Failed to save adjustment:', err);
      setAdjError(err?.message || 'Failed to save. Please try again.');
      playSound('warning');
    } finally {
      setIsSavingAdj(false);
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

  // All completed periods sorted most-recent first
  const allGroups = useMemo(() => {
    const groups: Record<string, { label: string; weekEnd: Date; aggregate: any }> = {};
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    salesReports
      .filter(r => r.branchId === branch.id)
      .forEach(report => {
        const date = parseDate(report.reportDate);
        const { label, weekStart, weekEnd } = getWeekRange(date, branch);
        const weekEndDate = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate());
        if (weekEndDate > todayDate) return;
        const key = weekStart.getTime().toString();

        if (!groups[key]) {
          groups[key] = {
            label,
            weekEnd,
            aggregate: {
              grossSales: 0, totalStaffPay: 0, totalExpenses: 0,
              totalVaultProvision: 0, netRoi: 0, isValidated: true, reportCount: 0,
            },
          };
        }
        const agg = groups[key].aggregate;
        agg.grossSales          += report.grossSales || 0;
        agg.totalStaffPay       += report.totalStaffPay || 0;
        agg.totalExpenses       += report.totalExpenses || 0;
        agg.totalVaultProvision += report.totalVaultProvision || 0;
        agg.netRoi              += report.netRoi || 0;
        agg.reportCount         += 1;
        if (!report.isValidated) agg.isValidated = false;
      });

    return Object.keys(groups)
      .sort((a, b) => Number(b) - Number(a))
      .map(key => ({ key, label: groups[key].label, aggregate: groups[key].aggregate }));
  }, [salesReports, branch.id]);

  // Default to latest period; keep selection in sync when data loads
  const currentGroup = useMemo(() => {
    if (allGroups.length === 0) return null;
    const match = selectedPeriodKey ? allGroups.find(g => g.key === selectedPeriodKey) : null;
    return match ?? allGroups[0];
  }, [allGroups, selectedPeriodKey]);

  const currentPeriodIndex = useMemo(
    () => allGroups.findIndex(g => g.key === currentGroup?.key),
    [allGroups, currentGroup]
  );

  useEffect(() => {
    if (currentGroup) fetchSubmission(currentGroup.label);
  }, [currentGroup?.label, branch.id]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (periodDropdownRef.current && !periodDropdownRef.current.contains(e.target as Node)) {
        setPeriodDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Realtime: reflect approval/rejection immediately without page refresh
  useEffect(() => {
    const channel = supabase
      .channel(`remittance_submission_branch_${branch.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: DB_TABLES.REMITTANCE_SUBMISSIONS,
        filter: `branch_id=eq.${branch.id}`
      }, payload => {
        const row = payload.new as any;
        if (!row?.id) return;
        setSubmission({ id: row.id, status: row.status, reviewNote: row.review_note, submittedAt: row.submitted_at });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [branch.id]);

  const handleExportExcel = () => {
    if (!currentGroup) return;
    playSound('click');
    const owners: any[] = branch.owners || [];
    const agg = currentGroup.aggregate;
    const rowAdj = adjustments.filter(a => a.periodLabel === currentGroup.label);
    const totalAdj = rowAdj.reduce((s, a) => s + a.amount, 0);
    const adjustedRoi = agg.netRoi + totalAdj;
    const row: any = {
      Period: currentGroup.label, Branch: branch.name,
      'Gross Sales': agg.grossSales, Salary: agg.totalStaffPay,
      Expenses: agg.totalExpenses, Vault: agg.totalVaultProvision,
      'Net ROI': agg.netRoi, Adjustments: totalAdj, 'Adjusted ROI': adjustedRoi,
      Validated: agg.isValidated ? 'YES' : 'NO',
    };
    if (levy) row[`${levy.name} (${levy.percentage}% Levy)`] = -levyCut;
    owners.forEach((o: any) => { row[`${o.name} (${o.percentage}%)`] = distributableRoi * (o.percentage / 100); });
    if (rowAdj.length > 0) row['Adjustment Details'] = rowAdj.map(a => `${a.description}: ${a.amount >= 0 ? '+' : ''}${a.amount}`).join(' | ');
    const ws = XLSX.utils.json_to_sheet([row]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Remittance');
    XLSX.writeFile(wb, `Remittance_${branch.name.replace('BRANCH - ', '')}_${currentGroup.label.replace(/\s/g, '_')}.xlsx`);
    playSound('success');
  };

  if (!currentGroup) {
    return (
      <div className="animate-in fade-in duration-700 pb-20">
        <div className="bg-white p-20 rounded-[40px] border border-slate-100 text-center space-y-4">
          <div className="text-5xl opacity-20">📭</div>
          <p className="text-xs font-black text-slate-300 uppercase tracking-[0.2em]">No weekly reports found.</p>
        </div>
      </div>
    );
  }

  const agg = currentGroup.aggregate;
  const owners: any[] = branch.owners || [];
  const levy = branch.groupLevy || null;
  const rowAdj = adjustments.filter(a => a.periodLabel === currentGroup.label);
  const globalAdj = rowAdj.filter(a => !a.targetOwner);
  const ownerAdj = rowAdj.filter(a => !!a.targetOwner);
  const totalGlobalAdj = globalAdj.reduce((s, a) => s + a.amount, 0);
  const adjustedRoi = agg.netRoi + totalGlobalAdj;
  const levyCut = levy ? adjustedRoi * (levy.percentage / 100) : 0;
  const distributableRoi = adjustedRoi - levyCut;
  const hasAdj = rowAdj.length > 0;
  const formKey = currentGroup.label;

  return (
    <div className="space-y-4 animate-in fade-in duration-700 pb-20">

      {/* Header */}
      <div className="bg-white px-6 py-5 rounded-[28px] border border-slate-100 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">
              {currentPeriodIndex === 0 ? 'Current Period' : `Period — ${currentPeriodIndex} week${currentPeriodIndex !== 1 ? 's' : ''} ago`}
            </p>
            <div className="flex items-center gap-2">
              <h3 className="text-[15px] font-black text-slate-900 uppercase tracking-tight leading-none">{currentGroup.label}</h3>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100">
                {agg.isValidated
                  ? <CheckCircle className="w-3 h-3 text-slate-500" />
                  : <Clock className="w-3 h-3 text-slate-400" />
                }
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                  {agg.isValidated ? 'Validated' : 'Pending'}
                </span>
              </div>
            </div>
            <p className="text-xs font-medium text-slate-500 mt-0.5">{agg.reportCount} day{agg.reportCount !== 1 ? 's' : ''} · {branch.name.replace('BRANCH - ', '')}</p>
          </div>
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 h-10 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-700 transition-all shadow active:scale-95 shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>

        {/* Period dropdown */}
        {allGroups.length > 1 && (
          <div ref={periodDropdownRef} className="relative pt-1 border-t border-slate-100">
            <button
              onClick={() => { setPeriodDropdownOpen(o => !o); playSound('click'); }}
              className={`h-9 w-full flex items-center justify-between gap-2 px-4 rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all outline-none ${
                periodDropdownOpen
                  ? 'bg-white border-slate-400 ring-4 ring-slate-500/10 text-slate-900'
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-600'
              }`}
            >
              <span className="truncate">{currentGroup?.label ?? 'Select Period'}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-bold text-slate-500">
                  {currentPeriodIndex === 0 ? 'Current' : `${currentPeriodIndex}w ago`}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${periodDropdownOpen ? 'rotate-180 text-slate-600' : 'text-slate-400'}`} />
              </div>
            </button>

            {periodDropdownOpen && (
              <div className="absolute z-[200] top-[calc(100%+4px)] left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 ring-1 ring-slate-900/5">
                <div className="max-h-60 overflow-y-auto overscroll-contain">
                  {allGroups.map((g, i) => {
                    const isSelected = g.key === currentGroup?.key;
                    return (
                      <button
                        key={g.key}
                        onClick={() => {
                          setSelectedPeriodKey(g.key);
                          setSubmission(null);
                          setAdjFormKey(null);
                          setPeriodDropdownOpen(false);
                          playSound('click');
                        }}
                        className={`w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50 transition-colors ${isSelected ? 'bg-slate-50' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                            isSelected ? 'bg-slate-900 border-slate-900' : 'border-slate-300'
                          }`}>
                            {isSelected && (
                              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </span>
                          <span className={`text-xs font-black uppercase tracking-widest ${isSelected ? 'text-slate-900' : 'text-slate-600'}`}>
                            {g.label}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 shrink-0">
                          {i === 0 ? 'Current' : `${i}w ago`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main card */}
      <div className="bg-white rounded-[28px] border border-slate-100 shadow-sm p-5 sm:p-6 space-y-5">

        {/* ── Hero: Adjusted ROI ── */}
        <div>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
            {hasAdj ? 'Adjusted ROI' : 'Net ROI'}
          </p>
          <p className={`text-4xl font-black tabular-nums leading-none ${adjustedRoi < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
            {fmt(adjustedRoi)}
          </p>
          {hasAdj && (
            <p className="text-xs font-medium text-slate-500 mt-1.5">
              Base {fmt(agg.netRoi)}&nbsp;&nbsp;{totalGlobalAdj >= 0 ? '+' : '−'}&nbsp;{fmt(Math.abs(totalGlobalAdj))} adj
              {ownerAdj.length > 0 && <span className="ml-1 text-[10px] text-slate-400">+ {ownerAdj.length} owner-targeted</span>}
            </p>
          )}
        </div>

        {/* ── Group levy ── */}
        {levy && (
          <div className="space-y-2">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Group Levy</p>
            <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center text-[11px] font-black text-indigo-600 shrink-0">🏦</div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-indigo-900 uppercase tracking-tight leading-none truncate">{levy.name}</p>
                  <p className="text-[10px] font-bold text-indigo-600 mt-0.5">{levy.percentage}% of adjusted ROI</p>
                </div>
              </div>
              <span className="text-[18px] font-black tabular-nums shrink-0 text-indigo-700">
                −{fmt(levyCut)}
              </span>
            </div>
          </div>
        )}

        {/* ── Owner cuts ── */}
        {owners.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Owner Cut{levy ? ` (of ${fmt(distributableRoi)} after levy)` : ''}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {owners.map((owner: any, oIdx: number) => {
                const ownerTargeted = ownerAdj.filter(a => a.targetOwner === owner.name).reduce((s, a) => s + a.amount, 0);
                const share = distributableRoi * (owner.percentage / 100) + ownerTargeted;
                return (
                  <div key={oIdx} className="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-slate-200 flex items-center justify-center text-[11px] font-black text-slate-600 shrink-0">
                        {owner.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-800 uppercase tracking-tight leading-none truncate">{owner.name}</p>
                        <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                          {owner.percentage}%
                          {ownerTargeted !== 0 && <span className="ml-1 text-[10px] text-rose-500">adj {ownerTargeted >= 0 ? '+' : ''}{fmt(ownerTargeted)}</span>}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[18px] font-black tabular-nums shrink-0 ${share < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                      {fmt(share)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-slate-100" />

        {/* ── Weekly breakdown ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Gross Sales', value: agg.grossSales, prefix: '' },
            { label: 'Salary', value: agg.totalStaffPay, prefix: '−' },
            { label: 'Expenses', value: agg.totalExpenses, prefix: '−' },
            { label: 'Vault / Bills', value: agg.totalVaultProvision, prefix: '−' },
          ].map(col => (
            <div key={col.label} className="bg-slate-50 rounded-xl px-3 py-3">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{col.label}</p>
              <p className="text-sm font-black text-slate-700 tabular-nums">{col.prefix} {fmt(col.value || 0)}</p>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="h-px bg-slate-100" />

        {/* ── Add / Deduct buttons — available on any period not yet remitted ── */}
        {adjFormKey !== formKey && submission?.status !== 'approved' && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { playSound('click'); setAdjFormMode('add'); setAdjFormKey(formKey); setAdjForm({ description: '', amount: '' }); }}
              className="flex items-center justify-center gap-2 h-12 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-black text-slate-700 uppercase tracking-widest active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4 text-slate-500" />
              Add Extra
            </button>
            <button
              onClick={() => { playSound('click'); setAdjFormMode('deduct'); setAdjFormKey(formKey); setAdjForm({ description: '', amount: '' }); }}
              className="flex items-center justify-center gap-2 h-12 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-black text-slate-700 uppercase tracking-widest active:scale-95 transition-all"
            >
              <Minus className="w-4 h-4 text-slate-500" />
              Deduct
            </button>
          </div>
        )}

        {/* ── Adjustment list + form ── */}
        {(rowAdj.length > 0 || adjFormKey === formKey) && (
          <div className="space-y-1.5">
            {rowAdj.map(adj => (
              <div key={adj.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 gap-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${adj.amount >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-slate-800 uppercase tracking-tight truncate block">{adj.description}</span>
                    {adj.targetOwner && (
                      <span className="text-[10px] font-semibold text-rose-500 uppercase tracking-widest">→ {adj.targetOwner}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-sm font-black tabular-nums ${adj.amount < 0 ? 'text-rose-500' : 'text-slate-800'}`}>
                    {adj.amount >= 0 ? '+' : ''}{fmt(adj.amount)}
                  </span>
                  {submission?.status !== 'validated' && submission?.status !== 'approved' && (
                    <button onClick={() => handleDeleteAdjustment(adj.id)} className="text-slate-300 hover:text-rose-500 transition-colors p-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {adjFormKey === formKey && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  {adjFormMode === 'add'
                    ? <Plus className="w-3.5 h-3.5 text-slate-500" />
                    : <Minus className="w-3.5 h-3.5 text-slate-500" />
                  }
                  <span className="text-xs font-black text-slate-700 uppercase tracking-widest">
                    {adjFormMode === 'add' ? 'Add to ROI' : 'Deduct from ROI'}
                  </span>
                </div>
                <input
                  type="text"
                  value={adjForm.description}
                  onChange={e => setAdjForm(f => ({ ...f, description: e.target.value }))}
                  placeholder={adjFormMode === 'add' ? 'What is this for? (e.g. Boosting)' : 'What is this for? (e.g. Extra Expense)'}
                  autoFocus
                  className="w-full bg-white border border-slate-200 px-4 py-3 rounded-xl text-[11px] font-bold uppercase outline-none focus:border-slate-400 transition-colors"
                />
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[12px] font-black text-slate-400">₱</span>
                  <input
                    type="number" step="0.01" min="0"
                    value={adjForm.amount}
                    onChange={e => setAdjForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full bg-white border border-slate-200 pl-8 pr-4 py-3 rounded-xl text-[13px] font-black outline-none focus:border-slate-400 transition-colors tabular-nums"
                  />
                </div>
                {adjError && (
                  <p className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                    {adjError}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { setAdjFormKey(null); setAdjError(null); }}
                    className="h-12 bg-white border border-slate-200 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleAddAdjustment(currentGroup.label)}
                    disabled={isSavingAdj || !adjForm.description.trim() || !adjForm.amount}
                    className="h-12 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all disabled:opacity-40"
                  >
                    {isSavingAdj ? '…' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {owners.length === 0 && (
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest italic">
            No owners configured — contact your administrator
          </p>
        )}

        {/* ── Remittance status (admin-driven) ── */}
        <div className="h-px bg-slate-100" />

        {(!submission || submission.status === 'submitted' || submission.status === 'validated') && adjustedRoi <= 0 && (
          <div className="flex items-center gap-3 bg-slate-100 border border-slate-200 rounded-2xl px-4 py-3">
            <div className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
            <p className="text-xs font-black text-slate-600 uppercase tracking-widest">Nothing To Remit</p>
          </div>
        )}

        {(!submission || submission.status === 'submitted' || submission.status === 'validated') && adjustedRoi > 0 && (
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
            <Clock className="w-4 h-4 text-slate-300 shrink-0" />
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest">Pending remittance</p>
          </div>
        )}

        {submission?.status === 'approved' && (
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-4">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-black text-emerald-800 uppercase tracking-tight">Remitted — Done</p>
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mt-0.5">This period has been remitted and confirmed by the administrator.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
