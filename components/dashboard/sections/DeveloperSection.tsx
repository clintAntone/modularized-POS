
import React from 'react';

interface DeveloperSectionProps {
  version?: string | null;
  onClose?: () => void;
}

const STACK = [
  { label: 'React 19', color: 'bg-sky-50 text-sky-600 border-sky-100' },
  { label: 'TypeScript', color: 'bg-blue-50 text-blue-600 border-blue-100' },
  { label: 'Tailwind CSS v4', color: 'bg-cyan-50 text-cyan-600 border-cyan-100' },
  { label: 'Supabase', color: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  { label: 'PostgreSQL', color: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
  { label: 'React Query', color: 'bg-rose-50 text-rose-600 border-rose-100' },
  { label: 'Capacitor', color: 'bg-violet-50 text-violet-600 border-violet-100' },
  { label: 'Vite', color: 'bg-amber-50 text-amber-600 border-amber-100' },
];

const STATS = [
  { value: '10K+', label: 'Lines of Code' },
  { value: '40+', label: 'Components Built' },
  { value: '8', label: 'Real-time Queries' },
  { value: '1', label: 'Dedicated Dev' },
];

export const DeveloperSection: React.FC<DeveloperSectionProps> = ({ version, onClose }) => {
  return (
    <div className="max-w-2xl mx-auto py-6 sm:py-10 px-4 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-10 right-6 sm:top-14 sm:right-4 z-50 p-2.5 bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-900 rounded-2xl transition-all active:scale-90 shadow-sm border border-slate-100"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      <div className="bg-white rounded-[32px] shadow-2xl border border-slate-100 overflow-hidden">
        {/* Hero */}
        <div className="relative bg-slate-900 px-8 pt-10 pb-16 text-center overflow-hidden">
          {/* Grid texture */}
          <div className="absolute inset-0 opacity-[0.04]"
            style={{ backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
          {/* Glow blobs */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-emerald-500/20 blur-[60px] rounded-full" />
          <div className="absolute -bottom-8 left-8 w-32 h-32 bg-indigo-500/20 blur-[60px] rounded-full" />

          <div className="relative z-10">
            {/* Avatar */}
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-2xl shadow-emerald-500/30 mb-5 text-4xl select-none">
              👨‍💻
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tighter leading-none">
              Clint Antone Raro
            </h1>
            <p className="mt-2 text-[10px] font-bold text-emerald-400 uppercase tracking-[0.25em]">
              System Architect &amp; Lead Engineer
            </p>

            {/* Version pill */}
            <div className="mt-5 inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-black text-white/70 uppercase tracking-widest">
                v{version || '1.0.0'} · Released March 12, 2026
              </span>
            </div>
          </div>
        </div>

        {/* Stats row — overlaps hero */}
        <div className="mx-6 -mt-8 grid grid-cols-4 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-20 relative">
          {STATS.map((s, i) => (
            <div key={i} className={`py-4 text-center ${i < STATS.length - 1 ? 'border-r border-slate-50' : ''}`}>
              <p className="text-lg sm:text-xl font-black text-slate-900 leading-none">{s.value}</p>
              <p className="mt-1 text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-tight">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="px-8 pt-8 pb-10 space-y-8">
          {/* Tech stack */}
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Built With</p>
            <div className="flex flex-wrap gap-2">
              {STACK.map((s) => (
                <span key={s.label} className={`px-3 py-1.5 rounded-xl text-[10px] font-bold border uppercase tracking-wider ${s.color}`}>
                  {s.label}
                </span>
              ))}
            </div>
          </div>

          {/* Quote */}
          <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 relative">
            <svg className="absolute top-4 left-5 w-6 h-6 text-slate-200" fill="currentColor" viewBox="0 0 24 24">
              <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
            </svg>
            <p className="text-slate-600 text-sm leading-relaxed italic pl-6">
              Thank you for your dedication to building a robust and efficient management system for Hilot Center. Your expertise has transformed our operations into a seamless digital experience.
            </p>
          </div>

          {/* Footer badge */}
          <div className="flex items-center justify-center gap-3">
            <div className="h-px flex-1 bg-slate-50" />
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-base">✦</span>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Handcrafted with Excellence</span>
              <span className="text-base">✦</span>
            </div>
            <div className="h-px flex-1 bg-slate-50" />
          </div>
        </div>
      </div>
    </div>
  );
};
