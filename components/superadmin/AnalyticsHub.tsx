import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import jsPDF from 'jspdf';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Branch, SalesReport, BranchBill } from '../../types';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { supabase } from '../../lib/supabase';
import { playSound, resumeAudioContext } from '../../lib/audio';
import { getTrueDate, getManilaYear, getManilaMonth } from '../../lib/time';
import { getWeekRange, parseDate as parseReportDate } from '../../src/utils/reportUtils';

// ─── Types ────────────────────────────────────────────────
type Metric = 'gross' | 'roi' | 'expenses' | 'salary' | 'bills';
type HubMode = 'chart' | 'heatmap' | 'vs';

// ─── Constants ───────────────────────────────────────────
const METRIC_CONFIG: Record<Metric, {
  label: string;
  barColor: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
  dimBar: string;
}> = {
  gross:    { label: 'Gross',        barColor: 'bg-indigo-500',  dimBar: 'bg-indigo-200',  textColor: 'text-indigo-700',  bgColor: 'bg-indigo-50',  borderColor: 'border-indigo-200' },
  roi:      { label: 'Perf. ROI',    barColor: 'bg-emerald-500', dimBar: 'bg-emerald-200', textColor: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' },
  expenses: { label: 'Expenses',     barColor: 'bg-amber-500',   dimBar: 'bg-amber-200',   textColor: 'text-amber-700',   bgColor: 'bg-amber-50',   borderColor: 'border-amber-200' },
  salary:   { label: 'Salary',       barColor: 'bg-sky-500',     dimBar: 'bg-sky-200',     textColor: 'text-sky-700',     bgColor: 'bg-sky-50',     borderColor: 'border-sky-200' },
  bills:    { label: 'Rent & Bills', barColor: 'bg-rose-500',    dimBar: 'bg-rose-200',    textColor: 'text-rose-700',    bgColor: 'bg-rose-50',    borderColor: 'border-rose-200' },
};

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

// ─── Remittance helpers ───────────────────────────────────
// Period label format: "Jul 6 — Jul 12" (em dash, no year)
function parsePeriodEnd(label: string, refYear: number): Date | null {
  const parts = label.split(/\s*[—–-]\s*/);
  if (parts.length < 2) return null;
  const endStr = parts[parts.length - 1].trim();
  const d = new Date(`${endStr} ${refYear}`);
  return isNaN(d.getTime()) ? null : d;
}

// Returns the period start date, handling cross-year periods (e.g. Dec 28 — Jan 3)
function parsePeriodStart(label: string, periodEnd: Date): Date | null {
  const parts = label.split(/\s*[—–-]\s*/);
  if (parts.length < 2) return null;
  const startStr = parts[0].trim();
  for (const year of [periodEnd.getFullYear(), periodEnd.getFullYear() - 1]) {
    const d = new Date(`${startStr} ${year}`);
    if (!isNaN(d.getTime()) && d <= periodEnd) return d;
  }
  return null;
}

// Format a Date as YYYY-MM-DD in Manila timezone (avoids UTC offset shifting the date)
const toManilaYMD = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d);

// Normalize dash characters in period labels so em-dash (—) and en-dash (–) stored
// in remittance_adjustments don't fail to match against remittance_submissions keys
const normalizeLabel = (l: string) => l.replace(/[—–]/g, '-').trim();

// ─── Week helpers ─────────────────────────────────────────
function getWeekBounds(anchor: Date) {
  const d = new Date(anchor);
  const day = d.getDay(); // 0 = Sun
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((day + 6) % 7));
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  // Use local date components to avoid UTC-conversion shifting the date (e.g. UTC+8 midnight → previous UTC day)
  const toYMD = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const fmt   = (x: Date) => x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return {
    start: toYMD(mon),
    end:   toYMD(sun),
    label: `${fmt(mon)} – ${fmt(sun)}, ${sun.getFullYear()}`,
  };
}

// ─── VS branch dropdown ──────────────────────────────────
const BranchDropdown: React.FC<{
  label: string;
  value: string;
  options: Branch[];
  onSelect: (id: string) => void;
  excludeId?: string;
  colorTheme: 'indigo' | 'emerald';
}> = ({ label, value, options, onSelect, excludeId, colorTheme }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const sel = options.find(b => b.id === value);
  const tc = colorTheme === 'indigo' ? 'border-indigo-500 text-indigo-600' : 'border-emerald-500 text-emerald-600';
  return (
    <div className="relative flex-1" ref={ref}>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5 ml-1">{label}</p>
      <button
        onClick={() => { playSound('click'); setOpen(!open); }}
        className={`w-full flex items-center justify-between px-4 py-3.5 bg-white rounded-2xl border transition-all ${open ? `${tc} shadow-lg ring-4 ring-current/5` : 'border-slate-100 hover:border-slate-300 shadow-sm'}`}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0 ${sel ? (colorTheme === 'indigo' ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white') : 'bg-slate-100 text-slate-300'}`}>
            {sel ? '🏢' : '○'}
          </div>
          <span className={`font-black text-xs uppercase tracking-widest truncate ${sel ? 'text-slate-900' : 'text-slate-300'}`}>
            {sel ? sel.name.replace(/BRANCH\s*-\s*/i, '') : 'Select branch…'}
          </span>
        </div>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M19 9l-7 7-7-7"/></svg>
      </button>
      {open && (
        <div className="absolute z-[120] top-[calc(100%+8px)] left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 animate-in zoom-in-95 duration-150">
          <div className="max-h-56 overflow-y-auto">
            {options.map(b => (
              <button
                key={b.id}
                disabled={b.id === excludeId}
                onClick={() => { onSelect(b.id); setOpen(false); playSound('click'); }}
                className={`w-full text-left px-4 py-3 rounded-xl text-xs font-semibold uppercase tracking-wide transition-all mb-0.5 flex items-center justify-between ${
                  value === b.id
                    ? colorTheme === 'indigo' ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white'
                    : b.id === excludeId ? 'opacity-20 cursor-not-allowed text-slate-400'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <span className="truncate">{b.name.replace(/BRANCH\s*-\s*/i, '')}</span>
                {value === b.id && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────
interface AnalyticsHubProps {
  branches: Branch[];
  salesReports: SalesReport[];
}

export const AnalyticsHub: React.FC<AnalyticsHubProps> = ({ branches, salesReports }) => {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mode, setMode]           = useState<HubMode>('chart');

  // Bar chart
  const [metric, setMetric]       = useState<Metric>('gross');
  const [weekAnchor, setWeekAnchor] = useState(getTrueDate());

  // Top 10
  const [top10Month, setTop10Month] = useState(getManilaMonth());
  const [top10Year,  setTop10Year]  = useState(getManilaYear());
  const [top10PickerOpen, setTop10PickerOpen] = useState(false);
  const [rankingTab, setRankingTab] = useState<'standard' | 'adjusted'>('adjusted');
  const [selectedRankBranch, setSelectedRankBranch] = useState<string | null>(null); // shortName or group label
  const [isExporting, setIsExporting] = useState(false);
  const top10PickerRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!top10PickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (top10PickerRef.current && !top10PickerRef.current.contains(e.target as Node)) {
        setTop10PickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [top10PickerOpen]);

  // Heatmap
  const [heatMonth, setHeatMonth]   = useState(getManilaMonth());
  const [heatYear,  setHeatYear]    = useState(getManilaYear());
  const [heatBranch, setHeatBranch] = useState('all');
  const [activeDay,  setActiveDay]  = useState<string | null>(null);
  const [scopeOpen,  setScopeOpen]  = useState(false);
  const scopeRef = useRef<HTMLDivElement>(null);
  const [heatPickerOpen, setHeatPickerOpen] = useState(false);
  const heatPickerRef = useRef<HTMLDivElement>(null);
  const [chartExpanded, setChartExpanded] = useState(false);

  // VS
  const [branchA, setBranchA] = useState('');
  const [branchB, setBranchB] = useState('');

  const activeBranches = useMemo(() => branches.filter(b => b.isEnabled), [branches]);

  // Fetch bills
  const { data: allBills = [] } = useQuery<BranchBill[]>({
    queryKey: [DB_TABLES.BRANCH_BILLS, 'analytics'],
    queryFn: async () => {
      const { data } = await supabase
        .from(DB_TABLES.BRANCH_BILLS)
        .select('*')
        .eq(DB_COLUMNS.IS_ACTIVE, true);
      return data || [];
    },
  });

  // ── Week ────────────────────────────────────────────────
  const week = useMemo(() => getWeekBounds(weekAnchor), [weekAnchor]);
  const todayYMD = useMemo(() => {
    const n = getTrueDate();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }, []);
  const canGoForward = week.end < todayYMD;

  const navigateWeek = (dir: -1 | 1) => {
    if (dir === 1 && !canGoForward) return;
    playSound('click');
    setWeekAnchor(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + dir * 7);
      return d;
    });
  };

  // ── Branch week data — self-fetch to bypass global 2000-row limit ──────────
  const billsByBranch = useMemo(() => {
    const map: Record<string, number> = {};
    allBills.forEach(b => { map[b.branchId] = (map[b.branchId] || 0) + (b.amount || 0); });
    return map;
  }, [allBills]);

  const { data: weekReports = [] } = useQuery<SalesReport[]>({
    queryKey: ['analytics_week_reports', week.start, week.end],
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!supabase) return [];
      const cols = [
        DB_COLUMNS.BRANCH_ID, DB_COLUMNS.REPORT_DATE,
        DB_COLUMNS.GROSS_SALES, DB_COLUMNS.NET_ROI,
        DB_COLUMNS.TOTAL_EXPENSES, DB_COLUMNS.TOTAL_STAFF_PAY,
      ].join(',');
      const { data, error } = await supabase
        .from(DB_TABLES.SALES_REPORTS)
        .select(cols)
        .gte(DB_COLUMNS.REPORT_DATE, week.start)
        .lte(DB_COLUMNS.REPORT_DATE, week.end);
      if (error) throw error;
      return (data || []).map(r => ({
        id: '', branchId: r[DB_COLUMNS.BRANCH_ID], reportDate: r[DB_COLUMNS.REPORT_DATE],
        submittedAt: '', grossSales: Number(r[DB_COLUMNS.GROSS_SALES] ?? 0),
        totalStaffPay: Number(r[DB_COLUMNS.TOTAL_STAFF_PAY] ?? 0),
        totalExpenses: Number(r[DB_COLUMNS.TOTAL_EXPENSES] ?? 0),
        totalVaultProvision: 0, netRoi: Number(r[DB_COLUMNS.NET_ROI] ?? 0),
        sessionData: [], sessionCount: 0, staffBreakdown: [], expenseData: [], vaultData: [],
      }));
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const branchWeekData = useMemo(() =>
    activeBranches.map(branch => {
      const rpts = weekReports.filter(r => r.branchId === branch.id);
      return {
        branch,
        shortName: branch.name.replace(/BRANCH\s*-\s*/i, '').trim(),
        gross:    rpts.reduce((s, r) => s + r.grossSales, 0),
        roi:      rpts.reduce((s, r) => s + r.grossSales - r.totalStaffPay - r.totalExpenses, 0),
        expenses: rpts.reduce((s, r) => s + r.totalExpenses, 0),
        salary:   rpts.reduce((s, r) => s + r.totalStaffPay, 0),
        bills:    billsByBranch[branch.id] || 0,
      };
    }),
  [activeBranches, weekReports, billsByBranch]);

  const barData = useMemo(() =>
    [...branchWeekData]
      .sort((a, b) => b[metric] - a[metric])
      .slice(0, 50),
  [branchWeekData, metric]);

  const maxBarValue = useMemo(() =>
    Math.max(...barData.map(d => Math.abs(d[metric])), 1),
  [barData, metric]);

  // ── Top 10 — self-fetch per selected month to avoid global 2000-row limit ──
  const top10MonthStr = `${top10Year}-${String(top10Month + 1).padStart(2, '0')}`;
  const { data: top10Reports = [], isFetching: fetchingReports } = useQuery<SalesReport[]>({
    queryKey: ['analytics_top10_reports', top10MonthStr],
    enabled: mode === 'chart',
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!supabase) return [];
      // Extend start 10 days back so early-month period starts are captured.
      // Extend end 8 days into next month so cross-month periods (e.g. "Oct 31 — Nov 8")
      // have their tail-end reports available for the Adjusted tab.
      const extStart = new Date(top10Year, top10Month, -9);
      const extEnd   = new Date(top10Year, top10Month + 1, 8);
      const startDate = extStart.toISOString().slice(0, 10);
      const endDate   = extEnd.toISOString().slice(0, 10);
      const cols = [
        DB_COLUMNS.BRANCH_ID, DB_COLUMNS.REPORT_DATE,
        DB_COLUMNS.GROSS_SALES, DB_COLUMNS.NET_ROI,
        DB_COLUMNS.TOTAL_STAFF_PAY, DB_COLUMNS.TOTAL_EXPENSES,
      ].join(',');
      const PAGE = 1000;
      const allRows: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from(DB_TABLES.SALES_REPORTS)
          .select(cols)
          .gte(DB_COLUMNS.REPORT_DATE, startDate)
          .lte(DB_COLUMNS.REPORT_DATE, endDate)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (data && data.length > 0) allRows.push(...data);
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }
      return allRows.map(r => ({
        id: '', branchId: r[DB_COLUMNS.BRANCH_ID], reportDate: r[DB_COLUMNS.REPORT_DATE] ?? '',
        submittedAt: '', grossSales: Number(r[DB_COLUMNS.GROSS_SALES] ?? 0),
        totalStaffPay: Number(r[DB_COLUMNS.TOTAL_STAFF_PAY] ?? 0),
        totalExpenses: Number(r[DB_COLUMNS.TOTAL_EXPENSES] ?? 0),
        totalVaultProvision: 0, netRoi: Number(r[DB_COLUMNS.NET_ROI] ?? 0),
        sessionData: [], sessionCount: 0, staffBreakdown: [], expenseData: [], vaultData: [],
      }));
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Approved remittance submissions scoped to selected year (± 1 for cross-year periods).
  // Includes snapshot columns stamped at approval time — used directly in Adjusted ranking.
  // Submissions approved before snapshot migration have gross_sales=0; those fall back to
  // the report+adjustments join path so old data still renders correctly.
  const { data: remittanceSubmissions = [], isFetching: fetchingSubmissions } = useQuery<{ branchId: string; periodLabel: string; submittedAt: string; grossSales: number; salary: number; expenses: number; adjustedRoi: number }[]>({
    queryKey: ['analytics_remittances_v2', top10Year],
    enabled: mode === 'chart' && rankingTab === 'adjusted',
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const PAGE = 1000;
      const allRows: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from(DB_TABLES.REMITTANCE_SUBMISSIONS)
          .select('branch_id, period_label, submitted_at, gross_sales, salary, expenses, adjusted_roi')
          .eq('status', 'approved')
          .gte('submitted_at', `${top10Year - 1}-07-01`)
          .lte('submitted_at', `${top10Year + 1}-01-31`)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (data && data.length > 0) allRows.push(...data);
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }
      return allRows.map((r: any) => ({
        branchId: r.branch_id,
        periodLabel: r.period_label,
        submittedAt: r.submitted_at ?? '',
        grossSales: Number(r.gross_sales ?? 0),
        salary: Number(r.salary ?? 0),
        expenses: Number(r.expenses ?? 0),
        adjustedRoi: Number(r.adjusted_roi ?? 0),
      }));
    },
    staleTime: 0,
    gcTime: 30 * 60 * 1000,
  });

  // All remittance adjustments for the year — used to compute actual adjusted ROI per period
  const { data: top10Adjustments = [], isFetching: fetchingAdjustments } = useQuery<{ branchId: string; periodLabel: string; amount: number }[]>({
    queryKey: ['analytics_remit_adjustments_v2', top10Year],
    enabled: mode === 'chart' && rankingTab === 'adjusted',
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data } = await supabase
        .from(DB_TABLES.REMITTANCE_ADJUSTMENTS)
        .select('branch_id, period_label, amount, target_owner, description')
        .gte(DB_COLUMNS.CREATED_AT, `${top10Year}-01-01`)
        .lte(DB_COLUMNS.CREATED_AT, `${top10Year + 1}-01-15`);
      // Exclude vault deposits and owner-transfer records (description contains → or ←).
      // Owner transfers are pairs that net to zero; excluding them avoids noise.
      // Branch-level adjustments with a target_owner (e.g. "RENT AND BILLS" assigned to
      // a specific owner) ARE included — they represent real branch costs.
      return (data || [])
        .filter((r: any) => r.description !== 'VAULT DEPOSIT' && !/[→←]/.test(r.description))
        .map((r: any) => ({
          branchId: r.branch_id,
          periodLabel: r.period_label,
          amount: Number(r.amount ?? 0),
        }));
    },
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
  });

  const top10Data = useMemo(() => {
    // Performance ROI = grossSales - totalStaffPay - totalExpenses
    // Excludes vault provision and bills so branches with different vault targets
    // and bill schedules are compared on a level playing field.
    const map: Record<string, { gross: number; perfRoi: number }> = {};
    top10Reports.forEach(r => {
      // Standard tab only counts reports from the selected month.
      // The query fetches 10 extra days prior to capture Remittance tab period starts,
      // so we must exclude those pre-month rows here.
      if (!r.reportDate.startsWith(top10MonthStr)) return;
      if (!map[r.branchId]) map[r.branchId] = { gross: 0, perfRoi: 0 };
      map[r.branchId].gross   += r.grossSales;
      map[r.branchId].perfRoi += r.grossSales - r.totalStaffPay - r.totalExpenses;
    });

    const MERGE_GROUPS: { keyword: RegExp; label: string }[] = [
      { keyword: /TANDANG\s*SORA/i, label: 'TANDANG SORA' },
    ];

    const merged: { shortName: string; gross: number; roi: number; score: number; rankingBoost?: number; isMerged?: boolean; branchIds: string[] }[] = [];
    const mergeAccum: Record<string, { gross: number; roi: number; label: string; branchIds: string[] }> = {};

    activeBranches
      .filter(b => map[b.id]?.gross > 0)
      .forEach(b => {
        const group = MERGE_GROUPS.find(g => g.keyword.test(b.name));
        if (group) {
          if (!mergeAccum[group.label]) mergeAccum[group.label] = { gross: 0, roi: 0, label: group.label, branchIds: [] };
          mergeAccum[group.label].gross += map[b.id].gross;
          mergeAccum[group.label].roi   += map[b.id].perfRoi;
          mergeAccum[group.label].branchIds.push(b.id);
        } else {
          const shortName = b.name.replace(/BRANCH\s*-\s*/i, '').trim();
          const { gross, perfRoi } = map[b.id];
          const baseScore = (gross + perfRoi) / 2;
          const boost = b.rankingBoost ? (1 + b.rankingBoost / 100) : 1;
          merged.push({ shortName, gross, roi: perfRoi, score: baseScore * boost, rankingBoost: b.rankingBoost ?? undefined, branchIds: [b.id] });
        }
      });

    Object.values(mergeAccum).forEach(g => {
      merged.push({ shortName: g.label, gross: g.gross, roi: g.roi, score: (g.gross + g.roi) / 2, isMerged: true, branchIds: g.branchIds });
    });

    return merged.sort((a, b) => b.score - a.score);
  }, [activeBranches, top10Reports, top10MonthStr]);

  // Remittance-based ranking: mirrors WeeklyRemittancesHub exactly.
  // Uses snapshot columns (gross_sales, salary, expenses, adjusted_roi) when available
  // (grossSales > 0); falls back to report+adjustments join for older submissions.
  const top10DataRemittance = useMemo(() => {
    // Build submission map: branchId::periodLabel → submission (with snapshot columns)
    const subMap = new Map(remittanceSubmissions.map(s => [`${s.branchId}::${s.periodLabel}`, s]));

    // Fallback adjustment map — used when submission has no snapshot (grossSales=0)
    const adjMap = new Map<string, number>();
    top10Adjustments.forEach(a => {
      const key = `${a.branchId}::${a.periodLabel}`;
      adjMap.set(key, (adjMap.get(key) ?? 0) + a.amount);
    });

    const branchById = new Map<string, Branch>(activeBranches.map(b => [b.id, b]));

    // Snapshot path: branchId → periodLabel → snapshot values (recorded once per period)
    const branchSnap = new Map<string, Map<string, { gross: number; salary: number; expenses: number; adjustedRoi: number }>>();
    // Fallback path: branchId → accumulated report totals
    const branchFallback = new Map<string, { gross: number; netRoi: number; periodLabels: Set<string> }>();

    top10Reports.forEach(report => {
      const branch = branchById.get(report.branchId);
      if (!branch) return;

      const { label, weekStart } = getWeekRange(parseReportDate(report.reportDate), branch);

      // A period belongs to the month in which it ENDS (the remittance submission month).
      // Parse the actual end date from the label — weekStart+6 is unreliable for partial periods.
      const periodEnd = parsePeriodEnd(label, top10Year);
      if (!periodEnd || periodEnd.getFullYear() !== top10Year || periodEnd.getMonth() !== top10Month) return;

      const sub = subMap.get(`${report.branchId}::${label}`);
      if (!sub) return;

      if (sub.grossSales > 0) {
        // Snapshot available — record each period once (multiple reports share same label)
        if (!branchSnap.has(report.branchId)) branchSnap.set(report.branchId, new Map());
        const periods = branchSnap.get(report.branchId)!;
        if (!periods.has(label)) {
          periods.set(label, { gross: sub.grossSales, salary: sub.salary, expenses: sub.expenses, adjustedRoi: sub.adjustedRoi });
        }
      } else {
        // Fallback — accumulate from individual reports
        if (!branchFallback.has(report.branchId)) branchFallback.set(report.branchId, { gross: 0, netRoi: 0, periodLabels: new Set() });
        const d = branchFallback.get(report.branchId)!;
        d.gross   += report.grossSales;
        d.netRoi  += report.grossSales - report.totalStaffPay - report.totalExpenses;
        d.periodLabels.add(label);
      }
    });

    // Combine snapshot + fallback into final per-branch totals
    const allBranchIds = new Set([...branchSnap.keys(), ...branchFallback.keys()]);
    const branchFinal = new Map<string, { gross: number; netRoi: number; adjTotal: number; adjustedRoi: number; periods: number }>();

    allBranchIds.forEach(branchId => {
      let snapGross = 0, snapNetRoi = 0, snapAdjRoi = 0, snapPeriodCount = 0;
      branchSnap.get(branchId)?.forEach(p => {
        snapGross     += p.gross;
        snapNetRoi    += p.gross - p.salary - p.expenses;
        snapAdjRoi    += p.adjustedRoi;
        snapPeriodCount++;
      });

      let fallGross = 0, fallNetRoi = 0, fallAdjTotal = 0, fallPeriodCount = 0;
      const fb = branchFallback.get(branchId);
      if (fb) {
        fallGross  = fb.gross;
        fallNetRoi = fb.netRoi;
        fb.periodLabels.forEach(label => { fallAdjTotal += adjMap.get(`${branchId}::${label}`) ?? 0; });
        fallPeriodCount = fb.periodLabels.size;
      }

      const gross       = snapGross + fallGross;
      const netRoi      = snapNetRoi + fallNetRoi;
      const adjTotal    = (snapAdjRoi - snapNetRoi) + fallAdjTotal;
      const adjustedRoi = snapAdjRoi + fallNetRoi + fallAdjTotal;

      branchFinal.set(branchId, { gross, netRoi, adjTotal, adjustedRoi, periods: snapPeriodCount + fallPeriodCount });
    });

    const MERGE_GROUPS: { keyword: RegExp; label: string }[] = [
      { keyword: /TANDANG\s*SORA/i, label: 'TANDANG SORA' },
    ];
    const merged: { shortName: string; adjustedRoi: number; netRoi: number; adjTotal: number; gross: number; periods: number; score: number; rankingBoost?: number; isMerged?: boolean; branchIds: string[] }[] = [];
    const mergeAccum: Record<string, { adjustedRoi: number; netRoi: number; adjTotal: number; gross: number; periods: number; label: string; branchIds: string[] }> = {};

    activeBranches
      .filter(b => branchFinal.has(b.id))
      .forEach(b => {
        const d = branchFinal.get(b.id)!;
        const group = MERGE_GROUPS.find(g => g.keyword.test(b.name));
        if (group) {
          if (!mergeAccum[group.label]) mergeAccum[group.label] = { adjustedRoi: 0, netRoi: 0, adjTotal: 0, gross: 0, periods: 0, label: group.label, branchIds: [] };
          mergeAccum[group.label].adjustedRoi += d.adjustedRoi;
          mergeAccum[group.label].netRoi      += d.netRoi;
          mergeAccum[group.label].adjTotal    += d.adjTotal;
          mergeAccum[group.label].gross       += d.gross;
          mergeAccum[group.label].periods     += d.periods;
          mergeAccum[group.label].branchIds.push(b.id);
        } else {
          const shortName = b.name.replace(/BRANCH\s*-\s*/i, '').trim();
          const boost = b.rankingBoost ? (1 + b.rankingBoost / 100) : 1;
          merged.push({ shortName, ...d, score: ((d.gross + d.adjustedRoi) / 2) * boost, rankingBoost: b.rankingBoost ?? undefined, branchIds: [b.id] });
        }
      });
    Object.values(mergeAccum).forEach(g => {
      merged.push({ shortName: g.label, ...g, score: (g.gross + g.adjustedRoi) / 2, isMerged: true, branchIds: g.branchIds });
    });
    return merged.sort((a, b) => b.score - a.score);
  }, [activeBranches, top10Reports, top10Adjustments, remittanceSubmissions, top10Year, top10Month]);

  // Per-period detail for the clicked branch in the ranking list
  const selectedRankDetail = useMemo(() => {
    if (!selectedRankBranch) return null;
    const listData = rankingTab === 'adjusted' ? top10DataRemittance : top10Data;
    const entry = listData.find(d => d.shortName === selectedRankBranch);
    if (!entry) return null;

    if (rankingTab === 'standard') {
      // Group all reports by period (week) for the branch(es)
      const branchIds = entry.branchIds;
      const monthReports = top10Reports.filter(r =>
        branchIds.includes(r.branchId) && r.reportDate.startsWith(top10MonthStr)
      );
      const totalGross = monthReports.reduce((s, r) => s + r.grossSales, 0);
      const totalStaff = monthReports.reduce((s, r) => s + r.totalStaffPay, 0);
      const totalExp   = monthReports.reduce((s, r) => s + r.totalExpenses, 0);
      const totalNet   = monthReports.reduce((s, r) => s + r.grossSales - r.totalStaffPay - r.totalExpenses, 0);
      return { totalGross, totalStaff, totalExp, totalNet, adjTotal: 0, periods: [] as { label: string; gross: number; staff: number; exp: number; net: number; adj: number }[] };
    }

    // Adjusted tab — snapshot when grossSales > 0, fallback for older submissions
    const subMap = new Map(remittanceSubmissions.map(s => [`${s.branchId}::${s.periodLabel}`, s]));
    const adjMap = new Map<string, number>();
    top10Adjustments.forEach(a => {
      const key = `${a.branchId}::${a.periodLabel}`;
      adjMap.set(key, (adjMap.get(key) ?? 0) + a.amount);
    });
    const branchById = new Map<string, Branch>(activeBranches.map(b => [b.id, b]));

    type PeriodAccum = {
      label: string; weekStart: Date;
      snapGross: number; snapSalary: number; snapExp: number; snapAdjRoi: number; snapBranchIds: Set<string>;
      fallGross: number; fallStaff: number; fallExp: number; fallNet: number;
    };
    const periodMap = new Map<string, PeriodAccum>();
    const snapTracker = new Set<string>(); // "branchId::label" to avoid double-counting snapshot

    top10Reports.forEach(report => {
      if (!entry.branchIds.includes(report.branchId)) return;
      const branch = branchById.get(report.branchId);
      if (!branch) return;

      const { label, weekStart } = getWeekRange(parseReportDate(report.reportDate), branch);
      const periodEnd = parsePeriodEnd(label, top10Year);
      if (!periodEnd || periodEnd.getFullYear() !== top10Year || periodEnd.getMonth() !== top10Month) return;

      const sub = subMap.get(`${report.branchId}::${label}`);
      if (!sub) return;

      if (!periodMap.has(label)) {
        periodMap.set(label, { label, weekStart, snapGross: 0, snapSalary: 0, snapExp: 0, snapAdjRoi: 0, snapBranchIds: new Set(), fallGross: 0, fallStaff: 0, fallExp: 0, fallNet: 0 });
      }
      const p = periodMap.get(label)!;

      if (sub.grossSales > 0) {
        const snapKey = `${report.branchId}::${label}`;
        if (!snapTracker.has(snapKey)) {
          snapTracker.add(snapKey);
          p.snapGross   += sub.grossSales;
          p.snapSalary  += sub.salary;
          p.snapExp     += sub.expenses;
          p.snapAdjRoi  += sub.adjustedRoi;
          p.snapBranchIds.add(report.branchId);
        }
      } else {
        p.fallGross += report.grossSales;
        p.fallStaff += report.totalStaffPay;
        p.fallExp   += report.totalExpenses;
        p.fallNet   += report.grossSales - report.totalStaffPay - report.totalExpenses;
      }
    });

    const periods = Array.from(periodMap.values())
      .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
      .map(p => {
        const snapNet = p.snapGross - p.snapSalary - p.snapExp;
        const snapAdj = p.snapAdjRoi - snapNet;
        const fallAdj = entry.branchIds.reduce((s, id) => {
          if (p.snapBranchIds.has(id)) return s; // snapshot branch — adj already in snapAdjRoi
          return s + (adjMap.get(`${id}::${p.label}`) ?? 0);
        }, 0);
        const gross = p.snapGross + p.fallGross;
        const staff = p.snapSalary + p.fallStaff;
        const exp   = p.snapExp   + p.fallExp;
        const net   = snapNet     + p.fallNet;
        const adj   = snapAdj     + fallAdj;
        return { label: p.label, gross, staff, exp, net, adj };
      });

    const totalGross = periods.reduce((s, p) => s + p.gross, 0);
    const totalStaff = periods.reduce((s, p) => s + p.staff, 0);
    const totalExp   = periods.reduce((s, p) => s + p.exp, 0);
    const totalNet   = periods.reduce((s, p) => s + p.net, 0);
    const adjTotal   = periods.reduce((s, p) => s + p.adj, 0);
    return { totalGross, totalStaff, totalExp, totalNet, adjTotal, periods };
  }, [selectedRankBranch, rankingTab, top10Data, top10DataRemittance, top10Reports, top10Adjustments, remittanceSubmissions, activeBranches, top10Year, top10Month, top10MonthStr]);

  const availableYears = useMemo(() => {
    const s = new Set<number>([getManilaYear()]);
    salesReports.forEach(r => s.add(new Date(r.reportDate).getFullYear()));
    return Array.from(s).sort((a, b) => b - a);
  }, [salesReports]);

  // Top-20 list at component level so the print panel can access it
  const top10DisplayList = useMemo(() => {
    const listData = rankingTab === 'adjusted' ? top10DataRemittance : top10Data;
    return listData.slice(0, 20);
  }, [rankingTab, top10DataRemittance, top10Data]);

  const exportRankingPdf = useCallback(async () => {
    if (isExporting || top10DisplayList.length === 0) return;
    setIsExporting(true);
    try {
      // Load Lexend from Google Fonts. Falls back to Arial if unavailable.
      let F = `Arial, sans-serif`;
      try {
        if (!document.fonts.check('700 16px Lexend')) {
          let link = document.getElementById('__lexend_export') as HTMLLinkElement | null;
          if (!link) {
            link = document.createElement('link');
            link.id   = '__lexend_export';
            link.rel  = 'stylesheet';
            link.href = 'https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;700&display=swap';
            document.head.appendChild(link);
          }
          await Promise.race([
            document.fonts.ready,
            new Promise<void>(r => setTimeout(r, 3000)),
          ]);
        }
        if (document.fonts.check('700 16px Lexend')) F = `'Lexend', Arial, sans-serif`;
      } catch { /* fallback */ }

      const SCALE  = 2;
      const W      = 900;
      const CX     = W / 2;
      const PAD    = 48;
      const ROW_H  = 62;
      const LOGO_S = 140;

      // Header: logo(140) + gap(16) + subtitle(18) + gap(8) + "OF"(18) + gap(4) + "HILOT CENTER"(56)
      const HEADER_H = LOGO_S + 16 + 18 + 8 + 18 + 4 + 56 + 32;
      const H = PAD + HEADER_H + 14 + 20 + 6 + (top10DisplayList.length * ROW_H) + PAD;

      const canvas = document.createElement('canvas');
      canvas.width  = W * SCALE;
      canvas.height = H * SCALE;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(SCALE, SCALE);

      // Background
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, W, H);

      // Load logo
      let logoSrc = '/icon.png';
      try {
        const { data: cfgRow } = await supabase
          .from('system_config').select('value').eq('key', 'logo').single();
        if (cfgRow?.value) logoSrc = cfgRow.value;
      } catch { /* fallback */ }
      const logo = new Image();
      logo.crossOrigin = 'anonymous';
      await new Promise<void>(res => {
        logo.onload = () => res(); logo.onerror = () => res();
        logo.src = logoSrc; setTimeout(res, 3000);
      });

      let y = PAD;

      // ── Header: logo centered, title centered below ──────────
      if (logo.naturalWidth > 0) {
        const r = LOGO_S / 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(CX, y + r, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(logo, CX - r, y, LOGO_S, LOGO_S);
        ctx.restore();
      }
      y += LOGO_S + 20;

      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle    = '#9ca3af'; // gray-400 — supporting text, light
      ctx.font         = `300 17px ${F}`;
      ctx.fillText('TOP PERFORMING BRANCHES', CX, y);
      y += 22;

      ctx.font      = `300 14px ${F}`;
      ctx.fillText('OF', CX, y);
      y += 20;

      ctx.fillStyle = '#ffffff';
      ctx.font      = `700 52px ${F}`;
      ctx.fillText('HILOT CENTER', CX, y);
      y += 100;

      // ── Column headers ───────────────────────────────────────
      ctx.fillStyle    = '#f59e0b';
      ctx.font         = `400 12px ${F}`;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign    = 'left';
      ctx.fillText('RANK', PAD, y);
      ctx.textAlign = 'center';
      ctx.fillText('BRANCH', W / 2 + 40, y);
      y += 10;

      // ── Divider ──────────────────────────────────────────────
      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
      y += 16;

      // ── Rows ─────────────────────────────────────────────────
      const RANK_W = 100;
      top10DisplayList.forEach((d, i) => {
        const baseY = y + ROW_H * 0.66;

        // Row separator
        if (i > 0) {
          ctx.strokeStyle = '#181818';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
        }

        // Rank number
        ctx.fillStyle    = '#ffffff';
        ctx.font         = `700 30px ${F}`;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(`${i + 1}`, PAD, baseY);

        // Branch name — regular weight
        ctx.font      = `400 24px ${F}`;
        ctx.textAlign = 'center';
        ctx.fillText(d.shortName.toUpperCase(), PAD + RANK_W + (W - PAD - RANK_W - PAD) / 2, baseY);

        y += ROW_H;
      });

      // ── Export as PDF ────────────────────────────────────────
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [W, H] });
      pdf.addImage(imgData, 'PNG', 0, 0, W, H);
      pdf.save(`top-branches-${MONTHS[top10Month]}-${top10Year}.pdf`);
    } catch (e) {
      console.error('[exportRankingPng]', e);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, top10DisplayList, rankingTab, top10Month, top10Year]);

  // ── Heatmap ──────────────────────────────────────────────
  const dailyStats = useMemo(() => {
    const stats: Record<string, { gross: number; net: number }> = {};
    salesReports
      .filter(r => heatBranch === 'all' || r.branchId === heatBranch)
      .forEach(r => {
        if (!stats[r.reportDate]) stats[r.reportDate] = { gross: 0, net: 0 };
        stats[r.reportDate].gross += r.grossSales;
        stats[r.reportDate].net   += r.grossSales - r.totalStaffPay - r.totalExpenses;
      });
    return stats;
  }, [salesReports, heatBranch]);

  const daysInMonth = useMemo(() => new Date(heatYear, heatMonth + 1, 0).getDate(), [heatYear, heatMonth]);
  const startDay    = useMemo(() => new Date(heatYear, heatMonth, 1).getDay(),       [heatYear, heatMonth]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (scopeRef.current && !scopeRef.current.contains(e.target as Node)) setScopeOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (!heatPickerOpen) return;
    const h = (e: MouseEvent) => {
      if (heatPickerRef.current && !heatPickerRef.current.contains(e.target as Node)) setHeatPickerOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [heatPickerOpen]);

  const getHeatColor = (net: number, gross: number, active: boolean) => {
    if (gross === 0) return active ? 'bg-slate-200 border-slate-300' : 'bg-slate-50 text-slate-300 border-slate-100';
    if (net < 0)     return active ? 'bg-rose-500 text-white border-rose-600'     : 'bg-rose-100 text-rose-700 border-rose-200';
    if (net < 2000)  return active ? 'bg-emerald-400 text-white border-emerald-500' : 'bg-emerald-50 text-emerald-600 border-emerald-100';
    if (net < 5000)  return active ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-emerald-200 text-emerald-800 border-emerald-300';
    return active ? 'bg-emerald-700 text-white border-emerald-800 shadow-lg' : 'bg-emerald-600 text-white border-emerald-700';
  };

  const heatBranchName = useMemo(() =>
    heatBranch === 'all' ? 'Full Network' : (activeBranches.find(b => b.id === heatBranch)?.name || ''),
  [heatBranch, activeBranches]);

  const branchDailyMap = useMemo(() => {
    const map: Record<string, Record<number, number>> = {};
    salesReports
      .filter(r => {
        const d = new Date(r.reportDate);
        return d.getFullYear() === heatYear && d.getMonth() === heatMonth;
      })
      .forEach(r => {
        const day = new Date(r.reportDate).getDate();
        if (!map[r.branchId]) map[r.branchId] = {};
        map[r.branchId][day] = (map[r.branchId][day] ?? 0) + (r.grossSales - r.totalStaffPay - r.totalExpenses);
      });
    return map;
  }, [salesReports, heatYear, heatMonth]);

  const branchHeatRows = useMemo(() =>
    activeBranches.map(b => {
      const dayMap: Record<number, number> = branchDailyMap[b.id] ?? {};
      const days: (number | null)[] = Array.from({ length: daysInMonth }, (_, i) => dayMap[i + 1] ?? null);
      const total = Object.values(dayMap).reduce((s, v) => s + v, 0);
      return { id: b.id, name: b.name.replace(/BRANCH\s*-\s*/i, ''), days, total };
    }).sort((a, b) => b.total - a.total),
  [activeBranches, branchDailyMap, daysInMonth]);

  const maxCellValue = useMemo(() => {
    let max = 0;
    branchHeatRows.forEach(row => row.days.forEach(v => { if (v !== null && v > max) max = v; }));
    return max || 1;
  }, [branchHeatRows]);

  // ── VS comparison ────────────────────────────────────────
  const comparisonData = useMemo(() => {
    if (!branchA || !branchB) return null;
    const sum = (id: string) => salesReports.filter(r => r.branchId === id).reduce(
      (a, r) => ({ gross: a.gross + r.grossSales, net: a.net + (r.grossSales - r.totalStaffPay - r.totalExpenses), pay: a.pay + r.totalStaffPay, exp: a.exp + r.totalExpenses, days: a.days + 1 }),
      { gross: 0, net: 0, pay: 0, exp: 0, days: 0 }
    );
    return {
      a: { name: branches.find(b => b.id === branchA)?.name.replace(/BRANCH\s*-\s*/i, '') || 'A', stats: sum(branchA) },
      b: { name: branches.find(b => b.id === branchB)?.name.replace(/BRANCH\s*-\s*/i, '') || 'B', stats: sum(branchB) },
    };
  }, [branchA, branchB, salesReports, branches]);

  const cfg = METRIC_CONFIG[metric];

  // ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 md:space-y-5 pb-32">

      {/* ── Mode Tabs ──────────────────────────────────────── */}
      <div>
        <div className="flex items-end gap-1 bg-white pl-4 md:pl-6 pr-4 md:pr-6 pt-4 md:pt-6 pb-0 rounded-t-2xl border border-b-0 border-slate-100 shadow-sm">
          {([['chart','Ranking'],['heatmap','Heatmap'],['vs','VS Mode']] as [HubMode, string][]).map(([m, lbl]) => (
            <button
              key={m}
              onClick={() => { setMode(m); playSound('click'); }}
              className={`px-4 md:px-6 py-2.5 rounded-t-xl text-xs font-black uppercase tracking-wide transition-all border border-b-0 ${
                mode === m
                  ? 'bg-slate-50 border-slate-200 text-slate-900 shadow-sm relative z-10'
                  : 'bg-transparent border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50 hover:border-slate-200'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
        {/* Divider connecting tabs to content area */}
        <div className="h-px bg-slate-100" />
      </div>

      {/* ══════════════════════════════════════════════════════
          BAR CHART MODE
      ══════════════════════════════════════════════════════ */}
      {mode === 'chart' && (
        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">

          {/* ── Title ──────────────────────────────────────── */}
          <div className="px-1 pt-1">
            <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tighter">Top 50 Performers</h2>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-0.5">Network Analytical Ledger</p>
          </div>

          {/* ── Monthly Top 20 ─────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 md:p-6">
            {/* Header */}
            <div className="mb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🏆</span>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-tighter">Monthly Top 20</h3>
                </div>
              {/* Refresh + month/year picker */}
              <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={async () => {
                  if (isRefreshing) return;
                  setIsRefreshing(true);
                  playSound('click');
                  await queryClient.invalidateQueries({ queryKey: ['analytics_top10_reports', top10MonthStr] });
                  await queryClient.invalidateQueries({ queryKey: ['analytics_remittances', top10Year] });
                  await queryClient.invalidateQueries({ queryKey: ['analytics_remit_adjustments_v2', top10Year] });
                  await queryClient.invalidateQueries({ queryKey: ['analytics_week_reports', week.start, week.end] });
                  setIsRefreshing(false);
                  playSound('success');
                }}
                disabled={isRefreshing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 shadow-sm transition-all disabled:opacity-50"
                title="Refresh analytics data"
              >
                <svg className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
                <span className="text-xs font-black uppercase tracking-wide text-slate-500">{isRefreshing ? 'Refreshing…' : 'Refresh'}</span>
              </button>
              <div className="relative shrink-0" ref={top10PickerRef}>
                <button
                  onClick={() => setTop10PickerOpen(v => !v)}
                  className={`flex items-center gap-2 pl-4 pr-3 py-2 rounded-2xl border transition-all shadow-sm ${
                    top10PickerOpen
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span className="text-xs font-black uppercase tracking-wider">{MONTHS[top10Month].slice(0,3)} {top10Year}</span>
                  <svg className={`w-3.5 h-3.5 transition-transform ${top10PickerOpen ? 'rotate-180 text-slate-300' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                  </svg>
                </button>

                {top10PickerOpen && (
                  <div className="absolute left-0 top-[calc(100%+8px)] z-[200] bg-white border border-slate-200 rounded-2xl shadow-xl p-3 w-56 animate-in zoom-in-95 fade-in duration-150 origin-top-left">
                    {/* Year row */}
                    <div className="flex items-center gap-1 mb-2.5">
                      {availableYears.map(y => (
                        <button
                          key={y}
                          onClick={() => setTop10Year(y)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black tracking-wider transition-all ${
                            top10Year === y
                              ? 'bg-slate-800 text-white'
                              : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'
                          }`}
                        >
                          {y}
                        </button>
                      ))}
                    </div>
                    {/* Divider */}
                    <div className="h-px bg-slate-100 mb-2.5" />
                    {/* Month grid */}
                    <div className="grid grid-cols-3 gap-1">
                      {MONTHS.map((m, i) => (
                        <button
                          key={m}
                          onClick={() => { setTop10Month(i); setTop10PickerOpen(false); playSound('click'); }}
                          className={`py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 ${
                            top10Month === i
                              ? 'bg-amber-400 text-white shadow-sm'
                              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                          }`}
                        >
                          {m.slice(0,3)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              </div>{/* end refresh + picker wrapper */}
              </div>{/* end flex justify-between row */}
            </div>
            {/* Formula */}
            <p className="ml-7 mt-1 mb-4 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {rankingTab === 'standard'
                ? <>(Gross + Perf. ROI) ÷ 2 · <span className="text-amber-500">excl. vault &amp; bills</span></>
                : <span className="text-emerald-600">(Gross + Adjusted ROI) ÷ 2 · remittance periods only</span>
              }
            </p>

            {/* Ranking tabs + export */}
            <div className="flex items-center gap-3 mb-4">
            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
              <button
                onClick={() => { setRankingTab('standard'); playSound('click'); }}
                className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide transition-all ${rankingTab === 'standard' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Standard
              </button>
              <button
                onClick={() => { setRankingTab('adjusted'); playSound('click'); }}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide transition-all ${rankingTab === 'adjusted' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Adjusted
              </button>
            </div>
            {/* Export PNG button */}
            <button
              onClick={exportRankingPdf}
              disabled={isExporting || top10DisplayList.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wide hover:bg-slate-700 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isExporting ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              )}
              Export PDF
            </button>
            </div>{/* end tabs + export row */}

            {(() => {
              const listData = rankingTab === 'adjusted' ? top10DataRemittance : top10Data;
              const displayList = listData.slice(0, 50);
              const isFetching = fetchingReports || (rankingTab === 'adjusted' && (fetchingSubmissions || fetchingAdjustments));
              if (displayList.length === 0) return (
                <div className="py-14 text-center">
                  {isFetching ? (
                    <div className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Fetching data…</p>
                    </div>
                  ) : (
                    <>
                      <div className="text-4xl mb-3">🏅</div>
                      <p className="text-xs font-black text-slate-300 uppercase tracking-widest">{rankingTab === 'adjusted' ? 'No approved remittances for this month' : 'No data for this month'}</p>
                    </>
                  )}
                </div>
              );
              const topScore = displayList[0]?.score ?? 1;
              return (
                <div className="space-y-1.5">
                  {isFetching && (
                    <div className="flex items-center gap-2 pb-1">
                      <svg className="w-3 h-3 animate-spin text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Updating…</p>
                    </div>
                  )}
                  {displayList.map((d, i) => {
                    const rank    = i + 1;
                    const isTop20 = rank <= 20;
                    const isTop10 = rank <= 10;
                    const isTop3  = rank <= 3;
                    const medal   = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
                    const displayScore = d.score;
                    const pct = topScore > 0 ? (displayScore / topScore) * 100 : 0;
                    const rowBg = rank === 1 ? 'bg-slate-900 border-slate-800'
                                : rank <= 3  ? 'bg-slate-800 border-slate-700'
                                : isTop10    ? 'bg-slate-50 border-slate-200'
                                :              'bg-white border-slate-100';
                    const barTrack = rank <= 3 ? 'bg-slate-700' : 'bg-slate-100';
                    const barColor = rank === 1 ? 'bg-amber-400'
                                   : rank <= 3  ? 'bg-slate-300'
                                   : rank <= 7  ? 'bg-slate-500'
                                   :              'bg-slate-300';
                    return (
                      <React.Fragment key={d.shortName}>
                        {rank === 11 && (
                          <div className="flex items-center gap-3 py-0.5">
                            <div className="flex-1 h-px bg-slate-100" />
                            <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-widest shrink-0">Ranks 11–20</span>
                            <div className="flex-1 h-px bg-slate-100" />
                          </div>
                        )}
                        {rank === 21 && (
                          <div className="flex items-center gap-3 py-0.5">
                            <div className="flex-1 h-px bg-slate-100" />
                            <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-widest shrink-0">Ranks 21–50</span>
                            <div className="flex-1 h-px bg-slate-100" />
                          </div>
                        )}
                        <div
                          className={`flex items-center gap-4 px-4 py-2.5 rounded-2xl border transition-all cursor-pointer hover:shadow-md ${rowBg} ${!isTop20 ? 'opacity-30' : !isTop10 ? 'opacity-60' : ''}`}
                          onClick={() => { setSelectedRankBranch(prev => prev === d.shortName ? null : d.shortName); playSound('click'); }}
                        >
                          {/* Rank */}
                          <div className="w-8 shrink-0 flex items-center justify-center">
                            {medal
                              ? <span className="text-xl leading-none">{medal}</span>
                              : <span className={`text-xs font-black ${isTop10 ? 'text-slate-400' : isTop20 ? 'text-slate-400' : 'text-slate-300'}`}>#{rank}</span>}
                          </div>

                          {/* Branch + breakdown */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div className="flex flex-col gap-0.5 min-w-0">
                                <p className={`font-black uppercase leading-tight ${rank <= 3 ? 'text-sm text-white' : isTop20 ? 'text-xs text-slate-700' : 'text-xs text-slate-400'}`}>
                                  {d.shortName}
                                </p>
                                <div className="flex items-center gap-1 flex-wrap">
                                  {d.rankingBoost && (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-600 leading-none">
                                      +{d.rankingBoost}% boost
                                    </span>
                                  )}
                                </div>
                              </div>
                              <p className={`font-black tabular-nums shrink-0 ${rank <= 3 ? 'text-sm text-white' : isTop20 ? 'text-xs text-slate-600' : 'text-xs text-slate-300'}`}>
                                ₱{Math.round(displayScore).toLocaleString()}
                              </p>
                            </div>
                            <div className={`h-1 rounded-full overflow-hidden mb-1 ${barTrack}`}>
                              <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }} />
                            </div>
                            {rankingTab === 'adjusted' ? (() => {
                              const rd = d as any;
                              const gross      = Math.round(rd.gross ?? 0);
                              const adjRoi     = Math.round(rd.adjustedRoi ?? 0);
                              const adjTotal   = Math.round(rd.adjTotal ?? 0);
                              const netRoi     = Math.round(rd.netRoi ?? 0);
                              const adjSign    = adjTotal >= 0 ? '+' : '−';
                              const periods    = rd.periods ?? 1;
                              return (
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`text-[10px] font-bold ${rank <= 3 ? 'text-slate-300' : isTop20 ? 'text-slate-500' : 'text-slate-300'}`}>Gross ₱{gross.toLocaleString()}</span>
                                    <span className={`text-[10px] font-semibold ${rank <= 3 ? 'text-slate-500' : 'text-slate-300'}`}>+</span>
                                    <span className={`text-[10px] font-bold ${rank <= 3 ? 'text-slate-300' : isTop20 ? 'text-slate-500' : 'text-slate-300'}`}>
                                      Net ROI ₱{netRoi.toLocaleString()}
                                      {adjTotal !== 0 && (
                                        <span className={`font-bold ${rank <= 3 ? 'text-slate-400' : adjTotal >= 0 ? (isTop20 ? 'text-slate-500' : 'text-slate-300') : (isTop20 ? 'text-slate-500' : 'text-slate-300')}`}> {adjSign} adj ₱{Math.abs(adjTotal).toLocaleString()} = ₱{adjRoi.toLocaleString()}</span>
                                      )}
                                    </span>
                                    <span className={`text-[10px] font-semibold ${rank <= 3 ? 'text-slate-500' : 'text-slate-300'}`}>÷ 2</span>
                                    {d.rankingBoost ? (
                                      <span className={`text-[10px] font-bold ${rank <= 3 ? 'text-slate-400' : 'text-slate-400'}`}>× {(1 + d.rankingBoost / 100).toFixed(2)}</span>
                                    ) : null}
                                  </div>
                                  <span className={`text-[10px] font-semibold ${rank <= 3 ? 'text-slate-500' : isTop20 ? 'text-slate-400' : 'text-slate-300'}`}>{periods} period{periods !== 1 ? 's' : ''}</span>
                                </div>
                              );
                            })() : (
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[10px] font-bold ${rank <= 3 ? 'text-slate-300' : isTop20 ? 'text-slate-500' : 'text-slate-300'}`}>Gross ₱{d.gross.toLocaleString()}</span>
                                <span className={`text-[10px] ${rank <= 3 ? 'text-slate-500' : 'text-slate-300'}`}>+</span>
                                <span className={`text-[10px] font-bold ${rank <= 3 ? 'text-slate-300' : isTop20 ? 'text-slate-500' : 'text-slate-300'}`}>Perf. ROI ₱{d.roi.toLocaleString()}</span>
                                <span className={`text-[10px] ${rank <= 3 ? 'text-slate-500' : 'text-slate-300'}`}>÷ 2</span>
                                {d.rankingBoost ? (
                                  <span className={`text-[10px] font-bold ${rank <= 3 ? 'text-slate-400' : 'text-slate-400'}`}>× {(1 + d.rankingBoost / 100).toFixed(2)}</span>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </div>
                        {/* Detail panel — shown when this row is selected */}
                        {selectedRankBranch === d.shortName && selectedRankDetail && (() => {
                          const det = selectedRankDetail;
                          const fmt = (n: number) => `₱${Math.round(n).toLocaleString()}`;
                          return (
                            <div className="mx-1 mb-1 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden text-xs">
                              {/* Summary totals */}
                              <div className="grid grid-cols-4 divide-x divide-slate-200 border-b border-slate-200">
                                {[
                                  { label: 'Gross Sales', value: det.totalGross, color: 'text-emerald-700' },
                                  { label: 'Staff Payroll', value: -det.totalStaff, color: 'text-rose-500' },
                                  { label: 'Expenses', value: -det.totalExp, color: 'text-rose-500' },
                                  { label: 'Net ROI', value: det.totalNet, color: det.totalNet >= 0 ? 'text-indigo-600' : 'text-rose-600' },
                                ].map(col => (
                                  <div key={col.label} className="flex flex-col items-center py-2.5 px-2 gap-0.5">
                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{col.label}</span>
                                    <span className={`font-black tabular-nums ${col.color}`}>{col.value < 0 ? '−' : ''}{fmt(Math.abs(col.value))}</span>
                                  </div>
                                ))}
                              </div>
                              {rankingTab === 'adjusted' && det.adjTotal !== 0 && (
                                <div className="flex items-center justify-between px-4 py-1.5 border-b border-slate-200 bg-white">
                                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Shared Cost Adj.</span>
                                  <span className={`text-xs font-black tabular-nums ${det.adjTotal < 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                                    {det.adjTotal >= 0 ? '+' : '−'}{fmt(Math.abs(det.adjTotal))}
                                  </span>
                                </div>
                              )}
                              {/* Per-period rows — adjusted tab only */}
                              {rankingTab === 'adjusted' && det.periods.length > 0 && (
                                <div className="divide-y divide-slate-100">
                                  {det.periods.map(p => (
                                    <div key={p.label} className="px-4 py-2 flex items-center justify-between gap-4">
                                      <span className="font-semibold text-slate-500 shrink-0">{p.label}</span>
                                      <div className="flex items-center gap-4 flex-wrap justify-end">
                                        <span className="text-emerald-600 font-semibold tabular-nums">{fmt(p.gross)}</span>
                                        {p.adj !== 0 && (
                                          <span className={`font-bold tabular-nums ${p.adj < 0 ? 'text-rose-400' : 'text-emerald-500'}`}>
                                            {p.adj >= 0 ? '+' : '−'}{fmt(Math.abs(p.adj))} adj
                                          </span>
                                        )}
                                        <span className={`font-black tabular-nums ${(p.net + p.adj) >= 0 ? 'text-indigo-400' : 'text-rose-500'}`}>{fmt(p.net + p.adj)}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </React.Fragment>
                    );
                  })}
                  {listData.length > 20 && (
                    <p className="text-center text-[10px] font-semibold text-slate-300 uppercase tracking-widest pt-1">
                      +{listData.length - 20} more branches not shown
                    </p>
                  )}
                </div>
              );
            })()}
          </div>

        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          HEATMAP MODE
      ══════════════════════════════════════════════════════ */}
      {mode === 'heatmap' && (
        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
          <div className="px-1 pt-1">
            <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tighter">Heatmap</h2>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-0.5">Daily Performance Calendar</p>
          </div>
          <div className="bg-white p-4 md:p-8 rounded-2xl border border-slate-100 shadow-sm">

            {/* Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 gap-4">
              {/* Custom month/year picker */}
              <div className="relative" ref={heatPickerRef}>
                <button
                  onClick={() => { setHeatPickerOpen(v => !v); playSound('click'); }}
                  className="flex items-center gap-2 group"
                >
                  <div className="flex flex-col items-start">
                    <div className="flex items-center gap-2">
                      <span className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tight group-hover:text-emerald-600 transition-colors">{MONTHS[heatMonth]}</span>
                      <span className="text-xl md:text-2xl font-black text-slate-200">/</span>
                      <span className="text-xl md:text-2xl font-black text-slate-400">{heatYear}</span>
                    </div>
                    <span className="text-xs font-black text-emerald-600 uppercase tracking-widest leading-none mt-0.5">{heatBranchName}</span>
                  </div>
                  <svg className={`w-4 h-4 text-slate-300 transition-transform mt-0.5 ${heatPickerOpen ? 'rotate-180 text-emerald-500' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                  </svg>
                </button>

                {heatPickerOpen && (
                  <div className="absolute left-0 top-[calc(100%+10px)] z-[200] bg-white border border-slate-200 rounded-2xl shadow-xl p-3 w-60 animate-in zoom-in-95 fade-in duration-150 origin-top-left">
                    <div className="flex items-center gap-1 mb-2.5 flex-wrap">
                      {availableYears.map(y => (
                        <button
                          key={y}
                          onClick={() => { setHeatYear(y); setActiveDay(null); playSound('click'); }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black tracking-wider transition-all ${
                            heatYear === y ? 'bg-slate-900 text-white' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'
                          }`}
                        >
                          {y}
                        </button>
                      ))}
                    </div>
                    <div className="h-px bg-slate-100 mb-2.5" />
                    <div className="grid grid-cols-3 gap-1">
                      {MONTHS.map((m, i) => (
                        <button
                          key={m}
                          onClick={() => { setHeatMonth(i); setActiveDay(null); setHeatPickerOpen(false); playSound('click'); }}
                          className={`py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 ${
                            heatMonth === i ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                          }`}
                        >
                          {m.slice(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Scope dropdown */}
              <div className="relative shrink-0 w-full sm:w-56" ref={scopeRef}>
                <p className="text-xs font-black text-slate-300 uppercase tracking-widest mb-1.5 ml-1">Scope</p>
                <button
                  onClick={() => { playSound('click'); setScopeOpen(!scopeOpen); }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 rounded-2xl border transition-all ${scopeOpen ? 'bg-white border-emerald-500 shadow-lg ring-4 ring-emerald-500/5' : 'border-slate-100 hover:border-slate-300'}`}
                >
                  <span className="font-black text-xs uppercase tracking-widest text-slate-700 truncate">{heatBranchName}</span>
                  <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${scopeOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M19 9l-7 7-7-7"/></svg>
                </button>
                {scopeOpen && (
                  <div className="absolute z-[110] top-[calc(100%+8px)] left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 animate-in zoom-in-95 duration-150">
                    <div className="max-h-64 overflow-y-auto">
                      <button
                        onClick={() => { setHeatBranch('all'); setScopeOpen(false); playSound('click'); }}
                        className={`w-full text-left px-4 py-3 rounded-xl text-xs font-semibold uppercase tracking-wide mb-0.5 ${heatBranch === 'all' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                      >
                        Full Network
                      </button>
                      <div className="h-px bg-slate-100 my-1 mx-2" />
                      {activeBranches.map(b => (
                        <button
                          key={b.id}
                          onClick={() => { setHeatBranch(b.id); setScopeOpen(false); playSound('click'); }}
                          className={`w-full text-left px-4 py-3 rounded-xl text-xs font-semibold uppercase tracking-wide mb-0.5 flex items-center justify-between ${heatBranch === b.id ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                          <span className="truncate">{b.name.replace(/BRANCH\s*-\s*/i, '')}</span>
                          {heatBranch === b.id && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Full-width line graph / branch heatmap grid ── */}
            {(() => {
              // ── Branch grid heatmap (Full Network view) ───────────
              if (heatBranch === 'all') {
                const hasData = branchHeatRows.some(r => r.days.some(v => v !== null));
                if (!hasData) return (
                  <div className="flex items-center justify-center py-20">
                    <p className="text-xs font-black text-slate-200 uppercase tracking-widest">No data for this month</p>
                  </div>
                );

                const getCellBg = (val: number | null): string => {
                  if (val === null) return 'bg-slate-100 border-slate-200';
                  if (val < 0) return 'bg-rose-400 border-rose-500';
                  if (val === 0) return 'bg-slate-200 border-slate-300';
                  const pct = val / maxCellValue;
                  if (pct < 0.2) return 'bg-emerald-100 border-emerald-200';
                  if (pct < 0.4) return 'bg-emerald-300 border-emerald-400';
                  if (pct < 0.6) return 'bg-emerald-500 border-emerald-600';
                  if (pct < 0.8) return 'bg-emerald-600 border-emerald-700';
                  return 'bg-emerald-800 border-emerald-900';
                };

                const fmtKG = (v: number) => {
                  if (Math.abs(v) >= 1000000) return `₱${(v/1000000).toFixed(1)}M`;
                  if (Math.abs(v) >= 1000) return `₱${(v/1000).toFixed(0)}k`;
                  return `₱${Math.round(v)}`;
                };

                const monthReports = salesReports.filter(r => {
                  const d = new Date(r.reportDate);
                  return d.getFullYear() === heatYear && d.getMonth() === heatMonth;
                });
                const totalGrossG = monthReports.reduce((s, r) => s + r.grossSales, 0);
                const totalNetG = branchHeatRows.reduce((s, r) => s + r.total, 0);
                const daysReportedG = new Set(monthReports.map(r => r.reportDate)).size;

                return (
                  <div className="space-y-5">
                    {/* Summary tiles */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
                        <p className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-1">Month Gross</p>
                        <p className="text-lg font-black text-emerald-700 tabular-nums leading-tight">₱{totalGrossG.toLocaleString()}</p>
                      </div>
                      <div className={`border rounded-2xl px-4 py-3 ${totalNetG >= 0 ? 'bg-indigo-50 border-indigo-100' : 'bg-rose-50 border-rose-100'}`}>
                        <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${totalNetG >= 0 ? 'text-indigo-400' : 'text-rose-400'}`}>Month Perf. ROI</p>
                        <p className={`text-lg font-black tabular-nums leading-tight ${totalNetG >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>₱{totalNetG.toLocaleString()}</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Days Reported</p>
                        <p className="text-lg font-black text-slate-700 tabular-nums leading-tight">{daysReportedG} <span className="text-sm font-bold text-slate-300">/ {daysInMonth}</span></p>
                      </div>
                    </div>

                    {/* Grid */}
                    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
                      <table className="border-collapse" style={{ minWidth: `${120 + daysInMonth * 26 + 72}px` }}>
                        <thead>
                          <tr>
                            {/* Sticky branch-name header cell */}
                            <th className="sticky left-0 z-20 bg-white w-[120px] min-w-[120px] py-2 pl-3 pr-2 text-left border-b border-slate-100" />
                            {Array.from({ length: daysInMonth }, (_, i) => (
                              <th key={i} className="w-[26px] min-w-[26px] py-2 text-center border-b border-slate-100">
                                <span className="text-xs font-black text-slate-300 tabular-nums">{i + 1}</span>
                              </th>
                            ))}
                            <th className="w-[72px] min-w-[72px] py-2 pl-3 pr-3 text-left border-b border-slate-100">
                              <span className="text-xs font-black text-slate-300 uppercase tracking-widest">Total</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {branchHeatRows.map((row, ri) => {
                            const rowBg = ri % 2 === 1 ? '#f8fafc' : '#ffffff';
                            return (
                              <tr key={row.id}>
                                {/* Sticky branch name */}
                                <td
                                  className="sticky left-0 z-10 py-[3px] pl-3 pr-2 border-r border-slate-100"
                                  style={{ background: rowBg }}
                                >
                                  <span className="text-xs font-black text-slate-600 uppercase tracking-tight truncate block leading-tight max-w-[108px]">{row.name}</span>
                                </td>
                                {row.days.map((val, di) => (
                                  <td key={di} className="py-[3px] px-[2px]" style={{ background: rowBg }}>
                                    <div
                                      className={`h-[20px] w-[22px] rounded-[4px] border ${getCellBg(val)}`}
                                      title={val !== null ? `Day ${di + 1}: ₱${val.toLocaleString()}` : `Day ${di + 1}: No data`}
                                    />
                                  </td>
                                ))}
                                <td className="py-[3px] pl-3 pr-3" style={{ background: rowBg }}>
                                  <span className={`text-xs font-black tabular-nums whitespace-nowrap ${row.total > 0 ? 'text-emerald-600' : row.total < 0 ? 'text-rose-500' : 'text-slate-300'}`}>
                                    {fmtKG(row.total)}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Legend */}
                    <div className="flex items-center gap-3 flex-wrap pt-0.5">
                      <span className="text-xs font-black text-slate-300 uppercase tracking-widest">Perf. ROI</span>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-[3px] bg-slate-100 border border-slate-200" />
                        <span className="text-xs text-slate-300 font-bold">No data</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-[3px] bg-rose-400 border border-rose-500" />
                        <span className="text-xs text-slate-400 font-bold">Negative</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <div className="w-3 h-3 rounded-[3px] bg-emerald-100 border border-emerald-200" />
                        <div className="w-3 h-3 rounded-[3px] bg-emerald-300 border border-emerald-400" />
                        <div className="w-3 h-3 rounded-[3px] bg-emerald-500 border border-emerald-600" />
                        <div className="w-3 h-3 rounded-[3px] bg-emerald-600 border border-emerald-700" />
                        <div className="w-3 h-3 rounded-[3px] bg-emerald-800 border border-emerald-900" />
                        <span className="text-xs text-slate-400 font-bold ml-1">Low → High</span>
                      </div>
                    </div>
                  </div>
                );
              }

              // ── Single-branch line chart ──────────────────────────
              const points = Array.from({ length: daysInMonth }, (_, i) => {
                const d = i + 1;
                const key = `${heatYear}-${String(heatMonth + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                return { day: d, gross: dailyStats[key]?.gross ?? null, net: dailyStats[key]?.net ?? null };
              });
              const hasData = points.some(p => p.gross !== null);
              if (!hasData) return (
                <div className="flex items-center justify-center py-20">
                  <p className="text-xs font-black text-slate-200 uppercase tracking-widest">No data for this month</p>
                </div>
              );

              const W = 1200, H = 320, padL = 60, padR = 20, padT = 20, padB = 36;
              const iW = W - padL - padR;
              const iH = H - padT - padB;

              const grossVals = points.map(p => p.gross ?? 0);
              const netVals   = points.map(p => p.net   ?? 0);
              const maxV = Math.max(...grossVals, ...netVals, 1);
              const minV = Math.min(...netVals, 0);
              const range = maxV - minV || 1;

              const toX = (i: number) => padL + (i / Math.max(daysInMonth - 1, 1)) * iW;
              const toY = (v: number) => padT + iH - ((v - minV) / range) * iH;

              const makePath = (key: 'gross' | 'net') => {
                const segs: string[] = [];
                let started = false;
                points.forEach((p, i) => {
                  const v = p[key];
                  if (v === null) { started = false; return; }
                  segs.push((started ? 'L' : 'M') + `${toX(i)},${toY(v)}`);
                  started = true;
                });
                return segs.join(' ');
              };

              const makeArea = (key: 'gross' | 'net') => {
                const baseline = toY(Math.max(minV, 0));
                const pts = points.map((p, i) => ({ x: toX(i), y: p[key] !== null ? toY(p[key]!) : null }));
                const segs: string[] = [];
                let run: {x:number,y:number}[] = [];
                const flush = () => {
                  if (run.length < 2) { run = []; return; }
                  const d = run.map((pt,j) => `${j===0?'M':'L'}${pt.x},${pt.y}`).join(' ')
                    + ` L${run[run.length-1].x},${baseline} L${run[0].x},${baseline} Z`;
                  segs.push(d); run = [];
                };
                pts.forEach(pt => { pt.y !== null ? run.push({x:pt.x,y:pt.y}) : flush(); });
                flush();
                return segs.join(' ');
              };

              const fmtK = (v: number) => {
                if (Math.abs(v) >= 1000000) return `₱${(v/1000000).toFixed(1)}M`;
                if (Math.abs(v) >= 1000)    return `₱${(v/1000).toFixed(0)}k`;
                return `₱${Math.round(v)}`;
              };

              const Y_TICKS = 5;
              const activeDayIdx = activeDay
                ? points.findIndex(p => `${heatYear}-${String(heatMonth+1).padStart(2,'0')}-${String(p.day).padStart(2,'0')}` === activeDay)
                : -1;

              const totalGross = grossVals.reduce((s, v) => s + v, 0);
              const totalNet   = netVals.reduce((s, v) => s + v, 0);

              const daysReported = points.filter(p => p.gross !== null).length;

              return (
                <div className="space-y-5">
                  {/* Summary stat tiles */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
                      <p className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-1">Month Gross</p>
                      <p className="text-lg font-black text-emerald-700 tabular-nums leading-tight">₱{totalGross.toLocaleString()}</p>
                    </div>
                    <div className={`border rounded-2xl px-4 py-3 ${totalNet >= 0 ? 'bg-indigo-50 border-indigo-100' : 'bg-rose-50 border-rose-100'}`}>
                      <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${totalNet >= 0 ? 'text-indigo-400' : 'text-rose-400'}`}>Month ROI</p>
                      <p className={`text-lg font-black tabular-nums leading-tight ${totalNet >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>₱{totalNet.toLocaleString()}</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Days Reported</p>
                      <p className="text-lg font-black text-slate-700 tabular-nums leading-tight">{daysReported} <span className="text-sm font-bold text-slate-300">/ {daysInMonth}</span></p>
                    </div>
                  </div>

                  {/* Chart */}
                  {(() => {
                    const renderChart = (h: number) => (
                      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: h }}>
                        <defs>
                          <linearGradient id="grossGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity="0.18"/>
                            <stop offset="100%" stopColor="#10b981" stopOpacity="0.01"/>
                          </linearGradient>
                          <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.14"/>
                            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.01"/>
                          </linearGradient>
                        </defs>

                        {/* Y gridlines + labels */}
                        {Array.from({ length: Y_TICKS }, (_, i) => {
                          const v = minV + (range / (Y_TICKS - 1)) * i;
                          const y = toY(v);
                          return (
                            <g key={i}>
                              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#f1f5f9" strokeWidth="1"/>
                              <text x={padL - 8} y={y + 4} textAnchor="end" fill="#94a3b8" style={{ fontSize: 11, fontWeight: 700 }}>{fmtK(v)}</text>
                            </g>
                          );
                        })}

                        {/* Zero line */}
                        {minV < 0 && <line x1={padL} y1={toY(0)} x2={W-padR} y2={toY(0)} stroke="#fca5a5" strokeWidth="1.5" strokeDasharray="5,4"/>}

                        {/* X-axis baseline */}
                        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#e2e8f0" strokeWidth="1"/>

                        {/* X-axis day labels + ticks — every day */}
                        {points.map(p => {
                          const x = toX(p.day - 1);
                          return (
                            <g key={p.day}>
                              <line x1={x} y1={H - padB} x2={x} y2={H - padB + 4} stroke="#cbd5e1" strokeWidth="1"/>
                              <text x={x} y={H - 7} textAnchor="middle" fill="#64748b" style={{ fontSize: 10, fontWeight: 700 }}>{p.day}</text>
                            </g>
                          );
                        })}

                        {/* Active day highlight */}
                        {activeDayIdx >= 0 && (
                          <rect x={toX(activeDayIdx) - 1} y={padT} width="2" height={iH} fill="#e2e8f0" rx="1"/>
                        )}

                        {/* Area fills */}
                        <path d={makeArea('gross')} fill="url(#grossGrad)"/>
                        <path d={makeArea('net')}   fill="url(#netGrad)"/>

                        {/* Lines */}
                        <path d={makePath('gross')} fill="none" stroke="#10b981" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>
                        <path d={makePath('net')}   fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="7,4"/>

                        {/* Dots for every data point */}
                        {points.map((p, i) => {
                          const isAct = i === activeDayIdx;
                          return (
                            <g key={p.day}>
                              {p.gross !== null && (
                                <circle cx={toX(i)} cy={toY(p.gross)} r={isAct ? 6 : 3.5}
                                  fill="#10b981" stroke="white" strokeWidth={isAct ? 2.5 : 1.5}/>
                              )}
                              {p.net !== null && (
                                <circle cx={toX(i)} cy={toY(p.net)} r={isAct ? 6 : 3.5}
                                  fill="#6366f1" stroke="white" strokeWidth={isAct ? 2.5 : 1.5}/>
                              )}
                            </g>
                          );
                        })}

                        {/* Invisible click zones per day */}
                        {points.map((p, i) => {
                          const x = toX(i);
                          const zoneW = iW / Math.max(daysInMonth - 1, 1);
                          const dayKey = `${heatYear}-${String(heatMonth+1).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;
                          return (
                            <rect
                              key={`zone-${p.day}`}
                              x={x - zoneW / 2}
                              y={padT}
                              width={zoneW}
                              height={iH}
                              fill="transparent"
                              style={{ cursor: p.gross !== null ? 'pointer' : 'default' }}
                              onClick={() => {
                                if (p.gross !== null) {
                                  setActiveDay(prev => prev === dayKey ? null : dayKey);
                                  playSound('click');
                                }
                              }}
                            />
                          );
                        })}
                      </svg>
                    );

                    return (
                      <>
                        {/* Inline chart with mobile zoom button */}
                        <div className="w-full relative">
                          <button
                            className="sm:hidden absolute top-2 right-2 z-10 flex items-center gap-1.5 bg-slate-800/70 text-white rounded-xl px-2.5 py-1.5 backdrop-blur-sm active:scale-95 transition-transform"
                            onClick={() => { setChartExpanded(true); playSound('click'); }}
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"/>
                            </svg>
                            <span className="text-xs font-semibold uppercase tracking-wide">Zoom</span>
                          </button>
                          {renderChart(320)}
                        </div>

                        {/* Mobile fullscreen modal */}
                        {chartExpanded && (
                          <div
                            className="fixed inset-0 z-[500] bg-black/80 flex flex-col justify-center p-3 sm:hidden animate-in fade-in duration-200"
                            onClick={() => setChartExpanded(false)}
                          >
                            <div
                              className="bg-white rounded-2xl overflow-hidden shadow-xl animate-in zoom-in-95 duration-200"
                              onClick={e => e.stopPropagation()}
                            >
                              {/* Modal header */}
                              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                                <div>
                                  <p className="text-xs font-black text-slate-800 uppercase tracking-tight">{MONTHS[heatMonth]} {heatYear}</p>
                                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{heatBranchName}</p>
                                </div>
                                <button
                                  onClick={() => setChartExpanded(false)}
                                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 active:scale-90 transition-transform"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                                  </svg>
                                </button>
                              </div>
                              {/* Horizontally scrollable chart */}
                              <div className="overflow-x-auto px-2 pt-3 pb-1">
                                <div style={{ minWidth: 700 }}>
                                  {renderChart(240)}
                                </div>
                              </div>
                              {/* Mini legend */}
                              <div className="flex items-center gap-5 px-4 py-3 border-t border-slate-50">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-4 h-[2.5px] bg-emerald-500 rounded-full"/>
                                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Gross Sales</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke="#6366f1" strokeWidth="2" strokeDasharray="4,3"/></svg>
                                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Perf. ROI</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {/* Legend + active day detail */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-5">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-[3px] bg-emerald-500 rounded-full"/>
                        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Gross Sales</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <svg width="20" height="4" className="shrink-0"><line x1="0" y1="2" x2="20" y2="2" stroke="#6366f1" strokeWidth="2.5" strokeDasharray="5,3.5"/></svg>
                        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Perf. ROI</span>
                      </div>
                      {activeDay && <p className="text-xs font-black text-slate-300 uppercase tracking-widest">· Click a day to inspect</p>}
                      {!activeDay && <p className="text-xs font-black text-slate-300 uppercase tracking-widest">· Click chart to inspect a day</p>}
                    </div>
                    {activeDay && dailyStats[activeDay] ? (
                      <div className="flex items-stretch gap-0 bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
                        <div className="px-5 py-3 border-r border-slate-100">
                          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">{new Date(activeDay + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                          <p className="text-sm font-black text-slate-500 tabular-nums">Day Detail</p>
                        </div>
                        <div className="px-5 py-3 border-r border-slate-100">
                          <p className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-0.5">Gross</p>
                          <p className="text-sm font-black text-emerald-600 tabular-nums">₱{dailyStats[activeDay].gross.toLocaleString()}</p>
                        </div>
                        <div className="px-5 py-3">
                          <p className={`text-xs font-semibold uppercase tracking-wide mb-0.5 ${dailyStats[activeDay].net >= 0 ? 'text-indigo-400' : 'text-rose-400'}`}>Perf. ROI</p>
                          <p className={`text-sm font-black tabular-nums ${dailyStats[activeDay].net >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>₱{dailyStats[activeDay].net.toLocaleString()}</p>
                        </div>
                        <button
                          onClick={() => setActiveDay(null)}
                          className="px-3 text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      </div>
                    ) : (
                      <div className="hidden sm:block" />
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          VS MODE
      ══════════════════════════════════════════════════════ */}
      {mode === 'vs' && (
        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
          <div className="px-1 pt-1">
            <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tighter">VS Mode</h2>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-0.5">Branch Head-to-Head Comparison</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <BranchDropdown label="Branch Alpha" value={branchA} options={activeBranches} onSelect={setBranchA} excludeId={branchB} colorTheme="indigo" />
            <BranchDropdown label="Branch Beta"  value={branchB} options={activeBranches} onSelect={setBranchB} excludeId={branchA} colorTheme="emerald" />
          </div>

          {comparisonData ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden animate-in zoom-in-95 duration-300">
              {/* Headers */}
              <div className="flex divide-x divide-white/10 relative">
                <div className="flex-1 p-5 md:p-7 text-center bg-indigo-600 text-white">
                  <p className="text-xs font-semibold uppercase tracking-wide mb-1 opacity-60">Branch A</p>
                  <h4 className="text-xs md:text-sm font-black truncate px-2">{comparisonData.a.name}</h4>
                </div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                  <div className="w-9 h-9 md:w-11 md:h-11 bg-slate-800 rounded-xl md:rounded-2xl flex items-center justify-center text-white font-black text-xs md:text-xs shadow-lg border-2 border-white">VS</div>
                </div>
                <div className="flex-1 p-5 md:p-7 text-center bg-emerald-600 text-white">
                  <p className="text-xs font-semibold uppercase tracking-wide mb-1 opacity-60">Branch B</p>
                  <h4 className="text-xs md:text-sm font-black truncate px-2">{comparisonData.b.name}</h4>
                </div>
              </div>

              <div className="p-5 md:p-8 space-y-6">
                {([
                  { label: 'Gross Sales',     key: 'gross', lowerIsBetter: false },
                  { label: 'Perf. ROI',         key: 'net',   lowerIsBetter: false },
                  { label: 'Staff Payroll',   key: 'pay',   lowerIsBetter: true },
                  { label: 'Expenses',        key: 'exp',   lowerIsBetter: true },
                  { label: 'Active Days',     key: 'days',  lowerIsBetter: false },
                ] as { label: string; key: keyof typeof comparisonData.a.stats; lowerIsBetter: boolean }[]).map(({ label, key, lowerIsBetter }) => {
                  const valA = comparisonData.a.stats[key];
                  const valB = comparisonData.b.stats[key];
                  const aWin = lowerIsBetter ? valA < valB : valA > valB;
                  const bWin = lowerIsBetter ? valB < valA : valB > valA;
                  return (
                    <div key={key} className="space-y-2">
                      <div className="flex justify-between items-center px-1">
                        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</span>
                        <div className="flex gap-1.5">
                          {aWin && <span className="bg-indigo-50 text-indigo-700 text-[6px] font-black uppercase px-2 py-0.5 rounded-full">A LEADS</span>}
                          {bWin && <span className="bg-emerald-50 text-emerald-700 text-[6px] font-black uppercase px-2 py-0.5 rounded-full">B LEADS</span>}
                        </div>
                      </div>
                      <div className="flex items-stretch gap-2 h-14">
                        <div className={`flex-1 flex items-center justify-center rounded-2xl border-2 transition-all ${aWin ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-transparent opacity-50'}`}>
                          <p className={`text-sm md:text-lg font-black tabular-nums ${aWin ? 'text-indigo-900' : 'text-slate-400'}`}>
                            {key !== 'days' ? '₱' : ''}{valA.toLocaleString()}
                          </p>
                        </div>
                        <div className="w-px bg-slate-100 self-stretch" />
                        <div className={`flex-1 flex items-center justify-center rounded-2xl border-2 transition-all ${bWin ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-transparent opacity-50'}`}>
                          <p className={`text-sm md:text-lg font-black tabular-nums ${bWin ? 'text-emerald-900' : 'text-slate-400'}`}>
                            {key !== 'days' ? '₱' : ''}{valB.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 text-center">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">All-time comparative data</p>
              </div>
            </div>
          ) : (
            <div className="py-24 text-center bg-white rounded-2xl border-4 border-dashed border-slate-100 flex flex-col items-center gap-4">
              <div className="text-5xl">⚔️</div>
              <p className="text-xs font-black text-slate-300 uppercase tracking-wide">Select Two Branches to Begin</p>
            </div>
          )}
        </div>
      )}

    </div>
  );
};
