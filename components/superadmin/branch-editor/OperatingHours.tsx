
import React from 'react';
import { Branch } from '../../../types';

interface OperatingHoursProps {
  openingTime: string;
  closingTime: string;
  isSaving: boolean;
  isOperationalToday: boolean;
  onUpdate: (updates: Partial<Branch>) => void;
}

export const OperatingHours: React.FC<OperatingHoursProps> = ({ 
  openingTime, closingTime, isSaving, isOperationalToday, onUpdate 
}) => {
  return (
    <section className="space-y-5 animate-in slide-in-from-bottom-3 duration-500">
      <div className="flex justify-between items-center px-1">
        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.25em]">Operating Hours & Shifts</h4>
        {isOperationalToday && (
          <span className="text-[7px] font-bold bg-amber-50 text-amber-600 px-2 py-0.5 rounded border border-amber-100 uppercase tracking-widest animate-pulse">Window Locked</span>
        )}
      </div>
      <div className="bg-slate-50/50 p-6 rounded-[32px] space-y-8 border border-slate-100 shadow-inner">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-[10px] font-semibold uppercase text-slate-500 ml-1 tracking-widest">Opening Hour</label>
            <input 
              type="time" 
              disabled={isSaving || isOperationalToday}
              value={openingTime || '09:00'} 
              onChange={(e) => onUpdate({ openingTime: e.target.value })} 
              className={`w-full p-4 border rounded-2xl font-bold text-[14px] uppercase tracking-wider outline-none transition-all shadow-sm ${isOperationalToday ? 'bg-slate-100 border-transparent text-slate-400 cursor-not-allowed' : 'bg-white border-slate-100 text-slate-900 focus:border-emerald-500'}`} 
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-semibold uppercase text-slate-500 ml-1 tracking-widest">Closing Hour</label>
            <input 
              type="time" 
              disabled={isSaving || isOperationalToday}
              value={closingTime || '22:00'} 
              onChange={(e) => onUpdate({ closingTime: e.target.value })} 
              className={`w-full p-4 border rounded-2xl font-bold text-[14px] uppercase tracking-widest outline-none transition-all shadow-sm ${isOperationalToday ? 'bg-slate-100 border-transparent text-slate-400 cursor-not-allowed' : 'bg-white border-slate-100 text-slate-900 focus:border-emerald-500'}`}
            />
          </div>
        </div>

        {isOperationalToday && (
          <p className="text-[9px] font-bold text-amber-600 uppercase text-center px-4 leading-relaxed">
            Time parameters cannot be modified while active operational data exists for today.
          </p>
        )}

        <div className="flex items-center justify-between p-5 bg-white/50 rounded-2xl border border-slate-100/50 transition-all duration-300 opacity-60">
          <div className="space-y-1 overflow-hidden">
             <div className="flex items-center gap-2">
              <p className="text-[10px] font-bold uppercase text-slate-900 tracking-widest">Clock In/Out System</p>
              <span className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded text-[7px] font-bold uppercase border border-indigo-100">Upcoming</span>
             </div>
             <p className="text-[9px] font-semibold text-slate-400 uppercase">Shift Tracking Protocol</p>
          </div>
          <button 
            disabled={true}
            className={`px-8 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest border-2 transition-all bg-white border-slate-100 text-slate-200 cursor-not-allowed`}
          >
            LOCKED
          </button>
        </div>
      </div>
    </section>
  );
};
