import React, { useState, useRef, useEffect } from 'react';

export interface CheckboxDropdownOption {
  value: string;
  label: string;
  /** Tailwind bg+border classes for the checked state, e.g. 'bg-violet-500 border-violet-500' */
  activeColor?: string;
}

interface CheckboxDropdownProps {
  options: CheckboxDropdownOption[];
  /** Empty array = "All" (no filter active) */
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  className?: string;
}

export const CheckboxDropdown: React.FC<CheckboxDropdownProps> = ({
  options,
  selected,
  onChange,
  placeholder,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (value: string) => {
    const next = selected.includes(value)
      ? selected.filter(v => v !== value)
      : [...selected, value];
    onChange(next);
  };

  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
      ? (options.find(o => o.value === selected[0])?.label ?? placeholder)
      : `${selected.length} selected`;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(o => !o)}
        className={`h-10 w-full flex items-center justify-between gap-2 px-4 rounded-2xl border text-xs font-semibold uppercase tracking-wide transition-all outline-none ${
          isOpen
            ? 'bg-white dark:bg-slate-700 border-emerald-500 ring-4 ring-emerald-500/10 text-slate-900 dark:text-slate-100'
            : selected.length > 0
              ? 'bg-slate-50 dark:bg-slate-700/60 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100'
              : 'bg-slate-50 dark:bg-slate-700/40 border-slate-200 dark:border-slate-600 hover:border-slate-300 text-slate-500 dark:text-slate-400'
        }`}
      >
        <span className="truncate">{label}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {selected.length > 0 && (
            <span
              onMouseDown={e => { e.stopPropagation(); onChange([]); }}
              className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-300 flex items-center justify-center hover:bg-rose-100 hover:text-rose-500 transition-colors text-[10px] font-black"
              title="Clear"
            >✕</span>
          )}
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180 text-emerald-500' : 'text-slate-400'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {selected.length > 0 && (
        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center leading-none pointer-events-none">
          {selected.length}
        </span>
      )}

      {isOpen && (
        <div className="absolute z-50 top-[calc(100%+6px)] left-0 min-w-[180px] w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 ring-1 ring-slate-900/5">
          <div className="max-h-56 overflow-y-auto overscroll-contain">
            {/* All option */}
            <label className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700 group">
              <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                selected.length === 0 ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 dark:border-slate-500 group-hover:border-emerald-400'
              }`}>
                {selected.length === 0 && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <input type="checkbox" checked={selected.length === 0} onChange={() => onChange([])} className="sr-only" />
              <span className={`text-xs font-semibold uppercase tracking-wide ${selected.length === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                All
              </span>
            </label>

            {options.map(opt => {
              const checked = selected.includes(opt.value);
              const colorClass = checked && opt.activeColor ? opt.activeColor : '';
              return (
                <label
                  key={opt.value}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 group"
                >
                  <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                    checked
                      ? colorClass || 'bg-emerald-500 border-emerald-500'
                      : 'border-slate-300 dark:border-slate-500 group-hover:border-emerald-400'
                  }`}>
                    {checked && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <input type="checkbox" checked={checked} onChange={() => toggle(opt.value)} className="sr-only" />
                  <span className={`text-xs font-semibold uppercase tracking-wide ${checked ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>
                    {opt.label}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
