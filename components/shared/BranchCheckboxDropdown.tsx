import React, { useState, useRef, useEffect } from 'react';
import { Branch } from '../../types';

interface BranchCheckboxDropdownProps {
  branches: Branch[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  className?: string;
}

export const BranchCheckboxDropdown: React.FC<BranchCheckboxDropdownProps> = ({
  branches,
  selectedIds,
  onChange,
  placeholder = 'All Branches',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = branches
    .filter(b => b.isEnabled !== false && b.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const aChecked = selectedIds.includes(a.id);
      const bChecked = selectedIds.includes(b.id);
      if (aChecked !== bChecked) return aChecked ? -1 : 1;
      return 0;
    });

  const label =
    selectedIds.length === 0
      ? placeholder
      : selectedIds.length === 1
      ? (branches.find(b => b.id === selectedIds[0])?.name ?? placeholder)
      : `${selectedIds.length} Branches`;

  const allSelected = selectedIds.length === 0;

  const toggleBranch = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(x => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className={`h-11 w-full flex items-center justify-between gap-2 px-4 rounded-2xl border text-xs font-semibold uppercase tracking-wide transition-all outline-none ${
          isOpen
            ? 'bg-white border-emerald-500 ring-4 ring-emerald-500/10 text-slate-900'
            : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-600'
        } ${selectedIds.length > 0 ? 'text-slate-900' : ''}`}
      >
        <span className="truncate">{label}</span>
        <svg
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-emerald-500' : 'text-slate-400'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Active filter badge */}
      {selectedIds.length > 0 && (
        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-500 text-white text-xs font-black flex items-center justify-center leading-none">
          {selectedIds.length}
        </span>
      )}

      {isOpen && (
        <div className="absolute z-50 top-[calc(100%+6px)] left-0 min-w-[220px] w-full bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 ring-1 ring-slate-900/5">
          {/* Search */}
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search branches..."
                className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-700 placeholder:text-slate-300 outline-none focus:bg-white focus:border-emerald-400 transition-all"
              />
            </div>
          </div>

          {/* Options list */}
          <div className="max-h-56 overflow-y-auto overscroll-contain">
            {/* All Branches option */}
            {!search && (
              <label className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 border-b border-slate-100 group">
                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  allSelected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 group-hover:border-emerald-400'
                }`}>
                  {allSelected && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <input type="checkbox" checked={allSelected} onChange={() => onChange([])} className="sr-only" />
                <span className={`text-xs font-semibold uppercase tracking-wide ${allSelected ? 'text-emerald-600' : 'text-slate-500'}`}>
                  All Branches
                </span>
              </label>
            )}

            {filtered.map(branch => {
              const checked = selectedIds.includes(branch.id);
              return (
                <label
                  key={branch.id}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 group"
                >
                  <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                    checked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 group-hover:border-emerald-400'
                  }`}>
                    {checked && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <input type="checkbox" checked={checked} onChange={() => toggleBranch(branch.id)} className="sr-only" />
                  <span className={`text-xs font-medium uppercase tracking-wide truncate ${checked ? 'text-slate-900' : 'text-slate-500'}`}>
                    {branch.name}
                  </span>
                </label>
              );
            })}

            {filtered.length === 0 && (
              <div className="px-4 py-6 text-center text-xs font-medium text-slate-400 uppercase tracking-wide">
                No branches found
              </div>
            )}
          </div>

          {/* Clear footer */}
          {selectedIds.length > 0 && (
            <div className="border-t border-slate-100 px-4 py-2">
              <button
                onClick={() => onChange([])}
                className="text-xs font-medium text-slate-400 uppercase tracking-wide hover:text-rose-500 transition-colors"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
