import React from 'react';
import { Branch } from '../../../types';
import { DAYS_OF_WEEK } from '../../../constants';
import { playSound } from '../../../lib/audio';

interface LifecycleParametersProps {
  weeklyCutoff: number;
  cycleStartDate: string;
  dailyProvisionAmount: number;
  isSaving: boolean;
  onUpdate: (updates: Partial<Branch>) => void;
}

export const LifecycleParameters: React.FC<LifecycleParametersProps> = ({ 
  weeklyCutoff, cycleStartDate, dailyProvisionAmount, isSaving, onUpdate 
}) => {
  return (
    <section className="space-y-5 animate-in slide-in-from-bottom-4 duration-500">
      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.25em] ml-1">Lifecycle Parameters</h4>
      <div className="bg-slate-50/50 p-6 rounded-[32px] space-y-8 border border-slate-100 shadow-inner">
        <div className="space-y-3">
          <label className="block text-[10px] font-semibold uppercase text-slate-500 ml-1 tracking-widest">Cutoff Rotation Day</label>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100">
            {DAYS_OF_WEEK.map((day, idx) => (
              <button 
                key={day} 
                disabled={isSaving}
                onClick={() => { playSound('click'); onUpdate({ weeklyCutoff: idx }); }} 
                className={`py-3 rounded-xl text-[9px] font-bold uppercase transition-all duration-300 ${weeklyCutoff === idx ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
              >
                {day.substring(0, 3)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-[10px] font-semibold uppercase text-slate-500 ml-1 tracking-widest">System Start Date</label>
            <input 
              type="date" 
              disabled={isSaving}
              value={cycleStartDate || ''} 
              onChange={(e) => onUpdate({ cycleStartDate: e.target.value })} 
              className="w-full p-4 bg-white border border-slate-100 rounded-2xl font-bold text-[12px] uppercase tracking-wider text-slate-900 outline-none focus:border-emerald-500 transition-all shadow-sm" 
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-semibold uppercase text-slate-500 ml-1 tracking-widest">Rent & Bills (₱)</label>
            <input 
              type="number" 
              disabled={isSaving}
              // Display empty string if 0 to allow full deletion, otherwise show value
              value={dailyProvisionAmount === 0 ? '' : dailyProvisionAmount} 
              onChange={(e) => {
                const val = e.target.value;
                // Update with 0 if empty string, otherwise cast to number
                onUpdate({ dailyProvisionAmount: val === '' ? 0 : Number(val) });
              }} 
              className="w-full p-4 bg-white border border-slate-100 rounded-2xl font-bold text-[14px] uppercase tracking-widest text-emerald-600 outline-none focus:border-emerald-500 transition-all shadow-sm"
              placeholder="E.G. 800"
            />
          </div>
        </div>
      </div>
    </section>
  );
};