
import React from 'react';
import { motion } from 'motion/react';
import { UI_THEME } from '../../../constants/ui_designs';

interface DeveloperSectionProps {
  version?: string | null;
  onClose?: () => void;
}

export const DeveloperSection: React.FC<DeveloperSectionProps> = ({ version, onClose }) => {
  const devInfo = {
    name: "Clint Antone Raro",
    date: "March 12, 2026",
    backend: "Node.js / Express / Supabase",
    frontend: "React 19 / TypeScript / Tailwind CSS",
    database: "Supabase (PostgreSQL)",
    version: version || "1.0.0"
  };

  return (
    <div className="max-w-4xl mx-auto py-6 sm:py-12 px-4 sm:px-6 animate-in fade-in slide-in-from-bottom-4 duration-700 relative">
      {onClose && (
        <button 
          onClick={onClose}
          className="absolute top-10 right-8 sm:top-16 sm:right-12 z-50 p-2 sm:p-3 bg-slate-900/5 hover:bg-slate-900/10 text-slate-400 hover:text-slate-900 rounded-xl sm:rounded-2xl transition-all active:scale-90"
        >
          <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      )}
      <div className="bg-white rounded-[32px] sm:rounded-[44px] shadow-2xl border border-slate-100 overflow-hidden relative">
        {/* Decorative Background */}
        <div className="absolute top-0 right-0 w-48 h-48 sm:w-64 sm:h-64 bg-emerald-500/5 blur-[80px] sm:blur-[100px] rounded-full -mr-16 -mt-16 sm:-mr-20 sm:-mt-20"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 sm:w-64 sm:h-64 bg-indigo-500/5 blur-[80px] sm:blur-[100px] rounded-full -ml-16 -mb-16 sm:-ml-20 sm:-mb-20"></div>

        <div className="relative z-10 p-6 sm:p-16 space-y-8 sm:space-y-12">
          <div className="text-center space-y-3 sm:space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-slate-900 text-white rounded-2xl sm:rounded-3xl shadow-xl mb-2 sm:mb-4 text-2xl sm:text-3xl">
              👨‍💻
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-900 uppercase tracking-tighter leading-tight">Developer Appreciation</h2>
            <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px] sm:text-xs">System Architect & Lead Engineer</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
            <div className="space-y-4 sm:space-y-6">
              <div className="space-y-1">
                <label className="text-[9px] sm:text-[10px] font-black text-emerald-600 uppercase tracking-widest">Lead Developer</label>
                <p className="text-lg sm:text-xl font-bold text-slate-900">{devInfo.name}</p>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Release Date</label>
                <p className="text-base sm:text-lg font-bold text-slate-700">{devInfo.date}</p>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Build Version</label>
                <p className="text-base sm:text-lg font-bold text-slate-700">v{devInfo.version}</p>
              </div>
            </div>

            <div className="space-y-4 sm:space-y-6">
              <div className="space-y-1">
                <label className="text-[9px] sm:text-[10px] font-black text-indigo-600 uppercase tracking-widest">Frontend Stack</label>
                <p className="text-base sm:text-lg font-bold text-slate-700">{devInfo.frontend}</p>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] sm:text-[10px] font-black text-indigo-600 uppercase tracking-widest">Backend Infrastructure</label>
                <p className="text-base sm:text-lg font-bold text-slate-700">{devInfo.backend}</p>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] sm:text-[10px] font-black text-indigo-600 uppercase tracking-widest">Database Engine</label>
                <p className="text-base sm:text-lg font-bold text-slate-700">{devInfo.database}</p>
              </div>
            </div>
          </div>

          <div className="pt-8 sm:pt-12 border-t border-slate-50 text-center">
            <p className="text-slate-400 text-xs sm:text-sm italic leading-relaxed max-w-lg mx-auto">
              "Thank you for your dedication to building a robust and efficient management system for Hilot Center. Your expertise has transformed our operations into a seamless digital experience."
            </p>
            <div className="mt-6 sm:mt-8 flex justify-center gap-4">
              <div className="px-5 py-2.5 sm:px-6 sm:py-3 bg-slate-50 rounded-xl sm:rounded-2xl border border-slate-100 text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Handcrafted with Excellence
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
