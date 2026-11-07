import React, { useMemo, useState } from 'react';
import { Branch, Expense, SalesReport } from '../../../types';
import { ExpensesSection } from './ExpensesSection';

const XMAS_BONUS_NAME = 'XMAS BONUS PROVISION';

interface ExpensesManagerSectionProps {
  user?: any;
  branch: Branch;
  expenses: Expense[];
  salesReports: SalesReport[];
  isClosedMode?: boolean;
  onRefresh?: () => void;
  onSyncStatusChange?: (isSyncing: boolean) => void;
}

export const ExpensesManagerSection: React.FC<ExpensesManagerSectionProps> = (props) => {
  const [xmasExpanded, setXmasExpanded] = useState(false);

  const xmasEntries = useMemo(
    () => props.expenses
      .filter(e => e.name === XMAS_BONUS_NAME)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [props.expenses]
  );

  const xmasTotal = useMemo(
    () => xmasEntries.reduce((s, e) => s + Number(e.amount), 0),
    [xmasEntries]
  );

  return (
    <div className="space-y-6 sm:space-y-8 pb-12 w-full">

      {/* ── XMAS BONUS HISTORY ─────────────────────────────── */}
      {xmasEntries.length > 0 && (
        <div className="bg-white rounded-3xl border border-amber-200 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setXmasExpanded(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 bg-amber-50 hover:bg-amber-100/60 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-amber-500 text-white rounded-xl flex items-center justify-center text-sm font-black shadow-inner">★</div>
              <div className="text-left">
                <p className="text-xs font-black text-amber-900 uppercase tracking-tight">Xmas Bonus Provisions</p>
                <p className="text-xs text-amber-600 font-medium mt-0.5">
                  {xmasEntries.length} {xmasEntries.length === 1 ? 'entry' : 'entries'} · ₱{xmasTotal.toLocaleString()} total
                </p>
              </div>
            </div>
            <svg
              className={`w-4 h-4 text-amber-600 transition-transform ${xmasExpanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {xmasExpanded && (
            <div className="divide-y divide-amber-50">
              {xmasEntries.map(e => {
                const dateStr = e.timestamp.split('T')[0];
                return (
                  <div key={e.id} className="flex items-center justify-between px-5 py-3 hover:bg-amber-50/40 transition-colors">
                    <div>
                      <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{XMAS_BONUS_NAME}</p>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">{dateStr}</p>
                    </div>
                    <span className="text-sm font-black text-amber-700 tabular-nums">₱{Number(e.amount).toLocaleString()}</span>
                  </div>
                );
              })}
              {/* Footer total */}
              <div className="flex items-center justify-between px-5 py-3 bg-amber-50 border-t border-amber-100">
                <p className="text-xs font-black text-amber-800 uppercase tracking-widest">Total Provisioned</p>
                <span className="text-base font-black text-amber-700 tabular-nums">₱{xmasTotal.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <ExpensesSection
        user={props.user}
        branch={props.branch}
        expenses={props.expenses}
        isClosedMode={props.isClosedMode}
        onRefresh={props.onRefresh}
        onSyncStatusChange={props.onSyncStatusChange}
        fixedCategory="OPERATIONAL"
      />
    </div>
  );
};
