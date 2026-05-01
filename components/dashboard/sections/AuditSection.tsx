import React, { useState, useMemo } from 'react';
import { Branch, AuditLog, Transaction } from '../../../types';
import { UI_THEME } from '../../../constants/ui_designs';
import { playSound } from '../../../lib/audio';
import { generateAnalysis } from '../../../lib/ai';
import { supabase } from '../../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';
import { Pagination } from './common/Pagination';
import { toDateStr } from '@/src/utils/reportUtils';

interface AuditSectionProps {
  branch: Branch;
  auditLogs: AuditLog[];
}

export const AuditSection: React.FC<AuditSectionProps> = ({ branch, auditLogs }) => {
  const [selectedDate, setSelectedDate] = useState<string>(toDateStr(new Date()));
  const [isScanning, setIsScanning] = useState(false);
  const [aiInsights, setAiInsights] = useState<string | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Detail Drilldown states
  const [selectedTxDetail, setSelectedTxDetail] = useState<Transaction | null>(null);
  const [isFetchingDetail, setIsFetchingDetail] = useState(false);

  const filteredLogs = useMemo(() => {
    return auditLogs
      .filter(log => log.branchId === branch.id && log.timestamp.startsWith(selectedDate))
      .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  }, [auditLogs, branch.id, selectedDate]);

  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(start, start + itemsPerPage);
  }, [filteredLogs, currentPage]);

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);

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
        playSound('warning');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsFetchingDetail(false);
    }
  };

  const runSecurityScan = async () => {
    if (filteredLogs.length === 0 || isScanning) return;
    setIsScanning(true);
    setAiInsights(null);
    playSound('click');

    try {
      const systemInstruction = "You are HilotCore Anomaly Guard. Scan logs for fraud/errors. RULES: 1. BE EXTREMELY CONCISE. 2. USE BULLET POINTS. 3. MAX 3 BULLETS. 4. START WITH STATUS (✅ SECURE or ⚠️ ALERT). 5. Report only high-risk patterns like 'Create-Delete-Create' or suspicious discounts. No fluff.";
      const analysis = await generateAnalysis(systemInstruction, "Perform a security scan on today's branch activity logs.", filteredLogs);
      setAiInsights(analysis || "Status: ✅ SECURE. No anomalies detected.");
      playSound('success');
    } catch (err) {
      setAiInsights("Neural relay fault: Scan interrupted.");
    } finally {
      setIsScanning(false);
    }
  };

  const getEntityIcon = (type: string) => {
    switch (type) {
      case 'TRANSACTION': return '📖';
      case 'EXPENSE': return '🧾';
      case 'ATTENDANCE': return '👤';
      case 'EMPLOYEE': return '💆';
      default: return '🛡️';
    }
  };

  return (
    <div className="max-w-screen-md mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-32">
      
      {/* TRANSACTION DETAIL MODAL */}
      {selectedTxDetail && (
        <div className={UI_THEME.layout.modalWrapper}>
          <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} overflow-hidden flex flex-col max-h-[90vh] shadow-2xl animate-in zoom-in duration-300`}>
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white text-lg">📖</div>
                 <div>
                    <h4 className="text-sm font-bold uppercase tracking-widest leading-none">Session Audit</h4>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">Registry Record Detail</p>
                 </div>
               </div>
               <button onClick={() => setSelectedTxDetail(null)} className="p-2 text-white/40 hover:text-white transition-colors"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar bg-white">
               <div className="space-y-1 text-center">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Customer</p>
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none">{selectedTxDetail.clientName}</h3>
                  <div className="inline-flex items-center gap-2 mt-4 px-4 py-1.5 bg-slate-50 border border-slate-100 rounded-full">
                     <span className="text-[10px] font-bold text-slate-400 tabular-nums uppercase tracking-widest">
                       {new Date(selectedTxDetail.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                     </span>
                  </div>
               </div>

               <div className="bg-slate-50 p-6 rounded-[32px] border border-slate-100 space-y-4 shadow-inner">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-bold text-slate-500 uppercase tracking-tight">Standard Price</span>
                    <span className="font-bold text-slate-900 tabular-nums">₱{selectedTxDetail.basePrice.toLocaleString()}</span>
                  </div>
                  
                  {selectedTxDetail.discount > 0 && (
                    <div className="flex justify-between items-start text-sm py-4 border-y border-slate-100/50">
                       <div className="flex flex-col">
                         <span className="font-bold text-rose-500 uppercase tracking-tight">Applied Reductions</span>
                         <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1 italic">
                            System PWD check + Manual Adjustments
                         </p>
                       </div>
                       <span className="font-bold text-rose-600 tabular-nums">− ₱{selectedTxDetail.discount.toLocaleString()}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-2">
                    <span className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">Net Collection</span>
                    <span className="text-3xl font-black text-emerald-600 tabular-nums tracking-tighter leading-none">₱{selectedTxDetail.total.toLocaleString()}</span>
                  </div>
               </div>

               <div className="space-y-4">
                 <div className="grid grid-cols-1 gap-2">
                    <div className="p-5 bg-white border border-slate-100 rounded-3xl flex flex-col gap-1.5 shadow-sm">
                       <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Selected Unit Group</span>
                       <span className="text-[12px] font-black text-slate-900 uppercase tracking-tight leading-tight">{selectedTxDetail.serviceName}</span>
                    </div>
                    <div className="p-5 bg-white border border-slate-100 rounded-3xl flex flex-col gap-1.5 shadow-sm">
                       <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Registry Providers</span>
                       <span className="text-[12px] font-black text-slate-900 uppercase tracking-tight leading-tight">
                          {selectedTxDetail.therapistName} {selectedTxDetail.bonesetterName ? `• Support: ${selectedTxDetail.bonesetterName}` : ''}
                       </span>
                    </div>
                 </div>
               </div>
            </div>
            
            <div className="p-8 bg-slate-50 border-t">
               <button onClick={() => setSelectedTxDetail(null)} className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl uppercase tracking-widest text-[11px] shadow-lg active:scale-95 transition-all">Dismiss Detail</button>
            </div>
          </div>
        </div>
      )}

      {/* AI ANOMALY GUARD HEADER */}
      <div className="bg-slate-900 rounded-[40px] p-6 md:p-10 border border-white/5 shadow-2xl relative overflow-hidden">
         <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.1),transparent_50%)]"></div>
         <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
            <div className="space-y-1">
               <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full mb-3 mx-auto md:mx-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
                  <span className="text-[8px] font-black uppercase tracking-[0.3em] text-indigo-400">Security Core Enabled</span>
               </div>
               <h2 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">Security Registry</h2>
               <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Autonomous Integrity Monitoring</p>
            </div>
            <button 
              onClick={runSecurityScan}
              disabled={isScanning || filteredLogs.length === 0}
              className="bg-white text-slate-900 font-black px-8 py-4 rounded-[22px] uppercase text-[10px] tracking-[0.2em] shadow-xl hover:bg-emerald-500 hover:text-white transition-all active:scale-95 disabled:opacity-20 flex items-center justify-center gap-3"
            >
              {isScanning ? <div className="w-3 h-3 border-2 border-slate-400 border-t-slate-900 rounded-full animate-spin"></div> : '🛰️'}
              {isScanning ? 'Scanning...' : 'Run Neural Scan'}
            </button>
         </div>

         {aiInsights && (
           <div className="mt-8 p-6 bg-white/5 rounded-[32px] border border-white/10 animate-in slide-in-from-top-4 duration-500 relative">
              <div className="absolute top-4 right-6 text-[9px] font-black text-emerald-400 uppercase tracking-widest animate-pulse">Vigilance Active</div>
              <p className="text-slate-300 text-sm font-medium italic leading-relaxed pr-8 whitespace-pre-wrap">
                {aiInsights}
              </p>
              <button onClick={() => setAiInsights(null)} className="mt-4 text-[7px] font-black text-slate-500 uppercase tracking-[0.5em] hover:text-white transition-colors">Dismiss Guard Report</button>
           </div>
         )}
      </div>

      <div className="flex flex-row items-center justify-between gap-4 px-1 sm:px-2">
        <div className="flex-1 min-w-0">
          <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={filteredLogs.length}
              itemsPerPage={itemsPerPage}
              onItemsPerPageChange={(n) => { setItemsPerPage(n); setCurrentPage(1); }}
          />
        </div>
        <div className="relative group w-full sm:w-auto shrink-0">
          <input 
            type="date" 
            value={selectedDate} 
            onChange={(e) => { setSelectedDate(e.target.value); }}
            className="w-full bg-white border border-slate-100 rounded-2xl px-5 py-3.5 font-black text-[11px] uppercase text-slate-900 outline-none focus:border-emerald-500 transition-all shadow-sm h-14"
          />
        </div>
      </div>

      {/* ACTIVITY FEED TIMELINE */}
      <div className="relative px-2">
        {paginatedLogs.length > 0 && (
          <div className="absolute left-[34px] top-6 bottom-6 w-0.5 bg-slate-100 hidden sm:block"></div>
        )}

        <div className="space-y-4">
          {paginatedLogs.length > 0 ? paginatedLogs.map((log, idx) => (
            <div key={log.id} className="relative flex items-start gap-5 group">
              <div className="hidden sm:flex items-center justify-center w-12 shrink-0 relative z-10">
                <div className={`w-3.5 h-3.5 rounded-full border-4 border-slate-50 shadow-sm transition-all duration-500 group-hover:scale-150 ${
                  log.activityType === 'CREATE' ? 'bg-emerald-500 shadow-emerald-100' :
                  log.activityType === 'UPDATE' ? 'bg-amber-400 shadow-amber-100' :
                  'bg-rose-500 shadow-rose-100'
                }`}></div>
              </div>
              <div 
                onClick={() => handleLogClick(log)}
                className={`flex-1 bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-500 relative overflow-hidden active:scale-[0.99] ${log.entityType === 'TRANSACTION' ? 'cursor-pointer hover:border-emerald-200' : 'cursor-default'}`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-lg shadow-inner border border-slate-100/50 shrink-0">
                      {getEntityIcon(log.entityType)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${
                          log.activityType === 'CREATE' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                          log.activityType === 'UPDATE' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                          'bg-rose-50 text-rose-600 border-rose-100'
                        }`}>
                          {log.activityType}
                        </span>
                        <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">• {log.entityType}</span>
                        {log.entityType === 'TRANSACTION' && <span className="text-[7px] font-black bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-100 animate-pulse">View Details</span>}
                      </div>
                      
                      <h4 className="font-black text-slate-900 uppercase text-[12px] tracking-tight truncate leading-none mb-2.5">
                        {log.description}
                      </h4>
                      
                      <div className="flex flex-wrap items-center gap-3">
                         <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-900 rounded-lg shadow-sm">
                            <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            <span className="text-[9px] font-black text-white uppercase tracking-widest">
                               {log.performerName || 'SYSTEM'}
                            </span>
                         </div>
                         
                         <div className="flex items-center gap-1 opacity-40">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span className="text-[10px] font-bold tabular-nums tracking-widest">
                               {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                         </div>
                      </div>
                    </div>
                  </div>
                  {log.amount !== undefined && log.amount !== null && (
                    <div className="bg-slate-50 px-4 py-2 rounded-xl text-right shrink-0 border border-slate-100">
                      <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Value Trace</p>
                      <p className="text-sm font-black text-slate-900 tabular-nums">₱{log.amount.toLocaleString()}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )) : (
            <div className="py-32 text-center bg-white rounded-[44px] border-2 border-dashed border-slate-100 animate-in zoom-in duration-700">
               <div className="text-5xl grayscale opacity-20 mb-6">🛰️</div>
               <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.4em]">Historical Silent Cycle</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 pt-10 opacity-30">
        <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.5em]">Immutable Ledger Stream v2.5</p>
      </div>
    </div>
  );
};