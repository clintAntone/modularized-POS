
import React, { useRef, useEffect, useState } from 'react';
import { UI_THEME } from '../../../../constants/ui_designs';
import { playSound } from '../../../../lib/audio';
import { parseDate } from '@/src/utils/reportUtils';

interface CustomSelectProps {
  id: string;
  label: string;
  value: string;
  options: { val: string; label: string }[];
  onSelect: (val: string) => void;
  activeId: string | null;
  setActive: (id: string | null) => void;
  icon: React.ReactNode;
}

const CustomSelect: React.FC<CustomSelectProps> = ({ id, label, value, options, onSelect, activeId, setActive, icon }) => {
  const isOpen = activeId === id;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (isOpen && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActive(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, setActive]);

  return (
      <div className="relative flex-1" ref={containerRef}>
        <button
            onClick={() => { playSound('click'); setActive(isOpen ? null : id); }}
            className={`w-full flex items-center justify-between pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 ${UI_THEME.radius.card} transition-all duration-300 relative group/btn min-h-[72px] ${isOpen ? 'border-emerald-500 bg-white shadow-lg ring-4 ring-emerald-500/5' : 'hover:border-slate-300 shadow-sm'}`}
        >
          <div className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-300 ${isOpen ? 'text-emerald-500' : 'text-slate-400'}`}>
            {icon}
          </div>
          <div className="flex flex-col items-start min-w-0 pr-3 gap-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">{label}</p>
            <p className="font-bold text-[14px] text-slate-900 uppercase tracking-tight truncate w-full leading-none">{value}</p>
          </div>
          <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180 text-emerald-500' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M19 9l-7 7-7-7" /></svg>
        </button>

        {isOpen && (
            <div className={`absolute z-[110] top-[calc(100%+8px)] left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[340px] overflow-y-auto no-scrollbar ring-1 ring-slate-900/5 p-2`}>
              {options.map((opt) => {
                const isSelected = value === opt.label || (value === 'Every Year' && opt.val === 'all') || (value === 'Entire Season' && opt.val === 'all');
                return (
                    <button
                        key={opt.val}
                        onClick={() => { onSelect(opt.val); setActive(null); playSound('click'); }}
                        className={`w-full text-left px-5 py-4 text-xs font-bold uppercase tracking-wider transition-all rounded-xl mb-1 last:mb-0 flex items-center justify-between ${isSelected ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                      {opt.label}
                      {isSelected && <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="4"><path d="M5 13l4 4L19 7"/></svg>}
                    </button>
                );
              })}
            </div>
        )}
      </div>
  );
};

interface ReportFiltersProps {
  view: string;
  setView: (val: any) => void;
  activeDropdown: string | null;
  setActiveDropdown: (id: string | null) => void;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  startDate: string;
  setStartDate: (val: string) => void;
  endDate: string;
  setEndDate: (val: string) => void;
  showBreakdown?: boolean;
  setShowBreakdown?: (val: boolean) => void;
  isNetworkView?: boolean;
}

export const ReportFilters: React.FC<ReportFiltersProps> = ({
                                                               view, setView,
                                                               activeDropdown, setActiveDropdown,
                                                               searchQuery, setSearchQuery,
                                                               startDate, setStartDate,
                                                               endDate, setEndDate,
                                                               showBreakdown, setShowBreakdown,
                                                               isNetworkView
                                                             }) => {
  const [showFilters, setShowFilters] = useState(false);
  const isFiltered = searchQuery || startDate || endDate;

  const clearFilters = () => {
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    playSound('click');
  };

  return (
      <div className={`bg-white p-3 sm:p-6 ${UI_THEME.radius.card} shadow-sm border border-slate-200 space-y-4 sm:space-y-6 no-print`}>
        <div className="flex flex-row items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shadow-inner">
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
            </div>
            <div>
              <h3 className="text-[12px] sm:text-[14px] font-black text-slate-900 uppercase tracking-tighter">Report Analytics</h3>
              <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-widest">Configure Data Parameters</p>
            </div>
          </div>

          {isFiltered && (
            <button 
              onClick={clearFilters}
              className="px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all border border-rose-100"
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* SEARCH + FILTER TOGGLE ROW */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
          <div className="relative flex-1 group">
            <div
                className="absolute left-3.5 md:left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-emerald-500 transition-colors">
              <svg className="w-4 h-4 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                   strokeWidth="2.5">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
            </div>
            <input
                type="text"
                placeholder="SEARCH REPORTS..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 md:pl-14 pr-4 md:pr-6 py-3 md:py-4 bg-slate-50 border border-slate-200 rounded-2xl md:rounded-[24px] text-[10px] md:text-[13px] font-bold uppercase tracking-widest focus:bg-white focus:border-emerald-500 focus:ring-8 focus:ring-emerald-500/5 transition-all outline-none shadow-inner placeholder:text-slate-300"
            />
          </div>

        </div>

        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex flex-col lg:flex-row items-stretch gap-4 md:gap-6">
            <div className="relative flex-1">
              <div
                  className="w-full bg-slate-100 p-1 rounded-[20px] md:rounded-[24px] flex items-center shadow-inner border border-slate-200/80 h-full">
                {['daily', 'weekly', 'monthly'].map(v => (
                    <button
                        key={v}
                        onClick={() => {
                          setView(v);
                          playSound('click');
                        }}
                        className={`flex-1 px-4 py-2.5 md:px-6 md:py-4 rounded-[16px] md:rounded-[20px] text-[9px] md:text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${view === v ? 'bg-white text-slate-900 shadow-lg scale-[1.02] border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      {v}
                    </button>
                ))}
              </div>
            </div>

            {(view === 'weekly' || view === 'monthly') && isNetworkView && setShowBreakdown && (
              <div className="flex items-center gap-3 bg-slate-50 px-6 py-3 rounded-[24px] border border-slate-200 shadow-inner">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Breakdown by Branch</p>
                <button
                  onClick={() => { setShowBreakdown(!showBreakdown); playSound('click'); }}
                  className={`w-12 h-6 rounded-full transition-all relative ${showBreakdown ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${showBreakdown ? 'left-7' : 'left-1'}`}></div>
                </button>
              </div>
            )}
          </div>

          {/* Date range — only on daily view */}
          {view === 'daily' && (
            <div className="flex items-center gap-2 mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <label className={`relative flex-1 group/date cursor-pointer flex flex-col gap-1 px-4 py-3 rounded-2xl border transition-all duration-200 ${startDate ? 'bg-emerald-50 border-emerald-200 shadow-sm' : 'bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-white'}`}>
                <span className={`text-[8px] font-black uppercase tracking-[0.2em] leading-none ${startDate ? 'text-emerald-500' : 'text-slate-400'}`}>From</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); playSound('click'); }}
                  className="w-full bg-transparent text-[11px] font-black text-slate-800 outline-none cursor-pointer appearance-none leading-none uppercase"
                />
              </label>

              <div className="flex flex-col items-center gap-0.5 shrink-0">
                <div className="w-4 h-px bg-slate-300"></div>
                <svg className="w-2.5 h-2.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
                <div className="w-4 h-px bg-slate-300"></div>
              </div>

              <label className={`relative flex-1 group/date cursor-pointer flex flex-col gap-1 px-4 py-3 rounded-2xl border transition-all duration-200 ${endDate ? 'bg-emerald-50 border-emerald-200 shadow-sm' : 'bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-white'}`}>
                <span className={`text-[8px] font-black uppercase tracking-[0.2em] leading-none ${endDate ? 'text-emerald-500' : 'text-slate-400'}`}>To</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); playSound('click'); }}
                  className="w-full bg-transparent text-[11px] font-black text-slate-800 outline-none cursor-pointer appearance-none leading-none uppercase"
                />
              </label>

              {(startDate || endDate) && (
                <button
                  onClick={() => { setStartDate(''); setEndDate(''); playSound('click'); }}
                  className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-rose-50 border border-rose-100 text-rose-400 hover:bg-rose-100 hover:text-rose-600 transition-all active:scale-95"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
  );
};
