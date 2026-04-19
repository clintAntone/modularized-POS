import React, { useState, useMemo } from 'react';
import { Attendance, Branch, Employee } from '../../types';
import { UI_THEME } from '../../constants/ui_designs';
import { playSound, resumeAudioContext } from '../../lib/audio';
import { Pagination } from '../dashboard/sections/common/Pagination';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getTrueDate } from '../../lib/time';
import { BranchCheckboxDropdown } from '../shared/BranchCheckboxDropdown';

interface AttendanceHubProps {
  attendance: Attendance[];
  branches: Branch[];
  employees: Employee[];
  onRefresh?: () => void;
}

export const AttendanceHub: React.FC<AttendanceHubProps> = ({ attendance, branches, employees, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<string>(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(getTrueDate())
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [isResetting, setIsResetting] = useState<string | null>(null);
  const [deleteConfirmLog, setDeleteConfirmLog] = useState<Attendance | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const itemsPerPage = 15;

  const selectedBranchLabel =
    selectedBranchIds.length === 0 ? 'All Branches'
    : selectedBranchIds.length === 1 ? (branches.find(b => b.id === selectedBranchIds[0])?.name ?? 'Branch')
    : `${selectedBranchIds.length} Branches`;

  const filteredAttendance = useMemo(() => {
    let res = [...attendance].sort((a, b) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime());

    if (selectedBranchIds.length > 0) {
      res = res.filter(a => selectedBranchIds.includes(a.branchId));
    }

    if (dateFilter) {
      res = res.filter(a => {
        const clockInDate = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Manila',
          year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date(a.clockIn));
        return clockInDate === dateFilter;
      });
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      res = res.filter(a => 
        a.staffName.toLowerCase().includes(term) || 
        (branches.find(b => b.id === a.branchId)?.name || '').toLowerCase().includes(term)
      );
    }

    return res;
  }, [attendance, selectedBranchIds, dateFilter, searchTerm, branches]);

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

      await supabase.from(DB_TABLES.AUDIT_LOGS).insert({
        [DB_COLUMNS.BRANCH_ID]: log.branchId,
        [DB_COLUMNS.ACTIVITY_TYPE]: 'DELETE',
        [DB_COLUMNS.ENTITY_TYPE]: 'ATTENDANCE',
        [DB_COLUMNS.ENTITY_ID]: log.id,
        [DB_COLUMNS.DESCRIPTION]: `SuperAdmin DELETED clock-in entry for ${log.staffName} on ${log.date}`,
        [DB_COLUMNS.PERFORMER_NAME]: 'SYSTEM ADMIN'
      });

      playSound('success');
      setDeleteConfirmLog(null);
      onRefresh?.();
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
    if (!confirm(`Are you sure you want to RESET the clock-out for ${log.staffName}? This will mark them as "In Progress" again.`)) return;
    
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
      await supabase.from(DB_TABLES.AUDIT_LOGS).insert({
        [DB_COLUMNS.BRANCH_ID]: log.branchId,
        [DB_COLUMNS.ACTIVITY_TYPE]: 'UPDATE',
        [DB_COLUMNS.ENTITY_TYPE]: 'ATTENDANCE',
        [DB_COLUMNS.ENTITY_ID]: log.id,
        [DB_COLUMNS.DESCRIPTION]: `SuperAdmin RESET clock-out for ${log.staffName}`,
        [DB_COLUMNS.PERFORMER_NAME]: 'SYSTEM ADMIN'
      });

      playSound('success');
      onRefresh?.();
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
      doc.text(`DATE FILTER: ${dateFilter || 'ALL TIME'}`, 14, 28);
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

      doc.save(`Attendance_Logs_${dateFilter || 'All'}_${selectedBranchLabel.replace(/\s+/g, '_')}.pdf`);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-300 space-y-6">
      {/* Header & Filters */}
      <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm space-y-5">
        {/* Title row + Export button */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-inner shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-[14px] font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">Attendance Logs</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global Staff Clock-in Registry</p>
            </div>
          </div>
          <button
            onClick={handleExportPDF}
            disabled={isExporting || filteredAttendance.length === 0}
            className={`hidden md:flex h-10 items-center gap-2 px-5 rounded-2xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg active:scale-95 shrink-0 ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isExporting ? (
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            )}
            {isExporting ? 'Exporting...' : 'Export PDF'}
          </button>
        </div>

        {/* Filter row — single line on desktop */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth="3" /></svg>
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search staff or branch..."
              className="w-full h-10 pl-11 pr-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-[12px] uppercase tracking-wider outline-none focus:bg-white focus:border-emerald-500 transition-all"
            />
          </div>

          {/* Date picker */}
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="date"
              value={dateFilter}
              onChange={e => { setDateFilter(e.target.value); setCurrentPage(1); playSound('click'); }}
              className="h-10 w-full sm:w-40 px-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-[11px] uppercase tracking-widest outline-none focus:border-emerald-500 transition-all"
            />
            {dateFilter && (
              <button
                onClick={() => { setDateFilter(''); setCurrentPage(1); playSound('click'); }}
                className="h-10 w-10 flex items-center justify-center bg-slate-100 text-slate-400 rounded-2xl hover:bg-rose-50 hover:text-rose-500 transition-all shrink-0"
                title="Clear date"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="3" /></svg>
              </button>
            )}
          </div>

          {/* Branch filter */}
          <BranchCheckboxDropdown
            branches={branches}
            selectedIds={selectedBranchIds}
            onChange={ids => { setSelectedBranchIds(ids); setCurrentPage(1); }}
            className="shrink-0 sm:w-48"
          />
        </div>
      </div>

      <div className="px-1 space-y-4 no-print">
        <div className="flex flex-row items-center justify-between gap-4 px-1 sm:px-2">
          <div className="flex-1 min-w-0">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={filteredAttendance.length}
              itemsPerPage={itemsPerPage}
            />
          </div>
          {/* Mobile-only export button — desktop shows it in the header */}
          <button
            onClick={handleExportPDF}
            disabled={isExporting || filteredAttendance.length === 0}
            className={`md:hidden h-12 w-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg active:scale-95 shrink-0 ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isExporting ? (
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            )}
          </button>
        </div>

        {/* Table / Mobile Cards */}
        <div className="bg-white rounded-[24px] border border-slate-200 shadow-sm overflow-hidden">
          {/* Desktop View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {/* accent col — no header */}
                  <th className="w-1 p-0" />
                  <th className="pl-5 pr-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Staff</th>
                  <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Branch</th>
                  <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                  <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Clock In</th>
                  <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Clock Out</th>
                  <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Duration</th>
                  <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="pl-4 pr-5 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginatedAttendance.length > 0 ? (
                  paginatedAttendance.map((log) => {
                    const branch    = branches.find(b => b.id === log.branchId);
                    const employee  = employees.find(e => e.id === log.employeeId);
                    const homeBranch = branches.find(b => b.id === employee?.branchId);
                    const isRelief  = homeBranch && homeBranch.id !== branch?.id;
                    const isActive  = !log.clockOut;

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
                        <td className="p-0 w-1">
                          <div className={`w-1 h-full min-h-[60px] ${accentColor} ${isActive ? 'animate-pulse' : ''}`} />
                        </td>

                        {/* Staff */}
                        <td className="pl-5 pr-4 py-4">
                          <p className="text-[12px] font-black text-slate-900 uppercase tracking-tight leading-tight">{log.staffName}</p>
                          {isRelief && (
                            <span className="inline-block mt-1 px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded text-[7px] font-black text-amber-700 uppercase tracking-widest">
                              Relief
                            </span>
                          )}
                        </td>

                        {/* Branch */}
                        <td className="px-4 py-4">
                          <p className="text-[11px] font-bold text-slate-700 uppercase tracking-tight leading-tight">
                            {(branch?.name || 'Unknown').replace('BRANCH - ', '')}
                          </p>
                        </td>

                        {/* Date */}
                        <td className="px-4 py-4">
                          <p className="text-[11px] font-bold text-slate-500 whitespace-nowrap">
                            {new Date(log.clockIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        </td>

                        {/* Clock In */}
                        <td className="px-4 py-4">
                          <p className="text-[13px] font-black text-emerald-600 tabular-nums tracking-tight">
                            {new Date(log.clockIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </td>

                        {/* Clock Out */}
                        <td className="px-4 py-4">
                          {log.clockOut ? (
                            <p className="text-[13px] font-black text-rose-500 tabular-nums tracking-tight">
                              {new Date(log.clockOut).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          ) : (
                            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest animate-pulse">Active</span>
                          )}
                        </td>

                        {/* Duration */}
                        <td className="px-4 py-4">
                          {durationHrs !== null ? (
                            <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black tabular-nums">
                              {durationHrs}h {durationMins}m
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">—</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-4">
                          <span className={`px-2.5 py-1 rounded-full border text-[8px] font-black uppercase tracking-widest ${statusBadge}`}>
                            {isActive ? 'Active' : log.status}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="pl-4 pr-5 py-4">
                          <div className="flex items-center justify-end gap-1.5">
                            {log.clockOut && isToday(log.date) && (
                              <button
                                onClick={() => handleResetClockOut(log)}
                                disabled={isResetting === log.id}
                                title="Reset clock-out"
                                className="h-8 px-3 flex items-center gap-1.5 bg-slate-100 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all active:scale-95"
                              >
                                {isResetting === log.id ? (
                                  <div className="w-3 h-3 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
                                ) : (
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                )}
                                Reset
                              </button>
                            )}
                            <button
                              onClick={() => { playSound('delete'); setDeleteConfirmLog(log); }}
                              title="Delete entry"
                              className="h-8 w-8 flex items-center justify-center bg-rose-50 hover:bg-rose-500 text-rose-400 hover:text-white rounded-lg transition-all active:scale-95"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="px-6 py-20 text-center">
                      <div className="text-4xl mb-4 opacity-20">📂</div>
                      <div className="text-[11px] font-black text-slate-300 uppercase tracking-widest">No attendance records found</div>
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
                  <div key={log.id} className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">

                    {/* ── Colour accent bar ── */}
                    <div className={`h-1 w-full ${statusStyle.bar} ${isActive ? 'animate-pulse' : ''}`} />

                    {/* ── Header: name + status ── */}
                    <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[15px] font-black text-slate-900 uppercase tracking-tight leading-tight truncate">
                          {log.staffName}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
                            {branch?.name?.replace('BRANCH - ', '') || 'Unknown'}
                          </p>
                          <span className="text-slate-200">·</span>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            {new Date(log.clockIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        </div>
                        {isRelief && (
                          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-full text-[8px] font-black text-amber-700 uppercase tracking-widest">
                            Relief · Home: {homeBranch.name.replace('BRANCH - ', '')}
                          </span>
                        )}
                      </div>
                      <span className={`shrink-0 px-2.5 py-1 rounded-full border text-[8px] font-black uppercase tracking-widest ${statusStyle.badge}`}>
                        {isActive ? 'Active' : log.status}
                      </span>
                    </div>

                    {/* ── Time block ── */}
                    <div className="mx-4 mb-3 bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
                      <div className="grid grid-cols-2 divide-x divide-slate-100">
                        {/* Clock In */}
                        <div className="px-4 py-3">
                          <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mb-1 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                            Clock In
                          </p>
                          <p className="text-[20px] font-black text-slate-900 tabular-nums leading-none tracking-tighter">
                            {new Date(log.clockIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                          </p>
                        </div>
                        {/* Clock Out */}
                        <div className="px-4 py-3">
                          <p className={`text-[8px] font-black uppercase tracking-widest mb-1 flex items-center gap-1 ${isActive ? 'text-slate-300' : 'text-rose-500'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full inline-block ${isActive ? 'bg-slate-300 animate-pulse' : 'bg-rose-500'}`} />
                            Clock Out
                          </p>
                          {log.clockOut ? (
                            <p className="text-[20px] font-black text-slate-900 tabular-nums leading-none tracking-tighter">
                              {new Date(log.clockOut).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                            </p>
                          ) : (
                            <p className="text-[13px] font-black text-slate-300 leading-none tracking-tight italic">
                              In Progress…
                            </p>
                          )}
                        </div>
                      </div>
                      {/* Duration footer */}
                      <div className={`border-t border-slate-100 px-4 py-2 flex items-center justify-center ${isActive ? 'bg-emerald-50/40' : ''}`}>
                        {durationHrs !== null ? (
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            Duration: {durationHrs}h {durationMins}m
                          </p>
                        ) : (
                          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest animate-pulse">
                            Shift ongoing
                          </p>
                        )}
                      </div>
                    </div>

                    {/* ── Actions ── */}
                    <div className="px-4 pb-4 flex items-center gap-2">
                      {log.clockOut && isToday(log.date) && (
                        <button
                          onClick={() => handleResetClockOut(log)}
                          disabled={isResetting === log.id}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-100 hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95"
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
                        className={`flex items-center justify-center gap-1.5 py-2.5 px-4 bg-rose-50 hover:bg-rose-500 text-rose-500 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 ${!log.clockOut || !isToday(log.date) ? 'flex-1' : ''}`}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-20 text-center bg-white rounded-[24px] border border-slate-100">
                <div className="text-4xl mb-3 opacity-30">📂</div>
                <div className="text-[11px] font-black text-slate-300 uppercase tracking-widest">No records found</div>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Delete Confirmation Modal */}
      {deleteConfirmLog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-8 text-center space-y-5">
              <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter">Delete Entry?</h3>
                <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
                  This will permanently remove the clock-in record for
                </p>
                <p className="text-[13px] font-black text-slate-900 uppercase tracking-tight">
                  {deleteConfirmLog.staffName}
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
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
                  className="py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteEntry}
                  disabled={isDeleting}
                  className="py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-rose-600 text-white hover:bg-rose-700 shadow-lg shadow-rose-100 transition-all active:scale-95 flex items-center justify-center gap-2"
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
