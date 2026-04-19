import React from 'react';
import { Branch } from '../../../types';

interface OwnerSharesProps {
  owners: { name: string; percentage: number }[];
  isSaving: boolean;
  onUpdate: (updates: Partial<Branch>) => void;
}

export const OwnerShares: React.FC<OwnerSharesProps> = ({ owners, isSaving, onUpdate }) => {
  const handleAddOwner = () => {
    const newOwners = [...owners, { name: '', percentage: 0 }];
    onUpdate({ owners: newOwners });
  };

  const handleRemoveOwner = (index: number) => {
    const newOwners = owners.filter((_, i) => i !== index);
    onUpdate({ owners: newOwners });
  };

  const handleUpdateOwner = (index: number, field: 'name' | 'percentage', value: string | number) => {
    const newOwners = owners.map((owner, i) => {
      if (i === index) {
        return { ...owner, [field]: value };
      }
      return owner;
    });
    onUpdate({ owners: newOwners });
  };

  const totalPercentage = owners.reduce((sum, o) => sum + Number(o.percentage), 0);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center text-sm">🤝</div>
          <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest">Owner Shares</h4>
        </div>
        <button
          onClick={handleAddOwner}
          disabled={isSaving}
          className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-700 transition-colors"
        >
          + Add Owner
        </button>
      </div>

      <div className="bg-slate-50 p-6 rounded-[32px] border border-slate-100 space-y-4">
        {owners.length === 0 ? (
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center py-4 italic">
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
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">%</span>
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
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Allocation</span>
            <span className={`text-xs font-black ${totalPercentage > 100 ? 'text-rose-500' : totalPercentage === 100 ? 'text-emerald-600' : 'text-slate-900'}`}>
              {totalPercentage}%
            </span>
          </div>
        )}
      </div>
    </section>
  );
};
