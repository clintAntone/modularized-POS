import React, { useState, useRef } from 'react';
import { UI_THEME } from '../../../constants/ui_designs';

// Bump this key whenever there's a new release to force the modal to show again
const RELEASE_KEY = 'whats_new_v2025-05';

function getManilaDateStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
}

export function shouldShowWhatsNew(): boolean {
  try {
    return localStorage.getItem(RELEASE_KEY) !== getManilaDateStr();
  } catch {
    return false;
  }
}

export function markWhatsNewSeen(): void {
  try {
    localStorage.setItem(RELEASE_KEY, getManilaDateStr());
  } catch { /* quota exceeded — ignore */ }
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
        <path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    color:       'bg-rose-100 text-rose-600',
    highlight:   'bg-rose-50 border-rose-300 shadow-rose-100',
    iconHL:      'bg-rose-200 text-rose-700',
    label: 'Sales Insights',
    desc: 'Spot unusual sales drops at a glance. Your dashboard now shows if this week is significantly below your 30-day baseline.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
        <rect x="3" y="4" width="18" height="14" rx="2" />
        <circle cx="9" cy="10" r="2" />
        <path d="M15 8h3M15 12h2" />
      </svg>
    ),
    color:       'bg-indigo-100 text-indigo-600',
    highlight:   'bg-indigo-50 border-indigo-300 shadow-indigo-100',
    iconHL:      'bg-indigo-200 text-indigo-700',
    label: 'Virtual Employee ID',
    desc: 'Every employee now has a digital ID card. Find it in the Staff directory.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    color:       'bg-amber-100 text-amber-600',
    highlight:   'bg-amber-50 border-amber-300 shadow-amber-100',
    iconHL:      'bg-amber-200 text-amber-700',
    label: 'Remove Reliever',
    desc: 'You can now remove a reliever from your branch via the Staff tab, as long as they have no active session today.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    color:       'bg-emerald-100 text-emerald-600',
    highlight:   'bg-emerald-50 border-emerald-300 shadow-emerald-100',
    iconHL:      'bg-emerald-200 text-emerald-700',
    label: 'Pay Bills from Vault Fund',
    desc: 'Tap the + button in the Vault Fund tab to pay bills directly from your vault balance — no more switching screens.',
  },
];

const FIXES = [
  'Branch was showing as Open even after being closed.',
  'Sales Reports page was returning a 400 error.',
  'Signal Admin for Reset was sending data to the wrong table.',
];

// ─── Component ────────────────────────────────────────────────────────────────

interface WhatsNewModalProps {
  onDismiss: () => void;
}

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({ onDismiss }) => {
  // -1 = none highlighted yet, 0–3 = that card is highlighted
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handleGotIt = () => {
    const next = activeIdx + 1;
    if (next >= FEATURES.length) {
      onDismiss();
      return;
    }
    setActiveIdx(next);
    // Scroll the newly highlighted card into view
    setTimeout(() => {
      cardRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  };

  return (
    <div className={UI_THEME.layout.modalWrapper} style={{ zIndex: 9999 }}>
      <div className={`${UI_THEME.layout.modalLarge} ${UI_THEME.radius.modal} overflow-hidden border border-slate-200 shadow-2xl max-h-[90vh] flex flex-col`}>

        {/* Header */}
        <div className="bg-slate-900 px-6 pt-7 pb-6 text-white shrink-0">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">May 2025 Update</span>
          </div>
          <h2 className="text-2xl font-black tracking-tight leading-tight">What's New</h2>
          <p className="text-sm text-slate-400 mt-1">Here's what changed in this update.</p>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 bg-white">
          <div className="p-5 space-y-5">

            {/* New Features */}
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">New Features</p>
              <div className="space-y-2">
                {FEATURES.map((f, i) => {
                  const isActive = activeIdx === i;
                  const isDone   = activeIdx > i;
                  return (
                    <div
                      key={i}
                      ref={el => { cardRefs.current[i] = el; }}
                      className={`flex items-start gap-3 p-4 rounded-2xl border shadow-sm transition-all duration-300 ${
                        isActive ? `${f.highlight} shadow-md scale-[1.02]` :
                        isDone   ? 'bg-white border-slate-200 opacity-60' :
                                   'bg-slate-50 border-slate-100'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-300 ${isActive ? f.iconHL : f.color}`}>
                        {f.icon}
                      </div>
                      <div className="min-w-0 pt-0.5">
                        <p className="text-sm font-bold text-slate-900">{f.label}</p>
                        <p className="text-sm text-slate-500 mt-0.5 leading-snug">{f.desc}</p>
                      </div>
                      {isDone && (
                        <svg className="w-4 h-4 text-emerald-500 shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bug Fixes */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Bug Fixes</p>
              <div className="space-y-2.5">
                {FIXES.map((fix, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path d="M9 12l2 2 4-4" />
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                    <p className="text-sm text-slate-600 leading-snug">{fix}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* Footer CTA */}
        <div className="shrink-0 p-5 bg-white border-t border-slate-100">
          <button
            onClick={handleGotIt}
            className="w-full flex items-center justify-center gap-2 text-white font-bold py-4 rounded-2xl text-sm bg-slate-900 hover:bg-slate-700 active:scale-[0.98] transition-all shadow-lg shadow-slate-900/20"
          >
            {activeIdx >= FEATURES.length - 1 ? 'Close' : 'Got it'}
          </button>
        </div>

      </div>
    </div>
  );
};
