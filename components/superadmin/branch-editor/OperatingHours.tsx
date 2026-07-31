
import React from 'react';
import { Branch } from '../../../types';

interface OperatingHoursProps {
  openingTime: string;
  closingTime: string;
  shift2OpeningTime?: string;
  shift2ClosingTime?: string;
  contactNumber?: string;
  isSaving: boolean;
  isOperationalToday: boolean;
  onUpdate: (updates: Partial<Branch>) => void;
}

export const OperatingHours: React.FC<OperatingHoursProps> = ({
  openingTime, closingTime, shift2OpeningTime, shift2ClosingTime, contactNumber, isSaving, isOperationalToday, onUpdate
}) => {
  const inputClass = (disabled: boolean) =>
    `w-full p-4 border rounded-2xl font-bold text-sm uppercase tracking-wider outline-none transition-all shadow-sm ${disabled ? 'bg-slate-100 border-transparent text-slate-400 cursor-not-allowed' : 'bg-white border-slate-100 text-slate-900 focus:border-emerald-500'}`;

  return (
    <section className="space-y-5 animate-in slide-in-from-bottom-3 duration-500">
      <div className="flex justify-between items-center px-1">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-[0.25em]">Operating Hours & Shifts</h4>
        {isOperationalToday && (
          <span className="text-xs font-bold bg-amber-50 text-amber-600 px-2 py-0.5 rounded border border-amber-100 uppercase tracking-widest animate-pulse">Window Locked</span>
        )}
      </div>
      <div className="bg-slate-50/50 p-6 rounded-2xl space-y-8 border border-slate-100 shadow-inner">

        {/* Shift 1 */}
        <div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
            {shift2OpeningTime ? 'Shift 1' : 'Operating Hours'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase text-slate-500 ml-1 tracking-widest">Opening Hour</label>
              <input
                type="time"
                disabled={isSaving || isOperationalToday}
                value={openingTime || '09:00'}
                onChange={(e) => onUpdate({ openingTime: e.target.value })}
                className={inputClass(isSaving || isOperationalToday)}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase text-slate-500 ml-1 tracking-widest">Closing Hour</label>
              <input
                type="time"
                disabled={isSaving || isOperationalToday}
                value={closingTime || '22:00'}
                onChange={(e) => onUpdate({ closingTime: e.target.value })}
                className={inputClass(isSaving || isOperationalToday)}
              />
            </div>
          </div>
        </div>

        {/* Shift 2 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Shift 2 (Optional)</p>
            {shift2OpeningTime && (
              <button
                type="button"
                disabled={isSaving || isOperationalToday}
                onClick={() => onUpdate({ shift2OpeningTime: undefined })}
                className="text-xs font-semibold text-rose-400 hover:text-rose-600 uppercase tracking-wide disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Remove
              </button>
            )}
          </div>
          {shift2OpeningTime ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase text-slate-500 ml-1 tracking-widest">Shift 2 Opening</label>
                  <input
                    type="time"
                    disabled={isSaving || isOperationalToday}
                    value={shift2OpeningTime}
                    onChange={(e) => onUpdate({ shift2OpeningTime: e.target.value })}
                    className={inputClass(isSaving || isOperationalToday)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase text-slate-500 ml-1 tracking-widest">Shift 2 Closing</label>
                  <input
                    type="time"
                    disabled={isSaving || isOperationalToday}
                    value={shift2ClosingTime || ''}
                    onChange={(e) => onUpdate({ shift2ClosingTime: e.target.value || undefined })}
                    className={inputClass(isSaving || isOperationalToday)}
                  />
                </div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                When clocking in, the manager selects Shift 1 or Shift 2. Late and OT tracking uses the chosen shift's hours.
              </p>
            </div>
          ) : (
            <button
              type="button"
              disabled={isSaving || isOperationalToday}
              onClick={() => onUpdate({ shift2OpeningTime: '14:00' })}
              className="w-full py-3 border border-dashed border-slate-200 rounded-2xl text-xs font-bold text-slate-400 uppercase tracking-widest hover:border-emerald-400 hover:text-emerald-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + Add Second Shift
            </button>
          )}
        </div>

        {isOperationalToday && (
          <p className="text-xs font-bold text-amber-600 uppercase text-center px-4 leading-relaxed">
            Time parameters cannot be modified while active operational data exists for today.
          </p>
        )}

      </div>

      {/* Contact Number */}
      <div className="space-y-2 px-1">
        <label className="block text-xs font-semibold uppercase text-slate-500 tracking-widest">Contact Number</label>
        <input
          type="tel"
          disabled={isSaving}
          value={contactNumber || ''}
          onChange={(e) => onUpdate({ contactNumber: e.target.value || undefined })}
          placeholder="e.g. 09171234567"
          className={`w-full p-4 border rounded-2xl font-bold text-sm outline-none transition-all shadow-sm ${isSaving ? 'bg-slate-100 border-transparent text-slate-400 cursor-not-allowed' : 'bg-white border-slate-100 text-slate-900 focus:border-emerald-500'}`}
        />
      </div>
    </section>
  );
};
