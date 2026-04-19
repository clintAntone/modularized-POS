import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Branch, SalesReport, BranchBill } from '../../types';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { supabase } from '../../lib/supabase';
import { playSound, resumeAudioContext } from '../../lib/audio';

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
  roi:      { label: 'ROI',          barColor: 'bg-emerald-500', dimBar: 'bg-emerald-200', textColor: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' },
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
  sun.setHours(23, 59, 59, 999);
  const toYMD = (x: Date) => x.toISOString().split('T')[0];
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
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">{label}</p>
      <button
        onClick={() => { playSound('click'); setOpen(!open); }}
        className={`w-full flex items-center justify-between px-4 py-3.5 bg-white rounded-2xl border transition-all ${open ? `${tc} shadow-lg ring-4 ring-current/5` : 'border-slate-100 hover:border-slate-300 shadow-sm'}`}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0 ${sel ? (colorTheme === 'indigo' ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white') : 'bg-slate-100 text-slate-300'}`}>
            {sel ? '🏢' : '○'}
          </div>
          <span className={`font-black text-[9px] uppercase tracking-widest truncate ${sel ? 'text-slate-900' : 'text-slate-300'}`}>
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
                className={`w-full text-left px-4 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all mb-0.5 flex items-center justify-between ${
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
  const [weekAnchor, setWeekAnchor] = useState(new Date());

  // Top 10
  const [top10Month, setTop10Month] = useState(new Date().getMonth());
  const [top10Year,  setTop10Year]  = useState(new Date().getFullYear());

  // Heatmap
  const [heatMonth, setHeatMonth]   = useState(new Date().getMonth());
  const [heatYear,  setHeatYear]    = useState(new Date().getFullYear());
  const [heatBranch, setHeatBranch] = useState('all');
  const [activeDay,  setActiveDay]  = useState<string | null>(null);
  const [scopeOpen,  setScopeOpen]  = useState(false);
  const scopeRef = useRef<HTMLDivElement>(null);

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
  const todayYMD = useMemo(() => new Date().toISOString().split('T')[0], []);
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

  // ── Branch week data ─────────────────────────────────────
  const billsByBranch = useMemo(() => {
    const map: Record<string, number> = {};
    allBills.forEach(b => { map[b.branchId] = (map[b.branchId] || 0) + (b.amount || 0); });
    return map;
  }, [allBills]);

  const branchWeekData = useMemo(() =>
    activeBranches.map(branch => {
      const rpts = salesReports.filter(r =>
        r.branchId === branch.id &&
        r.reportDate >= week.start &&
        r.reportDate <= week.end
      );
      return {
        branch,
        shortName: branch.name.replace(/BRANCH\s*-\s*/i, '').trim(),
        gross:    rpts.reduce((s, r) => s + r.grossSales, 0),
        roi:      rpts.reduce((s, r) => s + r.netRoi, 0),
        expenses: rpts.reduce((s, r) => s + r.totalExpenses, 0),
        salary:   rpts.reduce((s, r) => s + r.totalStaffPay, 0),
        bills:    billsByBranch[branch.id] || 0,
      };
    }),
  [activeBranches, salesReports, week, billsByBranch]);

  const barData = useMemo(() =>
    [...branchWeekData]
      .sort((a, b) => b[metric] - a[metric])
      .slice(0, 25),
  [branchWeekData, metric]);

  const maxBarValue = useMemo(() =>
    Math.max(...barData.map(d => Math.abs(d[metric])), 1),
  [barData, metric]);

  // ── Top 10 ───────────────────────────────────────────────
  const top10Data = useMemo(() => {
    const monthStr = `${top10Year}-${String(top10Month + 1).padStart(2, '0')}`;
    const map: Record<string, { gross: number; roi: number }> = {};
    salesReports.forEach(r => {
      if (!r.reportDate.startsWith(monthStr)) return;
      if (!map[r.branchId]) map[r.branchId] = { gross: 0, roi: 0 };
      map[r.branchId].gross += r.grossSales;
      map[r.branchId].roi   += r.netRoi;
    });
    return activeBranches
      .filter(b => map[b.id]?.gross > 0)
      .map(b => ({
        branch:    b,
        shortName: b.name.replace(/BRANCH\s*-\s*/i, '').trim(),
        gross:     map[b.id].gross,
        roi:       map[b.id].roi,
        score:     (map[b.id].gross + map[b.id].roi) / 2,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [activeBranches, salesReports, top10Month, top10Year]);

  const availableYears = useMemo(() => {
    const s = new Set<number>([new Date().getFullYear()]);
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
        stats[r.reportDate].net   += r.netRoi;
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

  // ── VS comparison ────────────────────────────────────────
  const comparisonData = useMemo(() => {
    if (!branchA || !branchB) return null;
    const sum = (id: string) => salesReports.filter(r => r.branchId === id).reduce(
      (a, r) => ({ gross: a.gross + r.grossSales, net: a.net + r.netRoi, pay: a.pay + r.totalStaffPay, exp: a.exp + r.totalExpenses, days: a.days + 1 }),
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
    <div className="space-y-4 md:space-y-5 animate-in fade-in duration-500 pb-32">

      {/* ── Header + Mode Tabs ─────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-white p-4 md:p-6 rounded-[24px] border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tighter">Intelligence Hub</h2>
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.3em] mt-0.5">Network Analytical Ledger</p>
        </div>
        <div className="bg-slate-100 p-1 rounded-xl flex gap-0.5">
          {([['chart','Bar Chart'],['heatmap','Heatmap'],['vs','VS Mode']] as [HubMode, string][]).map(([m, lbl]) => (
            <button
              key={m}
              onClick={() => { setMode(m); playSound('click'); }}
              className={`flex-1 py-2.5 px-3 md:px-5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${mode === m ? 'bg-white text-slate-900 shadow-md border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
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

          {/* Week nav + metric chips */}
          <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-4 md:p-6 space-y-4">

            {/* Week navigator */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigateWeek(-1)}
                className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center hover:bg-slate-100 active:scale-90 transition-all shrink-0"
              >
                <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
                </svg>
              </button>
              <div className="flex-1 text-center">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.25em]">Week</p>
                <p className="text-[11px] md:text-sm font-black text-slate-900 mt-0.5">{week.label}</p>
              </div>
              <button
                onClick={() => navigateWeek(1)}
                disabled={!canGoForward}
                className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center hover:bg-slate-100 active:scale-90 transition-all shrink-0 disabled:opacity-25 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            </div>

            {/* Metric chips */}
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(METRIC_CONFIG) as Metric[]).map(m => {
                const c = METRIC_CONFIG[m];
                const active = metric === m;
                return (
                  <button
                    key={m}
                    onClick={() => { setMetric(m); playSound('click'); }}
                    className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all active:scale-95 ${
                      active
                        ? `${c.bgColor} ${c.textColor} ${c.borderColor} shadow-sm`
                        : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-200 hover:text-slate-600'
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bar chart card */}
          <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-4 md:p-6">
            <div className="flex items-start justify-between mb-5">
              <div>
                <span className={`inline-block px-3 py-1 rounded-xl ${cfg.bgColor} ${cfg.textColor} ${cfg.borderColor} border text-[9px] font-black uppercase tracking-widest`}>
                  {cfg.label}
                </span>
                <p className="text-[9px] text-slate-400 uppercase tracking-widest mt-1.5">
                  {metric === 'bills' ? 'Monthly configured amounts' : `${week.label}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">{barData.length} branches</p>
                <p className={`text-xs font-black mt-0.5 ${cfg.textColor}`}>
                  ₱{barData.reduce((s, d) => s + Math.max(d[metric], 0), 0).toLocaleString()}
                </p>
                <p className="text-[7px] text-slate-300 uppercase tracking-widest">network total</p>
              </div>
            </div>

            {barData.every(d => d[metric] === 0) ? (
              <div className="py-16 text-center">
                <div className="text-4xl mb-3">📊</div>
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No data for this period</p>
              </div>
            ) : (
              <div className="space-y-2">
                {barData.map((d, i) => {
                  const value = d[metric];
                  const isNeg = value < 0;
                  const pct   = maxBarValue > 0 ? (Math.abs(value) / maxBarValue) * 100 : 0;
                  const overBar = pct > 50;
                  return (
                    <div key={d.branch.id} className="flex items-center gap-2.5 group">
                      {/* Rank badge */}
                      <div className="w-5 shrink-0 text-right">
                        <span className={`text-[8px] font-black ${i < 3 ? cfg.textColor : 'text-slate-300'}`}>{i + 1}</span>
                      </div>
                      {/* Branch name */}
                      <div className="w-20 md:w-28 shrink-0">
                        <p className="text-[8px] md:text-[9px] font-black text-slate-700 uppercase truncate leading-tight">{d.shortName}</p>
                      </div>
                      {/* Bar track */}
                      <div className="flex-1 h-9 bg-slate-50 rounded-xl relative overflow-hidden border border-slate-100">
                        {/* Fill */}
                        <div
                          className={`absolute left-0 top-0 h-full rounded-xl transition-all duration-700 ease-out ${isNeg ? 'bg-rose-400' : cfg.barColor}`}
                          style={{ width: `${Math.max(pct, value !== 0 ? 2 : 0)}%` }}
                        />
                        {/* Label */}
                        <div className={`absolute inset-0 flex items-center ${overBar ? 'justify-end pr-2' : 'pl-2'}`}>
                          <span className={`text-[8px] font-black leading-none transition-colors ${
                            overBar
                              ? 'text-white'
                              : isNeg ? 'text-rose-500' : cfg.textColor
                          }`}>
                            {isNeg ? '-' : ''}₱{Math.abs(value).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {metric === 'bills' && (
              <p className="mt-5 text-[8px] text-slate-300 uppercase tracking-widest text-center pt-4 border-t border-slate-50">
                * Rent &amp; Bills shows monthly fixed amounts, not weekly
              </p>
            )}
          </div>

          {/* ── Monthly Top 10 ─────────────────────────────── */}
          <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-4 md:p-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">🏆</span>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-tighter">Monthly Top 10</h3>
                </div>
                <p className="text-[8px] text-slate-400 uppercase tracking-widest mt-0.5 ml-7">
                  Score = (Gross Sales + ROI) ÷ 2
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={top10Month}
                  onChange={e => setTop10Month(Number(e.target.value))}
                  className="text-[9px] font-black text-slate-700 uppercase bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none cursor-pointer appearance-none"
                >
                  {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
                <select
                  value={top10Year}
                  onChange={e => setTop10Year(Number(e.target.value))}
                  className="text-[9px] font-black text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none cursor-pointer appearance-none"
                >
                  {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {top10Data.length === 0 ? (
              <div className="py-14 text-center">
                <div className="text-4xl mb-3">🏅</div>
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No data for this month</p>
              </div>
            ) : (
              <>
                {/* Podium for top 3 */}
                <div className="grid grid-cols-3 gap-2 mb-5">
                  {[top10Data[1], top10Data[0], top10Data[2]].map((d, podiumIdx) => {
                    if (!d) return <div key={podiumIdx} />;
                    const rank   = podiumIdx === 1 ? 1 : podiumIdx === 0 ? 2 : 3;
                    const medal  = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';
                    const heights = ['h-20', 'h-28', 'h-16'];
                    const bgs    = ['bg-slate-100', 'bg-amber-50 border border-amber-200', 'bg-orange-50 border border-orange-200'];
                    return (
                      <div key={d.branch.id} className="flex flex-col items-center gap-1">
                        <span className="text-[9px] font-black text-slate-500 uppercase truncate max-w-full px-1 text-center">{d.shortName}</span>
                        <p className="text-[9px] font-black text-slate-700">₱{Math.round(d.score).toLocaleString()}</p>
                        <div className={`w-full rounded-t-2xl flex flex-col items-center justify-end pb-2 ${heights[podiumIdx]} ${bgs[podiumIdx]}`}>
                          <span className="text-xl">{medal}</span>
                          <span className="text-[8px] font-black text-slate-400">#{rank}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Ranked list 4-10 */}
                {top10Data.length > 3 && (
                  <div className="space-y-1.5">
                    {top10Data.slice(3).map((d, i) => {
                      const rank    = i + 4;
                      const topScore = top10Data[0].score;
                      const pct     = topScore > 0 ? (d.score / topScore) * 100 : 0;
                      return (
                        <div key={d.branch.id} className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-slate-50 border border-slate-100">
                          <span className="text-[9px] font-black text-slate-300 w-4 shrink-0">#{rank}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-[9px] font-black text-slate-700 uppercase truncate">{d.shortName}</p>
                              <p className="text-[9px] font-black text-slate-600 shrink-0 ml-2">₱{Math.round(d.score).toLocaleString()}</p>
                            </div>
                            <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                              <div className="h-full bg-slate-400 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="flex gap-3 mt-1">
                              <span className="text-[7px] text-slate-400">G ₱{d.gross.toLocaleString()}</span>
                              <span className="text-[7px] text-slate-300">·</span>
                              <span className="text-[7px] text-slate-400">ROI ₱{d.roi.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
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
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
              <div className="flex items-center gap-3">
                <select
                  value={heatMonth}
                  onChange={e => { setHeatMonth(Number(e.target.value)); setActiveDay(null); }}
                  className="text-base md:text-xl font-black text-slate-900 uppercase tracking-tight bg-transparent outline-none cursor-pointer hover:text-emerald-600 appearance-none"
                >
                  {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
                <span className="text-xl font-black text-slate-200">/</span>
                <select
                  value={heatYear}
                  onChange={e => { setHeatYear(Number(e.target.value)); setActiveDay(null); }}
                  className="text-base md:text-xl font-black text-slate-400 bg-transparent outline-none cursor-pointer appearance-none"
                >
                  {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              <div className="relative w-full sm:w-60" ref={scopeRef}>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Scope</p>
                <button
                  onClick={() => { playSound('click'); setScopeOpen(!scopeOpen); }}
                  className={`w-full flex items-center justify-between px-4 py-3 bg-slate-50 rounded-2xl border transition-all ${scopeOpen ? 'bg-white border-emerald-500 shadow-lg ring-4 ring-emerald-500/5' : 'border-slate-100 hover:border-slate-300'}`}
                >
                  <span className="font-black text-[9px] uppercase tracking-widest text-slate-700 truncate">{heatBranchName}</span>
                  <svg className={`w-4 h-4 text-slate-400 transition-transform ${scopeOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M19 9l-7 7-7-7"/></svg>
                </button>
                {scopeOpen && (
                  <div className="absolute z-[110] top-[calc(100%+8px)] left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-2xl p-1.5 animate-in zoom-in-95 duration-150">
                    <div className="max-h-64 overflow-y-auto">
                      <button
                        onClick={() => { setHeatBranch('all'); setScopeOpen(false); playSound('click'); }}
                        className={`w-full text-left px-4 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest mb-0.5 ${heatBranch === 'all' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                      >
                        Full Network
                      </button>
                      <div className="h-px bg-slate-100 my-1 mx-2" />
                      {activeBranches.map(b => (
                        <button
                          key={b.id}
                          onClick={() => { setHeatBranch(b.id); setScopeOpen(false); playSound('click'); }}
                          className={`w-full text-left px-4 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest mb-0.5 flex items-center justify-between ${heatBranch === b.id ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
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

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1.5 md:gap-3">
              {['S','M','T','W','T','F','S'].map((d, i) => (
                <div key={`${d}-${i}`} className="text-center py-2 text-[9px] font-black text-slate-300 uppercase tracking-widest">{d}</div>
              ))}
              {Array.from({ length: startDay }).map((_, i) => <div key={`e-${i}`} className="aspect-square" />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day     = i + 1;
                const dateStr = `${heatYear}-${String(heatMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const data    = dailyStats[dateStr];
                const isAct   = activeDay === dateStr;
                const col     = getHeatColor(data?.net || 0, data?.gross || 0, isAct);
                return (
                  <button
                    key={day}
                    onClick={() => { resumeAudioContext(); playSound('click'); setActiveDay(isAct ? null : dateStr); }}
                    className={`aspect-square rounded-xl md:rounded-2xl border transition-all duration-200 flex flex-col items-center justify-center gap-0.5 active:scale-90 ${col}`}
                  >
                    <span className={`text-[10px] md:text-sm font-black ${isAct ? 'scale-125' : ''}`}>{day}</span>
                    {data && (
                      <span className="text-[7px] font-black opacity-80 hidden md:block">
                        ₱{(data.net / 1000).toFixed(1)}k
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Day detail */}
            {activeDay && dailyStats[activeDay] && (
              <div className="mt-6 p-5 md:p-7 bg-slate-900 rounded-[24px] text-white animate-in slide-in-from-top-4 duration-300 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-3xl rounded-full" />
                <div className="flex justify-between items-start mb-5 relative z-10">
                  <div>
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{activeDay}</p>
                    <h4 className="text-base md:text-lg font-black uppercase tracking-tight mt-0.5">
                      {new Date(activeDay).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                    </h4>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${dailyStats[activeDay].net >= 0 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
                    {dailyStats[activeDay].net >= 0 ? 'Profitable' : 'Loss Day'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 relative z-10">
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2">Gross</p>
                    <p className="text-xl md:text-2xl font-black tabular-nums">₱{dailyStats[activeDay].gross.toLocaleString()}</p>
                  </div>
                  <div className={`p-4 rounded-2xl border ${dailyStats[activeDay].net >= 0 ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-rose-500/5 border-rose-500/10'}`}>
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2">Net ROI</p>
                    <p className={`text-xl md:text-2xl font-black tabular-nums ${dailyStats[activeDay].net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      ₱{dailyStats[activeDay].net.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="mt-6 pt-5 border-t border-slate-50 flex flex-wrap justify-center gap-4 md:gap-8">
              {[
                { color: 'bg-rose-100 border-rose-200', label: 'Loss Day' },
                { color: 'bg-emerald-50 border-emerald-100', label: 'Low Yield' },
                { color: 'bg-emerald-200 border-emerald-300', label: 'Moderate' },
                { color: 'bg-emerald-600', label: 'High Profit' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-md border ${l.color}`} />
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{l.label}</span>
                </div>
              ))}
            </div>
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
                  <p className="text-[7px] font-black uppercase tracking-widest mb-1 opacity-60">Branch A</p>
                  <h4 className="text-[11px] md:text-sm font-black truncate px-2">{comparisonData.a.name}</h4>
                </div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                  <div className="w-9 h-9 md:w-11 md:h-11 bg-slate-900 rounded-xl md:rounded-2xl flex items-center justify-center text-white font-black text-[8px] md:text-[9px] shadow-xl border-2 border-white">VS</div>
                </div>
                <div className="flex-1 p-5 md:p-7 text-center bg-emerald-600 text-white">
                  <p className="text-[7px] font-black uppercase tracking-widest mb-1 opacity-60">Branch B</p>
                  <h4 className="text-[11px] md:text-sm font-black truncate px-2">{comparisonData.b.name}</h4>
                </div>
              </div>

              <div className="p-5 md:p-8 space-y-6">
                {([
                  { label: 'Gross Sales',     key: 'gross', lowerIsBetter: false },
                  { label: 'Net ROI',         key: 'net',   lowerIsBetter: false },
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
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
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
                <p className="text-[7px] font-black text-slate-500 uppercase tracking-[0.4em]">All-time comparative data</p>
              </div>
            </div>
          ) : (
            <div className="py-24 text-center bg-white rounded-[24px] border-4 border-dashed border-slate-100 flex flex-col items-center gap-4">
              <div className="text-5xl">⚔️</div>
              <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.3em]">Select Two Branches to Begin</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
