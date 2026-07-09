import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { Flag, AlertTriangle, CheckCircle2, Clock, Users } from 'lucide-react';
import { EmployeeComplaint, Employee, Branch } from '../../types';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { playSound } from '../../lib/audio';
import { logAudit } from '../../lib/audit';
import { getTrueISOString } from '../../lib/time';

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
  { value: 'NONE',            label: 'No Action'        },
  { value: 'NOTED',           label: 'Noted on Record'  },
  { value: 'VERBAL_WARNING',  label: 'Verbal Warning'   },
  { value: 'WRITTEN_WARNING', label: 'Written Warning'  },
  { value: 'FINAL_WARNING',   label: 'Final Warning'    },
  { value: 'SUSPENDED',       label: 'Suspend Employee' },
  // legacy value kept for backward compat display only
  { value: 'WARNING',         label: 'Warning Issued'   },
];

const ACTION_BORDER_SELECTED: Record<string, string> = {
  NONE:            'border-slate-300 bg-slate-50',
  NOTED:           'border-slate-400 bg-slate-50',
  VERBAL_WARNING:  'border-amber-400 bg-amber-50',
  WRITTEN_WARNING: 'border-orange-400 bg-orange-50',
  FINAL_WARNING:   'border-rose-400 bg-rose-50',
  SUSPENDED:       'border-red-600 bg-red-50',
  WARNING:         'border-emerald-500 bg-emerald-50',
};

const ACTION_TEXT_SELECTED: Record<string, string> = {
  NONE:            'text-slate-600',
  NOTED:           'text-slate-700',
  VERBAL_WARNING:  'text-amber-700',
  WRITTEN_WARNING: 'text-orange-700',
  FINAL_WARNING:   'text-rose-700',
  SUSPENDED:       'text-red-700',
  WARNING:         'text-emerald-700',
};

const ACTION_LABEL_MAP: Record<string, string> = {
  NONE:            '',
  NOTED:           'Noted on Record',
  VERBAL_WARNING:  'Verbal Warning',
  WRITTEN_WARNING: 'Written Warning',
  FINAL_WARNING:   'Final Warning',
  SUSPENDED:       'Suspended',
  WARNING:         'Warning Issued',
};

/** Derive a short human-readable complaint number from the stored id.
 *  ID format: "complaint_<timestamp>_<random>" → "COMP-<last 6 chars uppercase>"
 *  Falls back to first 6 chars if format doesn't match. */
function formatComplaintNo(id: string): string {
  const parts = id.split('_');
  const tail = parts[parts.length - 1]?.toUpperCase() ?? id.slice(0, 6).toUpperCase();
  return `COMP-${tail.slice(0, 6)}`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function suggestAction(offenseNumber: number): EmployeeComplaint['actionTaken'] {
  if (offenseNumber === 1) return 'VERBAL_WARNING';
  if (offenseNumber === 2) return 'WRITTEN_WARNING';
  if (offenseNumber === 3) return 'FINAL_WARNING';
  return 'SUSPENDED';
}

interface ComplaintsHubProps {
  complaints: EmployeeComplaint[];
  employees: Employee[];
  branches: Branch[];
  onRefresh?: () => void;
  isReadOnly?: boolean;
  reviewerName?: string;
}

type FilterStatus = 'PENDING' | 'ACKNOWLEDGED' | 'DISMISSED' | 'ALL';

interface ReviewState {
  complaint: EmployeeComplaint;
  offenseNumber: number;
  suggestedAction: EmployeeComplaint['actionTaken'];
}

export const ComplaintsHub: React.FC<ComplaintsHubProps> = ({
  complaints, employees, branches, onRefresh, isReadOnly, reviewerName = 'SUPERADMIN',
}) => {
  const [filter, setFilter] = useState<FilterStatus>('PENDING');
  const [reviewState, setReviewState] = useState<ReviewState | null>(null);
  const [reviewAction, setReviewAction] = useState<EmployeeComplaint['actionTaken']>('NONE');
  const [judgment, setJudgment] = useState('');
  const [resolution, setResolution] = useState('');
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [viewComplaint, setViewComplaint] = useState<EmployeeComplaint | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [dismissConfirmId, setDismissConfirmId] = useState<string | null>(null);
  const [reopenConfirmId, setReopenConfirmId] = useState<string | null>(null);
  const [reviewConfirm, setReviewConfirm] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // kept for future use
  const [visibleGroupCount, setVisibleGroupCount] = useState(15);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
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
    if (debouncedSearch.trim()) {
      const term = debouncedSearch.trim().toUpperCase();
      list = list.filter(c =>
        c.employeeName?.toUpperCase().includes(term) ||
        c.employeeId?.toUpperCase().includes(term)
      );
    }
    return list;
  }, [sorted, filter, debouncedSearch]);

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
  useEffect(() => { setVisibleGroupCount(15); }, [filter, debouncedSearch]);

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

  const handleDelete = async (id: string) => {
    setDeleteConfirmId(null);
    setViewComplaint(null);
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
    setViewComplaint(null);
    setIsProcessing(complaintId);
    try {
      await supabase.from(DB_TABLES.EMPLOYEE_COMPLAINTS).update({
        [DB_COLUMNS.STATUS]: 'DISMISSED',
        [DB_COLUMNS.ACTION_TAKEN]: 'NONE',
        [DB_COLUMNS.REVIEWED_BY]: reviewerName,
        [DB_COLUMNS.REVIEWED_AT]: getTrueISOString(),
      }).eq(DB_COLUMNS.ID, complaintId);
      await logAudit({
        activityType: 'COMPLAINT_DISMISSED',
        entityType: 'EMPLOYEE_REPORT',
        description: `Complaint for ${c.employeeName} — Dismissed`,
        branchId: c.branchId,
        performerName: reviewerName,
      });
      playSound('success');
      onRefresh?.();
    } catch { playSound('warning'); } finally { setIsProcessing(null); }
  };

  const handleReopen = async (complaintId: string) => {
    const c = complaints.find(x => x.id === complaintId);
    if (!c) return;
    setReopenConfirmId(null);
    setViewComplaint(null);
    setIsProcessing(complaintId);
    try {
      const { error } = await supabase.from(DB_TABLES.EMPLOYEE_COMPLAINTS).update({
        [DB_COLUMNS.STATUS]: 'PENDING',
        [DB_COLUMNS.ACTION_TAKEN]: 'NONE',
        [DB_COLUMNS.JUDGMENT]: null,
        [DB_COLUMNS.RESOLUTION]: null,
        [DB_COLUMNS.REVIEWED_BY]: null,
        [DB_COLUMNS.REVIEWED_AT]: null,
      }).eq(DB_COLUMNS.ID, complaintId);
      if (error) throw error;
      await logAudit({
        activityType: 'COMPLAINT_REOPENED',
        entityType: 'EMPLOYEE_REPORT',
        description: `Complaint for ${c.employeeName} — Reopened`,
        branchId: c.branchId,
        performerName: reviewerName,
      });
      playSound('success');
      onRefresh?.();
    } catch { playSound('warning'); } finally { setIsProcessing(null); }
  };

  const openReview = (complaint: EmployeeComplaint) => {
    // Count prior acknowledged complaints for this employee (across all reasons)
    const priorAcknowledged = complaints.filter(c =>
      c.employeeId === complaint.employeeId &&
      c.status === 'ACKNOWLEDGED' &&
      c.id !== complaint.id
    ).length;
    const offenseNumber = priorAcknowledged + 1;
    const suggested = suggestAction(offenseNumber);
    setReviewState({ complaint, offenseNumber, suggestedAction: suggested });
    setReviewAction(suggested);
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
          [DB_COLUMNS.REVIEWED_BY]: reviewerName,
          [DB_COLUMNS.REVIEWED_AT]: getTrueISOString(),
        })
        .eq(DB_COLUMNS.ID, complaint.id);
      if (error) throw error;

      await logAudit({
        activityType: `COMPLAINT_${newStatus}`,
        entityType: 'EMPLOYEE_REPORT',
        description: `Complaint for ${complaint.employeeName} — ${newStatus === 'DISMISSED' ? 'Dismissed' : `Acknowledged (${reviewAction})`}`,
        branchId: complaint.branchId,
        performerName: reviewerName,
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

  const dismissedCount = useMemo(() => complaints.filter(c => c.status === 'DISMISSED').length, [complaints]);
  const acknowledgedCount = useMemo(() => complaints.filter(c => c.status === 'ACKNOWLEDGED').length, [complaints]);

  return (
    <div className="space-y-4">

      {/* Header card */}
      <div className="bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50 rounded-2xl overflow-hidden shadow-sm">
        {/* Title row */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4">
          <div className="w-10 h-10 rounded-2xl bg-rose-500/10 dark:bg-rose-500/20 flex items-center justify-center shrink-0">
            <Flag className="w-4.5 h-4.5 text-rose-500" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-none uppercase tracking-wide">Complaints</h2>
            <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mt-0.5 uppercase tracking-wide">Employee Incident Reports</p>
          </div>
          {pendingCount > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/20 dark:border-amber-500/30 px-2.5 py-1.5 rounded-xl">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-xs font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">{pendingCount} pending</span>
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 divide-x divide-slate-100 dark:divide-slate-700/50 border-t border-slate-100 dark:border-slate-700/50">
          <div className="px-4 py-3.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Users className="w-3 h-3 text-slate-400 dark:text-slate-500" />
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Total</p>
            </div>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100 tabular-nums leading-none">{complaints.length}</p>
          </div>
          <div className={`px-4 py-3.5 ${pendingCount > 0 ? 'bg-amber-500/5 dark:bg-amber-500/10' : ''}`}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Clock className="w-3 h-3 text-amber-500" />
              <p className="text-[10px] font-bold text-amber-500/80 dark:text-amber-400/80 uppercase tracking-widest">Pending</p>
            </div>
            <p className={`text-2xl font-black tabular-nums leading-none ${pendingCount > 0 ? 'text-amber-500 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}>{pendingCount}</p>
          </div>
          <div className="px-4 py-3.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              <p className="text-[10px] font-bold text-emerald-500/80 dark:text-emerald-400/80 uppercase tracking-widest">Resolved</p>
            </div>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums leading-none">{acknowledgedCount}</p>
          </div>
          <div className="px-4 py-3.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <AlertTriangle className="w-3 h-3 text-slate-400 dark:text-slate-500" />
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Dismissed</p>
            </div>
            <p className="text-2xl font-black text-slate-400 dark:text-slate-500 tabular-nums leading-none">{dismissedCount}</p>
          </div>
        </div>
      </div>

      {/* Search + filter — unified bar */}
      <div className="flex items-center bg-slate-100 dark:bg-slate-800 border border-transparent dark:border-slate-700/50 rounded-2xl p-1 gap-1">
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search employee..."
            className="w-full h-9 pl-9 pr-8 bg-transparent text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-600 outline-none"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 shrink-0" />

        {/* Filter tabs */}
        {FILTER_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setFilter(tab.id); playSound('click'); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wide transition-all whitespace-nowrap shrink-0 ${
              filter === tab.id
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List — grouped by employee */}
      {filtered.length === 0 ? (
        <div className="py-20 flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <Flag className="w-6 h-6 text-slate-300 dark:text-slate-600" strokeWidth={1.5} />
          </div>
          <div className="text-center">
            <p className="text-xs font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest">
              No {filter !== 'ALL' ? filter.toLowerCase() : ''} complaints
            </p>
            {filter === 'PENDING' && (
              <p className="text-xs font-medium text-slate-400 dark:text-slate-600 mt-1">All caught up — nothing needs attention</p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleGroups.map(group => {

            const rep = group[0];
            const employeeActive = getEmployeeActive(rep.employeeId);
            const hasPending = group.some(c => c.status === 'PENDING');
            // Offense numbers: chronological order among all complaints for this employee
            const sortedByDate = [...group].sort((a, b) => a.filedAt.localeCompare(b.filedAt));
            const offenseMap = new Map<string, number>();
            sortedByDate.forEach((c, idx) => offenseMap.set(c.id, idx + 1));

            return (
              <div
                key={rep.employeeId || rep.employeeName}
                className={`bg-white dark:bg-slate-800/60 border rounded-2xl overflow-hidden shadow-sm transition-all ${
                  hasPending
                    ? 'border-amber-200 dark:border-amber-500/30'
                    : 'border-slate-200 dark:border-slate-700/50'
                }`}
              >
                {/* Employee group header */}
                <div className="flex items-center gap-3 px-5 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-700/50">
                  <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight leading-none">{rep.employeeName || '—'}</p>
                      {employeeActive === false && (
                        <span className="text-xs font-black text-rose-500 bg-rose-50 dark:bg-rose-500/15 px-1.5 py-0.5 rounded-lg border border-rose-100 dark:border-rose-500/30 uppercase tracking-widest">Suspended</span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-700/60 px-2 py-1 rounded-lg uppercase tracking-wide">
                    {group.length} {group.length === 1 ? 'report' : 'reports'}
                  </span>
                </div>

                {/* Individual complaints — compact rows, tap to open modal */}
                {group.map((c, idx) => {
                  const filedDate = new Date(c.filedAt).toLocaleDateString('en-PH', {
                    timeZone: 'Asia/Manila', month: 'short', day: 'numeric',
                  });
                  const offenseNum = offenseMap.get(c.id) ?? 1;

                  return (
                    <div key={c.id}>
                      {idx > 0 && <div className="h-px bg-slate-100 dark:bg-slate-700/50 mx-4" />}
                      <div
                        className={`px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 active:bg-slate-100 dark:active:bg-slate-700/50 transition-all select-none flex items-center gap-3 ${
                          c.status === 'PENDING' ? 'border-l-[3px] border-amber-400' : 'border-l-[3px] border-transparent'
                        }`}
                        onClick={() => setViewComplaint(c)}
                      >
                        {/* Offense circle */}
                        <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-black ${
                          c.status === 'PENDING' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400' :
                          c.status === 'DISMISSED' ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500' :
                          'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                        }`}>
                          {offenseNum}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-xs font-black uppercase tracking-tight ${REPORT_TEXT_COLOR[c.reportType] || 'text-slate-600 dark:text-slate-400'}`}>
                              {REPORT_LABEL[c.reportType] || c.reportType || '—'}
                            </span>
                            {c.actionTaken && c.actionTaken !== 'NONE' && (
                              <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-100 dark:border-emerald-500/25 px-1.5 py-0.5 rounded-md uppercase tracking-widest">
                                {ACTION_LABEL_MAP[c.actionTaken] || c.actionTaken}
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide truncate mt-0.5">
                            <span className="text-slate-500 dark:text-slate-400 font-black">{formatComplaintNo(c.id)}</span> · {getBranchName(c.branchId)} · {filedDate}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {filter !== c.status && (
                            <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded-lg border ${STATUS_STYLE[c.status]}`}>
                              {c.status === 'ACKNOWLEDGED' ? 'Done' : c.status === 'DISMISSED' ? 'Dismissed' : 'Pending'}
                            </span>
                          )}
                          <svg className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
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
              <div className="flex items-center gap-2 text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                <div className="w-3.5 h-3.5 border-2 border-slate-300 dark:border-slate-600 border-t-slate-500 dark:border-t-slate-400 rounded-full animate-spin" />
                Loading more...
              </div>
            </div>
          )}
        </div>
      )}

      {/* Complaint detail modal */}
      {viewComplaint && (() => {
        const c = viewComplaint;
        const isCurrentlyProcessing = isProcessing === c.id;
        // Compute offense number from all complaints for this employee
        const empComplaints = complaints.filter(x => x.employeeId === c.employeeId);
        const sortedByDate = [...empComplaints].sort((a, b) => a.filedAt.localeCompare(b.filedAt));
        const offenseNum = sortedByDate.findIndex(x => x.id === c.id) + 1;
        const filedDate = new Date(c.filedAt).toLocaleDateString('en-PH', {
          timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric',
        });
        const employeeActive = getEmployeeActive(c.employeeId);

        return (
          <div className="fixed inset-0 z-[2900] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-200"
            onClick={() => setViewComplaint(null)}>
            <div className="bg-white dark:bg-slate-900 rounded-t-[28px] sm:rounded-2xl w-full sm:max-w-md shadow-xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col max-h-[88vh]"
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-6 pt-6 pb-5 shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">Employee Complaint · <span className="text-slate-400 dark:text-slate-500">{formatComplaintNo(c.id)}</span></p>
                    <h3 className="text-[17px] font-bold text-slate-900 dark:text-slate-100 leading-none truncate">{c.employeeName}</h3>
                    {employeeActive === false && (
                      <span className="inline-block mt-1.5 text-xs font-black text-rose-400 bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 rounded-md uppercase tracking-widest">Suspended</span>
                    )}
                  </div>
                  <button
                    onClick={() => setViewComplaint(null)}
                    className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center shrink-0 transition-all mt-0.5"
                  >
                    <svg className="w-4 h-4 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Badges row */}
                <div className="flex items-center gap-2 flex-wrap mt-3">
                  <span className={`text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-xl border ${
                    c.status === 'PENDING' ? 'bg-amber-500/15 border-amber-500/30 text-amber-500 dark:text-amber-400' :
                    c.status === 'ACKNOWLEDGED' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-500 dark:text-emerald-400' :
                    'bg-slate-500/15 border-slate-500/30 text-slate-500 dark:text-slate-400'
                  }`}>
                    {c.status === 'ACKNOWLEDGED' ? 'Acknowledged' : c.status === 'DISMISSED' ? 'Dismissed' : 'Pending'}
                  </span>
                  <span className={`text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-xl border ${REPORT_COLOR[c.reportType] || 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'}`}>
                    {REPORT_LABEL[c.reportType] || c.reportType}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                    {ordinal(offenseNum)} offense
                  </span>
                </div>
              </div>

              {/* Scrollable body */}
              <div className="overflow-y-auto flex-1 p-5 space-y-4 bg-slate-50/50 dark:bg-slate-900">

                {/* Meta grid */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Incident Date', value: `${c.incidentDate || '—'}${c.incidentTime ? ` · ${c.incidentTime}` : ''}` },
                    { label: 'Filed', value: filedDate },
                    { label: 'Branch', value: getBranchName(c.branchId) },
                    { label: 'Filed By', value: c.filedByName || '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-white dark:bg-slate-800 rounded-2xl px-4 py-3 border border-slate-100 dark:border-slate-700/50">
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{label}</p>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{value}</p>
                    </div>
                  ))}
                </div>

                {c.witnesses && (
                  <div>
                    <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1.5">Witnesses</p>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/50 rounded-2xl px-4 py-3">{c.witnesses}</p>
                  </div>
                )}

                <div>
                  <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1.5">Description</p>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 leading-relaxed bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/50 rounded-2xl px-4 py-3">{c.description || '—'}</p>
                </div>

                {/* Resolution block */}
                {(c.actionTaken && c.actionTaken !== 'NONE') || c.judgment || c.resolution ? (
                  <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Admin Resolution</p>
                    </div>
                    {c.actionTaken && c.actionTaken !== 'NONE' && (
                      <div>
                        <p className="text-xs font-black text-emerald-500/80 dark:text-emerald-400/80 uppercase tracking-widest mb-0.5">Action Taken</p>
                        <p className="text-xs font-black text-emerald-800 dark:text-emerald-300">{ACTION_LABEL_MAP[c.actionTaken] || c.actionTaken}</p>
                      </div>
                    )}
                    {c.judgment && (
                      <div>
                        <p className="text-xs font-black text-emerald-500/80 dark:text-emerald-400/80 uppercase tracking-widest mb-0.5">Judgment</p>
                        <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 leading-relaxed">{c.judgment}</p>
                      </div>
                    )}
                    {c.resolution && (
                      <div>
                        <p className="text-xs font-black text-emerald-500/80 dark:text-emerald-400/80 uppercase tracking-widest mb-0.5">Resolution</p>
                        <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 leading-relaxed">{c.resolution}</p>
                      </div>
                    )}
                    {c.reviewedBy && (
                      <p className="text-xs font-bold text-emerald-500/60 dark:text-emerald-400/60 uppercase tracking-widest">Reviewed by {c.reviewedBy}</p>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Footer actions */}
              {!isReadOnly && (
                <div className="border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-4 shrink-0">
                  {c.status === 'PENDING' ? (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        disabled={isCurrentlyProcessing}
                        onClick={() => setDismissConfirmId(c.id)}
                        className="h-12 rounded-2xl border-2 border-slate-200 dark:border-slate-700 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 transition-all disabled:opacity-40"
                      >
                        Dismiss
                      </button>
                      <button
                        disabled={isCurrentlyProcessing}
                        onClick={() => openReview(c)}
                        className="h-12 rounded-2xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold uppercase tracking-wide hover:bg-slate-800 dark:hover:bg-white active:scale-95 transition-all disabled:opacity-40"
                      >
                        Acknowledge
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <button
                        disabled={isCurrentlyProcessing}
                        onClick={() => setDeleteConfirmId(c.id)}
                        className="h-10 w-10 rounded-2xl border-2 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:border-rose-300 dark:hover:border-rose-500/50 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center shrink-0"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                      <button
                        disabled={isCurrentlyProcessing}
                        onClick={() => setReopenConfirmId(c.id)}
                        className="flex-1 h-12 rounded-2xl border-2 border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-semibold uppercase tracking-wide hover:bg-amber-100 dark:hover:bg-amber-500/20 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                        Reopen
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Review modal */}
      {reviewState && (
        <div className="fixed inset-0 z-[3000] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-t-[28px] sm:rounded-2xl w-full sm:max-w-md shadow-xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-6 pt-6 pb-5 shrink-0">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">Review Complaint</p>
                  <h3 className="text-[17px] font-bold text-slate-900 dark:text-slate-100 leading-none">{reviewState.complaint.employeeName}</h3>
                  <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1">
                    {REPORT_LABEL[reviewState.complaint.reportType] || reviewState.complaint.reportType}
                  </p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-2 mt-1">
                  <span className={`text-xs font-semibold uppercase tracking-wide px-3 py-1.5 rounded-xl border ${
                    reviewState.offenseNumber === 1 ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' :
                    reviewState.offenseNumber === 2 ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' :
                    reviewState.offenseNumber === 3 ? 'bg-orange-500/15 border-orange-500/30 text-orange-400' :
                    'bg-rose-500/15 border-rose-500/30 text-rose-400'
                  }`}>
                    {ordinal(reviewState.offenseNumber)} Offense
                  </span>
                </div>
              </div>

              {/* Escalation hint */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${
                reviewState.offenseNumber === 1 ? 'bg-emerald-500/10' : 'bg-amber-500/10'
              }`}>
                <svg className={`w-3 h-3 shrink-0 ${reviewState.offenseNumber === 1 ? 'text-emerald-400' : 'text-amber-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className={`text-xs font-semibold uppercase tracking-wide ${reviewState.offenseNumber === 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {reviewState.offenseNumber === 1
                    ? 'First offense — choose an action below'
                    : `${ordinal(reviewState.offenseNumber)} offense · ${ACTION_LABEL_MAP[reviewState.suggestedAction]} recommended`
                  }
                </p>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 p-5 space-y-5 bg-slate-50/50 dark:bg-slate-900">

              {/* Action Taken */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">Action Taken</p>

                {/* Administrative row */}
                <div className="grid grid-cols-2 gap-2">
                  {(['NONE', 'NOTED'] as EmployeeComplaint['actionTaken'][]).map(val => {
                    const opt = ACTION_OPTIONS.find(o => o.value === val)!;
                    const isSelected = reviewAction === val;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setReviewAction(val)}
                        className={`px-3.5 py-3 rounded-2xl border-2 text-left transition-all active:scale-[0.97] ${
                          isSelected
                            ? 'border-slate-400 dark:border-slate-500 bg-slate-50 dark:bg-slate-800 shadow-sm'
                            : 'border-slate-100 dark:border-slate-700/50 bg-white dark:bg-slate-800/40 hover:border-slate-200 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <p className={`text-xs font-black uppercase tracking-tight leading-none ${isSelected ? 'text-slate-800 dark:text-slate-200' : 'text-slate-500 dark:text-slate-500'}`}>
                          {opt.label}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {/* Escalation divider */}
                <div className="flex items-center gap-2 py-0.5">
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700/50" />
                  <p className="text-xs font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest">Escalation Track</p>
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700/50" />
                </div>

                {/* Escalation steps */}
                <div className="grid grid-cols-2 gap-2">
                  {(['VERBAL_WARNING', 'WRITTEN_WARNING', 'FINAL_WARNING', 'SUSPENDED'] as EmployeeComplaint['actionTaken'][]).map((val, idx) => {
                    const opt = ACTION_OPTIONS.find(o => o.value === val)!;
                    const isSelected = reviewAction === val;
                    const isSuggested = val === reviewState.suggestedAction;
                    const stepColors: Record<string, { ring: string; bg: string; text: string; num: string }> = {
                      VERBAL_WARNING:  { ring: 'border-amber-400 dark:border-amber-500/60',  bg: 'bg-amber-50 dark:bg-amber-500/15',  text: 'text-amber-700 dark:text-amber-400',  num: 'bg-amber-400 text-white' },
                      WRITTEN_WARNING: { ring: 'border-orange-400 dark:border-orange-500/60', bg: 'bg-orange-50 dark:bg-orange-500/15', text: 'text-orange-700 dark:text-orange-400', num: 'bg-orange-400 text-white' },
                      FINAL_WARNING:   { ring: 'border-rose-400 dark:border-rose-500/60',   bg: 'bg-rose-50 dark:bg-rose-500/15',   text: 'text-rose-700 dark:text-rose-400',   num: 'bg-rose-400 text-white'  },
                      SUSPENDED:       { ring: 'border-red-600 dark:border-red-500/60',    bg: 'bg-red-50 dark:bg-red-500/15',    text: 'text-red-700 dark:text-red-400',    num: 'bg-red-600 text-white'   },
                    };
                    const col = stepColors[val];
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setReviewAction(val)}
                        className={`relative px-3.5 pt-2.5 pb-3 rounded-2xl border-2 text-left transition-all active:scale-[0.97] ${
                          isSelected
                            ? `${col.ring} ${col.bg} shadow-sm`
                            : 'border-slate-100 dark:border-slate-700/50 bg-white dark:bg-slate-800/40 hover:border-slate-200 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`w-4 h-4 rounded-full text-xs font-black flex items-center justify-center shrink-0 ${isSelected ? col.num : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500'}`}>
                            {idx + 1}
                          </span>
                          {isSuggested && !isSelected && (
                            <span className="text-[6px] font-black text-amber-500 uppercase tracking-widest bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 px-1 py-0.5 rounded-md">Suggested</span>
                          )}
                        </div>
                        <p className={`text-xs font-black uppercase tracking-tight leading-tight ${isSelected ? col.text : 'text-slate-700 dark:text-slate-400'}`}>
                          {opt.label}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {reviewAction === 'SUSPENDED' && (
                  <div className="flex items-start gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl px-3 py-2.5">
                    <svg className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                    <p className="text-xs font-black text-red-700 dark:text-red-400 uppercase tracking-widest leading-relaxed">
                      {reviewState.complaint.employeeName} will be suspended and lose access immediately.
                    </p>
                  </div>
                )}
              </div>

              {/* Judgment */}
              <div>
                <div className="flex items-baseline gap-1.5 mb-2">
                  <label className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">Judgment</label>
                  <span className="text-xs font-bold text-slate-300 dark:text-slate-600">optional</span>
                </div>
                <textarea
                  value={judgment}
                  onChange={e => setJudgment(e.target.value)}
                  placeholder="Official ruling or assessment..."
                  rows={2}
                  className="w-full px-4 py-3 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700/50 rounded-2xl text-xs font-semibold text-slate-900 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 outline-none focus:border-slate-300 dark:focus:border-slate-600 transition-all resize-none"
                />
              </div>

              {/* Resolution */}
              <div>
                <div className="flex items-baseline gap-1.5 mb-2">
                  <label className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">Resolution</label>
                  <span className="text-xs font-bold text-slate-300 dark:text-slate-600">optional · visible to branch manager</span>
                </div>
                <textarea
                  value={resolution}
                  onChange={e => setResolution(e.target.value)}
                  placeholder="How was this resolved?"
                  rows={2}
                  className="w-full px-4 py-3 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700/50 rounded-2xl text-xs font-semibold text-slate-900 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 outline-none focus:border-slate-300 dark:focus:border-slate-600 transition-all resize-none"
                />
              </div>
            </div>

            {/* Sticky footer */}
            <div className="border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-4 grid grid-cols-2 gap-3 shrink-0">
              <button
                onClick={() => { setReviewState(null); playSound('click'); }}
                className="h-12 rounded-2xl border-2 border-slate-200 dark:border-slate-700 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => setReviewConfirm(true)}
                className="h-12 rounded-2xl text-white dark:text-slate-900 text-xs font-semibold uppercase tracking-wide active:scale-95 transition-all bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white"
              >
                Review & Resolve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dismiss confirmation */}
      {dismissConfirmId && (() => {
        const c = complaints.find(x => x.id === dismissConfirmId);
        return (
          <div className="fixed inset-0 z-[3100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <div className="p-7 text-center space-y-4">
                <div className="w-14 h-14 bg-rose-50 dark:bg-rose-500/15 rounded-2xl flex items-center justify-center mx-auto">
                  <svg className="w-7 h-7 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </div>
                <div className="space-y-1">
                  <h3 className="text-[15px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">Dismiss Complaint?</h3>
                  {c && <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{c.employeeName} · {REPORT_LABEL[c.reportType] || c.reportType}</p>}
                  <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">This will mark the complaint as dismissed. This cannot be undone.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    onClick={() => setDismissConfirmId(null)}
                    className="h-11 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDismiss(dismissConfirmId)}
                    className="h-11 rounded-2xl bg-rose-600 text-white text-xs font-semibold uppercase tracking-wide hover:bg-rose-700 active:scale-95 transition-all"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Reopen confirmation */}
      {reopenConfirmId && (() => {
        const c = complaints.find(x => x.id === reopenConfirmId);
        return (
          <div className="fixed inset-0 z-[3100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <div className="p-7 text-center space-y-4">
                <div className="w-14 h-14 bg-amber-50 dark:bg-amber-500/15 rounded-2xl flex items-center justify-center mx-auto">
                  <svg className="w-7 h-7 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                </div>
                <div className="space-y-1">
                  <h3 className="text-[15px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">Reopen Complaint?</h3>
                  {c && <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{c.employeeName} · {REPORT_LABEL[c.reportType] || c.reportType}</p>}
                  <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">This will reset the complaint to pending and clear any prior action, judgment, and resolution.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    onClick={() => setReopenConfirmId(null)}
                    className="h-11 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleReopen(reopenConfirmId)}
                    className="h-11 rounded-2xl bg-amber-500 text-white text-xs font-semibold uppercase tracking-wide hover:bg-amber-600 active:scale-95 transition-all"
                  >
                    Reopen
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete confirmation */}
      {deleteConfirmId && (() => {
        const c = complaints.find(x => x.id === deleteConfirmId);
        return (
          <div className="fixed inset-0 z-[3100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <div className="p-7 text-center space-y-4">
                <div className="w-14 h-14 bg-rose-50 dark:bg-rose-500/15 rounded-2xl flex items-center justify-center mx-auto">
                  <svg className="w-7 h-7 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div className="space-y-1">
                  <h3 className="text-[15px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">Delete Complaint?</h3>
                  {c && <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{c.employeeName} · {REPORT_LABEL[c.reportType] || c.reportType}</p>}
                  <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">This will permanently remove the complaint record. This cannot be undone.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    onClick={() => setDeleteConfirmId(null)}
                    className="h-11 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDelete(deleteConfirmId)}
                    className="h-11 rounded-2xl bg-rose-600 text-white text-xs font-semibold uppercase tracking-wide hover:bg-rose-700 active:scale-95 transition-all"
                  >
                    Delete
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-7 text-center space-y-4">
              <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-500/15 rounded-2xl flex items-center justify-center mx-auto">
                <svg className="w-7 h-7 text-emerald-600 dark:text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="space-y-1">
                <h3 className="text-[15px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">Confirm Review?</h3>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{reviewState.complaint.employeeName} · {REPORT_LABEL[reviewState.complaint.reportType] || reviewState.complaint.reportType}</p>
                {reviewAction !== 'NONE' && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Action: <span className="font-black text-slate-700 dark:text-slate-200">{ACTION_LABEL_MAP[reviewAction] || reviewAction}</span></p>
                )}
                {reviewAction === 'SUSPENDED' && (
                  <p className="text-xs font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest">Employee will be suspended.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  onClick={() => setReviewConfirm(false)}
                  className="h-11 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                >
                  Back
                </button>
                <button
                  onClick={() => { setReviewConfirm(false); handleReview('ACKNOWLEDGED'); }}
                  className="h-11 rounded-2xl bg-emerald-600 text-white text-xs font-semibold uppercase tracking-wide hover:bg-emerald-700 active:scale-95 transition-all"
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
