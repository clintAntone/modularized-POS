import React from 'react';
import { Clock } from 'lucide-react';
import { UI_THEME } from '../../../constants/ui_designs';
import { BranchVault } from '../../../types';

interface ClosingWarningModalProps {
  closingTime: string;
  todayReportExists: boolean;
  vaultEnabled?: boolean;
  branchVault?: BranchVault | null;
  netTotal: number;
  onGoToSales: () => void;
  onAcknowledge: () => void;
}

export const ClosingWarningModal: React.FC<ClosingWarningModalProps> = ({
  closingTime, todayReportExists, vaultEnabled, branchVault, netTotal, onGoToSales, onAcknowledge,
}) => (
  <div className={UI_THEME.layout.modalWrapper}>
    <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-10 text-center border-4 border-amber-500 shadow-[0_0_100px_rgba(245,158,11,0.3)] animate-premium-pulse`}>
      <div className="w-20 h-20 bg-amber-500 text-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl">
        <Clock className="w-10 h-10" strokeWidth={2.5} />
      </div>
      <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-2">MANDATORY FINALIZATION</h3>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed mb-6">
        Branch closes at <span className="text-amber-600">{closingTime}</span>. Complete all items before the automated registry purge.
      </p>

      <div className="space-y-3 mb-8 text-left">
        {/* Sales Report checklist item */}
        <div className={`flex items-center gap-4 p-4 rounded-2xl border-2 ${todayReportExists ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-black text-[14px] ${todayReportExists ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
            {todayReportExists ? '✓' : '!'}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-[11px] font-black uppercase tracking-tight ${todayReportExists ? 'text-emerald-800' : 'text-rose-800'}`}>Daily Sales Report</p>
            <p className={`text-[9px] font-bold uppercase tracking-widest mt-0.5 ${todayReportExists ? 'text-emerald-600' : 'text-rose-500'}`}>
              {todayReportExists ? "Submitted — you're good" : 'Not submitted yet — required before closing'}
            </p>
          </div>
          {!todayReportExists && (
            <button onClick={onGoToSales} className="px-4 py-2.5 bg-rose-600 text-white text-[9px] font-black uppercase tracking-widest rounded-xl shrink-0">Go</button>
          )}
        </div>

        {/* Vault Fund checklist item */}
        {vaultEnabled && branchVault && netTotal > 0 && (() => {
          const hasTarget = branchVault.target > 0;
          const targetReached = hasTarget && branchVault.balance >= branchVault.target;
          const depositedToday = branchVault.balance > 0;
          const done = targetReached || depositedToday;
          return (
            <div className={`flex items-center gap-4 p-4 rounded-2xl border-2 ${done ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-300'}`}>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-black text-[14px] ${done ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
                {done ? '✓' : '!'}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-[11px] font-black uppercase tracking-tight ${done ? 'text-emerald-800' : 'text-amber-900'}`}>Vault Fund</p>
                <p className={`text-[9px] font-bold uppercase tracking-widest mt-0.5 ${done ? 'text-emerald-600' : 'text-amber-700'}`}>
                  {targetReached
                    ? `Target reached — ₱${branchVault.balance.toLocaleString()} / ₱${branchVault.target.toLocaleString()}`
                    : depositedToday
                      ? `Balance ₱${branchVault.balance.toLocaleString()}${hasTarget ? ` / Target ₱${branchVault.target.toLocaleString()}` : ''}`
                      : hasTarget
                        ? `No remittance yet · Balance ₱${branchVault.balance.toLocaleString()} / Target ₱${branchVault.target.toLocaleString()}`
                        : `No remittance yet — remit to vault before closing`}
                </p>
              </div>
              {!done && (
                <button onClick={onGoToSales} className="px-4 py-2.5 bg-amber-500 text-white text-[9px] font-black uppercase tracking-widest rounded-xl shrink-0">Go</button>
              )}
            </div>
          );
        })()}
      </div>

      <button
        onClick={onAcknowledge}
        className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl text-[12px] uppercase tracking-widest shadow-2xl active:scale-95 transition-all"
      >
        Acknowledged
      </button>
    </div>
  </div>
);
