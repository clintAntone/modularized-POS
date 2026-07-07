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

function timeAgo(ts: string): string {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export const SuspiciousActivityBanner: React.FC<SuspiciousActivityBannerProps> = ({
  flags, onDismiss, onDismissAll, onViewAudit,
}) => {
  if (flags.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[9990] w-[380px] no-print animate-in slide-in-from-bottom-4 duration-300">

      {/* Glow */}
      <div className="absolute -inset-0.5 bg-rose-500/20 rounded-2xl blur-md pointer-events-none" />

      <div className="relative bg-[#0d1117] rounded-2xl shadow-2xl border border-rose-500/40 overflow-hidden">

        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-white/5">
          <div className="flex items-start justify-between gap-3">

            <div className="flex items-center gap-3">
              {/* Icon */}
              <div className="relative shrink-0">
                <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
                  <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                  </svg>
                </div>
                {/* pulse ring */}
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-rose-500 border-2 border-[#0d1117] animate-pulse" />
              </div>

              <div>
                <p className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em] leading-none mb-1">Security Alert</p>
                <p className="text-sm font-bold text-white leading-tight">
                  {flags.length} suspicious {flags.length === 1 ? 'activity' : 'activities'} detected
                </p>
              </div>
            </div>

            {/* Dismiss all */}
            <button
              onClick={onDismissAll}
              title="Dismiss all"
              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-500 hover:text-slate-300 transition-all shrink-0 mt-0.5"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          {/* View Audit button — full width below title */}
          <button
            onClick={onViewAudit}
            className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-rose-500 hover:bg-rose-400 active:scale-[0.98] text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
            </svg>
            View Audit Log
          </button>
        </div>

        {/* Flag list */}
        <div className="max-h-56 overflow-y-auto">
          {flags.map((flag, i) => (
            <div
              key={flag.id}
              className="relative flex items-start gap-3 px-4 py-3 group hover:bg-white/[0.03] transition-colors"
              style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
            >
              {/* Left accent bar */}
              <div className="absolute left-0 top-3 bottom-3 w-0.5 bg-rose-500/50 rounded-full" />

              {/* Content */}
              <div className="flex-1 min-w-0 pl-1">
                <p className="text-xs font-black text-white uppercase tracking-wide leading-tight">{flag.title}</p>
                <p className="text-[11px] text-slate-400 mt-1 leading-snug line-clamp-2">{flag.detail}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-md text-[10px] font-bold text-slate-400 uppercase tracking-wide truncate max-w-[180px]">
                    {flag.branchName}
                  </span>
                  {flag.latestTimestamp && (
                    <span className="text-[10px] text-slate-600 shrink-0">{timeAgo(flag.latestTimestamp)}</span>
                  )}
                </div>
              </div>

              {/* Dismiss */}
              <button
                onClick={() => onDismiss(flag.id)}
                className="w-6 h-6 rounded-lg bg-white/5 hover:bg-rose-500/20 flex items-center justify-center text-slate-600 hover:text-rose-400 transition-all shrink-0 mt-0.5 opacity-0 group-hover:opacity-100"
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
