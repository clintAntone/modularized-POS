
import React from 'react';
import { UI_THEME } from '../../../../constants/ui_designs';
import { SalesReport, Branch } from '../../../../types';
import { parseDate } from '@/src/utils/reportUtils';
import { PerformanceRow } from './PerformanceRow';

interface ReportTableProps {
  reports: SalesReport[];
  branches: Branch[];
  viewMode: 'daily' | 'weekly' | 'monthly';
  currentBranchId: string;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: any) => void;
  onSelect: (report: SalesReport) => void;
}

export const ReportTable: React.FC<ReportTableProps> = ({ reports, branches, viewMode, currentBranchId, sortField, sortOrder, onSort, onSelect }) => {
  const SortIndicator = ({ field }: { field: string }) => {
    if (sortField !== field) return <div className="w-4 h-4 opacity-20 ml-2 shrink-0">↕</div>;
    return (
        <div className={`ml-2 transition-transform duration-300 ${sortOrder === 'asc' ? 'rotate-180' : ''} text-emerald-500 font-bold shrink-0`}>
          ↓
        </div>
    );
  };

  return (
      <div className={`no-print flex flex-col`}>
        <div className="overflow-x-auto no-scrollbar shrink-0">
          <div className="w-full text-left min-w-full md:min-w-[1000px]">
            <div className="hidden md:flex border-b border-slate-100">
              <div className="px-8 py-5 w-[18%]">
                <button onClick={() => onSort('identity')} className={`flex items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors`}>
                  Registry Date <SortIndicator field="identity" />
                </button>
              </div>
              <div className="px-6 py-5 w-[22%]">
                <button onClick={() => onSort('terminal')} className={`flex items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors`}>
                  Branch Node <SortIndicator field="terminal" />
                </button>
              </div>
              <div className="px-6 py-5 w-[11%]">
                <button onClick={() => onSort('yield')} className={`flex items-center justify-end w-full text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors`}>
                  Gross <SortIndicator field="yield" />
                </button>
              </div>
              <div className="px-6 py-5 w-[11%]">
                <button onClick={() => onSort('payroll')} className={`flex items-center justify-end w-full text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors`}>
                  Salary <SortIndicator field="payroll" />
                </button>
              </div>
              <div className="px-6 py-5 w-[11%]">
                <button onClick={() => onSort('expenses')} className={`flex items-center justify-end w-full text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors`}>
                  Expenses <SortIndicator field="expenses" />
                </button>
              </div>
              <div className="px-6 py-5 w-[11%]">
                <button onClick={() => onSort('reserve')} className={`flex items-center justify-end w-full text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors`}>
                  Vault <SortIndicator field="reserve" />
                </button>
              </div>
              <div className="px-8 py-5 w-[16%]">
                <button onClick={() => onSort('roi')} className={`flex items-center justify-end w-full text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors`}>
                  NET ROI <SortIndicator field="roi" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-x-auto no-scrollbar">
          <div className="min-w-full md:min-w-[1000px]">
            {reports.map((r) => {
              let label = r.reportDate;
              let sublabel = `TRACE: ${r.id.slice(-8).toUpperCase()}`;

              if (viewMode === 'daily') {
                const d = parseDate(r.reportDate);
                label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
              } else if (viewMode === 'weekly') {
                sublabel = "CONSOLIDATED WEEKLY CYCLE";
              } else if (viewMode === 'monthly') {
                sublabel = "MONTHLY AUDIT BATCH";
              }

              return (
                <PerformanceRow
                  key={r.id}
                  branchName={r.branchId === 'all' ? 'NETWORK CONSOLIDATED' : (branches.find(b => b.id === r.branchId)?.name || 'BRANCH NODE')}
                  label={label}
                  sublabel={sublabel}
                  gross={r.grossSales}
                  pay={r.totalStaffPay}
                  exp={r.totalExpenses}
                  vault={r.totalVaultProvision}
                  net={r.netRoi}
                  onClick={() => onSelect(r)}
                />
              );
            })}
          </div>
        </div>
      </div>
  );
};
