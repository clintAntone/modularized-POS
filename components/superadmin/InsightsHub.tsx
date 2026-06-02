import React, { useMemo, useState } from 'react';
import { Branch, SalesReport } from '../../types';

interface InsightsHubProps {
  branches: Branch[];
  salesReports: SalesReport[];
  isBranchView?: boolean;
}

type AlertLevel = 'critical' | 'warning' | 'normal';
type FilterMode = 'all' | 'anomalies';

interface BranchInsight {
  branch: Branch;
  baselineAvg: number;
  recentAvg: number;
  dropPct: number;
  level: AlertLevel;
  recentReports: number;
  baselineReports: number;
  daysSinceLastReport: number | null;
  last14Days: { date: string; gross: number }[];
  zeroStreak: number;
}

function getManilaDateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d);
}

function getManilaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
}

const LEVEL_STYLES: Record<AlertLevel, { badge: string; border: string; dot: string; bg: string }> = {
  critical: { badge: 'bg-rose-100 text-rose-700 border-rose-200',    border: 'border-l-rose-500',    dot: 'bg-rose-500 animate-pulse',  bg: 'bg-rose-50'    },
  warning:  { badge: 'bg-amber-100 text-amber-700 border-amber-200',  border: 'border-l-amber-400',   dot: 'bg-amber-400',               bg: 'bg-amber-50'   },
  normal:   { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', border: 'border-l-emerald-400', dot: 'bg-emerald-400',         bg: 'bg-emerald-50' },
};

function buildInsights(branches: Branch[], salesReports: SalesReport[], today: string, skipFilter = false): BranchInsight[] {
  const byBranch: Record<string, SalesReport[]> = {};
  for (const r of salesReports) {
    if (!byBranch[r.branchId]) byBranch[r.branchId] = [];
    byBranch[r.branchId].push(r);
  }

  const recentStart   = getManilaDateStr(6);
  const baselineStart = getManilaDateStr(36);
  const baselineEnd   = getManilaDateStr(7);

  return (skipFilter ? branches : branches.filter(b => b.isEnabled && !b.name.toUpperCase().includes('TEST')))
    .map(branch => {
      const reports      = byBranch[branch.id] || [];
      const recentReps   = reports.filter(r => r.reportDate >= recentStart && r.reportDate <= today);
      const baselineReps = reports.filter(r => r.reportDate >= baselineStart && r.reportDate <= baselineEnd);
      const recentAvg    = recentReps.length   ? recentReps.reduce((s, r) => s + r.grossSales, 0) / recentReps.length   : 0;
      const baselineAvg  = baselineReps.length ? baselineReps.reduce((s, r) => s + r.grossSales, 0) / baselineReps.length : 0;
      const dropPct      = baselineAvg > 0 ? ((baselineAvg - recentAvg) / baselineAvg) * 100 : 0;

      let level: AlertLevel = 'normal';
      if (baselineAvg > 0) {
        if (recentAvg === 0 || dropPct >= 60) level = 'critical';
        else if (dropPct >= 35) level = 'warning';
      }

      const sorted = [...reports].sort((a, b) => b.reportDate.localeCompare(a.reportDate));
      const daysSinceLastReport = sorted.length > 0
        ? Math.floor((new Date(today).getTime() - new Date(sorted[0].reportDate).getTime()) / 86400000)
        : null;

      const last14Days = Array.from({ length: 14 }, (_, i) => {
        const date = getManilaDateStr(13 - i);
        const rep  = reports.find(r => r.reportDate === date);
        return { date, gross: rep?.grossSales ?? -1 };
      });

      let zeroStreak = 0;
      for (let i = 0; i < 14; i++) {
        const rep = reports.find(r => r.reportDate === getManilaDateStr(i));
        if (!rep || rep.grossSales === 0) zeroStreak++; else break;
      }

      return { branch, baselineAvg, recentAvg, dropPct, level, recentReports: recentReps.length, baselineReports: baselineReps.length, daysSinceLastReport, last14Days, zeroStreak };
    });
}

const fmt = (n: number) => n >= 1000 ? `₱${(n / 1000).toFixed(1)}k` : `₱${Math.round(n).toLocaleString()}`;

// ─────────────────────────────────────────────────────────────────────────────
// Single-branch manager view
// ─────────────────────────────────────────────────────────────────────────────
const BranchInsightView: React.FC<{ insight: BranchInsight }> = ({ insight }) => {
  const { branch, baselineAvg, recentAvg, dropPct, level, recentReports, baselineReports, daysSinceLastReport, last14Days, zeroStreak } = insight;
  const styles  = LEVEL_STYLES[level];
  const isGain  = dropPct < 0;
  const maxVal  = Math.max(...last14Days.filter(d => d.gross >= 0).map(d => d.gross), 1);

  const changeColor = isGain ? 'text-emerald-600' : level === 'critical' ? 'text-rose-600' : level === 'warning' ? 'text-amber-500' : 'text-slate-400';

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div className={`rounded-[20px] border p-5 flex items-center gap-4 ${
        level === 'critical' ? 'bg-rose-50 border-rose-200' :
        level === 'warning'  ? 'bg-amber-50 border-amber-200' :
        'bg-emerald-50 border-emerald-200'
      }`}>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
          level === 'critical' ? 'bg-rose-100' : level === 'warning' ? 'bg-amber-100' : 'bg-emerald-100'
        }`}>
          {level === 'normal' ? (
            <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          ) : level === 'warning' ? (
            <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
          ) : (
            <svg className="w-6 h-6 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-widest ${styles.badge}`}>
              {level === 'normal' ? 'Normal' : level === 'warning' ? 'Warning' : 'Critical'}
            </span>
            {zeroStreak >= 3 && (
              <span className="text-[9px] font-black text-rose-500 uppercase tracking-wider">{zeroStreak}d no activity</span>
            )}
          </div>
          <p className={`text-[13px] font-black uppercase tracking-tight ${
            level === 'critical' ? 'text-rose-900' : level === 'warning' ? 'text-amber-900' : 'text-emerald-900'
          }`}>
            {level === 'normal'
              ? 'Sales are performing within normal range'
              : level === 'warning'
              ? `Sales are ${Math.abs(Math.round(dropPct))}% below your usual average`
              : recentAvg === 0
              ? 'No sales recorded in the past 7 days'
              : `Sales have dropped ${Math.abs(Math.round(dropPct))}% compared to your baseline`}
          </p>
        </div>
        {baselineAvg > 0 && (
          <div className={`text-right shrink-0 hidden sm:block`}>
            <p className={`text-[28px] font-black leading-none ${changeColor}`}>
              {isGain ? '+' : dropPct > 0 ? '-' : ''}{Math.abs(Math.round(dropPct))}%
            </p>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">vs 30-day avg</p>
          </div>
        )}
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'This Week Avg', value: fmt(recentAvg), sub: `${recentReports} day${recentReports !== 1 ? 's' : ''} reported` },
          { label: 'Baseline Avg', value: fmt(baselineAvg), sub: `Prior 30 days (${baselineReports} reports)` },
          { label: 'Change', value: baselineAvg > 0 ? `${isGain ? '+' : dropPct > 0 ? '-' : ''}${Math.abs(Math.round(dropPct))}%` : '—', sub: isGain ? 'Above baseline' : dropPct > 0 ? 'Below baseline' : 'Insufficient data' },
          { label: 'Last Report', value: daysSinceLastReport === 0 ? 'Today' : daysSinceLastReport === null ? 'Never' : `${daysSinceLastReport}d ago`, sub: 'Most recent submission' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{s.label}</p>
            <p className="text-[17px] font-black text-slate-900 leading-none">{s.value}</p>
            <p className="text-[9px] text-slate-400 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* 14-day chart */}
      <div className="bg-white rounded-[20px] border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">14-Day Sales Trend</p>
          <div className="flex items-center gap-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-slate-700 inline-block" /> Sales</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-300 inline-block" /> ₱0</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-slate-200 inline-block" /> No report</span>
          </div>
        </div>
        <div className="flex items-end gap-1 h-24">
          {last14Days.map((d, i) => {
            const hasData = d.gross >= 0;
            const height  = hasData ? Math.max((d.gross / maxVal) * 96, d.gross > 0 ? 4 : 2) : 6;
            const color   = !hasData ? 'bg-slate-200' : d.gross === 0 ? 'bg-rose-300' : 'bg-slate-700';
            const isToday = d.date === getManilaToday();
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1" title={hasData ? `${d.date}: ₱${d.gross.toLocaleString()}` : `${d.date}: no report`}>
                <div className={`w-full rounded-t-sm ${color} ${isToday ? 'ring-2 ring-offset-1 ring-slate-400' : ''}`} style={{ height: `${height}px` }} />
                <span className={`text-[7px] font-mono ${isToday ? 'text-slate-600 font-black' : 'text-slate-300'}`}>{d.date.slice(8)}</span>
              </div>
            );
          })}
        </div>
        {/* Baseline reference line label */}
        {baselineAvg > 0 && (
          <p className="text-[9px] text-slate-400 mt-3 pt-3 border-t border-slate-100">
            Your 30-day baseline average is <span className="font-black text-slate-600">{fmt(baselineAvg)}/day</span>
            {recentAvg > 0 && <> · This week you're averaging <span className={`font-black ${changeColor}`}>{fmt(recentAvg)}/day</span></>}
          </p>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Multi-branch admin card
// ─────────────────────────────────────────────────────────────────────────────
const BranchInsightCard: React.FC<{ insight: BranchInsight; isExpanded: boolean; onToggle: () => void }> = ({ insight, isExpanded, onToggle }) => {
  const { branch, baselineAvg, recentAvg, dropPct, level, daysSinceLastReport, last14Days, zeroStreak, recentReports, baselineReports } = insight;
  const styles = LEVEL_STYLES[level];
  const isGain = dropPct < 0;
  const maxBar = Math.max(...last14Days.filter(d => d.gross >= 0).map(d => d.gross), 1);
  const changeColor = isGain ? 'text-emerald-600' : level === 'critical' ? 'text-rose-600' : level === 'warning' ? 'text-amber-600' : 'text-slate-400';

  return (
    <div className={`bg-white rounded-[20px] border border-slate-200 border-l-4 ${styles.border} shadow-sm overflow-hidden`}>
      <button onClick={onToggle} className="w-full text-left p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${styles.dot}`} />
            <div className="min-w-0">
              <p className="text-[13px] font-black text-slate-900 uppercase tracking-tight truncate">{branch.name.replace('BRANCH - ', '')}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className={`text-[8px] font-black px-2 py-0.5 rounded-full border uppercase tracking-widest ${styles.badge}`}>{level}</span>
                {daysSinceLastReport !== null && daysSinceLastReport > 0 && (
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Last report {daysSinceLastReport}d ago</span>
                )}
                {zeroStreak >= 3 && (
                  <span className="text-[9px] font-black text-rose-500 uppercase tracking-wider">{zeroStreak}d silent</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden sm:flex items-end gap-[2px] h-8">
              {last14Days.map((d, i) => {
                const hasData = d.gross >= 0;
                const height = hasData ? Math.max((d.gross / maxBar) * 32, 2) : 4;
                const color = !hasData ? 'bg-slate-200' : d.gross === 0 ? 'bg-rose-300' : 'bg-slate-400';
                return <div key={i} title={hasData ? `${d.date}: ₱${d.gross.toLocaleString()}` : `${d.date}: no report`} className={`w-[5px] rounded-sm ${color}`} style={{ height: `${height}px` }} />;
              })}
            </div>
            {baselineAvg > 0 && (
              <div className="text-right">
                <p className={`text-[18px] font-black leading-none ${changeColor}`}>{isGain ? '+' : '-'}{Math.abs(Math.round(dropPct))}%</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">vs baseline</p>
              </div>
            )}
            <svg className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M19 9l-7 7-7-7"/></svg>
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Recent Avg/Day', value: fmt(recentAvg), sub: `${recentReports} report${recentReports !== 1 ? 's' : ''} (7d)` },
              { label: 'Baseline Avg/Day', value: fmt(baselineAvg), sub: `${baselineReports} report${baselineReports !== 1 ? 's' : ''} (30d)` },
              { label: 'Change', value: baselineAvg > 0 ? `${isGain ? '+' : '-'}${Math.abs(Math.round(dropPct))}%` : 'N/A', sub: isGain ? 'Above baseline' : dropPct > 0 ? 'Below baseline' : 'No baseline' },
              { label: 'Last Seen', value: daysSinceLastReport === 0 ? 'Today' : daysSinceLastReport === null ? 'Never' : `${daysSinceLastReport}d ago`, sub: 'Most recent report' },
            ].map(stat => (
              <div key={stat.label} className="bg-slate-50 rounded-2xl p-3">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                <p className="text-[15px] font-black text-slate-900 leading-none">{stat.value}</p>
                <p className="text-[9px] text-slate-400 mt-0.5">{stat.sub}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Last 14 Days</p>
            <div className="flex items-end gap-1 h-12">
              {last14Days.map((d, i) => {
                const hasData = d.gross >= 0;
                const maxVal = Math.max(...last14Days.filter(x => x.gross >= 0).map(x => x.gross), 1);
                const height = hasData ? Math.max((d.gross / maxVal) * 48, 2) : 6;
                const color = !hasData ? 'bg-slate-200' : d.gross === 0 ? 'bg-rose-300' : 'bg-slate-700';
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className={`w-full rounded-sm ${color}`} style={{ height: `${height}px` }} />
                    <span className="text-[7px] text-slate-300 font-mono">{d.date.slice(8)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────
export const InsightsHub: React.FC<InsightsHubProps> = ({ branches, salesReports, isBranchView }) => {
  const [filter, setFilter]     = useState<FilterMode>('anomalies');
  const [sortBy, setSortBy]     = useState<'severity' | 'drop' | 'name'>('severity');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch]     = useState('');
  const today = getManilaToday();

  const insights = useMemo(() => buildInsights(branches, salesReports, today, isBranchView), [branches, salesReports, today, isBranchView]);

  // ── Single branch view ────────────────────────────────────────────────────
  if (isBranchView) {
    const insight = insights[0];
    if (!insight) return (
      <div className="py-16 text-center">
        <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest">No report data available</p>
      </div>
    );
    return (
      <div className="space-y-4 pb-24">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
          </div>
          <div>
            <h3 className="text-[13px] font-black text-slate-900 uppercase tracking-tighter">Sales Insights</h3>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Last 7 days vs prior 30-day average</p>
          </div>
        </div>
        <BranchInsightView insight={insight} />
      </div>
    );
  }

  // ── Multi-branch admin view ───────────────────────────────────────────────
  const criticalCount = insights.filter(i => i.level === 'critical').length;
  const warningCount  = insights.filter(i => i.level === 'warning').length;

  const displayInsights = useMemo(() => {
    const term = search.trim().toUpperCase();
    let list = insights.filter(i => !term || i.branch.name.toUpperCase().includes(term));
    if (filter === 'anomalies') list = list.filter(i => i.level !== 'normal');
    return list.sort((a, b) => {
      if (sortBy === 'severity') {
        const order = { critical: 0, warning: 1, normal: 2 };
        if (order[a.level] !== order[b.level]) return order[a.level] - order[b.level];
        return b.dropPct - a.dropPct;
      }
      if (sortBy === 'drop') return b.dropPct - a.dropPct;
      return a.branch.name.localeCompare(b.branch.name);
    });
  }, [insights, filter, sortBy, search]);

  return (
    <div className="space-y-6 pb-32">
      {/* Header */}
      <div className="bg-white rounded-[24px] border border-slate-200 shadow-sm p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
          </div>
          <div>
            <h3 className="text-[14px] font-black text-slate-900 uppercase tracking-tighter">Sales Insights</h3>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Anomaly Detection · Last 7 vs Prior 30 Days</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {criticalCount > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-[10px] font-black text-rose-700 uppercase tracking-wider">{criticalCount} Critical</span>
            </span>
          )}
          {warningCount > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span className="text-[10px] font-black text-amber-700 uppercase tracking-wider">{warningCount} Warning</span>
            </span>
          )}
          {criticalCount === 0 && warningCount === 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">All Normal</span>
            </span>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input type="text" placeholder="Search branch..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold uppercase tracking-widest text-slate-700 placeholder-slate-300 outline-none focus:border-slate-400 transition-all" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(['anomalies', 'all'] as FilterMode[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === f ? 'bg-slate-900 text-white shadow' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-400'}`}>
              {f === 'anomalies' ? 'Anomalies Only' : 'All Branches'}
            </button>
          ))}
          <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold uppercase tracking-widest text-slate-600 outline-none">
            <option value="severity">Sort: Severity</option>
            <option value="drop">Sort: Drop %</option>
            <option value="name">Sort: Name</option>
          </select>
        </div>
      </div>

      {displayInsights.length === 0 ? (
        <div className="bg-white rounded-[24px] border border-slate-200 p-12 text-center">
          <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">No Anomalies Detected</p>
          <p className="text-[10px] text-slate-400 mt-1">All branches are performing within normal range</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayInsights.map(insight => (
            <BranchInsightCard key={insight.branch.id} insight={insight}
              isExpanded={expandedId === insight.branch.id}
              onToggle={() => setExpandedId(expandedId === insight.branch.id ? null : insight.branch.id)} />
          ))}
        </div>
      )}

      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">How Anomalies Are Detected</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { color: 'bg-rose-500', label: 'Critical', desc: '60%+ drop or ₱0 sales vs prior 30-day avg' },
            { color: 'bg-amber-400', label: 'Warning',  desc: '35–59% drop vs prior 30-day avg' },
            { color: 'bg-emerald-500', label: 'Normal', desc: 'Within expected range' },
          ].map(item => (
            <div key={item.label} className="flex items-start gap-2">
              <span className={`w-2 h-2 rounded-full mt-0.5 shrink-0 ${item.color}`} />
              <div>
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-wider">{item.label}</p>
                <p className="text-[9px] text-slate-400">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
