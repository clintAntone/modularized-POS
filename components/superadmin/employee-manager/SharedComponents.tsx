
import React from 'react';
import { Branch } from '../../../types';
import { playSound } from '../../../lib/audio';

export const ROLE_ORDER = ['MANAGER', 'THERAPIST', 'BONESETTER', 'TRAINEE', 'RELIEVER'];

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
        <span key={r} className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest border ${styles[r] || styles.TRAINEE}`}>
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
  
  const filteredBranches = branches
    .filter(b =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.manager?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const aSelected = authorizedIds.includes(a.id) ? 0 : 1;
      const bSelected = authorizedIds.includes(b.id) ? 0 : 1;
      return aSelected - bSelected;
    });

  const selectedCount = authorizedIds.length;

  return (
    <div className="space-y-3">
      <div className="relative group">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          <svg className="w-3.5 h-3.5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input 
          type="text"
          placeholder="SEARCH BRANCHES..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-transparent rounded-xl font-black text-[10px] uppercase tracking-widest outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner"
        />
        {selectedCount > 0 && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 bg-slate-900 text-white text-[8px] font-black rounded-full uppercase tracking-tighter">
            {selectedCount} SELECTED
          </div>
        )}
      </div>

      <div className="max-h-[200px] overflow-y-auto no-scrollbar pr-1">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {filteredBranches.length > 0 ? (
            filteredBranches.map((branch) => {
              const isAuthorized = authorizedIds.includes(branch.id);

              return (
                <button
                  key={branch.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    playSound('click');
                    const next = isAuthorized 
                      ? authorizedIds.filter(id => id !== branch.id) 
                      : [...authorizedIds, branch.id];
                    onChange(next);
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all text-center group relative overflow-hidden ${
                    isAuthorized 
                      ? 'bg-slate-900 border-slate-900 text-white shadow-lg shadow-slate-900/20 scale-[0.98]' 
                      : 'bg-white border-slate-100 text-slate-400 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0 w-full">
                    <p className={`text-[9px] font-black uppercase tracking-tight truncate ${isAuthorized ? 'text-white' : 'text-slate-600'}`}>
                      {branch.name}
                    </p>
                    {branch.manager && (
                      <p className={`text-[7px] font-bold uppercase tracking-widest truncate mt-0.5 ${isAuthorized ? 'text-slate-400' : 'text-slate-400'}`}>
                        MGR: {branch.manager}
                      </p>
                    )}
                  </div>
                  {isAuthorized && (
                    <div className="absolute top-1 right-1">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_#10b981]"></div>
                    </div>
                  )}
                </button>
              );
            })
          ) : (
            <div className="col-span-full py-8 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No branches found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
