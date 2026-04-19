import React, { useMemo, useState } from 'react';
import { SalesReport, Branch } from '../../types';
import { playSound, resumeAudioContext } from '../../lib/audio';
import { UI_THEME } from '../../constants/ui_designs';

import { toDateStr } from '@/src/utils/reportUtils';

interface GraphBoardProps {
  salesReports: SalesReport[];
  branches: Branch[];
}

type TimeWindow = '7d' | '30d' | '12m';

interface DetailedPoint {
  date: string;
  label: string;
  gross: number;
  pay: number;
  exp: number;
  vault: number;
  net: number;
}

export const GraphBoard: React.FC<GraphBoardProps> = ({ salesReports, branches }) => {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('7d');
  const [filterBranchId, setFilterBranchId] = useState<string>('all');
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

  const chartData = useMemo(() => {
    const now = new Date();
    const dataPoints: DetailedPoint[] = [];
    
    // Predicate for reports based on current branch filter
    const reportFilter = (r: SalesReport) => filterBranchId === 'all' ? true : r.branchId === filterBranchId;

    if (timeWindow === '7d' || timeWindow === '30d') {
      const days = timeWindow === '7d' ? 7 : 30;
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = toDateStr(d);
        
        const dayReports = salesReports.filter(r => r.reportDate === dateStr && reportFilter(r));
        
        dataPoints.push({
          date: dateStr,
          label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          gross: dayReports.reduce((sum, r) => sum + r.grossSales, 0),
          pay: dayReports.reduce((sum, r) => sum + r.totalStaffPay, 0),
          exp: dayReports.reduce((sum, r) => sum + r.totalExpenses, 0),
          vault: dayReports.reduce((sum, r) => sum + r.totalVaultProvision, 0),
          net: dayReports.reduce((sum, r) => sum + r.netRoi, 0)
        });
      }
    } else {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStr = toDateStr(d).slice(0, 7); // YYYY-MM
        
        const monthReports = salesReports.filter(r => r.reportDate.startsWith(monthStr) && reportFilter(r));
        
        dataPoints.push({
          date: monthStr,
          label: d.toLocaleDateString(undefined, { month: 'short' }),
          gross: monthReports.reduce((sum, r) => sum + r.grossSales, 0),
          pay: monthReports.reduce((sum, r) => sum + r.totalStaffPay, 0),
          exp: monthReports.reduce((sum, r) => sum + r.totalExpenses, 0),
          vault: monthReports.reduce((sum, r) => sum + r.totalVaultProvision, 0),
          net: monthReports.reduce((sum, r) => sum + r.netRoi, 0)
        });
      }
    }
    return dataPoints;
  }, [salesReports, timeWindow, filterBranchId]);

  const stats = useMemo(() => {
    const totalGross = chartData.reduce((s, d) => s + d.gross, 0);
    const totalNet = chartData.reduce((s, d) => s + d.net, 0);
    const totalPay = chartData.reduce((s, d) => s + d.pay, 0);
    const totalExp = chartData.reduce((s, d) => s + d.exp, 0);
    const totalVault = chartData.reduce((s, d) => s + d.vault, 0);
    const maxDay = [...chartData].sort((a, b) => b.gross - a.gross)[0];
    
    return { totalGross, totalNet, totalPay, totalExp, totalVault, maxDay };
  }, [chartData]);

  // SVG Chart Dimensions
  const width = 1000;
  const height = 440;
  const padding = 60;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const maxVal = Math.max(...chartData.map(d => Math.max(d.gross, 1000)));
  
  const getX = (index: number) => padding + (index * (chartWidth / (chartData.length - 1 || 1)));
  const getY = (val: number) => (height - padding) - ((val / maxVal) * chartHeight);

  const salesPath = useMemo(() => {
    if (chartData.length < 2) return "";
    return chartData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.gross)}`).join(' ');
  }, [chartData, maxVal]);

  const netPath = useMemo(() => {
    if (chartData.length < 2) return "";
    return chartData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(Math.max(0, d.net))}`).join(' ');
  }, [chartData, maxVal]);

  const handleWindowChange = (w: TimeWindow) => {
    resumeAudioContext();
    playSound('click');
    setTimeWindow(w);
    setHoveredPoint(null);
  };

  const currentFilterName = useMemo(() => {
      if (filterBranchId === 'all') return 'Network Consolidated';
      return branches.find(b => b.id === filterBranchId)?.name || 'Selected Node';
  }, [filterBranchId, branches]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700 max-w-[1400px] mx-auto pb-32">
      {/* HEADER & CONTROLS */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 border-b border-slate-200 pb-8 px-4 sm:px-2">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-4 py-1.5 rounded-full mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
            <span className="text-[8px] font-semibold uppercase tracking-[0.2em] text-indigo-600">Executive Insight Hub</span>
          </div>
          <h2 className="text-3xl font-semibold text-slate-900 uppercase tracking-tight leading-none">Network Financial Health</h2>
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-widest max-w-md">
            Operational visibility for <span className="text-indigo-600 font-bold">{currentFilterName}</span>.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
          {/* BRANCH SELECTOR */}
          <select 
            value={filterBranchId}
            onChange={(e) => { setFilterBranchId(e.target.value); playSound('click'); }}
            className="bg-slate-100 px-6 py-3 rounded-[18px] text-[10px] font-bold uppercase tracking-widest outline-none border border-slate-200/60 shadow-inner appearance-none cursor-pointer hover:bg-slate-200 transition-colors"
          >
            <option value="all">All Active Branches</option>
            {branches.filter(b => b.isEnabled).map(b => (
                <option key={b.id} value={b.id}>{b.name.replace(/BRANCH - /i, '')}</option>
            ))}
          </select>

          {/* TIMEFRAME SELECTOR */}
          <div className="bg-slate-100 p-1.5 rounded-[22px] flex items-center shadow-inner border border-slate-200/60 overflow-x-auto no-scrollbar">
            {(['7d', '30d', '12m'] as TimeWindow[]).map(w => (
              <button
                key={w}
                onClick={() => handleWindowChange(w)}
                className={`flex-1 min-w-[100px] py-3 px-6 rounded-[18px] text-[10px] font-bold uppercase tracking-widest transition-all duration-300 ${timeWindow === w ? 'bg-white text-slate-900 shadow-md border border-slate-100 scale-[1.03]' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {w === '7d' ? '7 Days' : w === '30d' ? '30 Days' : '12 Months'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* COMPREHENSIVE KPI GRID */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 px-4 sm:px-2">
        <div className="bg-slate-900 p-6 sm:p-8 rounded-[40px] shadow-xl border border-slate-800 relative overflow-hidden group col-span-2 lg:col-span-1">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2"></div>
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest mb-3">Target Revenue</p>
          <p className="text-3xl font-semibold text-white tabular-nums tracking-tighter leading-none">₱{stats.totalGross.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-[40px] shadow-sm border border-slate-100">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-2">Staff Payroll</p>
          <p className="text-xl font-semibold text-amber-600 tabular-nums leading-none">₱{stats.totalPay.toLocaleString()}</p>
          <p className="text-[8px] font-medium text-slate-300 uppercase mt-2 tracking-widest">Comm + Allowance</p>
        </div>
        <div className="bg-white p-6 rounded-[40px] shadow-sm border border-slate-100">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-2">Op Expenses</p>
          <p className="text-xl font-semibold text-rose-500 tabular-nums leading-none">₱{stats.totalExp.toLocaleString()}</p>
          <p className="text-[8px] font-medium text-slate-300 uppercase mt-2 tracking-widest">Daily Outflows</p>
        </div>
        <div className="bg-white p-6 rounded-[40px] shadow-sm border border-slate-100">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-2">Vault Provision</p>
          <p className="text-xl font-semibold text-indigo-700 tabular-nums leading-none">₱{stats.totalVault.toLocaleString()}</p>
          <p className="text-[8px] font-medium text-slate-300 uppercase mt-2 tracking-widest">Rent & Utilities</p>
        </div>
        <div className={`p-6 rounded-[40px] shadow-sm border flex flex-col justify-center col-span-2 lg:col-span-1 ${stats.totalNet >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
          <p className={`text-[10px] font-medium uppercase tracking-widest mb-2 ${stats.totalNet >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>Net Profit (ROI)</p>
          <p className={`text-2xl font-semibold tabular-nums tracking-tighter leading-none ${stats.totalNet >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {stats.totalNet < 0 ? '−' : ''}₱{Math.abs(stats.totalNet).toLocaleString()}
          </p>
        </div>
      </div>

      {/* CHART SECTION */}
      <div className="bg-white p-6 md:p-12 rounded-[56px] border border-slate-100 shadow-sm mx-4 sm:mx-2">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-8">
           <div className="space-y-1">
             <h3 className="text-xl font-semibold text-slate-900 uppercase tracking-tight">The Profit Margin Gap</h3>
             <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Revenue vs Profitability across the chosen window</p>
           </div>
           
           {/* INTERACTIVE LEGEND */}
           <div className="grid grid-cols-2 gap-x-8 gap-y-2">
              <div className="flex items-center gap-3">
                <div className="w-4 h-1 bg-slate-900 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.2)]"></div>
                <div className="flex flex-col">
                    <span className="text-[9px] font-semibold text-slate-900 uppercase tracking-widest leading-none">Gross Yield</span>
                    <span className="text-[7px] font-medium text-slate-400 uppercase tracking-wider mt-1">Sum of selected reports</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-1 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.3)]"></div>
                <div className="flex flex-col">
                    <span className="text-[9px] font-semibold text-emerald-600 uppercase tracking-widest leading-none">Actual Profit</span>
                    <span className="text-[7px] font-medium text-slate-400 uppercase tracking-wider mt-1">Retention after costs</span>
                </div>
              </div>
           </div>
        </div>

        <div className="relative w-full aspect-[21/9] min-h-[340px]">
          {chartData.some(d => d.gross > 0) ? (
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible select-none font-sans">
              {/* Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1].map(tick => {
                const y = getY(maxVal * tick);
                return (
                  <g key={tick} className="opacity-10">
                    <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#64748b" strokeWidth="1" strokeDasharray="5 5" />
                    <text x={padding - 10} y={y + 4} textAnchor="end" className="fill-slate-900 text-[11px] font-medium uppercase">
                      ₱{Math.round((maxVal * tick) / 1000)}k
                    </text>
                  </g>
                );
              })}

              {/* Area under Profit Line */}
              <path 
                  d={`${netPath} L ${getX(chartData.length-1)} ${height-padding} L ${getX(0)} ${height-padding} Z`} 
                  fill="url(#profitGradient)" 
                  className="opacity-20" 
              />

              <defs>
                <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#ffffff" />
                </linearGradient>
              </defs>

              {/* Main Paths */}
              <path d={salesPath} fill="none" stroke="#0f172a" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-sm" />
              <path d={netPath} fill="none" stroke="#10b981" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />

              {/* Hover Guides & Comprehensive Breakdown Points */}
              {chartData.map((d, i) => (
                <g key={i} onMouseEnter={() => setHoveredPoint(i)} onMouseLeave={() => setHoveredPoint(null)} className="cursor-pointer">
                  <rect x={getX(i) - 20} y={padding} width="40" height={chartHeight} fill="transparent" />
                  
                  <circle cx={getX(i)} cy={getY(d.gross)} r={hoveredPoint === i ? "5" : "3"} fill="#0f172a" stroke="white" strokeWidth="2" className="transition-all duration-300" />
                  <circle cx={getX(i)} cy={getY(d.net)} r={hoveredPoint === i ? "5" : "3"} fill="#10b981" stroke="white" strokeWidth="2" className="transition-all duration-300" />
                  
                  {hoveredPoint === i && (
                    <g className="animate-in fade-in zoom-in duration-200">
                      <line x1={getX(i)} y1={padding} x2={getX(i)} y2={height - padding} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 4" />
                      
                      {/* Tooltip Background */}
                      <rect x={getX(i) > width / 2 ? getX(i) - 180 : getX(i) + 20} y={padding} width="160" height="220" rx="20" fill="#0f172a" className="shadow-2xl" />
                      
                      {/* Tooltip Content */}
                      <g transform={`translate(${getX(i) > width / 2 ? getX(i) - 165 : getX(i) + 35}, ${padding + 25})`}>
                        <text className="fill-slate-400 text-[9px] font-medium uppercase tracking-widest">{d.label}</text>
                        <text y="22" className="fill-white text-[13px] font-semibold uppercase tracking-tight">Audit Summary</text>
                        
                        <g transform="translate(0, 45)">
                           <text className="fill-emerald-400 text-[8px] font-semibold uppercase tracking-widest">Revenue</text>
                           <text y="16" className="fill-white text-[13px] font-medium tabular-nums">₱{d.gross.toLocaleString()}</text>
                        </g>

                        <g transform="translate(0, 85)">
                           <text className="fill-amber-400 text-[8px] font-semibold uppercase tracking-widest">Staff Pay</text>
                           <text y="14" className="fill-slate-300 text-[12px] font-medium tabular-nums">₱{d.pay.toLocaleString()}</text>
                        </g>

                        <g transform="translate(0, 115)">
                           <text className="fill-rose-400 text-[8px] font-semibold uppercase tracking-widest">Operational</text>
                           <text y="14" className="fill-slate-300 text-[12px] font-medium tabular-nums">₱{d.exp.toLocaleString()}</text>
                        </g>

                        <g transform="translate(0, 145)">
                           <text className="fill-indigo-400 text-[8px] font-semibold uppercase tracking-widest">Vault Prov</text>
                           <text y="14" className="fill-slate-300 text-[12px] font-medium tabular-nums">₱{d.vault.toLocaleString()}</text>
                        </g>

                        <rect y="165" width="130" height="1" fill="#ffffff" opacity="0.1" />

                        <g transform="translate(0, 185)">
                           <text className="fill-emerald-400 text-[8px] font-semibold uppercase tracking-widest">Net ROI</text>
                           <text y="16" className="fill-emerald-300 text-[15px] font-semibold tabular-nums">₱{d.net.toLocaleString()}</text>
                        </g>
                      </g>
                    </g>
                  )}

                  {/* X-Axis Labels */}
                  {(timeWindow === '7d' || i % 5 === 0 || timeWindow === '12m') && (
                    <text x={getX(i)} y={height - 20} textAnchor="middle" className={`text-[10px] font-medium uppercase tracking-tight transition-colors duration-300 ${hoveredPoint === i ? 'fill-emerald-600' : 'fill-slate-300'}`}>
                      {d.label}
                    </text>
                  )}
                </g>
              ))}
            </svg>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center opacity-20">
               <div className="text-6xl mb-4">📉</div>
               <p className="text-[11px] font-bold uppercase tracking-[0.4em]">No indexed data for this scope</p>
            </div>
          )}
        </div>

        <div className="mt-8 flex justify-center">
            <p className="text-[9px] font-medium text-slate-300 uppercase tracking-[0.4em] italic text-center max-w-lg">
                Visualizing multi-node retention. Points represent synchronized daily ledger batches.
            </p>
        </div>
      </div>

      {/* BRANCH DISTRIBUTION RANKING */}
      <div className="bg-white rounded-[56px] border border-slate-100 shadow-sm overflow-hidden mx-4 sm:mx-2">
        <div className="p-8 md:p-12 border-b border-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50/50 gap-4">
          <div className="space-y-1">
            <h3 className="text-xl font-semibold text-slate-900 uppercase tracking-tight">Terminal Yield Ranking</h3>
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Branch contribution for the current {timeWindow === '7d' ? 'week' : timeWindow === '30d' ? 'month' : 'year'}</p>
          </div>
          <span className="bg-slate-900 text-white px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-lg">
            {branches.length} Physical Nodes Syncing
          </span>
        </div>

        <div className="divide-y divide-slate-50">
          {branches
            .map(b => {
              const bReports = salesReports.filter(r => {
                if (timeWindow === '7d') {
                  const d = new Date(); d.setDate(d.getDate() - 7);
                  return r.branchId === b.id && r.reportDate >= d.toISOString().split('T')[0];
                }
                if (timeWindow === '30d') {
                  const d = new Date(); d.setDate(d.getDate() - 30);
                  return r.branchId === b.id && r.reportDate >= d.toISOString().split('T')[0];
                }
                const d = new Date(); d.setFullYear(d.getFullYear() - 1);
                return r.branchId === b.id && r.reportDate >= d.toISOString().split('T')[0];
              });
              const sales = bReports.reduce((s, r) => s + r.grossSales, 0);
              const net = bReports.reduce((s, r) => s + r.netRoi, 0);
              return { ...b, sales, net };
            })
            .sort((a, b) => b.sales - a.sales)
            .map((b, idx) => (
              <div key={b.id} className="p-8 md:p-10 flex items-center justify-between hover:bg-slate-50/50 transition-all group">
                <div className="flex items-center gap-6 sm:gap-8 min-w-0 flex-1">
                  <span className="hidden sm:block text-slate-100 font-medium text-2xl w-10 text-center shrink-0">{idx + 1}</span>
                  <div className={`w-12 h-12 rounded-[18px] flex items-center justify-center text-xl shadow-inner shrink-0 group-hover:scale-110 transition-transform ${b.sales > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-200 grayscale'}`}>
                    {idx === 0 && b.sales > 0 ? '🏆' : '🏢'}
                  </div>
                  <div className="min-w-0 pr-4">
                    <h4 className="font-semibold text-slate-900 uppercase text-base tracking-tight truncate group-hover:text-emerald-700 transition-colors leading-none mb-2">{b.name}</h4>
                    <div className="flex items-center gap-3">
                       <span className={`text-[8px] font-medium uppercase px-2 py-0.5 rounded border ${b.isEnabled ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-500 border-rose-100'}`}>
                         {b.isEnabled ? 'Active Node' : 'Suspended'}
                       </span>
                       {b.sales > 0 && (
                         <div className="h-1 w-24 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                            <div className="h-full bg-emerald-500" style={{ width: `${(b.sales / stats.totalGross) * 100}%` }}></div>
                         </div>
                       )}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xl font-semibold text-slate-900 tabular-nums tracking-tighter">₱{b.sales.toLocaleString()}</p>
                  <p className={`text-[9px] font-medium uppercase tracking-widest mt-1 ${b.net >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {b.net < 0 ? '−' : ''}₱{Math.abs(b.net).toLocaleString()} P/L
                  </p>
                </div>
              </div>
            ))
          }
        </div>
      </div>
      
      <div className="flex flex-col items-center gap-3 py-10 opacity-20 group">
        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.4em]">Mainframe Analytics v5.5</p>
      </div>
    </div>
  );
};
