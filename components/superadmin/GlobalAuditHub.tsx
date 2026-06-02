
import React, { useState, useMemo } from 'react';
import { Branch, AuditLog, Transaction } from '../../types';
import { BranchCheckboxDropdown } from '../shared/BranchCheckboxDropdown';
import { UI_THEME } from '../../constants/ui_designs';
import { playSound } from '../../lib/audio';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { Pagination } from '../dashboard/sections/common/Pagination';
import { toDateStr } from '@/src/utils/reportUtils';

interface GlobalAuditHubProps {
  branches: Branch[];
  auditLogs: AuditLog[];
}

const ENTITY_TYPES = ['ALL', 'TRANSACTION', 'EXPENSE', 'ATTENDANCE', 'EMPLOYEE', 'SECURITY', 'USER'] as const;
type EntityFilter = typeof ENTITY_TYPES[number];

const ENTITY_ICON: Record<string, string> = {
  TRANSACTION: '📖',
  EXPENSE: '🧾',
  SECURITY: '🛡️',
  EMPLOYEE: '👤',
  BRANCH: '🏢',
  ATTENDANCE: '🕒',
  USER: '🔑',
};

const ENTITY_COLOR: Record<string, string> = {
  TRANSACTION: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  EXPENSE:     'bg-rose-50 text-rose-700 border-rose-200',
  SECURITY:    'bg-slate-900 text-white border-slate-700',
  EMPLOYEE:    'bg-violet-50 text-violet-700 border-violet-200',
  BRANCH:      'bg-indigo-50 text-indigo-700 border-indigo-200',
  ATTENDANCE:  'bg-amber-50 text-amber-700 border-amber-200',
  USER:        'bg-sky-50 text-sky-700 border-sky-200',
};

const ACTIVITY_COLOR: Record<string, string> = {
  CREATE: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  UPDATE: 'bg-amber-50 text-amber-600 border-amber-100',
  DELETE: 'bg-rose-50 text-rose-600 border-rose-100',
  LOGIN:  'bg-sky-50 text-sky-600 border-sky-100',
  LOGOUT: 'bg-slate-50 text-slate-500 border-slate-200',
};

type SecurityFlag = {
  id: string;
  severity: 'HIGH' | 'MED' | 'LOW';
  title: string;
  detail: string;
  branchName: string;
  count: number;
  latestTimestamp: string;
};

export const GlobalAuditHub: React.FC<GlobalAuditHubProps> = ({ branches, auditLogs }) => {
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(toDateStr(new Date()));
  const [allDates, setAllDates] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('ALL');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  const [selectedTxDetail, setSelectedTxDetail] = useState<Transaction | null>(null);
  const [isFetchingDetail, setIsFetchingDetail] = useState(false);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

  const filteredLogs = useMemo(() => {
    let list = auditLogs.filter(log => {
      const isDateMatch = allDates || !selectedDate || log.timestamp.startsWith(selectedDate);
      const isBranchMatch = selectedBranchIds.length === 0 || selectedBranchIds.includes(log.branchId);
      const isEntityMatch = entityFilter === 'ALL' || log.entityType === entityFilter;
      return isDateMatch && isBranchMatch && isEntityMatch;
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
  }, [auditLogs, selectedBranchIds, selectedDate, allDates, searchTerm, entityFilter]);

  // Base logs (before entity filter) — used for pills and analytics
  const baseLogs = useMemo(() => auditLogs.filter(log => {
    const isDateMatch = allDates || !selectedDate || log.timestamp.startsWith(selectedDate);
    const isBranchMatch = selectedBranchIds.length === 0 || selectedBranchIds.includes(log.branchId);
    return isDateMatch && isBranchMatch;
  }), [auditLogs, selectedBranchIds, selectedDate, allDates]);

  const entityCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: baseLogs.length };
    ENTITY_TYPES.forEach(t => { if (t !== 'ALL') counts[t] = baseLogs.filter(l => l.entityType === t).length; });
    return counts;
  }, [baseLogs]);

  const deleteCount = useMemo(() => filteredLogs.filter(l => l.activityType === 'DELETE').length, [filteredLogs]);

  const branchName = (id: string) => branches.find(b => b.id === id)?.name || 'UNKNOWN BRANCH';

  const securityFlags = useMemo((): SecurityFlag[] => {
    const flags: SecurityFlag[] = [];

    // ── 1. Same transaction edited 3+ times ──────────────────────────────────
    const txUpdates: Record<string, AuditLog[]> = {};
    filteredLogs
      .filter(l => l.entityType === 'TRANSACTION' && l.activityType === 'UPDATE' && l.entityId)
      .forEach(l => { (txUpdates[l.entityId] = txUpdates[l.entityId] || []).push(l); });
    Object.entries(txUpdates).forEach(([entityId, logs]) => {
      if (logs.length >= 3) {
        const latest = logs[0];
        flags.push({
          id: `tx-edit-${entityId}`,
          severity: logs.length >= 5 ? 'HIGH' : 'MED',
          title: 'Transaction edited repeatedly',
          detail: `Sale record edited ${logs.length}× by ${[...new Set(logs.map(l => l.performerName || 'SYSTEM'))].join(', ')}`,
          branchName: branchName(latest.branchId),
          count: logs.length,
          latestTimestamp: latest.timestamp,
        });
      }
    });

    // ── 2. Same expense edited 2+ times ─────────────────────────────────────
    const expUpdates: Record<string, AuditLog[]> = {};
    filteredLogs
      .filter(l => l.entityType === 'EXPENSE' && l.activityType === 'UPDATE' && l.entityId)
      .forEach(l => { (expUpdates[l.entityId] = expUpdates[l.entityId] || []).push(l); });
    Object.entries(expUpdates).forEach(([entityId, logs]) => {
      if (logs.length >= 2) {
        const latest = logs[0];
        flags.push({
          id: `exp-edit-${entityId}`,
          severity: 'MED',
          title: 'Expense edited multiple times',
          detail: `Expense entry edited ${logs.length}× — ${logs[0].description}`,
          branchName: branchName(latest.branchId),
          count: logs.length,
          latestTimestamp: latest.timestamp,
        });
      }
    });

    // ── 3. Employee updated 3+ times ─────────────────────────────────────────
    const empUpdates: Record<string, AuditLog[]> = {};
    filteredLogs
      .filter(l => l.entityType === 'EMPLOYEE' && l.activityType === 'UPDATE' && l.entityId)
      .forEach(l => { (empUpdates[l.entityId] = empUpdates[l.entityId] || []).push(l); });
    Object.entries(empUpdates).forEach(([entityId, logs]) => {
      if (logs.length >= 3) {
        const latest = logs[0];
        flags.push({
          id: `emp-edit-${entityId}`,
          severity: 'MED',
          title: 'Employee record updated repeatedly',
          detail: `Employee profile modified ${logs.length}× — ${latest.description}`,
          branchName: branchName(latest.branchId),
          count: logs.length,
          latestTimestamp: latest.timestamp,
        });
      }
    });

    // ── 4. Branch with 3+ deletions ──────────────────────────────────────────
    const deletionsByBranch: Record<string, AuditLog[]> = {};
    filteredLogs
      .filter(l => l.activityType === 'DELETE')
      .forEach(l => {
        const key = l.branchId || '__central__';
        (deletionsByBranch[key] = deletionsByBranch[key] || []).push(l);
      });
    Object.entries(deletionsByBranch).forEach(([branchId, logs]) => {
      if (logs.length >= 3) {
        flags.push({
          id: `mass-del-${branchId}`,
          severity: logs.length >= 6 ? 'HIGH' : 'MED',
          title: 'Multiple deletions in period',
          detail: `${logs.length} records deleted — ${[...new Set(logs.map(l => l.entityType))].join(', ')}`,
          branchName: branchId === '__central__' ? 'CENTRAL' : branchName(branchId),
          count: logs.length,
          latestTimestamp: logs[0].timestamp,
        });
      }
    });

    // ── 5. High-value deletion (₱500+) ───────────────────────────────────────
    filteredLogs
      .filter(l => l.activityType === 'DELETE' && (l.amount || 0) >= 500)
      .forEach(l => {
        flags.push({
          id: `hv-del-${l.id}`,
          severity: (l.amount || 0) >= 2000 ? 'HIGH' : 'MED',
          title: 'High-value record deleted',
          detail: `₱${(l.amount || 0).toLocaleString()} entry removed — ${l.description}`,
          branchName: branchName(l.branchId),
          count: 1,
          latestTimestamp: l.timestamp,
        });
      });

    // ── 6. After-hours activity (10pm–5am local) ─────────────────────────────
    const afterHoursLogs = filteredLogs.filter(l => {
      const h = new Date(l.timestamp).getHours();
      return (h >= 22 || h < 5) && ['TRANSACTION', 'EXPENSE'].includes(l.entityType);
    });
    if (afterHoursLogs.length > 0) {
      const byBranch: Record<string, AuditLog[]> = {};
      afterHoursLogs.forEach(l => {
        const key = l.branchId || '__central__';
        (byBranch[key] = byBranch[key] || []).push(l);
      });
      Object.entries(byBranch).forEach(([branchId, logs]) => {
        flags.push({
          id: `after-hours-${branchId}`,
          severity: 'LOW',
          title: 'After-hours activity detected',
          detail: `${logs.length} transaction/expense event${logs.length > 1 ? 's' : ''} between 10 PM – 5 AM`,
          branchName: branchId === '__central__' ? 'CENTRAL' : branchName(branchId),
          count: logs.length,
          latestTimestamp: logs[0].timestamp,
        });
      });
    }

    // ── 7. Single performer responsible for 5+ deletes ───────────────────────
    const delsByPerformer: Record<string, AuditLog[]> = {};
    filteredLogs
      .filter(l => l.activityType === 'DELETE')
      .forEach(l => {
        const key = l.performerName || 'SYSTEM';
        (delsByPerformer[key] = delsByPerformer[key] || []).push(l);
      });
    Object.entries(delsByPerformer).forEach(([performer, logs]) => {
      if (logs.length >= 5) {
        const latest = logs[0];
        flags.push({
          id: `del-performer-${performer}`,
          severity: 'HIGH',
          title: 'Performer responsible for mass deletions',
          detail: `${performer} performed ${logs.length} deletions in this period`,
          branchName: branchName(latest.branchId),
          count: logs.length,
          latestTimestamp: latest.timestamp,
        });
      }
    });

    // Sort: HIGH first, then MED, then LOW; within each by count desc
    const order = { HIGH: 0, MED: 1, LOW: 2 };
    return flags.sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);
  }, [filteredLogs, branches]);

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

  const selectedBranchName = useMemo(() => {
    if (selectedBranchIds.length === 0) return 'FULL NETWORK ARCHIVE';
    if (selectedBranchIds.length === 1) return branches.find(b => b.id === selectedBranchIds[0])?.name || 'UNKNOWN BRANCH';
    return `${selectedBranchIds.length} BRANCHES`;
  }, [selectedBranchIds, branches]);

  const handlePurge = async () => {
    setIsPurging(true);
    try {
      const cutoff = new Date();
      cutoff.setUTCDate(cutoff.getUTCDate() - 6);
      cutoff.setUTCHours(23, 59, 59, 999);
      const { error } = await supabase
        .from(DB_TABLES.AUDIT_LOGS)
        .delete()
        .lt(DB_COLUMNS.TIMESTAMP, cutoff.toISOString());
      if (error) throw error;
      playSound('success');
      setShowPurgeConfirm(false);
    } catch (err) {
      console.error(err);
      playSound('warning');
      alert('Purge failed. Please try again.');
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto pb-32 px-2">

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
              <button onClick={() => setSelectedTxDetail(null)} className="p-2 text-white/40 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar bg-white">
              <div className="space-y-1 text-center">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Client Name</p>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">{selectedTxDetail.clientName}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-2">
                  {(() => {
                    const localDate = new Date(selectedTxDetail.timestamp.replace(/(\+00:00|Z)$/, ""));
                    return localDate.toLocaleString("en-PH", { weekday: 'long', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
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
                      {selectedTxDetail.therapistName}{selectedTxDetail.bonesetterName ? ` + ${selectedTxDetail.bonesetterName}` : ''}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-8 bg-slate-50 border-t">
              <button onClick={() => setSelectedTxDetail(null)} className="w-full bg-slate-900 text-white font-bold py-5 rounded-2xl uppercase tracking-widest text-[11px] shadow-lg active:scale-95">Dismiss Detail</button>
            </div>
          </div>
        </div>
      )}

      {/* PURGE CONFIRM MODAL */}
      {showPurgeConfirm && (
        <div className={`${UI_THEME.layout.modalWrapper} no-print`}>
          <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-10 text-center border border-slate-100`}>
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner text-3xl">🗑️</div>
            <h4 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Purge Old Logs?</h4>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-relaxed mb-10">
              Permanently deletes all audit logs older than 6 days. This cannot be undone.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handlePurge}
                disabled={isPurging}
                className="w-full bg-rose-600 text-white font-black py-5 rounded-2xl text-[12px] uppercase tracking-widest shadow-lg active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
              >
                {isPurging ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : 'Confirm Purge'}
              </button>
              <button onClick={() => setShowPurgeConfirm(false)} disabled={isPurging} className="w-full py-4 text-slate-400 font-black text-[11px] uppercase tracking-widest">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COMMAND BAR */}
      <div className={`bg-white ${UI_THEME.layout.cardPadding} ${UI_THEME.radius.card} border border-slate-200 shadow-sm no-print space-y-5`}>

        {/* Header row */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center text-xl shadow-inner border border-white/10">🛡️</div>
            <div>
              <h3 className="text-[14px] font-black text-slate-900 uppercase tracking-tighter leading-none">Audit Registry</h3>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Global Activity & Security Log</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => { setShowPurgeConfirm(true); playSound('click'); }}
              className="h-9 sm:h-10 px-3 sm:px-4 rounded-xl bg-rose-50 text-rose-500 border border-rose-100 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest hover:bg-rose-600 hover:text-white hover:border-rose-600 transition-all active:scale-95"
              title="Purge logs older than 6 days"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              <span className="hidden sm:inline">Purge 6d+</span>
            </button>
            <button
              onClick={() => window.print()}
              className="h-9 sm:h-10 px-3 sm:px-4 rounded-xl bg-white border border-slate-200 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all active:scale-95"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              <span className="hidden sm:inline">Print</span>
            </button>
          </div>
        </div>

        {/* Search + filters row */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 group">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-600 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <input
              type="text"
              placeholder="Search descriptions, performers, types..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold uppercase tracking-widest focus:bg-white focus:border-slate-400 focus:ring-4 focus:ring-slate-400/5 transition-all outline-none shadow-inner placeholder:text-slate-300 placeholder:normal-case placeholder:tracking-normal"
            />
          </div>
          <button
            onClick={() => { setIsFiltersOpen(!isFiltersOpen); playSound('click'); }}
            className={`h-10 px-4 rounded-xl border transition-all text-[9px] font-black uppercase tracking-widest shrink-0 flex items-center gap-2 ${isFiltersOpen ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-700'}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M3 4h18M7 8h10M11 12h4" strokeLinecap="round" /></svg>
            <span className="hidden sm:inline">Filters</span>
            {(selectedBranchIds.length > 0 || !allDates) && <span className="w-1.5 h-1.5 bg-slate-400 rounded-full" />}
          </button>
        </div>

        {/* Expanded filters */}
        {isFiltersOpen && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="space-y-1.5">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Branch</p>
              <BranchCheckboxDropdown branches={branches} selectedIds={selectedBranchIds} onChange={setSelectedBranchIds} className="w-full" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between ml-1">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Date</p>
                <button
                  onClick={() => { setAllDates(!allDates); setCurrentPage(1); playSound('click'); }}
                  className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg transition-all ${allDates ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                  {allDates ? 'All Dates ✓' : 'All Dates'}
                </button>
              </div>
              <div className="relative h-11">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
                <input
                  type="date"
                  value={selectedDate}
                  disabled={allDates}
                  onChange={e => { setSelectedDate(e.target.value); setCurrentPage(1); }}
                  className="w-full h-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 text-slate-900 font-bold text-[11px] outline-none focus:bg-white focus:border-slate-400 transition-all cursor-pointer shadow-inner disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>
        )}

        {/* Entity type filter pills */}
        <div className="flex flex-wrap gap-2">
          {ENTITY_TYPES.map(type => {
            const count = entityCounts[type] || 0;
            const isActive = entityFilter === type;
            return (
              <button
                key={type}
                onClick={() => { setEntityFilter(type); setCurrentPage(1); playSound('click'); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 ${
                  isActive
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-700'
                }`}
              >
                {type !== 'ALL' && <span>{ENTITY_ICON[type] || '📜'}</span>}
                {type}
                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ANALYTICS SECTION */}
      {filteredLogs.length > 0 && (
        <div className="space-y-3 no-print">

          {/* Stat strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 flex flex-col gap-1">
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Total Events</p>
              <p className="text-3xl font-black text-slate-900 tabular-nums leading-none">{filteredLogs.length}</p>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">{allDates ? 'All time' : selectedDate}</p>
            </div>
            <div className={`rounded-2xl border shadow-sm px-5 py-4 flex flex-col gap-1 ${deleteCount > 0 ? 'bg-rose-50 border-rose-100' : 'bg-white border-slate-100'}`}>
              <p className={`text-[8px] font-black uppercase tracking-widest ${deleteCount > 0 ? 'text-rose-400' : 'text-slate-400'}`}>Deletions</p>
              <p className={`text-3xl font-black tabular-nums leading-none ${deleteCount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{deleteCount}</p>
              <p className={`text-[8px] font-bold uppercase tracking-widest mt-1 ${deleteCount > 0 ? 'text-rose-400' : 'text-slate-400'}`}>{deleteCount > 0 ? 'Review recommended' : 'None detected'}</p>
            </div>
            <div className={`rounded-2xl border shadow-sm px-5 py-4 flex flex-col gap-1 ${securityFlags.length > 0 ? 'bg-amber-50 border-amber-100' : 'bg-white border-slate-100'}`}>
              <p className={`text-[8px] font-black uppercase tracking-widest ${securityFlags.length > 0 ? 'text-amber-500' : 'text-slate-400'}`}>Security Flags</p>
              <p className={`text-3xl font-black tabular-nums leading-none ${securityFlags.length > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{securityFlags.length}</p>
              <p className={`text-[8px] font-bold uppercase tracking-widest mt-1 ${securityFlags.length > 0 ? 'text-amber-500' : 'text-slate-400'}`}>
                {securityFlags.filter(f => f.severity === 'HIGH').length > 0
                  ? `${securityFlags.filter(f => f.severity === 'HIGH').length} high priority`
                  : securityFlags.length > 0 ? 'Review suggested' : 'All clear'}
              </p>
            </div>
          </div>

          {/* Security Concerns */}
          {securityFlags.length > 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <p className="text-[9px] font-black text-slate-700 uppercase tracking-widest">Security Concerns</p>
                </div>
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{securityFlags.length} flag{securityFlags.length > 1 ? 's' : ''}</span>
              </div>
              <div className="divide-y divide-slate-50">
                {securityFlags.map(flag => {
                  const severityStyle = {
                    HIGH: { bar: 'bg-rose-500', badge: 'bg-rose-50 text-rose-600 border-rose-100', dot: 'bg-rose-500' },
                    MED:  { bar: 'bg-amber-400', badge: 'bg-amber-50 text-amber-600 border-amber-100', dot: 'bg-amber-400' },
                    LOW:  { bar: 'bg-sky-400', badge: 'bg-sky-50 text-sky-600 border-sky-100', dot: 'bg-sky-400' },
                  }[flag.severity];
                  return (
                    <div key={flag.id} className="flex items-start gap-3 px-5 py-3.5 group hover:bg-slate-50/50 transition-colors">
                      <div className={`w-1 self-stretch rounded-full shrink-0 ${severityStyle.bar}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className={`text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${severityStyle.badge}`}>
                            {flag.severity}
                          </span>
                          <span className="text-[7px] font-black text-white bg-slate-700 px-2 py-0.5 rounded-md uppercase tracking-widest">
                            {flag.branchName}
                          </span>
                          <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">
                            {new Date(flag.latestTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[12px] font-bold text-slate-900 uppercase tracking-tight leading-snug">{flag.title}</p>
                        <p className="text-[10px] font-medium text-slate-500 mt-0.5 leading-relaxed">{flag.detail}</p>
                      </div>
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black shrink-0 mt-0.5 ${severityStyle.badge} border`}>
                        {flag.count}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-6 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-lg shrink-0">✅</div>
              <div>
                <p className="text-[11px] font-black text-slate-700 uppercase tracking-tight">No security concerns detected</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">All activity within normal parameters for this period</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ACTIVITY LOG */}
      <div className="no-print">
        <div className="flex items-center justify-between gap-4 px-1 mb-4">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={filteredLogs.length}
            itemsPerPage={itemsPerPage}
            onItemsPerPageChange={(n) => { setItemsPerPage(n); setCurrentPage(1); }}
          />
        </div>

        <div className="space-y-2">
          {paginatedLogs.length > 0 ? paginatedLogs.map(log => {
            const entityColor = ENTITY_COLOR[log.entityType] || 'bg-slate-50 text-slate-500 border-slate-200';
            const activityColor = ACTIVITY_COLOR[log.activityType] || 'bg-slate-50 text-slate-500 border-slate-200';
            const isClickable = log.entityType === 'TRANSACTION';
            const isDeletion = log.activityType === 'DELETE';
            return (
              <div
                key={log.id}
                onClick={() => handleLogClick(log)}
                className={`bg-white rounded-2xl border shadow-sm transition-all duration-300 group flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 sm:py-4 ${
                  isDeletion ? 'border-rose-100 bg-rose-50/30' : 'border-slate-100'
                } ${isClickable ? 'cursor-pointer hover:border-emerald-300 hover:shadow-md' : 'cursor-default'}`}
              >
                {/* Left: icon + content */}
                <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shadow-inner shrink-0 border ${entityColor}`}>
                    {ENTITY_ICON[log.entityType] || '📜'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span className={`text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${activityColor}`}>
                        {log.activityType}
                      </span>
                      <span className={`text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${entityColor}`}>
                        {log.entityType}
                      </span>
                      <span className="text-[7px] font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md uppercase tracking-widest">
                        {branches.find(b => b.id === log.branchId)?.name || 'CENTRAL'}
                      </span>
                      {isFetchingDetail && isClickable && (
                        <span className="text-[7px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md uppercase tracking-widest animate-pulse">Loading...</span>
                      )}
                    </div>
                    <p className="text-[12px] font-bold text-slate-900 uppercase tracking-tight leading-snug truncate sm:whitespace-normal group-hover:text-emerald-700 transition-colors">
                      {log.description}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[8px] font-bold text-white bg-slate-700 px-2 py-0.5 rounded-md uppercase tracking-widest">{log.performerName || 'SYSTEM'}</span>
                      <span className="text-[8px] font-bold text-slate-400 tabular-nums flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: amount + drill-down hint */}
                <div className="flex items-center gap-3 shrink-0 ml-12 sm:ml-0">
                  {log.amount ? (
                    <div className="text-right">
                      <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">Value</p>
                      <p className="text-sm font-black text-slate-900 tabular-nums">₱{log.amount.toLocaleString()}</p>
                    </div>
                  ) : null}
                  {isClickable && (
                    <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-400 group-hover:bg-emerald-600 group-hover:text-white flex items-center justify-center transition-all shrink-0">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </div>
                  )}
                </div>
              </div>
            );
          }) : (
            <div className="py-32 text-center bg-white rounded-[32px] border-2 border-dashed border-slate-100 flex flex-col items-center gap-4 opacity-40">
              <div className="text-6xl grayscale opacity-30">🛡️</div>
              <p className="text-[11px] font-bold uppercase tracking-[0.4em] text-slate-400">No logs found</p>
            </div>
          )}
        </div>
      </div>

      {/* PRINT VIEW */}
      <div className="hidden print:block space-y-8">
        <div className="border-b-2 border-slate-900 pb-4">
          <h1 className="text-3xl font-black uppercase tracking-tighter">Network Audit Registry</h1>
          <div className="flex justify-between mt-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            <p>Generated: {new Date().toLocaleString()}</p>
            <p>Branch: {selectedBranchName}</p>
            <p>Date: {allDates ? 'All Dates' : selectedDate}</p>
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
                <td className="py-4 text-[10px] font-bold uppercase">{branches.find(b => b.id === log.branchId)?.name || 'CENTRAL'}</td>
                <td className="py-4 text-[10px] font-bold uppercase">{log.performerName || 'SYSTEM CORE'}</td>
                <td className="py-4 text-right">
                  <span className="text-[11px] font-bold text-slate-900 tabular-nums">{log.amount ? `₱${log.amount.toLocaleString()}` : '—'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
};
