
import React, { useState, useEffect, useRef } from 'react';
import { Employee } from '../../../types';
import { playSound } from '../../../lib/audio';

interface ManagerSelectorProps {
  value: string;
  employees: Employee[];
  onSelect: (name: string) => void;
  disabled?: boolean;
  branchId: string;
}

export const ManagerSelector: React.FC<ManagerSelectorProps> = ({ value, employees, onSelect, disabled, branchId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedEmployee = employees.find(e => e.name === value);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setIsOpen(!isOpen); playSound('click'); if (!isOpen) setTimeout(() => searchRef.current?.focus(), 50); }}
        className={`w-full flex items-center justify-between p-4 bg-white border-2 rounded-2xl transition-all duration-300 group ${isOpen ? 'border-emerald-500 shadow-xl ring-4 ring-emerald-500/5' : 'border-slate-100 hover:border-slate-300 shadow-sm'}`}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 transition-all ${value ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-50 text-slate-300'}`}>
            {value ? (selectedEmployee?.role.includes('MANAGER') ? '👑' : '👤') : '∅'}
          </div>
          <div className="text-left overflow-hidden">
            <p className={`font-bold text-[12px] uppercase tracking-tight truncate ${value ? 'text-slate-900' : 'text-slate-300'}`}>
              {value || 'Unassigned / Select Personnel...'}
            </p>
            {value && <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-widest leading-none">Registered Manager</p>}
          </div>
        </div>
        <svg className={`w-4 h-4 text-slate-300 transition-transform duration-300 shrink-0 ${isOpen ? 'rotate-180 text-emerald-500' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-[200] top-[calc(100%+8px)] left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-[0_30px_90px_rgba(0,0,0,0.15)] overflow-hidden animate-in zoom-in-95 fade-in duration-200 p-1.5 ring-1 ring-slate-900/5">
          {/* Search */}
          <div className="px-1.5 pb-1.5">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search personnel..."
              className="w-full px-3 py-2 text-[11px] font-medium bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-400 focus:bg-white transition-all placeholder:text-slate-300"
            />
          </div>

          <button
            type="button"
            onClick={() => { onSelect(''); setIsOpen(false); setSearch(''); playSound('click'); }}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all mb-1 ${!value ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50 hover:text-rose-500'}`}
          >
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs shrink-0 ${!value ? 'bg-white/10' : 'bg-slate-50'}`}>∅</div>
            <span className="font-bold text-[11px] uppercase tracking-widest">Unassigned</span>
          </button>
          
          <div className="h-px bg-slate-50 my-1 mx-3"></div>
          
          <div className="max-h-[280px] overflow-y-auto no-scrollbar pr-0.5">
            {employees.length > 0 ? employees.filter(e => e.name.toUpperCase().includes(search.toUpperCase())).map((emp) => {
              const isSelected = value === emp.name;
              return (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => { onSelect(emp.name); setIsOpen(false); setSearch(''); playSound('click'); }}
                  className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all mb-1 last:mb-0 group/item ${isSelected ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50 hover:text-emerald-700'}`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs shrink-0 transition-colors ${isSelected ? 'bg-white/20' : 'bg-slate-50 group-hover/item:bg-white'}`}>
                       {emp.role.includes('MANAGER') ? '👑' : emp.role.includes('BONESETTER') ? '🦴' : '💆'}
                    </div>
                    <div className="text-left overflow-hidden">
                      <p className="font-bold text-[11px] uppercase truncate tracking-tight">{emp.name}</p>
                      <p className={`text-[8px] font-semibold uppercase tracking-widest leading-none mt-0.5 ${isSelected ? 'text-white/60' : 'text-slate-400'}`}>
                        {emp.role} {emp.branchId !== branchId ? '(Cross-Branch)' : ''}
                      </p>
                    </div>
                  </div>
                  {isSelected && (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>
                  )}
                </button>
              );
            }) : (
              <div className="py-8 text-center opacity-40">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">No personnel found</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
