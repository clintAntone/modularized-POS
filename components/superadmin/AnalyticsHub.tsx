import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Branch, SalesReport, BranchBill } from '../../types';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { supabase } from '../../lib/supabase';
import { playSound, resumeAudioContext } from '../../lib/audio';
import { getTrueDate, getManilaYear, getManilaMonth } from '../../lib/time';

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
      <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">{label}</p>
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
        <div className="absolute z-[120] top-[calc(100%+8px)] left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-2xl p-1.5 animate-in zoom-in-95 duration-150">
          <div className="max-h-56 overflow-y-auto">
            {options.map(b => (
              <button
                key={b.id}
                disabled={b.id === excludeId}
                onClick={() => { onSelect(b.id); setOpen(false); playSound('click'); }}
                className={`w-full text-left px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all mb-0.5 flex items-center justify-between ${
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
  const [mode, setMode]           = useState<HubMode>('chart');

  // Bar chart
  const [metric, setMetric]       = useState<Metric>('gross');
  const [weekAnchor, setWeekAnchor] = useState(getTrueDate());

  // Top 10
  const [top10Month, setTop10Month] = useState(getManilaMonth());
  const [top10Year,  setTop10Year]  = useState(getManilaYear());
  const [showOtherBranches, setShowOtherBranches] = useState(false);
  const [top10PickerOpen, setTop10PickerOpen] = useState(false);
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
    const n = new Date();
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
        sessionData: [], staffBreakdown: [], expenseData: [], vaultData: [],
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
      .slice(0, 25),
  [branchWeekData, metric]);

  const maxBarValue = useMemo(() =>
    Math.max(...barData.map(d => Math.abs(d[metric])), 1),
  [barData, metric]);

  // ── Top 10 — self-fetch per selected month to avoid global 2000-row limit ──
  const top10MonthStr = `${top10Year}-${String(top10Month + 1).padStart(2, '0')}`;
  const { data: top10Reports = [] } = useQuery<SalesReport[]>({
    queryKey: ['analytics_top10_reports', top10MonthStr],
    queryFn: async () => {
      if (!supabase) return [];
      const startDate = `${top10MonthStr}-01`;
      const endDate   = `${top10MonthStr}-31`; // upper bound; DB clips naturally
      const cols = [
        DB_COLUMNS.BRANCH_ID, DB_COLUMNS.GROSS_SALES,
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
        id: '', branchId: r[DB_COLUMNS.BRANCH_ID], reportDate: '',
        submittedAt: '', grossSales: Number(r[DB_COLUMNS.GROSS_SALES] ?? 0),
        totalStaffPay: Number(r[DB_COLUMNS.TOTAL_STAFF_PAY] ?? 0),
        totalExpenses: Number(r[DB_COLUMNS.TOTAL_EXPENSES] ?? 0),
        totalVaultProvision: 0, netRoi: 0,
        sessionData: [], staffBreakdown: [], expenseData: [], vaultData: [],
      }));
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const top10Data = useMemo(() => {
    // Performance ROI = grossSales - totalStaffPay - totalExpenses
    // Excludes vault provision and bills so branches with different vault targets
    // and bill schedules are compared on a level playing field.
    const map: Record<string, { gross: number; perfRoi: number }> = {};
    top10Reports.forEach(r => {
      if (!map[r.branchId]) map[r.branchId] = { gross: 0, perfRoi: 0 };
      map[r.branchId].gross   += r.grossSales;
      map[r.branchId].perfRoi += r.grossSales - r.totalStaffPay - r.totalExpenses;
    });

    const MERGE_GROUPS: { keyword: RegExp; label: string }[] = [
      { keyword: /TANDANG\s*SORA/i, label: 'TANDANG SORA' },
    ];

    const merged: { shortName: string; gross: number; roi: number; score: number; isMerged?: boolean }[] = [];
    const mergeAccum: Record<string, { gross: number; roi: number; label: string }> = {};

    activeBranches
      .filter(b => map[b.id]?.gross > 0)
      .forEach(b => {
        const group = MERGE_GROUPS.find(g => g.keyword.test(b.name));
        if (group) {
          if (!mergeAccum[group.label]) mergeAccum[group.label] = { gross: 0, roi: 0, label: group.label };
          mergeAccum[group.label].gross += map[b.id].gross;
          mergeAccum[group.label].roi   += map[b.id].perfRoi;
        } else {
          const shortName = b.name.replace(/BRANCH\s*-\s*/i, '').trim();
          const { gross, perfRoi } = map[b.id];
          merged.push({ shortName, gross, roi: perfRoi, score: (gross + perfRoi) / 2 });
        }
      });

    Object.values(mergeAccum).forEach(g => {
      merged.push({ shortName: g.label, gross: g.gross, roi: g.roi, score: (g.gross + g.roi) / 2, isMerged: true });
    });

    return merged.sort((a, b) => b.score - a.score);
  }, [activeBranches, top10Reports]);

  const availableYears = useMemo(() => {
    const s = new Set<number>([getManilaYear()]);
    salesReports.forEach(r => s.add(new Date(r.reportDate).getFullYear()));
    return Array.from(s).sort((a, b) => b - a);
  }, [salesReports]);

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
      const dayMap = branchDailyMap[b.id] ?? {};
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

      {/* ── Header + Mode Tabs ─────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-white p-4 md:p-6 rounded-[24px] border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tighter">Top 10 Performers</h2>
          <p className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mt-0.5">Network Analytical Ledger</p>
        </div>
        <div className="bg-slate-100 p-1 rounded-xl flex gap-0.5">
          {([['chart','Ranking'],['heatmap','Heatmap'],['vs','VS Mode']] as [HubMode, string][]).map(([m, lbl]) => (
            <button
              key={m}
              onClick={() => { setMode(m); playSound('click'); }}
              className={`flex-1 py-2.5 px-3 md:px-5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${mode === m ? 'bg-white text-slate-900 shadow-md border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          BAR CHART MODE
      ══════════════════════════════════════════════════════ */}
      {mode === 'chart' && (
        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">

          {/* ── Monthly Top 10 ─────────────────────────────── */}
          <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-4 md:p-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">🏆</span>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-tighter">Monthly Top 10</h3>
                </div>
                <div className="flex items-center gap-2 mt-1.5 ml-7">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Score = (Gross + Perf. ROI) ÷ 2</span>
                  <span className="text-xs font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">excludes vault & bills</span>
                </div>
              </div>
              {/* Custom month/year picker */}
              <div className="relative shrink-0" ref={top10PickerRef}>
                <button
                  onClick={() => setTop10PickerOpen(v => !v)}
                  className={`flex items-center gap-2 pl-4 pr-3 py-2 rounded-2xl border transition-all shadow-sm ${
                    top10PickerOpen
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span className="text-xs font-black uppercase tracking-wider">{MONTHS[top10Month].slice(0,3)} {top10Year}</span>
                  <svg className={`w-3.5 h-3.5 transition-transform ${top10PickerOpen ? 'rotate-180 text-slate-300' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                  </svg>
                </button>

                {top10PickerOpen && (
                  <div className="absolute left-0 top-[calc(100%+8px)] z-[200] bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 w-56 animate-in zoom-in-95 fade-in duration-150 origin-top-left">
                    {/* Year row */}
                    <div className="flex items-center gap-1 mb-2.5">
                      {availableYears.map(y => (
                        <button
                          key={y}
                          onClick={() => setTop10Year(y)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black tracking-wider transition-all ${
                            top10Year === y
                              ? 'bg-slate-900 text-white'
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
            </div>

            {top10Data.length === 0 ? (
              <div className="py-14 text-center">
                <div className="text-4xl mb-3">🏅</div>
                <p className="text-xs font-black text-slate-300 uppercase tracking-widest">No data for this month</p>
              </div>
            ) : (
              <div className="space-y-2">
                {top10Data.map((d, i) => {
                  const rank     = i + 1;
                  const isTop10  = rank <= 10;
                  const isTop3   = rank <= 3;
                  const medal    = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
                  const topScore = top10Data[0].score;
                  const pct      = topScore > 0 ? (d.score / topScore) * 100 : 0;
                  const rowBg    = rank === 1 ? 'bg-amber-50 border-amber-200'
                                 : rank === 2 ? 'bg-slate-50 border-slate-200'
                                 : rank === 3 ? 'bg-orange-50 border-orange-200'
                                 : isTop10    ? 'bg-white border-slate-100'
                                 :              'bg-white border-slate-50 opacity-50';
                  const barColor = rank === 1 ? 'bg-amber-400'
                                 : rank === 2 ? 'bg-slate-400'
                                 : rank === 3 ? 'bg-orange-400'
                                 : isTop10    ? 'bg-slate-200'
                                 :              'bg-slate-100';
                  return (
                    <React.Fragment key={d.shortName}>
                      {/* Divider after rank 10 — always rendered so toggle is visible */}
                      {rank === 11 && (
                        <button
                          onClick={() => setShowOtherBranches(v => !v)}
                          className="w-full flex items-center gap-3 py-1 group"
                        >
                          <div className="flex-1 h-px bg-slate-100" />
                          <span className="flex items-center gap-1.5 text-xs font-black text-slate-400 uppercase tracking-widest shrink-0 group-hover:text-slate-600 transition-colors">
                            {showOtherBranches ? 'Hide' : `Show ${top10Data.length - 10} More`}
                            <svg className={`w-3 h-3 transition-transform ${showOtherBranches ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                            </svg>
                          </span>
                          <div className="flex-1 h-px bg-slate-100" />
                        </button>
                      )}
                      {(rank <= 10 || showOtherBranches) && <div className={`flex items-center gap-4 px-4 py-3 rounded-2xl border ${rowBg}`}>
                        {/* Rank */}
                        <div className="w-8 shrink-0 flex items-center justify-center">
                          {medal
                            ? <span className="text-xl leading-none">{medal}</span>
                            : <span className={`text-sm font-black ${isTop10 ? 'text-slate-400' : 'text-slate-200'}`}>#{rank}</span>}
                        </div>

                        {/* Branch + breakdown */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className={`font-black uppercase truncate ${isTop3 ? 'text-sm text-slate-900' : isTop10 ? 'text-xs text-slate-700' : 'text-xs text-slate-400'}`}>
                                {d.shortName}
                              </p>
                              {d.isMerged && (
                                <span className="shrink-0 text-xs font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-600 leading-none">
                                  Combined
                                </span>
                              )}
                            </div>
                            <p className={`shrink-0 font-black tabular-nums ${isTop3 ? 'text-sm text-slate-900' : isTop10 ? 'text-xs text-slate-600' : 'text-xs text-slate-300'}`}>
                              ₱{Math.round(d.score).toLocaleString()}
                            </p>
                          </div> {/* end justify-between row */}
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-1.5">
                            <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex gap-3">
                            <span className={`text-xs font-bold ${isTop10 ? 'text-emerald-600' : 'text-slate-300'}`}>Gross ₱{d.gross.toLocaleString()}</span>
                            <span className="text-xs text-slate-200">+</span>
                            <span className={`text-xs font-bold ${isTop10 ? 'text-indigo-500' : 'text-slate-300'}`}>Perf. ROI ₱{d.roi.toLocaleString()}</span>
                            <span className="text-xs text-slate-200">÷ 2</span>
                          </div>
                        </div>
                      </div>}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          HEATMAP MODE
      ══════════════════════════════════════════════════════ */}
      {mode === 'heatmap' && (
        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-white p-4 md:p-8 rounded-[24px] border border-slate-100 shadow-sm">

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
                  <div className="absolute left-0 top-[calc(100%+10px)] z-[200] bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 w-60 animate-in zoom-in-95 fade-in duration-150 origin-top-left">
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
                  <div className="absolute z-[110] top-[calc(100%+8px)] left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-2xl p-1.5 animate-in zoom-in-95 duration-150">
                    <div className="max-h-64 overflow-y-auto">
                      <button
                        onClick={() => { setHeatBranch('all'); setScopeOpen(false); playSound('click'); }}
                        className={`w-full text-left px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest mb-0.5 ${heatBranch === 'all' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                      >
                        Full Network
                      </button>
                      <div className="h-px bg-slate-100 my-1 mx-2" />
                      {activeBranches.map(b => (
                        <button
                          key={b.id}
                          onClick={() => { setHeatBranch(b.id); setScopeOpen(false); playSound('click'); }}
                          className={`w-full text-left px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest mb-0.5 flex items-center justify-between ${heatBranch === b.id ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
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
                        <p className={`text-xs font-black uppercase tracking-widest mb-1 ${totalNetG >= 0 ? 'text-indigo-400' : 'text-rose-400'}`}>Month Perf. ROI</p>
                        <p className={`text-lg font-black tabular-nums leading-tight ${totalNetG >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>₱{totalNetG.toLocaleString()}</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Days Reported</p>
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
                      <p className={`text-xs font-black uppercase tracking-widest mb-1 ${totalNet >= 0 ? 'text-indigo-400' : 'text-rose-400'}`}>Month ROI</p>
                      <p className={`text-lg font-black tabular-nums leading-tight ${totalNet >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>₱{totalNet.toLocaleString()}</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Days Reported</p>
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
                            <span className="text-xs font-black uppercase tracking-widest">Zoom</span>
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
                              className="bg-white rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200"
                              onClick={e => e.stopPropagation()}
                            >
                              {/* Modal header */}
                              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                                <div>
                                  <p className="text-xs font-black text-slate-800 uppercase tracking-tight">{MONTHS[heatMonth]} {heatYear}</p>
                                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{heatBranchName}</p>
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
                                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Gross Sales</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke="#6366f1" strokeWidth="2" strokeDasharray="4,3"/></svg>
                                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Perf. ROI</span>
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
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Gross Sales</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <svg width="20" height="4" className="shrink-0"><line x1="0" y1="2" x2="20" y2="2" stroke="#6366f1" strokeWidth="2.5" strokeDasharray="5,3.5"/></svg>
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Perf. ROI</span>
                      </div>
                      {activeDay && <p className="text-xs font-black text-slate-300 uppercase tracking-widest">· Click a day to inspect</p>}
                      {!activeDay && <p className="text-xs font-black text-slate-300 uppercase tracking-widest">· Click chart to inspect a day</p>}
                    </div>
                    {activeDay && dailyStats[activeDay] ? (
                      <div className="flex items-stretch gap-0 bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
                        <div className="px-5 py-3 border-r border-slate-100">
                          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-0.5">{new Date(activeDay + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                          <p className="text-sm font-black text-slate-500 tabular-nums">Day Detail</p>
                        </div>
                        <div className="px-5 py-3 border-r border-slate-100">
                          <p className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-0.5">Gross</p>
                          <p className="text-sm font-black text-emerald-600 tabular-nums">₱{dailyStats[activeDay].gross.toLocaleString()}</p>
                        </div>
                        <div className="px-5 py-3">
                          <p className={`text-xs font-black uppercase tracking-widest mb-0.5 ${dailyStats[activeDay].net >= 0 ? 'text-indigo-400' : 'text-rose-400'}`}>Perf. ROI</p>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <BranchDropdown label="Branch Alpha" value={branchA} options={activeBranches} onSelect={setBranchA} excludeId={branchB} colorTheme="indigo" />
            <BranchDropdown label="Branch Beta"  value={branchB} options={activeBranches} onSelect={setBranchB} excludeId={branchA} colorTheme="emerald" />
          </div>

          {comparisonData ? (
            <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden animate-in zoom-in-95 duration-300">
              {/* Headers */}
              <div className="flex divide-x divide-white/10 relative">
                <div className="flex-1 p-5 md:p-7 text-center bg-indigo-600 text-white">
                  <p className="text-xs font-black uppercase tracking-widest mb-1 opacity-60">Branch A</p>
                  <h4 className="text-xs md:text-sm font-black truncate px-2">{comparisonData.a.name}</h4>
                </div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                  <div className="w-9 h-9 md:w-11 md:h-11 bg-slate-900 rounded-xl md:rounded-2xl flex items-center justify-center text-white font-black text-xs md:text-xs shadow-xl border-2 border-white">VS</div>
                </div>
                <div className="flex-1 p-5 md:p-7 text-center bg-emerald-600 text-white">
                  <p className="text-xs font-black uppercase tracking-widest mb-1 opacity-60">Branch B</p>
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
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{label}</span>
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

              <div className="px-6 py-4 bg-slate-900 text-center">
                <p className="text-xs font-black text-slate-500 uppercase tracking-[0.4em]">All-time comparative data</p>
              </div>
            </div>
          ) : (
            <div className="py-24 text-center bg-white rounded-[24px] border-4 border-dashed border-slate-100 flex flex-col items-center gap-4">
              <div className="text-5xl">⚔️</div>
              <p className="text-xs font-black text-slate-300 uppercase tracking-[0.3em]">Select Two Branches to Begin</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
