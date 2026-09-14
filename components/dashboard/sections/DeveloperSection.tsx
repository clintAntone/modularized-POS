
import React from 'react';

interface DeveloperSectionProps {
  version?: string | null;
  onClose?: () => void;
}

const STACK = [
  'React 19', 'TypeScript', 'Tailwind CSS v4',
  'Supabase', 'PostgreSQL', 'Capacitor', 'Vite', 'jsPDF',
];

const FEATURES = [
  {
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    ),
    label: 'Multi-Branch POS',
    desc: 'Service-based point-of-sale with dual-provider commission tracking',
  },
  {
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
    ),
    label: 'Payroll & Attendance',
    desc: 'Weekly payroll cycle with allowances, OT, late deductions, and relievers',
  },
  {
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    ),
    label: 'Branch Vault',
    desc: 'Daily provision deposits, withdrawal tracking, and balance reconciliation',
  },
  {
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
    ),
    label: 'Sales Reports & Remittance',
    desc: 'Daily closing reports with weekly remittance grouping by cutoff',
  },
  {
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    ),
    label: 'Reports & Analytics',
    desc: 'Performance heatmaps, expense ledger, and exportable PDF reports',
  },
  {
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    ),
    label: 'Staff Directory',
    desc: 'Employee profiles with per-branch role overrides and allowance settings',
  },
];

const STATS = [
  { value: '50K+', label: 'Lines' },
  { value: '125',  label: 'Components' },
  { value: '16',   label: 'RT Feeds' },
  { value: '1',    label: 'Dev' },
];

export const DeveloperSection: React.FC<DeveloperSectionProps> = ({ version }) => {
  return (
    <div className="w-full max-w-lg mx-auto px-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="rounded-2xl overflow-hidden shadow-xl border border-white/5">

        {/* ── HERO ─────────────────────────────────────── */}
        <div
          className="relative px-6 pt-8 pb-8 text-center overflow-hidden"
          style={{ background: 'linear-gradient(145deg, #0f172a 0%, #1e1b4b 50%, #0f2918 100%)' }}
        >
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          />
          <div className="absolute top-0 left-1/4 w-48 h-24 bg-indigo-500/25 blur-[60px] rounded-full" />
          <div className="absolute bottom-0 right-1/4 w-40 h-20 bg-emerald-500/20 blur-[50px] rounded-full" />

          <div className="relative z-10 space-y-3">
            <div
              className="inline-flex items-center justify-center w-16 h-16 rounded-[18px] shadow-xl select-none"
              style={{ background: 'linear-gradient(135deg, #6366f1, #10b981)' }}
            >
              <span className="text-xl font-black text-white tracking-tighter">CA</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tighter leading-none">
                Clint Antone Raro
              </h1>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.25em]"
                style={{ color: 'rgba(167,243,208,0.8)' }}>
                System Architect &amp; Lead Engineer
              </p>
            </div>
            <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-black text-white/60 uppercase tracking-widest">
                Node Network · v{version || '1.0.0'}
              </span>
            </div>

            {/* Stats — inline inside hero */}
            <div className="grid grid-cols-4 bg-white/5 border border-white/8 rounded-2xl overflow-hidden mt-1">
              {STATS.map((s, i) => (
                <div key={i} className={`py-3 text-center ${i < STATS.length - 1 ? 'border-r border-white/5' : ''}`}>
                  <p className="text-sm font-black text-white leading-none tabular-nums">{s.value}</p>
                  <p className="mt-0.5 text-xs font-bold text-white/40 uppercase tracking-wider leading-tight">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── BODY ─────────────────────────────────────── */}
        <div className="bg-white px-6 pt-5 pb-6 space-y-5">

          {/* Tech stack — neutral */}
          <div>
            <p className="text-xs font-black text-slate-300 uppercase tracking-widest mb-2">Built With</p>
            <div className="flex flex-wrap gap-1.5">
              {STACK.map((label) => (
                <span key={label} className="px-2.5 py-1 rounded-lg text-xs font-bold border uppercase tracking-wider bg-slate-50 text-slate-500 border-slate-100">
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-slate-50" />

          {/* Core features */}
          <div>
            <p className="text-xs font-black text-slate-300 uppercase tracking-widest mb-3">Core Features</p>
            <div className="space-y-2">
              {FEATURES.map((f) => (
                <div key={f.label} className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="w-7 h-7 rounded-lg bg-white border border-slate-100 flex items-center justify-center shrink-0 shadow-sm">
                    <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                      {f.icon}
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-700 uppercase tracking-tight leading-none">{f.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 pt-1">
            <div className="h-px flex-1 bg-slate-100" />
            <span className="text-xs font-black text-slate-300 uppercase tracking-widest">Handcrafted with Excellence</span>
            <div className="h-px flex-1 bg-slate-100" />
          </div>
        </div>
      </div>
    </div>
  );
};
