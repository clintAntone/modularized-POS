
import React from 'react';

interface GlobalLoadingOverlayProps {
  isVisible: boolean;
}

export const GlobalLoadingOverlay: React.FC<GlobalLoadingOverlayProps> = ({ isVisible }) => {
  if (!isVisible) return null;
  return (
    <div className="fixed inset-0 z-[10000] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-300 no-print">
      <div className="bg-white rounded-[44px] p-10 shadow-2xl flex flex-col items-center gap-6 max-w-[280px] text-center border border-white/10">
        <div className="relative">
          <div className="w-16 h-16 rounded-3xl bg-emerald-600 animate-pulse shadow-[0_0_30px_#10b981]"></div>
          <div className="absolute inset-0 flex items-center justify-center">
             <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-[12px] font-bold text-slate-900 uppercase tracking-tighter">Synchronizing...</p>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-tight">Establishing Mainframe Link over Network</p>
        </div>
      </div>
    </div>
  );
};
