
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Branch, SalesReport, VaultTransaction } from '../../types';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { playSound } from '../../lib/audio';
import { BranchCheckboxDropdown } from '../shared/BranchCheckboxDropdown';

interface VaultRow {
  branchId: string;
  balance: number;
  initialBalance: number;
  target: number;
  startDate: string | null;
}

interface VaultFundHubProps {
  branches: Branch[];
  salesReports: SalesReport[];
  vaultTransactions?: VaultTransaction[];
  isReadOnly?: boolean;
  onRefresh?: () => void;
}

type SortMode = 'name' | 'progress' | 'balance';

export const VaultFundHub: React.FC<VaultFundHubProps> = ({ branches, salesReports, vaultTransactions = [], isReadOnly, onRefresh }) => {
  const [vaultRows, setVaultRows] = useState<Record<string, VaultRow>>({});
  const [loadingVaults, setLoadingVaults] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState('');
  const [editInitialBalance, setEditInitialBalance] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [depositingId, setDepositingId] = useState<string | null>(null);
  const [depositInput, setDepositInput] = useState('');
  const [roiSourceDate, setRoiSourceDate] = useState(''); // date of the report whose ROI is being pulled
  const [savingDepositId, setSavingDepositId] = useState<string | null>(null);
  const [localEnabled, setLocalEnabled] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [vaultFilter, setVaultFilter] = useState<'all' | 'enabled' | 'disabled' | 'full'>('all');
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState<Set<string>>(new Set());
  const [vaultTotals, setVaultTotals] = useState<Record<string, { deposited: number; depositCount: number; withdrawn: number; withdrawalCount: number }>>({});
  const [detailBranchId, setDetailBranchId] = useState<string | null>(null);
  const [detailTxns, setDetailTxns] = useState<VaultTransaction[]>([]);
  const [detailTxnsLoading, setDetailTxnsLoading] = useState(false);
  const [txHistoryTab, setTxHistoryTab] = useState<'deposits' | 'withdrawals'>('deposits');
  const [visibleDeposits, setVisibleDeposits] = useState(20);
  const [visibleWithdrawals, setVisibleWithdrawals] = useState(20);
  const [roiDropdownOpen, setRoiDropdownOpen] = useState(false);
  const [confirmToggleBranch, setConfirmToggleBranch] = useState<Branch | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  const downloadCSV = (rows: string[][], filename: string) => {
    const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAllCSV = () => {
    const rows: string[][] = [
      ['Branch', 'Date', 'Time', 'Type', 'Label', 'Amount', 'Performed By', 'Transaction ID'],
    ];
    [...vaultTransactions]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .forEach(t => {
        const branchName = branches.find(b => b.id === t.branchId)?.name ?? t.branchId;
        const typeLabel =
          t.type === 'ADMIN_DEPOSIT' ? 'Admin Deposit' :
          t.type === 'DEPOSIT' ? 'Manager Deposit' :
          t.type === 'WITHDRAWAL' ? 'Withdrawal' :
          t.type === 'VAULT_WITHDRAWAL' ? 'Vault Withdrawal' : t.type;
        rows.push([
          branchName,
          t.timestamp.slice(0, 10),
          t.timestamp.length > 10 ? t.timestamp.slice(11, 16) : '',
          typeLabel,
          t.name ?? '',
          (t.type === 'WITHDRAWAL' || t.type === 'VAULT_WITHDRAWAL' ? '-' : '') + t.amount.toString(),
          t.performedBy ?? '',
          t.id,
        ]);
      });
    downloadCSV(rows, `vault-all-transactions-${new Date().toISOString().slice(0, 10)}.csv`);
    playSound('success');
  };

  const handleExportBranchCSV = (branchId: string, branchName: string, type: 'deposits' | 'withdrawals') => {
    const txList = type === 'deposits'
      ? (branchDepositHistory[branchId] ?? [])
      : (branchWithdrawalHistory[branchId] ?? []);

    if (txList.length === 0) return;

    const safeLabel = type === 'deposits' ? 'deposits' : 'withdrawals';
    const safeName = branchName.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_').toLowerCase();
    const rows: string[][] = [
      ['Branch', 'Date', 'Time', 'Type', 'Label', 'Amount', 'Performed By', 'Transaction ID'],
    ];

    txList.forEach(entry => {
      const typeLabel = type === 'withdrawals' ? 'Withdrawal'
        : ('category' in entry && entry.category === 'ADMIN_DEPOSIT') ? 'Admin Deposit' : 'Manager Deposit';
      const sign = type === 'withdrawals' ? '-' : '+';
      rows.push([
        branchName,
        entry.date,
        entry.timestamp.length > 10 ? entry.timestamp.slice(11, 16) : '',
        typeLabel,
        ('name' in entry ? entry.name ?? '' : entry.name),
        sign + entry.amount.toString(),
        entry.performedBy ?? '',
        entry.id,
      ]);
    });

    downloadCSV(rows, `vault-${safeLabel}-${safeName}-${new Date().toISOString().slice(0, 10)}.csv`);
    playSound('success');
  };

  const fetchBalances = () => {
    if (!supabase) return;
    supabase
      .from(DB_TABLES.BRANCH_VAULTS)
      .select(`${DB_COLUMNS.BRANCH_ID}, ${DB_COLUMNS.VAULT_BALANCE}`)
      .then(({ data }) => {
        if (!data) return;
        setVaultRows(prev => {
          const next = { ...prev };
          data.forEach((row: any) => {
            const id = row[DB_COLUMNS.BRANCH_ID];
            if (next[id]) next[id] = { ...next[id], balance: row[DB_COLUMNS.VAULT_BALANCE] ?? next[id].balance };
          });
          return next;
        });
      });
  };

  // Initial full fetch (balance + target + startDate) — runs on every mount (tab switch remounts this component)
  useEffect(() => {
    if (!supabase) { setLoadingVaults(false); return; }
    supabase
      .from(DB_TABLES.BRANCH_VAULTS)
      .select(`${DB_COLUMNS.BRANCH_ID}, ${DB_COLUMNS.VAULT_BALANCE}, ${DB_COLUMNS.VAULT_INITIAL_BALANCE}, ${DB_COLUMNS.VAULT_TARGET}, ${DB_COLUMNS.VAULT_START_DATE}`)
      .then(({ data }) => {
        if (data) {
          const map: Record<string, VaultRow> = {};
          data.forEach((row: any) => {
            map[row[DB_COLUMNS.BRANCH_ID]] = {
              branchId: row[DB_COLUMNS.BRANCH_ID],
              balance: row[DB_COLUMNS.VAULT_BALANCE] ?? 0,
              initialBalance: row[DB_COLUMNS.VAULT_INITIAL_BALANCE] ?? 0,
              target: row[DB_COLUMNS.VAULT_TARGET] ?? 0,
              startDate: row[DB_COLUMNS.VAULT_START_DATE] ?? null,
            };
          });
          setVaultRows(map);
        }
        setLoadingVaults(false);
      });
    // Fetch server-side aggregated totals (avoids PostgREST row cap)
    supabase.rpc('get_vault_totals').then(({ data }) => {
      if (!data) return;
      const map: Record<string, { deposited: number; depositCount: number; withdrawn: number; withdrawalCount: number }> = {};
      (data as any[]).forEach(row => {
        map[row.branch_id] = {
          deposited: Number(row.total_deposited ?? 0),
          depositCount: Number(row.deposit_count ?? 0),
          withdrawn: Number(row.total_withdrawn ?? 0),
          withdrawalCount: Number(row.withdrawal_count ?? 0),
        };
      });
      setVaultTotals(map);
    });
  }, []);

  // Poll balance every 30s while on this tab + refetch on browser window focus
  useEffect(() => {
    fetchBalances(); // immediate fetch on mount
    const interval = setInterval(fetchBalances, 30_000);
    const onFocus = () => {
      fetchBalances();
      onRefresh?.(); // also refresh salesReports so deposit history stays in sync
    };
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    const map: Record<string, boolean> = {};
    branches.forEach(b => { map[b.id] = b.vaultEnabled ?? false; });
    setLocalEnabled(map);
  }, [branches]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch full transaction history for the detail modal branch (bypasses global 1000-row cap)
  useEffect(() => {
    if (!detailBranchId || !supabase) { setDetailTxns([]); return; }
    setDetailTxnsLoading(true);
    supabase
      .from(DB_TABLES.VAULT_TRANSACTIONS)
      .select('*')
      .eq(DB_COLUMNS.BRANCH_ID, detailBranchId)
      .order(DB_COLUMNS.TIMESTAMP, { ascending: false })
      .then(({ data }) => {
        setDetailTxns((data || []).map((r: any) => ({
          id: r[DB_COLUMNS.ID],
          branchId: r[DB_COLUMNS.BRANCH_ID],
          reportId: r[DB_COLUMNS.REPORT_ID] ?? null,
          type: r[DB_COLUMNS.TYPE],
          amount: Number(r[DB_COLUMNS.AMOUNT] ?? 0),
          name: r[DB_COLUMNS.NAME] ?? null,
          timestamp: r[DB_COLUMNS.TIMESTAMP] ?? '',
          performedBy: r[DB_COLUMNS.PERFORMED_BY] ?? null,
          receiptImage: r[DB_COLUMNS.RECEIPT_IMAGE] ?? null,
          createdAt: r[DB_COLUMNS.CREATED_AT],
        })));
        setDetailTxnsLoading(false);
      });
  }, [detailBranchId]);

  // Reset tab and pagination when detail modal opens
  useEffect(() => {
    if (detailBranchId) {
      setTxHistoryTab('deposits');
      setVisibleDeposits(20);
      setVisibleWithdrawals(20);
    }
  }, [detailBranchId]);

  // Total deposited per branch = sum of DEPOSIT + ADMIN_DEPOSIT entries within the current vault cycle.
  // Transactions before the branch's startDate belong to a previous cycle and are excluded —
  // same guard that branchDepositHistory applies so the totals always match the displayed list.
  const historicalTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    vaultTransactions
      .filter(t => t.type === 'DEPOSIT' || t.type === 'ADMIN_DEPOSIT')
      .forEach(t => {
        const startDate = vaultRows[t.branchId]?.startDate;
        if (startDate && t.timestamp.slice(0, 10) < startDate) return;
        totals[t.branchId] = (totals[t.branchId] ?? 0) + t.amount;
      });
    return totals;
  }, [vaultTransactions, vaultRows]);

  const withdrawalTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    vaultTransactions
      .filter(t => t.type === 'WITHDRAWAL')
      .forEach(t => { totals[t.branchId] = (totals[t.branchId] ?? 0) + t.amount; });
    return totals;
  }, [vaultTransactions]);

  // Per-branch withdrawal history sourced from vault_transactions
  const branchWithdrawalHistory = useMemo(() => {
    const map: Record<string, Array<{ id: string; date: string; timestamp: string; amount: number; name: string; performedBy?: string | null }>> = {};
    [...vaultTransactions]
      .filter(t => t.type === 'WITHDRAWAL')
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .forEach(t => {
        if (!map[t.branchId]) map[t.branchId] = [];
        map[t.branchId].push({
          id: t.id,
          date: t.timestamp.slice(0, 10),
          timestamp: t.timestamp,
          amount: t.amount,
          name: t.name ?? '',
          performedBy: t.performedBy,
        });
      });
    return map;
  }, [vaultTransactions]);

  // Per-branch deposit history sourced from vault_transactions (single source of truth)
  const branchDepositHistory = useMemo(() => {
    const map: Record<string, Array<{ id: string; date: string; timestamp: string; amount: number; category: string; name: string | null; performedBy?: string | null }>> = {};
    [...vaultTransactions]
      .filter(t => t.type === 'DEPOSIT' || t.type === 'ADMIN_DEPOSIT')
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .forEach(t => {
        const startDate = vaultRows[t.branchId]?.startDate;
        if (startDate && t.timestamp.slice(0, 10) < startDate) return;
        if (!map[t.branchId]) map[t.branchId] = [];
        map[t.branchId].push({
          id: t.id,
          date: t.timestamp.slice(0, 10),
          timestamp: t.timestamp,
          amount: t.amount,
          category: t.type,
          name: t.name ?? null,
          performedBy: t.performedBy,
        });
      });
    return map;
  }, [vaultTransactions, vaultRows]);

  // Network-wide summary (enabled vaults only)
  const networkSummary = useMemo(() => {
    let totalBalance = 0;
    let totalTarget = 0;
    let fullCount = 0;
    const enabledBranches = branches.filter(b => localEnabled[b.id]);
    enabledBranches.forEach(b => {
      const row = vaultRows[b.id];
      const bal = row?.balance ?? 0;
      const tgt = row?.target ?? 0;
      totalBalance += bal;
      totalTarget += tgt;
      if (tgt > 0 && bal >= tgt) fullCount++;
    });
    const overallProgress = totalTarget > 0 ? Math.min(100, Math.round((totalBalance / totalTarget) * 100)) : 0;
    const disabledCount = branches.length - enabledBranches.length;
    return { totalBalance, totalTarget, fullCount, overallProgress, enabledCount: enabledBranches.length, disabledCount };
  }, [branches, localEnabled, vaultRows]);

  const startEdit = (branch: Branch) => {
    const row = vaultRows[branch.id];
    setEditTarget(String(row?.target ?? 0));
    setEditInitialBalance(String(row?.initialBalance ?? 0));
    setEditStartDate(row?.startDate ?? '');
    setEditingId(branch.id);
  };

  const handleSave = async (branchId: string) => {
    const parsedInitialBalance = parseFloat(editInitialBalance);
    const parsedTarget = parseFloat(editTarget);
    if (isNaN(parsedInitialBalance) || parsedInitialBalance < 0) return;
    if (isNaN(parsedTarget) || parsedTarget < 0) return;
    setSavingId(branchId);
    try {
      // Adjust the current live balance by the delta of the initial_balance change.
      // This preserves all existing deposits (manager + admin) and withdrawals in the
      // running balance — only the initial starting point shifts.
      const oldInitialBalance = vaultRows[branchId]?.initialBalance ?? 0;
      const currentBalance = vaultRows[branchId]?.balance ?? 0;
      const finalBalance = Math.max(0, currentBalance + (parsedInitialBalance - oldInitialBalance));

      const upsertPayload: Record<string, any> = {
        [DB_COLUMNS.BRANCH_ID]: branchId,
        [DB_COLUMNS.VAULT_TARGET]: parsedTarget,
        [DB_COLUMNS.VAULT_INITIAL_BALANCE]: parsedInitialBalance,
        [DB_COLUMNS.VAULT_BALANCE]: finalBalance,
      };
      if (editStartDate.trim()) upsertPayload[DB_COLUMNS.VAULT_START_DATE] = editStartDate.trim();
      const { error } = await supabase.from(DB_TABLES.BRANCH_VAULTS).upsert(upsertPayload, { onConflict: DB_COLUMNS.BRANCH_ID });
      if (error) throw error;
      setVaultRows(prev => ({
        ...prev,
        [branchId]: {
          branchId,
          target: parsedTarget,
          initialBalance: parsedInitialBalance,
          balance: finalBalance,
          startDate: editStartDate.trim() || (prev[branchId]?.startDate ?? null),
        },
      }));
      setEditingId(null);
      playSound('success');
      onRefresh?.();
    } catch {
      playSound('warning');
    } finally {
      setSavingId(null);
    }
  };

  const handleToggle = async (branch: Branch) => {
    if (isReadOnly || togglingId) return;
    const next = !localEnabled[branch.id];
    setTogglingId(branch.id);
    setLocalEnabled(prev => ({ ...prev, [branch.id]: next }));
    try {
      const { error } = await supabase.from(DB_TABLES.BRANCHES)
        .update({ [DB_COLUMNS.VAULT_ENABLED]: next })
        .eq(DB_COLUMNS.ID, branch.id);
      if (error) throw error;

      // When enabling, auto-upsert vault row with today as start_date if not already set
      if (next) {
        const today = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date());
        const existing = vaultRows[branch.id];
        if (!existing?.startDate) {
          await supabase.from(DB_TABLES.BRANCH_VAULTS).upsert({
            [DB_COLUMNS.BRANCH_ID]: branch.id,
            [DB_COLUMNS.VAULT_TARGET]: existing?.target ?? 0,
            [DB_COLUMNS.VAULT_INITIAL_BALANCE]: existing?.initialBalance ?? 0,
            [DB_COLUMNS.VAULT_BALANCE]: existing?.balance ?? 0,
            [DB_COLUMNS.VAULT_START_DATE]: today,
          }, { onConflict: DB_COLUMNS.BRANCH_ID });
          setVaultRows(prev => ({
            ...prev,
            [branch.id]: { branchId: branch.id, target: existing?.target ?? 0, initialBalance: existing?.initialBalance ?? 0, balance: existing?.balance ?? 0, startDate: today },
          }));
        }
      }

      playSound('click');
      onRefresh?.();
    } catch {
      setLocalEnabled(prev => ({ ...prev, [branch.id]: !next }));
      playSound('warning');
    } finally {
      setTogglingId(null);
    }
  };

  const handleAdminDeposit = async (branchId: string) => {
    const amt = parseFloat(depositInput);
    if (!amt || amt <= 0) return;
    setSavingDepositId(branchId);
    try {
      const now = new Date();
      const todayManilaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now);
      // Use source report date for the tx timestamp if pulling from a previous ROI,
      // so the deposit appears on the correct day in vault history.
      const txDate = roiSourceDate || todayManilaDate;
      // Place it at 23:59:30 of that date so it sorts after regular day transactions
      const timestamp = `${txDate}T23:59:30+08:00`;
      const deterministicId = `vault_admin_deposit_${branchId}_${txDate}`;

      // Fetch live DB state to avoid stale-state conflicts
      const [{ data: liveDepositRows }, { data: liveVaultRow }] = await Promise.all([
        supabase
          .from(DB_TABLES.VAULT_TRANSACTIONS)
          .select('id, amount')
          .eq(DB_COLUMNS.BRANCH_ID, branchId)
          .eq(DB_COLUMNS.TYPE, 'ADMIN_DEPOSIT')
          .gte(DB_COLUMNS.TIMESTAMP, `${txDate}T00:00:00+08:00`)
          .lte(DB_COLUMNS.TIMESTAMP, `${txDate}T23:59:59+08:00`)
          .limit(1),
        supabase
          .from(DB_TABLES.BRANCH_VAULTS)
          .select(DB_COLUMNS.VAULT_BALANCE)
          .eq(DB_COLUMNS.BRANCH_ID, branchId)
          .single(),
      ]);
      const liveDeposit = liveDepositRows?.[0] ?? null;
      const liveBalance: number = (liveVaultRow as any)?.[DB_COLUMNS.VAULT_BALANCE] ?? vaultRows[branchId]?.balance ?? 0;

      let txErr: any;
      if (liveDeposit) {
        // Update existing ADMIN_DEPOSIT row for that date
        const newAmt = (liveDeposit.amount ?? 0) + amt;
        ({ error: txErr } = await supabase
          .from(DB_TABLES.VAULT_TRANSACTIONS)
          .update({ [DB_COLUMNS.AMOUNT]: newAmt, [DB_COLUMNS.TIMESTAMP]: timestamp })
          .eq(DB_COLUMNS.ID, liveDeposit.id));
        if (txErr) throw txErr;
      } else {
        // No ADMIN_DEPOSIT yet for that date — insert with deterministic ID
        ({ error: txErr } = await supabase
          .from(DB_TABLES.VAULT_TRANSACTIONS)
          .insert({
            [DB_COLUMNS.ID]: deterministicId,
            [DB_COLUMNS.BRANCH_ID]: branchId,
            [DB_COLUMNS.TYPE]: 'ADMIN_DEPOSIT',
            [DB_COLUMNS.AMOUNT]: amt,
            [DB_COLUMNS.NAME]: 'VAULT DEPOSIT (ADMIN)',
            [DB_COLUMNS.TIMESTAMP]: timestamp,
            [DB_COLUMNS.PERFORMED_BY]: 'ADMIN',
          }));
        if (txErr) throw txErr;
      }

      // Update vault balance
      const newBalance = liveBalance + amt;
      const { error: vaultErr } = await supabase
        .from(DB_TABLES.BRANCH_VAULTS)
        .update({ [DB_COLUMNS.VAULT_BALANCE]: newBalance })
        .eq(DB_COLUMNS.BRANCH_ID, branchId);
      if (vaultErr) throw vaultErr;
      setVaultRows(prev => ({ ...prev, [branchId]: { ...prev[branchId], branchId, balance: newBalance } }));

      // If pulling from a specific report's ROI, update that report's net_roi and vault provision
      if (roiSourceDate) {
        const { data: reportRows } = await supabase
          .from(DB_TABLES.SALES_REPORTS)
          .select('id, net_roi, total_vault_provision')
          .eq(DB_COLUMNS.BRANCH_ID, branchId)
          .eq(DB_COLUMNS.REPORT_DATE, roiSourceDate)
          .limit(1);
        const sourceReport = reportRows?.[0] ?? null;
        if (sourceReport) {
          await supabase
            .from(DB_TABLES.SALES_REPORTS)
            .update({
              [DB_COLUMNS.NET_ROI]: Number(sourceReport[DB_COLUMNS.NET_ROI] ?? 0) - amt,
              [DB_COLUMNS.TOTAL_VAULT_PROVISION]: Number(sourceReport[DB_COLUMNS.TOTAL_VAULT_PROVISION] ?? 0) + amt,
            })
            .eq(DB_COLUMNS.ID, sourceReport.id);
        }
      }

      setDepositingId(null);
      setDepositInput('');
      setRoiSourceDate('');
      playSound('success');
      onRefresh?.();
    } catch {
      playSound('warning');
    } finally {
      setSavingDepositId(null);
    }
  };

  const toggleHistory = (id: string) => {
    setHistoryOpen(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Recent positive net ROI entries per branch — used for "Pull from ROI" dropdown
  const roiOptionsByBranch = useMemo(() => {
    const map: Record<string, { amount: number; date: string }[]> = {};
    [...salesReports]
      .sort((a, b) => (b.reportDate || '').localeCompare(a.reportDate || ''))
      .forEach(r => {
        if (r.netRoi > 0) {
          if (!map[r.branchId]) map[r.branchId] = [];
          if (map[r.branchId].length < 10) {
            map[r.branchId].push({ amount: r.netRoi, date: r.reportDate });
          }
        }
      });
    return map;
  }, [salesReports]);

  const enabledCount = Object.values(localEnabled).filter(Boolean).length;

  const FILTER_OPTIONS: { value: typeof vaultFilter; label: string }[] = [
    { value: 'all', label: 'All Status' },
    { value: 'enabled', label: 'Vault On' },
    { value: 'disabled', label: 'Vault Off' },
    { value: 'full', label: 'Full' },
  ];
  const SORT_OPTIONS: { value: SortMode; label: string }[] = [
    { value: 'name', label: 'A – Z' },
    { value: 'progress', label: 'By Progress' },
    { value: 'balance', label: 'By Balance' },
  ];
  const activeSortLabel = SORT_OPTIONS.find(o => o.value === sortMode)?.label ?? 'Sort';
  const activeFilterLabel = vaultFilter === 'all' ? 'Status' : (FILTER_OPTIONS.find(o => o.value === vaultFilter)?.label ?? 'Status');

  const filteredBranches = useMemo(() => {
    let result = [...branches];

    // Branch multi-select filter
    if (selectedBranchIds.length > 0) {
      result = result.filter(b => selectedBranchIds.includes(b.id));
    }

    // Search: name, balance, target, deposited amount
    if (searchTerm.trim()) {
      const term = searchTerm.trim();
      result = result.filter(b => {
        if (b.name.toUpperCase().includes(term)) return true;
        const row = vaultRows[b.id];
        const bal = (row?.balance ?? 0).toString();
        const tgt = (row?.target ?? 0).toString();
        const dep = (vaultTotals[b.id]?.deposited ?? 0).toString();
        return bal.includes(term) || tgt.includes(term) || dep.includes(term);
      });
    }

    // Vault status filter
    if (vaultFilter === 'enabled') result = result.filter(b => localEnabled[b.id]);
    else if (vaultFilter === 'disabled') result = result.filter(b => !localEnabled[b.id]);
    else if (vaultFilter === 'full') result = result.filter(b => {
      const row = vaultRows[b.id];
      return (row?.target ?? 0) > 0 && (row?.balance ?? 0) >= (row?.target ?? 0);
    });

    // Sort
    result.sort((a, b) => {
      if (sortMode === 'name') return a.name.localeCompare(b.name);
      if (sortMode === 'balance') return (vaultRows[b.id]?.balance ?? 0) - (vaultRows[a.id]?.balance ?? 0);
      if (sortMode === 'progress') {
        const getProgress = (br: Branch) => {
          const row = vaultRows[br.id];
          const bal = row?.balance ?? 0;
          const tgt = row?.target ?? 0;
          return tgt > 0 ? bal / tgt : -1;
        };
        return getProgress(b) - getProgress(a);
      }
      return 0;
    });

    return result;
  }, [branches, selectedBranchIds, searchTerm, vaultFilter, localEnabled, vaultRows, sortMode, vaultTotals]);

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight leading-none">Vault Fund</h2>
          {loadingVaults ? (
            <div className="h-2.5 w-44 bg-slate-200 rounded-full animate-pulse mt-2" />
          ) : (
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">
              {enabledCount} of {branches.length} branches enabled
            </p>
          )}
        </div>
      </div>

      {/* Network Summary */}
      <div className="bg-slate-900 rounded-[28px] p-5 sm:p-6 space-y-4">
        {loadingVaults ? (
          <>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="space-y-2.5">
                <div className="h-2 w-32 bg-white/10 rounded-full animate-pulse" />
                <div className="h-9 w-52 bg-white/[0.12] rounded-xl animate-pulse" />
                <div className="h-2 w-40 bg-white/[0.06] rounded-full animate-pulse" />
              </div>
              <div className="flex gap-2 shrink-0">
                {[0,1,2].map(i => (
                  <div key={i} className="flex items-center gap-2.5 bg-white/5 border border-white/10 rounded-2xl px-3 py-2.5">
                    <div className="w-7 h-7 rounded-xl bg-white/10 animate-pulse shrink-0" />
                    <div className="space-y-1.5">
                      <div className="h-4 w-6 bg-white/10 rounded animate-pulse" />
                      <div className="h-1.5 w-10 bg-white/[0.06] rounded-full animate-pulse" />
                      <div className="h-1.5 w-14 bg-white/[0.04] rounded-full animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between">
                <div className="h-2 w-24 bg-white/10 rounded-full animate-pulse" />
                <div className="h-2 w-8 bg-white/10 rounded-full animate-pulse" />
              </div>
              <div className="h-2.5 bg-white/10 rounded-full">
                <div className="h-full w-2/5 bg-white/[0.08] rounded-full animate-pulse" />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              {/* Balance */}
              <div className="min-w-0">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Network Vault Balance</p>
                <p className="text-3xl font-black text-white tabular-nums leading-none mt-1">
                  ₱{networkSummary.totalBalance.toLocaleString()}
                </p>
                {networkSummary.totalTarget > 0 && (
                  <p className="text-[9px] font-bold text-slate-400 mt-1">
                    of ₱{networkSummary.totalTarget.toLocaleString()} combined target
                  </p>
                )}
              </div>

              {/* KPI pills */}
              <div className="flex gap-2 shrink-0">
                {/* Vault On */}
                <div className="flex items-center gap-2.5 bg-emerald-500/15 border border-emerald-500/25 rounded-2xl px-3 py-2.5">
                  <div className="w-7 h-7 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-base font-black text-emerald-400 tabular-nums leading-none">{networkSummary.enabledCount}</p>
                    <p className="text-[7px] font-black text-emerald-500 uppercase tracking-widest leading-none mt-0.5">Saving</p>
                    <p className="text-[7px] text-emerald-600/70 leading-none mt-0.5">vault enabled</p>
                  </div>
                </div>

                {/* Vault Off */}
                {networkSummary.disabledCount > 0 && (
                  <div className="flex items-center gap-2.5 bg-white/5 border border-white/10 rounded-2xl px-3 py-2.5">
                    <div className="w-7 h-7 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-base font-black text-slate-400 tabular-nums leading-none">{networkSummary.disabledCount}</p>
                      <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest leading-none mt-0.5">Inactive</p>
                      <p className="text-[7px] text-slate-600 leading-none mt-0.5">not enrolled</p>
                    </div>
                  </div>
                )}

                {/* Full */}
                <div className={`flex items-center gap-2.5 rounded-2xl px-3 py-2.5 border ${networkSummary.fullCount > 0 ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-white/5 border-white/10'}`}>
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${networkSummary.fullCount > 0 ? 'bg-emerald-500/20' : 'bg-white/5'}`}>
                    <svg className={`w-3.5 h-3.5 ${networkSummary.fullCount > 0 ? 'text-emerald-400' : 'text-slate-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                  </div>
                  <div>
                    <p className={`text-base font-black tabular-nums leading-none ${networkSummary.fullCount > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>{networkSummary.fullCount}</p>
                    <p className={`text-[7px] font-black uppercase tracking-widest leading-none mt-0.5 ${networkSummary.fullCount > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>At Target</p>
                    <p className={`text-[7px] leading-none mt-0.5 ${networkSummary.fullCount > 0 ? 'text-emerald-600/70' : 'text-slate-700'}`}>goal reached</p>
                  </div>
                </div>
              </div>
            </div>

            {networkSummary.totalTarget > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Overall Progress</span>
                  <span className={`text-[8px] font-black uppercase tracking-widest ${networkSummary.overallProgress >= 100 ? 'text-emerald-400' : 'text-slate-300'}`}>
                    {networkSummary.overallProgress}%
                  </span>
                </div>
                <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${networkSummary.overallProgress >= 100 ? 'bg-emerald-500' : 'bg-emerald-400'}`}
                    style={{ width: `${networkSummary.overallProgress}%` }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Search + Branch selector + Filter + Sort */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search: name, balance, target, deposit */}
        <div className="relative flex-1 min-w-[160px] group">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-500 transition-colors pointer-events-none">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          <input
            type="text"
            placeholder="Search name, balance, target…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value.toUpperCase())}
            className="w-full h-10 pl-9 pr-8 bg-white border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 uppercase placeholder:text-slate-300 placeholder:font-medium placeholder:normal-case focus:bg-white focus:border-slate-400 focus:ring-2 focus:ring-slate-400/10 transition-all outline-none"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          )}
        </div>

        {/* Branch multi-select */}
        <div className="shrink-0 w-44">
          <BranchCheckboxDropdown
            branches={branches}
            selectedIds={selectedBranchIds}
            onChange={setSelectedBranchIds}
            placeholder="All Branches"
          />
        </div>

        {/* Vault status filter dropdown */}
        <div ref={filterRef} className="relative shrink-0">
          <button
            onClick={() => { setFilterOpen(o => !o); setSortOpen(false); }}
            className={`h-10 flex items-center gap-2 px-3.5 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all outline-none ${
              filterOpen
                ? 'bg-white border-emerald-500 ring-4 ring-emerald-500/10 text-slate-900'
                : vaultFilter !== 'all'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : 'bg-white border-slate-200 hover:border-slate-300 text-slate-600'
            }`}
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 9h10M11 14h2" />
            </svg>
            <span className="hidden sm:inline">{activeFilterLabel}</span>
            <svg className={`w-3 h-3 shrink-0 transition-transform duration-200 ${filterOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {vaultFilter !== 'all' && !filterOpen && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-500 text-white text-[7px] font-black flex items-center justify-center leading-none pointer-events-none">1</span>
          )}
          {filterOpen && (
            <div className="absolute z-[200] top-[calc(100%+6px)] right-0 min-w-[168px] bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 ring-1 ring-slate-900/5">
              {FILTER_OPTIONS.map(({ value, label }) => {
                const checked = vaultFilter === value;
                return (
                  <button
                    key={value}
                    onClick={() => { setVaultFilter(value); setFilterOpen(false); playSound('click'); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors ${checked ? 'bg-slate-50' : ''}`}
                  >
                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                      {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M5 13l4 4L19 7" /></svg>}
                    </span>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${checked ? 'text-slate-900' : 'text-slate-500'}`}>{label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Sort dropdown */}
        <div ref={sortRef} className="relative shrink-0">
          <button
            onClick={() => { setSortOpen(o => !o); setFilterOpen(false); }}
            className={`h-10 flex items-center gap-2 px-3.5 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all outline-none ${
              sortOpen
                ? 'bg-white border-indigo-500 ring-4 ring-indigo-500/10 text-slate-900'
                : sortMode !== 'name'
                ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                : 'bg-white border-slate-200 hover:border-slate-300 text-slate-600'
            }`}
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M6 12h12M10 18h4" />
            </svg>
            <span className="hidden sm:inline">{activeSortLabel}</span>
            <svg className={`w-3 h-3 shrink-0 transition-transform duration-200 ${sortOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {sortOpen && (
            <div className="absolute z-[200] top-[calc(100%+6px)] right-0 min-w-[168px] bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 ring-1 ring-slate-900/5">
              {SORT_OPTIONS.map(({ value, label }) => {
                const checked = sortMode === value;
                return (
                  <button
                    key={value}
                    onClick={() => { setSortMode(value); setSortOpen(false); playSound('click'); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors ${checked ? 'bg-slate-50' : ''}`}
                  >
                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300'}`}>
                      {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M5 13l4 4L19 7" /></svg>}
                    </span>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${checked ? 'text-slate-900' : 'text-slate-500'}`}>{label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Export CSV button */}
        <button
          onClick={handleExportAllCSV}
          title="Export all vault transactions as CSV"
          className="h-10 flex items-center gap-2 px-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 text-slate-600 hover:text-slate-800 text-[11px] font-black uppercase tracking-widest transition-all outline-none shrink-0"
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
          </svg>
          <span className="hidden sm:inline">Export All</span>
        </button>
      </div>

      {/* Cards (mobile) / Table (desktop) */}
      {loadingVaults ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
        </div>
      ) : filteredBranches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 opacity-40">
          <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">No branches match</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block bg-white rounded-[20px] border border-slate-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="px-5 py-3.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Branch</th>
                  <th className="px-4 py-3.5 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Balance</th>
                  <th className="px-4 py-3.5 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Initial</th>
                  <th className="px-4 py-3.5 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Deposited</th>
                  <th className="px-4 py-3.5 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Withdrawals</th>
                  <th className="px-4 py-3.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest w-40">Progress</th>
                  <th className="px-5 py-3.5 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredBranches.map(branch => {
                  const row = vaultRows[branch.id];
                  const rowTotals = vaultTotals[branch.id];
                  const isToggling = togglingId === branch.id;
                  const enabled = localEnabled[branch.id] ?? false;
                  const balance = row?.balance ?? 0;
                  const initialBalance = row?.initialBalance ?? 0;
                  const target = row?.target ?? 0;
                  const progress = target > 0 ? Math.min(100, Math.round((balance / target) * 100)) : 0;
                  const isFull = target > 0 && balance >= target;
                  const notConfigured = enabled && target === 0;
                  const depositCount = rowTotals?.depositCount ?? 0;
                  return (
                    <tr key={branch.id} onClick={() => setDetailBranchId(branch.id)} className="hover:bg-slate-50/60 transition-colors cursor-pointer">
                      {/* Branch */}
                      <td className="px-5 py-4">
                        <p className={`text-[12px] font-black uppercase tracking-wide ${enabled ? 'text-slate-900' : 'text-slate-400'}`}>{branch.name}</p>
                        {enabled && row?.startDate && (
                          <p className="text-[8px] font-bold text-slate-400 mt-0.5">Since {row.startDate}</p>
                        )}
                        {depositCount > 0 && (
                          <p className="text-[8px] font-bold text-slate-300 mt-0.5">{depositCount} deposit{depositCount !== 1 ? 's' : ''}</p>
                        )}
                      </td>
                      {/* Balance */}
                      <td className="px-4 py-4 text-right">
                        <span className={`text-[13px] font-black tabular-nums ${!enabled ? 'text-slate-300' : isFull ? 'text-emerald-600' : notConfigured ? 'text-amber-600' : 'text-slate-900'}`}>
                          {enabled ? `₱${balance.toLocaleString()}` : '—'}
                        </span>
                      </td>
                      {/* Initial */}
                      <td className="px-4 py-4 text-right">
                        <span className={`text-[12px] font-black tabular-nums ${enabled && initialBalance > 0 ? 'text-slate-500' : 'text-slate-300'}`}>
                          {enabled && initialBalance > 0 ? `₱${initialBalance.toLocaleString()}` : '—'}
                        </span>
                      </td>
                      {/* Deposited */}
                      <td className="px-4 py-4 text-right">
                        <span className={`text-[12px] font-black tabular-nums ${row?.startDate && (rowTotals?.deposited ?? 0) > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                          {row?.startDate && (rowTotals?.deposited ?? 0) > 0 ? `₱${(rowTotals?.deposited ?? 0).toLocaleString()}` : '—'}
                        </span>
                      </td>
                      {/* Withdrawals */}
                      <td className="px-4 py-4 text-right">
                        {(() => { const w = rowTotals?.withdrawn ?? 0; return (
                          <span className={`text-[12px] font-black tabular-nums ${w > 0 ? 'text-rose-500' : 'text-slate-300'}`}>
                            {w > 0 ? `₱${w.toLocaleString()}` : '—'}
                          </span>
                        ); })()}
                      </td>
                      {/* Progress */}
                      <td className="px-4 py-4 w-40">
                        {enabled && target > 0 ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <span className={`text-[8px] font-black tabular-nums ${isFull ? 'text-emerald-600' : 'text-slate-500'}`}>{progress}%</span>
                              <span className="text-[7px] font-bold text-indigo-400 tabular-nums">₱{target.toLocaleString()}</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all duration-500 ${isFull ? 'bg-emerald-500' : 'bg-emerald-400'}`} style={{ width: `${progress}%` }} />
                            </div>
                          </div>
                        ) : enabled ? (
                          <span className="text-[8px] font-bold text-amber-400 uppercase tracking-widest">No target</span>
                        ) : (
                          <span className="text-slate-200 text-[10px]">—</span>
                        )}
                      </td>
                      {/* Actions */}
                      <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {!isReadOnly && enabled && (
                            <button
                              onClick={() => { setDetailBranchId(branch.id); setDepositingId(branch.id); setEditingId(null); setDepositInput(''); playSound('click'); }}
                              className="h-7 px-2.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 text-[8px] font-black uppercase tracking-widest transition-all flex items-center gap-1"
                            >
                              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0 0l-6-6m6 6l6-6" /></svg>
                              Deposit
                            </button>
                          )}
                          {!isReadOnly && (
                            <button
                              onClick={() => { setDetailBranchId(branch.id); startEdit(branch); setDepositingId(null); }}
                              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-all"
                              title="Configure vault"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() => { if (!isReadOnly && !isToggling) setConfirmToggleBranch(branch); }}
                            disabled={isReadOnly || isToggling}
                            title={enabled ? 'Disable vault' : 'Enable vault'}
                            className={`relative rounded-full transition-all duration-300 shrink-0 disabled:opacity-50 cursor-pointer ${enabled ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.35)]' : 'bg-slate-200'}`}
                            style={{ height: '22px', width: '40px' }}
                          >
                            <span className={`absolute top-[2px] w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-all duration-300 ${enabled ? 'left-[20px]' : 'left-[2px]'}`} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden grid grid-cols-1 gap-4">
          {filteredBranches.map(branch => {
            const row = vaultRows[branch.id];
            const rowTotals = vaultTotals[branch.id];
            const isEditing = editingId === branch.id;
            const isDepositing = depositingId === branch.id;
            const isSaving = savingId === branch.id;
            const isSavingDeposit = savingDepositId === branch.id;
            const isToggling = togglingId === branch.id;
            const enabled = localEnabled[branch.id] ?? false;
            const balance = row?.balance ?? 0;
            const initialBalance = row?.initialBalance ?? 0;
            const target = row?.target ?? 0;
            const progress = target > 0 ? Math.min(100, Math.round((balance / target) * 100)) : 0;
            const isFull = target > 0 && balance >= target;
            const notConfigured = target === 0 && balance === 0;
            const depositCount = rowTotals?.depositCount ?? 0;

            // card state: off | unconfigured (on, no target) | in-progress | full
            const cardState = !enabled ? 'off' : isFull ? 'full' : notConfigured ? 'unconfigured' : 'active';

            return (
              <div
                key={branch.id}
                className={`rounded-[24px] border-2 transition-all duration-300 overflow-hidden ${
                  cardState === 'off'
                    ? 'bg-white border-slate-100'
                    : cardState === 'unconfigured'
                    ? 'bg-white border-amber-200 shadow-sm shadow-amber-50'
                    : cardState === 'full'
                    ? 'bg-white border-emerald-300 shadow-md shadow-emerald-50'
                    : 'bg-white border-emerald-100 shadow-sm'
                }`}
              >
                {/* Card Header */}
                <div className={`px-5 pt-5 pb-4 ${
                  cardState === 'full' ? 'bg-emerald-50/60'
                  : cardState === 'unconfigured' ? 'bg-amber-50/40'
                  : ''
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className={`text-[13px] font-black uppercase tracking-wide truncate leading-none ${
                        cardState === 'off' ? 'text-slate-400' : 'text-slate-900'
                      }`}>
                        {branch.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {cardState === 'off' && (
                          <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Vault off</span>
                        )}
                        {cardState === 'unconfigured' && (
                          <span className="text-[8px] font-black text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full uppercase tracking-widest">
                            No target set
                          </span>
                        )}
                        {(cardState === 'active' || cardState === 'full') && row?.startDate && (
                          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                            Since {row.startDate}
                          </span>
                        )}
                        {cardState === 'full' && (
                          <span className="text-[8px] font-black text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full uppercase tracking-widest">
                            Target Reached
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Toggle + deposit + edit */}
                    <div className="flex items-center gap-2 shrink-0">
                      {!isReadOnly && enabled && !isEditing && !isDepositing && (
                        <button
                          onClick={() => { setDepositingId(branch.id); setDepositInput(''); setEditingId(null); playSound('click'); }}
                          className="h-8 px-3 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-700 hover:text-emerald-900 text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5"
                          title="Deposit to vault"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0 0l-6-6m6 6l6-6" />
                          </svg>
                          Deposit
                        </button>
                      )}
                      {!isReadOnly && !isEditing && !isDepositing && (
                        <button
                          onClick={() => { startEdit(branch); setDepositingId(null); }}
                          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                            cardState === 'unconfigured'
                              ? 'bg-amber-100 hover:bg-amber-200 text-amber-500 hover:text-amber-700'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700'
                          }`}
                          title="Configure vault"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => { if (!isReadOnly && !isToggling) setConfirmToggleBranch(branch); }}
                        disabled={isReadOnly || isToggling}
                        title={enabled ? 'Disable vault' : 'Enable vault'}
                        className={`relative rounded-full transition-all duration-300 shrink-0 disabled:opacity-50 cursor-pointer ${
                          enabled ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.35)]' : 'bg-slate-200'
                        }`}
                        style={{ height: '26px', width: '46px' }}
                      >
                        <span
                          className={`absolute top-[3px] w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${
                            enabled ? 'left-[23px]' : 'left-[3px]'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Balance + progress — with target */}
                  {(cardState === 'active' || cardState === 'full') && target > 0 && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[7px] font-black text-indigo-400 uppercase tracking-widest">Target ₱{target.toLocaleString()}</p>
                        <span className={`text-[7px] font-black uppercase tracking-widest tabular-nums ${isFull ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {isFull ? '✓ Reached' : `${progress}%`}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${isFull ? 'bg-emerald-500' : 'bg-emerald-400'}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div>
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Current Fund</p>
                        <p className={`text-2xl font-black tabular-nums leading-none ${isFull ? 'text-emerald-600' : 'text-slate-900'}`}>
                          ₱{balance.toLocaleString()}
                        </p>
                        {!isFull && (
                          <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 tabular-nums">
                            ₱{(target - balance).toLocaleString()} to go
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Unconfigured state — vault on but no target */}
                  {cardState === 'unconfigured' && !isEditing && (
                    <div className="mt-4 space-y-3">
                      {row?.startDate && (rowTotals?.deposited ?? 0) > 0 && (
                        <div className="flex items-end justify-between">
                          <div>
                            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Deposited so far</p>
                            <p className="text-2xl font-black tabular-nums leading-none text-emerald-600">
                              ₱{(rowTotals?.deposited ?? 0).toLocaleString()}
                            </p>
                          </div>
                          <div className="h-2 w-24 bg-amber-100 rounded-full overflow-hidden self-center">
                            <div className="h-full w-full bg-amber-300 rounded-full animate-pulse" />
                          </div>
                        </div>
                      )}
                      {!isReadOnly && (
                        <button
                          onClick={() => startEdit(branch)}
                          className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[9px] font-black uppercase tracking-widest transition-all active:scale-95"
                        >
                          Set Target →
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Stats row — initial / deposited / withdrawals */}
                <div className={`px-5 py-3.5 grid gap-3 border-t border-slate-50 ${
                  cardState === 'off' ? 'grid-cols-1' : 'grid-cols-3'
                }`}>
                  {cardState === 'off' ? (
                    <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest text-center">Vault disabled for this branch</p>
                  ) : (
                    <>
                      <div>
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Initial</p>
                        <p className={`text-[13px] font-black tabular-nums leading-none ${initialBalance > 0 ? 'text-slate-500' : 'text-slate-300'}`}>
                          {initialBalance > 0 ? `₱${initialBalance.toLocaleString()}` : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Deposited</p>
                        <p className={`text-[13px] font-black tabular-nums leading-none ${row?.startDate && (rowTotals?.deposited ?? 0) > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                          {row?.startDate && (rowTotals?.deposited ?? 0) > 0 ? `₱${(rowTotals?.deposited ?? 0).toLocaleString()}` : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Withdrawn</p>
                        {(() => { const w = rowTotals?.withdrawn ?? 0; return (
                          <p className={`text-[13px] font-black tabular-nums leading-none ${w > 0 ? 'text-rose-500' : 'text-slate-300'}`}>
                            {w > 0 ? `₱${w.toLocaleString()}` : '—'}
                          </p>
                        ); })()}
                      </div>
                    </>
                  )}
                </div>

                {/* View full history button (mobile only — desktop uses row click) */}
                {enabled && (
                  <div className="border-t border-slate-50 px-5 py-3">
                    <button
                      onClick={() => { setDetailBranchId(branch.id); playSound('click'); }}
                      className="w-full flex items-center justify-center gap-2 h-9 rounded-xl bg-slate-50 hover:bg-slate-100 text-[9px] font-black text-slate-500 uppercase tracking-widest transition-all active:scale-95"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      View Deposit & Withdrawal History
                    </button>
                  </div>
                )}

                {/* Deposit History */}
                {enabled && depositCount > 0 && (
                  <div className="border-t border-slate-50">
                    <button
                      onClick={() => toggleHistory(branch.id)}
                      className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors"
                    >
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                        Deposit History · {depositCount} {depositCount === 1 ? 'entry' : 'entries'}
                      </span>
                      <svg
                        className={`w-3.5 h-3.5 text-slate-300 transition-transform duration-200 ${historyOpen.has(branch.id) ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {historyOpen.has(branch.id) && (
                      <div className="px-5 pb-4 max-h-52 overflow-y-auto overscroll-contain space-y-px">
                        {(branchDepositHistory[branch.id] ?? []).slice(0, 30).map((entry, i) => {
                          const [y, m, d] = entry.date.split('-').map(Number);
                          const formatted = new Intl.DateTimeFormat('en-PH', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          }).format(new Date(y, m - 1, d));
                          const isAdmin = entry.category === 'ADMIN_DEPOSIT';
                          return (
                            <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] font-bold text-slate-400">{formatted}</span>
                                <span className={`text-[8px] font-black uppercase tracking-widest ${isAdmin ? 'text-violet-400' : 'text-emerald-500'}`}>
                                  {isAdmin ? 'Admin' : 'Manager'}
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-[11px] font-black text-emerald-600 tabular-nums">
                                  +₱{entry.amount.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Deposit form */}
                {!isReadOnly && isDepositing && (() => {
                  const roiOptions = roiOptionsByBranch[branch.id] ?? [];
                  return (
                  <div className="px-5 pb-5 pt-4 space-y-3 border-t border-emerald-100 bg-emerald-50/40 animate-in slide-in-from-top-1 duration-150">
                    <div className="flex items-center justify-between">
                      <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Deposit to Vault</p>
                      {roiOptions.length > 0 && (
                        <div className="relative">
                          <select
                            defaultValue=""
                            onChange={e => { if (e.target.value) { const [date, amount] = e.target.value.split('||'); setDepositInput(amount); setRoiSourceDate(date); playSound('click'); } }}
                            className="h-6 pl-2 pr-6 rounded-lg bg-indigo-50 border border-indigo-200 text-[9px] font-black text-indigo-600 uppercase tracking-widest appearance-none outline-none cursor-pointer hover:bg-indigo-100 transition-all"
                          >
                            <option value="" disabled>↓ Pull from ROI</option>
                            {roiOptions.map(opt => (
                              <option key={opt.date} value={`${opt.date}||${opt.amount}`}>
                                {new Date(opt.date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} — ₱{opt.amount.toLocaleString()}
                              </option>
                            ))}
                          </select>
                          <svg className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xs">₱</span>
                        <input
                          type="number"
                          min="0"
                          autoFocus
                          value={depositInput}
                          onChange={e => setDepositInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleAdminDeposit(branch.id)}
                          placeholder="Amount"
                          className="w-full pl-6 pr-2 py-2.5 rounded-xl bg-white border border-emerald-200 font-bold text-[13px] text-slate-900 outline-none focus:border-emerald-500 transition-all"
                        />
                      </div>
                      <button
                        onClick={() => { setDepositingId(null); setDepositInput(''); setRoiSourceDate(''); }}
                        className="h-10 px-3 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleAdminDeposit(branch.id)}
                        disabled={isSavingDeposit || !parseFloat(depositInput) || parseFloat(depositInput) <= 0}
                        className="h-10 px-4 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-40 shrink-0"
                      >
                        {isSavingDeposit ? '…' : 'Confirm'}
                      </button>
                    </div>
                    {parseFloat(depositInput) > 0 && (
                      <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">
                        New balance: ₱{(balance + parseFloat(depositInput)).toLocaleString()}
                      </p>
                    )}
                  </div>
                  );
                })()}

                {/* Edit form */}
                {!isReadOnly && isEditing && (
                  <div className="px-5 pb-5 space-y-3 border-t border-slate-100 pt-4">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Target (₱)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xs">₱</span>
                          <input
                            type="number"
                            min="0"
                            value={editTarget}
                            onChange={e => setEditTarget(e.target.value)}
                            placeholder="0"
                            className="w-full pl-6 pr-2 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-[12px] text-slate-900 outline-none focus:border-indigo-400 focus:bg-white transition-all"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Initial Balance (₱)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xs">₱</span>
                          <input
                            type="number"
                            min="0"
                            value={editInitialBalance}
                            onChange={e => setEditInitialBalance(e.target.value)}
                            placeholder="0"
                            className="w-full pl-6 pr-2 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-[12px] text-slate-900 outline-none focus:border-emerald-400 focus:bg-white transition-all"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                        Start Date
                        <span className="ml-2 normal-case font-bold text-slate-300">(reports before this = Rent & Bills)</span>
                      </label>
                      <input
                        type="date"
                        value={editStartDate}
                        onChange={e => setEditStartDate(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-[12px] text-slate-900 outline-none focus:border-emerald-400 focus:bg-white transition-all"
                      />
                    </div>

                    {(() => {
                      const newInit = parseFloat(editInitialBalance) || 0;
                      const oldInit = row?.initialBalance ?? 0;
                      const delta = newInit - oldInit;
                      const currentBal = row?.balance ?? 0;
                      if (delta === 0) return null;
                      return (
                        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-indigo-50 border border-indigo-100">
                          <p className="text-[9px] font-bold text-indigo-700 uppercase tracking-widest leading-relaxed">
                            Balance will {delta > 0 ? 'increase' : 'decrease'} by ₱{Math.abs(delta).toLocaleString()} → New balance: ₱{Math.max(0, currentBal + delta).toLocaleString()}
                          </p>
                        </div>
                      );
                    })()}

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => setEditingId(null)}
                        className="flex-1 py-2.5 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSave(branch.id)}
                        disabled={isSaving}
                        className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 active:scale-95 transition-all disabled:opacity-40"
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </>
      )}

      {/* Detail Modal */}
      {detailBranchId && (() => {
        const branch = branches.find(b => b.id === detailBranchId);
        if (!branch) return null;
        const row = vaultRows[branch.id];
        const isEditing = editingId === branch.id;
        const isDepositing = depositingId === branch.id;
        const isSaving = savingId === branch.id;
        const isSavingDeposit = savingDepositId === branch.id;
        const enabled = localEnabled[branch.id] ?? false;
        const balance = row?.balance ?? 0;
        const initialBalance = row?.initialBalance ?? 0;
        const target = row?.target ?? 0;
        const progress = target > 0 ? Math.min(100, Math.round((balance / target) * 100)) : 0;
        const isFull = target > 0 && balance >= target;
        const notConfigured = enabled && target === 0;
        // Use per-branch direct fetch for the modal (avoids global 1000-row cap)
        const startDate = vaultRows[branch.id]?.startDate ?? null;
        const branchHistory = detailTxns
          .filter(t => t.type === 'DEPOSIT' || t.type === 'ADMIN_DEPOSIT')
          .filter(t => !startDate || (t.timestamp ?? '').slice(0, 10) >= startDate)
          .map(t => ({ id: t.id, date: (t.timestamp ?? '').slice(0, 10), timestamp: t.timestamp ?? '', amount: t.amount, category: t.type, name: t.name ?? null, performedBy: t.performedBy }));
        const branchWithdrawals = detailTxns
          .filter(t => t.type === 'WITHDRAWAL' || t.type === 'VAULT_WITHDRAWAL')
          .map(t => ({ id: t.id, date: (t.timestamp ?? '').slice(0, 10), timestamp: t.timestamp ?? '', amount: t.amount, name: t.name ?? '', performedBy: t.performedBy }));
        const totalDeposited = branchHistory.reduce((s, e) => s + e.amount, 0);
        const totalWithdrawals = branchWithdrawals.reduce((s, e) => s + e.amount, 0);

        const closeModal = () => {
          setDetailBranchId(null);
          setEditingId(null);
          setDepositingId(null);
          setDepositInput('');
        };

        const roiOptions = roiOptionsByBranch[branch.id] ?? [];

        return (
          <div
            className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
          >
            <div className="bg-white rounded-[28px] w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">

              {/* ── Header (dark) ── */}
              <div className="bg-slate-900 px-7 pt-6 pb-5 shrink-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Vault Details</p>
                    <h3 className="text-xl font-black text-white uppercase tracking-tight leading-none">{branch.name}</h3>
                    {enabled && row?.startDate && (
                      <p className="text-[10px] text-slate-400 mt-1.5">
                        Active since {new Date(row.startDate + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0 mt-0.5">
                    {!isReadOnly && (
                      <button onClick={() => { if (!togglingId) setConfirmToggleBranch(branch); }} disabled={!!togglingId}
                        className={`relative rounded-full transition-all duration-300 disabled:opacity-50 cursor-pointer shrink-0 ${enabled ? 'bg-emerald-500' : 'bg-slate-600'}`}
                        style={{ height: '26px', width: '46px' }} title={enabled ? 'Disable Vault' : 'Enable Vault'}>
                        <span className={`absolute top-[3px] w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${enabled ? 'left-[23px]' : 'left-[3px]'}`} />
                      </button>
                    )}
                    <button onClick={closeModal} className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors">
                      <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>

                {/* Stats inline — balance is hero, others secondary */}
                {enabled && (
                  <div className="mt-5 flex items-end justify-between gap-6 flex-wrap">
                    <div>
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Current Balance</p>
                      <p className={`text-3xl font-black tabular-nums leading-none ${isFull ? 'text-emerald-400' : 'text-white'}`}>
                        ₱{balance.toLocaleString()}
                      </p>
                      {target > 0 && (
                        <p className="text-[10px] text-slate-400 mt-1 tabular-nums">
                          {isFull ? '✓ Target reached' : `₱${(target - balance).toLocaleString()} to reach ₱${target.toLocaleString()}`}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-6 pb-0.5">
                      <div className="text-right">
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Deposited</p>
                        <p className="text-sm font-black text-emerald-400 tabular-nums">+₱{totalDeposited.toLocaleString()}</p>
                        <p className="text-[9px] text-slate-500 mt-0.5">{branchHistory.length} entries</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Withdrawn</p>
                        <p className="text-sm font-black text-rose-400 tabular-nums">−₱{totalWithdrawals.toLocaleString()}</p>
                        <p className="text-[9px] text-slate-500 mt-0.5">{branchWithdrawals.length} entries</p>
                      </div>
                      {initialBalance > 0 && (
                        <div className="text-right">
                          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Starting</p>
                          <p className="text-sm font-black text-slate-300 tabular-nums">₱{initialBalance.toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Progress bar */}
                {enabled && target > 0 && (
                  <div className="mt-4">
                    <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-700 ${isFull ? 'bg-emerald-400' : 'bg-emerald-500'}`} style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-[9px] text-slate-500 mt-1.5 tabular-nums">{progress}% funded</p>
                  </div>
                )}
              </div>

              {/* ── Body ── */}
              <div className="flex-1 overflow-y-auto overscroll-contain">
                <div className="px-7 py-5 space-y-5">

                  {/* Action buttons */}
                  {!isReadOnly && !isDepositing && !isEditing && (
                    <div className="flex gap-2">
                      {enabled && (
                        <button onClick={() => { setDepositingId(branch.id); setDepositInput(''); setRoiSourceDate(''); }}
                          className="h-9 px-5 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 active:scale-95 transition-all flex items-center gap-2">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0 0l-6-6m6 6l6-6" /></svg>
                          Deposit
                        </button>
                      )}
                      <button onClick={() => startEdit(branch)}
                        className="h-9 px-5 rounded-xl border border-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 active:scale-95 transition-all">
                        Configure
                      </button>
                    </div>
                  )}

                  {/* Deposit form */}
                  {!isReadOnly && isDepositing && (
                    <div className="rounded-2xl border border-slate-200 bg-white overflow-visible shadow-sm">
                      <div className="px-4 py-3 flex items-center justify-between border-b border-slate-100">
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0 0l-6-6m6 6l6-6" /></svg>
                          <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Deposit to Vault</p>
                        </div>
                        <button onClick={() => { setDepositingId(null); setDepositInput(''); setRoiSourceDate(''); setRoiDropdownOpen(false); }}
                          className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors text-slate-400">
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>

                      <div className="px-4 py-3 space-y-2.5">
                        {/* Custom ROI dropdown */}
                        {roiOptions.length > 0 && (
                          <div className="relative">
                            {roiSourceDate ? (
                              <div className="flex items-center gap-2 h-8 px-2.5 rounded-lg bg-indigo-50 border border-indigo-200">
                                <svg className="w-3 h-3 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                <span className="flex-1 text-[10px] font-bold text-indigo-700 truncate">
                                  {new Date(roiSourceDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                  <span className="text-indigo-400 ml-1.5 font-black">
                                    ₱{(roiOptions.find(o => o.date === roiSourceDate)?.amount ?? 0).toLocaleString()}
                                  </span>
                                </span>
                                <button onClick={() => { setRoiSourceDate(''); setDepositInput(''); }}
                                  className="w-4 h-4 rounded bg-indigo-200 hover:bg-indigo-300 flex items-center justify-center text-indigo-600 transition-colors shrink-0">
                                  <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setRoiDropdownOpen(o => !o)}
                                className="w-full flex items-center justify-between h-8 px-2.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all group">
                                <span className="text-[10px] font-bold text-slate-400 group-hover:text-indigo-600 transition-colors">↓ Pull from a past ROI…</span>
                                <svg className={`w-3 h-3 text-slate-400 transition-transform ${roiDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                              </button>
                            )}
                            {roiDropdownOpen && !roiSourceDate && (
                              <div className="absolute z-50 top-[calc(100%+4px)] left-0 right-0 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
                                {roiOptions.map((opt, i) => (
                                  <button key={opt.date}
                                    onClick={() => { setDepositInput(String(opt.amount)); setRoiSourceDate(opt.date); setRoiDropdownOpen(false); playSound('click'); }}
                                    className={`w-full flex items-center justify-between px-3 py-2 hover:bg-indigo-50 transition-colors text-left ${i > 0 ? 'border-t border-slate-50' : ''}`}>
                                    <div>
                                      <p className="text-[11px] font-bold text-slate-700">
                                        {new Date(opt.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                      </p>
                                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Net ROI</p>
                                    </div>
                                    <span className="text-[12px] font-black text-emerald-600 tabular-nums">₱{opt.amount.toLocaleString()}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Amount input */}
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm select-none">₱</span>
                          <input type="number" min="0" autoFocus value={depositInput}
                            onChange={e => { setDepositInput(e.target.value); if (roiSourceDate && e.target.value !== String(roiOptions.find(o => o.date === roiSourceDate)?.amount ?? '')) setRoiSourceDate(''); }}
                            onKeyDown={e => e.key === 'Enter' && handleAdminDeposit(branch.id)}
                            placeholder="0"
                            className="w-full pl-7 pr-3 py-2 rounded-lg bg-slate-50 border border-slate-200 font-black text-base text-slate-900 outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 transition-all tabular-nums placeholder:text-slate-300" />
                        </div>

                        {/* Compact balance preview */}
                        {parseFloat(depositInput) > 0 && (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 tabular-nums">
                            <span>₱{balance.toLocaleString()}</span>
                            <svg className="w-3 h-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                            <span className="text-emerald-600 font-black">₱{(balance + parseFloat(depositInput)).toLocaleString()}</span>
                            <span className="text-slate-300">after deposit</span>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-0.5">
                          <button onClick={() => { setDepositingId(null); setDepositInput(''); setRoiSourceDate(''); setRoiDropdownOpen(false); }}
                            className="h-9 px-4 rounded-xl border border-slate-200 text-slate-500 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all">
                            Cancel
                          </button>
                          <button onClick={() => handleAdminDeposit(branch.id)}
                            disabled={isSavingDeposit || !parseFloat(depositInput) || parseFloat(depositInput) <= 0}
                            className="flex-1 h-9 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-1.5">
                            {isSavingDeposit
                              ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
                              : <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> Confirm Deposit</>
                            }
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Configure form */}
                  {!isReadOnly && isEditing && (
                    <div className="rounded-2xl border border-slate-200 overflow-hidden">
                      <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
                        <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Configure Vault</p>
                      </div>
                      <div className="p-5 space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Target (₱)</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₱</span>
                              <input type="number" min="0" value={editTarget} onChange={e => setEditTarget(e.target.value)} placeholder="0"
                                className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-sm text-slate-900 outline-none focus:border-indigo-400 focus:bg-white transition-all" />
                            </div>
                          </div>
                          <div>
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Initial Balance (₱)</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₱</span>
                              <input type="number" min="0" value={editInitialBalance} onChange={e => setEditInitialBalance(e.target.value)} placeholder="0"
                                className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-sm text-slate-900 outline-none focus:border-emerald-400 focus:bg-white transition-all" />
                            </div>
                          </div>
                        </div>
                        <div>
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                            Start Date <span className="ml-1 normal-case font-bold text-slate-300">(reports before = Rent & Bills)</span>
                          </label>
                          <input type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-sm text-slate-900 outline-none focus:border-emerald-400 focus:bg-white transition-all" />
                        </div>
                        {(() => {
                          const delta = (parseFloat(editInitialBalance) || 0) - (row?.initialBalance ?? 0);
                          if (delta === 0) return null;
                          return (
                            <p className="text-[10px] font-bold text-indigo-600">
                              Balance will {delta > 0 ? 'increase' : 'decrease'} by ₱{Math.abs(delta).toLocaleString()} → New balance: ₱{Math.max(0, (row?.balance ?? 0) + delta).toLocaleString()}
                            </p>
                          );
                        })()}
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => setEditingId(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all">Cancel</button>
                          <button onClick={() => handleSave(branch.id)} disabled={isSaving}
                            className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 active:scale-95 transition-all disabled:opacity-40">
                            {isSaving ? 'Saving…' : 'Save Changes'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Transaction History ── */}
                  {(branchHistory.length > 0 || branchWithdrawals.length > 0) && (
                    <div className="space-y-3">
                      {/* Tab row */}
                      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                        <button
                          onClick={() => { setTxHistoryTab('deposits'); setVisibleDeposits(20); }}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${txHistoryTab === 'deposits' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                        >
                          ↓ Deposits
                          <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black ${txHistoryTab === 'deposits' ? 'bg-emerald-200 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{branchHistory.length}</span>
                        </button>
                        <button
                          onClick={() => { setTxHistoryTab('withdrawals'); setVisibleWithdrawals(20); }}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${txHistoryTab === 'withdrawals' ? 'bg-rose-100 text-rose-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                        >
                          ↑ Withdrawals
                          <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black ${txHistoryTab === 'withdrawals' ? 'bg-rose-200 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>{branchWithdrawals.length}</span>
                        </button>
                        <div className="ml-auto">
                          <button
                            onClick={() => handleExportBranchCSV(branch.id, branch.name, txHistoryTab)}
                            title={`Export ${txHistoryTab} as CSV`}
                            className="h-7 px-2.5 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:border-slate-300 text-slate-500 hover:text-slate-700 text-[9px] font-black uppercase tracking-widest transition-all"
                          >
                            <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                            </svg>
                            Export
                          </button>
                        </div>
                      </div>

                      {/* Deposits list */}
                      {txHistoryTab === 'deposits' && (
                        branchHistory.length === 0
                          ? <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest py-8 text-center">No deposits recorded</p>
                          : <div className="rounded-2xl border border-slate-100 overflow-hidden">
                              {/* Desktop header — hidden on mobile */}
                              <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_1fr_auto] bg-slate-50 border-b border-slate-100 px-4 py-2">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Date & Time</span>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Source</span>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Transaction ID</span>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Amount</span>
                              </div>
                              <div className="divide-y divide-slate-100">
                                {branchHistory.slice(0, visibleDeposits).map((entry, i) => {
                                  const [y, m, d] = entry.date.split('-').map(Number);
                                  const dateObj = new Date(y, m - 1, d);
                                  const isAdmin = entry.category === 'ADMIN_DEPOSIT';
                                  const timePart = entry.timestamp.length > 10 ? entry.timestamp.slice(11, 16) : null;
                                  return (
                                    <div key={i} className="px-4 py-3 hover:bg-slate-50/70 transition-colors">
                                      {/* Mobile layout */}
                                      <div className="flex items-center justify-between gap-3 sm:hidden">
                                        <div className="min-w-0">
                                          <p className="text-[12px] font-bold text-slate-800 leading-tight">
                                            {dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                          </p>
                                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${isAdmin ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                              {isAdmin ? 'Admin' : 'Manager'}
                                            </span>
                                            {(entry.performedBy || entry.name) && (
                                              <span className="text-[10px] font-medium text-slate-400 truncate">{entry.performedBy || entry.name}</span>
                                            )}
                                            {timePart && <span className="text-[10px] font-medium text-slate-400 tabular-nums">{timePart}</span>}
                                          </div>
                                        </div>
                                        <span className="text-[13px] font-black text-emerald-600 tabular-nums shrink-0">+₱{entry.amount.toLocaleString()}</span>
                                      </div>
                                      {/* Desktop layout */}
                                      <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_1fr_auto] items-center">
                                        <div>
                                          <p className="text-[11px] font-bold text-slate-800">{dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>
                                          {timePart && <p className="text-[10px] font-medium text-slate-400 mt-0.5 tabular-nums">{timePart}</p>}
                                        </div>
                                        <div>
                                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${isAdmin ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>{isAdmin ? 'Admin' : 'Manager'}</span>
                                          {(entry.performedBy || entry.name) && <p className="text-[10px] font-medium text-slate-500 mt-1 truncate max-w-[130px]">{entry.performedBy || entry.name}</p>}
                                        </div>
                                        <p className="text-[10px] font-mono text-slate-400 truncate pr-4">{entry.id.slice(-14).toUpperCase()}</p>
                                        <span className="text-[12px] font-black text-emerald-600 tabular-nums">+₱{entry.amount.toLocaleString()}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              {visibleDeposits < branchHistory.length && (
                                <button
                                  onClick={() => setVisibleDeposits(v => v + 20)}
                                  className="w-full py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest hover:bg-slate-50 transition-colors border-t border-slate-100"
                                >
                                  Load more · {branchHistory.length - visibleDeposits} remaining
                                </button>
                              )}
                            </div>
                      )}

                      {/* Withdrawals list */}
                      {txHistoryTab === 'withdrawals' && (
                        branchWithdrawals.length === 0
                          ? <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest py-8 text-center">No withdrawals recorded</p>
                          : <div className="rounded-2xl border border-slate-100 overflow-hidden">
                              {/* Desktop header — hidden on mobile */}
                              <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_1fr_auto] bg-slate-50 border-b border-slate-100 px-4 py-2">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Date & Time</span>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Label</span>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Transaction ID</span>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Amount</span>
                              </div>
                              <div className="divide-y divide-slate-100">
                                {branchWithdrawals.slice(0, visibleWithdrawals).map((entry, i) => {
                                  const [y, m, d] = entry.date.split('-').map(Number);
                                  const dateObj = new Date(y, m - 1, d);
                                  const timePart = entry.timestamp.length > 10 ? entry.timestamp.slice(11, 16) : null;
                                  return (
                                    <div key={i} className="px-4 py-3 hover:bg-slate-50/70 transition-colors">
                                      {/* Mobile layout */}
                                      <div className="flex items-center justify-between gap-3 sm:hidden">
                                        <div className="min-w-0">
                                          <p className="text-[12px] font-bold text-slate-800 leading-tight">
                                            {dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                          </p>
                                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-rose-100 text-rose-700">Withdrawal</span>
                                            {(entry.performedBy || entry.name) && <span className="text-[10px] font-medium text-slate-400 truncate">{entry.performedBy || entry.name}</span>}
                                            {timePart && <span className="text-[10px] font-medium text-slate-400 tabular-nums">{timePart}</span>}
                                          </div>
                                        </div>
                                        <span className="text-[13px] font-black text-rose-600 tabular-nums shrink-0">−₱{entry.amount.toLocaleString()}</span>
                                      </div>
                                      {/* Desktop layout */}
                                      <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_1fr_auto] items-center">
                                        <div>
                                          <p className="text-[11px] font-bold text-slate-800">{dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>
                                          {timePart && <p className="text-[10px] font-medium text-slate-400 mt-0.5 tabular-nums">{timePart}</p>}
                                        </div>
                                        <div>
                                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-rose-100 text-rose-700">Withdrawal</span>
                                          {(entry.performedBy || entry.name) && <p className="text-[10px] font-medium text-slate-500 mt-1 truncate max-w-[130px]">{entry.performedBy || entry.name}</p>}
                                        </div>
                                        <p className="text-[10px] font-mono text-slate-400 truncate pr-4">{entry.id.slice(-14).toUpperCase()}</p>
                                        <span className="text-[12px] font-black text-rose-600 tabular-nums">−₱{entry.amount.toLocaleString()}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              {visibleWithdrawals < branchWithdrawals.length && (
                                <button
                                  onClick={() => setVisibleWithdrawals(v => v + 20)}
                                  className="w-full py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest hover:bg-slate-50 transition-colors border-t border-slate-100"
                                >
                                  Load more · {branchWithdrawals.length - visibleWithdrawals} remaining
                                </button>
                              )}
                            </div>
                      )}
                    </div>
                  )}

                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Toggle confirmation modal */}
      {confirmToggleBranch && (() => {
        const branch = confirmToggleBranch;
        const willEnable = !localEnabled[branch.id];
        return (
          <div
            className="fixed inset-0 z-[1200] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) setConfirmToggleBranch(null); }}
          >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
              <div className={`px-5 py-4 ${willEnable ? 'bg-emerald-50 border-b border-emerald-100' : 'bg-rose-50 border-b border-rose-100'}`}>
                <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${willEnable ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {willEnable ? 'Enable Vault' : 'Disable Vault'}
                </p>
                <p className="text-base font-black text-slate-900 uppercase tracking-tight">{branch.name}</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-[12px] text-slate-600 leading-relaxed">
                  {willEnable
                    ? 'This will activate the vault for this branch. Managers will be able to deposit into it and vault provisions will apply to daily reports.'
                    : 'This will deactivate the vault for this branch. Existing balance and history will be preserved, but no new provisions will apply.'}
                </p>
              </div>
              <div className="px-5 pb-4 flex gap-2">
                <button
                  onClick={() => setConfirmToggleBranch(null)}
                  className="flex-1 h-9 rounded-xl border border-slate-200 text-slate-500 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all">
                  Cancel
                </button>
                <button
                  onClick={() => { handleToggle(branch); setConfirmToggleBranch(null); }}
                  className={`flex-1 h-9 rounded-xl text-white text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all ${willEnable ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-500 hover:bg-rose-600'}`}>
                  {willEnable ? 'Enable' : 'Disable'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
