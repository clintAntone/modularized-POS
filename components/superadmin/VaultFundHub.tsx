
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { Branch, SalesReport, VaultTransaction } from '../../types';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { playSound } from '../../lib/audio';
import { BranchCheckboxDropdown } from '../shared/BranchCheckboxDropdown';
import { getTrueDate, getManilaTodayStr } from '../../lib/time';

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

// ── Vault Line Chart ─────────────────────────────────────────────────────────
interface VaultChartProps {
  deposits: { date: string; amount: number }[];
  withdrawals: { date: string; amount: number }[];
}
const VaultLineChart: React.FC<VaultChartProps> = ({ deposits, withdrawals }) => {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; date: string; dep: number; wit: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const W = 560; const H = 200; const PAD = { t: 16, r: 16, b: 24, l: 56 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;

  const points = useMemo(() => {
    const dateSet = new Set([...deposits.map(d => d.date), ...withdrawals.map(d => d.date)]);
    const dates = Array.from(dateSet).sort();
    if (dates.length === 0) return { dates: [], depPts: [], witPts: [] };

    let cumDep = 0; let cumWit = 0;
    const depMap: Record<string, number> = {};
    const witMap: Record<string, number> = {};
    deposits.forEach(d => { depMap[d.date] = (depMap[d.date] ?? 0) + d.amount; });
    withdrawals.forEach(d => { witMap[d.date] = (witMap[d.date] ?? 0) + d.amount; });

    const depPts: { date: string; val: number; daily: number }[] = [];
    const witPts: { date: string; val: number; daily: number }[] = [];
    dates.forEach(date => {
      const dailyDep = depMap[date] ?? 0;
      const dailyWit = witMap[date] ?? 0;
      cumDep += dailyDep;
      cumWit += dailyWit;
      depPts.push({ date, val: cumDep, daily: dailyDep });
      witPts.push({ date, val: cumWit, daily: dailyWit });
    });
    return { dates, depPts, witPts };
  }, [deposits, withdrawals]);

  const maxVal = useMemo(() => {
    const all = [...points.depPts.map(p => p.daily), ...points.witPts.map(p => p.daily)];
    return Math.max(...all, 1);
  }, [points]);

  const scaleX = (i: number) => points.dates.length < 2 ? cW / 2 : (i / (points.dates.length - 1)) * cW;
  const scaleY = (v: number) => cH - (v / maxVal) * cH;

  const toPath = (pts: { daily: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(i).toFixed(1)} ${scaleY(p.daily).toFixed(1)}`).join(' ');

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.dates.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const rawX = (e.clientX - rect.left - PAD.l) * (W / rect.width);
    const idx = Math.min(points.dates.length - 1, Math.max(0, Math.round((rawX / cW) * (points.dates.length - 1))));
    const svgX = PAD.l + scaleX(idx);
    const svgY = PAD.t + scaleY(points.depPts[idx]?.val ?? 0);
    setTooltip({ x: svgX, y: svgY, date: points.dates[idx], dep: points.depPts[idx]?.daily ?? 0, wit: points.witPts[idx]?.daily ?? 0 });
  }, [points, cW, cH, maxVal]);

  if (points.dates.length === 0) return null;

  const tickCount = 4;
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => Math.round((maxVal / tickCount) * i));
  const xTickIndices = points.dates.length <= 6
    ? points.dates.map((_, i) => i)
    : [0, Math.floor(points.dates.length / 3), Math.floor((2 * points.dates.length) / 3), points.dates.length - 1];

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Grid lines */}
        {yTicks.map(tick => (
          <line key={tick} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + scaleY(tick)} y2={PAD.t + scaleY(tick)} stroke="#f1f5f9" strokeWidth="1" />
        ))}

        {/* Y-axis labels */}
        {yTicks.map(tick => (
          <text key={tick} x={PAD.l - 6} y={PAD.t + scaleY(tick) + 4} textAnchor="end" fontSize="9" fill="#94a3b8" fontFamily="monospace">
            {tick >= 1000 ? `${(tick / 1000).toFixed(tick % 1000 === 0 ? 0 : 1)}k` : tick}
          </text>
        ))}

        {/* X-axis labels */}
        {xTickIndices.map(i => (
          <text key={i} x={PAD.l + scaleX(i)} y={H - 6} textAnchor="middle" fontSize="8" fill="#94a3b8">
            {points.dates[i]?.slice(5)}
          </text>
        ))}

        {/* Deposit line */}
        {points.depPts.length > 1 && (
          <path d={toPath(points.depPts)} fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" transform={`translate(${PAD.l},${PAD.t})`} />
        )}

        {/* Withdrawal line */}
        {points.witPts.length > 1 && (
          <path d={toPath(points.witPts)} fill="none" stroke="#f43f5e" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" transform={`translate(${PAD.l},${PAD.t})`} />
        )}

        {/* Tooltip crosshair */}
        {tooltip && (
          <>
            <line x1={tooltip.x} x2={tooltip.x} y1={PAD.t} y2={H - PAD.b} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={tooltip.x} cy={PAD.t + scaleY(points.depPts[points.dates.indexOf(tooltip.date)]?.daily ?? 0)} r="3.5" fill="#10b981" />
            <circle cx={tooltip.x} cy={PAD.t + scaleY(points.witPts[points.dates.indexOf(tooltip.date)]?.daily ?? 0)} r="3.5" fill="#f43f5e" />
          </>
        )}
      </svg>

      {/* Tooltip box */}
      {tooltip && (
        <div className="absolute z-10 pointer-events-none bg-slate-900 text-white rounded-xl px-3 py-2 text-xs shadow-xl space-y-1"
          style={{ left: Math.min(tooltip.x / (W / 100), 70) + '%', top: '4px', transform: 'translateX(-50%)' }}>
          <p className="font-black text-slate-300 uppercase tracking-widest">{tooltip.date}</p>
          <p className="text-emerald-400 font-bold">↓ Deposited: ₱{tooltip.dep.toLocaleString()}</p>
          <p className="text-rose-400 font-bold">↑ Withdrawn: ₱{tooltip.wit.toLocaleString()}</p>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-1 px-1">
        <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 bg-emerald-500 rounded" /><span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Deposits</span></div>
        <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 bg-rose-500 rounded" /><span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Withdrawals</span></div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Isolated dropdown components — internal open/close state never touches the
// parent render cycle, so 66+ branch cards are NOT re-rendered on open/close.
// ---------------------------------------------------------------------------
type VaultFilterValue = 'all' | 'enabled' | 'disabled' | 'full';
const VAULT_FILTER_OPTIONS: { value: VaultFilterValue; label: string }[] = [
  { value: 'all',      label: 'All Status' },
  { value: 'enabled',  label: 'Vault On'   },
  { value: 'disabled', label: 'Vault Off'  },
  { value: 'full',     label: 'Full'       },
];
const VAULT_SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'name',     label: 'A – Z'       },
  { value: 'progress', label: 'By Progress' },
  { value: 'balance',  label: 'By Balance'  },
];

const VaultFilterDropdown = React.forwardRef<{ close: () => void }, {
  value: VaultFilterValue;
  onChange: (v: VaultFilterValue) => void;
  onCloseOther: () => void;
  playSound: (s: string) => void;
}>(({ value, onChange, onCloseOther, playSound }, fwdRef) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  React.useImperativeHandle(fwdRef, () => ({ close: () => setOpen(false) }));
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const label = value === 'all' ? 'Status' : (VAULT_FILTER_OPTIONS.find(o => o.value === value)?.label ?? 'Status');
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => { setOpen(o => !o); onCloseOther(); }}
        className={`h-10 flex items-center gap-2 px-3.5 rounded-xl border text-xs font-semibold uppercase tracking-wide transition-all outline-none ${
          open
            ? 'bg-white dark:bg-slate-800 border-emerald-500 ring-4 ring-emerald-500/10 text-slate-900 dark:text-slate-100'
            : value !== 'all'
            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-600 dark:text-slate-300'
        }`}
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 9h10M11 14h2" />
        </svg>
        <span className="hidden sm:inline">{label}</span>
        <svg className={`w-3 h-3 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {value !== 'all' && !open && (
        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-500 text-white text-xs font-black flex items-center justify-center leading-none pointer-events-none">1</span>
      )}
      {open && (
        <div className="absolute z-[200] top-[calc(100%+6px)] right-0 min-w-[168px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 ring-1 ring-slate-900/5">
          {VAULT_FILTER_OPTIONS.map(({ value: v, label: l }) => {
            const checked = value === v;
            return (
              <button
                key={v}
                onClick={() => { onChange(v); setOpen(false); playSound('click'); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${checked ? 'bg-slate-50 dark:bg-slate-700' : ''}`}
              >
                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 dark:border-slate-600'}`}>
                  {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M5 13l4 4L19 7" /></svg>}
                </span>
                <span className={`text-xs font-semibold uppercase tracking-wide ${checked ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>{l}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

const VaultSortDropdown = React.forwardRef<{ close: () => void }, {
  value: SortMode;
  onChange: (v: SortMode) => void;
  onCloseOther: () => void;
  playSound: (s: string) => void;
}>(({ value, onChange, onCloseOther, playSound }, fwdRef) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  React.useImperativeHandle(fwdRef, () => ({ close: () => setOpen(false) }));
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const label = VAULT_SORT_OPTIONS.find(o => o.value === value)?.label ?? 'Sort';
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => { setOpen(o => !o); onCloseOther(); }}
        className={`h-10 flex items-center gap-2 px-3.5 rounded-xl border text-xs font-semibold uppercase tracking-wide transition-all outline-none ${
          open
            ? 'bg-white dark:bg-slate-800 border-indigo-500 ring-4 ring-indigo-500/10 text-slate-900 dark:text-slate-100'
            : value !== 'name'
            ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-600 dark:text-slate-300'
        }`}
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M6 12h12M10 18h4" />
        </svg>
        <span className="hidden sm:inline">{label}</span>
        <svg className={`w-3 h-3 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-[200] top-[calc(100%+6px)] right-0 min-w-[168px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 ring-1 ring-slate-900/5">
          {VAULT_SORT_OPTIONS.map(({ value: v, label: l }) => {
            const checked = value === v;
            return (
              <button
                key={v}
                onClick={() => { onChange(v); setOpen(false); playSound('click'); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${checked ? 'bg-slate-50 dark:bg-slate-700' : ''}`}
              >
                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300 dark:border-slate-600'}`}>
                  {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M5 13l4 4L19 7" /></svg>}
                </span>
                <span className={`text-xs font-semibold uppercase tracking-wide ${checked ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>{l}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
// ---------------------------------------------------------------------------

export const VaultFundHub: React.FC<VaultFundHubProps> = ({ branches, salesReports, vaultTransactions = [], isReadOnly, onRefresh }) => {
  const [vaultRows, setVaultRows] = useState<Record<string, VaultRow>>({});
  const [loadingVaults, setLoadingVaults] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [chartModalBranchId, setChartModalBranchId] = useState<string | null>(null);
  const [chartExpanded, setChartExpanded] = useState(false);
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
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [vaultFilter, setVaultFilter] = useState<VaultFilterValue>('all');
  const [sortMode, setSortMode] = useState<SortMode>('name');
  // Refs for mutual-close between filter and sort dropdowns
  const filterDropdownRef = useRef<{ close: () => void }>(null);
  const sortDropdownRef = useRef<{ close: () => void }>(null);

  const [historyOpen, setHistoryOpen] = useState<Set<string>>(new Set());
  // Expand state lives in a ref — toggling never triggers a React re-render,
  // so all 66+ cards stay untouched when one card expands.
  const expandedRef = useRef<Set<string>>(new Set());
  const toggleCardExpand = useCallback((branchId: string, cardEl: HTMLElement) => {
    if (expandedRef.current.has(branchId)) {
      expandedRef.current.delete(branchId);
      cardEl.dataset.expanded = 'false';
    } else {
      expandedRef.current.add(branchId);
      cardEl.dataset.expanded = 'true';
    }
    playSound('click');
  }, []);
  const [vaultTotals, setVaultTotals] = useState<Record<string, { deposited: number; depositCount: number; withdrawn: number; withdrawalCount: number }>>({});
  const [detailBranchId, setDetailBranchId] = useState<string | null>(null);
  const [detailTxns, setDetailTxns] = useState<VaultTransaction[]>([]);
  const [detailTxnsLoading, setDetailTxnsLoading] = useState(false);
  const [txHistoryTab, setTxHistoryTab] = useState<'deposits' | 'withdrawals'>('deposits');
  const [visibleDeposits, setVisibleDeposits] = useState(20);
  const [visibleWithdrawals, setVisibleWithdrawals] = useState(20);
  const [receiptModal, setReceiptModal] = useState<{ url: string; label: string } | null>(null);
  const [kpiExpanded, setKpiExpanded] = useState(false);
  const [roiDropdownOpen, setRoiDropdownOpen] = useState(false);
  const [confirmToggleBranch, setConfirmToggleBranch] = useState<Branch | null>(null);

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
    downloadCSV(rows, `vault-all-transactions-${getManilaTodayStr()}.csv`);
    playSound('success');
  };

  const handleExportBranchCSV = (branchId: string, branchName: string, type: 'deposits' | 'withdrawals') => {
    // Use detailTxns (full per-branch fetch, no row cap) instead of the prop-derived capped history maps
    const startDate = vaultRows[branchId]?.startDate ?? null;
    const txList = type === 'deposits'
      ? detailTxns
          .filter(t => t.type === 'DEPOSIT' || t.type === 'ADMIN_DEPOSIT')
          .filter(t => !startDate || (t.timestamp ?? '').slice(0, 10) >= startDate)
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      : detailTxns
          .filter(t => t.type === 'WITHDRAWAL' || t.type === 'VAULT_WITHDRAWAL')
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    if (txList.length === 0) return;

    const safeLabel = type === 'deposits' ? 'deposits' : 'withdrawals';
    const safeName = branchName.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_').toLowerCase();
    const rows: string[][] = [
      ['Branch', 'Date', 'Time', 'Type', 'Label', 'Amount', 'Performed By', 'Transaction ID'],
    ];

    txList.forEach(t => {
      const typeLabel =
        t.type === 'ADMIN_DEPOSIT' ? 'Admin Deposit' :
        t.type === 'DEPOSIT' ? 'Manager Deposit' :
        t.type === 'WITHDRAWAL' ? 'Withdrawal' :
        t.type === 'VAULT_WITHDRAWAL' ? 'Vault Withdrawal' : t.type;
      const sign = (t.type === 'WITHDRAWAL' || t.type === 'VAULT_WITHDRAWAL') ? '-' : '+';
      rows.push([
        branchName,
        t.timestamp.slice(0, 10),
        t.timestamp.length > 10 ? t.timestamp.slice(11, 16) : '',
        typeLabel,
        t.name ?? '',
        sign + t.amount.toString(),
        t.performedBy ?? '',
        t.id,
      ]);
    });

    downloadCSV(rows, `vault-${safeLabel}-${safeName}-${getManilaTodayStr()}.csv`);
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
      setChartExpanded(false);
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
        const today = getManilaTodayStr();
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
      const now = getTrueDate();
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


  const filteredBranches = useMemo(() => {
    let result = branches.filter(b => b.isEnabled);

    // Branch multi-select filter
    if (selectedBranchIds.length > 0) {
      result = result.filter(b => selectedBranchIds.includes(b.id));
    }

    // Search: name, balance, target, deposited amount
    if (debouncedSearch.trim()) {
      const term = debouncedSearch.trim();
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
  }, [branches, selectedBranchIds, debouncedSearch, vaultFilter, localEnabled, vaultRows, sortMode, vaultTotals]);

  return (
    <div className="space-y-5">


      {/* Network Summary */}
      <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm">
        {loadingVaults ? (
          <>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="space-y-2.5">
                <div className="h-2 w-32 bg-slate-100 dark:bg-slate-700 rounded-full animate-pulse" />
                <div className="h-9 w-52 bg-slate-100 dark:bg-slate-700 rounded-xl animate-pulse" />
                <div className="h-2 w-40 bg-slate-100 dark:bg-slate-700 rounded-full animate-pulse" />
              </div>
              <div className="flex gap-2 shrink-0">
                {[0,1,2].map(i => (
                  <div key={i} className="flex items-center gap-2.5 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5">
                    <div className="w-7 h-7 rounded-xl bg-slate-100 dark:bg-slate-700 animate-pulse shrink-0" />
                    <div className="space-y-1.5">
                      <div className="h-4 w-6 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" />
                      <div className="h-1.5 w-10 bg-slate-100 dark:bg-slate-700 rounded-full animate-pulse" />
                      <div className="h-1.5 w-14 bg-slate-100 dark:bg-slate-700 rounded-full animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between">
                <div className="h-2 w-24 bg-slate-100 dark:bg-slate-700 rounded-full animate-pulse" />
                <div className="h-2 w-8 bg-slate-100 dark:bg-slate-700 rounded-full animate-pulse" />
              </div>
              <div className="h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full">
                <div className="h-full w-2/5 bg-slate-200 dark:bg-slate-600 rounded-full animate-pulse" />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              {/* Balance */}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wide">Network Vault Balance</p>
                <p className="text-3xl font-black text-slate-900 dark:text-slate-100 tabular-nums leading-none mt-1">
                  ₱{networkSummary.totalBalance.toLocaleString()}
                </p>
                {networkSummary.totalTarget > 0 && (
                  <p className="text-xs font-medium text-slate-400 mt-1">
                    of ₱{networkSummary.totalTarget.toLocaleString()} combined target
                  </p>
                )}
              </div>

              {/* KPI pills */}
              <div className="flex gap-2 w-full sm:w-auto">
                {/* Vault On */}
                <div className="flex-1 flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 min-w-0">
                  <div className="hidden sm:flex w-7 h-7 rounded-xl bg-emerald-100 items-center justify-center shrink-0">
                    <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-black text-emerald-700 tabular-nums leading-none">{networkSummary.enabledCount}</p>
                    <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide leading-none mt-0.5">Active</p>
                  </div>
                </div>

                {/* Vault Off */}
                <div className="flex-1 flex items-center gap-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 min-w-0">
                  <div className="hidden sm:flex w-7 h-7 rounded-xl bg-slate-100 dark:bg-slate-700 items-center justify-center shrink-0">
                    <svg className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-black text-slate-600 dark:text-slate-300 tabular-nums leading-none">{networkSummary.disabledCount}</p>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-none mt-0.5">Inactive</p>
                  </div>
                </div>

                {/* Full */}
                <div className={`flex-1 flex items-center gap-2 rounded-xl px-3 py-2.5 border min-w-0 ${networkSummary.fullCount > 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-700'}`}>
                  <div className={`hidden sm:flex w-7 h-7 rounded-xl items-center justify-center shrink-0 ${networkSummary.fullCount > 0 ? 'bg-emerald-100' : 'bg-slate-100 dark:bg-slate-700'}`}>
                    <svg className={`w-3.5 h-3.5 ${networkSummary.fullCount > 0 ? 'text-emerald-600' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className={`text-base font-black tabular-nums leading-none ${networkSummary.fullCount > 0 ? 'text-emerald-700' : 'text-slate-500 dark:text-slate-400'}`}>{networkSummary.fullCount}</p>
                    <p className={`text-xs font-semibold uppercase tracking-wide leading-none mt-0.5 ${networkSummary.fullCount > 0 ? 'text-emerald-600' : 'text-slate-500 dark:text-slate-400'}`}>At Target</p>
                  </div>
                </div>
              </div>
            </div>

            {networkSummary.totalTarget > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Overall Progress</span>
                  <span className={`text-xs font-semibold uppercase tracking-wide ${networkSummary.overallProgress >= 100 ? 'text-emerald-600' : 'text-slate-500'}`}>
                    {networkSummary.overallProgress}%
                  </span>
                </div>
                <div className="h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
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
            placeholder="SEARCH NAME, BALANCE, TARGET…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value.toUpperCase())}
            className="w-full h-10 pl-9 pr-8 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 uppercase placeholder:text-slate-300 placeholder:font-medium placeholder:normal-case focus:bg-white dark:focus:bg-slate-800 focus:border-slate-400 focus:ring-2 focus:ring-slate-400/10 transition-all outline-none"
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

        {/* Vault status filter dropdown — isolated component; open/close state does not touch parent */}
        <VaultFilterDropdown
          ref={filterDropdownRef}
          value={vaultFilter}
          onChange={setVaultFilter}
          onCloseOther={() => sortDropdownRef.current?.close()}
          playSound={playSound}
        />

        {/* Sort dropdown — isolated component */}
        <VaultSortDropdown
          ref={sortDropdownRef}
          value={sortMode}
          onChange={setSortMode}
          onCloseOther={() => filterDropdownRef.current?.close()}
          playSound={playSound}
        />

        {/* Export CSV button */}
        <button
          onClick={handleExportAllCSV}
          title="Export all vault transactions as CSV"
          className="h-10 flex items-center gap-2 px-3.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-semibold uppercase tracking-wide transition-all outline-none shrink-0 active:scale-95"
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
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">No branches match</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-700/30">
                  <th className="px-5 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Branch</th>
                  <th className="px-4 py-3.5 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Balance</th>
                  <th className="px-4 py-3.5 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Initial</th>
                  <th className="px-4 py-3.5 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Deposited</th>
                  <th className="px-4 py-3.5 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Withdrawals</th>
                  <th className="px-4 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wide w-40">Progress</th>
                  <th className="px-5 py-3.5 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
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
                    <tr key={branch.id} onClick={() => setDetailBranchId(branch.id)} className="hover:bg-slate-50/60 dark:hover:bg-slate-700/30 transition-colors cursor-pointer">
                      {/* Branch */}
                      <td className="px-5 py-4">
                        <p className={`text-xs font-black uppercase tracking-wide ${enabled ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}`}>{branch.name}</p>
                        {enabled && row?.startDate && (
                          <p className="text-xs font-bold text-slate-400 mt-0.5">Since {row.startDate}</p>
                        )}
                        {depositCount > 0 && (
                          <p className="text-xs font-bold text-slate-300 mt-0.5">{depositCount} deposit{depositCount !== 1 ? 's' : ''}</p>
                        )}
                      </td>
                      {/* Balance */}
                      <td className="px-4 py-4 text-right">
                        <span className={`text-sm font-black tabular-nums ${!enabled ? 'text-slate-300' : isFull ? 'text-emerald-600' : notConfigured ? 'text-amber-600' : 'text-slate-900 dark:text-slate-100'}`}>
                          {enabled ? `₱${balance.toLocaleString()}` : '—'}
                        </span>
                      </td>
                      {/* Initial */}
                      <td className="px-4 py-4 text-right">
                        <span className={`text-xs font-black tabular-nums ${enabled && initialBalance > 0 ? 'text-slate-500 dark:text-slate-400' : 'text-slate-300'}`}>
                          {enabled && initialBalance > 0 ? `₱${initialBalance.toLocaleString()}` : '—'}
                        </span>
                      </td>
                      {/* Deposited */}
                      <td className="px-4 py-4 text-right">
                        <span className={`text-xs font-black tabular-nums ${row?.startDate && (rowTotals?.deposited ?? 0) > 0 ? 'text-slate-700 dark:text-slate-300' : 'text-slate-300'}`}>
                          {row?.startDate && (rowTotals?.deposited ?? 0) > 0 ? `₱${(rowTotals?.deposited ?? 0).toLocaleString()}` : '—'}
                        </span>
                      </td>
                      {/* Withdrawals */}
                      <td className="px-4 py-4 text-right">
                        {(() => { const w = rowTotals?.withdrawn ?? 0; return (
                          <span className={`text-xs font-black tabular-nums ${w > 0 ? 'text-rose-500' : 'text-slate-300'}`}>
                            {w > 0 ? `₱${w.toLocaleString()}` : '—'}
                          </span>
                        ); })()}
                      </td>
                      {/* Progress */}
                      <td className="px-4 py-4 w-40">
                        {enabled && target > 0 ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <span className={`text-xs font-black tabular-nums ${isFull ? 'text-emerald-600' : 'text-slate-500 dark:text-slate-400'}`}>{progress}%</span>
                              <span className="text-xs font-bold text-indigo-400 tabular-nums">₱{target.toLocaleString()}</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all duration-500 ${isFull ? 'bg-emerald-500' : 'bg-emerald-400'}`} style={{ width: `${progress}%` }} />
                            </div>
                          </div>
                        ) : enabled ? (
                          <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">No target</span>
                        ) : (
                          <span className="text-slate-200 text-xs">—</span>
                        )}
                      </td>
                      {/* Actions */}
                      <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {!isReadOnly && (
                            <button
                              onClick={() => { setDetailBranchId(branch.id); startEdit(branch); setDepositingId(null); }}
                              className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center transition-all"
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
                data-expanded={expandedRef.current.has(branch.id) ? 'true' : 'false'}
                className={`group rounded-2xl border-2 transition-all duration-300 overflow-hidden ${
                  cardState === 'off'
                    ? 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700'
                    : cardState === 'unconfigured'
                    ? 'bg-white dark:bg-slate-800 border-amber-200 shadow-sm shadow-amber-50'
                    : cardState === 'full'
                    ? 'bg-white dark:bg-slate-800 border-emerald-300 shadow-md shadow-emerald-50'
                    : 'bg-white dark:bg-slate-800 border-emerald-100 shadow-sm'
                }`}
              >
                {/* Card Header — clickable to expand/collapse (DOM-direct, no React re-render) */}
                <div
                  className={`px-5 pt-5 pb-4 cursor-pointer select-none active:opacity-80 transition-opacity ${
                    cardState === 'full' ? 'bg-emerald-50/60'
                    : cardState === 'unconfigured' ? 'bg-amber-50/40'
                    : ''
                  }`}
                  onClick={(e) => {
                    if ((e.target as Element).closest('button, input, select')) return;
                    toggleCardExpand(branch.id, e.currentTarget.closest('[data-expanded]') as HTMLElement);
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-black uppercase tracking-wide truncate leading-none ${
                        cardState === 'off' ? 'text-slate-400' : 'text-slate-900 dark:text-slate-100'
                      }`}>
                        {branch.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {cardState === 'off' && (
                          <span className="text-xs font-black text-slate-300 uppercase tracking-widest">Vault off</span>
                        )}
                        {cardState === 'unconfigured' && (
                          <span className="text-xs font-black text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full uppercase tracking-widest">
                            No target set
                          </span>
                        )}
                        {(cardState === 'active' || cardState === 'full') && row?.startDate && (
                          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                            Since {row.startDate}
                          </span>
                        )}
                        {cardState === 'full' && (
                          <span className="text-xs font-black text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full uppercase tracking-widest">
                            Target Reached
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Configure button + chevron */}
                    <div className="flex items-center gap-2 shrink-0">
                      {!isReadOnly && !isEditing && !isDepositing && (
                        <button
                          onClick={e => { e.stopPropagation(); startEdit(branch); setDepositingId(null); }}
                          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                            cardState === 'unconfigured'
                              ? 'bg-amber-100 hover:bg-amber-200 text-amber-500 hover:text-amber-700'
                              : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                          }`}
                          title="Configure vault"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </button>
                      )}
                      <svg
                        className="w-4 h-4 text-slate-300 dark:text-slate-600 transition-transform duration-200 group-data-[expanded=true]:rotate-180"
                        fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Balance + progress — with target */}
                  {(cardState === 'active' || cardState === 'full') && target > 0 && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-black text-indigo-400 uppercase tracking-widest">Target ₱{target.toLocaleString()}</p>
                        <span className={`text-xs font-semibold uppercase tracking-wide tabular-nums ${isFull ? 'text-emerald-600' : 'text-slate-400 dark:text-slate-500'}`}>
                          {isFull ? '✓ Reached' : `${progress}%`}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${isFull ? 'bg-emerald-500' : 'bg-emerald-400'}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Current Fund</p>
                        <p className={`text-2xl font-black tabular-nums leading-none ${isFull ? 'text-emerald-600' : 'text-slate-900 dark:text-slate-100'}`}>
                          ₱{balance.toLocaleString()}
                        </p>
                        {!isFull && (
                          <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-0.5 tabular-nums">
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
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Deposited so far</p>
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
                          className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold uppercase tracking-wide transition-all active:scale-95"
                        >
                          Set Target →
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Stats + history — hidden by default, shown via CSS when card is expanded */}
                <div className="hidden group-data-[expanded=true]:block">
                    {/* Stats row — initial / deposited / withdrawals */}
                    <div className={`px-5 py-3.5 grid gap-3 border-t border-slate-50 dark:border-slate-700/50 ${
                      cardState === 'off' ? 'grid-cols-1' : 'grid-cols-3'
                    }`}>
                      {cardState === 'off' ? (
                        <p className="text-xs font-bold text-slate-300 uppercase tracking-widest text-center">Vault disabled for this branch</p>
                      ) : (
                        <>
                          <div>
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide leading-none mb-1">Initial</p>
                            <p className={`text-sm font-black tabular-nums leading-none ${initialBalance > 0 ? 'text-slate-500 dark:text-slate-400' : 'text-slate-300'}`}>
                              {initialBalance > 0 ? `₱${initialBalance.toLocaleString()}` : '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide leading-none mb-1">Deposited</p>
                            <p className={`text-sm font-black tabular-nums leading-none ${row?.startDate && (rowTotals?.deposited ?? 0) > 0 ? 'text-slate-700 dark:text-slate-300' : 'text-slate-300'}`}>
                              {row?.startDate && (rowTotals?.deposited ?? 0) > 0 ? `₱${(rowTotals?.deposited ?? 0).toLocaleString()}` : '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide leading-none mb-1">Withdrawn</p>
                            {(() => { const w = rowTotals?.withdrawn ?? 0; return (
                              <p className={`text-sm font-black tabular-nums leading-none ${w > 0 ? 'text-rose-500' : 'text-slate-300'}`}>
                                {w > 0 ? `₱${w.toLocaleString()}` : '—'}
                              </p>
                            ); })()}
                          </div>
                        </>
                      )}
                    </div>

                    {/* View full history button */}
                    {enabled && (
                      <div className="border-t border-slate-50 dark:border-slate-700/50 px-5 py-3">
                        <button
                          onClick={() => { setDetailBranchId(branch.id); playSound('click'); }}
                          className="w-full flex items-center justify-center gap-2 h-9 rounded-xl bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-xs font-semibold text-slate-400 dark:text-slate-300 uppercase tracking-wide transition-all active:scale-95"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          View Deposit & Withdrawal History
                        </button>
                      </div>
                    )}
                </div>


                {/* Deposit form */}
                {!isReadOnly && isDepositing && (() => {
                  const roiOptions = roiOptionsByBranch[branch.id] ?? [];
                  return (
                  <div className="px-5 pb-5 pt-4 space-y-3 border-t border-emerald-100 bg-emerald-50/40 animate-in slide-in-from-top-1 duration-150">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-black text-emerald-700 uppercase tracking-widest">Deposit to Vault</p>
                      {roiOptions.length > 0 && (
                        <div className="relative">
                          <select
                            defaultValue=""
                            onChange={e => { if (e.target.value) { const [date, amount] = e.target.value.split('||'); setDepositInput(amount); setRoiSourceDate(date); playSound('click'); } }}
                            className="h-6 pl-2 pr-6 rounded-lg bg-indigo-50 border border-indigo-200 text-xs font-black text-indigo-600 uppercase tracking-widest appearance-none outline-none cursor-pointer hover:bg-indigo-100 transition-all"
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
                          className="w-full pl-6 pr-2 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-700 font-bold text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 transition-all"
                        />
                      </div>
                      <button
                        onClick={() => { setDepositingId(null); setDepositInput(''); setRoiSourceDate(''); }}
                        className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleAdminDeposit(branch.id)}
                        disabled={isSavingDeposit || !parseFloat(depositInput) || parseFloat(depositInput) <= 0}
                        className="h-10 px-4 rounded-xl bg-emerald-600 text-white text-xs font-semibold uppercase tracking-wide hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-40 shrink-0"
                      >
                        {isSavingDeposit ? '…' : 'Confirm'}
                      </button>
                    </div>
                    {parseFloat(depositInput) > 0 && (
                      <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">
                        New balance: ₱{(balance + parseFloat(depositInput)).toLocaleString()}
                      </p>
                    )}
                  </div>
                  );
                })()}

                {/* Edit form */}
                {!isReadOnly && isEditing && (
                  <div className="px-5 pb-5 space-y-3 border-t border-slate-100 dark:border-slate-700 pt-4">
                    {/* Toggle inside configure */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">Vault Enabled</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 font-medium mt-0.5">{enabled ? 'Active — provisions collected' : 'Inactive'}</p>
                      </div>
                      <button
                        onClick={() => { if (!isToggling) setConfirmToggleBranch(branch); }}
                        disabled={isToggling}
                        className={`relative rounded-full transition-all duration-300 shrink-0 disabled:opacity-50 cursor-pointer ${enabled ? 'bg-emerald-500' : 'bg-slate-200'}`}
                        style={{ height: '26px', width: '46px' }}
                      >
                        <span className={`absolute top-[3px] w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${enabled ? 'left-[23px]' : 'left-[3px]'}`} />
                      </button>
                    </div>
                    <div className="border-t border-slate-100 dark:border-slate-700" />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide block mb-1.5">Target (₱)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xs">₱</span>
                          <input
                            type="number"
                            min="0"
                            value={editTarget}
                            onChange={e => setEditTarget(e.target.value)}
                            placeholder="0"
                            className="w-full pl-6 pr-2 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 font-bold text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-700 transition-all"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide block mb-1.5">Initial Balance (₱)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xs">₱</span>
                          <input
                            type="number"
                            min="0"
                            value={editInitialBalance}
                            onChange={e => setEditInitialBalance(e.target.value)}
                            placeholder="0"
                            className="w-full pl-6 pr-2 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 font-bold text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide block mb-1.5">
                        Start Date
                        <span className="ml-2 normal-case font-bold text-slate-300">(reports before this = Rent & Bills)</span>
                      </label>
                      <input
                        type="date"
                        value={editStartDate}
                        onChange={e => setEditStartDate(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 font-bold text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all"
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
                          <p className="text-xs font-bold text-indigo-700 uppercase tracking-widest leading-relaxed">
                            Balance will {delta > 0 ? 'increase' : 'decrease'} by ₱{Math.abs(delta).toLocaleString()} → New balance: ₱{Math.max(0, currentBal + delta).toLocaleString()}
                          </p>
                        </div>
                      );
                    })()}

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => setEditingId(null)}
                        className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSave(branch.id)}
                        disabled={isSaving}
                        className="flex-1 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold uppercase tracking-wide hover:bg-slate-700 dark:hover:bg-slate-200 active:scale-95 transition-all disabled:opacity-40"
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
          .map(t => ({ id: t.id, date: (t.timestamp ?? '').slice(0, 10), timestamp: t.timestamp ?? '', amount: t.amount, name: t.name ?? '', performedBy: t.performedBy, receiptImage: t.receiptImage ?? null }));
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
          <>
          {/* Landscape chart modal — mobile only */}
          {chartModalBranchId === branch.id && (
            <div className="fixed inset-0 z-[1200] bg-white dark:bg-slate-900 sm:hidden flex flex-col" style={{ touchAction: 'none' }}>
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 dark:border-slate-700 shrink-0">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Deposit & Withdrawal Trend</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-none mt-0.5">{branch.name}</p>
                </div>
                <button
                  onClick={() => {
                    setChartModalBranchId(null);
                    try { (screen.orientation as any).unlock?.(); } catch (_) {}
                  }}
                  className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              {/* Chart — fills remaining space */}
              <div className="flex-1 px-3 pb-6 flex items-center">
                <VaultLineChart
                  deposits={branchHistory.map(e => ({ date: e.date, amount: e.amount }))}
                  withdrawals={branchWithdrawals.map(e => ({ date: e.date, amount: e.amount }))}
                />
              </div>
              {/* Rotate hint */}
              <p className="text-center text-xs text-slate-400 font-medium uppercase tracking-wide pb-4 shrink-0">Rotate phone for landscape view</p>
            </div>
          )}
          <div
            className="fixed inset-0 z-[1100] flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
          >
            <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl w-full max-w-2xl max-h-[94dvh] flex flex-col shadow-xl overflow-hidden">

              {/* ── Header (dark) ── */}
              <div className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-700 px-4 sm:px-7 pt-5 sm:pt-6 pb-5 shrink-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Vault Details</p>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-none">{branch.name}</h3>
                    {enabled && row?.startDate && (
                      <p className="text-xs text-slate-400 mt-1.5">
                        Active since {new Date(row.startDate + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 mt-0.5">
                    {!isReadOnly && (
                      <button onClick={() => startEdit(branch)}
                        className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors"
                        title="Configure">
                        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      </button>
                    )}
                    <button onClick={closeModal} className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors">
                      <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>

                {/* Stats — balance hero + secondary grid */}
                {enabled && (
                  <div className="mt-5 space-y-4">
                    {/* Balance hero */}
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Current Balance</p>
                      <p className={`text-3xl font-black tabular-nums leading-none ${isFull ? 'text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                        ₱{balance.toLocaleString()}
                      </p>
                      {target > 0 && (
                        <p className="text-xs text-slate-400 mt-1 tabular-nums">
                          {isFull ? '✓ Target reached' : `₱${(target - balance).toLocaleString()} to reach ₱${target.toLocaleString()}`}
                        </p>
                      )}
                    </div>
                    {/* Secondary stats — tap to expand on mobile, always shown on desktop */}
                    <button
                      className="w-full text-left sm:hidden flex items-center justify-between mt-1"
                      onClick={() => setKpiExpanded(v => !v)}
                    >
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Overview</span>
                      <svg className={`w-3 h-3 text-slate-500 transition-transform duration-200 ${kpiExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    <div className={`grid gap-2 ${initialBalance > 0 ? 'grid-cols-3' : 'grid-cols-2'} ${kpiExpanded ? '' : 'hidden'} sm:grid`}>
                      <div className="bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2.5">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Deposited</p>
                        <p className="text-sm font-black text-emerald-400 tabular-nums leading-none">+₱{totalDeposited.toLocaleString()}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{branchHistory.length} entries</p>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2.5">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Withdrawn</p>
                        <p className="text-sm font-black text-rose-400 tabular-nums leading-none">−₱{totalWithdrawals.toLocaleString()}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{branchWithdrawals.length} entries</p>
                      </div>
                      {initialBalance > 0 && (
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2.5">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Starting</p>
                          <p className="text-sm font-black text-slate-300 tabular-nums leading-none">₱{initialBalance.toLocaleString()}</p>
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
                    <p className="text-xs text-slate-500 mt-1.5 tabular-nums">{progress}% funded</p>
                  </div>
                )}
              </div>

              {/* ── Body ── */}
              <div className="flex-1 overflow-y-auto overscroll-contain">
                <div className="px-4 sm:px-7 py-5 space-y-5">


                  {/* Deposit form */}
                  {!isReadOnly && isDepositing && (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-visible shadow-sm">
                      <div className="px-4 py-3 flex items-center justify-between border-b border-slate-100 dark:border-slate-700">
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0 0l-6-6m6 6l6-6" /></svg>
                          <p className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">Deposit to Vault</p>
                        </div>
                        <button onClick={() => { setDepositingId(null); setDepositInput(''); setRoiSourceDate(''); setRoiDropdownOpen(false); }}
                          className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center transition-colors text-slate-400">
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
                                <span className="flex-1 text-xs font-bold text-indigo-700 truncate">
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
                                className="w-full flex items-center justify-between h-8 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:border-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-slate-600 transition-all group">
                                <span className="text-xs font-bold text-slate-400 group-hover:text-indigo-600 transition-colors">↓ Pull from a past ROI…</span>
                                <svg className={`w-3 h-3 text-slate-400 transition-transform ${roiDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                              </button>
                            )}
                            {roiDropdownOpen && !roiSourceDate && (
                              <div className="absolute z-50 top-[calc(100%+4px)] left-0 right-0 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden">
                                {roiOptions.map((opt, i) => (
                                  <button key={opt.date}
                                    onClick={() => { setDepositInput(String(opt.amount)); setRoiSourceDate(opt.date); setRoiDropdownOpen(false); playSound('click'); }}
                                    className={`w-full flex items-center justify-between px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors text-left ${i > 0 ? 'border-t border-slate-50 dark:border-slate-700' : ''}`}>
                                    <div>
                                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                        {new Date(opt.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                      </p>
                                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-0.5">Net ROI</p>
                                    </div>
                                    <span className="text-xs font-black text-emerald-600 tabular-nums">₱{opt.amount.toLocaleString()}</span>
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
                            className="w-full pl-7 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 font-black text-base text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-emerald-500/10 transition-all tabular-nums placeholder:text-slate-300" />
                        </div>

                        {/* Compact balance preview */}
                        {parseFloat(depositInput) > 0 && (
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 tabular-nums">
                            <span>₱{balance.toLocaleString()}</span>
                            <svg className="w-3 h-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                            <span className="text-emerald-600 font-black">₱{(balance + parseFloat(depositInput)).toLocaleString()}</span>
                            <span className="text-slate-300">after deposit</span>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-0.5">
                          <button onClick={() => { setDepositingId(null); setDepositInput(''); setRoiSourceDate(''); setRoiDropdownOpen(false); }}
                            className="h-9 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">
                            Cancel
                          </button>
                          <button onClick={() => handleAdminDeposit(branch.id)}
                            disabled={isSavingDeposit || !parseFloat(depositInput) || parseFloat(depositInput) <= 0}
                            className="flex-1 h-9 rounded-xl bg-emerald-600 text-white text-xs font-semibold uppercase tracking-wide hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-1.5">
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
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
                        <p className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">Configure Vault</p>
                      </div>
                      <div className="p-5 space-y-4">
                        {/* Vault enable toggle */}
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">Vault Enabled</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 font-medium mt-0.5">{enabled ? 'Active — provisions are being collected' : 'Inactive — no provisions collected'}</p>
                          </div>
                          <button
                            onClick={() => handleToggle(branch)}
                            disabled={!!togglingId}
                            className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${enabled ? 'bg-emerald-500' : 'bg-slate-300'} disabled:opacity-50`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                          </button>
                        </div>
                        <div className="border-t border-slate-100 dark:border-slate-700" />
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide block mb-1.5">Target (₱)</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₱</span>
                              <input type="number" min="0" value={editTarget} onChange={e => setEditTarget(e.target.value)} placeholder="0"
                                className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 font-bold text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-700 transition-all" />
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide block mb-1.5">Initial Balance (₱)</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₱</span>
                              <input type="number" min="0" value={editInitialBalance} onChange={e => setEditInitialBalance(e.target.value)} placeholder="0"
                                className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 font-bold text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all" />
                            </div>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-400 uppercase tracking-wide block mb-1.5">
                            Start Date <span className="ml-1 normal-case font-bold text-slate-300">(reports before = Rent & Bills)</span>
                          </label>
                          <input type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 font-bold text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all" />
                        </div>
                        {(() => {
                          const delta = (parseFloat(editInitialBalance) || 0) - (row?.initialBalance ?? 0);
                          if (delta === 0) return null;
                          return (
                            <p className="text-xs font-bold text-indigo-600">
                              Balance will {delta > 0 ? 'increase' : 'decrease'} by ₱{Math.abs(delta).toLocaleString()} → New balance: ₱{Math.max(0, (row?.balance ?? 0) + delta).toLocaleString()}
                            </p>
                          );
                        })()}
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => setEditingId(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">Cancel</button>
                          <button onClick={() => handleSave(branch.id)} disabled={isSaving}
                            className="flex-1 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold uppercase tracking-wide hover:bg-slate-700 dark:hover:bg-slate-200 active:scale-95 transition-all disabled:opacity-40">
                            {isSaving ? 'Saving…' : 'Save Changes'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Line Chart (desktop only, collapsible) ── */}
                  {!isEditing && (branchHistory.length > 0 || branchWithdrawals.length > 0) && (
                    <div className="hidden sm:block rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                      <button
                        onClick={() => setChartExpanded(v => !v)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Deposit & Withdrawal Trend</span>
                        <svg className={`w-3.5 h-3.5 text-slate-300 transition-transform duration-200 ${chartExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {chartExpanded && (
                        <div className="p-4 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700">
                          <VaultLineChart
                            deposits={branchHistory.map(e => ({ date: e.date, amount: e.amount }))}
                            withdrawals={branchWithdrawals.map(e => ({ date: e.date, amount: e.amount }))}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Transaction History ── */}
                  {!isEditing && (branchHistory.length > 0 || branchWithdrawals.length > 0) && (
                    <div className="space-y-3">
                      {/* Tab row */}
                      <div className="flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-700 pb-3">
                        <button
                          onClick={() => { setTxHistoryTab('deposits'); setVisibleDeposits(20); }}
                          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wide transition-all ${txHistoryTab === 'deposits' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                        >
                          <span className="hidden sm:inline">↓ </span>Deposits
                          <span className={`px-1.5 py-0.5 rounded-md text-xs font-black ${txHistoryTab === 'deposits' ? 'bg-emerald-200 text-emerald-700' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>{branchHistory.length}</span>
                        </button>
                        <button
                          onClick={() => { setTxHistoryTab('withdrawals'); setVisibleWithdrawals(20); }}
                          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wide transition-all ${txHistoryTab === 'withdrawals' ? 'bg-rose-100 text-rose-700' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                        >
                          <span className="hidden sm:inline">↑ </span>Withdrawals
                          <span className={`px-1.5 py-0.5 rounded-md text-xs font-black ${txHistoryTab === 'withdrawals' ? 'bg-rose-200 text-rose-700' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>{branchWithdrawals.length}</span>
                        </button>
                        <div className="ml-auto flex items-center gap-1.5">
                          {!isReadOnly && enabled && !isDepositing && !isEditing && (
                            <button
                              onClick={() => { setDepositingId(branch.id); setDepositInput(''); setRoiSourceDate(''); }}
                              title="Deposit to vault"
                              className="h-7 w-7 sm:w-auto sm:px-2.5 flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 hover:text-emerald-800 text-xs font-semibold uppercase tracking-wide transition-all"
                            >
                              <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0 0l-6-6m6 6l6-6" /></svg>
                              <span className="hidden sm:inline">Deposit</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleExportBranchCSV(branch.id, branch.name, txHistoryTab)}
                            title={`Export ${txHistoryTab} as CSV`}
                            className="h-7 w-7 sm:w-auto sm:px-2.5 flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs font-semibold uppercase tracking-wide transition-all"
                          >
                            <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                            </svg>
                            <span className="hidden sm:inline">Export</span>
                          </button>
                        </div>
                      </div>

                      {/* Deposits list */}
                      {txHistoryTab === 'deposits' && (
                        branchHistory.length === 0
                          ? <p className="text-xs font-bold text-slate-300 uppercase tracking-widest py-8 text-center">No deposits recorded</p>
                          : <div className="rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                              {/* Desktop header — hidden on mobile */}
                              <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_1fr_auto] bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 px-4 py-2">
                                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Date & Time</span>
                                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Source</span>
                                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Transaction ID</span>
                                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide text-right">Amount</span>
                              </div>
                              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                                {branchHistory.slice(0, visibleDeposits).map((entry, i) => {
                                  const [y, m, d] = entry.date.split('-').map(Number);
                                  const dateObj = new Date(y, m - 1, d);
                                  const isAdmin = entry.category === 'ADMIN_DEPOSIT';
                                  const timePart = entry.timestamp.length > 10 ? entry.timestamp.slice(11, 16) : null;
                                  return (
                                    <div key={i} className="px-4 py-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/60 transition-colors">
                                      {/* Mobile layout */}
                                      <div className="flex items-center justify-between gap-3 sm:hidden">
                                        <div className="min-w-0">
                                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight">
                                            {dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                          </p>
                                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wide ${isAdmin ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border border-transparent dark:border-violet-700/50' : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-transparent dark:border-emerald-700/50'}`}>
                                              {isAdmin ? 'Admin' : 'Manager'}
                                            </span>
                                            {(entry.performedBy || entry.name) && (
                                              <span className="text-xs font-medium text-slate-400 truncate">{entry.performedBy || entry.name}</span>
                                            )}
                                            {timePart && <span className="text-xs font-medium text-slate-400 tabular-nums">{timePart}</span>}
                                          </div>
                                        </div>
                                        <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">+₱{entry.amount.toLocaleString()}</span>
                                      </div>
                                      {/* Desktop layout */}
                                      <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_1fr_auto] items-center">
                                        <div>
                                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>
                                          {timePart && <p className="text-xs font-medium text-slate-400 mt-0.5 tabular-nums">{timePart}</p>}
                                        </div>
                                        <div>
                                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wide ${isAdmin ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border border-transparent dark:border-violet-700/50' : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-transparent dark:border-emerald-700/50'}`}>{isAdmin ? 'Admin' : 'Manager'}</span>
                                          {(entry.performedBy || entry.name) && <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1 truncate max-w-[130px]">{entry.performedBy || entry.name}</p>}
                                        </div>
                                        <p className="text-xs font-mono text-slate-400 truncate pr-4">{entry.id.slice(-14).toUpperCase()}</p>
                                        <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 tabular-nums">+₱{entry.amount.toLocaleString()}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              {visibleDeposits < branchHistory.length && (
                                <button
                                  onClick={() => setVisibleDeposits(v => v + 20)}
                                  className="w-full py-3 text-xs font-medium text-slate-400 uppercase tracking-wide hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-t border-slate-100 dark:border-slate-700"
                                >
                                  Load more · {branchHistory.length - visibleDeposits} remaining
                                </button>
                              )}
                            </div>
                      )}

                      {/* Withdrawals list */}
                      {txHistoryTab === 'withdrawals' && (
                        branchWithdrawals.length === 0
                          ? <p className="text-xs font-bold text-slate-300 uppercase tracking-widest py-8 text-center">No withdrawals recorded</p>
                          : <div className="rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                              {/* Desktop header — hidden on mobile */}
                              <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_1fr_auto] bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 px-4 py-2">
                                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Date & Time</span>
                                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Label</span>
                                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Transaction ID</span>
                                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide text-right">Amount</span>
                              </div>
                              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                                {branchWithdrawals.slice(0, visibleWithdrawals).map((entry, i) => {
                                  const [y, m, d] = entry.date.split('-').map(Number);
                                  const dateObj = new Date(y, m - 1, d);
                                  const timePart = entry.timestamp.length > 10 ? entry.timestamp.slice(11, 16) : null;
                                  return (
                                    <div
                                      key={i}
                                      className={`px-4 py-3 transition-colors ${entry.receiptImage ? 'cursor-pointer hover:bg-indigo-50/40 dark:hover:bg-indigo-900/20' : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/60'}`}
                                      onClick={() => entry.receiptImage && setReceiptModal({ url: entry.receiptImage, label: entry.name || 'Receipt' })}
                                    >
                                      {/* Mobile layout */}
                                      <div className="flex items-center justify-between gap-3 sm:hidden">
                                        <div className="min-w-0">
                                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight">
                                            {dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                          </p>
                                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                                            {entry.name
                                              ? <span className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wide">{entry.name}</span>
                                              : <span className="text-xs font-medium text-slate-400 italic">No description</span>
                                            }
                                            {entry.performedBy && entry.performedBy !== entry.name && <span className="text-xs font-medium text-slate-400 truncate">by {entry.performedBy}</span>}
                                            {timePart && <span className="text-xs font-medium text-slate-400 tabular-nums">{timePart}</span>}
                                          </div>
                                        </div>
                                        <span className="text-sm font-black text-rose-600 dark:text-rose-400 tabular-nums shrink-0">−₱{entry.amount.toLocaleString()}</span>
                                      </div>
                                      {/* Desktop layout */}
                                      <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
                                        <div>
                                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>
                                          {timePart && <p className="text-xs font-medium text-slate-400 mt-0.5 tabular-nums">{timePart}</p>}
                                        </div>
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2">
                                            {entry.name
                                              ? <p className="text-xs font-black text-slate-800 dark:text-slate-200 truncate uppercase tracking-wide">{entry.name}</p>
                                              : <p className="text-xs font-medium text-slate-400 italic">No description</p>
                                            }
                                          </div>
                                          {entry.performedBy && entry.performedBy !== entry.name && <p className="text-xs font-medium text-slate-400 mt-0.5 truncate">by {entry.performedBy}</p>}
                                        </div>
                                        <p className="text-xs font-mono text-slate-400 truncate pr-4">{entry.id.slice(-14).toUpperCase()}</p>
                                        <span className="text-xs font-black text-rose-600 dark:text-rose-400 tabular-nums">−₱{entry.amount.toLocaleString()}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              {visibleWithdrawals < branchWithdrawals.length && (
                                <button
                                  onClick={() => setVisibleWithdrawals(v => v + 20)}
                                  className="w-full py-3 text-xs font-medium text-slate-400 uppercase tracking-wide hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-t border-slate-100 dark:border-slate-700"
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
          </>
        );
      })()}

      {/* Receipt image modal */}
      {receiptModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setReceiptModal(null)}
        >
          <div
            className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl overflow-hidden flex flex-col max-w-lg w-full max-h-[90vh] animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
              <p className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest truncate">{receiptModal.label}</p>
              <button
                onClick={() => setReceiptModal(null)}
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center transition-colors shrink-0 ml-3"
              >
                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="overflow-auto flex-1 flex items-center justify-center p-2 bg-slate-50 dark:bg-slate-800">
              <img
                src={receiptModal.url}
                alt="Receipt"
                className="max-w-full max-h-[75vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* Toggle confirmation modal */}
      {confirmToggleBranch && (() => {
        const branch = confirmToggleBranch;
        const willEnable = !localEnabled[branch.id];
        return (
          <div
            className="fixed inset-0 z-[1200] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) setConfirmToggleBranch(null); }}
          >
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
              <div className={`px-5 py-4 ${willEnable ? 'bg-emerald-50 border-b border-emerald-100' : 'bg-rose-50 border-b border-rose-100'}`}>
                <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${willEnable ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {willEnable ? 'Enable Vault' : 'Disable Vault'}
                </p>
                <p className="text-base font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">{branch.name}</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {willEnable
                    ? 'This will activate the vault for this branch. Managers will be able to deposit into it and vault provisions will apply to daily reports.'
                    : 'This will deactivate the vault for this branch. Existing balance and history will be preserved, but no new provisions will apply.'}
                </p>
              </div>
              <div className="px-5 pb-4 flex gap-2">
                <button
                  onClick={() => setConfirmToggleBranch(null)}
                  className="flex-1 h-9 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
                  Cancel
                </button>
                <button
                  onClick={() => { handleToggle(branch); setConfirmToggleBranch(null); }}
                  className={`flex-1 h-9 rounded-xl text-white text-xs font-semibold uppercase tracking-wide active:scale-95 transition-all ${willEnable ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-500 hover:bg-rose-600'}`}>
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
