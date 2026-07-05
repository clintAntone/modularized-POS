import React from 'react';
import { Branch } from '../../../types';

interface OwnerSharesProps {
  owners: { name: string; percentage: number }[];
  groupLevy?: { name: string; percentage: number } | null;
  isSaving: boolean;
  onUpdate: (updates: Partial<Branch>) => void;
}

export const OwnerShares: React.FC<OwnerSharesProps> = ({ owners, groupLevy, isSaving, onUpdate }) => {
  const handleAddOwner = () => {
    onUpdate({ owners: [...owners, { name: '', percentage: 0 }] });
  };

  const handleRemoveOwner = (index: number) => {
    onUpdate({ owners: owners.filter((_, i) => i !== index) });
  };

  const handleUpdateOwner = (index: number, field: 'name' | 'percentage', value: string | number) => {
    onUpdate({ owners: owners.map((owner, i) => i === index ? { ...owner, [field]: value } : owner) });
  };

  const totalPercentage = owners.reduce((sum, o) => sum + Number(o.percentage), 0);
  const hasLevy = Boolean(groupLevy);

  return (
    <section className="space-y-4">

      {/* ── Group Levy ── */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center text-sm">🏦</div>
          <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">Group Levy</h4>
        </div>
        <button
          onClick={() => {
            if (hasLevy) {
              onUpdate({ groupLevy: null });
            } else {
              onUpdate({ groupLevy: { name: 'GROUP FUND', percentage: 10 } });
            }
          }}
          disabled={isSaving}
          className={`text-xs font-semibold uppercase tracking-wide transition-colors ${hasLevy ? 'text-rose-500 hover:text-rose-600' : 'text-indigo-600 hover:text-indigo-700'}`}
        >
          {hasLevy ? '− Remove Levy' : '+ Enable Levy'}
        </button>
      </div>

      {hasLevy && groupLevy && (
        <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-100 space-y-4">
          <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest leading-relaxed">
            This percentage is deducted from the adjusted ROI first, before distributing to owners.
          </p>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs font-bold text-indigo-400 uppercase tracking-widest ml-1 mb-1 block">Group / Fund Name</label>
              <input
                type="text"
                value={groupLevy.name}
                onChange={e => onUpdate({ groupLevy: { ...groupLevy, name: e.target.value.toUpperCase() } })}
                placeholder="GROUP FUND"
                className="w-full bg-white border border-indigo-200 px-4 py-3 rounded-xl text-xs font-bold text-slate-900 uppercase focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
              />
            </div>
            <div className="w-24 shrink-0">
              <label className="text-xs font-bold text-indigo-400 uppercase tracking-widest ml-1 mb-1 block">Rate</label>
              <div className="relative">
                <input
                  type="number"
                  value={groupLevy.percentage || ''}
                  min={1}
                  max={99}
                  onChange={e => onUpdate({ groupLevy: { ...groupLevy, percentage: Number(e.target.value) } })}
                  placeholder="10"
                  className="w-full bg-white border border-indigo-200 pl-4 pr-8 py-3 rounded-xl text-xs font-bold text-slate-900 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-indigo-400">%</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Owners receive after levy</span>
            <span className="text-xs font-black text-indigo-700">{100 - (groupLevy.percentage || 0)}% of Adjusted ROI</span>
          </div>
        </div>
      )}

      {/* ── Owner Shares ── */}
      <div className="flex items-center justify-between mb-2 mt-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center text-sm">🤝</div>
          <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">Owner Shares</h4>
        </div>
        <button
          onClick={handleAddOwner}
          disabled={isSaving}
          className="text-xs font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-700 transition-colors"
        >
          + Add Owner
        </button>
      </div>

      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
        {owners.length === 0 ? (
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide text-center py-4 italic">
            No owners defined for this branch.
          </p>
        ) : (
          <div className="space-y-3">
            {owners.map((owner, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <div className="flex-1">
                  <input
                    type="text"
                    value={owner.name}
                    onChange={(e) => handleUpdateOwner(idx, 'name', e.target.value)}
                    placeholder="OWNER NAME"
                    className="w-full bg-white border border-slate-200 px-4 py-3 rounded-xl text-xs font-bold text-slate-900 uppercase focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
                  />
                </div>
                <div className="w-24 relative">
                  <input
                    type="number"
                    value={owner.percentage || ''}
                    onChange={(e) => handleUpdateOwner(idx, 'percentage', Number(e.target.value))}
                    placeholder="0"
                    className="w-full bg-white border border-slate-200 pl-4 pr-8 py-3 rounded-xl text-xs font-bold text-slate-900 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">%</span>
                </div>
                <button
                  onClick={() => handleRemoveOwner(idx)}
                  className="w-10 h-10 flex items-center justify-center text-slate-300 hover:text-rose-500 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {owners.length > 0 && (
          <div className="pt-4 border-t border-slate-200 flex justify-between items-center">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              {hasLevy ? `Total (of ${100 - (groupLevy?.percentage || 0)}% post-levy)` : 'Total Allocation'}
            </span>
            <span className={`text-xs font-black ${totalPercentage > 100 ? 'text-rose-500' : totalPercentage === 100 ? 'text-emerald-600' : 'text-slate-900'}`}>
              {totalPercentage}%
            </span>
          </div>
        )}
      </div>
    </section>
  );
};
