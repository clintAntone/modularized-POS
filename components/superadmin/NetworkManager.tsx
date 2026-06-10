
import React, { useState, useMemo, useEffect } from 'react';
import { Branch } from '../../types';
import { UI_THEME } from '../../constants/ui_designs';
import { Pagination } from '../dashboard/sections/common/Pagination';
import { playSound } from '../../lib/audio';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getManilaTodayStr } from '../../lib/time';

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
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [liveFilter, setLiveFilter] = useState<'all' | 'live' | 'closed'>('all');
  const [managerFilter, setManagerFilter] = useState<'all' | 'has_manager' | 'no_manager'>('all');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showPrintConfirm, setShowPrintConfirm] = useState(false);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  const filteredBranches = useMemo(() => {
    let res = [...branches];
    
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
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
  }, [branches, searchTerm, statusFilter, liveFilter, managerFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, liveFilter, managerFilter]);

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
      doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 20, { align: 'right' });
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

  return (
    <div className={`space-y-6 md:space-y-8 ${UI_THEME.layout.maxContent}`}>
      {/* HEADER SECTION */}
      <div className={`bg-white ${UI_THEME.layout.cardPadding} ${UI_THEME.radius.card} shadow-sm border border-slate-200 space-y-6 no-print`}>
        <div className="flex flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shadow-inner">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
            </div>
            <div>
              <h3 className="text-[14px] font-black text-slate-900 uppercase tracking-tighter">Branch Network</h3>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Global Branch Management</p>
            </div>
          </div>

          {!isReadOnly && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => { playSound('click'); onAdd(); }}
                className={`h-10 sm:h-11 rounded-[24px] ${UI_THEME.styles.actionButton} px-4 sm:px-6 flex items-center justify-center gap-2 transition-all active:scale-95`}
              >
                <span className="text-lg sm:text-base leading-none font-bold">+</span>
                <span className="hidden sm:inline font-black text-[10px] uppercase tracking-widest">Register Branch</span>
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
                className="w-full pl-12 md:pl-14 pr-4 md:pr-6 py-3.5 md:py-4 bg-slate-50 border border-slate-200 rounded-[24px] text-[11px] md:text-[13px] font-bold uppercase tracking-widest focus:bg-white focus:border-emerald-500 focus:ring-8 focus:ring-emerald-500/5 transition-all outline-none shadow-inner placeholder:text-slate-300"
            />
          </div>

            <button
              onClick={() => { setIsFiltersOpen(!isFiltersOpen); playSound('click'); }}
              className={`flex items-center gap-2 px-4 py-2.5 md:py-4 rounded-[24px] border transition-all text-[10px] font-black uppercase tracking-widest shrink-0 ${isFiltersOpen ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-500 hover:text-emerald-600'}`}
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
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Access Status</p>
                <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner h-14">
                  {(['all', 'active', 'inactive'] as const).map((val) => (
                    <button
                      key={val}
                      onClick={() => { setStatusFilter(val); playSound('click'); }}
                      className={`flex-1 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === val ? 'bg-white text-slate-900 shadow-md scale-[1.02] border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      {val === 'all' ? 'All' : val === 'active' ? 'Active' : 'Inactive'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Live Status</p>
                <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner h-14">
                  {(['all', 'live', 'closed'] as const).map((val) => (
                    <button
                      key={val}
                      onClick={() => { setLiveFilter(val); playSound('click'); }}
                      className={`flex-1 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${liveFilter === val ? 'bg-white text-slate-900 shadow-md scale-[1.02] border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      {val === 'all' ? 'All' : val === 'live' ? 'Online' : 'Offline'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Manager Status</p>
                <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner h-14">
                  {(['all', 'has_manager', 'no_manager'] as const).map((val) => (
                    <button
                      key={val}
                      onClick={() => { setManagerFilter(val); playSound('click'); }}
                      className={`flex-1 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${managerFilter === val ? 'bg-white text-slate-900 shadow-md scale-[1.02] border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
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

          <button
            onClick={() => handleExportPDF()}
            disabled={isExporting || filteredBranches.length === 0}
            className={`h-14 w-14 sm:w-auto px-0 sm:px-6 rounded-2xl bg-emerald-600 text-white flex items-center justify-center sm:justify-start gap-3 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg active:scale-95 shrink-0 ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isExporting ? (
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            ) : (
              <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            )}
            <span className="hidden sm:inline">{isExporting ? 'Exporting...' : 'Export PDF'}</span>
          </button>
        </div>

        {showPrintConfirm && (
          <div className={UI_THEME.layout.modalWrapper}>
            <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-10 text-center border border-slate-100`}>
              <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M17 17h2a2 2-0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              </div>
              <h4 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Export Branches?</h4>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-relaxed">
                Generate and download the branch network registry report?
              </p>
              <div className="flex flex-col gap-4 mt-10">
                <button
                  onClick={() => handleExportPDF(true)}
                  className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl text-[12px] uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3"
                >
                  Confirm Export
                </button>
                <button
                  onClick={() => setShowPrintConfirm(false)}
                  className="w-full text-slate-400 font-black py-4 rounded-xl text-[12px] uppercase tracking-widest"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DESKTOP TABLE */}
        <div className={`hidden md:block bg-white ${UI_THEME.radius.card} border border-slate-100 shadow-sm overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100">
                  <th className={`px-8 py-4 w-[30%] ${UI_THEME.text.metadata}`}>Branch</th>
                  <th className={`px-4 py-4 w-[18%] ${UI_THEME.text.metadata}`}>Manager</th>
                  <th className={`px-4 py-4 w-[11%] text-center ${UI_THEME.text.metadata}`}>Access</th>
                  <th className={`px-4 py-4 w-[11%] text-center ${UI_THEME.text.metadata}`}>Status</th>
                  <th className={`px-4 py-4 w-[10%] text-right ${UI_THEME.text.metadata}`}>Provision</th>
                  <th className={`px-4 py-4 w-[8%] text-center ${UI_THEME.text.metadata}`}>Cutoff</th>
                  <th className={`px-8 py-4 w-[12%] text-right ${UI_THEME.text.metadata}`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginatedBranches.map(branch => (
                  <tr
                    key={branch.id}
                    className={`group transition-colors relative ${
                      branch.isOpen ? 'hover:bg-slate-50/60' : 'hover:bg-slate-50/60'
                    } ${!branch.isEnabled ? 'opacity-50' : ''}`}
                  >
                    {/* Live accent strip */}
                    <td className="px-8 py-4 relative">
                      <div className="min-w-0">
                        <p className="font-black text-slate-900 uppercase text-[13px] tracking-tight group-hover:text-emerald-700 transition-colors leading-none">{branch.name}</p>
                        <p className="text-[9px] font-bold text-slate-300 font-mono tracking-widest mt-1">{branch.id.toUpperCase()}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {branch.manager ? (
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-slate-700 truncate leading-none">{branch.manager}</p>
                          {branch.tempManager && (
                            <p className="text-[9px] font-semibold text-slate-400 truncate mt-0.5">+{branch.tempManager}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-300 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
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
                          <span className={`text-[9px] font-black uppercase tracking-widest ${branch.isOpen ? 'text-emerald-600' : 'text-slate-300'}`}>
                            {branch.isOpen ? 'Live' : 'Closed'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-200">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {branch.vaultEnabled
                        ? <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">—</span>
                        : <span className="text-[13px] font-bold text-slate-700 tabular-nums">₱{(branch.dailyProvisionAmount || 800).toLocaleString()}</span>
                      }
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][branch.weeklyCutoff]}
                      </span>
                    </td>
                    <td className="px-8 py-4 text-right">
                      <button
                        onClick={() => { playSound('click'); onEdit(branch.id); }}
                        className="px-4 py-1.5 bg-slate-100 text-slate-600 font-black rounded-xl text-[9px] uppercase tracking-widest hover:bg-slate-900 hover:text-white active:scale-95 transition-all"
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
              className={`relative bg-white rounded-[24px] border overflow-hidden flex flex-col transition-all active:scale-[0.98] cursor-pointer shadow-sm hover:shadow-md ${
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
                    <p className="text-[8px] font-bold text-slate-300 font-mono tracking-widest mt-1">{branch.id.toUpperCase()}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${
                      branch.isEnabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${branch.isEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      {branch.isEnabled ? 'Active' : 'Off'}
                    </span>
                  </div>
                </div>

                {/* Manager */}
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl">
                  <div className="w-6 h-6 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
                    <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-700 uppercase truncate leading-none">
                      {branch.manager || <span className="text-slate-300 italic font-normal">No manager assigned</span>}
                    </p>
                    {branch.tempManager && (
                      <p className="text-[8px] font-semibold text-slate-400 truncate mt-0.5">+{branch.tempManager}</p>
                    )}
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-50 rounded-xl px-3 py-2 text-center">
                    <p className="text-[12px] font-black text-slate-900 uppercase leading-none">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][branch.weeklyCutoff]}</p>
                    <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Cutoff</p>
                  </div>
                  <div className={`rounded-xl px-3 py-2 text-center ${branch.isPinChanged ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                    <p className={`text-[12px] font-black uppercase leading-none ${branch.isPinChanged ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {branch.isPinChanged ? '🔒' : branch.pin}
                    </p>
                    <p className={`text-[7px] font-bold uppercase tracking-widest mt-0.5 ${branch.isPinChanged ? 'text-emerald-400' : 'text-amber-400'}`}>
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
