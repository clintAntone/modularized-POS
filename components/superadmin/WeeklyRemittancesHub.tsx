import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Branch, SalesReport } from '../../types';
import { playSound } from '../../lib/audio';
import { getWeekRange, parseDate, normalizeDateStr } from '../../src/utils/reportUtils';
import { getTrueDate, getManilaTodayStr, formatPeso, getTrueISOString } from '../../lib/time';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileDown, CheckCircle, XCircle, Plus, Minus, Trash2, ArrowLeftRight } from 'lucide-react';
import { BranchCheckboxDropdown } from '../shared/BranchCheckboxDropdown';

interface WeeklyRemittancesHubProps {
  branches: Branch[];
  salesReports: SalesReport[];
  onRefresh?: () => void;
  isReadOnly?: boolean;
  addedBy?: string;
}

interface RemittanceAdjustment {
  id: string;
  branchId: string;
  periodLabel: string;
  description: string;
  amount: number;
  targetOwner?: string | null;
  addedBy?: string | null;
  createdAt: string;
}

type SubmissionStatus = 'submitted' | 'validated' | 'approved' | 'rejected' | 'for_verification' | null; // 'validated' kept for legacy records only
interface RemittanceSubmission {
  id: string;
  branchId: string;
  periodLabel: string;
  status: SubmissionStatus;
  reviewNote?: string | null;
  submittedAt: string;
}

const fmt = formatPeso;

export const WeeklyRemittancesHub: React.FC<WeeklyRemittancesHubProps> = ({ branches, salesReports: _salesReportsProp, onRefresh, isReadOnly, addedBy }) => {
  // Fetch ALL reports with scalar fields only (no JSON blobs) — paginated to bypass PostgREST row cap
  const { data: allSalesReports = _salesReportsProp } = useQuery<SalesReport[]>({
    queryKey: ['remittances_all_reports'],
    queryFn: async () => {
      if (!supabase) return [];
      const cols = [
        DB_COLUMNS.ID, DB_COLUMNS.BRANCH_ID, DB_COLUMNS.REPORT_DATE, DB_COLUMNS.SUBMITTED_AT,
        DB_COLUMNS.GROSS_SALES, DB_COLUMNS.TOTAL_STAFF_PAY, DB_COLUMNS.TOTAL_EXPENSES,
        DB_COLUMNS.TOTAL_VAULT_PROVISION, DB_COLUMNS.NET_ROI,
      ].join(',');

      const PAGE = 1000;
      const allRows: any[] = [];
      let from = 0;
      // Keep fetching pages until a page comes back with fewer rows than PAGE_SIZE
      while (true) {
        const { data, error } = await supabase
          .from(DB_TABLES.SALES_REPORTS)
          .select(cols)
          .order(DB_COLUMNS.REPORT_DATE, { ascending: false })
          .order(DB_COLUMNS.SUBMITTED_AT, { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (data && data.length > 0) allRows.push(...data);
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }

      return allRows.map((r: any) => ({
        id: r[DB_COLUMNS.ID],
        branchId: r[DB_COLUMNS.BRANCH_ID],
        reportDate: normalizeDateStr(r[DB_COLUMNS.REPORT_DATE]),
        submittedAt: r[DB_COLUMNS.SUBMITTED_AT],
        grossSales: Number(r[DB_COLUMNS.GROSS_SALES] ?? 0),
        totalStaffPay: Number(r[DB_COLUMNS.TOTAL_STAFF_PAY] ?? 0),
        totalExpenses: Number(r[DB_COLUMNS.TOTAL_EXPENSES] ?? 0),
        totalVaultProvision: Number(r[DB_COLUMNS.TOTAL_VAULT_PROVISION] ?? 0),
        netRoi: Number(r[DB_COLUMNS.NET_ROI] ?? 0),
        sessionData: [], staffBreakdown: [], expenseData: [], vaultData: [],
      }));
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  // Scope reports to the branches passed as prop — this ensures portal users only
  // see data for their assigned branches even though the query fetches all reports.
  const allowedBranchIdSet = useMemo(() => new Set(branches.map(b => b.id)), [branches]);
  const salesReports = useMemo(
    () => allSalesReports.filter(r => allowedBranchIdSet.has(r.branchId)),
    [allSalesReports, allowedBranchIdSet]
  );

  const [selectedPeriods, setSelectedPeriods] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('rem_filter_periods') || '[]'); } catch { return []; }
  });
  const [branchSearch, setBranchSearch] = useState('');
  const [periodDropdownOpen, setPeriodDropdownOpen] = useState(false);
  const periodDropdownRef = useRef<HTMLDivElement>(null);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const branchDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>(() => {
    try {
      const saved: string[] = JSON.parse(localStorage.getItem('rem_filter_branches') || '[]');
      const branchIdSet = new Set(branches.map(b => b.id));
      // Clamp to branches available in this session — prevents stale superadmin
      // filter from hiding branches that a portal user was explicitly assigned to.
      return saved.filter(id => branchIdSet.has(id));
    } catch { return []; }
  });
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'approved' | 'none' | 'for_verification'>(() => {
    const s = localStorage.getItem('rem_filter_status');
    return (s === 'ALL' || s === 'approved' || s === 'none' || s === 'for_verification') ? s : 'none';
  });
  const [levyOnly, setLevyOnly] = useState(() => localStorage.getItem('rem_filter_levy') === 'true');
  const [negativeOnly, setNegativeOnly] = useState(() => localStorage.getItem('rem_filter_negative') === 'true');
  const [lastWeekOnly, setLastWeekOnly] = useState(() => localStorage.getItem('rem_filter_last_week') === 'true');
  const [lastWeekSubmittedOnly, setLastWeekSubmittedOnly] = useState(() => localStorage.getItem('rem_filter_last_week_submitted') === 'true');
  const [includeTestBranches, setIncludeTestBranches] = useState(() => localStorage.getItem('rem_include_test') === 'true');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [flagsDropdownOpen, setFlagsDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const flagsDropdownRef = useRef<HTMLDivElement>(null);
  const [adjustments, setAdjustments] = useState<RemittanceAdjustment[]>([]);
  const [submissions, setSubmissions] = useState<RemittanceSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReviewing, setIsReviewing] = useState(false);
  const [remitConfirm, setRemitConfirm] = useState<{ submissionId: string | null; branchId: string; periodLabel: string; branchName: string } | null>(null);
  const [unmarkConfirm, setUnmarkConfirm] = useState<{ submissionId: string; branchName: string; periodLabel: string; hasVaultAdj: boolean } | null>(null);
  const [markAllConfirm, setMarkAllConfirm] = useState(false);
  const [openGrossBreakdown, setOpenGrossBreakdown] = useState<string | null>(null);
  const [adjFormKey, setAdjFormKey] = useState<string | null>(null);
  const [adjFormMode, setAdjFormMode] = useState<'add' | 'deduct' | 'transfer'>('add');
  const [adjForm, setAdjForm] = useState({ description: '', amount: '' });
  const [isSavingAdj, setIsSavingAdj] = useState(false);
  const [adjTargetOwner, setAdjTargetOwner] = useState<string>('');
  const [adjTransferFrom, setAdjTransferFrom] = useState('');
  const [adjTransferTo, setAdjTransferTo] = useState('');
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [tableSortKey, setTableSortKey] = useState<'branch' | 'gross' | 'salary' | 'expenses' | 'roi' | 'pending'>('branch');
  const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('asc');
  const [mainView, setMainView] = useState<'remittances' | 'deductions'>('remittances');
  const [deductionSearch, setDeductionSearch] = useState('');
  const [deductionBranchFilter, setDeductionBranchFilter] = useState('');
  const [deductionOwnerFilter, setDeductionOwnerFilter] = useState('');
  const [deductionAddedByFilter, setDeductionAddedByFilter] = useState('');
  const [deductionDateFrom, setDeductionDateFrom] = useState('');
  const [deductionDateTo, setDeductionDateTo] = useState('');

  // Vault deposit state
  const [vaultRows, setVaultRows] = useState<Record<string, { balance: number; target: number }>>({});
  const [savingDepositKey, setSavingDepositKey] = useState<string | null>(null);
  const [isVaultDeposit, setIsVaultDeposit] = useState(false);

  // Fetch vault balances for deposit button
  useEffect(() => {
    if (!supabase) return;
    supabase
      .from(DB_TABLES.BRANCH_VAULTS)
      .select(`${DB_COLUMNS.BRANCH_ID}, ${DB_COLUMNS.VAULT_BALANCE}, ${DB_COLUMNS.VAULT_TARGET}`)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, { balance: number; target: number }> = {};
        data.forEach((r: any) => { map[r[DB_COLUMNS.BRANCH_ID]] = { balance: Number(r[DB_COLUMNS.VAULT_BALANCE] ?? 0), target: Number(r[DB_COLUMNS.VAULT_TARGET] ?? 0) }; });
        setVaultRows(map);
      });
  }, []);


  const mapSubmission = (r: any): RemittanceSubmission => ({
    id: r.id, branchId: r.branch_id, periodLabel: r.period_label,
    status: r.status, reviewNote: r.review_note, submittedAt: r.submitted_at,
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (periodDropdownRef.current && !periodDropdownRef.current.contains(e.target as Node)) {
        setPeriodDropdownOpen(false);
      }
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(e.target as Node)) {
        setBranchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    Promise.all([
      supabase
        .from(DB_TABLES.REMITTANCE_ADJUSTMENTS)
        .select('*')
        .order(DB_COLUMNS.CREATED_AT, { ascending: true }),
      supabase
        .from(DB_TABLES.REMITTANCE_SUBMISSIONS)
        .select('*')
        .order(DB_COLUMNS.SUBMITTED_AT, { ascending: false })
    ]).then(([adjResult, subResult]) => {
      if (adjResult.data) setAdjustments(adjResult.data.map(r => ({
        id: r.id, branchId: r.branch_id, periodLabel: r.period_label,
        description: r.description, amount: Number(r.amount),
        targetOwner: r.target_owner || null,
        addedBy: r.added_by || null,
        createdAt: r.created_at
      })));
      if (subResult.data) setSubmissions(subResult.data.map(mapSubmission));
      setIsLoading(false);
    }).catch(() => setIsLoading(false));

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

  // Persist filters across tab changes
  useEffect(() => { localStorage.setItem('rem_filter_periods', JSON.stringify(selectedPeriods)); }, [selectedPeriods]);
  useEffect(() => { localStorage.setItem('rem_filter_branches', JSON.stringify(selectedBranchIds)); }, [selectedBranchIds]);
  useEffect(() => { localStorage.setItem('rem_filter_status', statusFilter); }, [statusFilter]);
  useEffect(() => { localStorage.setItem('rem_filter_levy', String(levyOnly)); }, [levyOnly]);
  useEffect(() => { localStorage.setItem('rem_filter_negative', String(negativeOnly)); }, [negativeOnly]);
  useEffect(() => { localStorage.setItem('rem_filter_last_week', String(lastWeekOnly)); }, [lastWeekOnly]);
  useEffect(() => { localStorage.setItem('rem_filter_last_week_submitted', String(lastWeekSubmittedOnly)); }, [lastWeekSubmittedOnly]);
  useEffect(() => { localStorage.setItem('rem_include_test', String(includeTestBranches)); }, [includeTestBranches]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) setStatusDropdownOpen(false);
      if (flagsDropdownRef.current && !flagsDropdownRef.current.contains(e.target as Node)) setFlagsDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleReview = async (submissionId: string | null, branchId: string, periodLabel: string, status: 'approved' | 'rejected' | 'for_verification', note?: string) => {
    setIsReviewing(true);
    try {
      const now = getTrueISOString();
      if (submissionId) {
        const { error } = await supabase
          .from(DB_TABLES.REMITTANCE_SUBMISSIONS)
          .update({ status, review_note: note || null, reviewed_at: now })
          .eq(DB_COLUMNS.ID, submissionId);
        if (error) throw error;
        setSubmissions(prev => prev.map(s =>
          s.id === submissionId ? { ...s, status, reviewNote: note || null } : s
        ));
      } else {
        const { data, error } = await supabase
          .from(DB_TABLES.REMITTANCE_SUBMISSIONS)
          .insert({ branch_id: branchId, period_label: periodLabel, status, review_note: note || null, submitted_at: now, reviewed_at: now })
          .select().single();
        if (error) throw error;
        setSubmissions(prev => [mapSubmission(data), ...prev]);
      }
      playSound('success');
    } catch (err) {
      console.error(err);
      playSound('warning');
    } finally {
      setIsReviewing(false);
    }
  };

  const handleUnmarkRemitted = async (submissionId: string) => {
    setIsReviewing(true);
    try {
      const { error } = await supabase
        .from(DB_TABLES.REMITTANCE_SUBMISSIONS)
        .update({ status: 'submitted', reviewed_at: null })
        .eq(DB_COLUMNS.ID, submissionId);
      if (error) throw error;
      setSubmissions(prev => prev.map(s => s.id === submissionId ? { ...s, status: 'submitted', reviewNote: null } : s));
      playSound('success');
    } catch (err) {
      console.error(err);
      playSound('warning');
    } finally {
      setIsReviewing(false);
      setUnmarkConfirm(null);
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

  const handleTransferAdjustment = async (branchId: string, periodLabel: string) => {
    const raw = parseFloat(adjForm.amount);
    if (!adjTransferFrom || !adjTransferTo || adjTransferFrom === adjTransferTo) return;
    if (!adjForm.description.trim() || isNaN(raw) || raw <= 0) return;
    setIsSavingAdj(true);
    try {
      const reason = adjForm.description.trim().toUpperCase();
      const [{ data: d1, error: e1 }, { data: d2, error: e2 }] = await Promise.all([
        supabase.from(DB_TABLES.REMITTANCE_ADJUSTMENTS)
          .insert({ branch_id: branchId, period_label: periodLabel, description: `${reason} → ${adjTransferTo}`, amount: -raw, target_owner: adjTransferFrom, added_by: addedBy || null })
          .select().single(),
        supabase.from(DB_TABLES.REMITTANCE_ADJUSTMENTS)
          .insert({ branch_id: branchId, period_label: periodLabel, description: `${reason} ← ${adjTransferFrom}`, amount: raw, target_owner: adjTransferTo, added_by: addedBy || null })
          .select().single(),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      setAdjustments(prev => [
        ...prev,
        { id: d1.id, branchId: d1.branch_id, periodLabel: d1.period_label, description: d1.description, amount: Number(d1.amount), targetOwner: adjTransferFrom, addedBy: addedBy || null, createdAt: d1.created_at },
        { id: d2.id, branchId: d2.branch_id, periodLabel: d2.period_label, description: d2.description, amount: Number(d2.amount), targetOwner: adjTransferTo, addedBy: addedBy || null, createdAt: d2.created_at },
      ]);
      setAdjForm({ description: '', amount: '' });
      setAdjTransferFrom('');
      setAdjTransferTo('');
      setAdjFormKey(null);
      playSound('success');
    } catch (err) {
      console.error(err);
      playSound('warning');
    } finally {
      setIsSavingAdj(false);
    }
  };

  const handleMarkAllRemitted = async () => {
    setMarkAllConfirm(false);
    setIsReviewing(true);
    try {
      const now = getTrueISOString();
      for (const { report, group, sub } of quickProcessItems) {
        if (sub?.id) {
          await supabase.from(DB_TABLES.REMITTANCE_SUBMISSIONS)
            .update({ status: 'approved', reviewed_at: now })
            .eq(DB_COLUMNS.ID, sub.id);
          setSubmissions(prev => prev.map(s => s.id === sub.id ? { ...s, status: 'approved' } : s));
        } else {
          const { data } = await supabase.from(DB_TABLES.REMITTANCE_SUBMISSIONS)
            .insert({ branch_id: report.branchId, period_label: group.label, status: 'approved', submitted_at: now, reviewed_at: now })
            .select().single();
          if (data) setSubmissions(prev => [mapSubmission(data), ...prev]);
        }
      }
      playSound('success');
    } catch (err) {
      console.error(err);
      playSound('warning');
    } finally {
      setIsReviewing(false);
    }
  };

  const handleAddAdjustment = async (branchId: string, periodLabel: string, adjustedRoi: number) => {
    const raw = parseFloat(adjForm.amount);
    if (!adjForm.description.trim() || isNaN(raw) || raw === 0) return;
    if (isVaultDeposit && Math.abs(raw) > adjustedRoi) { playSound('warning'); return; }
    const amt = adjFormMode === 'deduct' ? -Math.abs(raw) : Math.abs(raw);
    setIsSavingAdj(true);
    try {
      const targetOwnerVal = isVaultDeposit ? null : (adjTargetOwner || null);
      const { data, error } = await supabase
        .from(DB_TABLES.REMITTANCE_ADJUSTMENTS)
        .insert({
          branch_id: branchId,
          period_label: periodLabel,
          description: adjForm.description.trim().toUpperCase(),
          amount: amt,
          target_owner: targetOwnerVal,
          added_by: addedBy || null,
        })
        .select().single();
      if (error) throw error;
      setAdjustments(prev => [...prev, {
        id: data.id, branchId: data.branch_id, periodLabel: data.period_label,
        description: data.description, amount: Number(data.amount),
        targetOwner: data.target_owner || null,
        addedBy: data.added_by || null,
        createdAt: data.created_at,
      }]);

      // If this is a vault deposit, also write to vault_transactions + update vault_balance
      if (isVaultDeposit) {
        const depositAmt = Math.abs(raw);
        const vault = vaultRows[branchId];
        const liveBalance = vault?.balance ?? 0;
        const newBalance = liveBalance + depositAmt;
        const todayManilaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
        const timestamp = `${todayManilaDate}T23:59:30+08:00`;
        const txId = `vault_admin_deposit_${branchId}_${todayManilaDate}`;
        setSavingDepositKey(rKeyRef.current);
        await Promise.all([
          supabase.from(DB_TABLES.VAULT_TRANSACTIONS).upsert({
            [DB_COLUMNS.ID]: txId,
            [DB_COLUMNS.BRANCH_ID]: branchId,
            [DB_COLUMNS.TYPE]: 'ADMIN_DEPOSIT',
            [DB_COLUMNS.AMOUNT]: depositAmt,
            [DB_COLUMNS.NAME]: 'Vault Deposit via Remittances',
            [DB_COLUMNS.TIMESTAMP]: timestamp,
            [DB_COLUMNS.PERFORMED_BY]: addedBy ?? 'SUPERADMIN',
          }, { onConflict: DB_COLUMNS.ID }),
          supabase.from(DB_TABLES.BRANCH_VAULTS).upsert({
            [DB_COLUMNS.BRANCH_ID]: branchId,
            [DB_COLUMNS.VAULT_BALANCE]: newBalance,
          }, { onConflict: DB_COLUMNS.BRANCH_ID }),
        ]);
        setVaultRows(prev => ({ ...prev, [branchId]: { ...prev[branchId], balance: newBalance } }));
        setSavingDepositKey(null);
        onRefresh?.();
      }

      setAdjForm({ description: '', amount: '' });
      setAdjTargetOwner('');
      setIsVaultDeposit(false);
      setAdjFormKey(null);
      playSound('success');
    } catch (err) {
      console.error(err);
      playSound('warning');
    } finally {
      setIsSavingAdj(false);
    }
  };

  // Ref to track current rKey inside handleAddAdjustment closure
  const rKeyRef = React.useRef('');

  // Exclude test branches unless explicitly opted in
  const activeBranches = useMemo(() =>
    includeTestBranches ? branches : branches.filter(b => !/^test/i.test(b.name.trim())),
    [branches, includeTestBranches]
  );

  const allGroupedReports = useMemo(() => {
    const groups: Record<string, { label: string; weekEnd: Date; cutoffDay: number; branchAggregates: Record<string, any> }> = {};
    const now = getTrueDate();
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    salesReports.forEach(report => {
      const branch = activeBranches.find(b => b.id === report.branchId);
      if (!branch) return;
      const date = parseDate(report.reportDate);
      const { label, weekStart, weekEnd } = getWeekRange(date, branch);
      const weekStartDate = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
      if (weekStartDate > todayDate) return;
      const key = weekStart.getTime().toString();

      const cutoffDay = weekEnd.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
      if (!groups[key]) groups[key] = { label, weekEnd, cutoffDay, branchAggregates: {} };
      if (weekEnd > groups[key].weekEnd) groups[key].weekEnd = weekEnd;

      if (!groups[key].branchAggregates[report.branchId]) {
        groups[key].branchAggregates[report.branchId] = {
          branchId: report.branchId, branchName: branch.name, owners: branch.owners || [],
          groupLevy: branch.groupLevy || null,
          grossSales: 0, totalStaffPay: 0, totalExpenses: 0, totalVaultProvision: 0, netRoi: 0,
          reportIds: [],
          dailyReports: [] as { reportDate: string; grossSales: number }[],
          branchLabel: label,
        };
      }

      const agg = groups[key].branchAggregates[report.branchId];
      agg.grossSales          += report.grossSales || 0;
      agg.totalStaffPay       += report.totalStaffPay || 0;
      agg.totalExpenses       += report.totalExpenses || 0;
      agg.totalVaultProvision += report.totalVaultProvision || 0;
      agg.netRoi              += report.netRoi || 0;
      agg.reportIds.push(report.id);
      agg.dailyReports.push({ reportDate: report.reportDate, grossSales: report.grossSales || 0 });
    });

    return Object.keys(groups)
      .sort((a, b) => Number(b) - Number(a))
      .map(key => ({
        label: groups[key].label,
        weekEnd: groups[key].weekEnd,
        cutoffDay: groups[key].cutoffDay,
        reports: Object.values(groups[key].branchAggregates)
          .sort((a: any, b: any) => a.branchName.localeCompare(b.branchName))
      }));
  }, [salesReports, branches]);

  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const cutoffTabs = useMemo(() => {
    const dayMap: Record<number, Set<string>> = {};
    activeBranches.forEach(b => {
      const cutoff = Number(b.weeklyCutoff ?? 0);
      if (!dayMap[cutoff]) dayMap[cutoff] = new Set();
      dayMap[cutoff].add(b.id);
    });
    return Object.entries(dayMap)
      .map(([day, ids]) => ({ day: Number(day), label: DAYS[Number(day)], count: ids.size }))
      .sort((a, b) => b.count - a.count);
  }, [branches]);

  // Pre-build submission lookup to avoid O(n²) scans
  const subLookup = useMemo(() => {
    const map: Record<string, RemittanceSubmission> = {};
    submissions.forEach(s => { map[`${s.branchId}::${s.periodLabel}`] = s; });
    return map;
  }, [submissions]);

  // Branches whose most-recent completed period has no approved submission
  const lastWeekUnremittedIds = useMemo(() => {
    const now = getTrueDate();
    const ids = new Set<string>();
    activeBranches.forEach(branch => {
      // allGroupedReports is sorted most-recent first
      for (const group of allGroupedReports) {
        const hasReport = group.reports.some((r: any) => r.branchId === branch.id);
        if (!hasReport) continue;
        if (group.weekEnd >= now) continue; // skip current / future
        const sub = subLookup[`${branch.id}::${group.label}`];
        if (!sub || sub.status !== 'approved') ids.add(branch.id);
        break; // only the first (most-recent) completed period matters
      }
    });
    return ids;
  }, [allGroupedReports, subLookup, branches]);

  // Branches whose most-recent completed period has been remitted (approved)
  const lastWeekSubmittedIds = useMemo(() => {
    const now = getTrueDate();
    const ids = new Set<string>();
    activeBranches.forEach(branch => {
      for (const group of allGroupedReports) {
        const hasReport = group.reports.some((r: any) => r.branchId === branch.id);
        if (!hasReport) continue;
        if (group.weekEnd >= now) continue;
        const sub = subLookup[`${branch.id}::${group.label}`];
        if (sub?.status === 'approved') ids.add(branch.id);
        break;
      }
    });
    return ids;
  }, [allGroupedReports, subLookup, branches]);

  // Branch summary for the branch list view — respects cutoff filter
  const branchSummaries = useMemo(() => {
    const selectedCutoffs = selectedPeriods.map(Number);
    const map: Record<string, { branchId: string; branchName: string; cutoffDay: number; totalPeriods: number; pending: number; approved: number; rejected: number; totalRoi: number; grossSales: number; totalStaffPay: number; totalExpenses: number; latestPeriodRoi: number; latestPeriodLabel: string; latestGrossSales: number; latestStaffPay: number; latestExpenses: number }> = {};
    // allGroupedReports is sorted most-recent first — first encounter per branch = latest period
    const latestSeen = new Set<string>();
    allGroupedReports.forEach(group => {
      group.reports.forEach((r: any) => {
        const branchObj = activeBranches.find(b => b.id === r.branchId);
        const branchCutoff = Number(branchObj?.weeklyCutoff ?? 0);
        if (selectedCutoffs.length > 0 && !selectedCutoffs.includes(branchCutoff)) return;
        if (!map[r.branchId]) {
          map[r.branchId] = { branchId: r.branchId, branchName: r.branchName, cutoffDay: branchCutoff, totalPeriods: 0, pending: 0, approved: 0, rejected: 0, totalRoi: 0, grossSales: 0, totalStaffPay: 0, totalExpenses: 0, latestPeriodRoi: 0, latestPeriodLabel: '', latestGrossSales: 0, latestStaffPay: 0, latestExpenses: 0 };
        }
        map[r.branchId].totalPeriods += 1;
        map[r.branchId].totalRoi += r.netRoi || 0;
        map[r.branchId].grossSales += r.grossSales || 0;
        map[r.branchId].totalStaffPay += r.totalStaffPay || 0;
        map[r.branchId].totalExpenses += r.totalExpenses || 0;
        const sub = subLookup[`${r.branchId}::${group.label}`];
        if (sub?.status === 'approved') map[r.branchId].approved += 1;
        else if (sub?.status === 'rejected') map[r.branchId].rejected += 1;
        else map[r.branchId].pending += 1;
        if (!latestSeen.has(r.branchId)) {
          latestSeen.add(r.branchId);
          map[r.branchId].latestPeriodRoi = r.netRoi || 0;
          map[r.branchId].latestPeriodLabel = group.label;
          map[r.branchId].latestGrossSales = r.grossSales || 0;
          map[r.branchId].latestStaffPay = r.totalStaffPay || 0;
          map[r.branchId].latestExpenses = r.totalExpenses || 0;
        }
      });
    });
    return Object.values(map).sort((a, b) => a.branchName.localeCompare(b.branchName));
  }, [allGroupedReports, subLookup, selectedPeriods, branches]);

  // Effective branch filter: use activeBranchId when in detail view, otherwise use manual selection
  const effectiveBranchIds = activeBranchId ? [activeBranchId] : selectedBranchIds;

  const displayGroups = useMemo(() => {
    const selectedCutoffDays = selectedPeriods.map(Number);
    // Cutoff filter only applies on the branch list view — detail view must show all periods for the branch
    let groups = (selectedCutoffDays.length === 0 || activeBranchId) ? allGroupedReports : allGroupedReports.filter(g => selectedCutoffDays.includes(g.cutoffDay));
    if (effectiveBranchIds.length > 0) {
      groups = groups.map(g => ({
        ...g,
        reports: g.reports.filter((r: any) => effectiveBranchIds.includes(r.branchId))
      })).filter(g => g.reports.length > 0);
    }
    if (statusFilter !== 'ALL' && !activeBranchId) {
      groups = groups.map(g => ({
        ...g,
        reports: g.reports.filter((r: any) => {
          const sub = subLookup[`${r.branchId}::${g.label}`];
          const status = sub?.status ?? null;
          if (statusFilter === 'none') return status === null || status === 'submitted' || status === 'validated';
          if (statusFilter === 'for_verification') return status === 'for_verification';
          return status === statusFilter;
        })
      })).filter(g => g.reports.length > 0);
    }
    if (levyOnly) {
      groups = groups.map(g => ({
        ...g,
        reports: g.reports.filter((r: any) => !!r.groupLevy),
      })).filter(g => g.reports.length > 0);
    }
    if (negativeOnly) {
      groups = groups.map(g => ({
        ...g,
        reports: g.reports.filter((r: any) => {
          const rowAdj = adjustments.filter(a => a.branchId === r.branchId && a.periodLabel === g.label);
          const totalGlobalAdj = rowAdj.filter(a => !a.targetOwner || a.description === 'VAULT DEPOSIT').reduce((s, a) => s + a.amount, 0);
          return (r.netRoi + totalGlobalAdj) < 0;
        }),
      })).filter(g => g.reports.length > 0);
    }
    if (branchSearch.trim()) {
      const q = branchSearch.trim().toLowerCase();
      groups = groups.map(g => ({
        ...g,
        reports: g.reports.filter((r: any) => {
          if (r.branchName.toLowerCase().includes(q)) return true;
          if (g.label.toLowerCase().includes(q)) return true;
          if ((r.owners || []).some((o: any) => o.name.toLowerCase().includes(q))) return true;
          const sub = subLookup[`${r.branchId}::${g.label}`];
          const statusStr = sub?.status === 'approved' ? 'remitted' : sub?.status === 'rejected' ? 'rejected' : sub?.status === 'submitted' ? 'submitted' : 'pending';
          return statusStr.includes(q);
        })
      })).filter(g => g.reports.length > 0);
    }
    const applyLastWeekFilter = (ids: Set<string>) => {
      const now = getTrueDate();
      const seenBranches = new Set<string>();
      const filteredGroups: typeof groups = [];
      for (const group of groups) {
        if (group.weekEnd >= now) continue;
        const matchingReports = group.reports.filter((r: any) => {
          if (!ids.has(r.branchId)) return false;
          if (seenBranches.has(r.branchId)) return false;
          seenBranches.add(r.branchId);
          return true;
        });
        if (matchingReports.length > 0) filteredGroups.push({ ...group, reports: matchingReports });
        if (seenBranches.size === ids.size) break;
      }
      return filteredGroups;
    };
    if (lastWeekOnly && !activeBranchId) return applyLastWeekFilter(lastWeekUnremittedIds);
    if (lastWeekSubmittedOnly && !activeBranchId) return applyLastWeekFilter(lastWeekSubmittedIds);
    return groups;
  }, [allGroupedReports, selectedPeriods, effectiveBranchIds, statusFilter, submissions, branchSearch, levyOnly, negativeOnly, adjustments, activeBranchId, lastWeekOnly, lastWeekUnremittedIds, lastWeekSubmittedOnly, lastWeekSubmittedIds]);

  // Pending branches for the quick-process strip (respects period + branch filter, ignores status filter)
  const quickProcessItems = useMemo(() => {
    const selectedCutoffDays2 = selectedPeriods.map(Number);
    let groups = selectedCutoffDays2.length === 0 ? allGroupedReports : allGroupedReports.filter(g => selectedCutoffDays2.includes(g.cutoffDay));
    if (effectiveBranchIds.length > 0) {
      groups = groups.map(g => ({ ...g, reports: g.reports.filter((r: any) => effectiveBranchIds.includes(r.branchId)) })).filter(g => g.reports.length > 0);
    }
    const items: { report: any; group: any; sub: RemittanceSubmission | undefined; adjustedRoi: number }[] = [];
    groups.forEach(group => {
      group.reports.forEach((report: any) => {
        const sub = subLookup[`${report.branchId}::${group.label}`];
        if (sub?.status === 'approved' || sub?.status === 'rejected') return;
        const rowAdj = adjustments.filter(a => a.branchId === report.branchId && a.periodLabel === group.label);
        const totalGlobalAdj = rowAdj.filter(a => !a.targetOwner || a.description === 'VAULT DEPOSIT').reduce((s, a) => s + a.amount, 0);
        items.push({ report, group, sub, adjustedRoi: report.netRoi + totalGlobalAdj });
      });
    });
    return items;
  }, [allGroupedReports, selectedPeriods, effectiveBranchIds, subLookup, adjustments]);

  const handleExportPDF = () => {
    playSound('click');
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      const p = (n: number) => `₱${n.toLocaleString()}`;

      // Document header
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42);
      doc.text('WEEKLY REMITTANCES REPORT', 14, 20);
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text('Owner Distribution & Remittance Summary', 14, 27);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`Generated: ${dateStr}`, pageWidth - 14, 20, { align: 'right' });

      // Consolidated accumulators
      let totalGross = 0, totalSalary = 0, totalExpenses = 0, totalVault = 0, totalNet = 0, totalAdjRoi = 0;

      let currentY = 35;

      displayGroups.forEach((group, gIdx) => {
        if (gIdx > 0) currentY = (doc as any).lastAutoTable.finalY + 12;

        // Period section label
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(group.label.toUpperCase(), 14, currentY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(`${group.reports.length} branch${group.reports.length !== 1 ? 'es' : ''}`, 14 + doc.getTextWidth(group.label.toUpperCase()) + 4, currentY);

        // Collect unique owner names for this period
        const ownerNames: string[] = [];
        group.reports.forEach((report: any) => {
          report.owners?.forEach((o: any) => {
            if (!ownerNames.includes(o.name)) ownerNames.push(o.name);
          });
        });

        const hasLevy = group.reports.some((r: any) => r.groupLevy);
        const head = [
          'Branch', 'Gross', 'Salary', 'Expenses', 'Vault', 'Net ROI', 'Adj.', 'Adj. ROI',
          ...(hasLevy ? ['Levy'] : []),
          ...ownerNames,
          'Status'
        ];
        const statusColIdx = head.length - 1;

        const body = group.reports.map((report: any) => {
          const rowAdj = adjustments.filter(a => a.branchId === report.branchId && a.periodLabel === group.label);
          const globalAdj = rowAdj.filter(a => !a.targetOwner).reduce((s, a) => s + a.amount, 0);
          const ownerAdj = rowAdj.filter(a => !!a.targetOwner && a.description !== 'VAULT DEPOSIT');
          const adjustedRoi = report.netRoi + globalAdj;
          const levy = report.groupLevy as { name: string; percentage: number } | null;
          const levyCut = levy ? adjustedRoi * (levy.percentage / 100) : 0;
          const distributableRoi = adjustedRoi - levyCut;
          const sub = subLookup[`${report.branchId}::${group.label}`];
          const status = sub?.status === 'approved' ? 'REMITTED' : sub?.status === 'rejected' ? 'REJECTED' : sub?.status === 'submitted' ? 'SUBMITTED' : 'PENDING';

          totalGross    += report.grossSales;
          totalSalary   += report.totalStaffPay;
          totalExpenses += report.totalExpenses;
          totalVault    += report.totalVaultProvision;
          totalNet      += report.netRoi;
          totalAdjRoi   += adjustedRoi;

          return [
            report.branchName.replace('BRANCH - ', ''),
            p(report.grossSales), p(report.totalStaffPay), p(report.totalExpenses), p(report.totalVaultProvision),
            p(report.netRoi), globalAdj !== 0 ? p(globalAdj) : '—', p(adjustedRoi),
            ...(hasLevy ? [levy ? p(-levyCut) : '—'] : []),
            ...ownerNames.map(name => {
              const owner = report.owners?.find((o: any) => o.name === name);
              if (!owner) return '—';
              const ot = ownerAdj.filter(a => a.targetOwner === name).reduce((s, a) => s + a.amount, 0);
              return p(distributableRoi * (owner.percentage / 100) + ot);
            }),
            status
          ];
        });

        // Build column styles dynamically
        const colStyles: Record<number, any> = {
          0: { fontStyle: 'bold', cellWidth: 36 },
          1: { halign: 'right' }, 2: { halign: 'right' },
          3: { halign: 'right' }, 4: { halign: 'right' },
          5: { halign: 'right' }, 6: { halign: 'right' },
          7: { halign: 'right', fontStyle: 'bold' },
        };
        let ci = 8;
        if (hasLevy) { colStyles[ci] = { halign: 'right' }; ci++; }
        ownerNames.forEach((_, i) => { colStyles[ci + i] = { halign: 'right' }; });
        colStyles[statusColIdx] = { halign: 'center', fontStyle: 'bold' };

        autoTable(doc, {
          startY: currentY + 4,
          head: [head],
          body,
          theme: 'grid',
          styles: { fontSize: 8, cellPadding: 3, font: 'helvetica', valign: 'middle' },
          headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
          columnStyles: colStyles,
          didParseCell: (data: any) => {
            if (data.section === 'body' && data.column.index === statusColIdx) {
              const val = data.cell.raw;
              if (val === 'REMITTED')  data.cell.styles.textColor = [5, 150, 105];
              else if (val === 'REJECTED')  data.cell.styles.textColor = [220, 38, 38];
              else if (val === 'SUBMITTED') data.cell.styles.textColor = [99, 102, 241];
              else                          data.cell.styles.textColor = [100, 116, 139];
            }
          }
        });
      });

      // Consolidated totals summary
      const finalY = (doc as any).lastAutoTable.finalY + 12;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('CONSOLIDATED TOTALS:', 14, finalY);
      doc.setFont('helvetica', 'normal');

      autoTable(doc, {
        body: [
          ['Total Gross Sales',      p(totalGross)],
          ['Total Salary',           p(totalSalary)],
          ['Total Expenses',         p(totalExpenses)],
          ['Total Vault Provision',  p(totalVault)],
          ['Total Net ROI',          p(totalNet)],
          ['Total Adjusted ROI',     p(totalAdjRoi)],
        ],
        startY: finalY + 5,
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 2 },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 50 },
          1: { halign: 'left', fontStyle: 'bold' }
        }
      });

      doc.save(`Weekly_Remittances_${getManilaTodayStr()}.pdf`);
      playSound('success');
    } catch (err) {
      console.error('PDF export failed:', err);
      playSound('warning');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-in fade-in duration-300">
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-200/60 rounded-2xl animate-pulse shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-slate-200/60 rounded-lg animate-pulse w-1/3" />
            <div className="h-3 bg-slate-200/60 rounded-lg animate-pulse w-1/2" />
          </div>
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-4 bg-slate-200/60 rounded-lg animate-pulse w-1/3" />
              <div className="h-7 bg-slate-200/60 rounded-xl animate-pulse w-20" />
            </div>
            <div className="h-3 bg-slate-200/60 rounded-lg animate-pulse w-1/2" />
            <div className="h-3 bg-slate-200/60 rounded-lg animate-pulse w-1/4" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={activeBranchId ? 'space-y-3' : 'space-y-3'}>

      {/* ── Single Remit Confirmation Modal ── */}
      {remitConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setRemitConfirm(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl animate-in zoom-in-95 duration-200 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-7 pt-7 pb-5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center mb-4">
                <CheckCircle className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight leading-tight mb-1">Confirm Remittance</h3>
              <p className="text-sm text-slate-600">
                Mark <span className="font-black text-slate-900">{remitConfirm.branchName.replace('BRANCH - ', '')}</span> as remitted for period <span className="font-black text-slate-900">{remitConfirm.periodLabel}</span>?
              </p>
              <p className="text-xs text-slate-400 mt-2">This will record the remittance as approved. You can still reject it afterward if needed.</p>
            </div>
            <div className="px-7 pb-7 flex gap-3 justify-end">
              <button onClick={() => setRemitConfirm(null)} className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-900 transition-all">
                Cancel
              </button>
              <button
                onClick={() => { handleReview(remitConfirm.submissionId, remitConfirm.branchId, remitConfirm.periodLabel, 'approved'); setRemitConfirm(null); }}
                disabled={isReviewing}
                className="px-7 py-3 bg-emerald-600 text-white rounded-2xl text-xs font-semibold uppercase tracking-wide hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> Confirm Remitted
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Unmark Remitted Confirmation Modal ── */}
      {unmarkConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setUnmarkConfirm(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl animate-in zoom-in-95 duration-200 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-7 pt-7 pb-5">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center mb-4">
                <XCircle className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight leading-tight mb-1">Unmark Remitted</h3>
              <p className="text-sm text-slate-600 mb-2">
                Remove the remitted status for <span className="font-black text-slate-900">{unmarkConfirm.branchName.replace('BRANCH - ', '')}</span> — period <span className="font-black text-slate-900">{unmarkConfirm.periodLabel}</span>?
              </p>
              {unmarkConfirm.hasVaultAdj && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs text-amber-800 leading-relaxed">
                  <span className="font-black block mb-0.5">⚠ Vault Deposit Attached</span>
                  This period has a vault deposit adjustment. Unmarking will NOT reverse the vault transaction — you must handle that manually if needed.
                </div>
              )}
              {!unmarkConfirm.hasVaultAdj && (
                <p className="text-xs text-slate-400">The status will revert to submitted. Adjustments will be preserved.</p>
              )}
            </div>
            <div className="px-7 pb-7 flex gap-3 justify-end">
              <button onClick={() => setUnmarkConfirm(null)} className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-900 transition-all">
                Cancel
              </button>
              <button
                onClick={() => handleUnmarkRemitted(unmarkConfirm.submissionId)}
                disabled={isReviewing}
                className="px-7 py-3 bg-amber-500 text-white rounded-2xl text-xs font-semibold uppercase tracking-wide hover:bg-amber-600 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
              >
                <XCircle className="w-4 h-4" /> Unmark Remitted
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Mark All Confirmation Modal ── */}
      {markAllConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setMarkAllConfirm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl animate-in zoom-in-95 duration-200 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-7 pt-7 pb-5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center mb-4">
                <CheckCircle className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight leading-tight mb-1">Mark All Remitted</h3>
              <p className="text-sm text-slate-600">
                This will mark all <span className="font-black text-slate-900">{quickProcessItems.length} pending branch{quickProcessItems.length !== 1 ? 'es' : ''}</span> as remitted for the selected period.
              </p>
              <p className="text-xs text-slate-400 mt-2">This action applies to all branches currently visible in the pending list.</p>
            </div>
            <div className="px-7 pb-7 flex gap-3 justify-end">
              <button onClick={() => setMarkAllConfirm(false)} className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-900 transition-all">
                Cancel
              </button>
              <button
                onClick={handleMarkAllRemitted}
                disabled={isReviewing}
                className="px-7 py-3 bg-emerald-600 text-white rounded-2xl text-xs font-semibold uppercase tracking-wide hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> Confirm All
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Header ── */}
      <div className="bg-white px-5 py-4 rounded-2xl border border-slate-200 shadow-sm">
        {/* Title row */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight leading-none">Weekly Remittances</h3>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-0.5">Owner Distributions & Validation</p>
          </div>
          {!activeBranchId && (
            <button
              onClick={handleExportPDF}
              className="hidden lg:flex items-center gap-2 px-4 h-8 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-700 transition-all active:scale-95 shrink-0"
            >
              <FileDown className="w-3.5 h-3.5" />
              Export
            </button>
          )}
        </div>

        {/* View toggle — hidden (deductions tab removed) */}
        {false && !activeBranchId && (
          <div className="flex w-full lg:w-fit bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner mt-3">
            {(['remittances', 'deductions'] as const).map(v => (
              <button
                key={v}
                onClick={() => { setMainView(v); playSound('click'); }}
                className={`flex-1 lg:flex-none lg:px-6 py-2 rounded-xl text-xs font-semibold uppercase tracking-wide transition-all ${mainView === v ? 'bg-white text-slate-900 shadow-md border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {v === 'remittances' ? 'Remittances' : 'Deductions'}
              </button>
            ))}
          </div>
        )}

      </div>

      {/* ── Deductions View ── */}
      {!activeBranchId && mainView === 'deductions' && (() => {
        const allDeductions = adjustments
          .filter(a => a.amount < 0)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        // Derive unique options for dropdowns
        const uniqueOwners = Array.from(new Set(allDeductions.map(a => a.targetOwner?.trim().toUpperCase()).filter(Boolean) as string[])).sort();
        const uniqueAddedBy = Array.from(new Set(allDeductions.map(a => a.addedBy?.trim().toLowerCase()).filter(Boolean) as string[])).sort();

        const activeFilterCount = [deductionSearch, deductionBranchFilter, deductionOwnerFilter, deductionAddedByFilter, deductionDateFrom, deductionDateTo].filter(Boolean).length;

        const filtered = allDeductions.filter(a => {
          const branch = branches.find(b => b.id === a.branchId);
          const name = (branch?.name || a.branchId).toLowerCase();
          const desc = a.description.toLowerCase();
          const owner = (a.targetOwner || '').toLowerCase();
          if (deductionSearch.trim() && !desc.includes(deductionSearch.toLowerCase())) return false;
          if (deductionBranchFilter && a.branchId !== deductionBranchFilter) return false;
          if (deductionOwnerFilter && (a.targetOwner?.trim().toUpperCase() || '') !== deductionOwnerFilter) return false;
          if (deductionAddedByFilter && (a.addedBy?.trim().toLowerCase() || '') !== deductionAddedByFilter) return false;
          if (deductionDateFrom) {
            const created = a.createdAt.slice(0, 10);
            if (created < deductionDateFrom) return false;
          }
          if (deductionDateTo) {
            const created = a.createdAt.slice(0, 10);
            if (created > deductionDateTo) return false;
          }
          return true;
        });

        const totalDeducted = filtered.reduce((s, a) => s + a.amount, 0);

        const clearAllFilters = () => {
          setDeductionSearch('');
          setDeductionBranchFilter('');
          setDeductionOwnerFilter('');
          setDeductionAddedByFilter('');
          setDeductionDateFrom('');
          setDeductionDateTo('');
        };

        return (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Filters panel */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Filters</p>
                {activeFilterCount > 0 && (
                  <button onClick={clearAllFilters} className="text-xs font-black text-rose-400 uppercase tracking-widest hover:text-rose-600 transition-colors">
                    Clear all ({activeFilterCount})
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                {/* Description */}
                <div className="space-y-1">
                  <p className="text-xs font-black text-slate-300 uppercase tracking-widest ml-1">Description</p>
                  <input
                    type="text"
                    value={deductionSearch}
                    onChange={e => setDeductionSearch(e.target.value)}
                    placeholder="Type to search..."
                    className={`w-full px-3.5 py-2.5 border rounded-xl text-xs font-medium uppercase tracking-wide outline-none focus:border-slate-400 transition-all ${deductionSearch ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-500 focus:bg-white'}`}
                  />
                </div>
                {/* Branch */}
                <div className="space-y-1">
                  <p className="text-xs font-black text-slate-300 uppercase tracking-widest ml-1">Branch</p>
                  <select
                    value={deductionBranchFilter}
                    onChange={e => setDeductionBranchFilter(e.target.value)}
                    className={`w-full px-3.5 py-2.5 border rounded-xl text-xs font-medium uppercase tracking-wide outline-none focus:border-slate-400 transition-all ${deductionBranchFilter ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                  >
                    <option value="">All Branches</option>
                    {branches.filter(b => allDeductions.some(a => a.branchId === b.id)).map(b => (
                      <option key={b.id} value={b.id}>{b.name.replace('BRANCH - ', '')}</option>
                    ))}
                  </select>
                </div>
                {/* Deducted From */}
                <div className="space-y-1">
                  <p className="text-xs font-black text-slate-300 uppercase tracking-widest ml-1">Deducted From</p>
                  <select
                    value={deductionOwnerFilter}
                    onChange={e => setDeductionOwnerFilter(e.target.value)}
                    className={`w-full px-3.5 py-2.5 border rounded-xl text-xs font-medium uppercase tracking-wide outline-none focus:border-slate-400 transition-all ${deductionOwnerFilter ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                  >
                    <option value="">All Owners</option>
                    {uniqueOwners.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                {/* Added By */}
                <div className="space-y-1">
                  <p className="text-xs font-black text-slate-300 uppercase tracking-widest ml-1">Added By</p>
                  <select
                    value={deductionAddedByFilter}
                    onChange={e => setDeductionAddedByFilter(e.target.value)}
                    className={`w-full px-3.5 py-2.5 border rounded-xl text-xs font-medium uppercase tracking-wide outline-none focus:border-slate-400 transition-all ${deductionAddedByFilter ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                  >
                    <option value="">All</option>
                    {uniqueAddedBy.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                {/* Date range */}
                <div className="space-y-1">
                  <p className="text-xs font-black text-slate-300 uppercase tracking-widest ml-1">Date Range</p>
                  <div className="flex gap-1.5">
                    <input
                      type="date"
                      value={deductionDateFrom}
                      onChange={e => setDeductionDateFrom(e.target.value)}
                      className={`w-full px-2.5 py-2.5 border rounded-xl text-xs font-bold outline-none focus:border-slate-400 transition-all ${deductionDateFrom ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                    />
                    <input
                      type="date"
                      value={deductionDateTo}
                      onChange={e => setDeductionDateTo(e.target.value)}
                      className={`w-full px-2.5 py-2.5 border rounded-xl text-xs font-bold outline-none focus:border-slate-400 transition-all ${deductionDateTo ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Summary stats */}
            <div className="flex items-center gap-3">
              <div className="bg-rose-50 border border-rose-100 rounded-2xl px-4 py-2.5">
                <p className="text-xs font-black text-rose-400 uppercase tracking-widest leading-none mb-0.5">Total Deducted</p>
                <p className="text-base font-black text-rose-600 tabular-nums">{fmt(Math.abs(totalDeducted))}</p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-2.5">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide leading-none mb-0.5">Entries</p>
                <p className="text-base font-black text-slate-700 tabular-nums">{filtered.length}</p>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center">
                <p className="text-xs font-black text-slate-300 uppercase tracking-widest">No deductions found</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Branch</th>
                        <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Period</th>
                        <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Description</th>
                        <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Deducted From</th>
                        <th className="px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filtered.map(adj => {
                        const branch = branches.find(b => b.id === adj.branchId);
                        return (
                          <tr key={adj.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="px-5 py-3">
                              <p className="text-xs font-black text-slate-800 uppercase tracking-tight leading-none">{branch?.name?.replace('BRANCH - ', '') || adj.branchId}</p>
                              <p className="text-xs font-bold text-slate-300 font-mono mt-0.5">{adj.branchId.toUpperCase()}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs font-black text-slate-600 uppercase tracking-tight">{adj.periodLabel}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs font-semibold text-slate-700 uppercase">{adj.description}</span>
                            </td>
                            <td className="px-4 py-3">
                              {adj.targetOwner
                                ? <span className="text-xs font-black text-slate-800 uppercase tracking-tight">{adj.targetOwner}</span>
                                : <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">All Owners</span>
                              }
                            </td>
                            <td className="px-5 py-3 text-right">
                              <span className="text-sm font-black text-rose-500 tabular-nums">{fmt(adj.amount)}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-slate-50">
                  {filtered.map(adj => {
                    const branch = branches.find(b => b.id === adj.branchId);
                    return (
                      <div key={adj.id} className="px-5 py-4 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-800 uppercase tracking-tight truncate">{branch?.name?.replace('BRANCH - ', '') || adj.branchId}</p>
                          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-0.5">{adj.periodLabel}</p>
                          <p className="text-xs font-semibold text-slate-500 uppercase mt-0.5">{adj.description}</p>
                          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-1">
                            From: <span className="text-slate-600">{adj.targetOwner || 'All Owners'}</span>
                          </p>
                        </div>
                        <span className="text-sm font-black text-rose-500 tabular-nums shrink-0">{fmt(adj.amount)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Branch List View ── */}
      {!activeBranchId && mainView === 'remittances' && (() => {
        const filtered = branchSummaries.filter(b => {
          if (effectiveBranchIds.length > 0 && !effectiveBranchIds.includes(b.branchId)) return false;
          if (branchSearch.trim() && !b.branchName.toLowerCase().includes(branchSearch.trim().toLowerCase())) return false;
          if (lastWeekOnly && !lastWeekUnremittedIds.has(b.branchId)) return false;
          if (lastWeekSubmittedOnly && !lastWeekSubmittedIds.has(b.branchId)) return false;
          return true;
        });
        const sorted = [...filtered].sort((a, b) => {
          const dir = tableSortDir === 'asc' ? 1 : -1;
          switch (tableSortKey) {
            case 'branch': return dir * a.branchName.localeCompare(b.branchName);
            case 'gross': return dir * (a.latestGrossSales - b.latestGrossSales);
            case 'salary': return dir * (a.latestStaffPay - b.latestStaffPay);
            case 'expenses': return dir * (a.latestExpenses - b.latestExpenses);
            case 'roi': return dir * (a.latestPeriodRoi - b.latestPeriodRoi);
            case 'pending': return dir * (a.pending - b.pending);
            default: return 0;
          }
        });
        const toggleSort = (key: typeof tableSortKey) => {
          if (tableSortKey === key) setTableSortDir(d => d === 'asc' ? 'desc' : 'asc');
          else { setTableSortKey(key); setTableSortDir('desc'); }
          playSound('click');
        };
        const SortIcon = ({ k }: { k: typeof tableSortKey }) => (
          tableSortKey === k ? <span className="ml-0.5 text-xs">{tableSortDir === 'asc' ? '▲' : '▼'}</span> : null
        );
        return (
        <div className="space-y-4">
          {/* Filters panel */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 space-y-2">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Filters</p>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
              {/* Cutoff */}
              <div className="space-y-1">
                <p className="text-xs font-black text-slate-300 uppercase tracking-widest ml-1">Cutoff</p>
                <div ref={periodDropdownRef} className="relative w-full">
                  <button
                    onClick={() => { setPeriodDropdownOpen(o => !o); playSound('click'); }}
                    className={`h-10 flex items-center justify-between gap-2 px-3.5 rounded-xl border text-xs font-semibold uppercase tracking-wide transition-all outline-none w-full ${
                      periodDropdownOpen
                        ? 'bg-white border-indigo-500 ring-4 ring-indigo-500/10 text-slate-900'
                        : selectedPeriods.length > 0 ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-500'
                    }`}
                  >
                    <span className="truncate">
                      {selectedPeriods.length === 0 ? 'All Cutoffs' : selectedPeriods.length === 1 ? DAYS[Number(selectedPeriods[0])] : `${selectedPeriods.length} Cutoffs`}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {selectedPeriods.length > 0 && <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-xs font-black flex items-center justify-center leading-none">{selectedPeriods.length}</span>}
                      <svg className={`w-3 h-3 transition-transform duration-200 ${periodDropdownOpen ? 'rotate-180 text-indigo-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </button>
                  {periodDropdownOpen && (
                    <div className="absolute z-[200] top-[calc(100%+6px)] left-0 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 ring-1 ring-slate-900/5">
                      <div className="max-h-72 overflow-y-auto overscroll-contain">
                        <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 border-b border-slate-100 group">
                          <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${selectedPeriods.length === 0 ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300 group-hover:border-indigo-400'}`}>
                            {selectedPeriods.length === 0 && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M5 13l4 4L19 7" /></svg>}
                          </span>
                          <input type="checkbox" checked={selectedPeriods.length === 0} onChange={() => setSelectedPeriods([])} className="sr-only" />
                          <span className={`text-xs font-semibold uppercase tracking-wide ${selectedPeriods.length === 0 ? 'text-indigo-600' : 'text-slate-500'}`}>All Cutoffs</span>
                        </label>
                        {cutoffTabs.map(tab => {
                          const key = String(tab.day);
                          const checked = selectedPeriods.includes(key);
                          const toggle = () => { playSound('click'); setSelectedPeriods(prev => checked ? prev.filter(p => p !== key) : [...prev, key]); };
                          return (
                            <label key={key} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer group hover:bg-slate-50">
                              <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300 group-hover:border-indigo-400'}`}>
                                {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M5 13l4 4L19 7" /></svg>}
                              </span>
                              <input type="checkbox" checked={checked} onChange={toggle} className="sr-only" />
                              <div className="flex-1 min-w-0">
                                <p className={`text-xs font-semibold uppercase tracking-wide ${checked ? 'text-slate-900' : 'text-slate-500'}`}>{tab.label}</p>
                                <span className="text-xs font-bold text-slate-400">{tab.count} week{tab.count !== 1 ? 's' : ''}</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                      {selectedPeriods.length > 0 && (
                        <div className="border-t border-slate-100 px-4 py-2">
                          <button onClick={() => { setSelectedPeriods([]); playSound('click'); }} className="text-xs font-medium text-slate-400 uppercase tracking-wide hover:text-rose-500 transition-colors">Clear selection</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {/* Branch */}
              <div className="space-y-1">
                <p className="text-xs font-black text-slate-300 uppercase tracking-widest ml-1">Branch</p>
                <div ref={branchDropdownRef} className="relative w-full">
                  <button
                    onClick={() => { setBranchDropdownOpen(o => !o); playSound('click'); }}
                    className={`h-10 flex items-center justify-between gap-2 px-3.5 rounded-xl border text-xs font-semibold uppercase tracking-wide transition-all outline-none w-full ${
                      branchDropdownOpen
                        ? 'bg-white border-indigo-500 ring-4 ring-indigo-500/10 text-slate-900'
                        : effectiveBranchIds.length > 0 ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-500'
                    }`}
                  >
                    <span className="truncate">
                      {effectiveBranchIds.length === 0
                        ? 'All Branches'
                        : branches.find(b => b.id === effectiveBranchIds[0])?.name.replace(/\s*BRANCH\s*/i, '').trim() ?? 'Branch'}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {effectiveBranchIds.length > 0 && (
                        <button
                          onClick={e => { e.stopPropagation(); setSelectedBranchIds([]); setBranchSearch(''); playSound('click'); }}
                          className="w-4 h-4 rounded-full bg-rose-500 text-white text-xs font-black flex items-center justify-center leading-none hover:bg-rose-700 transition-colors"
                        >✕</button>
                      )}
                      <svg className={`w-3 h-3 transition-transform duration-200 ${branchDropdownOpen ? 'rotate-180 text-indigo-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </button>
                  {branchDropdownOpen && (
                    <div className="absolute z-[200] top-[calc(100%+6px)] left-0 w-full min-w-[220px] bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 ring-1 ring-slate-900/5">
                      <div className="p-2 border-b border-slate-100">
                        <input
                          autoFocus
                          value={branchSearch}
                          onChange={e => setBranchSearch(e.target.value)}
                          placeholder="Search branches..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 placeholder:text-slate-300 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 focus:outline-none"
                        />
                      </div>
                      <div className="max-h-56 overflow-y-auto overscroll-contain">
                        {!branchSearch && (
                          <button
                            onClick={() => { setSelectedBranchIds([]); setBranchSearch(''); setBranchDropdownOpen(false); playSound('click'); }}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100 ${effectiveBranchIds.length === 0 ? 'bg-slate-50' : ''}`}
                          >
                            <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${effectiveBranchIds.length === 0 ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300'}`}>
                              {effectiveBranchIds.length === 0 && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M5 13l4 4L19 7" /></svg>}
                            </span>
                            <span className={`text-xs font-semibold uppercase tracking-wide ${effectiveBranchIds.length === 0 ? 'text-indigo-600' : 'text-slate-500'}`}>All Branches</span>
                          </button>
                        )}
                        {branches.filter(b => !branchSearch || b.name.toLowerCase().includes(branchSearch.toLowerCase())).map(b => {
                          const selected = effectiveBranchIds.includes(b.id);
                          return (
                            <button
                              key={b.id}
                              onClick={() => { setSelectedBranchIds([b.id]); setBranchSearch(''); setBranchDropdownOpen(false); playSound('click'); }}
                              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 ${selected ? 'bg-slate-50' : ''}`}
                            >
                              <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${selected ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300'}`}>
                                {selected && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M5 13l4 4L19 7" /></svg>}
                              </span>
                              <span className={`text-xs font-semibold uppercase tracking-wide truncate ${selected ? 'text-slate-900' : 'text-slate-500'}`}>
                                {b.name.replace(/\s*BRANCH\s*/i, '').trim()}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {/* Pending Remittance */}
              <div className="space-y-1">
                <p className="text-xs font-black text-slate-300 uppercase tracking-widest ml-1">Status</p>
                <div className="flex gap-1.5">
                  <button onClick={() => { setLastWeekOnly(v => !v); setLastWeekSubmittedOnly(false); playSound('click'); }} className={`h-10 flex items-center justify-center gap-1.5 px-2.5 rounded-xl border text-xs font-semibold uppercase tracking-wide transition-all whitespace-nowrap ${lastWeekOnly ? 'bg-rose-600 border-rose-600 text-white shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${lastWeekOnly ? 'bg-white' : 'bg-rose-400'}`} />
                    Pending
                    {lastWeekUnremittedIds.size > 0 && <span className={`text-xs font-black px-1.5 py-0.5 rounded-full shrink-0 ${lastWeekOnly ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-600'}`}>{lastWeekUnremittedIds.size}</span>}
                  </button>
                  <button onClick={() => { setLastWeekSubmittedOnly(v => !v); setLastWeekOnly(false); playSound('click'); }} className={`h-10 flex items-center justify-center gap-1.5 px-2.5 rounded-xl border text-xs font-semibold uppercase tracking-wide transition-all whitespace-nowrap ${lastWeekSubmittedOnly ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${lastWeekSubmittedOnly ? 'bg-white' : 'bg-blue-400'}`} />
                    Remitted
                    {lastWeekSubmittedIds.size > 0 && <span className={`text-xs font-black px-1.5 py-0.5 rounded-full shrink-0 ${lastWeekSubmittedOnly ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-600'}`}>{lastWeekSubmittedIds.size}</span>}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th onClick={() => toggleSort('branch')} className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide cursor-pointer hover:text-slate-600 select-none">Branch<SortIcon k="branch" /></th>
                  <th onClick={() => toggleSort('pending')} className="text-center px-3 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide cursor-pointer hover:text-slate-600 select-none">Status<SortIcon k="pending" /></th>
                  <th onClick={() => toggleSort('gross')} className="text-right px-3 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide cursor-pointer hover:text-slate-600 select-none">Gross<SortIcon k="gross" /></th>
                  <th onClick={() => toggleSort('salary')} className="text-right px-3 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide cursor-pointer hover:text-slate-600 select-none">Salary<SortIcon k="salary" /></th>
                  <th onClick={() => toggleSort('expenses')} className="text-right px-3 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide cursor-pointer hover:text-slate-600 select-none">Expenses<SortIcon k="expenses" /></th>
                  <th onClick={() => toggleSort('roi')} className="text-right px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide cursor-pointer hover:text-slate-600 select-none">Latest ROI<SortIcon k="roi" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sorted.map(b => (
                  <tr
                    key={b.branchId}
                    onClick={() => { setActiveBranchId(b.branchId); setBranchSearch(''); playSound('click'); }}
                    className="hover:bg-slate-50 cursor-pointer transition-colors group"
                  >
                    <td className="px-6 py-3.5">
                      <p className="text-xs font-black text-slate-900 uppercase tracking-tight group-hover:text-emerald-700 transition-colors">
                        {b.branchName.replace(' BRANCH', '')}
                      </p>
                      <p className="text-xs font-bold text-slate-400 mt-0.5">{b.totalPeriods} week{b.totalPeriods !== 1 ? 's' : ''}</p>
                    </td>
                    <td className="text-center px-3 py-3.5">
                      <div className="inline-flex items-center gap-2">
                        {b.pending > 0 && <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /><span className="text-xs font-black text-amber-600">{b.pending}</span></span>}
                        {b.approved > 0 && <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /><span className="text-xs font-black text-emerald-600">{b.approved}</span></span>}
                        {b.pending === 0 && b.approved === 0 && <span className="text-slate-300">—</span>}
                      </div>
                    </td>
                    <td className="text-right px-3 py-3.5 text-xs font-bold text-slate-700 tabular-nums">{fmt(b.latestGrossSales)}</td>
                    <td className="text-right px-3 py-3.5 text-xs font-bold text-rose-500 tabular-nums">{fmt(b.latestStaffPay)}</td>
                    <td className="text-right px-3 py-3.5 text-xs font-bold text-rose-500 tabular-nums">{fmt(b.latestExpenses)}</td>
                    <td className="text-right px-6 py-3.5">
                      <span className={`text-xs font-black tabular-nums block ${b.latestPeriodRoi < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{fmt(b.latestPeriodRoi)}</span>
                      {b.latestPeriodLabel && <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{b.latestPeriodLabel}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sorted.length === 0 && (
              <div className="p-16 text-center">
                <p className="text-xs font-black text-slate-300 uppercase tracking-wider">No branches found</p>
              </div>
            )}
          </div>

          {/* Mobile list */}
          <div className="lg:hidden bg-white rounded-2xl border border-slate-100 divide-y divide-slate-50 overflow-hidden">
            {filtered.map(b => (
              <button
                key={b.branchId}
                onClick={() => { setActiveBranchId(b.branchId); setBranchSearch(''); playSound('click'); }}
                className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 transition-colors active:bg-slate-100"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-slate-900 uppercase tracking-tight truncate">
                    {b.branchName.replace(' BRANCH', '')}
                  </p>
                  <div className="flex items-center gap-2.5 mt-1">
                    <span className="text-xs font-bold text-slate-400">{b.totalPeriods} week{b.totalPeriods !== 1 ? 's' : ''}</span>
                    {b.pending > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /><span className="text-xs font-black text-amber-600">{b.pending}</span></span>}
                    {b.approved > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /><span className="text-xs font-black text-emerald-600">{b.approved}</span></span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-xs font-black tabular-nums block ${b.latestPeriodRoi < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{fmt(b.latestPeriodRoi)}</span>
                  {b.latestPeriodLabel && <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{b.latestPeriodLabel}</span>}
                </div>
                <svg className="w-4 h-4 text-slate-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="p-12 text-center">
                <p className="text-xs font-black text-slate-300 uppercase tracking-wider">No branches found</p>
              </div>
            )}
          </div>
        </div>
        );
      })()}

      {/* ── Branch Detail View ── */}
      {activeBranchId && (
        <>
        {/* Back + Branch Name header */}
        <div className="bg-white rounded-2xl border border-slate-100 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => { setActiveBranchId(null); setSelectedBranchIds([]); playSound('click'); }}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors shrink-0"
          >
            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-slate-900 uppercase tracking-tight leading-none truncate">
              {branches.find(b => b.id === activeBranchId)?.name?.replace(/\s*BRANCH\s*/i, '').trim() || 'Branch'}
            </p>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-0.5">Weekly Remittances</p>
          </div>
          <button
            onClick={handleExportPDF}
            className="flex items-center justify-center gap-2 h-9 px-3 sm:px-4 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all active:scale-95 shrink-0"
            title="Export PDF"
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            <span className="hidden sm:inline">Export PDF</span>
          </button>
        </div>

      {/* ── Quick Process Strip — only on branch list view ── */}
      {!activeBranchId && mainView === 'remittances' && quickProcessItems.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-xs font-black text-slate-900 uppercase tracking-widest">
                Pending — {quickProcessItems.length} branch{quickProcessItems.length !== 1 ? 'es' : ''}
              </span>
            </div>
            {!isReadOnly && (
              <button
                onClick={() => setMarkAllConfirm(true)}
                disabled={isReviewing}
                className="flex items-center gap-1.5 h-9 px-4 bg-emerald-600 text-white rounded-xl text-xs font-semibold uppercase tracking-wide hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-40"
              >
                <CheckCircle className="w-3 h-3" /> Mark All Remitted
              </button>
            )}
          </div>
          <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
            {quickProcessItems.map(({ report, group, sub, adjustedRoi: itemRoi }) => (
              <div key={`${report.branchId}::${group.label}`} className="flex items-center gap-4 px-6 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-slate-900 uppercase tracking-tight truncate">
                    {report.branchName.replace('BRANCH - ', '')}
                  </p>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{report.branchLabel || group.label}</p>
                </div>
                <div className="shrink-0 text-right w-28">
                  {itemRoi <= 0
                    ? <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Nothing to remit</span>
                    : <span className="text-sm font-black tabular-nums text-slate-900">{fmt(itemRoi)}</span>
                  }
                </div>
                {!isReadOnly && (
                  <button
                    onClick={() => setRemitConfirm({ submissionId: sub?.id ?? null, branchId: report.branchId, periodLabel: group.label, branchName: report.branchName })}
                    disabled={isReviewing}
                    className="flex items-center gap-1.5 h-9 px-4 bg-emerald-600 text-white rounded-xl text-xs font-semibold uppercase tracking-wide hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-40 shrink-0"
                  >
                    <CheckCircle className="w-3 h-3" /> Remitted
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty ── */}
      {displayGroups.length === 0 ? (
        <div className="bg-white p-20 rounded-3xl border border-slate-100 text-center space-y-4">
          <div className="text-6xl opacity-20">📭</div>
          <p className="text-xs font-black text-slate-300 uppercase tracking-wider">No weekly reports found for remittance.</p>
        </div>
      ) : (
        activeBranchId ? (
        /* ── Branch detail: flat 2-column grid, period label inside each card ── */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {displayGroups.flatMap((group) => group.reports.map((report: any) => ({ report, group }))).map(({ report, group }) => {
                  const rowAdj = adjustments.filter(a => a.branchId === report.branchId && a.periodLabel === group.label);
                  const globalAdj = rowAdj.filter(a => !a.targetOwner || a.description === 'VAULT DEPOSIT');
                  const ownerAdj = rowAdj.filter(a => !!a.targetOwner && a.description !== 'VAULT DEPOSIT');
                  const totalGlobalAdj = globalAdj.reduce((s, a) => s + a.amount, 0);
                  const pureNetRoi = report.grossSales - report.totalStaffPay - report.totalExpenses - report.totalVaultProvision;
                  const adjustedRoi = pureNetRoi + totalGlobalAdj;
                  const levy = report.groupLevy as { name: string; percentage: number } | null;
                  const levyCut = levy ? adjustedRoi * (levy.percentage / 100) : 0;
                  const distributableRoi = adjustedRoi - levyCut;
                  const hasAdj = rowAdj.length > 0;
                  const sub = subLookup[`${report.branchId}::${group.label}`];
                  const rKey = `${report.branchId}::${group.label}`;
                  const cardId = `branch-card-${report.branchId}-${group.label.replace(/[\s,/]/g, '-')}`;

                  return (
                    <div key={`${report.branchId}-${group.label}`} id={cardId} className={`bg-white rounded-2xl shadow-sm overflow-hidden border ${
                      sub?.status === 'approved'  ? 'border-emerald-300' :
                      sub?.status === 'rejected'  ? 'border-rose-300' :
                      'border-slate-100'
                    }`}>

                      {/* Card header */}
                      <div className={`flex items-center justify-between px-6 py-4 border-b ${
                        sub?.status === 'approved' ? 'bg-emerald-50 border-emerald-200' :
                        sub?.status === 'rejected' ? 'bg-rose-50 border-rose-200' :
                        sub?.status === 'for_verification' ? 'bg-amber-50 border-amber-200' :
                        'bg-slate-50 border-slate-100'
                      }`}>
                        <div>
                          <p className="font-black text-slate-900 uppercase tracking-tight text-sm leading-none">
                            {activeBranchId
                              ? (report.branchLabel || group.label)
                              : report.branchName.replace('BRANCH - ', '')}
                          </p>
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-0.5">
                            {report.reportIds.length} day{report.reportIds.length !== 1 ? 's' : ''} aggregated
                          </p>
                        </div>
                        {/* Status indicator + mark remitted checkbox */}
                        <div className="flex items-center gap-3">
                          {sub?.status === 'approved' && (
                            <div className="flex items-center gap-1.5">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="text-xs font-black text-emerald-700 uppercase tracking-widest">{adjustedRoi <= 0 ? 'Nothing to Remit' : 'Remitted'}</span>
                            </div>
                          )}
                          {sub?.status === 'rejected' && (
                            <div className="flex items-center gap-1.5">
                              <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                              <span className="text-xs font-black text-rose-600 uppercase tracking-widest">Rejected</span>
                            </div>
                          )}
                          {sub?.status === 'for_verification' && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0 animate-pulse" />
                              <span className="text-xs font-black text-amber-700 uppercase tracking-widest">For Verification</span>
                            </div>
                          )}
                          {(!sub || sub.status === 'submitted' || sub.status === 'validated') && (
                            <div className="flex items-center gap-1.5">
                              <div className={`w-2 h-2 rounded-full shrink-0 ${adjustedRoi <= 0 ? 'bg-slate-400' : 'bg-amber-400'}`} />
                              <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                                {adjustedRoi <= 0 ? 'Nothing To Remit' : 'Pending'}
                              </span>
                            </div>
                          )}
                          {!isReadOnly && sub?.status === 'approved' && (
                            <div className="relative group">
                              <input
                                type="checkbox"
                                checked
                                disabled={isReviewing}
                                onChange={() => {
                                  const hasVaultAdj = rowAdj.some(a => a.description === 'VAULT DEPOSIT');
                                  setUnmarkConfirm({ submissionId: sub.id, branchName: report.branchName, periodLabel: group.label, hasVaultAdj });
                                }}
                                className="w-5 h-5 accent-emerald-600 cursor-pointer disabled:opacity-40"
                                title="Click to unmark remitted"
                              />
                              <span className="pointer-events-none absolute right-full mr-2 top-1/2 -translate-y-1/2 whitespace-nowrap bg-slate-800 text-white text-xs font-bold px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                                Unmark Remitted
                              </span>
                            </div>
                          )}
                          {!isReadOnly && sub?.status !== 'approved' && (
                            <div className="relative group">
                              <input
                                type="checkbox"
                                checked={false}
                                disabled={isReviewing}
                                onChange={() => {
                                  setRemitConfirm({ submissionId: sub?.id ?? null, branchId: report.branchId, periodLabel: group.label, branchName: report.branchName });
                                }}
                                className="w-5 h-5 accent-emerald-600 cursor-pointer disabled:opacity-40"
                                title="Mark Remitted"
                              />
                              <span className="pointer-events-none absolute right-full mr-2 top-1/2 -translate-y-1/2 whitespace-nowrap bg-slate-800 text-white text-xs font-bold px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                                Mark Remitted
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ── For Verification ribbon (legacy status) ── */}
                      {sub?.status === 'for_verification' && !isReadOnly && (
                        <div className="flex items-center justify-end gap-1.5 px-6 py-2 bg-amber-50 border-b border-amber-200">
                          <button onClick={() => handleReview(sub.id, report.branchId, group.label, 'rejected')} disabled={isReviewing} className="h-9 px-4 bg-white border border-rose-200 text-rose-600 rounded-xl text-xs font-semibold uppercase tracking-wide active:scale-95 transition-all disabled:opacity-40 hover:bg-rose-50">Reject</button>
                          <button onClick={() => setRemitConfirm({ submissionId: sub.id, branchId: report.branchId, periodLabel: group.label, branchName: report.branchName })} disabled={isReviewing} className="flex items-center gap-1.5 h-9 px-4 bg-emerald-600 text-white rounded-xl text-xs font-semibold uppercase tracking-wide active:scale-95 transition-all disabled:opacity-40 hover:bg-emerald-700"><CheckCircle className="w-3 h-3" /> Approve</button>
                        </div>
                      )}

                      {/* ── Receipt-style body ── */}
                      <div className="px-6 py-5 space-y-0 font-mono text-xs">

                        {/* Line items */}
                        {(() => {
                          const breakdownKey = `${group.label}-${report.branchId}`;
                          const isOpen = openGrossBreakdown === breakdownKey;
                          const sorted = [...(report.dailyReports || [])].sort((a, b) => a.reportDate < b.reportDate ? -1 : 1);
                          return (
                            <>
                              <button
                                type="button"
                                onClick={() => setOpenGrossBreakdown(isOpen ? null : breakdownKey)}
                                className="w-full flex items-center justify-between py-1.5 group"
                              >
                                <span className="text-slate-500 group-hover:text-slate-700 transition-colors flex items-center gap-1.5">
                                  Gross Sales
                                  <svg className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                                  </svg>
                                </span>
                                <span className="font-bold text-slate-900 tabular-nums group-hover:text-indigo-700 transition-colors">{fmt(report.grossSales)}</span>
                              </button>
                              {isOpen && sorted.length > 0 && (
                                <div className="mb-1 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden">
                                  <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{sorted.length} daily reports</span>
                                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{fmt(report.grossSales)} total</span>
                                  </div>
                                  <div className="divide-y divide-slate-100 max-h-44 overflow-y-auto">
                                    {sorted.map((r, i) => {
                                      const d = parseDate(r.reportDate);
                                      const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
                                      return (
                                        <div key={i} className="flex items-center justify-between px-3 py-2">
                                          <span className="text-xs font-bold text-slate-500">{dayLabel}</span>
                                          <span className="text-xs font-black text-slate-800 tabular-nums">{fmt(r.grossSales)}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()}
                        <div className="flex justify-between py-1.5">
                          <span className="text-slate-500">Staff Payroll</span>
                          <span className="font-bold text-rose-600 tabular-nums">-{fmt(report.totalStaffPay)}</span>
                        </div>
                        <div className="flex justify-between py-1.5">
                          <span className="text-slate-500">Expenses</span>
                          <span className="font-bold text-rose-600 tabular-nums">-{fmt(report.totalExpenses)}</span>
                        </div>
                        <div className="flex justify-between py-1.5">
                          <span className="text-slate-500">Vault / Bills</span>
                          <span className="font-bold text-rose-600 tabular-nums">-{fmt(report.totalVaultProvision)}</span>
                        </div>

                        {/* Dotted separator */}
                        <div className="border-t-2 border-dashed border-slate-200 my-2" />

                        {/* Net ROI — always pure arithmetic */}
                        <div className="flex justify-between py-2">
                          <span className="font-black text-slate-900 text-sm uppercase tracking-wide">Net ROI</span>
                          <span className={`font-black text-lg tabular-nums ${pureNetRoi < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{pureNetRoi < 0 ? '−' : ''}{fmt(Math.abs(pureNetRoi))}</span>
                        </div>
                        {totalGlobalAdj !== 0 && (
                          <div className="flex justify-between py-1.5">
                            <span className="text-slate-500 text-xs">Vault / Adjustments</span>
                            <span className={`font-semibold text-xs tabular-nums ${totalGlobalAdj < 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                              {totalGlobalAdj >= 0 ? '+' : '−'}{fmt(Math.abs(totalGlobalAdj))}
                            </span>
                          </div>
                        )}

                        {/* Group levy */}
                        {levy && (
                          <>
                            <div className="border-t border-dotted border-slate-200 my-2" />
                            <div className="flex justify-between py-1.5">
                              <span className="text-indigo-600">{levy.name} ({levy.percentage}%)</span>
                              <span className="font-bold text-indigo-700 tabular-nums">-{fmt(levyCut)}</span>
                            </div>
                          </>
                        )}

                        {/* Dotted separator before owners */}
                        {report.owners.length > 0 && (
                          <>
                            <div className="border-t-2 border-dashed border-slate-200 my-2" />
                            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider py-1">
                              Owner Distribution{levy ? ` (of ${fmt(distributableRoi)})` : ''}
                            </div>
                            {report.owners.map((owner: any, oIdx: number) => {
                              const ownerTargeted = ownerAdj.filter(a => a.targetOwner === owner.name).reduce((s, a) => s + a.amount, 0);
                              const share = distributableRoi * (owner.percentage / 100) + ownerTargeted;
                              return (
                                <div key={oIdx} className="flex justify-between py-1.5">
                                  <span className="text-slate-600">
                                    {owner.name} <span className="text-slate-400">({owner.percentage}%)</span>
                                    {ownerTargeted !== 0 && <span className="text-rose-400 text-xs ml-1">adj {ownerTargeted >= 0 ? '+' : ''}{fmt(ownerTargeted)}</span>}
                                  </span>
                                  <span className={`font-bold tabular-nums ${share < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{fmt(share)}</span>
                                </div>
                              );
                            })}
                            {report.owners.length > 1 && (
                              <>
                                <div className="border-t border-dotted border-slate-200 my-1" />
                                <div className="flex justify-between py-1">
                                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Total</span>
                                  <span className="font-black text-sm tabular-nums text-slate-800">
                                    {fmt(report.owners.reduce((s: number, o: any) => {
                                      const ot = ownerAdj.filter(a => a.targetOwner === o.name).reduce((sum, a) => sum + a.amount, 0);
                                      return s + distributableRoi * (o.percentage / 100) + ot;
                                    }, 0))}
                                  </span>
                                </div>
                              </>
                            )}
                          </>
                        )}
                        {report.owners.length === 0 && (
                          <p className="text-xs text-slate-400 italic py-2">No owners configured</p>
                        )}

                        {/* Adjustments */}
                        <div className="border-t-2 border-dashed border-slate-200 my-2" />
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Adjustments</p>

                          {rowAdj.map(adj => (
                            <div
                              key={adj.id}
                              className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 gap-4"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${adj.amount >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                                <div className="min-w-0">
                                  <span className="text-xs font-semibold text-slate-800 uppercase tracking-tight truncate block">{adj.description}</span>
                                  {adj.targetOwner && (
                                    <span className="text-xs font-bold text-rose-400 uppercase tracking-widest">→ {adj.targetOwner}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-xs font-black tabular-nums ${adj.amount < 0 ? 'text-rose-500' : 'text-slate-800'}`}>
                                  {adj.amount >= 0 ? '+' : ''}{fmt(adj.amount)}
                                </span>
                                {!isReadOnly && sub?.status !== 'approved' && (
                                  <button onClick={() => handleDeleteAdjustment(adj.id)} className="text-slate-300 hover:text-rose-500 transition-colors p-0.5">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}

                          {rowAdj.length === 0 && adjFormKey !== rKey && (
                            <p className="text-xs text-slate-400 italic">No adjustments</p>
                          )}

                          {!isReadOnly && sub?.status !== 'approved' && adjFormKey !== rKey && (
                            <div className={`grid gap-2 mt-2 ${report.owners.length >= 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
                              <button
                                onClick={() => { setAdjFormMode('add'); setAdjForm({ description: '', amount: '' }); setAdjTargetOwner(''); setAdjTransferFrom(''); setAdjTransferTo(''); setIsVaultDeposit(false); setAdjFormKey(rKey); }}
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
                              <button
                                onClick={() => { setAdjFormMode('deduct'); setAdjForm({ description: '', amount: '' }); setAdjTargetOwner(''); setAdjTransferFrom(''); setAdjTransferTo(''); setIsVaultDeposit(false); setAdjFormKey(rKey); }}
                                className="flex flex-col items-start gap-2 p-3 bg-white border border-slate-200 text-slate-700 rounded-2xl active:scale-95 transition-all hover:bg-slate-50"
                              >
                                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                                  <Minus className="w-3.5 h-3.5 text-slate-500" />
                                </div>
                                <div>
                                  <p className="text-xs font-black uppercase tracking-wide leading-none text-slate-800">Deduct</p>
                                  <p className="text-xs font-medium text-slate-400 mt-0.5 leading-none">from ROI</p>
                                </div>
                              </button>
                              {report.owners.length >= 2 && (
                                <button
                                  onClick={() => { setAdjFormMode('transfer'); setAdjForm({ description: 'REIMBURSEMENT', amount: '' }); setAdjTargetOwner(''); setAdjTransferFrom(''); setAdjTransferTo(''); setIsVaultDeposit(false); setAdjFormKey(rKey); }}
                                  className="col-span-2 flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-100 rounded-2xl active:scale-95 transition-all hover:bg-indigo-100"
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

                          {adjFormKey === rKey && (() => {
                            rKeyRef.current = rKey;
                            const branchObj = branches.find(b => b.id === report.branchId);
                            const vaultEligible = adjFormMode === 'deduct' && !!branchObj?.vaultEnabled;

                            if (adjFormMode === 'transfer') return (
                              <div className="border border-indigo-200 bg-indigo-50 rounded-2xl p-4 space-y-2.5">
                                <div className="flex items-center gap-2">
                                  <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                  <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Owner Transfer</span>
                                </div>
                                <p className="text-xs text-indigo-500">Debit one owner and credit another. Net ROI is unchanged.</p>
                                <div className="space-y-2">
                                  <div className="space-y-1">
                                    <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest pl-1">From (pays)</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {report.owners.map((o: any) => (
                                        <button key={o.name} type="button"
                                          onClick={() => { setAdjTransferFrom(o.name); if (o.name === adjTransferTo) setAdjTransferTo(''); }}
                                          className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all active:scale-95 ${adjTransferFrom === o.name ? 'bg-rose-500 text-white shadow-sm' : 'bg-white border border-indigo-200 text-indigo-700 hover:border-indigo-400'}`}
                                        >{o.name}</button>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest pl-1">To (receives)</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {report.owners.filter((o: any) => o.name !== adjTransferFrom).map((o: any) => (
                                        <button key={o.name} type="button"
                                          onClick={() => setAdjTransferTo(o.name)}
                                          className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all active:scale-95 ${adjTransferTo === o.name ? 'bg-emerald-500 text-white shadow-sm' : 'bg-white border border-indigo-200 text-indigo-700 hover:border-indigo-400'}`}
                                        >{o.name}</button>
                                      ))}
                                      {!adjTransferFrom && (
                                        <span className="text-xs font-medium text-indigo-300 italic px-1 py-1.5">Select "From" first</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <input type="text" value={adjForm.description} onChange={e => setAdjForm(f => ({ ...f, description: e.target.value }))} placeholder="Reason (e.g. Reimbursement)" className="w-full bg-white border border-indigo-200 px-4 py-2.5 rounded-xl text-xs font-bold uppercase outline-none focus:border-indigo-400" />
                                <div className="relative">
                                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">₱</span>
                                  <input type="number" step="0.01" min="0" value={adjForm.amount} onChange={e => setAdjForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="w-full bg-white border border-indigo-200 pl-8 pr-4 py-2.5 rounded-xl text-sm font-black outline-none focus:border-indigo-400 tabular-nums" />
                                </div>
                                {adjTransferFrom && adjTransferTo && adjForm.amount && (
                                  <div className="bg-white border border-indigo-100 rounded-xl px-3 py-2 text-xs text-indigo-700 space-y-0.5">
                                    <div className="flex justify-between"><span>{adjTransferFrom}</span><span className="font-black text-rose-500">-{fmt(parseFloat(adjForm.amount) || 0)}</span></div>
                                    <div className="flex justify-between"><span>{adjTransferTo}</span><span className="font-black text-emerald-600">+{fmt(parseFloat(adjForm.amount) || 0)}</span></div>
                                  </div>
                                )}
                                <div className="grid grid-cols-2 gap-2">
                                  <button onClick={() => { setAdjFormKey(null); setAdjForm({ description: '', amount: '' }); setAdjTransferFrom(''); setAdjTransferTo(''); }} className="h-10 bg-white border border-slate-200 text-slate-500 rounded-xl text-xs font-semibold uppercase tracking-wide">Cancel</button>
                                  <button onClick={() => handleTransferAdjustment(report.branchId, group.label)} disabled={isSavingAdj || !adjTransferFrom || !adjTransferTo || !adjForm.description.trim() || !adjForm.amount} className="h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold uppercase tracking-wide disabled:opacity-40">{isSavingAdj ? '…' : 'Transfer'}</button>
                                </div>
                              </div>
                            );

                            return (
                            <div className={`border rounded-2xl p-4 space-y-2.5 ${isVaultDeposit ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                              <div className="flex items-center gap-2">
                                {adjFormMode === 'add' ? <Plus className="w-3.5 h-3.5 text-slate-500 shrink-0" /> : <Minus className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                                <span className={`text-xs font-semibold uppercase tracking-wide ${isVaultDeposit ? 'text-emerald-700' : 'text-slate-700'}`}>
                                  {adjFormMode === 'add'
                                    ? adjTargetOwner ? `Add to ${adjTargetOwner}` : 'Add to ROI'
                                    : isVaultDeposit ? 'Deposit to Vault' : adjTargetOwner ? `Deduct from ${adjTargetOwner}` : 'Deduct from ROI'}
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
                                      if (checked) {
                                        setAdjForm(f => ({ ...f, description: 'VAULT DEPOSIT', amount: '' }));
                                        setAdjTargetOwner('');
                                      } else {
                                        setAdjForm(f => ({ ...f, description: '', amount: '' }));
                                      }
                                    }}
                                    className="w-3.5 h-3.5 accent-emerald-600 shrink-0"
                                  />
                                  <span className={`text-xs font-semibold uppercase tracking-wide ${isVaultDeposit ? 'text-emerald-700' : 'text-slate-500'}`}>
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
                                className={`w-full border px-4 py-2.5 rounded-xl text-xs font-bold uppercase outline-none transition-colors ${isVaultDeposit ? 'bg-emerald-100 border-emerald-200 text-emerald-800 cursor-default' : 'bg-white border-slate-200 focus:border-slate-400'}`}
                              />

                              {/* Hide owners when vault deposit is checked */}
                              {report.owners.length > 0 && !isVaultDeposit && (
                                <select
                                  value={adjTargetOwner}
                                  onChange={e => setAdjTargetOwner(e.target.value)}
                                  className="w-full bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold uppercase outline-none focus:border-slate-400 transition-colors appearance-none"
                                >
                                  <option value="">All Owners (Global)</option>
                                  {report.owners.map((o: any) => (
                                    <option key={o.name} value={o.name}>{o.name}</option>
                                  ))}
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
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => { setAdjFormKey(null); setAdjForm({ description: '', amount: '' }); setAdjTargetOwner(''); setIsVaultDeposit(false); }}
                                  className="h-10 bg-white border border-slate-200 text-slate-500 rounded-xl text-xs font-semibold uppercase tracking-wide"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleAddAdjustment(report.branchId, group.label, adjustedRoi)}
                                  disabled={isSavingAdj || !adjForm.description.trim() || !adjForm.amount}
                                  className={`h-10 text-white rounded-xl text-xs font-semibold uppercase tracking-wide disabled:opacity-40 ${isVaultDeposit ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-900'}`}
                                >
                                  {isSavingAdj ? '…' : isVaultDeposit ? 'Deposit' : 'Save'}
                                </button>
                              </div>
                            </div>
                            );
                          })()}
                        </div>


                      </div>
                    </div>
                  );
                })}
        </div>
        ) : (
        /* ── Multi-branch: not used in branch detail, placeholder ── */
        null
        )
      )}
      </>
      )}
    </div>
  );
};
