
import React from 'react';

interface VaultBalanceHeroProps {
  balance: number;
  depositCount: number;
  payoutCount: number;
}

export const VaultBalanceHero: React.FC<VaultBalanceHeroProps> = ({ balance, depositCount, payoutCount }) => {
  return (
    <div className="px-1 mb-6">
      {/* MAIN BALANCE CARD */}
      <div
          className="bg-slate-900 p-6 sm:p-8 rounded-[32px] shadow-xl relative overflow-hidden border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-6 sm:gap-10">

        {/* Dynamic Glows */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/10 blur-[80px] rounded-full -mr-32 -mt-32 animate-pulse"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500/10 blur-[60px] rounded-full -ml-24 -mb-24"></div>

        <div className="relative z-10 space-y-2 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-400 border border-rose-500/30">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-[0.3em]">
              Vault Reserve
            </p>
          </div>

          <div className="space-y-0">
            <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tighter tabular-nums leading-none">
              <span className="text-slate-500 text-xl mr-1 font-bold">₱</span>
              {balance.toLocaleString()}
            </h2>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">
              Accumulated for Monthly Bills
            </p>
          </div>
        </div>

        {/* Stats Section */}
        <div className="relative z-10 flex items-center gap-8 bg-white/5 backdrop-blur-md px-6 py-4 rounded-[24px] border border-white/10 shadow-xl">
          <div className="flex flex-col items-center">
            <p className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-1">
              Provisions
            </p>
            <p className="text-xl font-black text-white tabular-nums">
              {depositCount}
            </p>
          </div>

          <div className="w-px h-8 bg-white/10"></div>

          <div className="flex flex-col items-center">
            <p className="text-xs font-black text-rose-400 uppercase tracking-widest mb-1">
              Settlements
            </p>
            <p className="text-xl font-black text-white tabular-nums">
              {payoutCount}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
