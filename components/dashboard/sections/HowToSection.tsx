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
    <div className="h-6 bg-slate-800 flex items-center justify-center shrink-0">
      <div className="w-16 h-1.5 bg-slate-600 rounded-full" />
    </div>
    <div className="flex-1 overflow-hidden relative">{children}</div>
  </div>
);

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

const Highlight = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`relative ring-2 ring-emerald-400 rounded-xl shadow-md shadow-emerald-400/20 ${className}`}>
    {children}
    <Pulse className="absolute -top-2 -right-2" />
  </div>
);

const InlineNavBar = ({ active, arrowAt }: { active: string; arrowAt?: string }) => {
  const tabs = [
    { id: 'pos', label: 'POS' },
    { id: 'sales', label: 'Sales' },
    { id: 'staff', label: 'Staff' },
    { id: 'more', label: 'More' },
  ];
  return (
    <div className="shrink-0">
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

// ─── Visual mockups ──────────────────────────────────────────────────────────

const VisualOpenBranch = () => (
  <Phone>
    <div className="bg-slate-900 h-full flex flex-col p-3 gap-3 pb-2">
      <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Branch Status</div>
      <div className="bg-slate-700 rounded-2xl px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400 uppercase">Status</p>
          <p className="text-xs font-black text-rose-400 uppercase">● Offline</p>
        </div>
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

const VisualCloseBranch = () => (
  <Phone>
    <div className="bg-slate-900 h-full flex flex-col p-3 gap-3 pb-2">
      <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Branch Status</div>
      <div className="bg-slate-700 rounded-2xl px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400 uppercase">Status</p>
          <p className="text-xs font-black text-emerald-400 uppercase">● Online</p>
        </div>
        <div className="flex items-center gap-2">
          <Arrow dir="right" className="w-4 h-4 text-rose-400" />
          <Highlight>
            <div className="bg-rose-500 rounded-xl px-3 py-1.5">
              <p className="text-xs font-black text-white uppercase">Close</p>
            </div>
          </Highlight>
        </div>
      </div>
    </div>
    <InlineNavBar active="sales" />
  </Phone>
);

const VisualCloseConfirm = () => (
  <Phone>
    <div className="bg-slate-900/80 h-full flex items-center justify-center p-4 pb-2">
      <div className="bg-white rounded-2xl p-4 w-full space-y-2">
        <div className="w-8 h-8 bg-rose-100 rounded-xl flex items-center justify-center mx-auto">
          <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M6 18L18 6M6 6l12 12"/></svg>
        </div>
        <p className="text-xs font-black text-slate-900 uppercase text-center tracking-tight">Close Branch?</p>
        <p className="text-xs text-slate-400 text-center leading-relaxed">This locks the POS. Make sure all sessions are recorded first.</p>
        <div className="flex justify-center pt-1">
          <Arrow dir="down" className="w-4 h-4 text-rose-400" />
        </div>
        <Highlight>
          <div className="bg-rose-600 rounded-xl py-2 text-center">
            <p className="text-xs font-black text-white uppercase">Confirm Close</p>
          </div>
        </Highlight>
      </div>
    </div>
  </Phone>
);

const VisualCloseDone = () => (
  <Phone>
    <div className="bg-slate-900 h-full flex flex-col p-3 gap-2 pb-2">
      <div className="bg-slate-700 rounded-2xl px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400 uppercase">Status</p>
          <p className="text-xs font-black text-rose-400 uppercase">● Offline</p>
        </div>
        <div className="bg-emerald-500 rounded-xl px-3 py-1.5">
          <p className="text-xs font-black text-white uppercase">Open</p>
        </div>
      </div>
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-3">
        <p className="text-xs font-black text-slate-300 uppercase tracking-widest">Branch closed.</p>
        <p className="text-xs text-slate-400 mt-0.5">Today's report is locked. See you tomorrow.</p>
      </div>
    </div>
    <InlineNavBar active="sales" />
  </Phone>
);

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
        <div className="bg-white rounded-xl p-2.5 flex items-center justify-between border border-slate-100">
          <div>
            <p className="text-xs font-black text-slate-900">JUAN D.</p>
            <p className="text-xs text-slate-400">Therapist · Not clocked in</p>
          </div>
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

const VisualPOSPayment = () => (
  <Phone>
    <div className="bg-slate-50 h-full flex flex-col pb-2">
      <div className="bg-white px-3 py-2 border-b border-slate-100">
        <p className="text-xs font-black text-slate-900 uppercase">Payment Method</p>
      </div>
      <div className="flex-1 p-2 space-y-1.5">
        <p className="text-xs text-slate-400 uppercase px-1 pt-1">How will the customer pay?</p>
        <Highlight>
          <div className="bg-white rounded-xl p-2.5 flex items-center gap-3 border border-slate-100">
            <div className="w-5 h-5 rounded-full border-2 border-emerald-400 bg-emerald-50 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            </div>
            <div>
              <p className="text-xs font-black text-slate-900">Cash</p>
              <p className="text-xs text-slate-400">Physical payment</p>
            </div>
          </div>
        </Highlight>
        <div className="bg-white rounded-xl p-2.5 flex items-center gap-3 border border-slate-100 opacity-50">
          <div className="w-5 h-5 rounded-full border-2 border-slate-200" />
          <div>
            <p className="text-xs font-black text-slate-900">GCash</p>
            <p className="text-xs text-slate-400">Digital transfer</p>
          </div>
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
          <p className="text-xs text-slate-400 uppercase">Payment</p>
          <p className="text-xs font-black text-slate-900">Cash</p>
          <p className="text-xs text-slate-400 uppercase">Total</p>
          <p className="text-xs font-black text-emerald-600">₱ 300.00</p>
        </div>
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
      <div className="absolute inset-0 bg-black/60" />
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

const VisualSalesReportsNav = () => (
  <Phone>
    <div className="bg-slate-50 h-full flex flex-col">
      <div className="flex-1 p-2 space-y-1.5 pt-3">
        <p className="text-xs text-slate-400 uppercase px-1 tracking-wide">More Options</p>
        {[
          { label: 'Sales Reports', highlight: true },
          { label: 'Payroll', highlight: false },
          { label: 'Remittance', highlight: false },
          { label: 'Complaints', highlight: false },
        ].map(item => (
          item.highlight ? (
            <Highlight key={item.label}>
              <div className="bg-white rounded-xl p-2.5 flex items-center justify-between border border-slate-100">
                <p className="text-xs font-black text-slate-900">{item.label}</p>
                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M9 5l7 7-7 7"/></svg>
              </div>
            </Highlight>
          ) : (
            <div key={item.label} className="bg-white rounded-xl p-2.5 flex items-center justify-between border border-slate-100 opacity-40">
              <p className="text-xs font-black text-slate-900">{item.label}</p>
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M9 5l7 7-7 7"/></svg>
            </div>
          )
        ))}
      </div>
      <InlineNavBar active="more" arrowAt="more" />
    </div>
  </Phone>
);

const VisualSalesReportsList = () => (
  <Phone>
    <div className="bg-slate-50 h-full flex flex-col pb-2">
      <div className="bg-white px-3 py-2 border-b border-slate-100">
        <p className="text-xs font-black text-slate-900 uppercase">Sales Reports</p>
      </div>
      <div className="flex-1 p-2 space-y-1.5">
        <Highlight>
          <div className="bg-white rounded-xl p-2.5 border border-slate-100">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black text-slate-900">July 4, 2026</p>
              <span className="text-xs bg-emerald-50 text-emerald-600 font-bold px-1.5 py-0.5 rounded-lg">+₱3,200</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Gross ₱8,400 · 12 sessions</p>
          </div>
        </Highlight>
        {['July 3, 2026', 'July 2, 2026'].map(d => (
          <div key={d} className="bg-white rounded-xl p-2.5 border border-slate-100 opacity-40">
            <p className="text-xs font-black text-slate-900">{d}</p>
            <p className="text-xs text-slate-400 mt-0.5">Tap to view details</p>
          </div>
        ))}
      </div>
    </div>
    <InlineNavBar active="more" />
  </Phone>
);

const VisualSalesReportDetail = () => (
  <Phone>
    <div className="bg-slate-50 h-full flex flex-col pb-2">
      <div className="bg-slate-900 px-3 py-2 flex items-center gap-2">
        <div className="w-6 h-6 bg-white/10 rounded-lg flex items-center justify-center">
          <p className="text-xs">📂</p>
        </div>
        <div>
          <p className="text-xs font-black text-white uppercase">July 4, 2026</p>
          <p className="text-[8px] text-slate-400">Daily Report</p>
        </div>
      </div>
      <div className="flex-1 p-2 space-y-1.5">
        <div className="bg-white rounded-xl p-2.5 border border-slate-100 space-y-1.5">
          <div className="flex justify-between">
            <p className="text-xs text-slate-400">Gross Sales</p>
            <p className="text-xs font-black text-slate-900">₱8,400</p>
          </div>
          <div className="flex justify-between">
            <p className="text-xs text-slate-400">Staff Pay</p>
            <p className="text-xs font-bold text-rose-500">−₱2,800</p>
          </div>
          <div className="flex justify-between">
            <p className="text-xs text-slate-400">Expenses</p>
            <p className="text-xs font-bold text-rose-500">−₱400</p>
          </div>
          <div className="border-t border-slate-100 pt-1 flex justify-between">
            <p className="text-xs font-black text-slate-900">Net ROI</p>
            <p className="text-xs font-black text-emerald-600">₱3,200</p>
          </div>
        </div>
      </div>
    </div>
    <InlineNavBar active="more" />
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
            <p className="text-xs text-slate-400 uppercase tracking-widest">Target</p>
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
          <p className="text-xs font-bold text-emerald-700">Vault balance updated.</p>
        </div>
      </div>
    </div>
    <InlineNavBar active="sales" />
  </Phone>
);

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

const VisualComplaintNav = () => (
  <Phone>
    <div className="bg-slate-50 h-full flex flex-col">
      <div className="flex-1 p-2 space-y-1.5 pt-3">
        <p className="text-xs text-slate-400 uppercase px-1 tracking-wide">More Options</p>
        {[
          { label: 'Sales Reports', highlight: false },
          { label: 'Payroll', highlight: false },
          { label: 'Complaints', highlight: true },
          { label: 'Settings', highlight: false },
        ].map(item => (
          item.highlight ? (
            <Highlight key={item.label}>
              <div className="bg-white rounded-xl p-2.5 flex items-center justify-between border border-slate-100">
                <p className="text-xs font-black text-slate-900">{item.label}</p>
                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M9 5l7 7-7 7"/></svg>
              </div>
            </Highlight>
          ) : (
            <div key={item.label} className="bg-white rounded-xl p-2.5 flex items-center justify-between border border-slate-100 opacity-40">
              <p className="text-xs font-black text-slate-900">{item.label}</p>
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M9 5l7 7-7 7"/></svg>
            </div>
          )
        ))}
      </div>
      <InlineNavBar active="more" arrowAt="more" />
    </div>
  </Phone>
);

const VisualComplaintForm = () => (
  <Phone>
    <div className="h-full relative">
      <div className="absolute inset-0 bg-slate-50" />
      <div className="absolute inset-0 bg-black/60" />
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-3 space-y-2 pb-4">
        <div className="w-8 h-1 bg-slate-200 rounded-full mx-auto mb-1" />
        <p className="text-xs font-black text-slate-900 uppercase tracking-tight">File HR Complaint</p>
        {[
          { label: 'Employee', val: 'JUAN D.' },
          { label: 'Incident Date', val: 'July 4, 2026' },
          { label: 'Description', val: '' },
        ].map(f => (
          <div key={f.label}>
            <p className="text-xs text-slate-400 uppercase mb-0.5">{f.label}</p>
            <div className="h-4 bg-slate-50 rounded border border-slate-200 px-1.5 flex items-center">
              {f.val && <p className="text-xs text-slate-600">{f.val}</p>}
            </div>
          </div>
        ))}
        <div className="flex justify-center pt-0.5">
          <Arrow dir="down" className="w-3 h-3 text-rose-400" />
        </div>
        <Highlight>
          <div className="bg-rose-600 rounded-xl py-1.5 text-center">
            <p className="text-xs font-black text-white uppercase">Submit Complaint</p>
          </div>
        </Highlight>
      </div>
    </div>
  </Phone>
);

const VisualComplaintSent = () => (
  <Phone>
    <div className="bg-slate-50 h-full flex flex-col pb-2">
      <div className="bg-white px-3 py-2 border-b border-slate-100">
        <p className="text-xs font-black text-slate-900 uppercase">Complaints</p>
      </div>
      <div className="flex-1 p-2 space-y-1.5">
        <Highlight>
          <div className="bg-white rounded-xl p-2.5 border border-slate-100">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-black text-slate-900">JUAN D.</p>
              <span className="text-[8px] bg-amber-50 text-amber-600 font-bold px-1.5 py-0.5 rounded-full uppercase">Pending</span>
            </div>
            <p className="text-xs text-slate-400">July 4, 2026 · Awaiting admin review</p>
          </div>
        </Highlight>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M5 13l4 4L19 7"/></svg>
          <p className="text-xs font-bold text-emerald-700">Complaint sent to admin for review.</p>
        </div>
      </div>
    </div>
    <InlineNavBar active="more" />
  </Phone>
);

const VisualBackfillNav = () => (
  <Phone>
    <div className="bg-slate-50 h-full flex flex-col">
      <div className="flex-1 p-2 space-y-1.5 pt-3">
        <p className="text-xs text-slate-400 uppercase px-1 tracking-wide">More Options</p>
        {[
          { label: 'Sales Reports', highlight: false },
          { label: 'Backfill', highlight: true },
          { label: 'Complaints', highlight: false },
          { label: 'Settings', highlight: false },
        ].map(item => (
          item.highlight ? (
            <Highlight key={item.label}>
              <div className="bg-white rounded-xl p-2.5 flex items-center justify-between border border-slate-100">
                <p className="text-xs font-black text-slate-900">{item.label}</p>
                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M9 5l7 7-7 7"/></svg>
              </div>
            </Highlight>
          ) : (
            <div key={item.label} className="bg-white rounded-xl p-2.5 flex items-center justify-between border border-slate-100 opacity-40">
              <p className="text-xs font-black text-slate-900">{item.label}</p>
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M9 5l7 7-7 7"/></svg>
            </div>
          )
        ))}
      </div>
      <InlineNavBar active="more" arrowAt="more" />
    </div>
  </Phone>
);

const VisualBackfillType = () => (
  <Phone>
    <div className="bg-slate-50 h-full flex flex-col pb-2">
      <div className="bg-white px-3 py-2 border-b border-slate-100">
        <p className="text-xs font-black text-slate-900 uppercase">Backfill Request</p>
      </div>
      <div className="flex-1 p-2 space-y-1.5 pt-2">
        <p className="text-xs text-slate-400 uppercase px-1">What needs to be corrected?</p>
        <Highlight>
          <div className="bg-white rounded-xl p-2.5 border border-slate-100">
            <p className="text-xs font-black text-slate-900">Missing Transaction</p>
            <p className="text-xs text-slate-400 mt-0.5">A session was not recorded in the POS</p>
          </div>
        </Highlight>
        {['Missing Attendance', 'Missing Report'].map(t => (
          <div key={t} className="bg-white rounded-xl p-2.5 border border-slate-100 opacity-40">
            <p className="text-xs font-black text-slate-900">{t}</p>
          </div>
        ))}
      </div>
    </div>
    <InlineNavBar active="more" />
  </Phone>
);

const VisualBackfillSubmit = () => (
  <Phone>
    <div className="bg-slate-50 h-full flex flex-col pb-2">
      <div className="bg-white px-3 py-2 border-b border-slate-100">
        <p className="text-xs font-black text-slate-900 uppercase">Backfill · Transaction</p>
      </div>
      <div className="flex-1 p-2 space-y-1.5">
        <div className="bg-white rounded-xl p-2.5 border border-slate-100 space-y-1.5 opacity-70">
          <div>
            <p className="text-xs text-slate-400 uppercase">Date</p>
            <p className="text-xs font-bold text-slate-700">July 3, 2026</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase">Service · Therapist</p>
            <p className="text-xs font-bold text-slate-700">HILOT BODY · JUAN D.</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase">Reason</p>
            <p className="text-xs font-bold text-slate-700">System was offline</p>
          </div>
        </div>
        <div className="flex justify-center">
          <Arrow dir="down" className="w-4 h-4 text-emerald-400" />
        </div>
        <Highlight>
          <div className="bg-slate-900 rounded-xl py-2 text-center">
            <p className="text-xs font-black text-white uppercase">Send to Admin</p>
          </div>
        </Highlight>
      </div>
    </div>
    <InlineNavBar active="more" />
  </Phone>
);

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
    description: 'How to open the branch at the start of the business day.',
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
    id: 'close-branch',
    title: 'Closing the Branch',
    description: 'How to close the branch at the end of the day after all sessions are done.',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M6 18L18 6M6 6l12 12"/></svg>,
    steps: [
      {
        title: 'Finish all pending sessions first',
        instruction: 'Before closing, make sure all customer sessions are recorded in the POS and all expenses are logged. Once the branch is closed, the POS is locked for the day.',
        visual: <VisualCloseBranch />,
      },
      {
        title: 'Tap "Close" and confirm',
        instruction: 'Tap the "Close" button on the status bar. A confirmation dialog will appear — tap "Confirm Close" to proceed. The branch will go offline immediately.',
        visual: <VisualCloseConfirm />,
      },
      {
        title: 'Branch is closed',
        instruction: 'The status badge turns red and the POS is disabled. Today\'s report is automatically saved. You can still view the Sales summary, but no new sessions can be added.',
        visual: <VisualCloseDone />,
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
        instruction: 'Find the staff member in the list and tap the green "Clock In" button on their card. Their shift start time is recorded and they will appear as available in the POS selector.',
        visual: <VisualStaffTab />,
      },
    ],
  },
  {
    id: 'record-session',
    title: 'Recording a Customer Session',
    description: 'How to log a customer appointment through the POS — including payment method.',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20m-5 5h.01M13 15h.01"/></svg>,
    steps: [
      {
        title: 'Open the POS tab and select a service',
        instruction: 'Tap "POS" in the bottom navigation bar. You will see all available services listed as cards. Tap the service the customer availed.',
        visual: <VisualPOSTab />,
      },
      {
        title: 'Select the therapist',
        instruction: 'After choosing the service, select the therapist who performed it. Only staff who are currently clocked in will appear in the list.',
        visual: <VisualPOSTherapist />,
      },
      {
        title: 'Choose the payment method',
        instruction: 'Select how the customer paid — Cash or GCash. This affects the daily cash vs. GCash breakdown shown in the Sales summary. If unsure, select Cash.',
        visual: <VisualPOSPayment />,
      },
      {
        title: 'Review and confirm',
        instruction: 'A summary will show the service, therapist, payment method, and total amount. Review everything then tap "Confirm & Save" to record the session.',
        visual: <VisualPOSConfirm />,
      },
    ],
  },
  {
    id: 'log-expense',
    title: 'Logging an Expense',
    description: 'How to record daily operational expenses from the Sales tab.',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>,
    steps: [
      {
        title: 'Tap "Record Expense" in the Sales tab',
        instruction: 'Go to the Sales tab and scroll to the bottom. Tap the "Record Expense" button. A form will open where you can fill in the description, amount, and category.',
        visual: <VisualExpenseForm />,
      },
      {
        title: 'Fill in the details and save',
        instruction: 'Enter the expense description, amount, and category (usually "Operational"). A receipt photo is optional but recommended. Tap "Save Expense" when ready.',
        visual: <VisualExpenseSave />,
      },
    ],
  },
  {
    id: 'sales-reports',
    title: 'Viewing Sales Reports',
    description: 'How to browse and open past daily reports from the Sales Reports tab.',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M3 3v18h18m-15-5l4-4 4 4 6-6"/></svg>,
    steps: [
      {
        title: 'Open Sales Reports from the More menu',
        instruction: 'Tap the "More" tab in the bottom navigation bar and select "Sales Reports". This shows a list of all past daily reports for your branch.',
        visual: <VisualSalesReportsNav />,
      },
      {
        title: 'Tap a report to open it',
        instruction: 'Each row shows the date, gross sales, and session count. Tap any date to open the full report — you will see gross, staff pay, expenses, and net ROI.',
        visual: <VisualSalesReportsList />,
      },
      {
        title: 'Read the report breakdown',
        instruction: 'The report shows a complete breakdown: Gross Sales minus Staff Pay, minus Expenses, equals Net ROI. You can also see individual session logs and expense details.',
        visual: <VisualSalesReportDetail />,
      },
    ],
  },
  {
    id: 'remittance',
    title: 'Submitting Weekly Remittance',
    description: 'How to submit the weekly ROI breakdown to admin at the end of each cycle.',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.407 2.67 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.407-2.67-1"/></svg>,
    steps: [
      {
        title: 'Open the Remittance tab',
        instruction: 'Tap "More" in the bottom navigation bar and select "Remittance". You will see the week\'s Adjusted ROI and each owner\'s share for the current period.',
        visual: <VisualRemittanceTab />,
      },
      {
        title: 'Submit to admin',
        instruction: 'Once you have reviewed the breakdown, tap "Submit Remittance". The admin will then receive your submission for review and approval. Do this at the end of every weekly cycle.',
        visual: <VisualRemittanceSubmit />,
      },
    ],
  },
  {
    id: 'vault-concept',
    title: 'Understanding the Vault',
    description: 'What the vault is for and how the daily saving system works — the alkansya concept.',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>,
    steps: [
      {
        title: 'The vault is only for RENT and WiFi',
        instruction: 'The vault fund covers fixed bills with a fixed due date — specifically rent and WiFi. These never change month to month so you can plan ahead. Electricity and water are NOT included because their amounts vary. Those are handled as regular expenses.',
        visual: <VisualVaultConcept />,
      },
      {
        title: 'Save daily — like an alkansya',
        instruction: 'Set the vault target to your total rent + WiFi cost (e.g. ₱15,000 rent + ₱1,500 WiFi = ₱16,500 target). Divide by 30 days and you get your daily share — around ₱550. Deposit that amount every closing. No more scrambling on due date — the money is already waiting.',
        visual: <VisualVaultDailyShare />,
      },
      {
        title: 'On due date, withdraw from vault',
        instruction: 'Once the vault is fully funded (green "Ready"), pay the bill by recording a Vault Withdrawal expense. For electricity and water — log those as regular expenses and pay from that day\'s cash. If the bill is too large, you may withdraw the shortfall from the vault.',
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
        title: 'Go to Sales and tap "Deposit to Vault"',
        instruction: 'Tap the Sales tab and scroll to the Vault section. Tap the "Deposit to Vault" button (dashed border). Do this once a day, usually at closing time.',
        visual: <VisualVaultDepositButton />,
      },
      {
        title: 'Enter the deposit amount',
        instruction: 'Type the amount you are putting in today. You can use the "Deposit full ROI" checkbox to let the system calculate your share automatically, or enter a custom amount. Tap "Confirm Deposit".',
        visual: <VisualVaultDepositAmount />,
      },
      {
        title: 'Vault balance is updated',
        instruction: 'The deposit is recorded and the vault balance increases. The progress toward the target is saved to today\'s report. Keep depositing daily and the vault will reach its target before the bill is due.',
        visual: <VisualVaultDepositDone />,
      },
    ],
  },
  {
    id: 'vault-withdrawal',
    title: 'Paying Bills — Vault vs. Daily Cash',
    description: 'Rent and WiFi come from the vault. Electricity and water come from daily sales.',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>,
    steps: [
      {
        title: 'Electricity and water → regular expense',
        instruction: 'These bills vary every month so they are NOT paid from the vault. Go to Sales → Record Expense, enter the amount, and choose the "Operational" category. Pay it from that day\'s cash on hand.',
        visual: <VisualWithdrawExpense />,
      },
      {
        title: 'Can\'t cover it from daily cash? Use vault as backup',
        instruction: 'If a bill is larger than what today\'s sales can cover, record the shortfall as a separate expense and choose "Vault Withdrawal" as the category. Only the amount that daily cash cannot shoulder should come from the vault — not the full bill.',
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
    id: 'file-complaint',
    title: 'Filing an HR Complaint',
    description: 'How to file a complaint against a staff member for admin review.',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"/></svg>,
    steps: [
      {
        title: 'Open Complaints from the More menu',
        instruction: 'Tap "More" in the bottom navigation bar and select "Complaints". This section lets you file and track HR reports against staff members.',
        visual: <VisualComplaintNav />,
      },
      {
        title: 'Fill in the complaint details',
        instruction: 'Select the staff member involved, the incident date, and describe what happened. You can also add witnesses. Be specific and factual — the admin will review your report.',
        visual: <VisualComplaintForm />,
      },
      {
        title: 'Complaint sent to admin',
        instruction: 'After submitting, the complaint appears as "Pending". The admin will review it and update the status to Acknowledged or Dismissed with a resolution note.',
        visual: <VisualComplaintSent />,
      },
    ],
  },
  {
    id: 'backfill-request',
    title: 'Requesting a Backfill',
    description: 'How to ask admin to add a missing transaction, attendance, or daily report.',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>,
    steps: [
      {
        title: 'Open Backfill from the More menu',
        instruction: 'Tap "More" in the bottom navigation bar and select "Backfill". Use this when you have a missing session, a missed clock-in, or a full day\'s report that was not saved.',
        visual: <VisualBackfillNav />,
      },
      {
        title: 'Choose what needs to be corrected',
        instruction: 'Select the type of backfill: Missing Transaction (a POS session not recorded), Missing Attendance (a clock-in that was missed), or Missing Report (an entire day\'s report).',
        visual: <VisualBackfillType />,
      },
      {
        title: 'Fill in the details and send',
        instruction: 'Enter the date, details of what happened, and the reason (e.g. system was offline, forgot to clock in). Tap "Send to Admin". The request will be reviewed and added to your records once approved.',
        visual: <VisualBackfillSubmit />,
      },
    ],
  },
  {
    id: 'restore-staff',
    title: 'Restoring a Hidden Staff',
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
        instruction: 'A list of hidden staff will appear. Tap "Restore" next to the name you want to bring back. Their sessions and pay will reappear in the summary immediately.',
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
    title: 'Viewing Today\'s Summary',
    description: 'Where to see today\'s running gross sales, expenses, staff pay, and net ROI.',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M3 3v18h18m-15-5l4-4 4 4 6-6"/></svg>,
    steps: [
      {
        title: 'Open the Sales tab',
        instruction: 'Tap the "Sales" tab in the bottom navigation bar to view today\'s running totals: Gross Sales, Staff Pay, Expenses, and Net ROI — all updated in real time as you record sessions and expenses.',
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
        <div className="w-8 h-8 bg-white/10 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <div>
          <p className="text-xs font-semibold text-white">Need help?</p>
          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">Contact the Superadmin if you cannot clock in, if a session fails to save, or if you need a missing record corrected via Backfill.</p>
        </div>
      </div>
    </div>
  );
};
