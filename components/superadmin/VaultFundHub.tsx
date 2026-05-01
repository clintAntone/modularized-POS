
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Branch, SalesReport } from '../../types';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { playSound } from '../../lib/audio';
import { BranchCheckboxDropdown } from '../shared/BranchCheckboxDropdown';

interface VaultRow {
  branchId: string;
  balance: number;
  target: number;
  startDate: string | null;
}

interface VaultFundHubProps {
  branches: Branch[];
  salesReports: SalesReport[];
  isReadOnly?: boolean;
  onRefresh?: () => void;
}

type SortMode = 'name' | 'progress' | 'balance';

export const VaultFundHub: React.FC<VaultFundHubProps> = ({ branches, salesReports, isReadOnly, onRefresh }) => {
  const [vaultRows, setVaultRows] = useState<Record<string, VaultRow>>({});
  const [loadingVaults, setLoadingVaults] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState('');
  const [editBalance, setEditBalance] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [depositingId, setDepositingId] = useState<string | null>(null);
  const [depositInput, setDepositInput] = useState('');
  const [savingDepositId, setSavingDepositId] = useState<string | null>(null);
  const [localEnabled, setLocalEnabled] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [vaultFilter, setVaultFilter] = useState<'all' | 'enabled' | 'disabled' | 'full'>('all');
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState<Set<string>>(new Set());
  const [detailBranchId, setDetailBranchId] = useState<string | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

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
      .select(`${DB_COLUMNS.BRANCH_ID}, ${DB_COLUMNS.VAULT_BALANCE}, ${DB_COLUMNS.VAULT_TARGET}, ${DB_COLUMNS.VAULT_START_DATE}`)
      .then(({ data }) => {
        if (data) {
          const map: Record<string, VaultRow> = {};
          data.forEach((row: any) => {
            map[row[DB_COLUMNS.BRANCH_ID]] = {
              branchId: row[DB_COLUMNS.BRANCH_ID],
              balance: row[DB_COLUMNS.VAULT_BALANCE] ?? 0,
              target: row[DB_COLUMNS.VAULT_TARGET] ?? 0,
              startDate: row[DB_COLUMNS.VAULT_START_DATE] ?? null,
            };
          });
          setVaultRows(map);
        }
        setLoadingVaults(false);
      });
  }, []);

  // Poll balance every 30s while on this tab + refetch on browser window focus
  useEffect(() => {
    fetchBalances(); // immediate fetch on mount
    const interval = setInterval(fetchBalances, 30_000);
    const onFocus = () => fetchBalances();
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

  const historicalTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    salesReports.forEach(r => {
      const startDate = vaultRows[r.branchId]?.startDate;
      if (startDate && r.reportDate < startDate) return; // exclude pre-vault reports
      totals[r.branchId] = (totals[r.branchId] ?? 0) + (r.totalVaultProvision ?? 0);
    });
    return totals;
  }, [salesReports, vaultRows]);

  // Per-branch deposit history sourced from vault_data entries in each report (VAULT_DEPOSIT + VAULT_FUND_DEPOSIT)
  const branchDepositHistory = useMemo(() => {
    const map: Record<string, Array<{ date: string; amount: number; category: string; snapshot?: number }>> = {};
    [...salesReports]
      .sort((a, b) => b.reportDate.localeCompare(a.reportDate))
      .forEach(r => {
        const startDate = vaultRows[r.branchId]?.startDate;
        if (startDate && r.reportDate < startDate) return;
        const entries = (r.vaultData || []).filter((e: any) =>
          e.category === 'VAULT_DEPOSIT' || e.category === 'VAULT_FUND_DEPOSIT' || e.category === 'VAULT_REMITTANCE'
        );
        if (entries.length === 0) return;
        if (!map[r.branchId]) map[r.branchId] = [];
        entries.forEach((e: any) => {
          map[r.branchId].push({
            date: r.reportDate,
            amount: Number(e.amount) || 0,
            category: e.category,
            snapshot: r.vaultBalanceSnapshot,
          });
        });
      });
    return map;
  }, [salesReports, vaultRows]);

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
    const historical = historicalTotals[branch.id] ?? 0;
    // If unconfigured (no target set) and there are deposits, pre-fill balance with 0
    // so the admin enters only pre-app cash; historical deposits will be added on save.
    const wasUnconfigured = (row?.target ?? 0) === 0 && historical > 0;
    setEditTarget(String(row?.target ?? 0));
    setEditBalance(wasUnconfigured ? '0' : String(row?.balance ?? 0));
    setEditStartDate(row?.startDate ?? '');
    setEditingId(branch.id);
  };

  const handleSave = async (branchId: string) => {
    const parsedBalance = parseFloat(editBalance);
    const parsedTarget = parseFloat(editTarget);
    if (isNaN(parsedBalance) || parsedBalance < 0) return;
    if (isNaN(parsedTarget) || parsedTarget < 0) return;
    setSavingId(branchId);
    try {
      const prevRow = vaultRows[branchId];
      // Use the start-date-filtered total so we only add deposits that fall on/after the chosen start date.
      const historical = editStartDate
        ? salesReports
            .filter(r => r.branchId === branchId && r.reportDate >= editStartDate)
            .reduce((sum, r) => sum + (r.totalVaultProvision ?? 0), 0)
        : (historicalTotals[branchId] ?? 0);
      // When configuring a target for the first time on a branch that has made deposits,
      // add the historical deposit total to whatever pre-app balance the admin entered.
      const wasUnconfigured = (prevRow?.target ?? 0) === 0 && historical > 0;
      const finalBalance = wasUnconfigured ? parsedBalance + historical : parsedBalance;

      const upsertPayload: Record<string, any> = {
        [DB_COLUMNS.BRANCH_ID]: branchId,
        [DB_COLUMNS.VAULT_TARGET]: parsedTarget,
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
            [DB_COLUMNS.VAULT_BALANCE]: existing?.balance ?? 0,
            [DB_COLUMNS.VAULT_START_DATE]: today,
          }, { onConflict: DB_COLUMNS.BRANCH_ID });
          setVaultRows(prev => ({
            ...prev,
            [branch.id]: { branchId: branch.id, target: existing?.target ?? 0, balance: existing?.balance ?? 0, startDate: today },
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
      const manilaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now);
      const manilaTime = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).format(now);
      const timestamp = `${manilaDate}T${manilaTime}+08:00`;
      const expenseId = `${branchId}_VD_${manilaDate.replace(/-/g, '')}_${Date.now()}`;

      const newEntry = {
        id: expenseId,
        name: 'VAULT DEPOSIT (ADMIN)',
        amount: amt,
        category: 'VAULT_FUND_DEPOSIT',
        timestamp,
      };

      // Upsert today's sales report — append to vault_data only (VAULT_FUND_DEPOSIT does NOT affect total_vault_provision or net_roi)
      const reportId = `${branchId}_${manilaDate.replace(/-/g, '')}`;
      const { data: existingReport } = await supabase
        .from(DB_TABLES.SALES_REPORTS)
        .select(`${DB_COLUMNS.VAULT_DATA}`)
        .eq(DB_COLUMNS.ID, reportId)
        .maybeSingle();

      const existingVaultData: any[] = existingReport
        ? (typeof existingReport[DB_COLUMNS.VAULT_DATA] === 'string'
            ? JSON.parse(existingReport[DB_COLUMNS.VAULT_DATA])
            : (existingReport[DB_COLUMNS.VAULT_DATA] || []))
        : [];

      await supabase.from(DB_TABLES.SALES_REPORTS).upsert({
        [DB_COLUMNS.ID]: reportId,
        [DB_COLUMNS.BRANCH_ID]: branchId,
        [DB_COLUMNS.REPORT_DATE]: manilaDate,
        [DB_COLUMNS.VAULT_DATA]: [...existingVaultData, newEntry],
      });

      const prevBalance = vaultRows[branchId]?.balance ?? 0;
      const newBalance = prevBalance + amt;
      const { error: vaultErr } = await supabase
        .from(DB_TABLES.BRANCH_VAULTS)
        .update({ [DB_COLUMNS.VAULT_BALANCE]: newBalance })
        .eq(DB_COLUMNS.BRANCH_ID, branchId);
      if (vaultErr) throw vaultErr;

      setVaultRows(prev => ({
        ...prev,
        [branchId]: { ...prev[branchId], branchId, balance: newBalance },
      }));
      setDepositingId(null);
      setDepositInput('');
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
        const dep = (historicalTotals[b.id] ?? 0).toString();
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
  }, [branches, selectedBranchIds, searchTerm, vaultFilter, localEnabled, vaultRows, sortMode, historicalTotals]);

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight leading-none">Vault Fund</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">
            {enabledCount} of {branches.length} branches enabled
          </p>
        </div>
      </div>

      {/* Network Summary */}
      {!loadingVaults && enabledCount > 0 && (
        <div className="bg-slate-900 rounded-[28px] p-6 space-y-4">
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Network Vault Balance</p>
              <p className="text-3xl font-black text-white tabular-nums leading-none mt-1">
                ₱{networkSummary.totalBalance.toLocaleString()}
              </p>
              {networkSummary.totalTarget > 0 && (
                <p className="text-[9px] font-bold text-slate-400 mt-1">
                  of ₱{networkSummary.totalTarget.toLocaleString()} target
                </p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-emerald-500/15 rounded-2xl px-3 py-3 text-center border border-emerald-500/20">
                <p className="text-xl font-black text-emerald-400 tabular-nums">{networkSummary.enabledCount}</p>
                <p className="text-[7px] font-black text-emerald-400 uppercase tracking-widest mt-0.5">Vault On</p>
              </div>
              <div className="bg-white/5 rounded-2xl px-3 py-3 text-center border border-white/5">
                <p className="text-xl font-black text-slate-400 tabular-nums">{networkSummary.disabledCount}</p>
                <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mt-0.5">Vault Off</p>
              </div>
              <div className={`rounded-2xl px-3 py-3 text-center border ${networkSummary.fullCount > 0 ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-white/5 border-white/5'}`}>
                <p className={`text-xl font-black tabular-nums ${networkSummary.fullCount > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>{networkSummary.fullCount}</p>
                <p className={`text-[7px] font-black uppercase tracking-widest mt-0.5 ${networkSummary.fullCount > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>Full</p>
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
        </div>
      )}

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
                  <th className="px-4 py-3.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-4 py-3.5 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Balance</th>
                  <th className="px-4 py-3.5 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Target</th>
                  <th className="px-4 py-3.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest w-36">Progress</th>
                  <th className="px-4 py-3.5 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Deposited</th>
                  <th className="px-5 py-3.5 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredBranches.map(branch => {
                  const row = vaultRows[branch.id];
                  const historical = historicalTotals[branch.id] ?? 0;
                  const isToggling = togglingId === branch.id;
                  const enabled = localEnabled[branch.id] ?? false;
                  const balance = row?.balance ?? 0;
                  const target = row?.target ?? 0;
                  const progress = target > 0 ? Math.min(100, Math.round((balance / target) * 100)) : 0;
                  const isFull = target > 0 && balance >= target;
                  const notConfigured = enabled && target === 0;
                  const branchHistory = branchDepositHistory[branch.id] ?? [];
                  return (
                    <tr key={branch.id} onClick={() => setDetailBranchId(branch.id)} className="hover:bg-slate-50/60 transition-colors cursor-pointer">
                      {/* Branch */}
                      <td className="px-5 py-4">
                        <p className={`text-[12px] font-black uppercase tracking-wide ${enabled ? 'text-slate-900' : 'text-slate-400'}`}>{branch.name}</p>
                        {enabled && row?.startDate && (
                          <p className="text-[8px] font-bold text-slate-400 mt-0.5">Since {row.startDate}</p>
                        )}
                        {branchHistory.length > 0 && (
                          <p className="text-[8px] font-bold text-slate-300 mt-0.5">{branchHistory.length} deposit{branchHistory.length !== 1 ? 's' : ''}</p>
                        )}
                      </td>
                      {/* Status */}
                      <td className="px-4 py-4">
                        {!enabled ? (
                          <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Off</span>
                        ) : isFull ? (
                          <span className="text-[8px] font-black text-emerald-600 bg-emerald-100 px-2 py-1 rounded-full uppercase tracking-widest">Full</span>
                        ) : notConfigured ? (
                          <span className="text-[8px] font-black text-amber-600 bg-amber-100 px-2 py-1 rounded-full uppercase tracking-widest">No Target</span>
                        ) : (
                          <span className="text-[8px] font-black text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full uppercase tracking-widest">Active</span>
                        )}
                      </td>
                      {/* Balance */}
                      <td className="px-4 py-4 text-right">
                        <span className={`text-[13px] font-black tabular-nums ${!enabled ? 'text-slate-300' : isFull ? 'text-emerald-600' : notConfigured ? 'text-amber-600' : 'text-slate-900'}`}>
                          {enabled ? `₱${balance.toLocaleString()}` : '—'}
                        </span>
                      </td>
                      {/* Target */}
                      <td className="px-4 py-4 text-right">
                        <span className={`text-[13px] font-black tabular-nums ${target > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>
                          {target > 0 ? `₱${target.toLocaleString()}` : '—'}
                        </span>
                      </td>
                      {/* Progress */}
                      <td className="px-4 py-4 w-36">
                        {enabled && target > 0 ? (
                          <div className="space-y-1">
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all duration-500 ${isFull ? 'bg-emerald-500' : 'bg-emerald-400'}`} style={{ width: `${progress}%` }} />
                            </div>
                            <span className="text-[8px] font-black text-slate-400 tabular-nums">{progress}%</span>
                          </div>
                        ) : (
                          <span className="text-slate-200 text-[10px]">—</span>
                        )}
                      </td>
                      {/* Deposited */}
                      <td className="px-4 py-4 text-right">
                        <span className={`text-[12px] font-black tabular-nums ${row?.startDate && historical > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                          {row?.startDate && historical > 0 ? `₱${historical.toLocaleString()}` : '—'}
                        </span>
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
                            onClick={() => handleToggle(branch)}
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
            const historical = historicalTotals[branch.id] ?? 0;
            const editHistorical = editStartDate
              ? salesReports
                  .filter(r => r.branchId === branch.id && r.reportDate >= editStartDate)
                  .reduce((sum, r) => sum + (r.totalVaultProvision ?? 0), 0)
              : 0;
            const isEditing = editingId === branch.id;
            const isDepositing = depositingId === branch.id;
            const isSaving = savingId === branch.id;
            const isSavingDeposit = savingDepositId === branch.id;
            const isToggling = togglingId === branch.id;
            const enabled = localEnabled[branch.id] ?? false;
            const balance = row?.balance ?? 0;
            const target = row?.target ?? 0;
            const progress = target > 0 ? Math.min(100, Math.round((balance / target) * 100)) : 0;
            const isFull = target > 0 && balance >= target;
            const notConfigured = target === 0 && balance === 0;
            const branchHistory = branchDepositHistory[branch.id] ?? [];

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
                        onClick={() => handleToggle(branch)}
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
                      <div className="flex items-end justify-between gap-2">
                        <div>
                          <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Balance</p>
                          <p className={`text-2xl font-black tabular-nums leading-none ${isFull ? 'text-emerald-600' : 'text-slate-900'}`}>
                            ₱{balance.toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Target</p>
                          <p className="text-[13px] font-black tabular-nums leading-none text-indigo-500">
                            ₱{target.toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${isFull ? 'bg-emerald-500' : 'bg-emerald-400'}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className={`text-[7px] font-black uppercase tracking-widest tabular-nums ${isFull ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {isFull ? '✓ Target reached' : `${progress}%`}
                          </span>
                          {!isFull && (
                            <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest tabular-nums">
                              ₱{(target - balance).toLocaleString()} to go
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Unconfigured state — vault on but no target */}
                  {cardState === 'unconfigured' && !isEditing && (
                    <div className="mt-4 space-y-3">
                      {row?.startDate && historical > 0 && (
                        <div className="flex items-end justify-between">
                          <div>
                            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Deposited so far</p>
                            <p className="text-2xl font-black tabular-nums leading-none text-emerald-600">
                              ₱{historical.toLocaleString()}
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

                {/* Stats row — balance/target/deposited */}
                <div className={`px-5 py-3.5 grid gap-3 border-t ${
                  cardState === 'off' ? 'grid-cols-1 border-slate-50' : 'grid-cols-3 border-slate-50'
                }`}>
                  {cardState === 'off' ? (
                    <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest text-center">Vault disabled for this branch</p>
                  ) : (
                    <>
                      <div>
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Balance</p>
                        <p className={`text-[13px] font-black tabular-nums leading-none ${
                          cardState === 'full' ? 'text-emerald-600'
                          : cardState === 'unconfigured' ? 'text-amber-600'
                          : 'text-emerald-700'
                        }`}>
                          ₱{balance.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Target</p>
                        <p className={`text-[13px] font-black tabular-nums leading-none ${target > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>
                          {target > 0 ? `₱${target.toLocaleString()}` : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Deposited</p>
                        <p className={`text-[13px] font-black tabular-nums leading-none ${row?.startDate && historical > 0 ? 'text-slate-600' : 'text-slate-300'}`}>
                          {row?.startDate && historical > 0 ? `₱${historical.toLocaleString()}` : '—'}
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {/* Deposit History */}
                {enabled && branchHistory.length > 0 && (
                  <div className="border-t border-slate-50">
                    <button
                      onClick={() => toggleHistory(branch.id)}
                      className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors"
                    >
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                        Deposit History · {branchHistory.length} {branchHistory.length === 1 ? 'entry' : 'entries'}
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
                        {branchHistory.slice(0, 30).map((entry, i) => {
                          const [y, m, d] = entry.date.split('-').map(Number);
                          const formatted = new Intl.DateTimeFormat('en-PH', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          }).format(new Date(y, m - 1, d));
                          const isAdmin = entry.category === 'VAULT_FUND_DEPOSIT';
                          return (
                            <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] font-bold text-slate-400">{formatted}</span>
                                <span className={`text-[8px] font-black uppercase tracking-widest ${isAdmin ? 'text-violet-400' : 'text-emerald-500'}`}>
                                  {isAdmin ? 'Admin' : 'Manager'}
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                {entry.snapshot !== undefined && (
                                  <span className="text-[9px] font-bold text-slate-300 tabular-nums">
                                    bal ₱{entry.snapshot.toLocaleString()}
                                  </span>
                                )}
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
                {!isReadOnly && isDepositing && (
                  <div className="px-5 pb-5 pt-4 space-y-3 border-t border-emerald-100 bg-emerald-50/40 animate-in slide-in-from-top-1 duration-150">
                    <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Deposit to Vault</p>
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
                        onClick={() => setDepositingId(null)}
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
                )}

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
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Balance Override (₱)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xs">₱</span>
                          <input
                            type="number"
                            min="0"
                            value={editBalance}
                            onChange={e => setEditBalance(e.target.value)}
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

                    {editHistorical > 0 && (row?.target ?? 0) === 0 && (
                      <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-100">
                        <svg className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-[9px] font-bold text-emerald-700 uppercase tracking-widest leading-relaxed">
                          ₱{editHistorical.toLocaleString()} already deposited via the app (from {editStartDate}) will be added automatically to the balance above.
                        </p>
                      </div>
                    )}
                    {editHistorical > 0 && (row?.target ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => setEditBalance(String(editHistorical))}
                        className="w-full text-left px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 text-[9px] font-bold text-slate-500 uppercase tracking-widest hover:bg-indigo-50 hover:border-indigo-100 hover:text-indigo-600 transition-all"
                      >
                        Use historical total → ₱{editHistorical.toLocaleString()}
                      </button>
                    )}

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
        const historical = historicalTotals[branch.id] ?? 0;
        // In the edit form, use editStartDate to compute the relevant deposit total.
        // If no date entered yet, show nothing (don't mislead with an all-time total).
        const editHistorical = editStartDate
          ? salesReports
              .filter(r => r.branchId === branch.id && r.reportDate >= editStartDate)
              .reduce((sum, r) => sum + (r.totalVaultProvision ?? 0), 0)
          : 0;
        const isEditing = editingId === branch.id;
        const isDepositing = depositingId === branch.id;
        const isSaving = savingId === branch.id;
        const isSavingDeposit = savingDepositId === branch.id;
        const enabled = localEnabled[branch.id] ?? false;
        const balance = row?.balance ?? 0;
        const target = row?.target ?? 0;
        const progress = target > 0 ? Math.min(100, Math.round((balance / target) * 100)) : 0;
        const isFull = target > 0 && balance >= target;
        const notConfigured = enabled && target === 0;
        const branchHistory = branchDepositHistory[branch.id] ?? [];

        const closeModal = () => {
          setDetailBranchId(null);
          setEditingId(null);
          setDepositingId(null);
          setDepositInput('');
        };

        return (
          <div
            className="fixed inset-0 z-[1100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
          >
            <div className="bg-white rounded-t-[28px] sm:rounded-[28px] w-full sm:max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
              {/* Modal Header */}
              <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4 border-b border-slate-100 shrink-0">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Vault Details</p>
                  <h3 className="text-[16px] font-black text-slate-900 uppercase tracking-wide leading-tight">{branch.name}</h3>
                  {enabled && row?.startDate && (
                    <p className="text-[8px] font-bold text-slate-400 mt-1 uppercase tracking-widest">Since {row.startDate}</p>
                  )}
                </div>
                <button onClick={closeModal} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors shrink-0 mt-0.5">
                  <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="px-6 pb-6 pt-5 space-y-5 overflow-y-auto overscroll-contain">
                {/* Stats */}
                {enabled && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50 rounded-2xl p-3.5">
                      <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Balance</p>
                      <p className={`text-[15px] font-black tabular-nums leading-none ${isFull ? 'text-emerald-600' : notConfigured ? 'text-amber-600' : 'text-slate-900'}`}>
                        ₱{balance.toLocaleString()}
                      </p>
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-3.5">
                      <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Target</p>
                      <p className={`text-[15px] font-black tabular-nums leading-none ${target > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>
                        {target > 0 ? `₱${target.toLocaleString()}` : '—'}
                      </p>
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-3.5">
                      <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Deposited</p>
                      <p className={`text-[15px] font-black tabular-nums leading-none ${row?.startDate && historical > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                        {row?.startDate && historical > 0 ? `₱${historical.toLocaleString()}` : '—'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Progress bar */}
                {enabled && target > 0 && (
                  <div className="space-y-1.5">
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${isFull ? 'bg-emerald-500' : 'bg-emerald-400'}`} style={{ width: `${progress}%` }} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-[8px] font-black uppercase tracking-widest ${isFull ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {isFull ? '✓ Target reached' : `${progress}%`}
                      </span>
                      {!isFull && target > 0 && (
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest tabular-nums">
                          ₱{(target - balance).toLocaleString()} to go
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                {!isReadOnly && !isDepositing && !isEditing && (
                  <div className="flex gap-2">
                    {enabled && (
                      <button
                        onClick={() => { setDepositingId(branch.id); setDepositInput(''); }}
                        className="flex-1 h-10 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0 0l-6-6m6 6l6-6" /></svg>
                        Deposit
                      </button>
                    )}
                    <button
                      onClick={() => startEdit(branch)}
                      className="flex-1 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
                    >
                      Configure
                    </button>
                  </div>
                )}

                {/* Deposit form */}
                {!isReadOnly && isDepositing && (
                  <div className="space-y-3 bg-emerald-50/50 rounded-2xl p-4 border border-emerald-100">
                    <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Deposit to Vault</p>
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
                      <button onClick={() => setDepositingId(null)} className="h-10 px-3 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all">
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
                )}

                {/* Edit / Configure form */}
                {!isReadOnly && isEditing && (
                  <div className="space-y-3 border border-slate-100 rounded-2xl p-4">
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Configure Vault</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Target (₱)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xs">₱</span>
                          <input type="number" min="0" value={editTarget} onChange={e => setEditTarget(e.target.value)} placeholder="0"
                            className="w-full pl-6 pr-2 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-[12px] text-slate-900 outline-none focus:border-indigo-400 focus:bg-white transition-all" />
                        </div>
                      </div>
                      <div>
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Balance Override (₱)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xs">₱</span>
                          <input type="number" min="0" value={editBalance} onChange={e => setEditBalance(e.target.value)} placeholder="0"
                            className="w-full pl-6 pr-2 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-[12px] text-slate-900 outline-none focus:border-emerald-400 focus:bg-white transition-all" />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                        Start Date <span className="ml-1 normal-case font-bold text-slate-300">(reports before = Rent & Bills)</span>
                      </label>
                      <input type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-[12px] text-slate-900 outline-none focus:border-emerald-400 focus:bg-white transition-all" />
                    </div>
                    {editHistorical > 0 && (row?.target ?? 0) === 0 && (
                      <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-100">
                        <svg className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-[9px] font-bold text-emerald-700 uppercase tracking-widest leading-relaxed">
                          ₱{editHistorical.toLocaleString()} already deposited via the app (from {editStartDate}) will be added automatically to the balance above.
                        </p>
                      </div>
                    )}
                    {editHistorical > 0 && (row?.target ?? 0) > 0 && (
                      <button type="button" onClick={() => setEditBalance(String(editHistorical))}
                        className="w-full text-left px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 text-[9px] font-bold text-slate-500 uppercase tracking-widest hover:bg-indigo-50 hover:border-indigo-100 hover:text-indigo-600 transition-all">
                        Use historical total → ₱{editHistorical.toLocaleString()}
                      </button>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setEditingId(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all">
                        Cancel
                      </button>
                      <button onClick={() => handleSave(branch.id)} disabled={isSaving}
                        className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 active:scale-95 transition-all disabled:opacity-40">
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Deposit History */}
                {branchHistory.length > 0 && (
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">
                      Deposit History · {branchHistory.length} {branchHistory.length === 1 ? 'entry' : 'entries'}
                    </p>
                    <div className="space-y-px max-h-64 overflow-y-auto overscroll-contain">
                      {branchHistory.map((entry, i) => {
                        const [y, m, d] = entry.date.split('-').map(Number);
                        const formatted = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(y, m - 1, d));
                        const isAdmin = entry.category === 'VAULT_FUND_DEPOSIT';
                        const isRemittance = entry.category === 'VAULT_REMITTANCE';
                        return (
                          <div key={i} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] font-bold text-slate-500">{formatted}</span>
                              <span className={`text-[8px] font-black uppercase tracking-widest ${isAdmin ? 'text-violet-400' : isRemittance ? 'text-blue-400' : 'text-emerald-500'}`}>
                                {isAdmin ? 'Admin' : isRemittance ? 'Remittance' : 'Manager'}
                              </span>
                            </div>
                            <span className="text-[12px] font-black text-emerald-600 tabular-nums">+₱{entry.amount.toLocaleString()}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Toggle vault */}
                {!isReadOnly && (
                  <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Vault {enabled ? 'Enabled' : 'Disabled'}</span>
                    <button
                      onClick={() => handleToggle(branch)}
                      disabled={isReadOnly || !!togglingId}
                      className={`relative rounded-full transition-all duration-300 disabled:opacity-50 cursor-pointer ${enabled ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.35)]' : 'bg-slate-200'}`}
                      style={{ height: '26px', width: '46px' }}
                    >
                      <span className={`absolute top-[3px] w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${enabled ? 'left-[23px]' : 'left-[3px]'}`} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
