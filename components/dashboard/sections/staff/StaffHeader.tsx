import React from 'react';
import { UI_THEME } from '../../../../constants/ui_designs';
import { UserPlus, Plus, Printer, Store, Search, ChevronDown } from 'lucide-react';

interface StaffHeaderProps {
  branchName: string;
  searchTerm: string;
  onSearchChange: (val: string) => void;
  onAddStaff: () => void;
  onPullReliever: () => void;
  onExportPDF: () => void;
  showFilters: boolean;
  setShowFilters: (val: boolean) => void;
  isExporting: boolean;
  hasActiveFilters: boolean;
}

export const StaffHeader: React.FC<StaffHeaderProps> = ({ 
  branchName, 
  searchTerm, 
  onSearchChange, 
  onAddStaff, 
  onPullReliever,
  onExportPDF,
  showFilters,
  setShowFilters,
  isExporting,
  hasActiveFilters
}) => {
  return (
    <div className={`bg-white px-4 py-3 sm:px-5 sm:py-4 ${UI_THEME.radius.card} shadow-sm border border-slate-100 flex flex-col gap-3`}>
      {/* IDENTITY ROW + ACTION BUTTONS */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-md border border-white/5 shrink-0">
            <Store className="w-4 h-4" />
          </div>
          <div className="overflow-hidden">
            <h2 className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-tighter leading-none truncate">{branchName}</h2>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.3em] mt-0.5">Staff Directory</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onExportPDF()}
            disabled={isExporting}
            className={`h-9 px-3 sm:px-4 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all active:scale-95 border border-slate-100 ${isExporting ? 'opacity-50' : ''}`}
            title="Export PDF"
          >
            {isExporting ? (
              <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin"></div>
            ) : (
              <Printer className="w-3.5 h-3.5" />
            )}
            <span className="hidden lg:inline">Export</span>
          </button>

          <button
            onClick={onPullReliever}
            className="h-9 px-3 sm:px-5 bg-emerald-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-md hover:bg-emerald-700 transition-all active:scale-95 shrink-0 whitespace-nowrap flex items-center justify-center gap-1.5"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Pull Reliever</span>
          </button>

          <button
            onClick={onAddStaff}
            className="h-9 px-3 sm:px-5 bg-slate-900 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-md hover:bg-slate-800 transition-all active:scale-95 shrink-0 whitespace-nowrap flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add Staff</span>
          </button>
        </div>
      </div>

      {/* SEARCH + FILTER ROW */}
      <div className="flex flex-row items-center gap-2">
        <div className="relative group flex-1">
          <input
            value={searchTerm}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Filter roster..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border-2 border-transparent rounded-xl font-bold text-[11px] uppercase tracking-widest outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner placeholder:text-slate-300"
          />
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-emerald-500 transition-colors">
            <Search className="w-4 h-4" strokeWidth={2.5} />
          </div>
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`h-9 px-3 sm:px-5 rounded-xl border-2 transition-all text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${showFilters ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-600 border-slate-100 hover:border-emerald-500 hover:text-emerald-600'}`}
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${showFilters ? 'rotate-180' : ''}`} strokeWidth={3} />
          <span className="hidden sm:inline">{showFilters ? 'Hide Filters' : 'Filters'}</span>
          {hasActiveFilters && !showFilters && <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>}
        </button>
      </div>
    </div>
  );
};
