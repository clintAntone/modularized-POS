import React, { useState, useMemo, useEffect } from 'react';
import { Branch, SalesReport } from '../../../types';
import { playSound } from '../../../lib/audio';
import { getWeekRange, parseDate } from '../../../src/utils/reportUtils';
import { getTrueDate } from '../../../lib/time';
import { supabase } from '../../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, CheckCircle, Clock, Plus, Minus, Trash2, Paperclip, Send, XCircle, RotateCcw } from 'lucide-react';

type SubmissionStatus = 'submitted' | 'approved' | 'rejected' | null;

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
  receiptImage?: string | null;
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
  const [adjReceiptFile, setAdjReceiptFile] = useState<File | null>(null);
  const [isSavingAdj, setIsSavingAdj] = useState(false);
  const [submission, setSubmission] = useState<RemittanceSubmission | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
          receiptImage: r.receipt_image ?? null, createdAt: r.created_at,
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

  const handleSubmitRemittance = async (periodLabel: string) => {
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase
        .from(DB_TABLES.REMITTANCE_SUBMISSIONS)
        .upsert({
          branch_id: branch.id,
          period_label: periodLabel,
          status: 'submitted',
          review_note: null,
          submitted_at: new Date().toISOString(),
        }, { onConflict: 'branch_id,period_label' })
        .select().single();
      if (error) throw error;
      setSubmission({ id: data.id, status: 'submitted', reviewNote: null, submittedAt: data.submitted_at });
      localStorage.setItem(`remittance_submitted_${branch.id}`, periodLabel);
      playSound('success');
    } catch (err) {
      console.error(err);
      playSound('warning');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddAdjustment = async (periodLabel: string) => {
    const raw = parseFloat(adjForm.amount);
    if (!adjForm.description.trim() || isNaN(raw) || raw === 0) return;
    const amt = adjFormMode === 'deduct' ? -Math.abs(raw) : Math.abs(raw);
    setIsSavingAdj(true);
    try {
      // Upload receipt if provided
      let receiptImageUrl: string | null = null;
      if (adjReceiptFile) {
        const ext = adjReceiptFile.name.split('.').pop();
        const path = `remittance_receipts/${branch.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(path, adjReceiptFile, { upsert: false });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path);
        receiptImageUrl = urlData.publicUrl;
      }

      const { data, error } = await supabase
        .from(DB_TABLES.REMITTANCE_ADJUSTMENTS)
        .insert({
          branch_id: branch.id,
          period_label: periodLabel,
          description: adjForm.description.trim().toUpperCase(),
          amount: amt,
          receipt_image: receiptImageUrl,
        })
        .select().single();
      if (error) throw error;
      setAdjustments(prev => [...prev, {
        id: data.id, branchId: data.branch_id, periodLabel: data.period_label,
        description: data.description, amount: Number(data.amount),
        receiptImage: data.receipt_image ?? null, createdAt: data.created_at,
      }]);
      setAdjForm({ description: '', amount: '' });
      setAdjReceiptFile(null);
      setAdjFormKey(null);
      playSound('success');
    } catch (err) {
      console.error(err);
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

  // Only the most recent completed period
  const currentGroup = useMemo(() => {
    const groups: Record<string, { label: string; weekEnd: Date; aggregate: any }> = {};

    salesReports
      .filter(r => r.branchId === branch.id)
      .forEach(report => {
        const date = parseDate(report.reportDate);
        const { label, weekStart, weekEnd } = getWeekRange(date, branch);
        if (weekEnd > now) return;
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

    const sorted = Object.keys(groups)
      .sort((a, b) => Number(b) - Number(a));

    if (sorted.length === 0) return null;
    const key = sorted[0];
    return { label: groups[key].label, aggregate: groups[key].aggregate };
  }, [salesReports, branch.id]);

  useEffect(() => {
    if (currentGroup) fetchSubmission(currentGroup.label);
  }, [currentGroup?.label, branch.id]);

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
    owners.forEach((o: any) => { row[`${o.name} (${o.percentage}%)`] = adjustedRoi * (o.percentage / 100); });
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
  const rowAdj = adjustments.filter(a => a.periodLabel === currentGroup.label);
  const totalAdj = rowAdj.reduce((s, a) => s + a.amount, 0);
  const adjustedRoi = agg.netRoi + totalAdj;
  const hasAdj = rowAdj.length > 0;
  const formKey = currentGroup.label;

  return (
    <div className="space-y-4 animate-in fade-in duration-700 pb-20">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 bg-white px-6 py-5 rounded-[28px] border border-slate-100 shadow-sm">
        <div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Current Period</p>
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-black text-slate-900 uppercase tracking-tight leading-none">{currentGroup.label}</h3>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100">
              {agg.isValidated
                ? <CheckCircle className="w-3 h-3 text-slate-500" />
                : <Clock className="w-3 h-3 text-slate-400" />
              }
              <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">
                {agg.isValidated ? 'Validated' : 'Pending'}
              </span>
            </div>
          </div>
          <p className="text-[10px] font-bold text-slate-400 mt-0.5">{agg.reportCount} day{agg.reportCount !== 1 ? 's' : ''} · {branch.name.replace('BRANCH - ', '')}</p>
        </div>
        <button
          onClick={handleExportExcel}
          className="flex items-center gap-2 px-4 h-10 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-700 transition-all shadow active:scale-95 shrink-0"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span className="hidden sm:inline">Export</span>
        </button>
      </div>

      {/* Main card */}
      <div className="bg-white rounded-[28px] border border-slate-100 shadow-sm p-5 sm:p-6 space-y-5">

        {/* ── Hero: Adjusted ROI ── */}
        <div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
            {hasAdj ? 'Adjusted ROI' : 'Net ROI'}
          </p>
          <p className={`text-4xl font-black tabular-nums leading-none ${adjustedRoi < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
            {fmt(adjustedRoi)}
          </p>
          {hasAdj && (
            <p className="text-[10px] font-bold text-slate-400 mt-1.5">
              Base {fmt(agg.netRoi)}&nbsp;&nbsp;{totalAdj >= 0 ? '+' : '−'}&nbsp;{fmt(Math.abs(totalAdj))} adjustments
            </p>
          )}
        </div>

        {/* ── Owner cuts ── */}
        {owners.length > 0 && (
          <div className="space-y-2">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Owner Cut</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {owners.map((owner: any, oIdx: number) => {
                const share = adjustedRoi * (owner.percentage / 100);
                return (
                  <div key={oIdx} className="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-slate-200 flex items-center justify-center text-[11px] font-black text-slate-600 shrink-0">
                        {owner.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-black text-slate-800 uppercase tracking-tight leading-none truncate">{owner.name}</p>
                        <p className="text-[9px] font-bold text-slate-400 mt-0.5">{owner.percentage}%</p>
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
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{col.label}</p>
              <p className="text-[12px] font-black text-slate-600 tabular-nums">{col.prefix} {fmt(col.value || 0)}</p>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="h-px bg-slate-100" />

        {/* ── Add / Deduct buttons ── */}
        {adjFormKey !== formKey && (
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
                    <span className="text-[10px] font-bold text-slate-700 uppercase tracking-tight truncate block">{adj.description}</span>
                    {adj.receiptImage ? (
                      <a href={adj.receiptImage} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[9px] font-bold text-slate-400 hover:text-slate-700 uppercase tracking-widest transition-colors mt-0.5">
                        <Paperclip className="w-2.5 h-2.5" /> View Receipt
                      </a>
                    ) : (
                      <span className="text-[9px] font-bold text-rose-400 uppercase tracking-widest mt-0.5 block">No receipt</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-[11px] font-black tabular-nums ${adj.amount < 0 ? 'text-rose-500' : 'text-slate-800'}`}>
                    {adj.amount >= 0 ? '+' : ''}{fmt(adj.amount)}
                  </span>
                  <button onClick={() => handleDeleteAdjustment(adj.id)} className="text-slate-300 hover:text-rose-500 transition-colors p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
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
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                    {adjFormMode === 'add' ? 'Add extra to ROI' : 'Deduct from ROI'}
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
                {/* Receipt upload */}
                <label className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${adjReceiptFile ? 'bg-slate-100 border-slate-300' : 'bg-white border-slate-200 border-dashed'}`}>
                  <Paperclip className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    {adjReceiptFile ? (
                      <span className="text-[10px] font-bold text-slate-700 uppercase tracking-tight truncate block">{adjReceiptFile.name}</span>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Attach Receipt (required)</span>
                    )}
                  </div>
                  {adjReceiptFile && (
                    <button type="button" onClick={e => { e.preventDefault(); setAdjReceiptFile(null); }} className="text-slate-300 hover:text-rose-500 transition-colors p-0.5 shrink-0">
                      ✕
                    </button>
                  )}
                  <input type="file" accept="image/*,application/pdf" className="hidden"
                    onChange={e => setAdjReceiptFile(e.target.files?.[0] ?? null)} />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { setAdjFormKey(null); setAdjReceiptFile(null); }}
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
          <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest italic">
            No owners configured — contact your administrator
          </p>
        )}

        {/* ── Submit remittance ── */}
        <div className="h-px bg-slate-100" />

        {(!submission || submission.status === 'rejected') && (
          <div className="space-y-2">
            {submission?.status === 'rejected' && (
              <div className="flex items-start gap-3 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3">
                <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-black text-rose-700 uppercase tracking-tight">Rejected by Admin</p>
                  {submission.reviewNote && (
                    <p className="text-[10px] font-bold text-rose-500 mt-0.5">{submission.reviewNote}</p>
                  )}
                </div>
              </div>
            )}
            <button
              onClick={() => handleSubmitRemittance(currentGroup.label)}
              disabled={isSubmitting}
              className="w-full h-14 bg-slate-900 text-white rounded-2xl text-[12px] font-black uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {submission?.status === 'rejected' ? <RotateCcw className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                  {submission?.status === 'rejected' ? 'Resubmit Remittance' : 'Submit Remittance'}
                </>
              )}
            </button>
          </div>
        )}

        {submission?.status === 'submitted' && (
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4">
            <Clock className="w-5 h-5 text-slate-400 shrink-0" />
            <div>
              <p className="text-[11px] font-black text-slate-700 uppercase tracking-tight">Submitted — Awaiting Review</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Your remittance is pending superadmin approval.</p>
            </div>
          </div>
        )}

        {submission?.status === 'approved' && (
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4">
            <CheckCircle className="w-5 h-5 text-slate-600 shrink-0" />
            <div>
              <p className="text-[11px] font-black text-slate-700 uppercase tracking-tight">Approved</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Remittance confirmed by admin.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
