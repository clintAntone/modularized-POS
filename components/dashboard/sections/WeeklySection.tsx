
import React, { useState, useMemo } from 'react';
import { Branch, SalesReport } from '../../../types';

interface WeeklySectionProps {
  branch: Branch;
  salesReports: SalesReport[];
  cycles: any[];
}

export const WeeklySection: React.FC<WeeklySectionProps> = ({ branch, salesReports, cycles }) => {
  const [selectedCycleId, setSelectedCycleId] = useState<number | null>(null);

  const getLocalDateStr = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const processedCycles = useMemo(() => {
    const now = new Date();
    const filteredReports = salesReports.filter(r => r.branchId === branch.id);

    return cycles.map(cycle => {
      const cycleStartStr = getLocalDateStr(new Date(cycle.startDate));
      const cycleEndStr = getLocalDateStr(new Date(cycle.endDate));

      const updatedDays = [];
      for (let i = 0; i < 7; i++) {
        const dayDate = new Date(cycle.startDate);
        dayDate.setDate(dayDate.getDate() + i);
        const dStr = getLocalDateStr(dayDate);

        // Fetch finalized data from sales_reports
        const report = filteredReports.find(r => r.reportDate === dStr);

        updatedDays.push({ 
          date: dStr, 
          gross: report ? report.grossSales : 0, 
          comm: report ? report.totalStaffPay : 0, 
          exp: report ? report.totalExpenses : 0, 
          vault: report ? report.totalVaultProvision : 0, 
          net: report ? report.netRoi : 0,
          isFinalized: !!report
        });
      }

      const gross = updatedDays.reduce((s, d) => s + d.gross, 0);
      const comm = updatedDays.reduce((s, d) => s + d.comm, 0);
      const exp = updatedDays.reduce((s, d) => s + d.exp, 0);
      const vaultTotal = updatedDays.reduce((s, d) => s + d.vault, 0);
      const isCurrent = now >= cycle.startDate && now <= cycle.endDate;

      return {
        ...cycle,
        days: updatedDays,
        gross,
        comm,
        exp,
        vaultTotal,
        net: gross - comm - exp - vaultTotal,
        isCurrent
      };
    });
  }, [cycles, salesReports, branch.id]);

  const selectedCycle = processedCycles.find(c => c.id === selectedCycleId);

  const exportCSV = (cycle: any) => {
    const headers = ["Week", "Date", "Status", "Gross Sales", "Staff Salaries", "Op Expenses", "R&B Provision", "ROI"];
    const rows = cycle.days.map((d: any) => [cycle.id, d.date, d.isFinalized ? "FINALIZED" : "PENDING", d.gross, d.comm, d.exp, d.vault, d.net]);
    rows.push(["TOTAL", `${cycle.start} - ${cycle.end}`, "-", cycle.gross, cycle.comm, cycle.exp, cycle.vaultTotal, cycle.net]);

    const csvContent = headers.join(",") + "\n" + rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Week_${cycle.id}_Summary.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const WeeklyChart = ({ days }: { days: any[] }) => {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const width = 400;
    const height = 200;
    const padding = 35;

    const allValues = days.flatMap(d => [d.gross, d.comm, d.exp + d.vault, d.net]);
    const maxValue = Math.max(...allValues, 1000);
    const minValue = Math.min(...allValues, 0);
    const range = maxValue - minValue;

    const getX = (index: number) => padding + (index * (width - padding * 2) / 6);
    
    const getY = (val: number) => {
      const normalizedVal = (val - minValue) / range;
      return (height - padding) - (normalizedVal * (height - padding * 2));
    };

    const createPath = (key: 'gross' | 'comm' | 'exp' | 'net') => {
      return days.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d[key])}`).join(' ');
    };

    const zeroY = getY(0);

    return (
      <div className="bg-white p-4 sm:p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 sm:gap-6 px-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-slate-900"></div>
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Gross</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-amber-500"></div>
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Final Pay</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-rose-500"></div>
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">OpEx</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-indigo-600"></div>
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">R&B</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-emerald-500"></div>
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">ROI</span>
          </div>
        </div>

        <div className="relative w-full aspect-[4/3] sm:aspect-[3/1]">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible select-none">
            {[0, 0.25, 0.5, 0.75, 1].map(tick => {
              const val = minValue + (range * tick);
              return (
                <line 
                  key={tick}
                  x1={padding} y1={getY(val)} x2={width - padding} y2={getY(val)}
                  stroke="#f8fafc" strokeWidth="1"
                />
              );
            })}
            
            {minValue < 0 && (
              <line 
                x1={padding} y1={zeroY} x2={width - padding} y2={zeroY}
                stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 4"
              />
            )}
            
            <path d={createPath('gross')} fill="none" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d={createPath('comm')} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d={createPath('exp')} fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d={createPath('net')} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 2" />

            {days.map((_, i) => (
              <rect
                key={i}
                x={getX(i) - 20}
                y={0}
                width="40"
                height={height - padding}
                fill="transparent"
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                className="cursor-crosshair"
              />
            ))}
            
            {hoveredIndex !== null && (
              <g className="pointer-events-none">
                <line x1={getX(hoveredIndex)} y1={0} x2={getX(hoveredIndex)} y2={height-padding} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />
                <circle cx={getX(hoveredIndex)} cy={getY(days[hoveredIndex].gross)} r="4" fill="#0f172a" stroke="white" strokeWidth="2" />
                <circle cx={getX(hoveredIndex)} cy={getY(days[hoveredIndex].net)} r="4" fill="#10b981" stroke="white" strokeWidth="2" />
              </g>
            )}

            {days.map((d, i) => (
              <text 
                key={i} 
                x={getX(i)} 
                y={height - 10} 
                textAnchor="middle" 
                style={{ fontSize: '10px' }}
                className={`font-black uppercase transition-colors duration-200 ${hoveredIndex === i ? 'fill-slate-900' : 'fill-slate-300'}`}
              >
                {new Date(d.date).toLocaleDateString(undefined, { weekday: 'short' }).charAt(0)}
              </text>
            ))}
          </svg>
        </div>
      </div>
    );
  };

  if (selectedCycle) {
    return (
      <div className="max-w-screen-md mx-auto space-y-6 animate-in fade-in duration-300 pb-12 px-2">
        <button onClick={() => setSelectedCycleId(null)} className="no-print flex items-center gap-2 text-[10px] font-black uppercase text-slate-500 bg-white border border-slate-200 px-5 py-3 rounded-full hover:bg-slate-50 transition-all">← Back to cycles</button>
        
        <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-2xl">
          <div className="p-6 sm:p-10 border-b bg-slate-50/50 backdrop-blur-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
              <div>
                <h3 className="text-2xl sm:text-3xl font-black text-slate-900 uppercase tracking-tighter">Week {selectedCycle.id} (Finalized)</h3>
                <p className="text-[10px] text-slate-400 font-black uppercase mt-1 tracking-widest">{selectedCycle.start} - {selectedCycle.end}</p>
              </div>
              <button onClick={() => exportCSV(selectedCycle)} className="no-print w-full sm:w-auto bg-slate-900 text-white p-4 rounded-2xl active:scale-95 flex items-center justify-center gap-2 px-8 text-[10px] font-black uppercase tracking-widest shadow-xl">CSV Export</button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-10">
              <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
                <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Gross Sales</p>
                <p className="text-lg font-black text-slate-900 tracking-tighter">₱{selectedCycle.gross.toLocaleString()}</p>
              </div>
              <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
                <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Staff Payout</p>
                <p className="text-lg font-black text-amber-600 tracking-tighter">₱{selectedCycle.comm.toLocaleString()}</p>
              </div>
              <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
                <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Expenses</p>
                <p className="text-lg font-black text-rose-600 tracking-tighter">₱{selectedCycle.exp.toLocaleString()}</p>
              </div>
              <div className="bg-indigo-50 p-4 rounded-3xl border border-indigo-100 shadow-sm">
                <p className="text-[7px] font-black text-indigo-700 uppercase tracking-widest mb-1">R&B Reserve</p>
                <p className="text-lg font-black text-indigo-800 tracking-tighter">₱{selectedCycle.vaultTotal.toLocaleString()}</p>
              </div>
              <div className={`p-4 rounded-3xl border shadow-sm ${selectedCycle.net >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                <p className={`text-[7px] font-black uppercase tracking-widest mb-1 ${selectedCycle.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>ROI</p>
                <p className={`text-lg font-black tracking-tighter ${selectedCycle.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {selectedCycle.net < 0 ? '−' : ''}₱{Math.abs(selectedCycle.net).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
          
          <div className="p-4 sm:p-10">
            <WeeklyChart days={selectedCycle.days} />
          </div>

          <div className="overflow-x-auto no-scrollbar border-t">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="text-[9px] font-black text-slate-900 uppercase tracking-[0.2em] bg-slate-100 border-b border-slate-200">
                  <th className="px-8 py-6">Day / Date</th>
                  <th className="px-8 py-6 text-center">Status</th>
                  <th className="px-8 py-6 text-right">Gross</th>
                  <th className="px-8 py-6 text-right">Payroll</th>
                  <th className="px-8 py-6 text-right">OpEx</th>
                  <th className="px-8 py-6 text-right bg-indigo-50/30 text-indigo-700">R&B</th>
                  <th className="px-8 py-6 text-right bg-emerald-50/30 text-emerald-700">ROI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedCycle.days.map((day: any) => {
                  const dateParts = day.date.split('-');
                  const dateObj = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
                  return (
                    <tr key={day.date} className="group hover:bg-slate-50/50 transition-all duration-200">
                      <td className="px-8 py-6">
                        <div className="flex flex-col">
                          <span className="font-black text-slate-900 text-[11px] uppercase tracking-tight">{dateObj.toLocaleDateString(undefined, { weekday: 'long' })}</span>
                          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-center">
                         <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${day.isFinalized ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400 animate-pulse'}`}>
                            {day.isFinalized ? 'Finalized' : 'Pending'}
                         </span>
                      </td>
                      <td className="px-8 py-6 text-right font-bold text-slate-900 text-sm tracking-tight">₱{day.gross.toLocaleString()}</td>
                      <td className="px-8 py-6 text-right font-bold text-amber-600 text-sm tracking-tight">₱{day.comm.toLocaleString()}</td>
                      <td className="px-8 py-6 text-right font-bold text-rose-500 text-sm tracking-tight">₱{day.exp.toLocaleString()}</td>
                      <td className="px-8 py-6 text-right font-black text-indigo-700 text-sm bg-indigo-50/10">₱{day.vault.toLocaleString()}</td>
                      <td className={`px-8 py-6 text-right font-black text-sm tracking-tighter bg-emerald-50/10 ${day.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {day.net < 0 ? '−' : ''}₱{Math.abs(day.net).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-4 border-slate-900 bg-slate-900 text-white">
                <tr className="divide-x divide-white/5">
                  <td colSpan={2} className="px-8 py-8">
                    <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Weekly Totals</span>
                    <span className="text-xs font-black uppercase tracking-widest">Aggregate Archive</span>
                  </td>
                  <td className="px-8 py-8 text-right">
                    <span className="text-[12px] font-black tracking-tighter">₱{selectedCycle.gross.toLocaleString()}</span>
                  </td>
                  <td className="px-8 py-8 text-right">
                    <span className="text-[12px] font-black tracking-tighter text-amber-400">₱{selectedCycle.comm.toLocaleString()}</span>
                  </td>
                  <td className="px-8 py-8 text-right">
                    <span className="text-[12px] font-black tracking-tighter text-rose-400">₱{selectedCycle.exp.toLocaleString()}</span>
                  </td>
                  <td className="px-8 py-8 text-right bg-indigo-900/40">
                    <span className="text-[16px] font-black tracking-tighter text-indigo-200">₱{selectedCycle.vaultTotal.toLocaleString()}</span>
                  </td>
                  <td className="px-8 py-8 text-right bg-emerald-900/50">
                    <span className={`text-[20px] font-black tracking-tighter ${selectedCycle.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {selectedCycle.net < 0 ? '−' : ''}₱{Math.abs(selectedCycle.net).toLocaleString()}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-screen-md mx-auto space-y-6 no-print pb-24 px-2">
      <div className="px-4 space-y-1.5">
        <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none">Weekly Archive</h2>
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Historical finalized performance data</p>
      </div>
      
      <div className="grid gap-3">
        {processedCycles.filter(c => !c.isFuture).reverse().map((cycle) => (
          <div 
            key={cycle.id} 
            onClick={() => setSelectedCycleId(cycle.id)} 
            className={`p-4 md:p-6 rounded-[32px] border shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 group cursor-pointer transition-all active:scale-[0.98] hover:shadow-xl ${cycle.isCurrent ? 'bg-white border-emerald-500 ring-1 ring-emerald-500/10' : 'bg-white border-slate-100 hover:border-emerald-500'}`}
          >
            <div className="flex items-center gap-4 md:gap-6 w-full md:w-auto">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-slate-50 flex items-center justify-center font-black transition-all text-lg shrink-0 shadow-inner ${cycle.isCurrent ? 'bg-emerald-600 text-white' : 'bg-slate-50 text-slate-300 group-hover:bg-emerald-600 group-hover:text-white'}`}>
                {cycle.id}
              </div>
              <div className="space-y-0.5">
                <h3 className={`font-black text-lg md:text-xl uppercase tracking-tighter leading-none transition-colors ${cycle.isCurrent ? 'text-emerald-700' : 'text-slate-900 group-hover:text-emerald-700'}`}>Week {cycle.id}</h3>
                <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest">{cycle.start} — {cycle.end}</p>
              </div>
            </div>
            
            <div className="w-full md:flex-1 grid grid-cols-2 sm:grid-cols-5 gap-3 pt-4 md:pt-0 border-t md:border-t-0 border-slate-50">
              <div className="text-left md:text-center">
                <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Gross</p>
                <p className="text-sm font-black text-slate-900">₱{cycle.gross.toLocaleString()}</p>
              </div>
              <div className="text-left md:text-center">
                <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Pay</p>
                <p className="text-sm font-black text-amber-600">₱{cycle.comm.toLocaleString()}</p>
              </div>
              <div className="text-left md:text-center">
                <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Expenses</p>
                <p className="text-sm font-black text-rose-600">₱{cycle.exp.toLocaleString()}</p>
              </div>
              <div className="text-left md:text-center">
                <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">R&B</p>
                <p className="text-sm font-black text-indigo-600">₱{cycle.vaultTotal.toLocaleString()}</p>
              </div>
              <div className="text-left md:text-right">
                <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">ROI</p>
                <p className={`text-sm font-black ${cycle.net >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {cycle.net < 0 ? '−' : ''}₱{Math.abs(cycle.net).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
