import React, { useState, useMemo } from 'react';
import { Branch } from '../../../types';
import { DAYS_OF_WEEK } from '../../../constants';
import { playSound } from '../../../lib/audio';
import { getWeekRange, parseDate, toDateStr } from '@/src/utils/reportUtils';
import { getTrueDate } from '../../../lib/time';

interface LifecycleParametersProps {
  weeklyCutoff: number;
  originalCutoff: number;
  cycleStartDate: string;
  dailyProvisionAmount: number;
  isSaving: boolean;
  branch: Branch;
  onUpdate: (updates: Partial<Branch>) => void;
}

export const LifecycleParameters: React.FC<LifecycleParametersProps> = ({
  weeklyCutoff, originalCutoff, cycleStartDate, dailyProvisionAmount, isSaving, branch, onUpdate
}) => {
  const cutoffChanged = weeklyCutoff !== originalCutoff;

  // Compute the current week's end date (under the original cutoff) for the date picker max
  const { currentWeekEnd, tomorrow } = useMemo(() => {
    const now = getTrueDate();
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tom = new Date(todayDate);
    tom.setDate(tom.getDate() + 1);
    const { weekEnd } = getWeekRange(todayDate, branch);
    // weekEnd has time 23:59:59, normalize to date only
    const endDate = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate());
    return { currentWeekEnd: toDateStr(endDate), tomorrow: toDateStr(tom) };
  }, [branch]);

  return (
    <section className="space-y-5 animate-in slide-in-from-bottom-4 duration-500">
      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-[0.25em] ml-1">Lifecycle Parameters</h4>
      <div className="bg-slate-50/50 p-6 rounded-2xl space-y-8 border border-slate-100 shadow-inner">
        <div className="space-y-3">
          <label className="block text-xs font-semibold uppercase text-slate-500 ml-1 tracking-widest">Cutoff Rotation Day</label>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100">
            {DAYS_OF_WEEK.map((day, idx) => (
              <button
                key={day}
                disabled={isSaving}
                onClick={() => {
                  playSound('click');
                  if (idx !== originalCutoff) {
                    onUpdate({ weeklyCutoff: idx, cutoffEffectiveDate: tomorrow });
                  } else {
                    onUpdate({ weeklyCutoff: idx, cutoffEffectiveDate: undefined });
                  }
                }}
                className={`py-3 rounded-xl text-xs font-bold uppercase transition-all duration-300 ${weeklyCutoff === idx ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
              >
                {day.substring(0, 3)}
              </button>
            ))}
          </div>
        </div>

        {cutoffChanged && (
          <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
            <label className="block text-xs font-semibold uppercase text-amber-600 ml-1 tracking-widest">
              New Cutoff Effective From
            </label>
            <input
              type="date"
              disabled={isSaving}
              value={branch.cutoffEffectiveDate || tomorrow}
              onChange={(e) => onUpdate({ cutoffEffectiveDate: e.target.value })}
              className="w-full p-4 bg-amber-50 border border-amber-200 rounded-2xl font-bold text-xs uppercase tracking-wider text-amber-700 outline-none focus:border-amber-500 transition-all shadow-sm"
            />
            <p className="text-xs font-bold text-amber-500 ml-1 uppercase tracking-widest">
              Current week stays unchanged. New cutoff applies from this date.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase text-slate-500 ml-1 tracking-widest">System Start Date</label>
            <input
              type="date"
              disabled={isSaving}
              value={cycleStartDate || ''}
              onChange={(e) => onUpdate({ cycleStartDate: e.target.value })}
              className="w-full p-4 bg-white border border-slate-100 rounded-2xl font-bold text-xs uppercase tracking-wider text-slate-900 outline-none focus:border-emerald-500 transition-all shadow-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase text-slate-500 ml-1 tracking-widest">Rent & Bills (₱)</label>
            <input
              type="number"
              disabled={isSaving}
              value={dailyProvisionAmount === 0 ? '' : dailyProvisionAmount}
              onChange={(e) => {
                const val = e.target.value;
                onUpdate({ dailyProvisionAmount: val === '' ? 0 : Number(val) });
              }}
              className="w-full p-4 bg-white border border-slate-100 rounded-2xl font-bold text-sm uppercase tracking-widest text-emerald-600 outline-none focus:border-emerald-500 transition-all shadow-sm"
              placeholder="E.G. 800"
            />
          </div>
        </div>
      </div>
    </section>
  );
};
