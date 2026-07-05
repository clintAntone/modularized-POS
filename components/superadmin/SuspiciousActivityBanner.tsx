import React from 'react';

interface FlagItem {
  id: string;
  title: string;
  detail: string;
  branchName: string;
  latestTimestamp: string;
}

interface SuspiciousActivityBannerProps {
  flags: FlagItem[];
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
  onViewAudit: () => void;
}

export const SuspiciousActivityBanner: React.FC<SuspiciousActivityBannerProps> = ({
  flags, onDismiss, onDismissAll, onViewAudit,
}) => {
  if (flags.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9990] w-80 no-print animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-slate-900 rounded-2xl shadow-2xl border border-rose-500/30 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-rose-500/20 flex items-center justify-center shrink-0">
              <svg className="w-3.5 h-3.5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
            </div>
            <div>
              <p className="text-xs font-black text-rose-400 uppercase tracking-[0.25em]">Security Alert</p>
              <p className="text-xs font-black text-white leading-tight">
                {flags.length} suspicious {flags.length === 1 ? 'activity' : 'activities'} detected
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onViewAudit}
              className="px-3 py-1.5 bg-rose-500 hover:bg-rose-400 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all active:scale-95"
            >
              View Audit
            </button>
            <button
              onClick={onDismissAll}
              className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-400 hover:text-white transition-all"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="max-h-52 overflow-y-auto divide-y divide-white/5">
          {flags.map(flag => (
            <div key={flag.id} className="flex items-start gap-3 px-4 py-3 group">
              <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0 animate-pulse" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-white uppercase tracking-wide leading-tight">{flag.title}</p>
                <p className="text-xs text-slate-400 mt-0.5 leading-snug line-clamp-2">{flag.detail}</p>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">{flag.branchName}</p>
              </div>
              <button
                onClick={() => onDismiss(flag.id)}
                className="w-5 h-5 rounded-lg bg-white/5 hover:bg-white/15 flex items-center justify-center text-slate-500 hover:text-white transition-all shrink-0 mt-0.5"
              >
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
