
import React, { useState, useMemo, useEffect } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { Branch } from '../../types';
import { UI_THEME } from '../../constants/ui_designs';
import { Pagination } from '../dashboard/sections/common/Pagination';
import { playSound } from '../../lib/audio';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getManilaTodayStr, getTrueDate } from '../../lib/time';

interface NetworkManagerProps {
  branches: Branch[];
  onAdd: () => void;
  onAddBulk: () => void;
  onEdit: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  isReadOnly?: boolean;
}

export const NetworkManager: React.FC<NetworkManagerProps> = ({ branches, onAdd, onAddBulk, onEdit, onToggle, isReadOnly }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [liveFilter, setLiveFilter] = useState<'all' | 'live' | 'closed'>('all');
  const [managerFilter, setManagerFilter] = useState<'all' | 'has_manager' | 'no_manager'>('all');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showPrintConfirm, setShowPrintConfirm] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  const filteredBranches = useMemo(() => {
    let res = [...branches];
    
    if (debouncedSearch.trim()) {
      const term = debouncedSearch.toLowerCase().trim();
      res = res.filter(b =>
        b.name.toLowerCase().includes(term) ||
        b.id.toLowerCase().includes(term)
      );
    }

    if (statusFilter !== 'all') {
      res = res.filter(b => statusFilter === 'active' ? b.isEnabled : !b.isEnabled);
    }

    if (liveFilter !== 'all') {
      res = res.filter(b => liveFilter === 'live' ? b.isOpen : !b.isOpen);
    }

    if (managerFilter !== 'all') {
      if (managerFilter === 'no_manager') {
        res = res.filter(b => !b.manager && !b.tempManager);
      } else if (managerFilter === 'has_manager') {
        res = res.filter(b => b.manager || b.tempManager);
      }
    }

    return res;
  }, [branches, debouncedSearch, statusFilter, liveFilter, managerFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, liveFilter, managerFilter]);

  useEffect(() => {
    if (!showExportMenu) return;
    const close = (e: MouseEvent) => { setShowExportMenu(false); };
    // Use setTimeout so this listener doesn't catch the opening click
    const t = setTimeout(() => document.addEventListener('mousedown', close), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', close); };
  }, [showExportMenu]);

  const paginatedBranches = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredBranches.slice(start, start + itemsPerPage);
  }, [filteredBranches, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredBranches.length / itemsPerPage);

  const handleExportPDF = async (confirmed = false) => {
    if (!confirmed) {
      playSound('warning');
      setShowPrintConfirm(true);
      return;
    }

    setShowPrintConfirm(false);
    setIsExporting(true);
    playSound('click');

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      // 1. Header
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text('BRANCH NETWORK REGISTRY', 14, 20);

      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139); // slate-400
      doc.text('GLOBAL BRANCH MANAGEMENT REPORT', 14, 26);

      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(`Generated: ${getTrueDate().toLocaleString()}`, pageWidth - 14, 20, { align: 'right' });
      doc.text(`Total Branches: ${filteredBranches.length}`, pageWidth - 14, 26, { align: 'right' });

      // 2. Table
      autoTable(doc, {
        startY: 35,
        head: [['Branch Entity', 'ID', 'Status', 'Live', 'Provision', 'Cutoff']],
        body: filteredBranches.map(b => [
          b.name.toUpperCase(),
          b.id.toUpperCase(),
          b.isEnabled ? 'ACTIVE' : 'INACTIVE',
          b.isOpen ? 'LIVE' : 'CLOSED',
          b.vaultEnabled ? 'VAULT' : `PHP ${Number(b.dailyProvisionAmount || 800).toLocaleString()}`,
          ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][b.weeklyCutoff].toUpperCase()
        ]),
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 8 },
        columnStyles: {
          4: { halign: 'right' }
        },
        rowPageBreak: 'avoid'
      });

      doc.save(`NETWORK_REGISTRY_${getManilaTodayStr()}.pdf`);
      playSound('success');
    } catch (error) {
      console.error('PDF Export failed:', error);
      alert('Failed to generate PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = () => {
    setShowExportMenu(false);
    playSound('click');
    const headers = ['Branch Name', 'Branch ID', 'Status', 'Live', 'Manager', 'Delegate', 'Cutoff Day', 'Opening Time', 'Closing Time', 'Shift 2 Opening', 'Shift 2 Closing', 'Daily Provision', 'Vault Enabled'];
    const rows = filteredBranches.map(b => [
      b.name,
      b.id,
      b.isEnabled ? 'Active' : 'Inactive',
      b.isOpen ? 'Live' : 'Closed',
      b.manager || '',
      b.tempManager || '',
      ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][b.weeklyCutoff],
      b.openingTime || '',
      b.closingTime || '',
      b.shift2OpeningTime || '',
      b.shift2ClosingTime || '',
      b.vaultEnabled ? 'Vault' : String(b.dailyProvisionAmount || 800),
      b.vaultEnabled ? 'Yes' : 'No',
    ]);

    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NETWORK_REGISTRY_${getManilaTodayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    playSound('success');
  };

  return (
    <div className={`space-y-6 md:space-y-8 ${UI_THEME.layout.maxContent}`}>
      {/* HEADER SECTION */}
      <div className={`bg-white dark:bg-slate-800 ${UI_THEME.layout.cardPadding} ${UI_THEME.radius.card} shadow-sm border border-slate-200 dark:border-slate-700 space-y-6 no-print`}>
        <div className="flex flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shadow-inner">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-tighter">Branch Network</h3>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Global Branch Management</p>
            </div>
          </div>

          {!isReadOnly && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => { playSound('click'); onAdd(); }}
                className="h-10 sm:h-11 rounded-2xl bg-emerald-500 text-white hover:bg-emerald-600 px-4 sm:px-6 flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <span className="text-lg sm:text-base leading-none font-bold">+</span>
                <span className="hidden sm:inline font-black text-xs uppercase tracking-widest">Register Branch</span>
              </button>
            </div>
          )}
        </div>

        {/* SEARCH + FILTER TOGGLE ROW */}
        <div className="flex flex-row items-center gap-2 sm:gap-4">
          <div className="relative flex-1 group">
            <div className="absolute left-4 md:left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-emerald-500 transition-colors">
              <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <input
                type="text"
                placeholder="SEARCH BRANCH..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 md:pl-14 pr-4 md:pr-6 py-3.5 md:py-4 bg-slate-50 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500 border border-slate-200 dark:border-slate-600 rounded-2xl text-xs md:text-sm font-medium uppercase tracking-wide focus:bg-white dark:focus:bg-slate-700 focus:border-emerald-500 focus:ring-8 focus:ring-emerald-500/5 transition-all outline-none shadow-inner placeholder:text-slate-300"
            />
          </div>

            <button
              onClick={() => { setIsFiltersOpen(!isFiltersOpen); playSound('click'); }}
              className={`flex items-center gap-2 px-4 py-2.5 md:py-4 rounded-2xl border transition-all text-xs font-semibold uppercase tracking-wide shrink-0 ${isFiltersOpen ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-500 hover:text-emerald-600'}`}
            >
              <svg className={`w-4 h-4 transition-transform duration-300 ${isFiltersOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M19 9l-7 7-7-7" /></svg>
              <span className="hidden sm:inline">{isFiltersOpen ? 'Hide Filters' : 'Filters'}</span>
              {(statusFilter !== 'all' || liveFilter !== 'all' || managerFilter !== 'all') && !isFiltersOpen && <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>}
            </button>
        </div>

        {isFiltersOpen && (
          <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300 pt-2">
            <div className="flex flex-col lg:flex-row items-stretch gap-6">
              <div className="flex-1 space-y-2">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">Access Status</p>
                <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-2xl border border-slate-200 dark:border-slate-600 shadow-inner h-14">
                  {(['all', 'active', 'inactive'] as const).map((val) => (
                    <button
                      key={val}
                      onClick={() => { setStatusFilter(val); playSound('click'); }}
                      className={`flex-1 px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wide transition-all ${statusFilter === val ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-md scale-[1.02] border border-slate-100 dark:border-slate-500' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                    >
                      {val === 'all' ? 'All' : val === 'active' ? 'Active' : 'Inactive'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 space-y-2">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">Live Status</p>
                <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-2xl border border-slate-200 dark:border-slate-600 shadow-inner h-14">
                  {(['all', 'live', 'closed'] as const).map((val) => (
                    <button
                      key={val}
                      onClick={() => { setLiveFilter(val); playSound('click'); }}
                      className={`flex-1 px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wide transition-all ${liveFilter === val ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-md scale-[1.02] border border-slate-100 dark:border-slate-500' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                    >
                      {val === 'all' ? 'All' : val === 'live' ? 'Online' : 'Offline'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 space-y-2">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">Manager Status</p>
                <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-2xl border border-slate-200 dark:border-slate-600 shadow-inner h-14">
                  {(['all', 'has_manager', 'no_manager'] as const).map((val) => (
                    <button
                      key={val}
                      onClick={() => { setManagerFilter(val); playSound('click'); }}
                      className={`flex-1 px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wide transition-all ${managerFilter === val ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-md scale-[1.02] border border-slate-100 dark:border-slate-500' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                    >
                      {val === 'all' ? 'All' : val === 'has_manager' ? 'Has Manager' : 'No Manager'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-1 space-y-4 no-print">
        <div className="flex flex-row items-center justify-between gap-4 px-1 sm:px-2">
          <div className="flex-1 min-w-0">
            <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                totalItems={filteredBranches.length}
                itemsPerPage={itemsPerPage}
                onItemsPerPageChange={(n) => { setItemsPerPage(n); setCurrentPage(1); }}
            />
          </div>

          {/* Export split button */}
          <div className="relative shrink-0">
            <div className={`flex h-14 rounded-2xl overflow-hidden shadow-lg ${filteredBranches.length === 0 || isExporting ? 'opacity-50 pointer-events-none' : ''}`}>
              {/* Main PDF button */}
              <button
                onClick={() => { setShowExportMenu(false); handleExportPDF(); }}
                className="flex items-center gap-2.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold uppercase tracking-wide transition-all active:scale-95"
              >
                {isExporting ? (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                )}
                <span className="hidden sm:inline">{isExporting ? 'Exporting...' : 'Export'}</span>
              </button>
              {/* Divider */}
              <div className="w-px bg-emerald-700" />
              {/* Chevron toggle */}
              <button
                onClick={() => setShowExportMenu(v => !v)}
                className="px-3 bg-emerald-600 hover:bg-emerald-700 text-white transition-all active:scale-95"
              >
                <svg className={`w-3.5 h-3.5 transition-transform ${showExportMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
            </div>

            {/* Dropdown */}
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-2 w-44 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden z-50">
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => { setShowExportMenu(false); handleExportPDF(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                  Export PDF
                </button>
                <div className="h-px bg-slate-100 dark:bg-slate-700" />
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={handleExportExcel}
                  className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Export Excel
                </button>
              </div>
            )}
          </div>
        </div>

        {showPrintConfirm && (
          <div className={UI_THEME.layout.modalWrapper}>
            <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-10 text-center border border-slate-100`}>
              <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M17 17h2a2 2-0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              </div>
              <h4 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Export Branches?</h4>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide leading-relaxed">
                Generate and download the branch network registry report?
              </p>
              <div className="flex flex-col gap-4 mt-10">
                <button
                  onClick={() => handleExportPDF(true)}
                  className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3"
                >
                  Confirm Export
                </button>
                <button
                  onClick={() => setShowPrintConfirm(false)}
                  className="w-full text-slate-400 font-black py-4 rounded-xl text-xs uppercase tracking-widest"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DESKTOP TABLE */}
        <div className={`hidden md:block bg-white dark:bg-slate-800 ${UI_THEME.radius.card} border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700">
                  <th className={`px-8 py-4 w-[30%] ${UI_THEME.text.metadata}`}>Branch</th>
                  <th className={`px-4 py-4 w-[18%] ${UI_THEME.text.metadata}`}>Manager</th>
                  <th className={`px-4 py-4 w-[11%] text-center ${UI_THEME.text.metadata}`}>Access</th>
                  <th className={`px-4 py-4 w-[11%] text-center ${UI_THEME.text.metadata}`}>Status</th>
                  <th className={`px-4 py-4 w-[10%] text-right ${UI_THEME.text.metadata}`}>Provision</th>
                  <th className={`px-4 py-4 w-[8%] text-center ${UI_THEME.text.metadata}`}>Cutoff</th>
                  <th className={`px-8 py-4 w-[12%] text-right ${UI_THEME.text.metadata}`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                {paginatedBranches.map(branch => (
                  <tr
                    key={branch.id}
                    className={`group transition-colors relative hover:bg-slate-50/60 dark:hover:bg-slate-700/50 ${!branch.isEnabled ? 'opacity-50' : ''}`}
                  >
                    {/* Live accent strip */}
                    <td className="px-8 py-4 relative">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-black text-slate-900 dark:text-slate-100 uppercase text-sm tracking-tight group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors leading-none">{branch.name}</p>
                          {branch.faceIdEnabled === false && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-600 text-xs font-semibold uppercase tracking-wide shrink-0">
                              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                              No Face ID
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-bold text-slate-300 font-mono tracking-widest mt-1">{branch.id.toUpperCase()}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {branch.manager ? (
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-700 truncate leading-none">{branch.manager}</p>
                          {branch.tempManager && (
                            <p className="text-xs font-semibold text-slate-400 truncate mt-0.5">+{branch.tempManager}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${
                        branch.isEnabled
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-rose-50 text-rose-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${branch.isEnabled ? 'bg-emerald-500' : 'bg-rose-400'}`} />
                        {branch.isEnabled ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {branch.isEnabled ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${branch.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-slate-200'}`} />
                          <span className={`text-xs font-semibold uppercase tracking-wide ${branch.isOpen ? 'text-emerald-600' : 'text-slate-300'}`}>
                            {branch.isOpen ? 'Live' : 'Closed'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-200">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {branch.vaultEnabled
                        ? <span className="text-xs font-black text-slate-300 uppercase tracking-widest">—</span>
                        : <span className="text-sm font-bold text-slate-700 tabular-nums">₱{(branch.dailyProvisionAmount || 800).toLocaleString()}</span>
                      }
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-xs font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wide bg-slate-50 dark:bg-slate-700 px-2 py-1 rounded-lg border border-slate-100 dark:border-slate-600">
                        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][branch.weeklyCutoff]}
                      </span>
                    </td>
                    <td className="px-8 py-4 text-right">
                      <button
                        onClick={() => { playSound('click'); onEdit(branch.id); }}
                        className="px-4 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-black rounded-xl text-xs uppercase tracking-widest hover:bg-slate-900 hover:text-white active:scale-95 transition-all"
                      >
                        Config
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* MOBILE CARD VIEW */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:hidden">
          {paginatedBranches.map(branch => (
            <div
              key={branch.id}
              onClick={() => { playSound('click'); onEdit(branch.id); }}
              className={`relative bg-white rounded-2xl border overflow-hidden flex flex-col transition-all active:scale-[0.98] cursor-pointer shadow-sm hover:shadow-md ${
                branch.isOpen
                  ? 'border-slate-100 hover:border-slate-200'
                  : branch.isEnabled
                    ? 'border-slate-100 hover:border-emerald-200'
                    : 'border-slate-100 opacity-60'
              }`}
            >
              {/* Top accent bar */}
              <div className={`h-1 w-full ${
                branch.isOpen ? 'bg-emerald-400' : branch.isEnabled ? 'bg-slate-200' : 'bg-slate-100'
              }`} />

              <div className="p-5 flex flex-col gap-4">
                {/* Identity row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[16px] font-black text-slate-900 uppercase tracking-tight leading-none truncate">{branch.name}</h3>
                    <p className="text-xs font-bold text-slate-300 font-mono tracking-widest mt-1">{branch.id.toUpperCase()}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${
                      branch.isEnabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${branch.isEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      {branch.isEnabled ? 'Active' : 'Off'}
                    </span>
                    {branch.faceIdEnabled === false && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-600 text-xs font-semibold uppercase tracking-wide">
                        <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                        No Face ID
                      </span>
                    )}
                  </div>
                </div>

                {/* Manager */}
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl">
                  <div className="w-6 h-6 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
                    <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-700 uppercase truncate leading-none">
                      {branch.manager || <span className="text-slate-300 italic font-normal">No manager assigned</span>}
                    </p>
                    {branch.tempManager && (
                      <p className="text-xs font-semibold text-slate-400 truncate mt-0.5">+{branch.tempManager}</p>
                    )}
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-50 rounded-xl px-3 py-2 text-center">
                    <p className="text-xs font-black text-slate-900 uppercase leading-none">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][branch.weeklyCutoff]}</p>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-0.5">Cutoff</p>
                  </div>
                  <div className={`rounded-xl px-3 py-2 text-center ${branch.isPinChanged ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                    <p className={`text-xs font-black uppercase leading-none ${branch.isPinChanged ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {branch.isPinChanged ? '🔒' : branch.pin}
                    </p>
                    <p className={`text-xs font-medium uppercase tracking-wide mt-0.5 ${branch.isPinChanged ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {branch.isPinChanged ? 'Secured' : 'Default PIN'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
