import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Calendar } from 'lucide-react';
import { Attendance, Branch, Employee } from '../../types';
import { UI_THEME } from '../../constants/ui_designs';
import { playSound, resumeAudioContext } from '../../lib/audio';
import { Pagination } from '../dashboard/sections/common/Pagination';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getTrueDate } from '../../lib/time';
import { logAudit } from '../../lib/audit';
import { BranchCheckboxDropdown } from '../shared/BranchCheckboxDropdown';

interface AttendanceHubProps {
  attendance: Attendance[];
  branches: Branch[];
  employees: Employee[];
  onRefresh?: () => void;
  isReadOnly?: boolean;
}

export const AttendanceHub: React.FC<AttendanceHubProps> = ({ branches, employees, onRefresh, isReadOnly }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(getTrueDate());
  const [dateFrom, setDateFrom] = useState<string>(todayStr);
  const [dateTo, setDateTo] = useState<string>(todayStr);
  const [currentPage, setCurrentPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [isResetting, setIsResetting] = useState<string | null>(null);
  const [deleteConfirmLog, setDeleteConfirmLog] = useState<Attendance | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [resetConfirmLog, setResetConfirmLog] = useState<Attendance | null>(null);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Server-side attendance fetch based on current filters
  const [serverAttendance, setServerAttendance] = useState<Attendance[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const fetchRef = useRef(0);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const token = ++fetchRef.current;
    setIsFetching(true);
    (async () => {
      try {
        let query = supabase
          .from(DB_TABLES.ATTENDANCE)
          .select([
            DB_COLUMNS.ID, DB_COLUMNS.BRANCH_ID, DB_COLUMNS.EMPLOYEE_ID,
            DB_COLUMNS.STAFF_NAME, DB_COLUMNS.DATE, DB_COLUMNS.CLOCK_IN, DB_COLUMNS.CLOCK_OUT,
            DB_COLUMNS.STATUS, DB_COLUMNS.LATE_DEDUCTION, DB_COLUMNS.OT_PAY,
            DB_COLUMNS.CASH_ADVANCE, DB_COLUMNS.IS_HALF_DAY, DB_COLUMNS.CREATED_AT,
          ].join(','))
          .order(DB_COLUMNS.DATE, { ascending: false })
          .order(DB_COLUMNS.CLOCK_IN, { ascending: false });

        if (dateFrom) query = query.gte(DB_COLUMNS.DATE, dateFrom);
        if (dateTo)   query = query.lte(DB_COLUMNS.DATE, dateTo);
        if (selectedBranchIds.length > 0) query = query.in(DB_COLUMNS.BRANCH_ID, selectedBranchIds);
        if (searchTerm.trim()) query = query.ilike(DB_COLUMNS.STAFF_NAME, `%${searchTerm.trim()}%`);
        query = query.limit(2000);

        const { data, error } = await query;
        if (error) throw error;
        if (token !== fetchRef.current) return; // stale

        setServerAttendance((data || []).map((att: any) => ({
          id: att[DB_COLUMNS.ID], branchId: att[DB_COLUMNS.BRANCH_ID], employeeId: att[DB_COLUMNS.EMPLOYEE_ID],
          staffName: att[DB_COLUMNS.STAFF_NAME], date: att[DB_COLUMNS.DATE], clockIn: att[DB_COLUMNS.CLOCK_IN],
          clockOut: att[DB_COLUMNS.CLOCK_OUT], status: att[DB_COLUMNS.STATUS],
          lateDeduction: Number(att[DB_COLUMNS.LATE_DEDUCTION] || 0),
          otPay: Number(att[DB_COLUMNS.OT_PAY] || 0), cashAdvance: Number(att[DB_COLUMNS.CASH_ADVANCE] || 0),
          isHalfDay: Boolean(att[DB_COLUMNS.IS_HALF_DAY]), createdAt: att[DB_COLUMNS.CREATED_AT],
        })));
      } catch (err) {
        console.error('AttendanceHub fetch error:', err);
      } finally {
        if (token === fetchRef.current) setIsFetching(false);
      }
    })();
  }, [dateFrom, dateTo, selectedBranchIds, searchTerm, refreshTick]);

  const selectedBranchLabel =
    selectedBranchIds.length === 0 ? 'All Branches'
    : selectedBranchIds.length === 1 ? (branches.find(b => b.id === selectedBranchIds[0])?.name ?? 'Branch')
    : `${selectedBranchIds.length} Branches`;

  const [clockOutFilter, setClockOutFilter] = useState<'ALL' | 'IN_PROGRESS' | 'CLOCKED_OUT'>('ALL');

  const filteredAttendance = useMemo(() => {
    if (clockOutFilter === 'IN_PROGRESS') return serverAttendance.filter(a => !a.clockOut);
    if (clockOutFilter === 'CLOCKED_OUT') return serverAttendance.filter(a => !!a.clockOut);
    return serverAttendance;
  }, [serverAttendance, clockOutFilter]);

  const paginatedAttendance = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAttendance.slice(start, start + itemsPerPage);
  }, [filteredAttendance, currentPage]);

  const totalPages = Math.ceil(filteredAttendance.length / itemsPerPage);

  const isToday = (dateStr: string) => {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(getTrueDate());
    return dateStr === today;
  };

  const handleDeleteEntry = async () => {
    if (!deleteConfirmLog || isDeleting) return;
    const log = deleteConfirmLog;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from(DB_TABLES.ATTENDANCE)
        .delete()
        .eq(DB_COLUMNS.ID, log.id);

      if (error) throw error;

      await logAudit({
        branchId: log.branchId,
        activityType: 'DELETE',
        entityType: 'ATTENDANCE',
        entityId: log.id,
        description: `SuperAdmin DELETED clock-in entry for ${log.staffName} on ${log.date}`,
        performerName: 'SYSTEM ADMIN',
      });

      playSound('success');
      setDeleteConfirmLog(null);
      setRefreshTick(t => t + 1); onRefresh?.();
    } catch (err) {
      console.error('Failed to delete attendance entry:', err);
      playSound('warning');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleResetClockOut = async (log: Attendance) => {
    if (!isToday(log.date)) {
      alert("Attendance records for previous days cannot be reset. Only today's active logs are adjustable.");
      return;
    }
    setResetConfirmLog(log);
  };

  const confirmResetClockOut = async () => {
    if (!resetConfirmLog) return;
    const log = resetConfirmLog;
    setResetConfirmLog(null);
    setIsResetting(log.id);
    try {
      const { error } = await supabase
        .from(DB_TABLES.ATTENDANCE)
        .update({
          [DB_COLUMNS.CLOCK_OUT]: null,
          [DB_COLUMNS.STATUS]: 'REGULAR'
        })
        .eq(DB_COLUMNS.ID, log.id);

      if (error) throw error;

      // Also log to audit
      await logAudit({
        branchId: log.branchId,
        activityType: 'UPDATE',
        entityType: 'ATTENDANCE',
        entityId: log.id,
        description: `SuperAdmin RESET clock-out for ${log.staffName}`,
        performerName: 'SYSTEM ADMIN',
      });

      playSound('success');
      setRefreshTick(t => t + 1); onRefresh?.();
    } catch (err) {
      console.error('Failed to reset clock out:', err);
      alert('Failed to reset clock out. Please try again.');
    } finally {
      setIsResetting(null);
    }
  };

  const handleExportPDF = () => {
    resumeAudioContext();
    setIsExporting(true);
    playSound('success');

    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      // Header
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text('GLOBAL ATTENDANCE LOGS', 14, 20);

      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139); // slate-500
      const dateRangeLabel = dateFrom && dateTo && dateFrom === dateTo
        ? dateFrom
        : `${dateFrom || 'START'} → ${dateTo || 'END'}`;
      doc.text(`DATE RANGE: ${dateRangeLabel}`, 14, 28);
      doc.text(`BRANCH: ${selectedBranchLabel}`, 14, 33);
      doc.text(`GENERATED AT: ${getTrueDate().toLocaleString()}`, 14, 38);

      const tableData = filteredAttendance.map(log => {
        const branch = branches.find(b => b.id === log.branchId);
        return [
          log.staffName.toUpperCase(),
          (branch?.name || 'UNKNOWN').toUpperCase(),
          new Date(log.clockIn).toLocaleString(),
          log.clockOut ? new Date(log.clockOut).toLocaleString() : 'IN PROGRESS',
          log.status.toUpperCase()
        ];
      });

      autoTable(doc, {
        head: [['Staff Name', 'Clock-in Branch', 'Clock In', 'Clock Out', 'Status']],
        body: tableData,
        startY: 45,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontStyle: 'bold' }
      });

      const fileLabel = dateFrom === dateTo ? (dateFrom || 'All') : `${dateFrom || 'Start'}_to_${dateTo || 'End'}`;
      doc.save(`Attendance_Logs_${fileLabel}_${selectedBranchLabel.replace(/\s+/g, '_')}.pdf`);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-300 space-y-6">
      {/* Header & Filters */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
        {/* Title row + Export button */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight leading-none">Attendance Logs</h3>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-1">Global Staff Clock-in Registry</p>
            </div>
            {filteredAttendance.length > 0 && (
              <span className="hidden sm:inline shrink-0 px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-xs font-semibold uppercase tracking-wide">
                {filteredAttendance.length} records
              </span>
            )}
          </div>
        </div>

        {/* Filter controls — stacked: search → branch → date */}
        <div className="flex flex-col gap-2.5">
          {/* Search */}
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth="3" /></svg>
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value.toUpperCase())}
              placeholder="Search staff or branch..."
              className="w-full h-10 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs uppercase tracking-wider outline-none focus:bg-white focus:border-emerald-500 transition-all"
            />
          </div>

          {/* Branch filter */}
          <BranchCheckboxDropdown
            branches={branches}
            selectedIds={selectedBranchIds}
            onChange={ids => { setSelectedBranchIds(ids); setCurrentPage(1); }}
            className="w-full"
          />

          {/* Date range — collapsible */}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => { setDateFilterOpen(o => !o); playSound('click'); }}
              className={`w-full h-10 flex items-center justify-between px-4 rounded-2xl border transition-all ${
                dateFilterOpen || dateFrom !== todayStr || dateTo !== todayStr
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                <span className="text-xs font-semibold uppercase tracking-wide">
                  {dateFrom === dateTo
                    ? (dateFrom === todayStr ? 'Today' : dateFrom)
                    : `${dateFrom} → ${dateTo}`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {(dateFrom !== todayStr || dateTo !== todayStr) && (
                  <span
                    onClick={e => { e.stopPropagation(); setDateFrom(todayStr); setDateTo(todayStr); setCurrentPage(1); playSound('click'); }}
                    className="text-xs font-semibold uppercase tracking-wide text-emerald-600 hover:text-emerald-800 transition-colors"
                  >
                    Reset
                  </span>
                )}
                <svg className={`w-3.5 h-3.5 transition-transform ${dateFilterOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
              </div>
            </button>

            {dateFilterOpen && (
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-1">
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={e => { setDateFrom(e.target.value); setCurrentPage(1); playSound('click'); }}
                  className="h-10 min-w-0 px-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs uppercase tracking-widest outline-none focus:border-emerald-500 transition-all"
                />
                <span className="text-xs font-black text-slate-300 uppercase tracking-widest shrink-0 text-center">to</span>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={e => { setDateTo(e.target.value); setCurrentPage(1); playSound('click'); }}
                  className="h-10 min-w-0 px-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs uppercase tracking-widest outline-none focus:border-emerald-500 transition-all"
                />
              </div>
            )}
          </div>

          {/* Clock-out status filter */}
          <div className="flex gap-2">
            {(['ALL', 'IN_PROGRESS', 'CLOCKED_OUT'] as const).map(opt => {
              const labels: Record<typeof opt, string> = { ALL: 'All', IN_PROGRESS: 'In Progress', CLOCKED_OUT: 'Clocked Out' };
              const icons: Record<typeof opt, React.ReactNode> = {
                ALL: <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>,
                IN_PROGRESS: <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2"/></svg>,
                CLOCKED_OUT: <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>,
              };
              const active = clockOutFilter === opt;
              return (
                <button
                  key={opt}
                  onClick={() => { setClockOutFilter(opt); setCurrentPage(1); playSound('click'); }}
                  className={`flex-1 h-10 flex items-center justify-center gap-1.5 rounded-2xl border text-xs font-semibold uppercase tracking-wide transition-all ${
                    active
                      ? opt === 'IN_PROGRESS'
                        ? 'bg-amber-500 border-amber-500 text-white shadow'
                        : opt === 'CLOCKED_OUT'
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow'
                          : 'bg-slate-800 border-slate-800 text-white shadow'
                      : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600'
                  }`}
                >
                  {icons[opt]}
                  <span className="hidden sm:inline">{labels[opt]}</span>
                </button>
              );
            })}
          </div>
        </div>

      </div>

      <div className="px-1 space-y-4 no-print">
        <div className="flex items-center gap-3 px-1 sm:px-2">
          <div className="flex-1 min-w-0">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={filteredAttendance.length}
              itemsPerPage={itemsPerPage}
              onItemsPerPageChange={(n) => { setItemsPerPage(n); setCurrentPage(1); }}
            />
          </div>
          <button
            onClick={handleExportPDF}
            disabled={isExporting || filteredAttendance.length === 0}
            className="h-14 px-5 flex items-center gap-2.5 rounded-2xl bg-emerald-600 text-white text-xs font-semibold uppercase tracking-wide hover:bg-emerald-700 transition-all shadow-lg active:scale-95 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isExporting ? (
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            )}
            <span className="hidden sm:inline">{isExporting ? 'Exporting...' : 'Export PDF'}</span>
          </button>
        </div>

        {/* Table / Mobile Cards */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Desktop View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {/* accent col — no header */}
                  <th className="w-1.5 p-0" />
                  <th className="pl-5 pr-4 py-4 text-xs font-medium text-slate-400 uppercase tracking-wide">Staff</th>
                  <th className="px-4 py-4 text-xs font-medium text-slate-400 uppercase tracking-wide">Branch</th>
                  <th className="px-4 py-4 text-xs font-medium text-slate-400 uppercase tracking-wide">Date</th>
                  <th className="px-4 py-4 text-xs font-medium text-slate-400 uppercase tracking-wide">Clock In</th>
                  <th className="px-4 py-4 text-xs font-medium text-slate-400 uppercase tracking-wide">Clock Out</th>
                  <th className="px-4 py-4 text-xs font-medium text-slate-400 uppercase tracking-wide">Duration</th>
                  <th className="px-4 py-4 text-xs font-medium text-slate-400 uppercase tracking-wide">Status</th>
                  <th className="pl-4 pr-5 py-4 text-xs font-medium text-slate-400 uppercase tracking-wide text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginatedAttendance.length > 0 ? (
                  paginatedAttendance.map((log) => {
                    const branch    = branches.find(b => b.id === log.branchId);
                    const employee  = employees.find(e => e.id === log.employeeId);
                    const homeBranch = branches.find(b => b.id === employee?.branchId);
                    const isRelief  = homeBranch && homeBranch.id !== branch?.id;
                    const isActive  = !log.clockOut && isToday(log.date);

                    const durationMs   = log.clockOut ? new Date(log.clockOut).getTime() - new Date(log.clockIn).getTime() : null;
                    const durationHrs  = durationMs !== null ? Math.floor(durationMs / 3600000) : null;
                    const durationMins = durationMs !== null ? Math.floor((durationMs % 3600000) / 60000) : null;

                    const accentColor =
                      isActive               ? 'bg-emerald-400' :
                      log.status === 'LATE'  ? 'bg-rose-500' :
                      log.status === 'OT'    ? 'bg-indigo-500' :
                      log.status === 'AUTO-LOGOUT' ? 'bg-amber-400' :
                                               'bg-slate-300';

                    const statusBadge =
                      isActive               ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      log.status === 'LATE'  ? 'bg-rose-50 text-rose-700 border-rose-200' :
                      log.status === 'OT'    ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                      log.status === 'AUTO-LOGOUT' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                               'bg-slate-50 text-slate-600 border-slate-200';

                    return (
                      <tr key={log.id} className="hover:bg-slate-50/60 transition-colors group">
                        {/* Status accent strip */}
                        <td className="p-0 w-1.5">
                          <div className={`w-1.5 h-full min-h-[60px] ${accentColor} ${isActive ? 'animate-pulse' : ''}`} />
                        </td>

                        {/* Staff */}
                        <td className="pl-5 pr-4 py-4">
                          <p className="text-xs font-black text-slate-900 uppercase tracking-tight leading-tight truncate" title={log.staffName}>{log.staffName}</p>
                          {isRelief && (
                            <span className="inline-block mt-1 px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded text-xs font-black text-amber-700 uppercase tracking-widest">
                              Relief
                            </span>
                          )}
                        </td>

                        {/* Branch */}
                        <td className="px-4 py-4">
                          <p className="text-xs font-bold text-slate-700 uppercase tracking-tight leading-tight truncate" title={branch?.name || 'Unknown'}>
                            {(branch?.name || 'Unknown').replace('BRANCH - ', '')}
                          </p>
                        </td>

                        {/* Date */}
                        <td className="px-4 py-4">
                          <p className="text-xs font-bold text-slate-500 whitespace-nowrap">
                            {new Date(log.clockIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        </td>

                        {/* Clock In */}
                        <td className="px-4 py-4">
                          <p className="text-sm font-black text-emerald-600 tabular-nums tracking-tight">
                            {new Date(log.clockIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </td>

                        {/* Clock Out */}
                        <td className="px-4 py-4">
                          {log.clockOut ? (
                            <p className="text-sm font-black text-rose-500 tabular-nums tracking-tight">
                              {new Date(log.clockOut).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          ) : isActive ? (
                            <span className="text-xs font-black text-emerald-400 uppercase tracking-widest animate-pulse">Active</span>
                          ) : (
                            <span className="text-xs font-bold text-slate-400 italic">No clockout recorded</span>
                          )}
                        </td>

                        {/* Duration */}
                        <td className="px-4 py-4">
                          {durationHrs !== null ? (
                            <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-black tabular-nums">
                              {durationHrs}h {durationMins}m
                            </span>
                          ) : (
                            <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">—</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-4">
                          <span className={`px-2.5 py-1 rounded-full border text-xs font-semibold uppercase tracking-wide ${statusBadge}`}>
                            {isActive ? 'Active' : log.status}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="pl-4 pr-5 py-4">
                          <div className="flex items-center justify-end gap-1.5">
                            {!isReadOnly && log.clockOut && isToday(log.date) && (
                              <button
                                onClick={() => handleResetClockOut(log)}
                                disabled={isResetting === log.id}
                                title="Reset clock-out"
                                className="h-8 px-3 flex items-center gap-1.5 bg-slate-100 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 rounded-lg text-xs font-semibold uppercase tracking-wide transition-all active:scale-95"
                              >
                                {isResetting === log.id ? (
                                  <div className="w-3 h-3 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
                                ) : (
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                )}
                                Reset
                              </button>
                            )}
                            {!isReadOnly && (
                              <button
                                onClick={() => { playSound('delete'); setDeleteConfirmLog(log); }}
                                title="Delete entry"
                                className="h-8 w-8 flex items-center justify-center bg-rose-50 hover:bg-rose-500 text-rose-400 hover:text-white rounded-lg transition-all active:scale-95"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="px-6 py-20 text-center">
                      {isFetching ? (
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-7 h-7 border-[3px] border-emerald-100 border-t-emerald-500 rounded-full animate-spin" />
                          <div className="text-xs font-black text-slate-300 uppercase tracking-widest">Loading attendance…</div>
                        </div>
                      ) : (
                        <>
                          <Calendar className="w-10 h-10 text-slate-300 mb-4 mx-auto" />
                          <div className="text-xs font-black text-slate-300 uppercase tracking-widest">No attendance records found</div>
                        </>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile View */}
          <div className="md:hidden space-y-3 p-3">
            {paginatedAttendance.length > 0 ? (
              paginatedAttendance.map((log) => {
                const branch   = branches.find(b => b.id === log.branchId);
                const employee = employees.find(e => e.id === log.employeeId);
                const homeBranch = branches.find(b => b.id === employee?.branchId);
                const isRelief = homeBranch && homeBranch.id !== branch?.id;
                const isActive = !log.clockOut;

                const durationMs = log.clockOut
                  ? new Date(log.clockOut).getTime() - new Date(log.clockIn).getTime()
                  : null;
                const durationHrs = durationMs !== null ? Math.floor(durationMs / 3600000) : null;
                const durationMins = durationMs !== null ? Math.floor((durationMs % 3600000) / 60000) : null;

                // Status colour palette
                const statusStyle =
                  isActive                      ? { bar: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' } :
                  log.status === 'LATE'         ? { bar: 'bg-rose-500',    badge: 'bg-rose-50 text-rose-700 border-rose-200' } :
                  log.status === 'OT'           ? { bar: 'bg-indigo-500',  badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' } :
                  log.status === 'AUTO-LOGOUT'  ? { bar: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200' } :
                                                  { bar: 'bg-slate-400',   badge: 'bg-slate-50 text-slate-600 border-slate-200' };

                return (
                  <div key={log.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

                    {/* ── Colour accent bar ── */}
                    <div className={`h-1 w-full ${statusStyle.bar} ${isActive ? 'animate-pulse' : ''}`} />

                    {/* ── Header: name + status ── */}
                    <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-900 uppercase tracking-tight leading-tight truncate" title={log.staffName}>
                          {log.staffName}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide truncate" title={branch?.name || 'Unknown'}>
                            {branch?.name?.replace('BRANCH - ', '') || 'Unknown'}
                          </p>
                          <span className="text-slate-200">·</span>
                          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                            {new Date(log.clockIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        </div>
                        {isRelief && (
                          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-full text-xs font-black text-amber-700 uppercase tracking-widest">
                            Relief · Home: {homeBranch.name.replace('BRANCH - ', '')}
                          </span>
                        )}
                      </div>
                      <span className={`shrink-0 px-2.5 py-1 rounded-full border text-xs font-semibold uppercase tracking-wide ${statusStyle.badge}`}>
                        {isActive ? 'Active' : log.status}
                      </span>
                    </div>

                    {/* ── Time block ── */}
                    <div className="mx-4 mb-3 bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
                      <div className="grid grid-cols-2 divide-x divide-slate-100">
                        {/* Clock In */}
                        <div className="px-4 py-3">
                          <p className="text-xs font-black text-emerald-600 uppercase tracking-widest mb-1 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                            Clock In
                          </p>
                          <p className="text-[20px] font-black text-slate-900 tabular-nums leading-none tracking-tighter">
                            {new Date(log.clockIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                          </p>
                        </div>
                        {/* Clock Out */}
                        <div className="px-4 py-3">
                          <p className={`text-xs font-semibold uppercase tracking-wide mb-1 flex items-center gap-1 ${isActive ? 'text-slate-300' : 'text-rose-500'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full inline-block ${isActive ? 'bg-slate-300 animate-pulse' : 'bg-rose-500'}`} />
                            Clock Out
                          </p>
                          {log.clockOut ? (
                            <p className="text-[20px] font-black text-slate-900 tabular-nums leading-none tracking-tighter">
                              {new Date(log.clockOut).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                            </p>
                          ) : isActive ? (
                            <p className="text-sm font-black text-slate-300 leading-none tracking-tight italic">
                              In Progress…
                            </p>
                          ) : (
                            <p className="text-xs font-bold text-slate-400 leading-none italic">
                              No clockout recorded
                            </p>
                          )}
                        </div>
                      </div>
                      {/* Duration footer */}
                      <div className={`border-t border-slate-100 px-4 py-2 flex items-center justify-center ${isActive ? 'bg-emerald-50/40' : ''}`}>
                        {durationHrs !== null ? (
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                            Duration: {durationHrs}h {durationMins}m
                          </p>
                        ) : isActive ? (
                          <p className="text-xs font-black text-emerald-500 uppercase tracking-widest animate-pulse">
                            Shift ongoing
                          </p>
                        ) : (
                          <p className="text-xs font-bold text-slate-400 italic">
                            No clockout recorded
                          </p>
                        )}
                      </div>
                    </div>

                    {/* ── Actions ── */}
                    {!isReadOnly && (
                      <div className="px-4 pb-4 flex items-center gap-2">
                        {log.clockOut && isToday(log.date) && (
                          <button
                            onClick={() => handleResetClockOut(log)}
                            disabled={isResetting === log.id}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-100 hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 rounded-xl text-xs font-semibold uppercase tracking-wide transition-all active:scale-95"
                          >
                            {isResetting === log.id ? (
                              <div className="w-3 h-3 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
                            ) : (
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            )}
                            Reset Clock-Out
                          </button>
                        )}
                        <button
                          onClick={() => { playSound('delete'); setDeleteConfirmLog(log); }}
                          className={`flex items-center justify-center gap-1.5 py-2.5 px-4 bg-rose-50 hover:bg-rose-500 text-rose-500 hover:text-white rounded-xl text-xs font-semibold uppercase tracking-wide transition-all active:scale-95 ${!log.clockOut || !isToday(log.date) ? 'flex-1' : ''}`}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="py-20 text-center bg-white rounded-2xl border border-slate-100 flex flex-col items-center gap-3">
                {isFetching ? (
                  <>
                    <div className="w-7 h-7 border-[3px] border-emerald-100 border-t-emerald-500 rounded-full animate-spin" />
                    <div className="text-xs font-black text-slate-300 uppercase tracking-widest">Loading attendance…</div>
                  </>
                ) : (
                  <>
                    <Calendar className="w-10 h-10 text-slate-300" />
                    <div className="text-xs font-black text-slate-300 uppercase tracking-widest">No records found</div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Reset Clock-Out Confirmation Modal */}
      {resetConfirmLog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-2xl overflow-hidden shadow-xl animate-in zoom-in-95 duration-200">
            <div className="p-8 text-center space-y-5">
              <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter">Reset Clock-Out?</h3>
                <p className="text-xs font-bold text-slate-500 leading-relaxed">
                  This will clear the clock-out time for
                </p>
                <p className="text-sm font-black text-slate-900 uppercase tracking-tight">
                  {resetConfirmLog.staffName}
                </p>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                  and mark them as "In Progress" again.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => { playSound('click'); setResetConfirmLog(null); }}
                  className="py-4 rounded-2xl text-xs font-semibold uppercase tracking-wide text-slate-400 hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmResetClockOut}
                  className="py-4 rounded-2xl text-xs font-semibold uppercase tracking-wide bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-100 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmLog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-2xl overflow-hidden shadow-xl animate-in zoom-in-95 duration-200">
            <div className="p-8 text-center space-y-5">
              <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter">Delete Entry?</h3>
                <p className="text-xs font-bold text-slate-500 leading-relaxed">
                  This will permanently remove the clock-in record for
                </p>
                <p className="text-sm font-black text-slate-900 uppercase tracking-tight">
                  {deleteConfirmLog.staffName}
                </p>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                  {new Date(deleteConfirmLog.clockIn).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  })}
                  {deleteConfirmLog.clockOut && ` → ${new Date(deleteConfirmLog.clockOut).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => { playSound('click'); setDeleteConfirmLog(null); }}
                  disabled={isDeleting}
                  className="py-4 rounded-2xl text-xs font-semibold uppercase tracking-wide text-slate-400 hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteEntry}
                  disabled={isDeleting}
                  className="py-4 rounded-2xl text-xs font-semibold uppercase tracking-wide bg-rose-600 text-white hover:bg-rose-700 shadow-lg shadow-rose-100 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  )}
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
