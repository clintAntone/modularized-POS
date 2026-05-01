import React, { useState, useMemo } from 'react';
import { Branch, SalesReport } from '../../../types';
import { playSound, resumeAudioContext } from '../../../lib/audio';

interface HeatmapSectionProps {
  branch: Branch;
  salesReports: SalesReport[];
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const getHeatColor = (net: number, gross: number, active: boolean) => {
  if (gross === 0) return active ? 'bg-slate-200 border-slate-300 text-slate-600' : 'bg-slate-50 text-slate-300 border-slate-100';
  if (net < 0)    return active ? 'bg-rose-500 text-white border-rose-600'        : 'bg-rose-100 text-rose-700 border-rose-200';
  if (net < 2000) return active ? 'bg-emerald-400 text-white border-emerald-500'  : 'bg-emerald-50 text-emerald-600 border-emerald-100';
  if (net < 5000) return active ? 'bg-emerald-500 text-white border-emerald-600'  : 'bg-emerald-200 text-emerald-800 border-emerald-300';
  return active ? 'bg-emerald-700 text-white border-emerald-800 shadow-lg' : 'bg-emerald-600 text-white border-emerald-700';
};

export const HeatmapSection: React.FC<HeatmapSectionProps> = ({ branch, salesReports }) => {
  const now = new Date();
  const [heatMonth, setHeatMonth] = useState(now.getMonth());
  const [heatYear,  setHeatYear]  = useState(now.getFullYear());
  const [activeDay, setActiveDay] = useState<string | null>(null);

  const branchReports = useMemo(
    () => salesReports.filter(r => r.branchId === branch.id),
    [salesReports, branch.id]
  );

  const availableYears = useMemo(() => {
    const s = new Set<number>([now.getFullYear()]);
    branchReports.forEach(r => s.add(new Date(r.reportDate).getFullYear()));
    return Array.from(s).sort((a, b) => b - a);
  }, [branchReports]);

  const dailyStats = useMemo(() => {
    const stats: Record<string, { gross: number; net: number; salary: number; expenses: number; vault: number }> = {};
    branchReports.forEach(r => {
      if (!stats[r.reportDate]) stats[r.reportDate] = { gross: 0, net: 0, salary: 0, expenses: 0, vault: 0 };
      stats[r.reportDate].gross    += r.grossSales;
      stats[r.reportDate].net      += r.netRoi;
      stats[r.reportDate].salary   += r.totalStaffPay;
      stats[r.reportDate].expenses += r.totalExpenses;
      stats[r.reportDate].vault    += r.totalVaultProvision;
    });
    return stats;
  }, [branchReports]);

  const daysInMonth = useMemo(() => new Date(heatYear, heatMonth + 1, 0).getDate(), [heatYear, heatMonth]);
  const startDay    = useMemo(() => new Date(heatYear, heatMonth, 1).getDay(),       [heatYear, heatMonth]);

  // Month stats summary
  const monthSummary = useMemo(() => {
    const prefix = `${heatYear}-${String(heatMonth + 1).padStart(2, '0')}`;
    let gross = 0, net = 0, salary = 0, expenses = 0, vault = 0, days = 0;
    Object.keys(dailyStats).forEach(date => {
      const d = dailyStats[date];
      if (date.startsWith(prefix)) { gross += d.gross; net += d.net; salary += d.salary; expenses += d.expenses; vault += d.vault; days++; }
    });
    return { gross, net, salary, expenses, vault, days };
  }, [dailyStats, heatMonth, heatYear]);

  return (
    <div className="space-y-4 animate-in fade-in duration-700 pb-20">

      {/* Header */}
      <div className="bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-black text-slate-900 uppercase tracking-tighter leading-none">Performance Heatmap</h3>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              {branch.name.replace(/BRANCH\s*-\s*/i, '')}
            </p>
          </div>

          {/* Month / Year selectors */}
          <div className="flex items-center gap-2">
            <select
              value={heatMonth}
              onChange={e => { setHeatMonth(Number(e.target.value)); setActiveDay(null); }}
              className="h-9 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-black text-slate-900 uppercase tracking-tight outline-none cursor-pointer appearance-none focus:border-slate-400"
            >
              {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select
              value={heatYear}
              onChange={e => { setHeatYear(Number(e.target.value)); setActiveDay(null); }}
              className="h-9 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-black text-slate-400 outline-none cursor-pointer appearance-none focus:border-slate-400"
            >
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* Month summary pills */}
        {monthSummary.days > 0 && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Days</span>
              <span className="text-[11px] font-black text-slate-900">{monthSummary.days}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Gross</span>
              <span className="text-[11px] font-black text-slate-900">₱{monthSummary.gross.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Payroll</span>
              <span className="text-[11px] font-black text-slate-900">₱{monthSummary.salary.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Expenses</span>
              <span className="text-[11px] font-black text-slate-900">₱{monthSummary.expenses.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Vault</span>
              <span className="text-[11px] font-black text-slate-900">₱{monthSummary.vault.toLocaleString()}</span>
            </div>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${monthSummary.net >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
              <span className={`text-[8px] font-black uppercase tracking-widest ${monthSummary.net >= 0 ? 'text-emerald-500' : 'text-rose-400'}`}>Net ROI</span>
              <span className={`text-[11px] font-black ${monthSummary.net >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>₱{monthSummary.net.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>

      {/* Calendar */}
      <div className="bg-white p-4 sm:p-6 rounded-[28px] border border-slate-100 shadow-sm">

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5 mb-1.5">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} className="text-center py-1 text-[8px] sm:text-[9px] font-black text-slate-300 uppercase tracking-widest">{d}</div>
          ))}
        </div>

        {/* Calendar cells */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
          {/* Empty cells before month starts */}
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
                className={`aspect-square rounded-xl sm:rounded-2xl border transition-all duration-200 flex flex-col items-center justify-center gap-0.5 active:scale-90 ${col}`}
              >
                <span className={`text-[10px] sm:text-sm font-black leading-none ${isAct ? 'scale-125' : ''}`}>{day}</span>
                {data && (
                  <span className="text-[6px] sm:text-[7px] font-black opacity-80 hidden sm:block">
                    ₱{(data.net / 1000).toFixed(1)}k
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mt-5 pt-4 border-t border-slate-100 flex-wrap">
          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Legend</span>
          {[
            { col: 'bg-slate-50 border-slate-100',         label: 'No data' },
            { col: 'bg-emerald-50 border-emerald-100',     label: 'Low' },
            { col: 'bg-emerald-200 border-emerald-300',    label: 'Good' },
            { col: 'bg-emerald-600 border-emerald-700',    label: 'High' },
            { col: 'bg-rose-100 border-rose-200',          label: 'Loss' },
          ].map(({ col, label }) => (
            <div key={label} className="flex items-center gap-1">
              <div className={`w-3 h-3 rounded border ${col}`} />
              <span className="text-[8px] font-bold text-slate-400">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Day detail */}
      {activeDay && dailyStats[activeDay] && (
        <div className="bg-slate-900 rounded-[28px] p-5 sm:p-7 text-white animate-in slide-in-from-bottom-4 duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/10 blur-3xl rounded-full pointer-events-none" />
          <div className="flex justify-between items-start mb-5 relative z-10">
            <div>
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{activeDay}</p>
              <h4 className="text-lg font-black uppercase tracking-tight mt-0.5">
                {new Date(activeDay + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
              </h4>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${dailyStats[activeDay].net >= 0 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
                {dailyStats[activeDay].net >= 0 ? 'Profitable' : 'Loss Day'}
              </span>
              <button onClick={() => setActiveDay(null)} className="text-slate-500 hover:text-white transition-colors p-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 relative z-10">
            <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2">Gross Sales</p>
              <p className="text-2xl font-black tabular-nums">₱{dailyStats[activeDay].gross.toLocaleString()}</p>
            </div>
            <div className={`p-4 rounded-2xl border ${dailyStats[activeDay].net >= 0 ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-rose-500/5 border-rose-500/10'}`}>
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2">Net ROI</p>
              <p className={`text-2xl font-black tabular-nums ${dailyStats[activeDay].net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                ₱{dailyStats[activeDay].net.toLocaleString()}
              </p>
            </div>
            <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2">Payroll</p>
              <p className="text-xl font-black tabular-nums text-slate-300">₱{dailyStats[activeDay].salary.toLocaleString()}</p>
            </div>
            <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2">Expenses</p>
              <p className="text-xl font-black tabular-nums text-slate-300">₱{dailyStats[activeDay].expenses.toLocaleString()}</p>
            </div>
            <div className="col-span-2 bg-white/5 p-4 rounded-2xl border border-white/5">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2">Vault Provision</p>
              <p className="text-xl font-black tabular-nums text-slate-300">₱{dailyStats[activeDay].vault.toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {monthSummary.days === 0 && (
        <div className="bg-white rounded-[28px] p-16 text-center border border-slate-100">
          <p className="text-4xl opacity-20 mb-4">📅</p>
          <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">No reports for {MONTHS[heatMonth]} {heatYear}</p>
        </div>
      )}
    </div>
  );
};
