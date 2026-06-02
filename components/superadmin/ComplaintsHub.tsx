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
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sorted = useMemo(() =>
    [...complaints].sort((a, b) => {
      if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
      if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
      return b.filedAt.localeCompare(a.filedAt);
    }),
  [complaints]);

  const filtered = useMemo(() =>
    filter === 'ALL' ? sorted : sorted.filter(c => c.status === filter),
  [sorted, filter]);

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
          <div className="w-9 h-9 rounded-2xl bg-slate-900 flex items-center justify-center shrink-0">
            <Flag className="w-4 h-4 text-white" strokeWidth={2.5} />
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

      {/* List */}
      {filtered.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">No {filter !== 'ALL' ? filter.toLowerCase() : ''} complaints</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => {
            const isExpanded = expandedId === c.id;
            const isCurrentlyProcessing = isProcessing === c.id;
            const employeeActive = getEmployeeActive(c.employeeId);
            const reportColor = REPORT_COLOR[c.reportType] || REPORT_COLOR.OTHER;
            const filedDate = new Date(c.filedAt).toLocaleDateString('en-PH', {
              timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric',
            });

            return (
              <div
                key={c.id}
                className={`bg-white border rounded-2xl overflow-hidden transition-all ${
                  c.status === 'PENDING' ? 'border-amber-200 shadow-sm' : 'border-slate-200'
                }`}
              >
                {/* Card header */}
                <div
                  className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-all select-none"
                  onPointerDown={() => startHold(c.id)}
                  onPointerUp={cancelHold}
                  onPointerLeave={cancelHold}
                  onPointerCancel={cancelHold}
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}
                >
                  <div className={`shrink-0 px-2.5 py-1 rounded-xl border text-[8px] font-black uppercase tracking-widest ${reportColor}`}>
                    {REPORT_LABEL[c.reportType] || c.reportType || '—'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[12px] font-black text-slate-900 uppercase tracking-tight leading-none">
                        {c.employeeName || '—'}
                      </p>
                      {employeeActive === false && (
                        <span className="text-[8px] font-black text-rose-500 uppercase tracking-widest bg-rose-50 px-1.5 py-0.5 rounded-lg border border-rose-100">
                          Suspended
                        </span>
                      )}
                    </div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 truncate">
                      {getBranchName(c.branchId)} · Filed by {c.filedByName} · {filedDate}
                    </p>
                  </div>

                  <span className={`shrink-0 text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${STATUS_STYLE[c.status]}`}>
                    {c.status === 'ACKNOWLEDGED' ? 'Acknowledged' : c.status === 'DISMISSED' ? 'Dismissed' : 'Pending'}
                  </span>

                  {deleteRevealId === c.id ? (
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(c.id); }}
                      className="shrink-0 h-8 px-3 rounded-xl bg-rose-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-rose-700 transition-all"
                    >
                      Delete
                    </button>
                  ) : (
                    <svg className={`w-4 h-4 shrink-0 text-slate-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-slate-100 px-5 py-4 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Incident Date</p>
                        <p className="text-[12px] font-bold text-slate-800">{c.incidentDate || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Branch</p>
                        <p className="text-[12px] font-bold text-slate-800">{getBranchName(c.branchId)}</p>
                      </div>
                      <div>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Filed By</p>
                        <p className="text-[12px] font-bold text-slate-800">{c.filedByName || '—'}</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Description</p>
                      <p className="text-[12px] font-semibold text-slate-700 leading-relaxed bg-slate-50 rounded-xl px-4 py-3">{c.description || '—'}</p>
                    </div>

                    {/* HR judgment/resolution (if reviewed) */}
                    {(c.judgment || c.resolution || (c.actionTaken && c.actionTaken !== 'NONE')) && (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 space-y-2">
                        {c.actionTaken && c.actionTaken !== 'NONE' && (
                          <div>
                            <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mb-0.5">Action Taken</p>
                            <p className="text-[12px] font-bold text-emerald-800">{ACTION_OPTIONS.find(a => a.value === c.actionTaken)?.label || c.actionTaken}</p>
                          </div>
                        )}
                        {c.judgment && (
                          <div>
                            <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mb-0.5">Judgment</p>
                            <p className="text-[12px] font-semibold text-emerald-800 leading-relaxed">{c.judgment}</p>
                          </div>
                        )}
                        {c.resolution && (
                          <div>
                            <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mb-0.5">Resolution</p>
                            <p className="text-[12px] font-semibold text-emerald-800 leading-relaxed">{c.resolution}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action buttons — only for PENDING, non-read-only */}
                    {c.status === 'PENDING' && !isReadOnly && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          disabled={!!isCurrentlyProcessing}
                          onClick={() => openReview(c)}
                          className="h-9 px-4 rounded-xl bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-40"
                        >
                          Review & Resolve
                        </button>
                        <button
                          disabled={!!isCurrentlyProcessing}
                          onClick={async () => {
                            setIsProcessing(c.id);
                            try {
                              await supabase.from(DB_TABLES.EMPLOYEE_COMPLAINTS).update({
                                [DB_COLUMNS.STATUS]: 'DISMISSED',
                                [DB_COLUMNS.ACTION_TAKEN]: 'NONE',
                                [DB_COLUMNS.REVIEWED_BY]: 'SUPERADMIN',
                                [DB_COLUMNS.REVIEWED_AT]: new Date().toISOString(),
                              }).eq(DB_COLUMNS.ID, c.id);
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
                          }}
                          className="h-9 px-4 rounded-xl border border-slate-200 text-slate-500 text-[9px] font-black uppercase tracking-widest hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-40"
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
                  onClick={() => handleReview('ACKNOWLEDGED')}
                  className="flex-1 h-11 rounded-2xl text-white text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all bg-emerald-600 hover:bg-emerald-700"
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
