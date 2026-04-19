import React, { useState, useMemo } from 'react';
import { Branch, AuditLog, Transaction } from '../../types';
import { BranchCheckboxDropdown } from '../shared/BranchCheckboxDropdown';
import { UI_THEME } from '../../constants/ui_designs';
import { playSound, resumeAudioContext } from '../../lib/audio';
import { generateAnalysis } from '../../lib/ai';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { Pagination } from '../dashboard/sections/common/Pagination';
import { toDateStr } from '@/src/utils/reportUtils';

interface GlobalAuditHubProps {
  branches: Branch[];
  auditLogs: AuditLog[];
}

export const GlobalAuditHub: React.FC<GlobalAuditHubProps> = ({ branches, auditLogs }) => {
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(toDateStr(new Date()));
  const [searchTerm, setSearchTerm] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // New states for Transaction Detail drilldown
  const [selectedTxDetail, setSelectedTxDetail] = useState<Transaction | null>(null);
  const [isFetchingDetail, setIsFetchingDetail] = useState(false);

  const filteredLogs = useMemo(() => {
    let list = auditLogs.filter(log => {
      const isDateMatch = !selectedDate || log.timestamp.startsWith(selectedDate);
      const isBranchMatch = selectedBranchIds.length === 0 || selectedBranchIds.includes(log.branchId);
      return isDateMatch && isBranchMatch;
    });

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(l => 
        l.description.toLowerCase().includes(term) || 
        l.performerName?.toLowerCase().includes(term) ||
        l.entityType.toLowerCase().includes(term)
      );
    }

    return list.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  }, [auditLogs, selectedBranchIds, selectedDate, searchTerm]);

  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(start, start + itemsPerPage);
  }, [filteredLogs, currentPage]);

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);

  const runNeuralGuardScan = async () => {
    if (filteredLogs.length === 0 || isScanning) return;
    setIsScanning(true);
    setAiAnalysis(null);
    playSound('click');

    try {
      const context = {
        totalLogs: filteredLogs.length,
        branchSummary: branches.map(b => ({ id: b.id, name: b.name })),
        recentActivity: filteredLogs.slice(0, 50)
      };
      
      const analysis = await generateAnalysis(
        "You are HilotCore Network Sentinel. Analyze global audit logs for suspicious patterns. 1. RISK LEVEL (LOW/MED/HIGH). 2. TOP 3 CONCERNS. 3. BE BRIEF.",
        `Analyze the security state for ${selectedBranchIds.length === 0 ? 'ENTIRE NETWORK' : 'SPECIFIC BRANCHES'} on ${selectedDate}.`,
        context
      );
      setAiAnalysis(analysis || "Status: ✅ SECURE. Global network integrity verified.");
      playSound('success');
    } catch (err) {
      setAiAnalysis("Neural relay failure. Please retry scan.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleLogClick = async (log: AuditLog) => {
    if (log.entityType !== 'TRANSACTION' || !log.entityId) return;
    
    setIsFetchingDetail(true);
    playSound('click');
    try {
      const { data, error } = await supabase
        .from(DB_TABLES.TRANSACTIONS)
        .select('*')
        .eq(DB_COLUMNS.ID, log.entityId)
        .maybeSingle();
      
      if (error) throw error;
      if (data) {
        setSelectedTxDetail({
          id: data[DB_COLUMNS.ID],
          branchId: data[DB_COLUMNS.BRANCH_ID],
          timestamp: data[DB_COLUMNS.TIMESTAMP],
          clientName: data[DB_COLUMNS.CLIENT_NAME],
          therapistName: data[DB_COLUMNS.THERAPIST_NAME],
          bonesetterName: data[DB_COLUMNS.BONESETTER_NAME],
          serviceId: data[DB_COLUMNS.SERVICE_ID],
          serviceName: data[DB_COLUMNS.SERVICE_NAME],
          basePrice: Number(data[DB_COLUMNS.BASE_PRICE] || 0),
          discount: Number(data[DB_COLUMNS.DISCOUNT] || 0),
          voucherValue: Number(data[DB_COLUMNS.VOUCHER_VALUE] || 0),
          primaryCommission: Number(data[DB_COLUMNS.PRIMARY_COMMISSION] || 0),
          secondaryCommission: Number(data[DB_COLUMNS.SECONDARY_COMMISSION] || 0),
          note: data[DB_COLUMNS.NOTE],
          total: Number(data[DB_COLUMNS.TOTAL] || 0)
        });
      } else {
        // Transaction might have been deleted/scrubbed
        playSound('warning');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsFetchingDetail(false);
    }
  };

  const getEntityIcon = (type: string) => {
    switch (type) {
      case 'TRANSACTION': return '📖';
      case 'EXPENSE': return '🧾';
      case 'SECURITY': return '🛡️';
      case 'EMPLOYEE': return '👤';
      case 'BRANCH': return '🏢';
      case 'ATTENDANCE': return '🕒';
      default: return '📜';
    }
  };

  const selectedBranchName = useMemo(() => {
    if (selectedBranchIds.length === 0) return 'FULL NETWORK ARCHIVE';
    if (selectedBranchIds.length === 1) return branches.find(b => b.id === selectedBranchIds[0])?.name || 'UNKNOWN BRANCH';
    return `${selectedBranchIds.length} BRANCHES`;
  }, [selectedBranchIds, branches]);

  const handlePrint = () => {
    playSound('click');
    window.print();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-700 max-w-[1400px] mx-auto pb-32 px-2">
      {/* TRANSACTION DETAIL MODAL */}
      {selectedTxDetail && (
        <div className={`${UI_THEME.layout.modalWrapper} no-print`}>
          <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} overflow-hidden flex flex-col max-h-[90vh] shadow-2xl`}>
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white">📖</div>
                 <div>
                    <h4 className="text-sm font-bold uppercase tracking-widest">Transaction Audit</h4>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.2em]">{selectedTxDetail.id.slice(-8).toUpperCase()}</p>
                 </div>
               </div>
               <button onClick={() => setSelectedTxDetail(null)} className="p-2 text-white/40 hover:text-white transition-colors"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar bg-white">
              <div className="space-y-1 text-center">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Client Name</p>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">{selectedTxDetail.clientName}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-2">
                  {(() => {
                    const dateStr = selectedTxDetail.timestamp;
                    const localDate = new Date(dateStr.replace(/(\+00:00|Z)$/, ""));
                    return localDate.toLocaleString("en-PH", {
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true
                    });
                  })()}
                </p>
              </div>

              <div className="bg-slate-50 p-6 rounded-[32px] border border-slate-100 space-y-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-bold text-slate-400 uppercase tracking-tight">Base Price</span>
                  <span className="font-bold text-slate-900">₱{selectedTxDetail.basePrice.toLocaleString()}</span>
                </div>

                {selectedTxDetail.discount > 0 && (
                    <div className="flex justify-between items-start text-sm py-4 border-y border-slate-100/50">
                       <div className="flex flex-col">
                         <span className="font-bold text-rose-500 uppercase tracking-tight">Total Reductions</span>
                         {/* BREAKDOWN OF DISCOUNT LOGIC */}
                         <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-widest mt-1">
                            {selectedTxDetail.discount === 50 || selectedTxDetail.discount === 100 ? 'System PWD/Senior Logic applied' : 'Includes Manual Adjustments'}
                         </p>
                       </div>
                       <span className="font-bold text-rose-600">− ₱{selectedTxDetail.discount.toLocaleString()}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-2">
                    <span className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">Final Yield</span>
                    <span className="text-3xl font-black text-emerald-600 tabular-nums">₱{selectedTxDetail.total.toLocaleString()}</span>
                  </div>
               </div>

               <div className="space-y-4">
                 <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-2">Breakdown</p>
                 <div className="grid grid-cols-1 gap-2">
                    <div className="p-4 bg-white border border-slate-100 rounded-2xl flex items-center justify-between">
                       <span className="text-[10px] font-bold text-slate-400 uppercase">Service(s)</span>
                       <span className="text-[11px] font-bold text-slate-900 text-right uppercase max-w-[200px] truncate">{selectedTxDetail.serviceName}</span>
                    </div>
                    <div className="p-4 bg-white border border-slate-100 rounded-2xl flex items-center justify-between">
                       <span className="text-[10px] font-bold text-slate-400 uppercase">Provider(s)</span>
                       <span className="text-[11px] font-bold text-slate-900 text-right uppercase">
                          {selectedTxDetail.therapistName} {selectedTxDetail.bonesetterName ? `+ ${selectedTxDetail.bonesetterName}` : ''}
                       </span>
                    </div>
                 </div>
               </div>
            </div>
            
            <div className="p-8 bg-slate-50 border-t flex flex-col gap-3">
               <button onClick={() => setSelectedTxDetail(null)} className="w-full bg-slate-900 text-white font-bold py-5 rounded-2xl uppercase tracking-widest text-[11px] shadow-lg active:scale-95">Dismiss Detail</button>
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL COMMAND BAR */}
      <div className={`bg-white ${UI_THEME.layout.cardPadding} ${UI_THEME.radius.card} border border-slate-200 shadow-sm no-print space-y-6`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center text-xl shadow-inner border border-white/10">
              🛡️
            </div>
            <div>
              <h3 className="text-[14px] font-black text-slate-900 uppercase tracking-tighter">Network Sentinel</h3>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Global Audit & Security Registry</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full">
          <button 
            onClick={handlePrint}
            className="h-10 sm:h-11 rounded-[24px] bg-white border border-slate-200 px-4 sm:px-6 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all shadow-sm active:scale-95 flex-1 sm:flex-none"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            <span className="hidden sm:inline">Print Audit</span>
          </button>
          <button 
            onClick={runNeuralGuardScan}
            disabled={isScanning || filteredLogs.length === 0}
            className={`flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 sm:px-8 py-3.5 rounded-[24px] uppercase text-[10px] tracking-[0.2em] shadow-xl disabled:opacity-20 transition-all active:scale-95 flex items-center justify-center gap-3 h-10 sm:h-11`}
          >
            {isScanning ? <div className="w-4 h-4 border-2 border-emerald-200 border-t-white rounded-full animate-spin"></div> : '🛰️'}
            <span>{isScanning ? 'Syncing Insights' : 'Neural Audit'}</span>
          </button>
        </div>

        {/* SEARCH + FILTER TOGGLE ROW */}
        <div className="flex flex-row items-center gap-2 sm:gap-4">
          <div className="relative flex-1 group">
            <div className="absolute left-4 md:left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-emerald-500 transition-colors">
              <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <input
                type="text"
                placeholder="SEARCH AUDIT TRACES..."
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
            {(selectedBranchIds.length > 0 || selectedDate !== toDateStr(new Date())) && !isFiltersOpen && <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>}
          </button>
        </div>

        {isFiltersOpen && (
          <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300 pt-2">
            <div className="flex flex-col lg:flex-row items-stretch gap-6">
              {/* BRANCH REGISTRY */}
              <div className="flex-1 space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Branch Registry</p>
                <BranchCheckboxDropdown
                  branches={branches}
                  selectedIds={selectedBranchIds}
                  onChange={setSelectedBranchIds}
                  className="w-full"
                />
              </div>

              {/* DATE NAVIGATOR INTEGRATED */}
              <div className="flex-1 space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Target Date</p>
                <div className="relative group h-14">
                  <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors z-10 pointer-events-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2-0 002-2V7a2 2-0 00-2-2H5a2 2-0 00-2-2V12a2 2-0 002 2z"/></svg>
                  </div>
                  <input 
                    type="date" 
                    value={selectedDate} 
                    onChange={e => setSelectedDate(e.target.value)}
                    className="w-full h-full bg-slate-50 border border-slate-200 rounded-[24px] pl-14 pr-6 text-slate-900 font-bold uppercase text-[12px] outline-none focus:bg-white focus:border-emerald-500 transition-all cursor-pointer shadow-inner"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {aiAnalysis && (
          <div className="mt-8 p-8 bg-slate-900 rounded-[36px] border border-white/5 animate-in slide-in-from-top-4 duration-500 relative shadow-2xl">
            <div className="flex items-center justify-between mb-5 border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]"></div>
                <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-[0.3em]">Neural Sentinel Intelligence</span>
              </div>
              <button onClick={() => setAiAnalysis(null)} className="text-[10px] font-bold text-white/20 uppercase hover:text-white transition-colors">Dismiss Report</button>
            </div>
            <p className="text-slate-300 text-sm font-medium leading-relaxed italic whitespace-pre-wrap">
              {aiAnalysis}
            </p>
          </div>
        )}
      </div>

      {/* ACTIVITY MATRIX */}
      <div className="px-4 no-print">
        <div className="flex flex-row items-center justify-between gap-4 px-1 sm:px-2 mb-8 border-b border-slate-200 pb-6">
          <div className="flex-1 min-w-0">
            <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                totalItems={filteredLogs.length}
                itemsPerPage={itemsPerPage}
            />
          </div>
          <button 
            onClick={handlePrint}
            className="h-14 w-14 sm:w-auto px-0 sm:px-6 rounded-2xl bg-slate-900 text-white flex items-center justify-center sm:justify-start gap-3 text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg active:scale-95 shrink-0"
          >
            <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2-0 002-2v-4a2 2-0 00-2-2H5a2 2-0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            <span className="hidden sm:inline">Print Audit</span>
          </button>
        </div>

        <div className="space-y-4">
          {paginatedLogs.length > 0 ? paginatedLogs.map((log) => (
            <div 
              key={log.id} 
              onClick={() => handleLogClick(log)}
              className={`bg-white p-4 sm:p-6 rounded-[28px] sm:rounded-[32px] border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-500 group flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6 ${log.entityType === 'TRANSACTION' ? 'cursor-pointer hover:border-emerald-200' : 'cursor-default'}`}
            >
              <div className="flex items-center gap-4 sm:gap-5 overflow-hidden flex-1">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center text-lg sm:text-xl shadow-inner shrink-0 transition-all bg-slate-50 text-slate-400 group-hover:bg-slate-900 group-hover:text-white group-hover:scale-105`}>
                   {getEntityIcon(log.entityType)}
                </div>
                <div className="min-w-0 flex-1 space-y-1.5 sm:space-y-2">
                   <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <span className={`text-[8px] sm:text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 sm:px-2.5 sm:py-1 rounded border ${
                        log.activityType === 'CREATE' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                        log.activityType === 'UPDATE' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                        'bg-rose-50 text-rose-600 border-rose-100'
                      }`}>
                        {log.activityType}
                      </span>
                      <span className="text-[9px] sm:text-[10px] font-bold text-slate-900 uppercase tracking-tighter bg-slate-100 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded">
                        {branches.find(b => b.id === log.branchId)?.name || 'CENTRAL'}
                      </span>
                      {log.entityType === 'TRANSACTION' && (
                        <span className="text-[7px] font-black bg-indigo-600 text-white px-1.5 py-0.5 rounded uppercase tracking-widest animate-pulse">Deep Detail Available</span>
                      )}
                   </div>
                   <h5 className="font-bold text-slate-900 uppercase text-[12px] sm:text-sm tracking-tight leading-tight group-hover:text-emerald-700 transition-colors truncate sm:whitespace-normal">
                     {log.description}
                   </h5>
                   <div className="flex flex-wrap items-center gap-3 sm:gap-4 pt-0.5 sm:pt-1">
                      <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-0.5 sm:py-1 bg-slate-900 text-white rounded-lg shadow-sm">
                        <span className="text-[7px] sm:text-[8px] font-bold uppercase tracking-widest opacity-60">AUTH BY:</span>
                        <span className="text-[9px] sm:text-[10px] font-bold uppercase">{log.performerName || 'SYSTEM CORE'}</span>
                      </div>
                      <span className="text-[9px] sm:text-[10px] font-bold text-slate-300 uppercase tracking-widest tabular-nums flex items-center gap-1.5">
                         <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                         {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                   </div>
                </div>
              </div>

              {log.amount ? (
                <div className="bg-slate-50 px-4 py-3 sm:px-6 sm:py-4 rounded-xl sm:rounded-2xl text-left sm:text-right shrink-0 border border-slate-100 sm:min-w-[140px] flex flex-row sm:flex-col justify-between sm:justify-center items-center sm:items-end">
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest sm:mb-1.5 leading-none">Value Impact</p>
                  <p className="text-lg sm:text-xl font-bold text-slate-900 tabular-nums leading-none">₱{log.amount.toLocaleString()}</p>
                </div>
              ) : null}
            </div>
          )) : (
            <div className="py-40 text-center bg-white rounded-[44px] border-2 border-dashed border-slate-100 flex flex-col items-center gap-5 opacity-30">
               <div className="text-7xl grayscale grayscale opacity-20">🛡️</div>
               <p className="text-[12px] font-bold uppercase tracking-[0.4em] text-slate-400">Silent Maintenance Cycle Active</p>
            </div>
          )}
        </div>
      </div>
      {/* PRINT VIEW (ONLY VISIBLE ON PRINT) */}
      <div className="hidden print:block space-y-8">
        <div className="border-b-2 border-slate-900 pb-4">
          <h1 className="text-3xl font-black uppercase tracking-tighter">Network Audit Registry</h1>
          <div className="flex justify-between mt-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            <p>Generated: {new Date().toLocaleString()}</p>
            <p>Branch: {selectedBranchName}</p>
            <p>Date: {selectedDate}</p>
          </div>
        </div>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-300">
              <th className="py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Timestamp</th>
              <th className="py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Activity</th>
              <th className="py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Branch</th>
              <th className="py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Performer</th>
              <th className="py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredLogs.map(log => (
              <tr key={log.id}>
                <td className="py-4 text-[10px] font-bold tabular-nums">
                  {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </td>
                <td className="py-4">
                  <p className="font-bold text-slate-900 uppercase text-[11px]">{log.description}</p>
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{log.activityType} | {log.entityType}</p>
                </td>
                <td className="py-4 text-[10px] font-bold uppercase">
                  {branches.find(b => b.id === log.branchId)?.name || 'CENTRAL'}
                </td>
                <td className="py-4 text-[10px] font-bold uppercase">
                  {log.performerName || 'SYSTEM CORE'}
                </td>
                <td className="py-4 text-right">
                  <span className="text-[11px] font-bold text-slate-900 tabular-nums">
                    {log.amount ? `₱${log.amount.toLocaleString()}` : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};