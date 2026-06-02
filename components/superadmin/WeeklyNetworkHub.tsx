import React, { useState, useMemo } from 'react';
import { Branch, SalesReport } from '../../types';
import { UI_THEME } from '../../constants/ui_designs';
import { playSound, resumeAudioContext } from '../../lib/audio';
import { toDateStr, parseDate, getISOWeek, getWeekRange } from '@/src/utils/reportUtils';
import { getTrueDate } from '../../lib/time';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface WeeklyNetworkHubProps {
  branches: Branch[];
  salesReports: SalesReport[];
}

export const WeeklyNetworkHub: React.FC<WeeklyNetworkHubProps> = ({ branches, salesReports }) => {
  const [selectedDate, setSelectedDate] = useState<string>(toDateStr(getTrueDate()));
  const [searchTerm, setSearchTerm] = useState('');

  // Calculate the standard week range for the selected date (Monday to Sunday)
  const weekInfo = useMemo(() => {
    const d = parseDate(selectedDate);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const weekNumber = getISOWeek(monday);
    
    return {
      start: monday,
      end: sunday,
      weekNumber,
      label: `WEEK ${weekNumber} (${monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${sunday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})`
    };
  }, [selectedDate]);

  const branchWeeklyStats = useMemo(() => {
    const baseDate = parseDate(selectedDate);

    let stats = branches.map(branch => {
      const { weekStart, weekEnd } = getWeekRange(baseDate, branch);
      const startStr = toDateStr(weekStart);
      const endStr = toDateStr(weekEnd);
      const daysInWeek = Math.round((weekEnd.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      const reports = salesReports.filter(r => 
        r.branchId === branch.id && 
        r.reportDate >= startStr && 
        r.reportDate <= endStr
      );

      const totals = reports.reduce((acc, curr) => ({
        gross: acc.gross + curr.grossSales,
        staffPay: acc.staffPay + curr.totalStaffPay,
        operational: acc.operational + curr.totalExpenses,
        vault: acc.vault + curr.totalVaultProvision,
        net: acc.net + curr.netRoi,
        sessions: acc.sessions + (curr.sessionData?.length || 0),
        reportCount: acc.reportCount + 1
      }), { gross: 0, staffPay: 0, operational: 0, vault: 0, net: 0, sessions: 0, reportCount: 0 });

      return {
        id: branch.id,
        name: branch.name,
        isEnabled: branch.isEnabled,
        periodLabel: `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
        daysInWeek,
        ...totals
      };
    });

    if (searchTerm.trim()) {
      const term = searchTerm.toUpperCase();
      stats = stats.filter(b => b.name.toUpperCase().includes(term));
    }

    return stats.sort((a, b) => b.gross - a.gross);
  }, [branches, salesReports, selectedDate, searchTerm]);

  const networkTotals = useMemo(() => {
    return branchWeeklyStats.reduce((acc, curr) => ({
      gross: acc.gross + curr.gross,
      staffPay: acc.staffPay + curr.staffPay,
      operational: acc.operational + curr.operational,
      vault: acc.vault + curr.vault,
      net: acc.net + curr.net,
      sessions: acc.sessions + curr.sessions,
      reportCount: acc.reportCount + curr.reportCount
    }), { gross: 0, staffPay: 0, operational: 0, vault: 0, net: 0, sessions: 0, reportCount: 0 });
  }, [branchWeeklyStats]);

  const handleDateShift = (weeks: number) => {
    const d = parseDate(selectedDate);
    d.setDate(d.getDate() + (weeks * 7));
    setSelectedDate(toDateStr(d));
    playSound('click');
  };

  const handleExportPDF = () => {
    resumeAudioContext();
    playSound('success');
    
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text('WEEKLY NETWORK SALES REPORT', 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`PERIOD: ${weekInfo.label}`, 14, 28);
    doc.text(`GENERATED AT: ${getTrueDate().toLocaleString()}`, 14, 33);

    const tableData = branchWeeklyStats.map(b => [
      b.name,
      b.reportCount.toString(),
      b.sessions.toString(),
      `P${b.gross.toLocaleString()}`,
      `P${b.staffPay.toLocaleString()}`,
      `P${b.operational.toLocaleString()}`,
      `P${b.vault.toLocaleString()}`,
      `P${b.net.toLocaleString()}`
    ]);

    autoTable(doc, {
      head: [['Branch', 'Days', 'Units', 'Gross', 'Payroll', 'Expenses', 'Vault', 'Net ROI']],
      body: tableData,
      startY: 40,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 50 },
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right', fontStyle: 'bold' }
      }
    });

    doc.save(`Weekly_Network_Report_W${weekInfo.weekNumber}.pdf`);
  };

  return (
    <div className="space-y-6 pb-32">
      {/* COMMAND BAR */}
      <div className={`bg-white p-6 ${UI_THEME.radius.card} border border-slate-200 shadow-sm space-y-6`}>
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-2xl shadow-lg border border-white/10 text-white">📊</div>
            <div>
              <h3 className="text-[14px] font-black text-slate-900 uppercase tracking-tighter text-left">Weekly Network Matrix</h3>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-left">Consolidated Weekly Performance</p>
            </div>
          </div>

          <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner h-14 w-full lg:w-auto">
            <button
              onClick={() => handleDateShift(-1)}
              className="w-12 h-full flex items-center justify-center hover:bg-white hover:shadow-md rounded-xl transition-all text-slate-400 hover:text-indigo-600 active:scale-90"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div className="px-6 text-center">
              <span className="font-bold text-[12px] text-slate-900 uppercase tracking-tight whitespace-nowrap">
                {weekInfo.label}
              </span>
            </div>
            <button
              onClick={() => handleDateShift(1)}
              className="w-12 h-full flex items-center justify-center hover:bg-white hover:shadow-md rounded-xl transition-all text-slate-400 hover:text-indigo-600 active:scale-90"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 group">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <input
              type="text"
              placeholder="SEARCH BRANCH..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-bold uppercase tracking-widest focus:bg-white focus:border-indigo-500 outline-none transition-all shadow-inner"
            />
          </div>
          <button
            onClick={handleExportPDF}
            className="h-14 px-8 rounded-2xl bg-indigo-600 text-white flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Export PDF
          </button>
        </div>
      </div>

      {/* KPI SUMMARY */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className={`p-6 ${UI_THEME.radius.card} bg-slate-900 text-white shadow-lg`}>
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Network Net ROI</p>
          <p className={`text-3xl font-bold mt-2 tabular-nums ${networkTotals.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            ₱{networkTotals.net.toLocaleString()}
          </p>
        </div>
        <div className={`p-6 ${UI_THEME.radius.card} bg-white border border-slate-200 shadow-sm`}>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Gross Yield</p>
          <p className="text-3xl font-bold mt-2 tabular-nums text-slate-900">₱{networkTotals.gross.toLocaleString()}</p>
        </div>
        <div className={`p-6 ${UI_THEME.radius.card} bg-white border border-slate-200 shadow-sm`}>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total Units</p>
          <p className="text-3xl font-bold mt-2 tabular-nums text-indigo-600">{networkTotals.sessions.toLocaleString()}</p>
        </div>
        <div className={`p-6 ${UI_THEME.radius.card} bg-white border border-slate-200 shadow-sm`}>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total Payroll</p>
          <p className="text-3xl font-bold mt-2 tabular-nums text-amber-600">₱{networkTotals.staffPay.toLocaleString()}</p>
        </div>
        <div className={`p-6 ${UI_THEME.radius.card} bg-white border border-slate-200 shadow-sm`}>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total Expenses</p>
          <p className="text-3xl font-bold mt-2 tabular-nums text-rose-500">₱{networkTotals.operational.toLocaleString()}</p>
        </div>
      </div>

      {/* TABLE */}
      <div className={`bg-white ${UI_THEME.radius.card} border border-slate-200 shadow-sm overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Branch</th>
                <th className="px-4 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Days</th>
                <th className="px-4 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Units</th>
                <th className="px-4 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Gross</th>
                <th className="px-4 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Payroll</th>
                <th className="px-4 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Expenses</th>
                <th className="px-4 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Vault/Rent</th>
                <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Net ROI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {branchWeeklyStats.map(b => (
                <tr key={b.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-8 py-5">
                    <p className="font-bold text-slate-900 uppercase text-sm group-hover:text-indigo-600 transition-colors">{b.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">ID: {b.id.slice(0, 8)}</p>
                      <span className="text-[9px] text-slate-300">•</span>
                      <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">{b.periodLabel}</p>
                    </div>
                  </td>
                  <td className="px-4 py-5 text-center">
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-black ${b.reportCount === b.daysInWeek ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                      {b.reportCount}/{b.daysInWeek}
                    </span>
                  </td>
                  <td className="px-4 py-5 text-right font-bold text-slate-900 tabular-nums text-sm">{b.sessions}</td>
                  <td className="px-4 py-5 text-right font-bold text-slate-900 tabular-nums text-sm">₱{b.gross.toLocaleString()}</td>
                  <td className="px-4 py-5 text-right font-semibold text-amber-600 tabular-nums text-sm">₱{b.staffPay.toLocaleString()}</td>
                  <td className="px-4 py-5 text-right font-semibold text-rose-500 tabular-nums text-sm">₱{b.operational.toLocaleString()}</td>
                  <td className="px-4 py-5 text-right font-semibold text-indigo-600 tabular-nums text-sm">₱{b.vault.toLocaleString()}</td>
                  <td className="px-8 py-5 text-right">
                    <span className={`text-base font-black tabular-nums ${b.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {b.net < 0 ? '−' : ''}₱{Math.abs(b.net).toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2 border-slate-200">
              <tr className="font-black">
                <td className="px-8 py-6 text-[11px] uppercase tracking-widest text-slate-900">Network Totals</td>
                <td className="px-4 py-6 text-center text-[11px] text-slate-900">{networkTotals.reportCount}</td>
                <td className="px-4 py-6 text-right text-sm tabular-nums text-slate-900">{networkTotals.sessions}</td>
                <td className="px-4 py-6 text-right text-sm tabular-nums text-slate-900">₱{networkTotals.gross.toLocaleString()}</td>
                <td className="px-4 py-6 text-right text-sm tabular-nums text-amber-600">₱{networkTotals.staffPay.toLocaleString()}</td>
                <td className="px-4 py-6 text-right text-sm tabular-nums text-rose-500">₱{networkTotals.operational.toLocaleString()}</td>
                <td className="px-4 py-6 text-right text-sm tabular-nums text-indigo-600">₱{networkTotals.vault.toLocaleString()}</td>
                <td className="px-8 py-6 text-right text-lg tabular-nums text-indigo-600">₱{networkTotals.net.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
