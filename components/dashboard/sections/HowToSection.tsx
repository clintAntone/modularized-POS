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
  <div className="relative mx-auto w-[220px] h-[380px] bg-slate-900 rounded-[36px] shadow-2xl border-4 border-slate-700 overflow-hidden flex flex-col">
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
          <span className="text-[7px] font-bold uppercase tracking-widest">{t.label}</span>
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
            <span className="text-[7px] font-bold uppercase tracking-widest">{t.label}</span>
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
      <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Branch Status</div>
      <div className="bg-slate-700 rounded-2xl px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-[8px] text-slate-400 uppercase">Status</p>
          <p className="text-xs font-black text-rose-400 uppercase">● Offline</p>
        </div>
        {/* Arrow points right toward the Open button */}
        <div className="flex items-center gap-2">
          <Arrow dir="right" className="w-4 h-4 text-emerald-400" />
          <Highlight>
            <div className="bg-emerald-500 rounded-xl px-3 py-1.5">
              <p className="text-[8px] font-black text-white uppercase">Open</p>
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
        <p className="text-[9px] font-black text-slate-900 uppercase text-center tracking-tight">Open Branch?</p>
        <p className="text-[7px] text-slate-400 text-center leading-relaxed">This will start the business day and enable the POS.</p>
        {/* Arrow above the confirm button pointing down at it */}
        <div className="flex justify-center pt-1">
          <Arrow dir="down" className="w-4 h-4 text-emerald-500" />
        </div>
        <Highlight>
          <div className="bg-slate-900 rounded-xl py-2 text-center">
            <p className="text-[8px] font-black text-white uppercase">Confirm Open</p>
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
          <p className="text-[8px] text-slate-400 uppercase">Status</p>
          <p className="text-xs font-black text-emerald-400 uppercase">● Online</p>
        </div>
        <div className="bg-slate-600 rounded-xl px-3 py-1.5">
          <p className="text-[8px] font-black text-slate-300 uppercase">Close</p>
        </div>
      </div>
      <div className="bg-emerald-900/30 border border-emerald-500/20 rounded-xl p-3">
        <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Branch is now open!</p>
        <p className="text-[7px] text-slate-400 mt-0.5">POS and staff features are now active.</p>
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
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center px-4">Tap the Staff tab in the bottom bar</p>
      </div>
      <InlineNavBar active="staff" arrowAt="staff" />
    </div>
  </Phone>
);

const VisualStaffTab = () => (
  <Phone>
    <div className="bg-slate-50 h-full flex flex-col pb-2">
      <div className="bg-white px-3 py-2 border-b border-slate-100">
        <p className="text-[8px] font-black text-slate-900 uppercase tracking-tight">Staff on Duty</p>
      </div>
      <div className="flex-1 p-2 space-y-1.5">
        {/* First row highlighted */}
        <div className="bg-white rounded-xl p-2.5 flex items-center justify-between border border-slate-100">
          <div>
            <p className="text-[8px] font-black text-slate-900">JUAN D.</p>
            <p className="text-[7px] text-slate-400">Therapist · Not clocked in</p>
          </div>
          {/* Arrow points right toward Clock In */}
          <div className="flex items-center gap-1.5">
            <Arrow dir="right" className="w-3 h-3 text-emerald-400" />
            <Highlight>
              <div className="bg-emerald-500 rounded-lg px-2 py-1">
                <p className="text-[7px] font-black text-white uppercase">Clock In</p>
              </div>
            </Highlight>
          </div>
        </div>
        <div className="bg-white rounded-xl p-2.5 flex items-center justify-between border border-slate-100 opacity-40">
          <div>
            <p className="text-[8px] font-black text-slate-900">MARIA S.</p>
            <p className="text-[7px] text-slate-400">Therapist · Not clocked in</p>
          </div>
          <div className="bg-emerald-500 rounded-lg px-2 py-1">
            <p className="text-[7px] font-black text-white uppercase">Clock In</p>
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
        <p className="text-[8px] font-black text-slate-900 uppercase">Point of Sale</p>
      </div>
      <div className="flex-1 p-2 space-y-1.5">
        {/* First service highlighted */}
        <Highlight>
          <div className="bg-white rounded-xl p-2.5 flex items-center justify-between border border-slate-100">
            <div>
              <p className="text-[7px] font-black text-slate-900">HILOT BODY (60 min)</p>
              <p className="text-[7px] text-emerald-600 font-bold">₱ 300</p>
            </div>
            <div className="w-5 h-5 rounded-full border-2 border-emerald-400 bg-emerald-50" />
          </div>
        </Highlight>
        {['HILOT HEAD (30 min)', 'COMBINATION'].map(s => (
          <div key={s} className="bg-white rounded-xl p-2.5 flex items-center justify-between border border-slate-100 opacity-40">
            <div>
              <p className="text-[7px] font-black text-slate-900">{s}</p>
              <p className="text-[7px] text-emerald-600 font-bold">₱ 300</p>
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
        <p className="text-[8px] font-black text-slate-900 uppercase">Select Therapist</p>
      </div>
      <div className="flex-1 p-2 space-y-1.5">
        <Highlight>
          <div className="bg-white rounded-xl p-2.5 flex items-center justify-between border border-slate-100">
            <p className="text-[8px] font-black text-slate-900">JUAN D.</p>
            <div className="w-5 h-5 rounded-full border-2 border-emerald-400 bg-emerald-50" />
          </div>
        </Highlight>
        <div className="bg-white rounded-xl p-2.5 flex items-center justify-between border border-slate-100 opacity-40">
          <p className="text-[8px] font-black text-slate-900">MARIA S.</p>
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
        <p className="text-[8px] font-black text-slate-900 uppercase">Summary</p>
      </div>
      <div className="flex-1 p-2 space-y-1.5">
        <div className="bg-white rounded-xl p-2.5 border border-slate-100 space-y-1">
          <p className="text-[7px] text-slate-400 uppercase">Service</p>
          <p className="text-[8px] font-black text-slate-900">HILOT BODY (60 min)</p>
          <p className="text-[7px] text-slate-400 uppercase">Therapist</p>
          <p className="text-[8px] font-black text-slate-900">JUAN D.</p>
          <p className="text-[7px] text-slate-400 uppercase">Total</p>
          <p className="text-[10px] font-black text-emerald-600">₱ 300.00</p>
        </div>
        {/* Arrow above the confirm button pointing down at it */}
        <div className="flex justify-center">
          <Arrow dir="down" className="w-4 h-4 text-emerald-400" />
        </div>
        <Highlight>
          <div className="bg-slate-900 rounded-xl py-2 text-center">
            <p className="text-[8px] font-black text-white uppercase">Confirm & Save</p>
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
        <p className="text-[8px] font-black text-slate-900 uppercase">Sales</p>
      </div>
      <div className="flex-1 p-2 space-y-1 overflow-hidden">
        {['HILOT BODY · JUAN D.', 'HILOT HEAD · MARIA S.'].map(s => (
          <div key={s} className="bg-white rounded-xl p-2 border border-slate-100 flex items-center justify-between opacity-50">
            <p className="text-[7px] text-slate-600">{s}</p>
            <p className="text-[7px] font-bold text-emerald-600">₱ 300</p>
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
            <p className="text-[8px] font-black text-white uppercase">Record Expense</p>
          </div>
        </Highlight>
        <div className="bg-slate-300 rounded-xl py-2 text-center opacity-40">
          <p className="text-[8px] font-black text-slate-600 uppercase">Daily Deposit</p>
        </div>
      </div>
    </div>
    <InlineNavBar active="sales" />
  </Phone>
);

const VisualDailyDeposit = () => (
  <Phone>
    <div className="bg-slate-50 h-full flex flex-col pb-2">
      <div className="bg-white px-3 py-2 border-b border-slate-100">
        <p className="text-[8px] font-black text-slate-900 uppercase">Sales</p>
      </div>
      <div className="flex-1 p-2 space-y-1 overflow-hidden">
        {['HILOT BODY · JUAN D.', 'HILOT HEAD · MARIA S.'].map(s => (
          <div key={s} className="bg-white rounded-xl p-2 border border-slate-100 flex items-center justify-between opacity-50">
            <p className="text-[7px] text-slate-600">{s}</p>
            <p className="text-[7px] font-bold text-emerald-600">₱ 300</p>
          </div>
        ))}
      </div>
      {/* Bottom action buttons — arrow points down to Daily Deposit */}
      <div className="px-2 pb-1 space-y-1.5">
        <div className="flex justify-center">
          <Arrow dir="down" className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="bg-slate-300 rounded-xl py-2 text-center opacity-40">
          <p className="text-[8px] font-black text-slate-600 uppercase">Record Expense</p>
        </div>
        <Highlight>
          <div className="bg-blue-500 rounded-xl py-2 text-center">
            <p className="text-[8px] font-black text-white uppercase">Daily Deposit</p>
          </div>
        </Highlight>
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
          <p className="text-[8px] font-black text-slate-900 uppercase">Sales</p>
        </div>
        <div className="p-2 space-y-1">
          {['HILOT BODY · JUAN D.', 'HILOT HEAD · MARIA S.'].map(s => (
            <div key={s} className="bg-white rounded-xl p-2 border border-slate-100 flex items-center justify-between">
              <p className="text-[7px] text-slate-600">{s}</p>
              <p className="text-[7px] font-bold text-emerald-600">₱ 300</p>
            </div>
          ))}
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-slate-800 flex items-center justify-around px-1 py-2">
          {['POS', 'Sales', 'Staff', 'More'].map((t, i) => (
            <div key={t} className={`flex flex-col items-center gap-0.5 px-2 ${i === 1 ? 'text-emerald-400' : 'text-slate-500'}`}>
              <div className="w-4 h-4 rounded bg-current opacity-60" />
              <span className="text-[7px] font-bold uppercase tracking-widest">{t}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Dark overlay fully covers the background */}
      <div className="absolute inset-0 bg-black/60" />
      {/* Bottom sheet modal on top */}
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-3 space-y-2 pb-4">
        <div className="w-8 h-1 bg-slate-200 rounded-full mx-auto mb-1" />
        <p className="text-[9px] font-black text-slate-900 uppercase tracking-tight">Record Expense</p>
        {['Description', 'Amount', 'Category'].map(f => (
          <div key={f}>
            <p className="text-[7px] text-slate-400 uppercase mb-0.5">{f}</p>
            <div className="h-4 bg-slate-50 rounded border border-slate-200" />
          </div>
        ))}
        <div className="flex justify-center pt-0.5">
          <Arrow dir="down" className="w-3 h-3 text-emerald-400" />
        </div>
        <Highlight>
          <div className="bg-slate-900 rounded-xl py-1.5 text-center">
            <p className="text-[8px] font-black text-white uppercase">Save Expense</p>
          </div>
        </Highlight>
      </div>
    </div>
  </Phone>
);

const VisualDailyDepositConfirm = () => (
  <Phone>
    <div className="h-full relative">
      {/* Background — Sales tab (dimmed) */}
      <div className="absolute inset-0 bg-slate-50">
        <div className="bg-white px-3 py-2 border-b border-slate-100">
          <p className="text-[8px] font-black text-slate-900 uppercase">Sales</p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-slate-800 flex items-center justify-around px-1 py-2">
          {['POS', 'Sales', 'Staff', 'More'].map((t, i) => (
            <div key={t} className={`flex flex-col items-center gap-0.5 px-2 ${i === 1 ? 'text-emerald-400' : 'text-slate-500'}`}>
              <div className="w-4 h-4 rounded bg-current opacity-60" />
              <span className="text-[7px] font-bold uppercase tracking-widest">{t}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/60" />
      {/* Centered confirmation dialog */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-4 w-full space-y-2">
          <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center mx-auto">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
          </div>
          <p className="text-[9px] font-black text-slate-900 uppercase text-center tracking-tight">Log Daily Deposit?</p>
          <p className="text-[7px] text-slate-400 text-center leading-relaxed">Make sure you have already collected it before confirming.</p>
          <div className="flex justify-center pt-1">
            <Arrow dir="down" className="w-4 h-4 text-blue-500" />
          </div>
          <Highlight>
            <div className="bg-blue-500 rounded-xl py-2 text-center">
              <p className="text-[8px] font-black text-white uppercase">Yes, Confirm</p>
            </div>
          </Highlight>
          <div className="bg-slate-100 rounded-xl py-1.5 text-center">
            <p className="text-[8px] font-black text-slate-400 uppercase">Cancel</p>
          </div>
        </div>
      </div>
    </div>
  </Phone>
);

const VisualRemittanceTab = () => (
  <Phone>
    <div className="bg-slate-50 h-full flex flex-col pb-2">
      <div className="bg-white px-3 py-2 border-b border-slate-100">
        <p className="text-[8px] font-black text-slate-900 uppercase">Remittance</p>
      </div>
      <div className="flex-1 p-2 space-y-1.5">
        <div className="bg-white rounded-xl p-2.5 border border-slate-100 space-y-1">
          <p className="text-[7px] text-slate-400 uppercase">Adjusted ROI</p>
          <p className="text-[14px] font-black text-slate-900">₱ 4,200.00</p>
          <div className="grid grid-cols-2 gap-1 pt-1">
            {['OWNER A 50%', 'OWNER B 50%'].map(o => (
              <div key={o} className="bg-slate-50 rounded-lg p-1.5">
                <p className="text-[6px] text-slate-400">{o}</p>
                <p className="text-[8px] font-black text-slate-700">₱ 2,100</p>
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
          <p className="text-[7px] font-bold text-slate-500 uppercase">Period</p>
          <div className="h-4 bg-slate-100 rounded w-2/3" />
          <p className="text-[7px] font-bold text-slate-500 uppercase">Adjusted ROI</p>
          <div className="h-4 bg-slate-100 rounded w-1/2" />
        </div>
        {/* Arrow above submit button pointing down at it */}
        <div className="flex justify-center">
          <Arrow dir="down" className="w-4 h-4 text-emerald-400" />
        </div>
        <Highlight>
          <div className="bg-slate-900 rounded-xl py-3 text-center">
            <p className="text-[8px] font-black text-white uppercase">Submit Remittance</p>
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
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center px-4">Tap the Sales tab to see today's summary</p>
      </div>
      <InlineNavBar active="sales" arrowAt="sales" />
    </div>
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
    id: 'daily-deposit',
    title: 'Logging a Daily Deposit',
    description: 'How to record the daily cash deposit from the branch.',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>,
    steps: [
      {
        title: 'Tap "Daily Deposit"',
        instruction: 'Go to the Sales tab and scroll to the bottom. Tap the "Daily Deposit" button.',
        visual: <VisualDailyDeposit />,
      },
      {
        title: 'Confirm the deposit',
        instruction: 'A confirmation dialog will appear. Make sure you have already collected the deposit before tapping "Yes, Confirm". This cannot be undone.',
        visual: <VisualDailyDepositConfirm />,
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
          className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white active:scale-95 transition-all"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M6 18L18 6M6 6l12 12"/></svg>
        </button>

        <div className="text-center">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">{guide.title}</p>
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
          <span className="text-[9px] font-black text-slate-500">{step + 1}/{total}</span>
        </div>
      </div>

      {/* Visual */}
      <div className="flex-1 flex items-center justify-center px-6 py-2">
        {current.visual}
      </div>

      {/* Instruction card */}
      <div className="px-4 pb-4 shrink-0">
        <div className="bg-white rounded-3xl p-5 space-y-2">
          <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Step {step + 1}</p>
          <h3 className="text-base font-black text-slate-900 uppercase tracking-tight leading-tight">{current.title}</h3>
          <p className="text-[12px] text-slate-500 font-medium leading-relaxed">{current.instruction}</p>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-3 gap-3">
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            className="flex-1 h-12 rounded-2xl bg-white/10 border border-white/10 text-white font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-20 active:scale-95 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M15 19l-7-7 7-7"/></svg>
            Back
          </button>

          {step < total - 1 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              className="flex-[2] h-12 rounded-2xl bg-emerald-500 text-white font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-emerald-500/30"
            >
              Next
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M9 5l7 7-7 7"/></svg>
            </button>
          ) : (
            <button
              onClick={onClose}
              className="flex-[2] h-12 rounded-2xl bg-slate-700 text-white font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all"
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
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">HilotCenter Core — Superadmin Reference</p>
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
            <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1">0{i + 1}</p>
            <h3 className="font-black text-slate-900 uppercase tracking-tight text-sm mb-1.5">{item.title}</h3>
            <p className="text-[12px] text-slate-500 leading-relaxed">{item.desc}</p>
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
          <span className="text-[8px] font-black uppercase tracking-[0.35em] text-emerald-600">Interactive Guides</span>
        </div>
        <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">How-To Guides</h2>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tap a guide to start a step-by-step walkthrough</p>
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
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{guide.description}</p>
              <div className="flex items-center gap-1 mt-2">
                {guide.steps.map((_, i) => (
                  <div key={i} className="w-1 h-1 rounded-full bg-slate-200 group-hover:bg-emerald-300 transition-colors" />
                ))}
                <span className="text-[8px] font-bold text-slate-300 ml-1 uppercase tracking-widest">{guide.steps.length} step{guide.steps.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Footer tip */}
      <div className="bg-slate-900 rounded-2xl p-5 flex items-start gap-4">
        <div className="w-8 h-8 bg-white/10 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <div>
          <p className="text-[10px] font-black text-white uppercase tracking-widest">Need help?</p>
          <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">Contact the Superadmin if you cannot clock in, if a session fails to save, or if you need a record corrected.</p>
        </div>
      </div>
    </div>
  );
};
