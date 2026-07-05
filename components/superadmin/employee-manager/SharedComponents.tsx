
import React from 'react';
import { Branch } from '../../../types';
import { playSound } from '../../../lib/audio';

export const ROLE_ORDER = ['MANAGER', 'THERAPIST', 'BONESETTER'];

export const RoleBadge = ({ role }: { role: string }) => {
  const styles: Record<string, string> = {
    MANAGER: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    THERAPIST: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    BONESETTER: 'bg-amber-50 text-amber-700 border-amber-100',
    TRAINEE: 'bg-slate-50 text-slate-500 border-slate-100',
    RELIEVER: 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
  };
  
  const roles = (role || '').split(',')
    .filter(Boolean)
    .sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
  
  return (
    <div className="flex flex-wrap gap-1 justify-center md:justify-start">
      {roles.map(r => (
        <span key={r} className={`px-2 py-0.5 rounded-lg text-xs font-semibold uppercase tracking-wide border ${styles[r] || styles.TRAINEE}`}>
          {r}
        </span>
      ))}
    </div>
  );
};

export const WorkplaceAuthorizationGrid = ({
  branches,
  authorizedIds,
  onChange,
  disabled
}: {
  branches: Branch[],
  authorizedIds: string[],
  onChange: (ids: string[]) => void,
  disabled?: boolean
}) => {
  const [search, setSearch] = React.useState('');

  const selectedBranches = authorizedIds.map(id => branches.find(b => b.id === id)).filter(Boolean) as Branch[];

  const filteredBranches = branches
    .filter(b => !authorizedIds.includes(b.id))
    .filter(b =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      (b.manager || '').toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const toggle = (id: string, isSelected: boolean) => {
    playSound('click');
    onChange(isSelected ? authorizedIds.filter(x => x !== id) : [...authorizedIds, id]);
  };

  return (
    <div className="space-y-0">
      {/* Selected chips */}
      {selectedBranches.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 bg-emerald-50/60 border-b border-emerald-100">
          {selectedBranches.map(branch => (
            <button
              key={branch.id}
              type="button"
              disabled={disabled}
              onClick={() => toggle(branch.id, true)}
              className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 bg-white border border-emerald-200 rounded-lg text-xs font-black text-emerald-800 uppercase tracking-tight hover:border-rose-300 hover:text-rose-600 hover:bg-rose-50 transition-all active:scale-95 shadow-sm"
            >
              <span className="truncate max-w-[120px]">{branch.name}</span>
              <svg className="w-3 h-3 shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative group border-b border-slate-100">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          <svg className="w-3.5 h-3.5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          placeholder="Search branches..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white font-semibold text-xs outline-none focus:bg-slate-50 transition-all"
        />
        {search && (
          <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* List */}
      <div className="max-h-[220px] overflow-y-auto bg-white divide-y divide-slate-50">
        {filteredBranches.length > 0 ? (
          filteredBranches.map(branch => (
            <button
              key={branch.id}
              type="button"
              disabled={disabled}
              onClick={() => toggle(branch.id, false)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left group"
            >
              {/* Checkbox */}
              <div className="w-4 h-4 rounded border-2 border-slate-200 group-hover:border-emerald-400 transition-colors shrink-0 flex items-center justify-center bg-white" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-slate-800 uppercase tracking-tight truncate">{branch.name}</p>
                {branch.manager && (
                  <p className="text-xs font-semibold text-slate-400 truncate mt-0.5">{branch.manager}</p>
                )}
              </div>
              <svg className="w-3.5 h-3.5 text-slate-200 group-hover:text-emerald-500 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          ))
        ) : (
          <div className="py-8 text-center">
            <p className="text-xs font-black text-slate-300 uppercase tracking-widest">
              {search ? 'No matches' : 'All branches selected'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
