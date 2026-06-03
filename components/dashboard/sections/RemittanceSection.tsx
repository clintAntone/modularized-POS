import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Branch, SalesReport, VaultTransaction } from '../../../types';
import { playSound } from '../../../lib/audio';
import { getWeekRange, parseDate } from '../../../src/utils/reportUtils';
import { getTrueDate } from '../../../lib/time';
import { supabase } from '../../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';
import { FileSpreadsheet, CheckCircle, Clock, Plus, Minus, Trash2, ChevronDown, Landmark } from 'lucide-react';

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
  vaultTransactions?: VaultTransaction[];
  performedBy?: string | null;
  canDepositToVault?: boolean;
  isDelegate?: boolean;
  onRefresh?: () => void;
}

const fmt = (n: number) =>
  `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const RemittanceSection: React.FC<RemittanceSectionProps> = ({ branch, salesReports, vaultTransactions = [], performedBy, canDepositToVault = false, isDelegate = false, onRefresh }) => {
  const queryClient = useQueryClient();
  const [adjustments, setAdjustments] = useState<RemittanceAdjustment[]>([]);
  const [loadingAdj, setLoadingAdj] = useState(true);
  const [adjFormKey, setAdjFormKey] = useState<string | null>(null);
  const [adjFormMode, setAdjFormMode] = useState<'add' | 'deduct'>('add');
  const [adjForm, setAdjForm] = useState({ description: '', amount: '' });
  const [adjTargetOwner, setAdjTargetOwner] = useState('');
  const [isSavingAdj, setIsSavingAdj] = useState(false);
  const [adjError, setAdjError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<RemittanceSubmission | null>(null);
  const [allSubmissions, setAllSubmissions] = useState<{ periodLabel: string; status: string }[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(true);
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
  const [isVaultDeposit, setIsVaultDeposit] = useState(false);
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

  const handleRemitToVault = async (periodLabel: string, adjustedRoi: number) => {
    const amt = parseFloat(vaultRemitInput);
    if (!amt || amt <= 0) return;
    if (amt > adjustedRoi) return;
    const remainingToTarget = vaultTarget !== null ? Math.max(0, vaultTarget - (vaultBalance ?? 0)) : Infinity;
    if (amt > remainingToTarget) return;
    setVaultRemitSaving(true);
    try {
      const now = new Date();
      const entryId = `${branch.id}_VR_${now.getTime()}`;
      const manilaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now);
      const manilaTime = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).format(now);
      const timestamp = `${manilaDate}T${manilaTime}+08:00`;

      // 1. Insert as a negative remittance adjustment (deducts from weekly adjusted ROI)
      //    target_owner stores the vault_data entryId so deletion can cascade
      const { data: adjData, error: adjErr } = await supabase
        .from(DB_TABLES.REMITTANCE_ADJUSTMENTS)
        .insert({
          branch_id: branch.id,
          period_label: periodLabel,
          description: 'VAULT DEPOSIT',
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

      // 2. Insert into vault_transactions for history in VaultFundHub
      await supabase.from(DB_TABLES.VAULT_TRANSACTIONS).insert({
        [DB_COLUMNS.ID]: entryId,
        [DB_COLUMNS.BRANCH_ID]: branch.id,
        [DB_COLUMNS.TYPE]: 'DEPOSIT',
        [DB_COLUMNS.AMOUNT]: amt,
        [DB_COLUMNS.NAME]: 'VAULT DEPOSIT (REMITTANCE)',
        [DB_COLUMNS.TIMESTAMP]: timestamp,
        [DB_COLUMNS.PERFORMED_BY]: performedBy ?? null,
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
      queryClient.invalidateQueries({ queryKey: ['vault_transactions', branch.id] });
      onRefresh?.();
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
        setLoadingSubmissions(false);
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

  const handleAddAdjustment = async (periodLabel: string, adjustedRoi: number) => {
    const raw = parseFloat(adjForm.amount);
    if (!adjForm.description.trim() || isNaN(raw) || raw === 0) return;
    if (isVaultDeposit && Math.abs(raw) > adjustedRoi) { playSound('warning'); return; }
    if (!isVaultDeposit && adjFormMode === 'deduct' && adjustedRoi - Math.abs(raw) < 0) {
      setAdjError(`Deduction exceeds adjusted ROI. Max deductible: ${fmt(Math.max(0, adjustedRoi))}`);
      return;
    }
    const amt = adjFormMode === 'deduct' ? -Math.abs(raw) : Math.abs(raw);
    setIsSavingAdj(true);
    setAdjError(null);
    try {
      if (isVaultDeposit) {
        // Vault deposit path — same logic as handleRemitToVault
        const depositAmt = Math.abs(raw);
        const now = new Date();
        const entryId = `${branch.id}_VR_${now.getTime()}`;
        const manilaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now);
        const manilaTime = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        }).format(now);
        const timestamp = `${manilaDate}T${manilaTime}+08:00`;

        const { data: adjData, error: adjErr } = await supabase
          .from(DB_TABLES.REMITTANCE_ADJUSTMENTS)
          .insert({ branch_id: branch.id, period_label: periodLabel, description: 'VAULT DEPOSIT', amount: -depositAmt, target_owner: entryId })
          .select().single();
        if (adjErr) throw adjErr;
        setAdjustments(prev => [...prev, { id: adjData.id, branchId: adjData.branch_id, periodLabel: adjData.period_label, description: adjData.description, amount: Number(adjData.amount), targetOwner: entryId, createdAt: adjData.created_at }]);

        await supabase.from(DB_TABLES.VAULT_TRANSACTIONS).insert({
          [DB_COLUMNS.ID]: entryId, [DB_COLUMNS.BRANCH_ID]: branch.id, [DB_COLUMNS.TYPE]: 'DEPOSIT',
          [DB_COLUMNS.AMOUNT]: depositAmt, [DB_COLUMNS.NAME]: 'VAULT DEPOSIT (REMITTANCE)',
          [DB_COLUMNS.TIMESTAMP]: timestamp, [DB_COLUMNS.PERFORMED_BY]: performedBy ?? null,
        });

        const newBalance = (vaultBalance ?? 0) + depositAmt;
        await supabase.from(DB_TABLES.BRANCH_VAULTS).update({ [DB_COLUMNS.VAULT_BALANCE]: newBalance }).eq(DB_COLUMNS.BRANCH_ID, branch.id);
        setVaultBalance(newBalance);
        queryClient.invalidateQueries({ queryKey: ['vault_transactions', branch.id] });
        onRefresh?.();
      } else {
        const { data, error } = await supabase
          .from(DB_TABLES.REMITTANCE_ADJUSTMENTS)
          .insert({ branch_id: branch.id, period_label: periodLabel, description: adjForm.description.trim().toUpperCase(), amount: amt, target_owner: adjTargetOwner || null })
          .select().single();
        if (error) throw error;
        setAdjustments(prev => [...prev, { id: data.id, branchId: data.branch_id, periodLabel: data.period_label, description: data.description, amount: Number(data.amount), targetOwner: adjTargetOwner || null, createdAt: data.created_at }]);
      }
      setAdjForm({ description: '', amount: '' });
      setAdjFormKey(null);
      setIsVaultDeposit(false);
      setAdjTargetOwner('');
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
      if (adj?.description === 'VAULT DEPOSIT' && adj.targetOwner) {
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
            await Promise.all([
              // Remove the vault_transaction record so VaultFundHub stays in sync
              supabase.from(DB_TABLES.VAULT_TRANSACTIONS)
                .delete()
                .eq(DB_COLUMNS.ID, vaultEntryId),
              // Reverse the vault balance
              supabase.from(DB_TABLES.BRANCH_VAULTS)
                .update({ [DB_COLUMNS.VAULT_BALANCE]: newBalance })
                .eq(DB_COLUMNS.BRANCH_ID, branch.id),
            ]);
            setVaultBalance(newBalance);
            queryClient.invalidateQueries({ queryKey: ['vault_transactions', branch.id] });
            onRefresh?.();
          }
        }
      }

      playSound('click');
    } catch (err) {
      console.error(err);
      playSound('warning');
    }
  };

  // Build a per-Manila-date map of actual vault DEPOSIT totals for this branch.
  // Uses live vault_transactions so provision is accurate even when reports were
  // saved before the deposit was made (or before vault was enabled).
  const vaultDepositByDate = useMemo(() => {
    const map: Record<string, number> = {};
    vaultTransactions
      .filter(t => t.branchId === branch.id && t.type === 'DEPOSIT')
      .forEach(t => {
        const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(t.timestamp));
        map[dateKey] = (map[dateKey] || 0) + (Number(t.amount) || 0);
      });
    return map;
  }, [vaultTransactions, branch.id]);

  // All completed periods sorted most-recent first.
  const allGroups = useMemo(() => {
    const groups: Record<string, { label: string; weekEnd: Date; aggregate: any }> = {};
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    salesReports
      .filter(r => r.branchId === branch.id)
      .forEach(report => {
        const date = parseDate(report.reportDate);
        if (date > todayDate) return;
        const { label, weekStart, weekEnd } = getWeekRange(date, branch);
        const key = weekStart.getTime().toString();
        if (!groups[key]) {
          groups[key] = {
            label,
            weekEnd,
            aggregate: {
              grossSales: 0, totalStaffPay: 0, totalExpenses: 0,
              totalVaultProvision: 0, netRoi: 0, reportCount: 0,
            },
          };
        }
        if (weekEnd > groups[key].weekEnd) groups[key].weekEnd = weekEnd;
        const agg = groups[key].aggregate;
        const gross      = report.grossSales || 0;
        const staffPay   = report.totalStaffPay || 0;
        const expenses   = report.totalExpenses || 0;
        // Prefer live vault transactions over the snapshot stored in the report —
        // the stored value can be 0 if the deposit was made after auto-save ran.
        const vaultDeposit = vaultDepositByDate[report.reportDate] ?? report.totalVaultProvision ?? 0;
        agg.grossSales          += gross;
        agg.totalStaffPay       += staffPay;
        agg.totalExpenses       += expenses;
        agg.totalVaultProvision += vaultDeposit;
        // Recompute net ROI from components so it's always consistent, regardless of
        // whether the stored net_roi had vault already deducted.
        agg.netRoi              += gross - staffPay - expenses - vaultDeposit;
        agg.reportCount         += 1;
      });

    return Object.keys(groups)
      .sort((a, b) => Number(b) - Number(a))
      .map(key => ({ key, label: groups[key].label, weekEnd: groups[key].weekEnd, aggregate: groups[key].aggregate }));
  }, [salesReports, branch.id]);

  // Periods whose weekEnd has passed and haven't been approved yet
  const overdueGroups = useMemo(() => {
    return allGroups.filter(g => {
      if (g.weekEnd >= now) return false;
      const sub = allSubmissions.find(s => s.periodLabel === g.label);
      return !sub || sub.status !== 'approved';
    });
  }, [allGroups, allSubmissions, now]);

  // If the active week (weekEnd still in the future) isn't in allGroups yet,
  // allGroups[0] is actually "1 week ago", not "current". Offset labels accordingly.
  // Also build a synthetic "current period" entry for the ongoing week so it shows in the list.
  const { periodOffset, currentWeekGroup } = useMemo(() => {
    const { label: currentWeekLabel, weekStart: currentWeekStart, weekEnd: currentWeekEnd } = getWeekRange(now, branch);
    const currentWeekKey = currentWeekStart.getTime().toString();
    const alreadyPresent = allGroups.length > 0 && allGroups[0].key === currentWeekKey;
    const offset = alreadyPresent ? 0 : 1;
    const syntheticGroup = !alreadyPresent ? {
      key: currentWeekKey,
      label: currentWeekLabel,
      weekEnd: currentWeekEnd,
      aggregate: { grossSales: 0, totalStaffPay: 0, totalExpenses: 0, totalVaultProvision: 0, netRoi: 0, reportCount: 0 },
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

  const handleExportExcel = async () => {
    if (!currentGroup) return;
    playSound('click');
    const XLSX = await import('xlsx');
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
      <div className="pb-20">
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
  // VAULT DEPOSIT uses targetOwner to store the vault_data entry ID (not an owner name)
  const globalAdj = rowAdj.filter(a => !a.targetOwner || a.description === 'VAULT DEPOSIT');
  const ownerAdj = rowAdj.filter(a => !!a.targetOwner && a.description !== 'VAULT DEPOSIT');
  const totalGlobalAdj = globalAdj.reduce((s, a) => s + a.amount, 0);
  const adjustedRoi = agg.netRoi + totalGlobalAdj;
  const levyCut = levy ? adjustedRoi * (levy.percentage / 100) : 0;
  const distributableRoi = adjustedRoi - levyCut;
  const hasAdj = rowAdj.length > 0;
  const formKey = currentGroup.label;

  // Adjustments only available after the period ends; locked again 3+ days after weekEnd
  const { adjLocked, adjNotYet } = (() => {
    const manilaToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
    const weekEndStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(currentGroup.weekEnd);
    const ms = new Date(manilaToday).getTime() - new Date(weekEndStr).getTime();
    const daysPassed = Math.floor(ms / 86400000);
    return { adjNotYet: daysPassed < 0, adjLocked: daysPassed > 2 };
  })();

  return (
    <div className="space-y-4 pb-20 max-w-4xl mx-auto">

      {/* ── Overdue remittance reminder popup ── */}
      {!loadingSubmissions && overdueGroups.length > 0 && !reminderDismissed && (
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

      {/* Period selector + export — outside the card */}
      {allGroupsWithCurrent.length > 1 && (
        <div ref={periodDropdownRef} className="relative flex items-center gap-2">
          <button
            onClick={() => { setPeriodDropdownOpen(o => !o); playSound('click'); }}
            className={`flex-1 h-10 flex items-center justify-between gap-2 px-4 rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all outline-none bg-white ${
              periodDropdownOpen
                ? 'border-slate-400 ring-4 ring-slate-500/10 text-slate-900'
                : 'border-slate-200 hover:border-slate-300 text-slate-600'
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
          <button
            onClick={handleExportExcel}
            className="flex items-center justify-center w-10 h-10 bg-slate-900 text-white rounded-xl hover:bg-slate-700 transition-all active:scale-95 shrink-0"
            title="Export"
          >
            <FileSpreadsheet className="w-4 h-4" />
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
                        setIsRemittingToVault(false);
                        setVaultRemitInput('');
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

      {/* Main card */}
      <div className={`bg-white rounded-[28px] shadow-sm overflow-hidden border ${
        submission?.status === 'approved' ? 'border-emerald-300' : 'border-slate-100'
      }`}>

        {/* Card header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${
          submission?.status === 'approved' ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100'
        }`}>
          <div>
            <p className="font-black text-slate-900 uppercase tracking-tight text-sm leading-none">{currentGroup.label}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
              {agg.reportCount} day{agg.reportCount !== 1 ? 's' : ''} aggregated
            </p>
          </div>
          <div className="flex items-center gap-3">
            {allGroupsWithCurrent.length <= 1 && (
              <button
                onClick={handleExportExcel}
                className="flex items-center justify-center w-9 h-9 bg-slate-900 text-white rounded-xl hover:bg-slate-700 transition-all active:scale-95 shrink-0"
                title="Export"
              >
                <FileSpreadsheet className="w-4 h-4" />
              </button>
            )}
            {submission?.status === 'approved' ? (
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Remitted</span>
              </div>
            ) : (submission?.status === 'submitted' || submission?.status === 'validated') ? (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Awaiting</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full shrink-0 ${adjustedRoi <= 0 ? 'bg-slate-400' : 'bg-amber-400'}`} />
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                  {adjustedRoi <= 0 ? 'Nothing To Remit' : 'Pending'}
                </span>
              </div>
            )}
            {submission?.status === 'approved' && (
              <input
                type="checkbox"
                checked
                readOnly
                className="w-5 h-5 accent-emerald-600 cursor-default"
                title="Remitted"
              />
            )}
          </div>
        </div>

        {/* Two-col on desktop: receipt left, adjustments right */}
        <div className="md:grid md:grid-cols-[1fr_420px] md:divide-x md:divide-slate-100">

          {/* LEFT — Receipt */}
          <div className="px-6 py-5 space-y-0 font-mono text-[12px]">
            <div className="flex justify-between py-1.5">
              <span className="text-slate-500">Gross Sales</span>
              <span className="font-bold text-slate-900 tabular-nums">{fmt(agg.grossSales)}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-500">Staff Payroll</span>
              <span className="font-bold text-rose-600 tabular-nums">-{fmt(agg.totalStaffPay)}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-500">Expenses</span>
              <span className="font-bold text-rose-600 tabular-nums">-{fmt(agg.totalExpenses)}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-500">Vault / Bills</span>
              <span className="font-bold text-rose-600 tabular-nums">-{fmt(agg.totalVaultProvision)}</span>
            </div>

            <div className="border-t-2 border-dashed border-slate-200 my-2" />

            <div className="flex justify-between py-2">
              <span className="font-black text-slate-900 text-sm uppercase tracking-wide">{hasAdj ? 'Adjusted ROI' : 'Net ROI'}</span>
              {loadingAdj ? (
                <div className="h-6 w-24 bg-slate-100 rounded animate-pulse" />
              ) : (
                <span className={`font-black text-lg tabular-nums ${adjustedRoi < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{fmt(adjustedRoi)}</span>
              )}
            </div>
            {!loadingAdj && hasAdj && (
              <div className="text-[10px] text-slate-400 text-right -mt-1 mb-1">
                Base {fmt(agg.netRoi)} {totalGlobalAdj >= 0 ? '+' : '−'} {fmt(Math.abs(totalGlobalAdj))} adj
              </div>
            )}

            {levy && (
              <>
                <div className="border-t border-dotted border-slate-200 my-2" />
                <div className="flex justify-between py-1.5">
                  <span className="text-indigo-600">{levy.name} ({levy.percentage}%)</span>
                  <span className="font-bold text-indigo-700 tabular-nums">-{fmt(levyCut)}</span>
                </div>
              </>
            )}

            {!isDelegate && owners.length > 0 && (
              <>
                <div className="border-t-2 border-dashed border-slate-200 my-2" />
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] py-1">
                  Owner Distribution{levy ? ` (of ${fmt(distributableRoi)})` : ''}
                </div>
                {owners.map((owner: any, oIdx: number) => {
                  const ownerTargeted = ownerAdj.filter(a => a.targetOwner === owner.name).reduce((s, a) => s + a.amount, 0);
                  const share = distributableRoi * (owner.percentage / 100) + ownerTargeted;
                  return (
                    <div key={oIdx} className="flex justify-between py-1.5">
                      <span className="text-slate-600">{owner.name} <span className="text-slate-400">({owner.percentage}%)</span></span>
                      <span className={`font-bold tabular-nums ${share < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{fmt(share)}</span>
                    </div>
                  );
                })}
                <div className="flex justify-between py-1.5 border-t border-dotted border-slate-200 mt-1">
                  <span className="font-black text-slate-500 uppercase tracking-widest text-[10px]">Total</span>
                  <span className="font-black text-slate-900 tabular-nums">{fmt(distributableRoi)}</span>
                </div>
              </>
            )}

            {/* Mobile-only adjustments separator */}
            <div className="border-t-2 border-dashed border-slate-200 my-2 md:hidden" />
          </div>

          {/* RIGHT — Adjustments */}
          <div className="px-5 py-5 space-y-1.5 flex flex-col">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Adjustments</p>

            {canDepositToVault && branch.vaultEnabled && rowAdj.filter(a => a.description === 'VAULT DEPOSIT').map(a => (
              <div key={a.id} className="flex items-center gap-3 bg-teal-50 border border-teal-100 rounded-xl px-4 py-3">
                <Landmark className="w-4 h-4 text-teal-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-teal-800 uppercase tracking-widest">Vault Deposit</p>
                </div>
                <span className="text-sm font-black text-teal-700 tabular-nums shrink-0">{fmt(Math.abs(a.amount))}</span>
              </div>
            ))}

            {rowAdj.filter(a => a.description !== 'VAULT DEPOSIT').map(adj => (
              <div key={adj.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 gap-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${adj.amount >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-slate-800 uppercase tracking-tight truncate block">{adj.description}</span>
                    {adj.targetOwner && adj.description !== 'VAULT DEPOSIT' && (
                      <span className="text-[10px] font-semibold text-rose-500 uppercase tracking-widest">→ {adj.targetOwner}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-sm font-black tabular-nums ${adj.amount < 0 ? 'text-rose-500' : 'text-slate-800'}`}>
                    {adj.amount >= 0 ? '+' : ''}{fmt(adj.amount)}
                  </span>
                  {submission?.status !== 'validated' && submission?.status !== 'approved' && (
                    <button onClick={() => handleDeleteAdjustment(adj.id)} className="text-slate-300 hover:text-rose-500 transition-colors p-0.5">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {rowAdj.filter(a => a.description !== 'VAULT DEPOSIT').length === 0 && adjFormKey !== formKey && (
              <p className="text-[10px] text-slate-400 italic">No adjustments</p>
            )}

            <div className="flex-1" />

            {adjFormKey !== formKey && submission?.status !== 'approved' && (
              <div className="flex justify-end gap-2 mt-2">
                {adjNotYet ? (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3 h-3 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"/></svg>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Available after period ends</span>
                  </div>
                ) : adjLocked ? (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3 h-3 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
                    <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Adjustment window closed</span>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => { playSound('click'); setAdjFormMode('add'); setAdjFormKey(formKey); setAdjForm({ description: '', amount: '' }); setIsVaultDeposit(false); setAdjTargetOwner(''); }}
                      className="flex items-center justify-center w-9 h-9 bg-slate-900 text-white rounded-xl active:scale-95 transition-all hover:bg-slate-700"
                      title="Add Extra"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { playSound('click'); setAdjFormMode('deduct'); setAdjFormKey(formKey); setAdjForm({ description: '', amount: '' }); setIsVaultDeposit(false); setAdjTargetOwner(''); }}
                      className="flex items-center justify-center w-9 h-9 bg-white border border-slate-200 text-slate-600 rounded-xl active:scale-95 transition-all hover:border-slate-400"
                      title="Deduct"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            )}

            {adjFormKey === formKey && (() => {
              const vaultEligible = adjFormMode === 'deduct' && canDepositToVault && !!branch.vaultEnabled;
              return (
              <div className={`border rounded-2xl p-4 space-y-2.5 mt-2 ${isVaultDeposit ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-2">
                  {adjFormMode === 'add' ? <Plus className="w-3.5 h-3.5 text-slate-500 shrink-0" /> : <Minus className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                  <span className={`text-xs font-black uppercase tracking-widest ${isVaultDeposit ? 'text-emerald-700' : 'text-slate-700'}`}>
                    {adjFormMode === 'add' ? 'Add to ROI' : isVaultDeposit ? 'Deposit to Vault' : 'Deduct from ROI'}
                  </span>
                </div>
                {vaultEligible && (
                  <label className={`flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${isVaultDeposit ? 'bg-emerald-100 border border-emerald-300' : 'bg-white border border-slate-200 hover:border-emerald-300'}`}>
                    <input
                      type="checkbox"
                      checked={isVaultDeposit}
                      onChange={e => {
                        const checked = e.target.checked;
                        setIsVaultDeposit(checked);
                        setAdjTargetOwner('');
                        if (checked) { setAdjForm(f => ({ ...f, description: 'VAULT DEPOSIT', amount: '' })); }
                        else { setAdjForm(f => ({ ...f, description: '', amount: '' })); }
                      }}
                      className="w-3.5 h-3.5 accent-emerald-600 shrink-0"
                    />
                    <span className={`text-[10px] font-black uppercase tracking-widest ${isVaultDeposit ? 'text-emerald-700' : 'text-slate-500'}`}>
                      Deposit to Vault
                    </span>
                  </label>
                )}
                <input
                  type="text"
                  value={adjForm.description}
                  onChange={e => !isVaultDeposit && setAdjForm(f => ({ ...f, description: e.target.value }))}
                  readOnly={isVaultDeposit}
                  placeholder={adjFormMode === 'add' ? 'Reason (e.g. Boosting)' : 'Reason (e.g. Extra Expense)'}
                  autoFocus={!isVaultDeposit}
                  className={`w-full border px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase outline-none transition-colors ${isVaultDeposit ? 'bg-emerald-100 border-emerald-200 text-emerald-800 cursor-default' : 'bg-white border-slate-200 focus:border-slate-400'}`}
                />
                {adjFormMode === 'deduct' && owners.length > 0 && !isVaultDeposit && (
                  <select
                    value={adjTargetOwner}
                    onChange={e => setAdjTargetOwner(e.target.value)}
                    className="w-full bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase outline-none focus:border-slate-400 transition-colors appearance-none"
                  >
                    <option value="">All Owners (Global)</option>
                    {owners.map((o: any) => <option key={o.name} value={o.name}>{o.name}</option>)}
                  </select>
                )}
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[12px] font-black text-slate-400">₱</span>
                  <input
                    type="number" step="0.01" min="0"
                    max={isVaultDeposit ? adjustedRoi : undefined}
                    value={adjForm.amount}
                    onChange={e => {
                      let val = e.target.value;
                      if (isVaultDeposit) {
                        const num = parseFloat(val);
                        if (!isNaN(num) && num > adjustedRoi) val = String(adjustedRoi);
                      }
                      setAdjForm(f => ({ ...f, amount: val }));
                    }}
                    placeholder="0.00"
                    autoFocus={isVaultDeposit}
                    className="w-full bg-white border border-slate-200 pl-8 pr-4 py-2.5 rounded-xl text-[13px] font-black outline-none focus:border-slate-400 transition-colors tabular-nums"
                  />
                </div>
                {isVaultDeposit && (
                  <p className="text-[10px] font-semibold text-emerald-700">Max: {fmt(adjustedRoi)} (adjusted ROI)</p>
                )}
                {adjError && (
                  <p className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{adjError}</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { setAdjFormKey(null); setAdjError(null); setIsVaultDeposit(false); setAdjForm({ description: '', amount: '' }); setAdjTargetOwner(''); }}
                    className="h-10 bg-white border border-slate-200 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleAddAdjustment(currentGroup.label, adjustedRoi)}
                    disabled={isSavingAdj || !adjForm.description.trim() || !adjForm.amount}
                    className={`h-10 text-white rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all disabled:opacity-40 ${isVaultDeposit ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-900'}`}
                  >
                    {isSavingAdj ? '…' : isVaultDeposit ? 'Deposit' : 'Save'}
                  </button>
                </div>
              </div>
              );
            })()}
          </div>

        </div>{/* close two-col grid */}
      </div>{/* close main card */}

    </div>
  );
};
