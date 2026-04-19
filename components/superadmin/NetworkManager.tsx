
import React, { useState, useMemo, useEffect } from 'react';
import { Branch } from '../../types';
import { UI_THEME } from '../../constants/ui_designs';
import { Pagination } from '../dashboard/sections/common/Pagination';
import { playSound } from '../../lib/audio';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface NetworkManagerProps {
  branches: Branch[];
  onAdd: () => void;
  onAddBulk: () => void;
  onEdit: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
}

export const NetworkManager: React.FC<NetworkManagerProps> = ({ branches, onAdd, onAddBulk, onEdit, onToggle }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [liveFilter, setLiveFilter] = useState<'all' | 'live' | 'closed'>('all');
  const [managerFilter, setManagerFilter] = useState<'all' | 'has_manager' | 'no_manager'>('all');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showPrintConfirm, setShowPrintConfirm] = useState(false);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

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
  }, [filteredBranches, currentPage]);

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
          b.isEnabled ? 'ACTIVE' : 'SUSPENDED',
          b.isOpen ? 'LIVE' : 'CLOSED',
          `PHP ${Number(b.dailyProvisionAmount || 800).toLocaleString()}`,
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

      doc.save(`NETWORK_REGISTRY_${new Date().toISOString().split('T')[0]}.pdf`);
      playSound('success');
    } catch (error) {
      console.error('PDF Export failed:', error);
      alert('Failed to generate PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={`space-y-6 md:space-y-8 animate-in fade-in duration-700 ${UI_THEME.layout.maxContent}`}>
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

          <div className="flex items-center gap-2">
            <button 
              onClick={() => { playSound('click'); onAddBulk(); }}
              className={`h-10 sm:h-11 rounded-[24px] bg-slate-100 text-slate-600 hover:bg-slate-200 px-4 sm:px-6 flex items-center justify-center gap-2 transition-all active:scale-95`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              <span className="hidden sm:inline font-black text-[10px] uppercase tracking-widest">Bulk Register</span>
            </button>
            <button 
              onClick={() => { playSound('click'); onAdd(); }}
              className={`h-10 sm:h-11 rounded-[24px] ${UI_THEME.styles.actionButton} px-4 sm:px-6 flex items-center justify-center gap-2 transition-all active:scale-95`}
            >
              <span className="text-lg sm:text-base leading-none font-bold">+</span>
              <span className="hidden sm:inline font-black text-[10px] uppercase tracking-widest">Register Branch</span>
            </button>
          </div>
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
                  {(['all', 'active', 'suspended'] as const).map((val) => (
                    <button
                      key={val}
                      onClick={() => { setStatusFilter(val); playSound('click'); }}
                      className={`flex-1 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === val ? 'bg-white text-slate-900 shadow-md scale-[1.02] border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      {val === 'all' ? 'All Access' : val === 'active' ? 'Active' : 'Suspended'}
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
            <span className="hidden sm:inline">{isExporting ? 'Exporting...' : 'Export Branches'}</span>
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
                  Confirm Print
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

        <div className={`hidden md:block bg-white ${UI_THEME.radius.card} border border-slate-200 shadow-sm overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className={`px-8 py-5 w-[28%] ${UI_THEME.text.metadata}`}>Branch Entity</th>
                  <th className={`px-4 py-5 w-[12%] text-center ${UI_THEME.text.metadata}`}>Access</th>
                  <th className={`px-4 py-5 w-[12%] text-center ${UI_THEME.text.metadata}`}>Daily Status</th>
                  <th className={`px-4 py-5 w-[14%] text-center ${UI_THEME.text.metadata}`}>Registry PIN</th>
                  <th className={`px-4 py-5 w-[12%] text-right ${UI_THEME.text.metadata}`}>Provision</th>
                  <th className={`px-4 py-5 w-[10%] text-center ${UI_THEME.text.metadata}`}>Cutoff</th>
                  <th className={`px-8 py-5 w-[12%] text-right ${UI_THEME.text.metadata}`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedBranches.map(branch => (
                  <tr key={branch.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 uppercase text-sm tracking-tight group-hover:text-emerald-700 transition-colors">{branch.name}</p>
                        <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-widest leading-none mt-1.5">ID: {branch.id.toUpperCase()}</p>
                      </div>
                    </td>
                    <td className="px-4 py-5 text-center">
                      <span className={`inline-block px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                        branch.isEnabled ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-rose-50 border-rose-100 text-rose-400'
                      }`}>
                        {branch.isEnabled ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td className="px-4 py-5 text-center">
                      {branch.isEnabled ? (
                        <div className="flex items-center justify-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${branch.isOpen ? 'bg-indigo-600 animate-pulse' : 'bg-slate-200'}`}></div>
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${branch.isOpen ? 'text-indigo-600' : 'text-slate-300'}`}>{branch.isOpen ? 'Live' : 'Closed'}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-200">—</span>
                      )}
                    </td>
                    <td className="px-4 py-5 text-center">
                      {branch.isPinChanged ? (
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest italic opacity-40">Encrypted</span>
                      ) : (
                        <span className="text-sm font-bold text-amber-600 tabular-nums tracking-widest bg-amber-50 px-2.5 py-1 rounded border border-amber-100">{branch.pin}</span>
                      )}
                    </td>
                    <td className="px-4 py-5 text-right">
                      <span className="text-sm font-bold text-slate-900 tabular-nums">₱{(branch.dailyProvisionAmount || 800).toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-5 text-center">
                      <span className="text-[11px] font-bold text-slate-900 uppercase tracking-widest">
                        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][branch.weeklyCutoff]}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <button 
                        onClick={() => onEdit(branch.id)}
                        className="px-5 py-2 bg-slate-900 text-white font-bold rounded-xl text-[10px] uppercase tracking-widest shadow-sm hover:bg-emerald-600 active:scale-[0.98] transition-all"
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
        <div className="grid grid-cols-1 gap-4 md:hidden px-2">
          {paginatedBranches.map(branch => (
            <div key={branch.id} className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden flex flex-col transition-all active:scale-[0.98]">
              {/* Status Bar */}
              <div className={`h-1.5 w-full ${branch.isEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
              
              <div className="p-6 space-y-8">
                {/* Header: Identity */}
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <h3 className="text-[20px] font-black text-slate-900 uppercase tracking-tight leading-none">
                      {branch.name}
                    </h3>
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                      Branch {branch.id.toUpperCase()}
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border shadow-sm ${
                    branch.isEnabled ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-200'
                  }`}>
                    {branch.isEnabled ? 'Online' : 'Offline'}
                  </span>
                </div>

                {/* The Story: Live Status & Cycle */}
                <div className="flex items-end justify-between px-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${branch.isOpen ? 'bg-indigo-500 animate-pulse' : 'bg-slate-300'}`}></div>
                      <span className={`text-[16px] font-black uppercase tracking-tighter ${branch.isOpen ? 'text-indigo-600' : 'text-slate-400'}`}>
                        {branch.isOpen ? 'Live Now' : 'Resting'}
                      </span>
                    </div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                      {branch.isEnabled ? 'Active Branch' : 'Access Revoked'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[16px] font-black text-slate-900 tracking-tighter uppercase">
                      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][branch.weeklyCutoff]}
                    </p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Cycle Reset</p>
                  </div>
                </div>

                {/* Financial Story */}
                <div className="bg-slate-50 rounded-[24px] p-6 border border-slate-100/50 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-[20px] font-black text-slate-900 tabular-nums tracking-tighter">
                      ₱{(branch.dailyProvisionAmount || 800).toLocaleString()}
                    </p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Daily Budget</p>
                  </div>
                  <div className="text-right space-y-0.5">
                    {branch.isPinChanged ? (
                      <p className="text-[14px] font-black text-slate-300 uppercase tracking-tighter italic">Secured</p>
                    ) : (
                      <p className="text-[18px] font-black text-amber-600 tabular-nums tracking-[0.2em]">{branch.pin}</p>
                    )}
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Access Key</p>
                  </div>
                </div>

                {/* Action Button */}
                <button 
                  onClick={() => { playSound('click'); onEdit(branch.id); }}
                  className="w-full bg-slate-900 text-white font-black py-5 rounded-[24px] text-[11px] uppercase tracking-[0.2em] shadow-xl hover:bg-emerald-600 active:scale-[0.98] transition-all"
                >
                  Configure Branch
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
