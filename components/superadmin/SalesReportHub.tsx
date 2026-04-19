import React, { useState, useMemo } from 'react';
import { Branch, SalesReport } from '../../types';
import { playSound } from '../../lib/audio';
import { UI_THEME } from '../../constants/ui_designs';
import { ReportEditorModal } from './ReportEditorModal';
import { toDateStr, getWeekRange } from '@/src/utils/reportUtils';
import { BranchCheckboxDropdown } from '../shared/BranchCheckboxDropdown';

interface CycleStats {
  id: string;
  branchId: string;
  name: string;
  label: string;
  scope: string;
  displayDate: string;
  dateRange: { start: string; end: string };
  gross: number;
  salary: number;
  expenses: number;
  vault: number;
  net: number;
  isActive: boolean;
  rawReport?: SalesReport;
}

interface SalesReportHubProps {
  branches: Branch[];
  salesReports: SalesReport[];
}

type CycleView = 'daily' | 'weekly' | 'batch';

export const SalesReportHub: React.FC<SalesReportHubProps> = ({ branches, salesReports }) => {
  const [view, setView] = useState<CycleView>('daily');
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [drilldownReport, setDrilldownReport] = useState<SalesReport | null>(null);

  const getLocalDateStr = (date: Date) => toDateStr(date);

  const currentData = useMemo(() => {
    const now = new Date();
    const todayStr = getLocalDateStr(now);

    const aggregateReports = (reports: SalesReport[], labelPrefix: string, isConsolidated: boolean) => {
      if (view === 'daily') {
        const groupedByDate: Record<string, CycleStats> = {};
        reports.forEach(r => {
          const isBackfill = r.sortDate === 'BACKFILL RECORDS - Re:INCOMPLETE REPORT' || r.id.includes('_BACKFILL_');
          const groupKey = isBackfill 
            ? `${r.reportDate}_BACKFILL` 
            : r.reportDate;

          if (!groupedByDate[groupKey]) {
            groupedByDate[groupKey] = {
              id: `daily-${groupKey}`,
              branchId: isConsolidated ? 'all' : r.branchId,
              name: isBackfill
                ? 'BACKFILL RECORDS - Re:INCOMPLETE REPORT'
                : (isConsolidated ? 'NETWORK CONSOLIDATED' : (branches.find(b => b.id === r.branchId)?.name || 'BRANCH NODE')),
              label: isBackfill ? 'BACKFILL LEDGER' : 'DAILY LEDGER',
              scope: r.reportDate,
              displayDate: new Date(r.reportDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
              dateRange: { start: r.reportDate, end: r.reportDate },
              gross: 0, salary: 0, expenses: 0, vault: 0, net: 0,
              isActive: r.reportDate === todayStr && !isBackfill,
              rawReport: isConsolidated ? undefined : r
            };
          }
          const group = groupedByDate[groupKey];
          group.gross += r.grossSales;
          group.salary += r.totalStaffPay;
          const expensesTotal = (r.expenseData || []).reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
          const vaultTotal = (r.vaultData || []).reduce((sum: number, v: any) => sum + (Number(v.amount) || 0), 0);
          group.expenses += expensesTotal;
          group.vault += vaultTotal;
          group.net += (r.grossSales - r.totalStaffPay - expensesTotal - vaultTotal);
        });
        return Object.values(groupedByDate).sort((a, b) => (b.scope || '').localeCompare(a.scope || ''));
      }

      if (view === 'weekly') {
        const groupedByWeek: Record<string, CycleStats> = {};
        
        reports.forEach(r => {
          const d = new Date(r.reportDate);
          const target = branches.find(b => b.id === r.branchId)!;
          if (!target) return;
          
          const { weekStart, weekEnd, label: weekLabel } = getWeekRange(d, target);
          const startStr = toDateStr(weekStart);
          const endStr = toDateStr(weekEnd);
          const key = isConsolidated ? `${startStr}_${endStr}` : `${r.branchId}_${startStr}_${endStr}`;

          if (!groupedByWeek[key]) {
            groupedByWeek[key] = {
              id: `weekly-${key}`,
              branchId: isConsolidated ? 'all' : r.branchId,
              name: isConsolidated ? 'NETWORK CONSOLIDATED' : (target.name || 'BRANCH NODE'),
              label: 'WEEKLY LEDGER',
              scope: `${startStr} to ${endStr}`,
              displayDate: weekLabel,
              dateRange: { start: startStr, end: endStr },
              gross: 0, salary: 0, expenses: 0, vault: 0, net: 0,
              isActive: now >= weekStart && now <= weekEnd
            };
          }
          const group = groupedByWeek[key];
          group.gross += r.grossSales;
          group.salary += r.totalStaffPay;
          const expensesTotal = (r.expenseData || []).reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
          const vaultTotal = (r.vaultData || []).reduce((sum: number, v: any) => sum + (Number(v.amount) || 0), 0);
          group.expenses += expensesTotal;
          group.vault += vaultTotal;
          group.net += (r.grossSales - r.totalStaffPay - expensesTotal - vaultTotal);
        });

        return Object.values(groupedByWeek).sort((a, b) => b.dateRange.start.localeCompare(a.dateRange.start));
      }

      if (view === 'batch') {
        if (reports.length === 0) return [];

        const targetBranch = isConsolidated ? null : branches.find(b => b.id === reports[0].branchId);
        const anchorStr = targetBranch?.cycleStartDate || `${new Date().getFullYear()}-01-01`;
        const [ay, am, ad] = anchorStr.split('-').map(Number);
        let iter = new Date(ay, am - 1, ad, 0, 0, 0, 0);

        const earliestDate = reports.reduce((earliest, r) => r.reportDate < earliest ? r.reportDate : earliest, reports[0].reportDate);
        const earliestD = new Date(earliestDate);
        if (earliestD < iter) {
          iter = new Date(earliestD);
          iter.setDate(iter.getDate() - iter.getDay());
          iter.setHours(0, 0, 0, 0);
        }

        const results: CycleStats[] = [];
        let index = 1;

        while (iter <= now) {
          const cycleStart = new Date(iter);
          const cycleEnd = new Date(iter);

          cycleEnd.setDate(cycleStart.getDate() + 27);
          cycleEnd.setHours(23, 59, 59, 999);

          const startStr = getLocalDateStr(cycleStart);
          const endStr = getLocalDateStr(cycleEnd);

          const periodReports = reports.filter(r => r.reportDate >= startStr && r.reportDate <= endStr);

          if (periodReports.length > 0) {
            const periodGross = periodReports.reduce((s, r) => s + r.grossSales, 0);
            const periodSalary = periodReports.reduce((s, r) => s + r.totalStaffPay, 0);
            const periodExpenses = periodReports.reduce((s, r) => s + (r.expenseData || []).reduce((acc: number, e: any) => acc + (Number(e.amount) || 0), 0), 0);
            const periodVault = periodReports.reduce((s, r) => s + (r.vaultData || []).reduce((acc: number, v: any) => acc + (Number(v.amount) || 0), 0), 0);
            
            results.push({
              id: `${view}-${index}`,
              branchId: isConsolidated ? 'all' : periodReports[0].branchId,
              name: isConsolidated ? 'NETWORK CONSOLIDATED' : (branches.find(b => b.id === periodReports[0].branchId)?.name || 'BRANCH NODE'),
              label: `BATCH ${index}`,
              scope: `${startStr} to ${endStr}`,
              displayDate: `${cycleStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${cycleEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`,
              dateRange: { start: startStr, end: endStr },
              gross: periodGross,
              salary: periodSalary,
              expenses: periodExpenses,
              vault: periodVault,
              net: periodGross - periodSalary - periodExpenses - periodVault,
              isActive: now >= cycleStart && now <= cycleEnd
            });
          }

          iter = new Date(cycleEnd);
          iter.setDate(iter.getDate() + 1);
          iter.setHours(0, 0, 0, 0);
          index++;
          if (results.length > 1000) break;
        }
        return results.reverse();
      }

      return [];
    };

    if (selectedBranchIds.length === 0) {
      return aggregateReports(salesReports, 'NETWORK', true);
    } else if (selectedBranchIds.length === 1) {
      const branchReports = salesReports.filter(r => r.branchId === selectedBranchIds[0]);
      return aggregateReports(branchReports, 'BRANCH NODE', false);
    } else {
      const branchReports = salesReports.filter(r => selectedBranchIds.includes(r.branchId));
      return aggregateReports(branchReports, 'BRANCHES', false);
    }
  }, [branches, salesReports, selectedBranchIds, view]);

  return (
      <div className="space-y-6 animate-in fade-in duration-700 max-w-7xl mx-auto px-2">
        {drilldownReport && (
            <ReportEditorModal
                report={drilldownReport}
                branch={branches.find(b => b.id === drilldownReport.branchId)!}
                onClose={() => setDrilldownReport(null)}
            />
        )}
        <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-end gap-6 border-b border-slate-200 pb-6">
          <div className="w-full xl:max-w-md">
            <p className={UI_THEME.text.label + " mb-2 ml-1"}>Archive Registry Scope</p>
            <BranchCheckboxDropdown
              branches={branches}
              selectedIds={selectedBranchIds}
              onChange={setSelectedBranchIds}
              placeholder="NETWORK CONSOLIDATED"
              className="w-full"
            />
          </div>

          <div className="w-full xl:w-auto">
            <p className={UI_THEME.text.label + " mb-2 ml-1"}>Cycle Configuration</p>
            <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200/60 shadow-inner w-full sm:min-w-[360px]">
              {(['daily', 'weekly', 'batch'] as CycleView[]).map(v => (
                  <button
                      key={v}
                      onClick={() => { setView(v); playSound('click'); }}
                      className={`flex-1 py-2.5 px-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${view === v ? 'bg-white text-slate-900 shadow-sm border border-slate-100 scale-[1.02]' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    {v}
                  </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
          {currentData.map((row) => (
              <div
                  key={row.id}
                  onClick={() => { if (row.rawReport) { playSound('click'); setDrilldownReport(row.rawReport); } }}
                  className={`group bg-white rounded-xl border transition-all duration-300 hover:shadow-xl flex flex-col overflow-hidden cursor-pointer active:scale-[0.98] ${row.isActive ? 'border-emerald-500 ring-1 ring-emerald-500/5' : 'border-slate-200'}`}
              >
                <div className="p-4 bg-slate-50/50 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-black shadow-inner shrink-0 ${row.isActive ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'}`}>
                      {view === 'daily' ? 'D' : view === 'weekly' ? 'W' : 'B'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[13px] font-black text-slate-900 uppercase tracking-tight truncate leading-none mb-1.5 group-hover:text-emerald-700 transition-colors">{row.name}</h3>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest truncate">{row.displayDate}</p>
                    </div>
                    {row.isActive && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></div>}
                  </div>
                </div>

                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 relative bg-white">
                  <div className="flex justify-between items-center min-w-0">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Gross Yield</p>
                    <p className="text-[14px] font-black text-slate-900 tabular-nums">₱{row.gross.toLocaleString()}</p>
                  </div>
                  <div className="flex justify-between items-center min-w-0">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Payroll</p>
                    <p className="text-[14px] font-black text-amber-600 tabular-nums">₱{row.salary.toLocaleString()}</p>
                  </div>
                  <div className="flex justify-between items-center min-w-0">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Expenses</p>
                    <p className="text-[14px] font-black text-rose-500 tabular-nums">₱{row.expenses.toLocaleString()}</p>
                  </div>
                  <div className="flex justify-between items-center min-w-0">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Vault (R&B)</p>
                    <p className="text-[14px] font-black text-indigo-700 tabular-nums">₱{row.vault.toLocaleString()}</p>
                  </div>
                </div>

                <div className={`mx-3 mb-3 p-3.5 rounded-lg flex items-center justify-between transition-all duration-300 ${row.net >= 0 ? 'bg-[#0F172A]' : 'bg-rose-50 border border-rose-100'}`}>
                  <div>
                    <p className={`text-[8px] font-black uppercase tracking-widest leading-none mb-1 ${row.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>Net ROI</p>
                    <p className={`text-xl font-black tabular-nums leading-none ${row.net >= 0 ? 'text-[#34D399]' : 'text-rose-700'}`}>
                      {row.net < 0 ? '−' : ''}₱{Math.abs(row.net).toLocaleString()}
                    </p>
                  </div>
                  <div className={`p-2 rounded-md ${row.net >= 0 ? 'bg-white/10 text-white' : 'bg-rose-100 text-rose-600'}`}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" strokeWidth="3" /></svg>
                  </div>
                </div>
              </div>
          ))}
        </div>
      </div>
  );
};