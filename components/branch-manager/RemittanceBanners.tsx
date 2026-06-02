import React from 'react';
import { AlertCircle } from 'lucide-react';
import { getTrueDate } from '../../lib/time';
import { playSound } from '../../lib/audio';

interface RemittanceBannersProps {
  branchId: string;
  showCloseReminder: boolean;
  showFollowUpReminder: boolean;
  showVaultUnconfigured: boolean;
  onDismissCloseReminder: () => void;
  onDismissFollowUp: () => void;
  onDismissVaultNotif: () => void;
  onGoToRemittance: () => void;
}

export const RemittanceBanners: React.FC<RemittanceBannersProps> = ({
  branchId,
  showCloseReminder,
  showFollowUpReminder,
  showVaultUnconfigured,
  onDismissCloseReminder,
  onDismissFollowUp,
  onDismissVaultNotif,
  onGoToRemittance,
}) => (
  <>
    {showCloseReminder && (
      <div className="bg-amber-600 rounded-2xl p-4 flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-500 shadow-lg shadow-amber-200">
        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white shrink-0">
          <AlertCircle className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h4 className="text-[12px] font-black text-white uppercase tracking-widest">⚠ Remittance Cut-Off — 1 Hour Left</h4>
          <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest leading-none mt-1">
            This is your weekly cut-off day. Finalize your remittance report before the period closes.
          </p>
        </div>
        <button
          onClick={() => { onGoToRemittance(); playSound('click'); }}
          className="px-3 py-2 bg-white text-amber-700 text-[9px] font-black uppercase tracking-widest rounded-lg shadow-sm hover:bg-amber-50 transition-colors shrink-0"
        >
          Review
        </button>
        <button
          onClick={() => {
            const manilaDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(getTrueDate());
            localStorage.setItem(`remittance_close_reminded_${manilaDateStr}`, '1');
            onDismissCloseReminder();
          }}
          className="w-7 h-7 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center text-white text-[12px] font-black shrink-0 transition-colors"
          aria-label="Dismiss"
        >✕</button>
      </div>
    )}

    {showFollowUpReminder && (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-500">
        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 shrink-0">
          <AlertCircle className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h4 className="text-[11px] font-black text-amber-900 uppercase tracking-tight">Remittance Not Yet Submitted</h4>
          <p className="text-[10px] font-bold text-amber-700/80 uppercase tracking-widest leading-none mt-1">
            Last week's remittance report has not been submitted. Please finalize and submit it now.
          </p>
        </div>
        <button
          onClick={() => { onGoToRemittance(); playSound('click'); }}
          className="px-4 py-2 bg-amber-600 text-white text-[9px] font-black uppercase tracking-widest rounded-lg shadow-sm hover:bg-amber-700 transition-colors shrink-0"
        >
          Go
        </button>
        <button
          onClick={() => {
            const manilaDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(getTrueDate());
            localStorage.setItem(`remittance_followup_reminded_${manilaDateStr}`, '1');
            onDismissFollowUp();
          }}
          className="w-7 h-7 bg-amber-100 hover:bg-amber-200 rounded-lg flex items-center justify-center text-amber-600 text-[12px] font-black shrink-0 transition-colors"
          aria-label="Dismiss"
        >✕</button>
      </div>
    )}

    {showVaultUnconfigured && (
      <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-500">
        <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div className="flex-1">
          <h4 className="text-[11px] font-black text-indigo-900 uppercase tracking-tight">Vault Fund Not Configured</h4>
          <p className="text-[10px] font-bold text-indigo-700/80 uppercase tracking-widest leading-none mt-1">
            Your vault fund has no target set. Contact your admin to configure it.
          </p>
        </div>
        <button
          onClick={() => {
            const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
            localStorage.setItem(`vault_notif_${branchId}_${today}`, '1');
            onDismissVaultNotif();
          }}
          className="w-7 h-7 bg-indigo-100 hover:bg-indigo-200 rounded-lg flex items-center justify-center text-indigo-600 text-[12px] font-black shrink-0 transition-colors"
          aria-label="Dismiss"
        >✕</button>
      </div>
    )}
  </>
);
