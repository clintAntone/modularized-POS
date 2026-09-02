import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Branch, SalesReport, VaultTransaction } from '../../../types';
import { playSound } from '../../../lib/audio';
import { getWeekRange, parseDate } from '../../../src/utils/reportUtils';
import { getTrueDate, formatPeso, getManilaTodayStr } from '../../../lib/time';
import { supabase } from '../../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';
import { FileSpreadsheet, CheckCircle, Clock, Plus, Minus, Trash2, ChevronDown, Landmark, ArrowLeftRight } from 'lucide-react';

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

const fmt = formatPeso;

export const RemittanceSection: React.FC<RemittanceSectionProps> = ({ branch, salesReports, vaultTransactions = [], performedBy, canDepositToVault = false, isDelegate = false, onRefresh }) => {
  const queryClient = useQueryClient();
  const [adjustments, setAdjustments] = useState<RemittanceAdjustment[]>([]);
  const [loadingAdj, setLoadingAdj] = useState(true);
  const [adjFormKey, setAdjFormKey] = useState<string | null>(null);
  const [adjFormMode, setAdjFormMode] = useState<'add' | 'deduct' | 'transfer'>('add');
  const [adjForm, setAdjForm] = useState({ description: '', amount: '' });
  const [adjTargetOwner, setAdjTargetOwner] = useState('');
  const [adjTransferFrom, setAdjTransferFrom] = useState('');
  const [adjTransferTo, setAdjTransferTo] = useState('');
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
  const [periodPaymentTotals, setPeriodPaymentTotals] = useState<{ cash: number; gcash: number } | null>(null);
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
      const now = getTrueDate();
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

  const handleTransferAdjustment = async (periodLabel: string) => {
    const raw = parseFloat(adjForm.amount);
    if (!adjTransferFrom || !adjTransferTo || adjTransferFrom === adjTransferTo) {
      setAdjError('Select two different owners for the transfer.');
      return;
    }
    if (!adjForm.description.trim() || isNaN(raw) || raw <= 0) {
      setAdjError('Enter a valid amount and reason.');
      return;
    }
    setIsSavingAdj(true);
    setAdjError(null);
    try {
      const reason = adjForm.description.trim().toUpperCase();
      const [{ data: debitData, error: e1 }, { data: creditData, error: e2 }] = await Promise.all([
        supabase.from(DB_TABLES.REMITTANCE_ADJUSTMENTS)
          .insert({ branch_id: branch.id, period_label: periodLabel, description: `${reason} → ${adjTransferTo}`, amount: -raw, target_owner: adjTransferFrom })
          .select().single(),
        supabase.from(DB_TABLES.REMITTANCE_ADJUSTMENTS)
          .insert({ branch_id: branch.id, period_label: periodLabel, description: `${reason} ← ${adjTransferFrom}`, amount: raw, target_owner: adjTransferTo })
          .select().single(),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      setAdjustments(prev => [
        ...prev,
        { id: debitData.id, branchId: debitData.branch_id, periodLabel: debitData.period_label, description: debitData.description, amount: Number(debitData.amount), targetOwner: adjTransferFrom, createdAt: debitData.created_at },
        { id: creditData.id, branchId: creditData.branch_id, periodLabel: creditData.period_label, description: creditData.description, amount: Number(creditData.amount), targetOwner: adjTransferTo, createdAt: creditData.created_at },
      ]);
      setAdjForm({ description: '', amount: '' });
      setAdjTransferFrom('');
      setAdjTransferTo('');
      setAdjFormKey(null);
      playSound('success');
    } catch (err: any) {
      setAdjError(err?.message || 'Failed to save transfer.');
      playSound('warning');
    } finally {
      setIsSavingAdj(false);
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
        const now = getTrueDate();
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

      // Cascade: if this was a vault deposit, remove the vault_transaction and reverse balance
      if (adj?.description === 'VAULT DEPOSIT' && adj.targetOwner) {
        const reverseAmt = Math.abs(adj.amount);
        const newBalance = (vaultBalance ?? 0) - reverseAmt;
        await Promise.all([
          supabase.from(DB_TABLES.VAULT_TRANSACTIONS)
            .delete()
            .eq(DB_COLUMNS.ID, adj.targetOwner),
          supabase.from(DB_TABLES.BRANCH_VAULTS)
            .update({ [DB_COLUMNS.VAULT_BALANCE]: newBalance })
            .eq(DB_COLUMNS.BRANCH_ID, branch.id),
        ]);
        setVaultBalance(newBalance);
        queryClient.invalidateQueries({ queryKey: ['vault_transactions', branch.id] });
        onRefresh?.();
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

  const [grossBreakdownOpen, setGrossBreakdownOpen] = useState(false);

  // All completed periods sorted most-recent first.
  const allGroups = useMemo(() => {
    const groups: Record<string, { label: string; weekEnd: Date; aggregate: any; reports: typeof salesReports }> = {};
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
            reports: [],
          };
        }
        if (weekEnd > groups[key].weekEnd) groups[key].weekEnd = weekEnd;
        const agg = groups[key].aggregate;
        const gross      = report.grossSales || 0;
        const staffPay   = report.totalStaffPay || 0;
        const expenses   = report.totalExpenses || 0;
        // Use the larger of live vault deposit vs stored provision.
        // Live is preferred when stored = 0 (deposit made after auto-save).
        // Stored is preferred when live is missing or stale, ensuring
        // Remittances matches the Reports tab which uses stored values.
        const liveVault   = vaultDepositByDate[report.reportDate] ?? 0;
        const storedVault = report.totalVaultProvision ?? 0;
        const vaultDeposit = Math.max(liveVault, storedVault);
        agg.grossSales          += gross;
        agg.totalStaffPay       += staffPay;
        agg.totalExpenses       += expenses;
        agg.totalVaultProvision += vaultDeposit;
        agg.netRoi              += report.netRoi ?? 0;
        agg.reportCount         += 1;
        groups[key].reports.push(report);
      });

    return Object.keys(groups)
      .sort((a, b) => Number(b) - Number(a))
      .map(key => ({
        key,
        label: groups[key].label,
        weekEnd: groups[key].weekEnd,
        aggregate: groups[key].aggregate,
        reports: groups[key].reports.sort((a, b) => a.reportDate < b.reportDate ? -1 : 1),
      }));
  }, [salesReports, branch.id]);

  // Periods whose weekEnd has passed and haven't been approved yet
  const overdueGroups = useMemo(() => {
    return allGroups.filter(g => {
      if (g.weekEnd >= now) return false;
      const sub = allSubmissions.find(s => s.periodLabel === g.label);
      return !sub || (sub.status !== 'approved' && sub.status !== 'remitted');
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
    setGrossBreakdownOpen(false);
    setPeriodPaymentTotals(null);
  }, [currentGroup?.label, branch.id]);

  // Lazy-fetch session_data only for the selected period — avoids loading it globally
  useEffect(() => {
    const reports = currentGroup && 'reports' in currentGroup ? currentGroup.reports : [];
    if (!reports.length || !supabase) return;
    const ids = reports.map((r: SalesReport) => r.id);
    supabase
      .from(DB_TABLES.SALES_REPORTS)
      .select(`${DB_COLUMNS.ID}, ${DB_COLUMNS.SESSION_DATA}`)
      .in(DB_COLUMNS.ID, ids)
      .then(({ data }) => {
        if (!data) return;
        let cash = 0, gcash = 0;
        data.forEach(row => {
          const sessions: any[] = typeof row[DB_COLUMNS.SESSION_DATA] === 'string'
            ? JSON.parse(row[DB_COLUMNS.SESSION_DATA])
            : (row[DB_COLUMNS.SESSION_DATA] || []);
          sessions.forEach(t => {
            const total = Number(t.total || 0);
            if (t.paymentMethod === 'GCASH') gcash += total;
            else cash += total;
          });
        });
        setPeriodPaymentTotals({ cash, gcash });
      });
  }, [currentGroup?.key, branch.id]);

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
    const history = branch.ownersHistory;
    const weekStartDate = new Date(Number(currentGroup.key)).toISOString().slice(0, 10);
    const applicable = history && history.length > 0
      ? history.filter((e: any) => e.effectiveDate <= weekStartDate).sort((a: any, b: any) => b.effectiveDate.localeCompare(a.effectiveDate))
      : [];
    const owners: any[] = applicable[0]?.owners ?? branch.owners ?? [];
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
        <div className="bg-white p-20 rounded-3xl border border-slate-100 text-center space-y-4">
          <div className="text-5xl opacity-20">📭</div>
          <p className="text-xs font-black text-slate-300 uppercase tracking-wider">No weekly reports found.</p>
        </div>
      </div>
    );
  }

  const agg = currentGroup.aggregate;

  // Resolve which owner percentages were in effect for this period's week start.
  // Falls back to current branch.owners if no history exists.
  const owners: any[] = (() => {
    const history = branch.ownersHistory;
    if (!history || history.length === 0) return branch.owners || [];
    const weekStartDate = new Date(Number(currentGroup.key)).toISOString().slice(0, 10);
    const applicable = history
      .filter(e => e.effectiveDate <= weekStartDate)
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
    return applicable[0]?.owners ?? branch.owners ?? [];
  })();

  const levy = branch.groupLevy || null;
  const rowAdj = adjustments.filter(a => a.periodLabel === currentGroup.label);
  // VAULT DEPOSIT uses targetOwner to store the vault_data entry ID (not an owner name)
  const globalAdj = rowAdj.filter(a => !a.targetOwner || a.description === 'VAULT DEPOSIT');
  const ownerAdj = rowAdj.filter(a => !!a.targetOwner && a.description !== 'VAULT DEPOSIT');
  const totalGlobalAdj = globalAdj.reduce((s, a) => s + a.amount, 0);
  const adjustedRoi = agg.netRoi + totalGlobalAdj;
  const levyCut = levy ? Math.max(0, adjustedRoi) * (levy.percentage / 100) : 0;
  const distributableRoi = adjustedRoi - levyCut;
  const hasAdj = rowAdj.length > 0;
  const formKey = currentGroup.label;

  // Adjustments only available after the period ends; locked again 3+ days after weekEnd
  const { adjLocked, adjNotYet } = (() => {
    const manilaToday = getManilaTodayStr();
    const weekEndStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(currentGroup.weekEnd);
    const ms = new Date(manilaToday).getTime() - new Date(weekEndStr).getTime();
    const daysPassed = Math.floor(ms / 86400000);
    return { adjNotYet: daysPassed < 0, adjLocked: daysPassed > 2 };
  })();

  return (
    <div className="space-y-4 pb-20">

      {/* ── Overdue remittance reminder popup ── */}
      {!loadingSubmissions && overdueGroups.length > 0 && !reminderDismissed && (
        <div className="fixed bottom-6 right-4 z-[999] w-[calc(100vw-2rem)] max-w-xs animate-in slide-in-from-right-4 fade-in duration-300">
          <div className="bg-white border border-amber-200 rounded-2xl shadow-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 bg-amber-50 px-4 py-3 border-b border-amber-100">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-black text-amber-700 uppercase tracking-widest leading-none">Remittance Reminder</p>
                  <p className="text-xs font-bold text-amber-500 uppercase tracking-widest mt-0.5">
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
                    <span className="text-xs font-black text-slate-700 uppercase tracking-tight truncate">{g.label}</span>
                    <span className={`shrink-0 text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-lg ${
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
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">+{overdueGroups.length - 5} more</p>
              )}
            </div>

            {/* Footer message */}
            <div className="px-4 pb-4">
              <p className="text-xs font-bold text-slate-500 leading-relaxed">
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
            className={`flex-1 h-10 flex items-center justify-between gap-2 px-4 rounded-2xl border text-xs font-semibold uppercase tracking-wide transition-all outline-none bg-white ${
              periodDropdownOpen
                ? 'border-slate-400 ring-4 ring-slate-500/10 text-slate-900'
                : 'border-slate-200 hover:border-slate-300 text-slate-600'
            }`}
          >
            <span className="truncate">{currentGroup?.label ?? 'Select Period'}</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold text-slate-500">
                {(currentPeriodIndex + periodOffset) === 0 ? 'Current' : `${currentPeriodIndex + periodOffset}w ago`}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${periodDropdownOpen ? 'rotate-180 text-slate-600' : 'text-slate-400'}`} />
            </div>
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center justify-center w-10 h-10 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition-all active:scale-95 shrink-0"
            title="Export"
          >
            <FileSpreadsheet className="w-4 h-4" />
          </button>

          {periodDropdownOpen && (
            <div className="absolute z-[200] top-[calc(100%+4px)] left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 ring-1 ring-slate-900/5">
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
                        <span className={`text-xs font-semibold uppercase tracking-wide ${isSelected ? 'text-slate-900' : 'text-slate-600'}`}>
                          {g.label}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-slate-500 shrink-0">
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

      {/* ── KPI Strip ── */}
      <div className="hidden md:grid grid-cols-5 gap-2.5">
        {[
          { label: 'Gross Sales', value: fmt(agg.grossSales), color: 'text-slate-900', sub: `${agg.reportCount} day${agg.reportCount !== 1 ? 's' : ''}` },
          { label: 'Staff Payroll', value: fmt(agg.totalStaffPay), color: 'text-rose-600', sub: 'commissions + allowance' },
          { label: 'Expenses', value: fmt(agg.totalExpenses), color: 'text-rose-600', sub: 'operational only' },
          { label: 'Vault Deposit', value: fmt(agg.totalVaultProvision), color: 'text-indigo-600', sub: 'saved to vault' },
          { label: hasAdj ? 'Adjusted ROI' : 'Net ROI', value: fmt(adjustedRoi), color: adjustedRoi < 0 ? 'text-rose-600' : 'text-emerald-600', sub: hasAdj ? `base ${fmt(agg.netRoi)}` : 'for this period' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-slate-100 rounded-2xl px-4 py-4 shadow-sm">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-widest mb-1">{k.label}</p>
            <p className={`text-xl font-black tabular-nums tracking-tighter ${k.color}`}>{k.value}</p>
            <p className="text-xs font-medium text-slate-300 uppercase tracking-wide mt-1">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Main card */}
      <div className={`bg-white rounded-2xl shadow-sm overflow-hidden border ${
        submission?.status === 'approved' ? 'border-emerald-300' : 'border-slate-100'
      }`}>

        {/* Card header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${
          submission?.status === 'approved' ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100'
        }`}>
          <div>
            <p className="font-black text-slate-900 uppercase tracking-tight text-sm leading-none">{currentGroup.label}</p>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-0.5">
              {agg.reportCount} day{agg.reportCount !== 1 ? 's' : ''} aggregated
            </p>
          </div>
          <div className="flex items-center gap-3">
            {allGroupsWithCurrent.length <= 1 && (
              <button
                onClick={handleExportExcel}
                className="flex items-center justify-center w-9 h-9 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition-all active:scale-95 shrink-0"
                title="Export"
              >
                <FileSpreadsheet className="w-4 h-4" />
              </button>
            )}
            {submission?.status === 'approved' ? (
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="text-xs font-black text-emerald-700 uppercase tracking-widest">Remitted</span>
              </div>
            ) : (submission?.status === 'submitted' || submission?.status === 'validated') ? (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="text-xs font-black text-blue-600 uppercase tracking-widest">Awaiting</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full shrink-0 ${adjustedRoi <= 0 ? 'bg-slate-400' : 'bg-amber-400'}`} />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
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
        <div className="md:grid md:grid-cols-[1fr_400px] md:divide-x md:divide-slate-100">

          {/* LEFT — Receipt */}
          <div className="px-6 py-5 space-y-0 font-mono text-xs">
            <button
              type="button"
              onClick={() => setGrossBreakdownOpen(o => !o)}
              className="w-full flex items-center justify-between py-1.5 group"
            >
              <span className="text-slate-500 group-hover:text-slate-700 transition-colors flex items-center gap-1.5">
                Gross Sales
                <svg className={`w-3 h-3 text-slate-400 transition-transform ${grossBreakdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                </svg>
              </span>
              <span className="font-bold text-slate-900 tabular-nums group-hover:text-indigo-700 transition-colors">{fmt(agg.grossSales)}</span>
            </button>

            {/* Cash / GCash sub-lines — lazy loaded per period */}
            {periodPaymentTotals && (periodPaymentTotals.cash > 0 || periodPaymentTotals.gcash > 0) && (
              <div className="pl-3 border-l-2 border-slate-700 mb-1 space-y-0.5">
                {periodPaymentTotals.cash > 0 && (
                  <div className="flex justify-between py-0.5">
                    <span className="text-slate-500 text-xs">↳ Cash</span>
                    <span className="text-slate-400 tabular-nums text-xs">{fmt(periodPaymentTotals.cash)}</span>
                  </div>
                )}
                {periodPaymentTotals.gcash > 0 && (
                  <div className="flex justify-between py-0.5">
                    <span className="text-blue-400 text-xs">↳ GCash</span>
                    <span className="text-blue-400 tabular-nums text-xs">{fmt(periodPaymentTotals.gcash)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Gross breakdown — per-day list */}
            {grossBreakdownOpen && currentGroup.reports.length > 0 && (
              <div className="mb-1 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{currentGroup.reports.length} daily reports</span>
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{fmt(agg.grossSales)} total</span>
                </div>
                <div className="divide-y divide-slate-100 max-h-44 overflow-y-auto">
                  {currentGroup.reports.map(r => {
                    const d = parseDate(r.reportDate);
                    const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
                    return (
                      <div key={r.id} className="flex items-center justify-between px-3 py-2">
                        <span className="text-xs font-bold text-slate-500">{dayLabel}</span>
                        <span className="text-xs font-black text-slate-800 tabular-nums">{fmt(r.grossSales || 0)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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

            {/* NET ROI = pure arithmetic always */}
            <div className="flex justify-between py-2">
              <span className="font-black text-slate-900 dark:text-white text-sm uppercase tracking-wide">Net ROI</span>
              <span className={`font-black text-lg tabular-nums ${agg.netRoi < 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>{agg.netRoi < 0 ? '−' : ''}{fmt(Math.abs(agg.netRoi))}</span>
            </div>

            {/* Vault deposit / global adjustments shown explicitly below NET ROI */}
            {!loadingAdj && totalGlobalAdj !== 0 && (
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500 text-xs">Vault / Adjustments</span>
                <span className={`font-semibold text-xs tabular-nums ${totalGlobalAdj < 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                  {totalGlobalAdj >= 0 ? '+' : '−'}{fmt(Math.abs(totalGlobalAdj))}
                </span>
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
                <div className="text-xs font-medium text-slate-400 uppercase tracking-wider py-1">
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
                  <span className="font-black text-slate-500 uppercase tracking-widest text-xs">Total</span>
                  <span className="font-black text-slate-900 tabular-nums">{fmt(distributableRoi)}</span>
                </div>
              </>
            )}

            {/* Mobile-only adjustments separator */}
            <div className="border-t-2 border-dashed border-slate-200 my-2 md:hidden" />
          </div>

          {/* RIGHT — Adjustments */}
          <div className="px-5 py-5 flex flex-col gap-4">

            {/* Action buttons — always at top when no form open */}
            {adjFormKey !== formKey && submission?.status !== 'approved' && (
              <div className="flex flex-col gap-2">
                {adjNotYet ? (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3 h-3 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"/></svg>
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Available after period ends</span>
                  </div>
                ) : adjLocked ? (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3 h-3 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
                    <span className="text-xs font-black text-amber-500 uppercase tracking-widest">Adjustment window closed</span>
                  </div>
                ) : (
                  <div className={`grid gap-2 ${owners.length >= 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
                    {/* ADD */}
                    <button
                      onClick={() => { playSound('click'); setAdjFormMode('add'); setAdjFormKey(formKey); setAdjForm({ description: '', amount: '' }); setIsVaultDeposit(false); setAdjTargetOwner(''); setAdjTransferFrom(''); setAdjTransferTo(''); }}
                      className="flex flex-col items-start gap-2 p-3 bg-slate-900 text-white rounded-2xl active:scale-95 transition-all hover:bg-slate-700"
                    >
                      <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
                        <Plus className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide leading-none">Add</p>
                        <p className="text-xs font-medium text-white/50 mt-0.5 leading-none">to ROI</p>
                      </div>
                    </button>

                    {/* DEDUCT */}
                    <button
                      onClick={() => { playSound('click'); setAdjFormMode('deduct'); setAdjFormKey(formKey); setAdjForm({ description: '', amount: '' }); setIsVaultDeposit(false); setAdjTargetOwner(''); setAdjTransferFrom(''); setAdjTransferTo(''); }}
                      className="flex flex-col items-start gap-2 p-3 bg-white border border-slate-200 text-slate-700 rounded-2xl active:scale-95 transition-all hover:border-slate-300 hover:bg-slate-50"
                    >
                      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                        <Minus className="w-3.5 h-3.5 text-slate-500" />
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide leading-none text-slate-800">Deduct</p>
                        <p className="text-xs font-medium text-slate-400 mt-0.5 leading-none">from ROI</p>
                      </div>
                    </button>

                    {/* VAULT DEPOSIT — full width, only when vault eligible */}
                    {canDepositToVault && branch.vaultEnabled && (
                      <button
                        onClick={() => { playSound('click'); setAdjFormMode('deduct'); setIsVaultDeposit(true); setAdjFormKey(formKey); setAdjForm({ description: 'VAULT DEPOSIT', amount: '' }); setAdjTargetOwner(''); setAdjTransferFrom(''); setAdjTransferTo(''); }}
                        className="col-span-2 flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-2xl active:scale-95 transition-all hover:bg-emerald-100"
                      >
                        <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                          <Landmark className="w-3.5 h-3.5 text-emerald-600" />
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-black uppercase tracking-wide leading-none text-emerald-800">Deposit to Vault</p>
                          <p className="text-xs font-medium text-emerald-400 mt-0.5 leading-none">Deduct from ROI → vault balance</p>
                        </div>
                      </button>
                    )}

                    {/* TRANSFER — full width when owners >= 2 */}
                    {owners.length >= 2 && (
                      <button
                        onClick={() => { playSound('click'); setAdjFormMode('transfer'); setAdjFormKey(formKey); setAdjForm({ description: 'REIMBURSEMENT', amount: '' }); setIsVaultDeposit(false); setAdjTargetOwner(''); setAdjTransferFrom(''); setAdjTransferTo(''); }}
                        className="col-span-2 flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-2xl active:scale-95 transition-all hover:bg-indigo-100"
                      >
                        <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                          <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-600" />
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-black uppercase tracking-wide leading-none text-indigo-800">Owner Reimbursement</p>
                          <p className="text-xs font-medium text-indigo-400 mt-0.5 leading-none">Debit one, credit another</p>
                        </div>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {adjFormKey === formKey && (() => {
              // ── TRANSFER FORM ──────────────────────────────────────────────
              if (adjFormMode === 'transfer') return (
                <div className="border border-indigo-200 bg-indigo-50 rounded-2xl p-4 space-y-2.5 mt-2">
                  <div className="flex items-center gap-2">
                    <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Owner Transfer</span>
                  </div>
                  <p className="text-xs text-indigo-500">Debit one owner and credit another. Net ROI is unchanged.</p>

                  {/* From / To selectors */}
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest pl-1">From (pays)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {owners.map((o: any) => (
                          <button
                            key={o.name}
                            type="button"
                            onClick={() => { setAdjTransferFrom(o.name); if (o.name === adjTransferTo) setAdjTransferTo(''); }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all active:scale-95 ${
                              adjTransferFrom === o.name
                                ? 'bg-rose-500 text-white shadow-sm'
                                : 'bg-white border border-indigo-200 text-indigo-700 hover:border-indigo-400'
                            }`}
                          >{o.name}</button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest pl-1">To (receives)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {owners.filter((o: any) => o.name !== adjTransferFrom).map((o: any) => (
                          <button
                            key={o.name}
                            type="button"
                            onClick={() => setAdjTransferTo(o.name)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all active:scale-95 ${
                              adjTransferTo === o.name
                                ? 'bg-emerald-500 text-white shadow-sm'
                                : 'bg-white border border-indigo-200 text-indigo-700 hover:border-indigo-400'
                            }`}
                          >{o.name}</button>
                        ))}
                        {!adjTransferFrom && (
                          <span className="text-xs font-medium text-indigo-300 italic px-1 py-1.5">Select "From" first</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={adjForm.description}
                    onChange={e => setAdjForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Reason (e.g. Reimbursement)"
                    className="w-full bg-white border border-indigo-200 px-4 py-2.5 rounded-xl text-xs font-bold uppercase outline-none focus:border-indigo-400 transition-colors"
                  />

                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">₱</span>
                    <input
                      type="number" step="0.01" min="0"
                      value={adjForm.amount}
                      onChange={e => setAdjForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="0.00"
                      className="w-full bg-white border border-indigo-200 pl-8 pr-4 py-2.5 rounded-xl text-sm font-black outline-none focus:border-indigo-400 transition-colors tabular-nums"
                    />
                  </div>

                  {adjTransferFrom && adjTransferTo && adjForm.amount && (
                    <div className="bg-white border border-indigo-100 rounded-xl px-3 py-2 text-xs text-indigo-700 space-y-0.5">
                      <div className="flex justify-between"><span>{adjTransferFrom}</span><span className="font-black text-rose-500">-{fmt(parseFloat(adjForm.amount) || 0)}</span></div>
                      <div className="flex justify-between"><span>{adjTransferTo}</span><span className="font-black text-emerald-600">+{fmt(parseFloat(adjForm.amount) || 0)}</span></div>
                    </div>
                  )}

                  {adjError && <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{adjError}</p>}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => { setAdjFormKey(null); setAdjError(null); setAdjForm({ description: '', amount: '' }); setAdjTransferFrom(''); setAdjTransferTo(''); }}
                      className="h-10 bg-white border border-slate-200 text-slate-500 rounded-xl text-xs font-semibold uppercase tracking-wide active:scale-95 transition-all"
                    >Cancel</button>
                    <button
                      onClick={() => handleTransferAdjustment(currentGroup.label)}
                      disabled={isSavingAdj || !adjTransferFrom || !adjTransferTo || !adjForm.description.trim() || !adjForm.amount}
                      className="h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold uppercase tracking-wide active:scale-95 transition-all disabled:opacity-40"
                    >{isSavingAdj ? '…' : 'Transfer'}</button>
                  </div>
                </div>
              );

              // ── ADD / DEDUCT FORM ──────────────────────────────────────────
              return (
              <div className={`border rounded-2xl p-4 space-y-2.5 mt-2 ${isVaultDeposit ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-2">
                  {adjFormMode === 'add' ? <Plus className="w-3.5 h-3.5 text-slate-500 shrink-0" /> : <Minus className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                  <span className={`text-xs font-semibold uppercase tracking-wide ${isVaultDeposit ? 'text-emerald-700' : 'text-slate-700'}`}>
                    {adjFormMode === 'add' ? 'Add to ROI' : isVaultDeposit ? 'Deposit to Vault' : 'Deduct from ROI'}
                  </span>
                </div>
                <input
                  type="text"
                  value={adjForm.description}
                  onChange={e => !isVaultDeposit && setAdjForm(f => ({ ...f, description: e.target.value }))}
                  readOnly={isVaultDeposit}
                  placeholder={adjFormMode === 'add' ? 'Reason (e.g. Boosting)' : 'Reason (e.g. Extra Expense)'}
                  autoFocus={!isVaultDeposit}
                  className={`w-full border px-4 py-2.5 rounded-xl text-xs font-bold uppercase outline-none transition-colors ${isVaultDeposit ? 'bg-emerald-100 border-emerald-200 text-emerald-800 cursor-default' : 'bg-white border-slate-200 focus:border-slate-400'}`}
                />
                {/* Owner targeting — available for both add and deduct */}
                {owners.length > 0 && !isVaultDeposit && (
                  <select
                    value={adjTargetOwner}
                    onChange={e => setAdjTargetOwner(e.target.value)}
                    className="w-full bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold uppercase outline-none focus:border-slate-400 transition-colors appearance-none"
                  >
                    <option value="">All Owners (Global ROI)</option>
                    {owners.map((o: any) => <option key={o.name} value={o.name}>{o.name} only</option>)}
                  </select>
                )}
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">₱</span>
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
                    className="w-full bg-white border border-slate-200 pl-8 pr-4 py-2.5 rounded-xl text-sm font-black outline-none focus:border-slate-400 transition-colors tabular-nums"
                  />
                </div>
                {isVaultDeposit && (
                  <p className="text-xs font-semibold text-emerald-700">Max: {fmt(adjustedRoi)} (adjusted ROI)</p>
                )}
                {adjError && (
                  <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{adjError}</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { setAdjFormKey(null); setAdjError(null); setIsVaultDeposit(false); setAdjForm({ description: '', amount: '' }); setAdjTargetOwner(''); }}
                    className="h-10 bg-white border border-slate-200 text-slate-500 rounded-xl text-xs font-semibold uppercase tracking-wide active:scale-95 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleAddAdjustment(currentGroup.label, adjustedRoi)}
                    disabled={isSavingAdj || !adjForm.description.trim() || !adjForm.amount}
                    className={`h-10 text-white rounded-xl text-xs font-semibold uppercase tracking-wide active:scale-95 transition-all disabled:opacity-40 ${isVaultDeposit ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-800'}`}
                  >
                    {isSavingAdj ? '…' : isVaultDeposit ? 'Deposit' : 'Save'}
                  </button>
                </div>
              </div>
              );
            })()}

            {/* Adjustments list — below buttons/form */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Adjustments</p>

              {canDepositToVault && branch.vaultEnabled && rowAdj.filter(a => a.description === 'VAULT DEPOSIT').map(a => (
                <div key={a.id} className="flex items-center gap-3 bg-teal-50 border border-teal-100 rounded-xl px-4 py-3">
                  <Landmark className="w-4 h-4 text-teal-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-teal-800 uppercase tracking-widest">Vault Deposit</p>
                  </div>
                  <span className="text-sm font-black text-teal-700 tabular-nums shrink-0">{fmt(Math.abs(a.amount))}</span>
                </div>
              ))}

              {rowAdj.filter(a => a.description !== 'VAULT DEPOSIT').map(adj => {
                const isTransfer = adj.description.includes(' → ') || adj.description.includes(' ← ');
                return (
                <div key={adj.id} className={`flex items-center justify-between rounded-xl px-4 py-3 gap-4 border ${isTransfer ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-100'}`}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    {isTransfer
                      ? <ArrowLeftRight className={`w-3 h-3 shrink-0 ${adj.amount < 0 ? 'text-rose-400' : 'text-emerald-500'}`} />
                      : <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${adj.amount >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                    }
                    <div className="min-w-0">
                      <span className={`text-xs font-semibold uppercase tracking-tight truncate block ${isTransfer ? 'text-indigo-800' : 'text-slate-800'}`}>{adj.description}</span>
                      {adj.targetOwner && !isTransfer && (
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">→ {adj.targetOwner}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-sm font-black tabular-nums ${adj.amount < 0 ? 'text-rose-500' : isTransfer ? 'text-emerald-600' : 'text-slate-800'}`}>
                      {adj.amount >= 0 ? '+' : ''}{fmt(adj.amount)}
                    </span>
                    {submission?.status !== 'validated' && submission?.status !== 'approved' && (
                      <button onClick={() => handleDeleteAdjustment(adj.id)} className="text-slate-300 hover:text-rose-500 transition-colors p-0.5">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                );
              })}

              {rowAdj.filter(a => a.description !== 'VAULT DEPOSIT').length === 0 && (
                <div className="flex flex-col items-center justify-center py-6 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
                  <p className="text-xs font-semibold text-slate-300 uppercase tracking-widest">No adjustments</p>
                  <p className="text-xs text-slate-300 mt-0.5">Use the buttons above to add one</p>
                </div>
              )}
            </div>
          </div>

        </div>{/* close two-col grid */}
      </div>{/* close main card */}

    </div>
  );
};
