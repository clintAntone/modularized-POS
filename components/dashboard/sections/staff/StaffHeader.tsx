import React, { useRef, useEffect } from 'react';
import { UI_THEME } from '../../../../constants/ui_designs';
import { UserPlus, Store, Search, SlidersHorizontal, ClipboardPlus, Check, FileSpreadsheet, Printer, Download, ChevronDown } from 'lucide-react';

const ROLES = ['THERAPIST', 'BONESETTER', 'MANAGER'] as const;
type Role = typeof ROLES[number];

interface StaffHeaderProps {
  branchName: string;
  searchTerm: string;
  onSearchChange: (val: string) => void;
  onPullReliever: () => void;
  onRequestNewEmployee?: () => void;
  filterRoles: Role[];
  onFilterRolesChange: (roles: Role[]) => void;
  filterActiveOnly: boolean;
  onFilterActiveOnlyChange: (val: boolean) => void;
  totalShowing: number;
  onExportPDF?: () => void;
  onExportCSV?: () => void;
  isExporting?: boolean;
}

export const StaffHeader: React.FC<StaffHeaderProps> = ({
  branchName,
  searchTerm,
  onSearchChange,
  onPullReliever,
  onRequestNewEmployee,
  filterRoles,
  onFilterRolesChange,
  filterActiveOnly,
  onFilterActiveOnlyChange,
  totalShowing,
  onExportPDF,
  onExportCSV,
  isExporting = false,
}) => {
  const [open, setOpen] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    if (exportOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportOpen]);

  const allSelected = filterRoles.length === 0;
  const hasActiveFilters = filterRoles.length > 0 || filterActiveOnly;

  const toggleRole = (role: Role) => {
    if (filterRoles.includes(role)) {
      onFilterRolesChange(filterRoles.filter(r => r !== role));
    } else {
      onFilterRolesChange([...filterRoles, role]);
    }
  };

  const resetFilters = () => {
    onFilterRolesChange([]);
    onFilterActiveOnlyChange(false);
  };

  return (
    <div className={`bg-white px-4 py-4 sm:px-6 sm:py-5 ${UI_THEME.radius.card} shadow-sm border border-slate-100 flex flex-col gap-4`}>

      {/* IDENTITY ROW + ACTION BUTTONS */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <Store className="w-4.5 h-4.5 text-emerald-600" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black text-slate-400 uppercase tracking-[0.3em]">Staff Directory</p>
            <h2 className="text-base font-black text-slate-900 uppercase tracking-tight leading-tight truncate">{branchName}</h2>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onRequestNewEmployee && (
            <button
              onClick={onRequestNewEmployee}
              title="Register a brand-new employee with no existing record"
              className="flex items-center gap-2 h-9 px-4 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-sm hover:bg-indigo-700 transition-all active:scale-95"
            >
              <ClipboardPlus className="w-3.5 h-3.5" strokeWidth={2.5} />
              <span className="hidden sm:inline">New Employee</span>
            </button>
          )}
          <button
            onClick={onPullReliever}
            title="Add an existing employee from another branch as a reliever"
            className="flex items-center gap-2 h-9 px-4 bg-emerald-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-sm hover:bg-emerald-700 transition-all active:scale-95"
          >
            <UserPlus className="w-3.5 h-3.5" strokeWidth={2.5} />
            <span className="hidden sm:inline">Add Reliever</span>
          </button>
        </div>
      </div>

      {/* SEARCH + FILTER ROW */}
      <div className="flex items-center gap-2">
        <div className="relative group flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300 group-focus-within:text-emerald-500 transition-colors" strokeWidth={2.5} />
          <input
            value={searchTerm}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="SEARCH ROSTER..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl font-semibold text-xs text-slate-700 placeholder:text-slate-300 outline-none focus:border-emerald-400 focus:bg-white transition-all"
          />
        </div>

        {/* Export dropdown */}
        {(onExportCSV || onExportPDF) && (
          <div className="relative" ref={exportRef}>
            <button
              onClick={() => setExportOpen(v => !v)}
              disabled={isExporting}
              className={`flex items-center gap-1.5 h-9 px-3 bg-slate-50 text-slate-500 border border-slate-100 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-100 transition-all active:scale-95 ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isExporting
                ? <div className="w-3.5 h-3.5 border-2 border-slate-400/30 border-t-slate-500 rounded-full animate-spin" />
                : <Download className="w-3.5 h-3.5" strokeWidth={2.5} />}
              <ChevronDown className={`w-3 h-3 transition-transform ${exportOpen ? 'rotate-180' : ''}`} strokeWidth={2.5} />
            </button>
            {exportOpen && (
              <div className="absolute left-0 top-[calc(100%+6px)] w-44 bg-white rounded-2xl border border-slate-100 shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {onExportCSV && (
                  <button
                    onClick={() => { setExportOpen(false); onExportCSV(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-teal-50 transition-colors text-left group"
                  >
                    <div className="w-7 h-7 rounded-lg bg-teal-100 group-hover:bg-teal-200 flex items-center justify-center shrink-0 transition-colors">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-teal-700" strokeWidth={2.5} />
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-800 uppercase tracking-widest">Excel</p>
                      <p className="text-xs font-medium text-slate-400">.xlsx format</p>
                    </div>
                  </button>
                )}
                {onExportPDF && (
                  <button
                    onClick={() => { setExportOpen(false); onExportPDF(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-emerald-50 transition-colors text-left group border-t border-slate-50"
                  >
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 group-hover:bg-emerald-200 flex items-center justify-center shrink-0 transition-colors">
                      <Printer className="w-3.5 h-3.5 text-emerald-700" strokeWidth={2.5} />
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-800 uppercase tracking-widest">PDF</p>
                      <p className="text-xs font-medium text-slate-400">Print-ready</p>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Filter dropdown trigger */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setOpen(v => !v)}
            className={`relative h-9 px-3 rounded-xl border transition-all text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 ${
              open
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-50 text-slate-500 border-slate-100 hover:border-slate-300'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={2.5} />
            <span className="hidden sm:inline">Filter</span>
            {hasActiveFilters && !open && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full" />
            )}
          </button>

          {/* Dropdown panel */}
          {open && (
            <div className="absolute right-0 top-[calc(100%+8px)] w-56 bg-white rounded-2xl border border-slate-100 shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">

              {/* Roles */}
              <div className="px-4 pt-4 pb-2">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Designation</p>
                <div className="space-y-1">
                  {/* ALL option */}
                  <button
                    onClick={() => onFilterRolesChange([])}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all text-left ${allSelected ? 'bg-slate-900 text-white' : 'hover:bg-slate-50 text-slate-600'}`}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${allSelected ? 'bg-white border-white' : 'border-slate-300'}`}>
                      {allSelected && <Check className="w-2.5 h-2.5 text-slate-900" strokeWidth={3} />}
                    </div>
                    <span className="text-xs font-black uppercase tracking-widest">All Roles</span>
                  </button>

                  {ROLES.map(role => {
                    const checked = filterRoles.includes(role);
                    return (
                      <button
                        key={role}
                        onClick={() => toggleRole(role)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all text-left ${checked ? 'bg-emerald-50 text-emerald-800' : 'hover:bg-slate-50 text-slate-600'}`}
                      >
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${checked ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300'}`}>
                          {checked && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                        </div>
                        <span className="text-xs font-black uppercase tracking-widest">{role}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Divider */}
              <div className="mx-4 h-px bg-slate-100" />

              {/* Status */}
              <div className="px-4 py-3">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Status</p>
                <button
                  onClick={() => onFilterActiveOnlyChange(!filterActiveOnly)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all text-left ${filterActiveOnly ? 'bg-emerald-50 text-emerald-800' : 'hover:bg-slate-50 text-slate-600'}`}
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${filterActiveOnly ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300'}`}>
                    {filterActiveOnly && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                  </div>
                  <span className="text-xs font-black uppercase tracking-widest">Active Only</span>
                </button>
              </div>

              {/* Footer */}
              <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{totalShowing} showing</span>
                {hasActiveFilters && (
                  <button
                    onClick={resetFilters}
                    className="text-xs font-black text-rose-500 uppercase tracking-widest hover:underline"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
