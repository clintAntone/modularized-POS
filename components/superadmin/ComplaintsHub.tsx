import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Flag } from 'lucide-react';
import { EmployeeComplaint, Employee, Branch } from '../../types';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { playSound } from '../../lib/audio';
import { logAudit } from '../../lib/audit';

const REPORT_LABEL: Record<string, string> = {
  TARDINESS:        'Tardiness',
  ABSENCE:          'Unexcused Absence',
  MISCONDUCT:       'Misconduct',
  POLICY_VIOLATION: 'Policy Violation',
  PERFORMANCE:      'Poor Performance',
  OTHER:            'Other',
};

const REPORT_TEXT_COLOR: Record<string, string> = {
  TARDINESS:        'text-amber-700',
  ABSENCE:          'text-orange-700',
  MISCONDUCT:       'text-rose-700',
  POLICY_VIOLATION: 'text-red-700',
  PERFORMANCE:      'text-slate-600',
  OTHER:            'text-slate-500',
};

const REPORT_COLOR: Record<string, string> = {
  TARDINESS:        'bg-amber-50 text-amber-700 border-amber-200',
  ABSENCE:          'bg-orange-50 text-orange-700 border-orange-200',
  MISCONDUCT:       'bg-rose-50 text-rose-700 border-rose-200',
  POLICY_VIOLATION: 'bg-red-50 text-red-700 border-red-200',
  PERFORMANCE:      'bg-slate-50 text-slate-600 border-slate-200',
  OTHER:            'bg-slate-50 text-slate-600 border-slate-200',
};

const STATUS_STYLE: Record<string, string> = {
  PENDING:      'bg-amber-100 text-amber-800 border border-amber-200',
  ACKNOWLEDGED: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  DISMISSED:    'bg-rose-100 text-rose-800 border border-rose-200',
};

const ACTION_OPTIONS: { value: EmployeeComplaint['actionTaken']; label: string }[] = [
  { value: 'NONE',      label: 'No Action' },
  { value: 'NOTED',     label: 'Noted for Records' },
  { value: 'WARNING',   label: 'Warning Issued' },
  { value: 'SUSPENDED', label: 'Suspend Employee' },
];

interface ComplaintsHubProps {
  complaints: EmployeeComplaint[];
  employees: Employee[];
  branches: Branch[];
  onRefresh?: () => void;
  isReadOnly?: boolean;
}

type FilterStatus = 'PENDING' | 'ACKNOWLEDGED' | 'DISMISSED' | 'ALL';

interface ReviewState {
  complaint: EmployeeComplaint;
}

export const ComplaintsHub: React.FC<ComplaintsHubProps> = ({
  complaints, employees, branches, onRefresh, isReadOnly,
}) => {
  const [filter, setFilter] = useState<FilterStatus>('PENDING');
  const [reviewState, setReviewState] = useState<ReviewState | null>(null);
  const [reviewAction, setReviewAction] = useState<EmployeeComplaint['actionTaken']>('NONE');
  const [judgment, setJudgment] = useState('');
  const [resolution, setResolution] = useState('');
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteRevealId, setDeleteRevealId] = useState<string | null>(null);
  const [dismissConfirmId, setDismissConfirmId] = useState<string | null>(null);
  const [reviewConfirm, setReviewConfirm] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visibleGroupCount, setVisibleGroupCount] = useState(15);
  const [searchTerm, setSearchTerm] = useState('');
  const sentinelRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() =>
    [...complaints].sort((a, b) => {
      if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
      if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
      return b.filedAt.localeCompare(a.filedAt);
    }),
  [complaints]);

  const filtered = useMemo(() => {
    let list = filter === 'ALL' ? sorted : sorted.filter(c => c.status === filter);
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toUpperCase();
      list = list.filter(c =>
        c.employeeName?.toUpperCase().includes(term) ||
        c.employeeId?.toUpperCase().includes(term)
      );
    }
    return list;
  }, [sorted, filter, searchTerm]);

  // Group filtered complaints by employee
  const groupedByEmployee = useMemo(() => {
    const map = new Map<string, EmployeeComplaint[]>();
    for (const c of filtered) {
      const key = c.employeeId || c.employeeName;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return Array.from(map.values());
  }, [filtered]);

  // Reset visible count when filter or search changes
  useEffect(() => { setVisibleGroupCount(15); }, [filter, searchTerm]);

  // Infinite scroll — load more groups when sentinel enters viewport
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          setVisibleGroupCount(prev => prev + 15);
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const visibleGroups = groupedByEmployee.slice(0, visibleGroupCount);
  const hasMore = visibleGroupCount < groupedByEmployee.length;

  const pendingCount = useMemo(() => complaints.filter(c => c.status === 'PENDING').length, [complaints]);

  useEffect(() => {
    if (!deleteRevealId) return;
    const t = setTimeout(() => setDeleteRevealId(null), 4000);
    return () => clearTimeout(t);
  }, [deleteRevealId]);

  const startHold = useCallback((id: string) => {
    holdTimerRef.current = setTimeout(() => setDeleteRevealId(id), 600);
  }, []);

  const cancelHold = useCallback(() => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
  }, []);

  const handleDelete = async (id: string) => {
    setDeleteRevealId(null);
    setIsProcessing(id);
    try {
      await supabase.from(DB_TABLES.EMPLOYEE_COMPLAINTS).delete().eq(DB_COLUMNS.ID, id);
      playSound('success');
      onRefresh?.();
    } catch {
      playSound('warning');
    } finally {
      setIsProcessing(null);
    }
  };

  const handleDismiss = async (complaintId: string) => {
    const c = complaints.find(x => x.id === complaintId);
    if (!c) return;
    setDismissConfirmId(null);
    setIsProcessing(complaintId);
    try {
      await supabase.from(DB_TABLES.EMPLOYEE_COMPLAINTS).update({
        [DB_COLUMNS.STATUS]: 'DISMISSED',
        [DB_COLUMNS.ACTION_TAKEN]: 'NONE',
        [DB_COLUMNS.REVIEWED_BY]: 'SUPERADMIN',
        [DB_COLUMNS.REVIEWED_AT]: new Date().toISOString(),
      }).eq(DB_COLUMNS.ID, complaintId);
      await logAudit({
        activityType: 'COMPLAINT_DISMISSED',
        entityType: 'EMPLOYEE_REPORT',
        description: `Complaint for ${c.employeeName} — Dismissed`,
        branchId: c.branchId,
        performerName: 'SUPERADMIN',
      });
      playSound('success');
      onRefresh?.();
    } catch { playSound('warning'); } finally { setIsProcessing(null); }
  };

  const openReview = (complaint: EmployeeComplaint) => {
    setReviewState({ complaint });
    setReviewAction('NONE');
    setJudgment('');
    setResolution('');
    playSound('click');
  };

  const handleReview = async (newStatus: 'ACKNOWLEDGED' | 'DISMISSED') => {
    if (!reviewState) return;
    const { complaint } = reviewState;
    setReviewState(null);
    setIsProcessing(complaint.id);
    try {
      // Suspend employee if action is SUSPENDED
      if (reviewAction === 'SUSPENDED' && complaint.employeeId) {
        const { error } = await supabase
          .from(DB_TABLES.EMPLOYEES)
          .update({ [DB_COLUMNS.IS_ACTIVE]: false })
          .eq(DB_COLUMNS.ID, complaint.employeeId);
        if (error) throw error;
      }

      const { error } = await supabase
        .from(DB_TABLES.EMPLOYEE_COMPLAINTS)
        .update({
          [DB_COLUMNS.STATUS]: newStatus,
          [DB_COLUMNS.ACTION_TAKEN]: reviewAction,
          [DB_COLUMNS.JUDGMENT]: judgment.trim() || null,
          [DB_COLUMNS.RESOLUTION]: resolution.trim() || null,
          [DB_COLUMNS.REVIEWED_BY]: 'SUPERADMIN',
          [DB_COLUMNS.REVIEWED_AT]: new Date().toISOString(),
        })
        .eq(DB_COLUMNS.ID, complaint.id);
      if (error) throw error;

      await logAudit({
        activityType: `COMPLAINT_${newStatus}`,
        entityType: 'EMPLOYEE_REPORT',
        description: `Complaint for ${complaint.employeeName} — ${newStatus === 'DISMISSED' ? 'Dismissed' : `Acknowledged (${reviewAction})`}`,
        branchId: complaint.branchId,
        performerName: 'SUPERADMIN',
      });

      playSound('success');
      onRefresh?.();
    } catch {
      playSound('warning');
    } finally {
      setIsProcessing(null);
      setJudgment('');
      setResolution('');
    }
  };

  const getEmployeeActive = (employeeId: string) => {
    const emp = employees.find(e => e.id === employeeId);
    return emp ? emp.isActive : null;
  };

  const getBranchName = (branchId: string) =>
    branches.find(b => b.id === branchId)?.name?.replace(/BRANCH\s*-\s*/i, '') ?? branchId;

  const FILTER_TABS: { id: FilterStatus; label: string }[] = [
    { id: 'PENDING',      label: `Pending${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
    { id: 'ACKNOWLEDGED', label: 'Acknowledged' },
    { id: 'DISMISSED',    label: 'Dismissed' },
    { id: 'ALL',          label: 'All' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-rose-50 flex items-center justify-center shrink-0">
            <Flag className="w-4 h-4 text-rose-600" strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-base font-black uppercase tracking-tight text-slate-900 leading-none">Complaints</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 flex items-center gap-2">
              <span>Employee Incident Reports</span>
              {pendingCount > 0 && (
                <span className="inline-flex items-center gap-1 text-rose-500 text-[9px] font-black uppercase tracking-widest">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  {pendingCount} pending
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search employee..."
            className="w-full sm:w-72 h-9 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-bold uppercase tracking-wider text-slate-700 placeholder:text-slate-300 outline-none focus:bg-white focus:border-slate-400 transition-all"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                filter === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* List — grouped by employee */}
      {filtered.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">No {filter !== 'ALL' ? filter.toLowerCase() : ''} complaints</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleGroups.map(group => {

            const rep = group[0];
            const employeeActive = getEmployeeActive(rep.employeeId);
            const hasPending = group.some(c => c.status === 'PENDING');

            return (
              <div
                key={rep.employeeId || rep.employeeName}
                className={`bg-white border rounded-2xl overflow-hidden shadow-sm ${hasPending ? 'border-amber-200' : 'border-slate-200'}`}
              >
                {/* Employee group header */}
                <div className="flex items-center gap-3 px-5 py-3.5 bg-slate-50 border-b border-slate-100">
                  <div className="w-8 h-8 rounded-xl bg-slate-200 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] font-black text-slate-900 uppercase tracking-tight leading-none">{rep.employeeName || '—'}</p>
                      {employeeActive === false && (
                        <span className="text-[8px] font-black text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded-lg border border-rose-100 uppercase tracking-widest">Suspended</span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    {group.length} {group.length === 1 ? 'report' : 'reports'}
                  </span>
                </div>

                {/* Individual complaints */}
                {group.map((c, idx) => {
                  const isExpanded = expandedId === c.id;
                  const isCurrentlyProcessing = isProcessing === c.id;
                  const reportColor = REPORT_COLOR[c.reportType] || REPORT_COLOR.OTHER;
                  const filedDate = new Date(c.filedAt).toLocaleDateString('en-PH', {
                    timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric',
                  });

                  return (
                    <div key={c.id}>
                      {idx > 0 && <div className="h-px bg-slate-100 mx-4" />}

                      {/* Complaint row */}
                      <div
                        className={`px-5 py-3.5 cursor-pointer hover:bg-slate-50/60 transition-all select-none ${c.status === 'PENDING' ? 'border-l-[3px] border-amber-400' : 'border-l-[3px] border-transparent'}`}
                        onPointerDown={() => startHold(c.id)}
                        onPointerUp={cancelHold}
                        onPointerLeave={cancelHold}
                        onPointerCancel={cancelHold}
                        onClick={() => setExpandedId(isExpanded ? null : c.id)}
                      >
                        {/* Detail rows */}
                        <div className="space-y-1.5">
                          {/* Reason */}
                          <div className="flex items-center gap-2">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest w-14 shrink-0">Reason:</span>
                            <span className={`text-[9px] font-black uppercase tracking-widest ${REPORT_TEXT_COLOR[c.reportType] || 'text-slate-500'}`}>
                              {REPORT_LABEL[c.reportType] || c.reportType || '—'}
                            </span>
                          </div>

                          {/* Branch */}
                          <div className="flex items-center gap-2">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest w-14 shrink-0">Branch:</span>
                            <span className="text-[9px] font-bold text-slate-700 uppercase tracking-tight truncate">{getBranchName(c.branchId)}</span>
                          </div>

                          {/* Reporter row */}
                          <div className="flex items-center justify-between gap-2 pt-0.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest w-14 shrink-0">Reporter:</span>
                              <span className="text-[9px] font-bold text-slate-700 uppercase tracking-tight truncate">{c.filedByName || '—'}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {deleteRevealId === c.id ? (
                                <button
                                  onClick={e => { e.stopPropagation(); handleDelete(c.id); }}
                                  className="shrink-0 h-7 px-2.5 rounded-xl bg-rose-600 text-white text-[8px] font-black uppercase tracking-widest hover:bg-rose-700 transition-all"
                                >
                                  Delete
                                </button>
                              ) : (
                                <svg className={`w-3.5 h-3.5 shrink-0 text-slate-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                              )}
                            </div>
                          </div>
                          {/* Status below Reporter — only shown when not redundant with active filter */}
                          {filter !== c.status && (
                            <div className="flex items-center gap-2 pt-1">
                              <span className="w-14 shrink-0" />
                              <span className={`text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg ${STATUS_STYLE[c.status]}`}>
                                {c.status === 'ACKNOWLEDGED' ? 'Acknowledged' : c.status === 'DISMISSED' ? 'Dismissed' : 'Pending'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 px-5 py-3.5 space-y-3 bg-slate-50/50">
                          {/* Meta row — 3 inline chips */}
                          <div className="flex flex-wrap gap-x-4 gap-y-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest shrink-0">Date:</span>
                              <span className="text-[10px] font-bold text-slate-700 tabular-nums">{c.incidentDate || '—'}</span>
                            </div>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest shrink-0">Branch:</span>
                              <span className="text-[10px] font-bold text-slate-700 truncate max-w-[140px] sm:max-w-none">{getBranchName(c.branchId)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest shrink-0">Filed by:</span>
                              <span className="text-[10px] font-bold text-slate-700 truncate max-w-[140px] sm:max-w-none">{c.filedByName || '—'}</span>
                            </div>
                          </div>

                          <div>
                            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Description</p>
                            <p className="text-[11px] font-semibold text-slate-700 leading-relaxed bg-white rounded-xl px-3 py-2.5 border border-slate-100">{c.description || '—'}</p>
                          </div>

                          {(c.judgment || c.resolution || (c.actionTaken && c.actionTaken !== 'NONE')) && (
                            <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 space-y-2">
                              {c.actionTaken && c.actionTaken !== 'NONE' && (
                                <div>
                                  <p className="text-[7px] font-black text-emerald-600 uppercase tracking-widest mb-0.5">Action Taken</p>
                                  <p className="text-[11px] font-bold text-emerald-800">{ACTION_OPTIONS.find(a => a.value === c.actionTaken)?.label || c.actionTaken}</p>
                                </div>
                              )}
                              {c.judgment && (
                                <div>
                                  <p className="text-[7px] font-black text-emerald-600 uppercase tracking-widest mb-0.5">Judgment</p>
                                  <p className="text-[11px] font-semibold text-emerald-800 leading-relaxed">{c.judgment}</p>
                                </div>
                              )}
                              {c.resolution && (
                                <div>
                                  <p className="text-[7px] font-black text-emerald-600 uppercase tracking-widest mb-0.5">Resolution</p>
                                  <p className="text-[11px] font-semibold text-emerald-800 leading-relaxed">{c.resolution}</p>
                                </div>
                              )}
                            </div>
                          )}

                          {c.status === 'PENDING' && (
                            <div className="flex gap-2 pt-0.5">
                              {!isReadOnly && (
                                <button
                                  disabled={!!isCurrentlyProcessing}
                                  onClick={() => openReview(c)}
                                  className="flex-1 sm:flex-none h-9 px-5 rounded-xl bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-40"
                                >
                                  Review & Resolve
                                </button>
                              )}
                              <button
                                disabled={!!isCurrentlyProcessing}
                                onClick={() => setDismissConfirmId(c.id)}
                                className="flex-1 sm:flex-none h-9 px-5 rounded-xl border border-slate-200 text-slate-500 text-[9px] font-black uppercase tracking-widest hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-40"
                              >
                                Dismiss
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />
          {hasMore && (
            <div className="py-4 flex justify-center">
              <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
                Loading more...
              </div>
            </div>
          )}
        </div>
      )}

      {/* Review modal */}
      {reviewState && (
        <div className="fixed inset-0 z-[3000] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[28px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-start gap-3">
              <div className="flex-1">
                <h3 className="text-[14px] font-black text-slate-900 uppercase tracking-tight leading-none">Review Complaint</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                  {reviewState.complaint.employeeName} · {REPORT_LABEL[reviewState.complaint.reportType] || reviewState.complaint.reportType}
                </p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Action */}
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Action Taken</label>
                <div className="grid grid-cols-2 gap-2">
                  {ACTION_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setReviewAction(opt.value)}
                      className={`px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
                        reviewAction === opt.value
                          ? opt.value === 'SUSPENDED' ? 'border-rose-500 bg-rose-50' : 'border-emerald-500 bg-emerald-50'
                          : 'border-slate-100 bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      <p className={`text-[10px] font-black uppercase tracking-tight ${
                        reviewAction === opt.value
                          ? opt.value === 'SUSPENDED' ? 'text-rose-700' : 'text-emerald-700'
                          : 'text-slate-700'
                      }`}>{opt.label}</p>
                    </button>
                  ))}
                </div>
                {reviewAction === 'SUSPENDED' && (
                  <div className="mt-2 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                    <p className="text-[10px] font-black text-rose-700 uppercase tracking-widest leading-relaxed">
                      This will suspend <strong>{reviewState.complaint.employeeName}</strong> and prevent them from logging in.
                    </p>
                  </div>
                )}
              </div>

              {/* Judgment */}
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                  Judgment <span className="font-bold normal-case text-slate-300">(optional)</span>
                </label>
                <textarea
                  value={judgment}
                  onChange={e => setJudgment(e.target.value)}
                  placeholder="Official ruling or assessment..."
                  rows={2}
                  className="w-full px-4 py-3 bg-slate-50 rounded-2xl text-sm font-semibold text-slate-900 outline-none border-2 border-transparent focus:border-slate-300 focus:bg-white transition-all resize-none"
                />
              </div>

              {/* Resolution */}
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                  Resolution <span className="font-bold normal-case text-slate-300">(optional)</span>
                </label>
                <textarea
                  value={resolution}
                  onChange={e => setResolution(e.target.value)}
                  placeholder="How was this resolved? Visible to branch manager..."
                  rows={2}
                  className="w-full px-4 py-3 bg-slate-50 rounded-2xl text-sm font-semibold text-slate-900 outline-none border-2 border-transparent focus:border-slate-300 focus:bg-white transition-all resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setReviewState(null); playSound('click'); }}
                  className="flex-1 h-11 rounded-2xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setReviewConfirm(true)}
                  className="flex-1 h-11 rounded-2xl text-white text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all bg-emerald-600 hover:bg-emerald-700"
                >
                  Review & Resolve
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dismiss confirmation */}
      {dismissConfirmId && (() => {
        const c = complaints.find(x => x.id === dismissConfirmId);
        return (
          <div className="fixed inset-0 z-[3100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-[28px] w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <div className="p-7 text-center space-y-4">
                <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto">
                  <svg className="w-7 h-7 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </div>
                <div className="space-y-1">
                  <h3 className="text-[15px] font-black text-slate-900 uppercase tracking-tight">Dismiss Complaint?</h3>
                  {c && <p className="text-[11px] font-bold text-slate-500">{c.employeeName} · {REPORT_LABEL[c.reportType] || c.reportType}</p>}
                  <p className="text-[11px] text-slate-400 leading-relaxed">This will mark the complaint as dismissed. This cannot be undone.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    onClick={() => setDismissConfirmId(null)}
                    className="h-11 rounded-2xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDismiss(dismissConfirmId)}
                    className="h-11 rounded-2xl bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 active:scale-95 transition-all"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Review confirmation */}
      {reviewConfirm && reviewState && (
        <div className="fixed inset-0 z-[3100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[28px] w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-7 text-center space-y-4">
              <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto">
                <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="space-y-1">
                <h3 className="text-[15px] font-black text-slate-900 uppercase tracking-tight">Confirm Review?</h3>
                <p className="text-[11px] font-bold text-slate-500">{reviewState.complaint.employeeName} · {REPORT_LABEL[reviewState.complaint.reportType] || reviewState.complaint.reportType}</p>
                {reviewAction !== 'NONE' && (
                  <p className="text-[11px] text-slate-500">Action: <span className="font-black text-slate-700">{ACTION_OPTIONS.find(a => a.value === reviewAction)?.label}</span></p>
                )}
                {reviewAction === 'SUSPENDED' && (
                  <p className="text-[11px] font-black text-rose-600 uppercase tracking-widest">Employee will be suspended.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  onClick={() => setReviewConfirm(false)}
                  className="h-11 rounded-2xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all"
                >
                  Back
                </button>
                <button
                  onClick={() => { setReviewConfirm(false); handleReview('ACKNOWLEDGED'); }}
                  className="h-11 rounded-2xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 active:scale-95 transition-all"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
