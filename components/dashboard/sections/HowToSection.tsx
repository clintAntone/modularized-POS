import React, { useState } from 'react';
import { UserRole } from '../../../types';

interface HowToSectionProps {
  role: UserRole;
}

// ─── Tour data types ────────────────────────────────────────────────────────

interface TourStep {
  title: string;
  instruction: string;
  visual: React.ReactNode;
}

interface Guide {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  steps: TourStep[];
}

// ─── Shared visual primitives ────────────────────────────────────────────────

const Phone = ({ children }: { children: React.ReactNode }) => (
  <div className="relative mx-auto w-[220px] h-[380px] bg-slate-900 rounded-3xl shadow-xl border-4 border-slate-700 overflow-hidden flex flex-col">
    {/* Status bar */}
    <div className="h-6 bg-slate-800 flex items-center justify-center shrink-0">
      <div className="w-16 h-1.5 bg-slate-600 rounded-full" />
    </div>
    <div className="flex-1 overflow-hidden relative">{children}</div>
  </div>
);

const NavBar = ({ active }: { active: string }) => {
  const tabs = [
    { id: 'pos', label: 'POS', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg> },
    { id: 'sales', label: 'Sales', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg> },
    { id: 'staff', label: 'Staff', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2m8-10a4 4 0 100-8 4 4 0 000 8z"/></svg> },
    { id: 'more', label: 'More', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg> },
  ];
  return (
    <div className="absolute bottom-0 left-0 right-0 bg-slate-800 border-t border-white/5 flex items-center justify-around px-1 py-2">
      {tabs.map(t => (
        <div key={t.id} className={`flex flex-col items-center gap-0.5 px-2 ${active === t.id ? 'text-emerald-400' : 'text-slate-500'}`}>
          {t.icon}
          <span className="text-xs font-medium uppercase tracking-wide">{t.label}</span>
          {active === t.id && <div className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />}
        </div>
      ))}
    </div>
  );
};

const Pulse = ({ className = '' }: { className?: string }) => (
  <span className={`relative flex h-4 w-4 ${className}`}>
    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
    <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500" />
  </span>
);

const Arrow = ({ dir = 'down', className = '' }: { dir?: 'up' | 'down' | 'left' | 'right'; className?: string }) => {
  const paths: Record<string, string> = {
    down: 'M12 5v14m-7-7l7 7 7-7',
    up: 'M12 19V5m7 7l-7-7-7 7',
    left: 'M19 12H5m7 7l-7-7 7-7',
    right: 'M5 12h14m-7-7l7 7-7 7',
  };
  return (
    <svg className={`animate-bounce ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
      <path strokeLinecap="round" strokeLinejoin="round" d={paths[dir]} />
    </svg>
  );
};

// ─── Guide visual mockups ────────────────────────────────────────────────────

// Wraps a target element with a pulsing emerald ring + dot indicator
const Highlight = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`relative ring-2 ring-emerald-400 rounded-xl shadow-md shadow-emerald-400/20 ${className}`}>
    {children}
    <Pulse className="absolute -top-2 -right-2" />
  </div>
);

// Inline nav bar (non-absolute) so we can place arrows above specific tabs
const InlineNavBar = ({ active, arrowAt }: { active: string; arrowAt?: string }) => {
  const tabs = [
    { id: 'pos', label: 'POS' },
    { id: 'sales', label: 'Sales' },
    { id: 'staff', label: 'Staff' },
    { id: 'more', label: 'More' },
  ];
  return (
    <div className="shrink-0">
      {/* Arrow row — only shown when arrowAt is set */}
      {arrowAt && (
        <div className="flex justify-around px-1">
          {tabs.map(t => (
            <div key={t.id} className="flex flex-col items-center" style={{ width: '25%' }}>
              {t.id === arrowAt ? (
                <Arrow dir="down" className="w-4 h-4 text-emerald-400" />
              ) : (
                <div className="h-4" />
              )}
            </div>
          ))}
        </div>
      )}
      <div className="bg-slate-800 border-t border-white/5 flex items-center justify-around px-1 py-2">
        {tabs.map(t => (
          <div key={t.id} className={`flex flex-col items-center gap-0.5 px-2 ${active === t.id ? 'text-emerald-400' : 'text-slate-500'}`}>
            <div className="w-4 h-4 rounded bg-current opacity-60" />
            <span className="text-xs font-medium uppercase tracking-wide">{t.label}</span>
            {active === t.id && <div className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />}
          </div>
        ))}
      </div>
    </div>
  );
};

const VisualOpenBranch = () => (
  <Phone>
    <div className="bg-slate-900 h-full flex flex-col p-3 gap-3 pb-2">
      <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Branch Status</div>
      <div className="bg-slate-700 rounded-2xl px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400 uppercase">Status</p>
          <p className="text-xs font-black text-rose-400 uppercase">● Offline</p>
        </div>
        {/* Arrow points right toward the Open button */}
        <div className="flex items-center gap-2">
          <Arrow dir="right" className="w-4 h-4 text-emerald-400" />
          <Highlight>
            <div className="bg-emerald-500 rounded-xl px-3 py-1.5">
              <p className="text-xs font-black text-white uppercase">Open</p>
            </div>
          </Highlight>
        </div>
      </div>
    </div>
    <InlineNavBar active="sales" />
  </Phone>
);

const VisualOpenConfirm = () => (
  <Phone>
    <div className="bg-slate-900/80 h-full flex items-center justify-center p-4 pb-2">
      <div className="bg-white rounded-2xl p-4 w-full space-y-2">
        <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center mx-auto">
          <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M5 13l4 4L19 7"/></svg>
        </div>
        <p className="text-xs font-black text-slate-900 uppercase text-center tracking-tight">Open Branch?</p>
        <p className="text-xs text-slate-400 text-center leading-relaxed">This will start the business day and enable the POS.</p>
        {/* Arrow above the confirm button pointing down at it */}
        <div className="flex justify-center pt-1">
          <Arrow dir="down" className="w-4 h-4 text-emerald-500" />
        </div>
        <Highlight>
          <div className="bg-slate-900 rounded-xl py-2 text-center">
            <p className="text-xs font-black text-white uppercase">Confirm Open</p>
          </div>
        </Highlight>
      </div>
    </div>
  </Phone>
);

const VisualOpenDone = () => (
  <Phone>
    <div className="bg-slate-900 h-full flex flex-col p-3 gap-2 pb-2">
      <div className="bg-slate-700 rounded-2xl px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400 uppercase">Status</p>
          <p className="text-xs font-black text-emerald-400 uppercase">● Online</p>
        </div>
        <div className="bg-slate-600 rounded-xl px-3 py-1.5">
          <p className="text-xs font-black text-slate-300 uppercase">Close</p>
        </div>
      </div>
      <div className="bg-emerald-900/30 border border-emerald-500/20 rounded-xl p-3">
        <p className="text-xs font-black text-emerald-400 uppercase tracking-widest">Branch is now open!</p>
        <p className="text-xs text-slate-400 mt-0.5">POS and staff features are now active.</p>
      </div>
    </div>
    <InlineNavBar active="sales" />
  </Phone>
);

// Arrow above the Staff tab, pointing down at it
const VisualStaffNav = () => (
  <Phone>
    <div className="bg-slate-50 h-full flex flex-col">
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide text-center px-4">Tap the Staff tab in the bottom bar</p>
      </div>
      <InlineNavBar active="staff" arrowAt="staff" />
    </div>
  </Phone>
);

const VisualStaffTab = () => (
  <Phone>
    <div className="bg-slate-50 h-full flex flex-col pb-2">
      <div className="bg-white px-3 py-2 border-b border-slate-100">
        <p className="text-xs font-black text-slate-900 uppercase tracking-tight">Staff on Duty</p>
      </div>
      <div className="flex-1 p-2 space-y-1.5">
        {/* First row highlighted */}
        <div className="bg-white rounded-xl p-2.5 flex items-center justify-between border border-slate-100">
          <div>
            <p className="text-xs font-black text-slate-900">JUAN D.</p>
            <p className="text-xs text-slate-400">Therapist · Not clocked in</p>
          </div>
          {/* Arrow points right toward Clock In */}
          <div className="flex items-center gap-1.5">
            <Arrow dir="right" className="w-3 h-3 text-emerald-400" />
            <Highlight>
              <div className="bg-emerald-500 rounded-lg px-2 py-1">
                <p className="text-xs font-black text-white uppercase">Clock In</p>
              </div>
            </Highlight>
          </div>
        </div>
        <div className="bg-white rounded-xl p-2.5 flex items-center justify-between border border-slate-100 opacity-40">
          <div>
            <p className="text-xs font-black text-slate-900">MARIA S.</p>
            <p className="text-xs text-slate-400">Therapist · Not clocked in</p>
          </div>
          <div className="bg-emerald-500 rounded-lg px-2 py-1">
            <p className="text-xs font-black text-white uppercase">Clock In</p>
          </div>
        </div>
      </div>
    </div>
    <InlineNavBar active="staff" />
  </Phone>
);

const VisualPOSTab = () => (
  <Phone>
    <div className="bg-slate-50 h-full flex flex-col pb-2">
      <div className="bg-white px-3 py-2 border-b border-slate-100">
        <p className="text-xs font-black text-slate-900 uppercase">Point of Sale</p>
      </div>
      <div className="flex-1 p-2 space-y-1.5">
        {/* First service highlighted */}
        <Highlight>
          <div className="bg-white rounded-xl p-2.5 flex items-center justify-between border border-slate-100">
            <div>
              <p className="text-xs font-black text-slate-900">HILOT BODY (60 min)</p>
              <p className="text-xs text-emerald-600 font-bold">₱ 300</p>
            </div>
            <div className="w-5 h-5 rounded-full border-2 border-emerald-400 bg-emerald-50" />
          </div>
        </Highlight>
        {['HILOT HEAD (30 min)', 'COMBINATION'].map(s => (
          <div key={s} className="bg-white rounded-xl p-2.5 flex items-center justify-between border border-slate-100 opacity-40">
            <div>
              <p className="text-xs font-black text-slate-900">{s}</p>
              <p className="text-xs text-emerald-600 font-bold">₱ 300</p>
            </div>
            <div className="w-5 h-5 rounded-full border-2 border-slate-200" />
          </div>
        ))}
      </div>
    </div>
    <InlineNavBar active="pos" />
  </Phone>
);

const VisualPOSTherapist = () => (
  <Phone>
    <div className="bg-slate-50 h-full flex flex-col pb-2">
      <div className="bg-white px-3 py-2 border-b border-slate-100">
        <p className="text-xs font-black text-slate-900 uppercase">Select Therapist</p>
      </div>
      <div className="flex-1 p-2 space-y-1.5">
        <Highlight>
          <div className="bg-white rounded-xl p-2.5 flex items-center justify-between border border-slate-100">
            <p className="text-xs font-black text-slate-900">JUAN D.</p>
            <div className="w-5 h-5 rounded-full border-2 border-emerald-400 bg-emerald-50" />
          </div>
        </Highlight>
        <div className="bg-white rounded-xl p-2.5 flex items-center justify-between border border-slate-100 opacity-40">
          <p className="text-xs font-black text-slate-900">MARIA S.</p>
          <div className="w-5 h-5 rounded-full border-2 border-slate-200" />
        </div>
      </div>
    </div>
    <InlineNavBar active="pos" />
  </Phone>
);

const VisualPOSConfirm = () => (
  <Phone>
    <div className="bg-slate-50 h-full flex flex-col pb-2">
      <div className="bg-white px-3 py-2 border-b border-slate-100">
        <p className="text-xs font-black text-slate-900 uppercase">Summary</p>
      </div>
      <div className="flex-1 p-2 space-y-1.5">
        <div className="bg-white rounded-xl p-2.5 border border-slate-100 space-y-1">
          <p className="text-xs text-slate-400 uppercase">Service</p>
          <p className="text-xs font-black text-slate-900">HILOT BODY (60 min)</p>
          <p className="text-xs text-slate-400 uppercase">Therapist</p>
          <p className="text-xs font-black text-slate-900">JUAN D.</p>
          <p className="text-xs text-slate-400 uppercase">Total</p>
          <p className="text-xs font-black text-emerald-600">₱ 300.00</p>
        </div>
        {/* Arrow above the confirm button pointing down at it */}
        <div className="flex justify-center">
          <Arrow dir="down" className="w-4 h-4 text-emerald-400" />
        </div>
        <Highlight>
          <div className="bg-slate-900 rounded-xl py-2 text-center">
            <p className="text-xs font-black text-white uppercase">Confirm & Save</p>
          </div>
        </Highlight>
      </div>
    </div>
    <InlineNavBar active="pos" />
  </Phone>
);

const VisualExpenseForm = () => (
  <Phone>
    <div className="bg-slate-50 h-full flex flex-col pb-2">
      <div className="bg-white px-3 py-2 border-b border-slate-100">
        <p className="text-xs font-black text-slate-900 uppercase">Sales</p>
      </div>
      <div className="flex-1 p-2 space-y-1 overflow-hidden">
        {['HILOT BODY · JUAN D.', 'HILOT HEAD · MARIA S.'].map(s => (
          <div key={s} className="bg-white rounded-xl p-2 border border-slate-100 flex items-center justify-between opacity-50">
            <p className="text-xs text-slate-600">{s}</p>
            <p className="text-xs font-bold text-emerald-600">₱ 300</p>
          </div>
        ))}
      </div>
      {/* Bottom action buttons — arrow points down to Record Expense */}
      <div className="px-2 pb-1 space-y-1.5">
        <div className="flex justify-center">
          <Arrow dir="down" className="w-4 h-4 text-emerald-400" />
        </div>
        <Highlight>
          <div className="bg-rose-500 rounded-xl py-2 text-center">
            <p className="text-xs font-black text-white uppercase">Record Expense</p>
          </div>
        </Highlight>
        <div className="bg-slate-300 rounded-xl py-2 text-center opacity-40">
          <p className="text-xs font-black text-slate-600 uppercase">Daily Deposit</p>
        </div>
      </div>
    </div>
    <InlineNavBar active="sales" />
  </Phone>
);


const VisualExpenseSave = () => (
  <Phone>
    <div className="h-full relative">
      {/* Background — Sales tab (dimmed behind modal) */}
      <div className="absolute inset-0 bg-slate-50">
        <div className="bg-white px-3 py-2 border-b border-slate-100">
          <p className="text-xs font-black text-slate-900 uppercase">Sales</p>
        </div>
        <div className="p-2 space-y-1">
          {['HILOT BODY · JUAN D.', 'HILOT HEAD · MARIA S.'].map(s => (
            <div key={s} className="bg-white rounded-xl p-2 border border-slate-100 flex items-center justify-between">
              <p className="text-xs text-slate-600">{s}</p>
              <p className="text-xs font-bold text-emerald-600">₱ 300</p>
            </div>
          ))}
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-slate-800 flex items-center justify-around px-1 py-2">
          {['POS', 'Sales', 'Staff', 'More'].map((t, i) => (
            <div key={t} className={`flex flex-col items-center gap-0.5 px-2 ${i === 1 ? 'text-emerald-400' : 'text-slate-500'}`}>
              <div className="w-4 h-4 rounded bg-current opacity-60" />
              <span className="text-xs font-medium uppercase tracking-wide">{t}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Dark overlay fully covers the background */}
      <div className="absolute inset-0 bg-black/60" />
      {/* Bottom sheet modal on top */}
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-3 space-y-2 pb-4">
        <div className="w-8 h-1 bg-slate-200 rounded-full mx-auto mb-1" />
        <p className="text-xs font-black text-slate-900 uppercase tracking-tight">Record Expense</p>
        {['Description', 'Amount', 'Category'].map(f => (
          <div key={f}>
            <p className="text-xs text-slate-400 uppercase mb-0.5">{f}</p>
            <div className="h-4 bg-slate-50 rounded border border-slate-200" />
          </div>
        ))}
        <div className="flex justify-center pt-0.5">
          <Arrow dir="down" className="w-3 h-3 text-emerald-400" />
        </div>
        <Highlight>
          <div className="bg-slate-900 rounded-xl py-1.5 text-center">
            <p className="text-xs font-black text-white uppercase">Save Expense</p>
          </div>
        </Highlight>
      </div>
    </div>
  </Phone>
);


const VisualRemittanceTab = () => (
  <Phone>
    <div className="bg-slate-50 h-full flex flex-col pb-2">
      <div className="bg-white px-3 py-2 border-b border-slate-100">
        <p className="text-xs font-black text-slate-900 uppercase">Remittance</p>
      </div>
      <div className="flex-1 p-2 space-y-1.5">
        <div className="bg-white rounded-xl p-2.5 border border-slate-100 space-y-1">
          <p className="text-xs text-slate-400 uppercase">Adjusted ROI</p>
          <p className="text-sm font-black text-slate-900">₱ 4,200.00</p>
          <div className="grid grid-cols-2 gap-1 pt-1">
            {['OWNER A 50%', 'OWNER B 50%'].map(o => (
              <div key={o} className="bg-slate-50 rounded-lg p-1.5">
                <p className="text-[6px] text-slate-400">{o}</p>
                <p className="text-xs font-black text-slate-700">₱ 2,100</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    {/* Arrow above the More tab pointing down at it */}
    <InlineNavBar active="more" arrowAt="more" />
  </Phone>
);

const VisualRemittanceSubmit = () => (
  <Phone>
    <div className="bg-slate-50 h-full flex flex-col pb-2">
      <div className="flex-1 p-2 space-y-1.5 pt-3">
        <div className="bg-white rounded-xl p-2.5 border border-slate-100 space-y-1.5 opacity-60">
          <p className="text-xs font-bold text-slate-500 uppercase">Period</p>
          <div className="h-4 bg-slate-100 rounded w-2/3" />
          <p className="text-xs font-bold text-slate-500 uppercase">Adjusted ROI</p>
          <div className="h-4 bg-slate-100 rounded w-1/2" />
        </div>
        {/* Arrow above submit button pointing down at it */}
        <div className="flex justify-center">
          <Arrow dir="down" className="w-4 h-4 text-emerald-400" />
        </div>
        <Highlight>
          <div className="bg-slate-900 rounded-xl py-3 text-center">
            <p className="text-xs font-black text-white uppercase">Submit Remittance</p>
          </div>
        </Highlight>
      </div>
    </div>
    <InlineNavBar active="more" />
  </Phone>
);

// Arrow above the Sales tab pointing down at it
const VisualReportNav = () => (
  <Phone>
    <div className="bg-slate-50 h-full flex flex-col">
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide text-center px-4">Tap the Sales tab to see today's summary</p>
      </div>
      <InlineNavBar active="sales" arrowAt="sales" />
    </div>
  </Phone>
);

// ── Vault Deposit visuals ────────────────────────────────────────────────────

const VisualVaultDepositButton = () => (
  <Phone>
    <div className="bg-slate-50 h-full flex flex-col pb-2">
      <div className="bg-white px-3 py-2 border-b border-slate-100">
        <p className="text-xs font-black text-slate-900 uppercase">Sales</p>
      </div>
      <div className="flex-1 p-2 space-y-1.5 overflow-hidden">
        <div className="bg-white rounded-xl p-2 border border-slate-100 flex items-center justify-between opacity-50">
          <p className="text-xs text-slate-600">HILOT BODY · JUAN D.</p>
          <p className="text-xs font-bold text-emerald-600">₱ 300</p>
        </div>
        <div className="bg-white rounded-xl p-2 border border-slate-100 flex items-center justify-between opacity-50">
          <p className="text-xs text-slate-600">HILOT HEAD · MARIA S.</p>
          <p className="text-xs font-bold text-emerald-600">₱ 300</p>
        </div>
        <div className="pt-2 space-y-2">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide px-1">Vault</p>
          <div className="flex justify-center">
            <Arrow dir="down" className="w-4 h-4 text-indigo-400" />
          </div>
          <Highlight>
            <div className="border-2 border-dashed border-indigo-300 bg-indigo-50/50 rounded-xl py-3 flex items-center justify-center gap-2">
              <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
              <p className="text-xs font-black text-indigo-600 uppercase">Deposit to Vault</p>
            </div>
          </Highlight>
        </div>
      </div>
    </div>
    <InlineNavBar active="sales" />
  </Phone>
);

const VisualVaultDepositAmount = () => (
  <Phone>
    <div className="h-full relative">
      <div className="absolute inset-0 bg-slate-50" />
      <div className="absolute inset-0 bg-black/60" />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-4 w-full space-y-2">
          <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center mx-auto">
            <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
          </div>
          <p className="text-xs font-black text-slate-900 uppercase text-center tracking-tight">Deposit to Vault</p>
          <div>
            <p className="text-xs text-slate-400 uppercase mb-1">Amount (₱)</p>
            <Highlight>
              <div className="h-6 bg-indigo-50 rounded-lg border border-indigo-200 flex items-center px-2">
                <p className="text-xs font-black text-indigo-700">500</p>
              </div>
            </Highlight>
          </div>
          <div className="flex justify-center">
            <Arrow dir="down" className="w-3 h-3 text-indigo-400" />
          </div>
          <Highlight>
            <div className="bg-indigo-500 rounded-xl py-2 text-center">
              <p className="text-xs font-black text-white uppercase">Confirm Deposit</p>
            </div>
          </Highlight>
        </div>
      </div>
    </div>
  </Phone>
);

const VisualVaultDepositDone = () => (
  <Phone>
    <div className="bg-slate-50 h-full flex flex-col pb-2">
      <div className="bg-white px-3 py-2 border-b border-slate-100">
        <p className="text-xs font-black text-slate-900 uppercase">Sales</p>
      </div>
      <div className="flex-1 p-2 space-y-1.5">
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-2.5 space-y-0.5">
          <p className="text-xs font-black text-indigo-600 uppercase tracking-widest">Vault Deposit</p>
          <p className="text-xs font-black text-indigo-800">₱ 500.00</p>
          <p className="text-[6px] text-indigo-400">Added to vault balance</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M5 13l4 4L19 7"/></svg>
          <p className="text-xs font-bold text-emerald-700">Vault balance updated successfully.</p>
        </div>
      </div>
    </div>
    <InlineNavBar active="sales" />
  </Phone>
);

// ── Vault Withdrawal visuals ─────────────────────────────────────────────────

const VisualWithdrawExpense = () => (
  <Phone>
    <div className="bg-slate-50 h-full flex flex-col pb-2">
      <div className="bg-white px-3 py-2 border-b border-slate-100">
        <p className="text-xs font-black text-slate-900 uppercase">Sales</p>
      </div>
      <div className="flex-1 p-2 space-y-1 overflow-hidden">
        <div className="bg-white rounded-xl p-2 border border-slate-100 flex items-center justify-between opacity-50">
          <p className="text-xs text-slate-600">HILOT BODY · JUAN D.</p>
          <p className="text-xs font-bold text-emerald-600">₱ 300</p>
        </div>
      </div>
      <div className="px-2 pb-1 space-y-1.5">
        <div className="flex justify-center">
          <Arrow dir="down" className="w-4 h-4 text-emerald-400" />
        </div>
        <Highlight>
          <div className="bg-rose-500 rounded-xl py-2 text-center">
            <p className="text-xs font-black text-white uppercase">Record Expense</p>
          </div>
        </Highlight>
      </div>
    </div>
    <InlineNavBar active="sales" />
  </Phone>
);

const VisualWithdrawCategory = () => (
  <Phone>
    <div className="h-full relative">
      <div className="absolute inset-0 bg-slate-50" />
      <div className="absolute inset-0 bg-black/60" />
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-3 space-y-2 pb-4">
        <div className="w-8 h-1 bg-slate-200 rounded-full mx-auto mb-1" />
        <p className="text-xs font-black text-slate-900 uppercase tracking-tight">Record Expense</p>
        <div>
          <p className="text-xs text-slate-400 uppercase mb-0.5">Description</p>
          <div className="h-4 bg-slate-50 rounded border border-slate-200 px-1.5 flex items-center">
            <p className="text-xs text-slate-600">Emergency supply</p>
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-400 uppercase mb-0.5">Amount</p>
          <div className="h-4 bg-slate-50 rounded border border-slate-200 px-1.5 flex items-center">
            <p className="text-xs text-slate-600">₱ 800</p>
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-400 uppercase mb-0.5">Category</p>
          <div className="flex justify-center mb-0.5">
            <Arrow dir="down" className="w-3 h-3 text-amber-400" />
          </div>
          <Highlight>
            <div className="h-5 bg-amber-50 rounded border border-amber-300 px-1.5 flex items-center justify-between">
              <p className="text-xs font-black text-amber-700">Vault Withdrawal</p>
              <svg className="w-2.5 h-2.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M19 9l-7 7-7-7"/></svg>
            </div>
          </Highlight>
        </div>
        <Highlight>
          <div className="bg-slate-900 rounded-xl py-1.5 text-center">
            <p className="text-xs font-black text-white uppercase">Save Expense</p>
          </div>
        </Highlight>
      </div>
    </div>
  </Phone>
);

// ── Vault concept visuals ────────────────────────────────────────────────────

const VisualVaultConcept = () => (
  <Phone>
    <div className="bg-slate-900 h-full flex flex-col p-3 gap-3 pb-2">
      <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Branch Vault</div>
      <div className="bg-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-widest">Balance</p>
            <p className="text-xl font-black text-white">₱9,500</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400 uppercase tracking-widest">Target (Rent)</p>
            <p className="text-sm font-black text-indigo-400">₱15,000</p>
          </div>
        </div>
        <div>
          <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full" style={{ width: '63%' }} />
          </div>
          <div className="flex justify-between mt-1">
            <p className="text-[6px] text-slate-500">63% funded</p>
            <p className="text-[6px] text-slate-500">₱5,500 to go</p>
          </div>
        </div>
      </div>
      <div className="bg-indigo-900/40 border border-indigo-500/20 rounded-xl p-3 flex items-center gap-2">
        <span className="text-base">🏦</span>
        <div>
          <p className="text-xs font-black text-indigo-300 uppercase tracking-widest">Rent + WiFi Only</p>
          <p className="text-[6px] text-slate-400 mt-0.5">Fixed bills · fixed due date · save daily</p>
        </div>
      </div>
    </div>
    <InlineNavBar active="sales" />
  </Phone>
);

const VisualVaultDailyShare = () => (
  <Phone>
    <div className="bg-slate-900 h-full flex flex-col p-3 gap-3 pb-2">
      <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Daily Share</div>
      <div className="bg-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-center">
            <p className="text-[6px] text-slate-400 uppercase">Monthly Bills</p>
            <p className="text-sm font-black text-white">₱15,000</p>
          </div>
          <div className="text-xs text-slate-500 font-bold">÷ 30</div>
          <div className="text-center">
            <p className="text-[6px] text-slate-400 uppercase">Per Day</p>
            <p className="text-sm font-black text-indigo-400">₱500</p>
          </div>
        </div>
        <div className="border-t border-slate-700 pt-2 text-center">
          <p className="text-[6px] text-slate-500 leading-relaxed">Same amount you used to deposit daily before — now it goes into the vault instead</p>
        </div>
      </div>
      <div className="flex justify-center">
        <Arrow dir="down" className="w-4 h-4 text-indigo-400" />
      </div>
      <Highlight>
        <div className="border-2 border-dashed border-indigo-400 bg-indigo-900/30 rounded-xl py-3 flex items-center justify-center gap-2">
          <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
          <p className="text-xs font-black text-indigo-300 uppercase">Deposit ₱500 Today</p>
        </div>
      </Highlight>
    </div>
    <InlineNavBar active="sales" />
  </Phone>
);

const VisualVaultReady = () => (
  <Phone>
    <div className="bg-slate-900 h-full flex flex-col p-3 gap-3 pb-2">
      <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Branch Vault</div>
      <div className="bg-emerald-900/40 border border-emerald-500/40 rounded-2xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-widest">Balance</p>
            <p className="text-xl font-black text-emerald-400">₱15,000</p>
          </div>
          <div className="bg-emerald-500 rounded-lg px-2 py-1">
            <p className="text-xs font-black text-white uppercase">✓ Ready</p>
          </div>
        </div>
        <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full w-full" />
        </div>
        <p className="text-[6px] text-emerald-400">Target reached — vault fully funded!</p>
      </div>
      <div className="bg-slate-800 rounded-xl p-3 flex items-start gap-2">
        <svg className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        <div>
          <p className="text-xs font-black text-white uppercase">When rent is due</p>
          <p className="text-[6px] text-slate-400 mt-0.5">Record Expense → category: Vault Withdrawal. The vault pays for it.</p>
        </div>
      </div>
    </div>
    <InlineNavBar active="sales" />
  </Phone>
);

// ── Restore hidden staff visuals ─────────────────────────────────────────────

const VisualRestoreStaffPlus = () => (
  <Phone>
    <div className="bg-slate-50 h-full flex flex-col pb-2">
      <div className="bg-white px-3 py-2 border-b border-slate-100">
        <p className="text-xs font-black text-slate-900 uppercase">Staff Performance</p>
      </div>
      <div className="flex-1 p-2 space-y-1.5">
        <div className="bg-white rounded-xl p-2.5 flex items-center justify-between border border-slate-100 opacity-50">
          <div>
            <p className="text-xs font-black text-slate-900">JUAN D.</p>
            <p className="text-xs text-slate-400">₱ 600 · 2 sessions</p>
          </div>
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
        </div>
        <div className="flex items-center justify-between pt-1 px-1">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">1 staff hidden</p>
          <div className="flex items-center gap-1">
            <Arrow dir="right" className="w-3 h-3 text-emerald-400" />
            <Highlight>
              <div className="w-6 h-6 bg-white border border-slate-200 rounded-lg flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M12 5v14m-7-7h14"/></svg>
              </div>
            </Highlight>
          </div>
        </div>
      </div>
    </div>
    <InlineNavBar active="sales" />
  </Phone>
);

const VisualRestoreStaffSelect = () => (
  <Phone>
    <div className="h-full relative">
      <div className="absolute inset-0 bg-slate-50" />
      <div className="absolute inset-0 bg-black/60" />
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-3 space-y-2 pb-5">
        <div className="w-8 h-1 bg-slate-200 rounded-full mx-auto mb-1" />
        <p className="text-xs font-black text-slate-900 uppercase tracking-tight">Restore Hidden Staff</p>
        <div className="flex justify-center mb-0.5">
          <Arrow dir="down" className="w-3 h-3 text-emerald-400" />
        </div>
        <Highlight>
          <div className="bg-white border border-slate-100 rounded-xl p-2.5 flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-slate-900">MARIA S.</p>
              <p className="text-xs text-slate-400">Therapist · Hidden from today</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">
              <p className="text-xs font-black text-emerald-600 uppercase">Restore</p>
            </div>
          </div>
        </Highlight>
      </div>
    </div>
  </Phone>
);

const VisualRestoreStaffDone = () => (
  <Phone>
    <div className="bg-slate-50 h-full flex flex-col pb-2">
      <div className="bg-white px-3 py-2 border-b border-slate-100">
        <p className="text-xs font-black text-slate-900 uppercase">Staff Performance</p>
      </div>
      <div className="flex-1 p-2 space-y-1.5">
        <div className="bg-white rounded-xl p-2.5 flex items-center justify-between border border-slate-100 opacity-50">
          <div>
            <p className="text-xs font-black text-slate-900">JUAN D.</p>
            <p className="text-xs text-slate-400">₱ 600 · 2 sessions</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-2.5 flex items-center justify-between border border-emerald-200 ring-1 ring-emerald-300">
          <div>
            <p className="text-xs font-black text-slate-900">MARIA S.</p>
            <p className="text-xs text-emerald-600 font-bold">Restored · ₱ 0 today</p>
          </div>
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2 flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M5 13l4 4L19 7"/></svg>
          <p className="text-xs font-bold text-emerald-700">Maria S. restored to today's roster.</p>
        </div>
      </div>
    </div>
    <InlineNavBar active="sales" />
  </Phone>
);

// ─── Guide catalog ───────────────────────────────────────────────────────────

const MANAGER_GUIDES: Guide[] = [
  {
    id: 'open-branch',
    title: 'Opening the Branch',
    description: 'How to open the branch at the start of the day.',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M8 11V7a4 4 0 018 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"/></svg>,
    steps: [
      {
        title: 'Find the status button',
        instruction: 'At the top of your screen you will see a red "OFFLINE" badge. Tap the "Open" button next to it to start the business day.',
        visual: <VisualOpenBranch />,
      },
      {
        title: 'Confirm the opening',
        instruction: 'A confirmation dialog will appear. Tap "Confirm Open" to proceed. This enables the POS, staff clock-in, and all other features for the day.',
        visual: <VisualOpenConfirm />,
      },
      {
        title: 'Branch is now open',
        instruction: 'The status changes to a green "ONLINE" badge. The POS tab is now active. You can start clocking in staff and recording sessions.',
        visual: <VisualOpenDone />,
      },
    ],
  },
  {
    id: 'clock-in-staff',
    title: 'Clocking In Staff',
    description: 'How to clock in a therapist or staff member for their shift.',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
    steps: [
      {
        title: 'Go to the Staff tab',
        instruction: 'Tap the "Staff" icon in the bottom navigation bar. This will show you the list of all active staff members assigned to your branch.',
        visual: <VisualStaffNav />,
      },
      {
        title: 'Tap "Clock In"',
        instruction: 'Find the staff member in the list and tap the green "Clock In" button on their card. They will now appear as available in the POS selector.',
        visual: <VisualStaffTab />,
      },
    ],
  },
  {
    id: 'record-session',
    title: 'Recording a Customer Session',
    description: 'How to log a customer appointment through the POS.',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20m-5 5h.01M13 15h.01"/></svg>,
    steps: [
      {
        title: 'Open the POS tab',
        instruction: 'Tap "POS" in the bottom navigation bar. You will see all available services listed as cards. Tap the ones the customer wants to avail.',
        visual: <VisualPOSTab />,
      },
      {
        title: 'Select the therapist',
        instruction: 'After choosing the service, you will be prompted to select a therapist. Only staff who are currently clocked in will appear in the list.',
        visual: <VisualPOSTherapist />,
      },
      {
        title: 'Review and confirm',
        instruction: 'A summary will show the service, therapist, and total amount. Review everything, then tap "Confirm & Save" to record the session.',
        visual: <VisualPOSConfirm />,
      },
    ],
  },
  {
    id: 'log-expense',
    title: 'Logging an Expense',
    description: 'How to record daily operational expenses with a receipt.',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>,
    steps: [
      {
        title: 'Tap "Record Expense"',
        instruction: 'Go to the Sales tab and scroll to the bottom. Tap the "Record Expense" button. A form will open where you can fill in the description, amount, and category.',
        visual: <VisualExpenseForm />,
      },
      {
        title: 'Attach a receipt and save',
        instruction: 'A receipt photo is required for all expenses. Tap the upload area to take a photo or pick from your gallery, then tap "Save Expense".',
        visual: <VisualExpenseSave />,
      },
    ],
  },
  {
    id: 'remittance',
    title: 'Submitting Remittance',
    description: 'How to submit the weekly remittance breakdown to admin.',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.407 2.67 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.407-2.67-1"/></svg>,
    steps: [
      {
        title: 'Open the Remittance tab',
        instruction: 'Go to the "More" section in the bottom nav and tap "Remittance". You will see the Adjusted ROI and each owner\'s cut for the current period.',
        visual: <VisualRemittanceTab />,
      },
      {
        title: 'Submit to admin',
        instruction: 'Once you have reviewed the breakdown and all adjustments are accounted for, tap "Submit Remittance". The admin will then review and approve it.',
        visual: <VisualRemittanceSubmit />,
      },
    ],
  },
  {
    id: 'vault-concept',
    title: 'Understanding the Vault',
    description: 'What the vault is and why you deposit to it — the alkansya concept.',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>,
    steps: [
      {
        title: 'The vault is only for RENT and WiFi',
        instruction: 'The vault fund covers fixed bills with a fixed due date — specifically rent and WiFi. These two never change month to month, so you can plan for them in advance. Electricity and water are NOT included because their amounts vary every month. Those are handled differently.',
        visual: <VisualVaultConcept />,
      },
      {
        title: 'Save daily — like an alkansya',
        instruction: 'Set the vault target to your total rent + WiFi cost (e.g. ₱15,000 rent + ₱1,500 WiFi = ₱16,500 target). Divide by 30 days and you get your daily share — around ₱550. Deposit that amount every closing. No more scrambling on due date — the money is already waiting.',
        visual: <VisualVaultDailyShare />,
      },
      {
        title: 'On due date, withdraw from vault',
        instruction: 'Once the vault is fully funded (green "Ready"), pay the bill by recording a Vault Withdrawal expense. For electricity and water — log those as regular expenses under the Sales tab and pay them from that day\'s cash. If the bill is too large and daily cash can\'t cover it, you may withdraw the shortfall from the vault.',
        visual: <VisualVaultReady />,
      },
    ],
  },
  {
    id: 'vault-deposit',
    title: 'Daily Vault Deposit',
    description: 'How to add your daily share toward rent and WiFi — like dropping coins in an alkansya.',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M12 4v16m8-8H4"/></svg>,
    steps: [
      {
        title: 'Go to Sales and find the Vault section',
        instruction: 'Tap the Sales tab and scroll down until you see the Vault section. Tap "Deposit to Vault" — the button with the dashed border. Do this once a day, usually at closing time.',
        visual: <VisualVaultDepositButton />,
      },
      {
        title: 'Enter today\'s deposit amount',
        instruction: 'A dialog will open. Type the amount you are putting in today. You can use the "Deposit full ROI" checkbox to let the system calculate your share automatically, or enter a custom amount. The system will not let you deposit more than the remaining room in the vault. Tap "Confirm Deposit".',
        visual: <VisualVaultDepositAmount />,
      },
      {
        title: 'Vault balance updated',
        instruction: 'The deposit is recorded and the vault balance goes up. The progress toward the target is saved to today\'s report. Keep depositing daily and the vault will reach its target before the bill is due.',
        visual: <VisualVaultDepositDone />,
      },
    ],
  },
  {
    id: 'vault-withdrawal',
    title: 'Paying Bills — Vault vs. Daily Cash',
    description: 'Rent and WiFi come from the vault. Electricity and water come from daily sales — vault only covers the shortfall.',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>,
    steps: [
      {
        title: 'Electricity and water → regular expense',
        instruction: 'These bills vary every month so they are NOT paid from the vault. Go to Sales → Record Expense, enter the amount, and choose the appropriate category (Operational or Utilities). Pay it from that day\'s cash on hand. If today\'s sales can fully cover it, you\'re done.',
        visual: <VisualWithdrawExpense />,
      },
      {
        title: 'Can\'t cover it from daily cash? Use vault as backup',
        instruction: 'If the electricity or water bill is larger than what today\'s sales can cover, record the shortfall as a separate expense and choose "Vault Withdrawal" as the category. Only the amount that daily cash cannot shoulder should come from the vault — not the full bill.',
        visual: <VisualWithdrawCategory />,
      },
      {
        title: 'Rent and WiFi → always vault withdrawal',
        instruction: 'On due date for rent or WiFi, go to Sales → Record Expense. Enter the full amount and select "Vault Withdrawal" as the category. The vault balance is reduced — your daily ROI is untouched. This is exactly what the vault was built for.',
        visual: <VisualWithdrawCategory />,
      },
    ],
  },
  {
    id: 'restore-staff',
    title: 'Restoring a Removed Staff',
    description: 'How to bring back a staff member accidentally removed from today\'s Sales summary.',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>,
    steps: [
      {
        title: 'Tap the "+" button in Staff Performance',
        instruction: 'On the Sales tab, scroll to the Staff Performance section. If a staff member was accidentally hidden, a note will say how many are hidden. Tap the "+" button to see them.',
        visual: <VisualRestoreStaffPlus />,
      },
      {
        title: 'Tap the staff member to restore',
        instruction: 'A list of hidden staff will appear. Tap the name of the staff member you want to bring back. Their sessions and pay will reappear in the summary.',
        visual: <VisualRestoreStaffSelect />,
      },
      {
        title: 'Staff is restored',
        instruction: 'The staff member is back in the roster. Their recorded sessions and commissions are included in today\'s totals again.',
        visual: <VisualRestoreStaffDone />,
      },
    ],
  },
  {
    id: 'daily-report',
    title: 'Viewing the Daily Summary',
    description: 'Where to see today\'s gross sales, expenses, and net ROI.',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M3 3v18h18m-15-5l4-4 4 4 6-6"/></svg>,
    steps: [
      {
        title: 'Open the Sales summary',
        instruction: 'Tap the "Sales" tab in the bottom navigation bar to view today\'s running totals: Gross Sales, Staff Pay, Expenses, and Net ROI — all updated in real time.',
        visual: <VisualReportNav />,
      },
    ],
  },
];

// ─── Guide viewer ────────────────────────────────────────────────────────────

const GuideViewer = ({ guide, onClose }: { guide: Guide; onClose: () => void }) => {
  const [step, setStep] = useState(0);
  const total = guide.steps.length;
  const current = guide.steps[step];

  return (
    <div className="fixed inset-0 z-[2000] bg-slate-950 flex flex-col animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-6 pb-4 shrink-0">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-white active:scale-95 transition-all"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M6 18L18 6M6 6l12 12"/></svg>
        </button>

        <div className="text-center">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{guide.title}</p>
          <div className="flex items-center gap-1.5 justify-center mt-1.5">
            {guide.steps.map((_, i) => (
              <div
                key={i}
                className={`rounded-full transition-all duration-300 ${i === step ? 'w-5 h-1.5 bg-emerald-400' : 'w-1.5 h-1.5 bg-white/20'}`}
              />
            ))}
          </div>
        </div>

        <div className="w-9 h-9 flex items-center justify-center">
          <span className="text-xs font-black text-slate-500">{step + 1}/{total}</span>
        </div>
      </div>

      {/* Visual */}
      <div className="flex-1 flex items-center justify-center px-6 py-2">
        {current.visual}
      </div>

      {/* Instruction card */}
      <div className="px-4 pb-4 shrink-0">
        <div className="bg-white rounded-3xl p-5 space-y-2">
          <p className="text-xs font-black text-emerald-600 uppercase tracking-widest">Step {step + 1}</p>
          <h3 className="text-base font-black text-slate-900 uppercase tracking-tight leading-tight">{current.title}</h3>
          <p className="text-xs text-slate-500 font-medium leading-relaxed">{current.instruction}</p>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-3 gap-3">
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            className="flex-1 h-12 rounded-2xl bg-white/10 border border-white/10 text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-20 active:scale-95 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M15 19l-7-7 7-7"/></svg>
            Back
          </button>

          {step < total - 1 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              className="flex-[2] h-12 rounded-2xl bg-emerald-500 text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-emerald-500/30"
            >
              Next
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M9 5l7 7-7 7"/></svg>
            </button>
          ) : (
            <button
              onClick={onClose}
              className="flex-[2] h-12 rounded-2xl bg-slate-700 text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              Done
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Main section ────────────────────────────────────────────────────────────

export const HowToSection: React.FC<HowToSectionProps> = ({ role }) => {
  const [activeGuide, setActiveGuide] = useState<Guide | null>(null);

  if (activeGuide) {
    return <GuideViewer guide={activeGuide} onClose={() => setActiveGuide(null)} />;
  }

  if (role !== UserRole.BRANCH_MANAGER) {
    // Superadmin: keep the original static content
    return (
      <div className="max-w-3xl mx-auto space-y-8 pb-32 px-2">
        <div className="text-center space-y-2 pt-4">
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Network Blueprint</h2>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">HilotCenter Core — Superadmin Reference</p>
        </div>
        {[
          { title: 'Branch Deployment', desc: 'Register a new branch in the Branches tab. It initializes with a 6-digit PIN and stays Offline until a manager completes the profile handshake.' },
          { title: 'Catalog Relay', desc: 'Manage service pricing globally via Catalogs. Link master catalogs to branches — changes broadcast instantly to all linked nodes.' },
          { title: 'Identity Registry', desc: 'Use Staff Master to register personnel. Assign managers to branch slots in the Branch Editor to enable their login permissions.' },
          { title: 'Portal Users', desc: 'Create limited-access accounts under Portal Users. Choose which dashboard tabs each account can see. Toggle "Full Admin Access" for a superadmin account.' },
          { title: 'Remittance Approvals', desc: 'Branch managers submit their weekly remittance breakdown. Review and approve or reject with a note in the Remittances tab.' },
          { title: 'Audit & Security', desc: 'All edits, deletions, and logins are logged in the Audit tab with performer identity and timestamp. Use Force Logout from Branch Editor to remotely terminate sessions.' },
        ].map((item, i) => (
          <div key={i} className="bg-white border border-slate-100 rounded-2xl p-5">
            <p className="text-xs font-black text-emerald-600 uppercase tracking-widest mb-1">0{i + 1}</p>
            <h3 className="font-black text-slate-900 uppercase tracking-tight text-sm mb-1.5">{item.title}</h3>
            <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>
    );
  }

  // Branch Manager: interactive guide catalog
  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-32 px-2">
      {/* Header */}
      <div className="text-center space-y-2 pt-4">
        <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-100 px-4 py-1.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-black uppercase tracking-[0.35em] text-emerald-600">Interactive Guides</span>
        </div>
        <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">How-To Guides</h2>
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Tap a guide to start a step-by-step walkthrough</p>
      </div>

      {/* Guide grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {MANAGER_GUIDES.map(guide => (
          <button
            key={guide.id}
            onClick={() => setActiveGuide(guide)}
            className="bg-white border border-slate-100 rounded-2xl p-5 text-left group hover:shadow-lg hover:border-slate-200 active:scale-[0.98] transition-all flex items-start gap-4"
          >
            <div className="w-11 h-11 bg-slate-50 rounded-xl flex items-center justify-center text-slate-500 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors shrink-0">
              {guide.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="font-black text-slate-900 text-sm uppercase tracking-tight leading-tight">{guide.title}</p>
                <svg className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M9 5l7 7-7 7"/></svg>
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{guide.description}</p>
              <div className="flex items-center gap-1 mt-2">
                {guide.steps.map((_, i) => (
                  <div key={i} className="w-1 h-1 rounded-full bg-slate-200 group-hover:bg-emerald-300 transition-colors" />
                ))}
                <span className="text-xs font-bold text-slate-300 ml-1 uppercase tracking-widest">{guide.steps.length} step{guide.steps.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Footer tip */}
      <div className="bg-slate-900 rounded-2xl p-5 flex items-start gap-4">
        <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-700">Need help?</p>
          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">Contact the Superadmin if you cannot clock in, if a session fails to save, or if you need a record corrected.</p>
        </div>
      </div>
    </div>
  );
};
