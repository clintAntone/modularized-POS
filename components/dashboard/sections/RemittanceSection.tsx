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
  const [loadingAdj, setLoadingAdj] = useState(true);
  const [adjFormKey, setAdjFormKey] = useState<string | null>(null);
  const [adjFormMode, setAdjFormMode] = useState<'add' | 'deduct'>('add');
  const [adjForm, setAdjForm] = useState({ description: '', amount: '' });
  const [isSavingAdj, setIsSavingAdj] = useState(false);
  const [adjError, setAdjError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<RemittanceSubmission | null>(null);
  const [allSubmissions, setAllSubmissions] = useState<{ periodLabel: string; status: string }[]>([]);
  const [reminderDismissed, setReminderDismissed] = useState(
    () => sessionStorage.getItem('remittance_reminder_dismissed') === '1'
  );
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string | null>(null);
  const [periodDropdownOpen, setPeriodDropdownOpen] = useState(false);
  const periodDropdownRef = useRef<HTMLDivElement>(null);
  const [vaultBalance, setVaultBalance] = useState<number | null>(null);
  const [vaultTarget, setVaultTarget] = useState<number | null>(null);
  const [isRemittingToVault, setIsRemittingToVault] = useState(false);
  const [vaultRemitInput, setVaultRemitInput] = useState('');
  const [vaultRemitSaving, setVaultRemitSaving] = useState(false);
  const now = getTrueDate();

  useEffect(() => {
    if (branch.vaultEnabled) {
      supabase
        .from(DB_TABLES.BRANCH_VAULTS)
        .select(`${DB_COLUMNS.VAULT_BALANCE}, ${DB_COLUMNS.VAULT_TARGET}`)
        .eq(DB_COLUMNS.BRANCH_ID, branch.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setVaultBalance(Number(data[DB_COLUMNS.VAULT_BALANCE]) || 0);
            setVaultTarget(Number(data[DB_COLUMNS.VAULT_TARGET]) || null);
          }
        });
    }
  }, [branch.id, branch.vaultEnabled]);

  const handleRemitToVault = async (periodLabel: string) => {
    const amt = parseFloat(vaultRemitInput);
    if (!amt || amt <= 0) return;
    setVaultRemitSaving(true);
    try {
      const entryId = `${branch.id}_VR_${Date.now()}`;
      const manilaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
      const manilaTime = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).format(new Date());
      const timestamp = `${manilaDate}T${manilaTime}+08:00`;

      // 1. Insert as a negative remittance adjustment (deducts from weekly adjusted ROI)
      //    target_owner stores the vault_data entryId so deletion can cascade
      const { data: adjData, error: adjErr } = await supabase
        .from(DB_TABLES.REMITTANCE_ADJUSTMENTS)
        .insert({
          branch_id: branch.id,
          period_label: periodLabel,
          description: 'VAULT REMITTANCE',
          amount: -amt,
          target_owner: entryId,
        })
        .select().single();
      if (adjErr) throw adjErr;
      setAdjustments(prev => [...prev, {
        id: adjData.id, branchId: adjData.branch_id, periodLabel: adjData.period_label,
        description: adjData.description, amount: Number(adjData.amount),
        targetOwner: entryId, createdAt: adjData.created_at,
      }]);

      // 2. Append VAULT_REMITTANCE entry to vault_data (history only — no provision increment, no ROI impact)
      const reportId = `${branch.id}_${manilaDate.replace(/-/g, '')}`;
      const { data: existingReport } = await supabase
        .from(DB_TABLES.SALES_REPORTS)
        .select(DB_COLUMNS.VAULT_DATA)
        .eq(DB_COLUMNS.ID, reportId)
        .maybeSingle();
      const existingVaultData: any[] = existingReport
        ? (typeof existingReport[DB_COLUMNS.VAULT_DATA] === 'string'
            ? JSON.parse(existingReport[DB_COLUMNS.VAULT_DATA])
            : (existingReport[DB_COLUMNS.VAULT_DATA] || []))
        : [];
      await supabase.from(DB_TABLES.SALES_REPORTS).upsert({
        [DB_COLUMNS.ID]: reportId,
        [DB_COLUMNS.BRANCH_ID]: branch.id,
        [DB_COLUMNS.REPORT_DATE]: manilaDate,
        [DB_COLUMNS.VAULT_DATA]: [...existingVaultData, {
          id: entryId, name: 'VAULT DEPOSIT (REMITTANCE)', amount: amt,
          category: 'VAULT_REMITTANCE', timestamp,
        }],
      });

      // 3. Update vault balance
      const newBalance = (vaultBalance ?? 0) + amt;
      await supabase.from(DB_TABLES.BRANCH_VAULTS)
        .update({ [DB_COLUMNS.VAULT_BALANCE]: newBalance })
        .eq(DB_COLUMNS.BRANCH_ID, branch.id);

      setVaultBalance(newBalance);
      setIsRemittingToVault(false);
      setVaultRemitInput('');
      playSound('success');
    } catch {
      playSound('warning');
    } finally {
      setVaultRemitSaving(false);
    }
  };

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
        setLoadingAdj(false);
      });

    supabase
      .from(DB_TABLES.REMITTANCE_SUBMISSIONS)
      .select('period_label, status')
      .eq(DB_COLUMNS.BRANCH_ID, branch.id)
      .then(({ data }) => {
        if (data) setAllSubmissions(data.map(r => ({ periodLabel: r.period_label, status: r.status })));
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
    const adj = adjustments.find(a => a.id === id);
    try {
      await supabase.from(DB_TABLES.REMITTANCE_ADJUSTMENTS).delete().eq(DB_COLUMNS.ID, id);
      setAdjustments(prev => prev.filter(a => a.id !== id));

      // Cascade: if this was a vault remittance, remove the matching vault_data entry and reverse balance
      if (adj?.description === 'VAULT REMITTANCE' && adj.targetOwner) {
        const vaultEntryId = adj.targetOwner;
        const reportDate = adj.createdAt.slice(0, 10); // YYYY-MM-DD
        const reportId = `${branch.id}_${reportDate.replace(/-/g, '')}`;

        const { data: existingReport } = await supabase
          .from(DB_TABLES.SALES_REPORTS)
          .select(DB_COLUMNS.VAULT_DATA)
          .eq(DB_COLUMNS.ID, reportId)
          .maybeSingle();

        if (existingReport) {
          const existingVaultData: any[] = typeof existingReport[DB_COLUMNS.VAULT_DATA] === 'string'
            ? JSON.parse(existingReport[DB_COLUMNS.VAULT_DATA])
            : (existingReport[DB_COLUMNS.VAULT_DATA] || []);

          const removedEntry = existingVaultData.find((e: any) => e.id === vaultEntryId);
          const filteredVaultData = existingVaultData.filter((e: any) => e.id !== vaultEntryId);

          await supabase.from(DB_TABLES.SALES_REPORTS)
            .update({ [DB_COLUMNS.VAULT_DATA]: filteredVaultData })
            .eq(DB_COLUMNS.ID, reportId);

          if (removedEntry) {
            const reverseAmt = Number(removedEntry.amount) || Math.abs(adj.amount);
            const newBalance = (vaultBalance ?? 0) - reverseAmt;
            await supabase.from(DB_TABLES.BRANCH_VAULTS)
              .update({ [DB_COLUMNS.VAULT_BALANCE]: newBalance })
              .eq(DB_COLUMNS.BRANCH_ID, branch.id);
            setVaultBalance(newBalance);
          }
        }
      }

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
        // Skip reports from future dates (date > today), but allow current-week reports
        if (date > todayDate) return;
        const { label, weekStart, weekEnd } = getWeekRange(date, branch);
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

  // Periods past their cutoff that haven't been approved yet
  const overdueGroups = useMemo(() => {
    return allGroups.filter(g => {
      const sub = allSubmissions.find(s => s.periodLabel === g.label);
      return !sub || sub.status !== 'approved';
    });
  }, [allGroups, allSubmissions]);

  // If the active week (weekEnd still in the future) isn't in allGroups yet,
  // allGroups[0] is actually "1 week ago", not "current". Offset labels accordingly.
  // Also build a synthetic "current period" entry for the ongoing week so it shows in the list.
  const { periodOffset, currentWeekGroup } = useMemo(() => {
    const { weekStart: currentWeekStart, label: currentWeekLabel } = getWeekRange(now, branch);
    const currentWeekKey = currentWeekStart.getTime().toString();
    const alreadyPresent = allGroups.length > 0 && allGroups[0].key === currentWeekKey;
    const offset = alreadyPresent ? 0 : 1;
    const syntheticGroup = !alreadyPresent ? {
      key: currentWeekKey,
      label: currentWeekLabel,
      aggregate: { grossSales: 0, totalStaffPay: 0, totalExpenses: 0, totalVaultProvision: 0, netRoi: 0, isValidated: false, reportCount: 0 },
      isCurrent: true,
    } : null;
    return { periodOffset: offset, currentWeekGroup: syntheticGroup };
  }, [allGroups, now, branch]);

  // Full list shown in the dropdown: current week (if ongoing) prepended to completed periods
  const allGroupsWithCurrent = useMemo(() => {
    if (!currentWeekGroup) return allGroups;
    return [currentWeekGroup, ...allGroups];
  }, [allGroups, currentWeekGroup]);

  // Default to latest period; keep selection in sync when data loads
  const currentGroup = useMemo(() => {
    if (allGroupsWithCurrent.length === 0) return null;
    const match = selectedPeriodKey ? allGroupsWithCurrent.find(g => g.key === selectedPeriodKey) : null;
    return match ?? allGroupsWithCurrent[0];
  }, [allGroupsWithCurrent, selectedPeriodKey]);

  const currentPeriodIndex = useMemo(
    () => allGroupsWithCurrent.findIndex(g => g.key === currentGroup?.key),
    [allGroupsWithCurrent, currentGroup]
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
        setAllSubmissions(prev => {
          const exists = prev.find(s => s.periodLabel === row.period_label);
          if (exists) return prev.map(s => s.periodLabel === row.period_label ? { ...s, status: row.status } : s);
          return [...prev, { periodLabel: row.period_label, status: row.status }];
        });
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
  // VAULT REMITTANCE uses targetOwner to store the vault_data entry ID (not an owner name)
  const globalAdj = rowAdj.filter(a => !a.targetOwner || a.description === 'VAULT REMITTANCE');
  const ownerAdj = rowAdj.filter(a => !!a.targetOwner && a.description !== 'VAULT REMITTANCE');
  const totalGlobalAdj = globalAdj.reduce((s, a) => s + a.amount, 0);
  const adjustedRoi = agg.netRoi + totalGlobalAdj;
  const levyCut = levy ? adjustedRoi * (levy.percentage / 100) : 0;
  const distributableRoi = adjustedRoi - levyCut;
  const hasAdj = rowAdj.length > 0;
  const formKey = currentGroup.label;

  return (
    <div className="space-y-4 animate-in fade-in duration-700 pb-20">

      {/* ── Overdue remittance reminder popup ── */}
      {overdueGroups.length > 0 && !reminderDismissed && (
        <div className="fixed bottom-6 right-4 z-[999] w-[calc(100vw-2rem)] max-w-xs animate-in slide-in-from-right-4 fade-in duration-300">
          <div className="bg-white border border-amber-200 rounded-[24px] shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 bg-amber-50 px-4 py-3 border-b border-amber-100">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest leading-none">Remittance Reminder</p>
                  <p className="text-[9px] font-bold text-amber-500 uppercase tracking-widest mt-0.5">
                    {overdueGroups.length} period{overdueGroups.length !== 1 ? 's' : ''} not yet remitted
                  </p>
                </div>
              </div>
              <button
                onClick={() => { sessionStorage.setItem('remittance_reminder_dismissed', '1'); setReminderDismissed(true); playSound('click'); }}
                className="text-amber-400 hover:text-amber-700 transition-colors shrink-0 p-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Period list */}
            <div className="px-4 py-3 space-y-1.5 max-h-40 overflow-y-auto">
              {overdueGroups.slice(0, 5).map(g => {
                const sub = allSubmissions.find(s => s.periodLabel === g.label);
                return (
                  <div key={g.key} className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black text-slate-700 uppercase tracking-tight truncate">{g.label}</span>
                    <span className={`shrink-0 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg ${
                      sub?.status === 'submitted' ? 'bg-blue-50 text-blue-600' :
                      sub?.status === 'validated' ? 'bg-indigo-50 text-indigo-600' :
                      'bg-rose-50 text-rose-500'
                    }`}>
                      {sub?.status === 'submitted' ? 'Awaiting Confirmation' : sub?.status === 'validated' ? 'Validated' : 'Not Sent'}
                    </span>
                  </div>
                );
              })}
              {overdueGroups.length > 5 && (
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">+{overdueGroups.length - 5} more</p>
              )}
            </div>

            {/* Footer message */}
            <div className="px-4 pb-4">
              <p className="text-[9px] font-bold text-slate-500 leading-relaxed">
                Please inform your admin or send a receipt to confirm your remittance.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white px-6 py-5 rounded-[28px] border border-slate-100 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">
              {(currentPeriodIndex + periodOffset) === 0 ? 'Current Period' : `Period — ${currentPeriodIndex + periodOffset} week${(currentPeriodIndex + periodOffset) !== 1 ? 's' : ''} ago`}
            </p>
            <div className="flex items-center gap-2">
              <h3 className="text-[15px] font-black text-slate-900 uppercase tracking-tight leading-none">{currentGroup.label}</h3>
              {submission?.status === 'approved' ? (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-50">
                  <CheckCircle className="w-3 h-3 text-emerald-600" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Remitted</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100">
                  {agg.isValidated
                    ? <CheckCircle className="w-3 h-3 text-slate-500" />
                    : <Clock className="w-3 h-3 text-slate-400" />
                  }
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                    {agg.isValidated ? 'Validated' : 'Pending'}
                  </span>
                </div>
              )}
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
        {allGroupsWithCurrent.length > 1 && (
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
                  {(currentPeriodIndex + periodOffset) === 0 ? 'Current' : `${currentPeriodIndex + periodOffset}w ago`}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${periodDropdownOpen ? 'rotate-180 text-slate-600' : 'text-slate-400'}`} />
              </div>
            </button>

            {periodDropdownOpen && (
              <div className="absolute z-[200] top-[calc(100%+4px)] left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 ring-1 ring-slate-900/5">
                <div className="max-h-60 overflow-y-auto overscroll-contain">
                  {allGroupsWithCurrent.map((g, i) => {
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
                          {(i + periodOffset) === 0 ? 'Current' : `${i + periodOffset}w ago`}
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
              {hasAdj ? 'Adjusted ROI' : 'Net ROI'}
            </p>
            {loadingAdj ? (
              <div className="h-10 w-36 bg-slate-100 rounded-xl animate-pulse" />
            ) : (
            <p className={`text-4xl font-black tabular-nums leading-none ${adjustedRoi < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
              {fmt(adjustedRoi)}
            </p>
            )}
            {!loadingAdj && hasAdj && (
              <p className="text-xs font-medium text-slate-500 mt-1.5">
                Base {fmt(agg.netRoi)}&nbsp;&nbsp;{totalGlobalAdj >= 0 ? '+' : '−'}&nbsp;{fmt(Math.abs(totalGlobalAdj))} adj
                {ownerAdj.length > 0 && <span className="ml-1 text-[10px] text-slate-400">+ {ownerAdj.length} owner-targeted</span>}
              </p>
            )}
          </div>
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
                    {adj.targetOwner && adj.description !== 'VAULT REMITTANCE' && (
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
          <div className="space-y-2">
            {!submission && (
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
                <Clock className="w-4 h-4 text-slate-300 shrink-0" />
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest">Not Yet Remitted</p>
              </div>
            )}
            {(submission?.status === 'submitted' || submission?.status === 'validated') && (
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
                <Clock className="w-4 h-4 text-blue-400 shrink-0" />
                <div>
                  <p className="text-xs font-black text-blue-700 uppercase tracking-widest">Awaiting Admin Confirmation</p>
                </div>
              </div>
            )}
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
