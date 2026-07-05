import React, { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Branch, Attendance, Employee, Transaction } from '../../../../types';
import { DB_TABLES, DB_COLUMNS } from '../../../../constants/db_schema';
import { supabase } from '../../../../lib/supabase';
import { playSound } from '../../../../lib/audio';
import { getTrueISOString, getTrueManilaISOString } from '../../../../lib/time';
import { getEmployeeRole, getEmployeeAllowance } from '../../../../lib/payroll';
import { syncRelieverPayouts } from '@/src/services/relieverPayoutService';

import { UI_THEME } from '../../../../constants/ui_designs';

interface StaffPerformanceProps {
  branch: Branch;
  staffSummary: Record<string, any>;
  hiddenRosterStaff: Employee[];
  handleHideStaff: (name: string) => void;
  handleRestoreStaff: (name: string) => void;
  onRefresh?: () => void;
  todayStr: string;
  transactions: Transaction[];
  employees: Employee[];
  hiddenStaffNames?: Set<string>;
}

export const StaffPerformance: React.FC<StaffPerformanceProps> = ({
                                                                    branch,
                                                                    staffSummary,
                                                                    hiddenRosterStaff,
                                                                    handleHideStaff,
                                                                    handleRestoreStaff,
                                                                    onRefresh,
                                                                    todayStr,
                                                                    transactions,
                                                                    employees,
                                                                    hiddenStaffNames
                                                                  }) => {
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null);
  const [showAddStaffSelector, setShowAddStaffSelector] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [revealedDeleteId, setRevealedDeleteId] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justLongPressed = useRef(false);

  const [attendanceForm, setAttendanceForm] = useState({
    lateDeduction: 0,
    otPay: 0,
    cashAdvance: 0,
    baseAllowance: 0,
    isHalfDay: false,
    isPaidDaily: false
  });

  // CRITICAL: Check lateness using Manila Time comparison to avoid browser timezone drift
  const isLate = (clockInStr?: string) => {
    if (!clockInStr || !branch.openingTime) return false;

    const clockInDate = new Date(clockInStr);
    const manilaClockIn = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Manila',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(clockInDate);

    const [clockH, clockM] = manilaClockIn.split(':').map(Number);
    const [openH, openM] = branch.openingTime.split(':').map(Number);

    const totalClockMins = clockH * 60 + clockM;
    const totalOpenMins = openH * 60 + openM;

    // LATE means clocking in > 10 minutes after opening hour
    return totalClockMins > (totalOpenMins + 10);
  };

  const sortedStaff = useMemo(() => {
    return Object.values(staffSummary)
        .map((staffData: any) => {
          const late = Number(staffData.attendance?.lateDeduction || 0);
          const ot = Number(staffData.attendance?.otPay || 0);
          // FIX: Advance is settled weekly, so it should NOT affect the Daily Performance display
          const finalPay = (Number(staffData.commission) || 0) + (Number(staffData.allowance) || 0) + ot - late;
          return { ...staffData, finalPay };
        })
        .sort((a, b) => (a.name || '').localeCompare(b.name || '') || (a.employeeId || '').localeCompare(b.employeeId || ''));
  }, [staffSummary]);

  const estimatedImpact = useMemo(() => {
    const baseAllowance = Number(attendanceForm.baseAllowance) || 0;
    const adjustedAllowance = attendanceForm.isHalfDay ? baseAllowance / 2 : baseAllowance;
    
    return (attendanceForm.otPay || 0) - (attendanceForm.lateDeduction || 0) + (adjustedAllowance - baseAllowance);
  }, [attendanceForm]);

  const handleUpdateAttendance = async () => {
    if (!selectedStaff || isSyncing) return;
    setIsSyncing(true);
    const summaryData = staffSummary[selectedStaff];
    const existingAtt = summaryData.attendance;

    const timestamp = getTrueManilaISOString();

    try {
      const payload: any = {
        [DB_COLUMNS.LATE_DEDUCTION]: attendanceForm.lateDeduction,
        [DB_COLUMNS.OT_PAY]: attendanceForm.otPay,
        [DB_COLUMNS.CASH_ADVANCE]: summaryData.isReliever ? 0 : attendanceForm.cashAdvance,
        [DB_COLUMNS.IS_HALF_DAY]: attendanceForm.isHalfDay,
        [DB_COLUMNS.IS_PAID_DAILY]: attendanceForm.isPaidDaily,
        [DB_COLUMNS.SETTLED_UNITS]: attendanceForm.isPaidDaily ? (staffSummary[selectedStaff]?.count || 0) : 0
      };

      if (existingAtt) {
        const { error } = await supabase.from(DB_TABLES.ATTENDANCE).update(payload).eq(DB_COLUMNS.ID, existingAtt.id);
        if (error) throw error;
      } else {
        const newId = Math.random().toString(36).substr(2, 9);
        const { error } = await supabase.from(DB_TABLES.ATTENDANCE).insert({
          [DB_COLUMNS.ID]: newId,
          [DB_COLUMNS.BRANCH_ID]: branch.id,
          [DB_COLUMNS.EMPLOYEE_ID]: summaryData.employeeId,
          [DB_COLUMNS.STAFF_NAME]: selectedStaff,
          [DB_COLUMNS.DATE]: todayStr,
          [DB_COLUMNS.CLOCK_IN]: timestamp,
          [DB_COLUMNS.STATUS]: 'REGULAR',
          ...payload
        });
        if (error) throw error;
      }

      // If it's a reliever, sync their payout to expenses immediately
      if (summaryData.isReliever) {
        await syncRelieverPayouts(branch, todayStr, employees, hiddenStaffNames);
      }

      playSound('success');
      setSelectedStaff(null);
      onRefresh?.();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSyncing(false);
    }
  };

  const startLongPress = (name: string) => {
    longPressTimer.current = setTimeout(() => {
      setRevealedDeleteId(name);
      justLongPressed.current = true;
      playSound('click');
      longPressTimer.current = null;
    }, 600);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  const selectedStaffData = selectedStaff ? staffSummary[selectedStaff] : null;
  const staffClockIn = selectedStaffData?.attendance?.clockIn;
  const staffIsCurrentlyLate = isLate(staffClockIn);

  // VALIDATION: Staff only eligible for OT if they have a session that ended AFTER closing time (Manila Time)
  const staffHasOTSession = useMemo(() => {
    if (!selectedStaff || !branch.closingTime) return false;
    const [closeH, closeM] = branch.closingTime.split(':').map(Number);
    const totalCloseMins = closeH * 60 + closeM;

    return transactions.some(t => {
      const isThisStaff = t.therapistName?.toUpperCase() === selectedStaff.toUpperCase() ||
          t.bonesetterName?.toUpperCase() === selectedStaff.toUpperCase();
      if (!isThisStaff) return false;

      const txDate = new Date(t.timestamp);
      const manilaTx = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Manila',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(txDate);

      const [txH, txM] = manilaTx.split(':').map(Number);
      const totalTxMins = txH * 60 + txM;

      return totalTxMins > totalCloseMins;
    });
  }, [selectedStaff, branch.closingTime, transactions]);

  // Rule: Must have a late session AND must not have been late clocking in
  const canAddOT = !staffIsCurrentlyLate && staffHasOTSession;

  return (
      <div className="space-y-4">
        {showAddStaffSelector && (
            <div className="fixed inset-0 z-[2000] bg-slate-950/40 backdrop-blur-md flex items-center justify-center p-4">
              <div className={`bg-white ${UI_THEME.radius.card} w-full max-w-lg shadow-2xl flex flex-col animate-in zoom-in duration-300 overflow-hidden max-h-[85vh] border border-slate-100`}>
                <div className="px-6 py-6 border-b border-slate-100 flex justify-between items-center bg-white">
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Archived Roster</h4>
                  <button onClick={() => setShowAddStaffSelector(false)} className="p-2 text-slate-300 hover:text-slate-900 transition-all"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-2 no-scrollbar">
                  {hiddenRosterStaff.length > 0 ? hiddenRosterStaff.map(emp => (
                      <button key={emp.id} onClick={() => { handleRestoreStaff(emp.name); setShowAddStaffSelector(false); }} className="w-full p-4 rounded-[20px] border border-slate-100 bg-white hover:border-emerald-500 hover:bg-emerald-50/20 transition-all flex items-center justify-between group">
                        <div className="flex items-center gap-3"><span className="font-bold text-slate-700 uppercase text-xs tracking-tight">{emp.name}</span></div>
                        <svg className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                      </button>
                  )) : (<div className="py-20 text-center font-bold uppercase text-xs">No hidden profiles</div>)}
                </div>
              </div>
            </div>
        )}

        {selectedStaff && createPortal(
            <div className="fixed inset-0 z-[2000] bg-slate-950/70 backdrop-blur-xl flex items-center justify-center p-4 overflow-y-auto no-scrollbar">
              <div className="bg-white rounded-[32px] sm:rounded-[44px] w-full max-w-xl shadow-2xl flex flex-col animate-in zoom-in duration-300 overflow-hidden my-auto max-h-[95vh] sm:max-h-[90vh] border border-slate-100">
                <div className="px-6 sm:px-8 py-4 sm:py-6 border-b border-slate-100 flex justify-between items-center bg-white">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-base sm:text-lg">
                      <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    </div>
                    <div>
                      <h4 className="text-base sm:text-lg font-bold text-slate-900 uppercase tracking-tighter leading-none">{selectedStaff}</h4>
                      <p className="text-xs sm:text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Adjustment Hub</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedStaff(null)} className="p-2 text-slate-300 hover:text-slate-900 active:scale-90 transition-colors">
                    <svg className="w-6 h-6 sm:w-8 sm:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 sm:p-10 space-y-5 sm:space-y-8 no-scrollbar">
                  <div className="space-y-4 sm:space-y-6">
                    <div className="space-y-1 sm:space-y-2">
                      <div className="flex justify-between items-center ml-1">
                        <label className="text-xs sm:text-xs font-bold text-slate-400 uppercase tracking-widest">Cash Advance (₱)</label>
                        {selectedStaffData?.isReliever ? (
                          <span className="text-xs sm:text-xs font-bold text-rose-500 bg-rose-50 px-2 py-0.5 rounded uppercase tracking-widest">Not Allowed for Relievers</span>
                        ) : (
                          <span className="text-xs sm:text-xs font-bold text-slate-300 bg-slate-50 px-2 py-0.5 rounded uppercase tracking-widest">Weekly Settlement</span>
                        )}
                      </div>
                      <div className="relative group">
                        <span className="absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 text-base sm:text-xl font-bold text-slate-300 group-focus-within:text-indigo-600">₱</span>
                        <input
                            type="number"
                            min={0}
                            disabled={selectedStaffData?.isReliever}
                            value={attendanceForm.cashAdvance || ''}
                            onChange={e => setAttendanceForm({...attendanceForm, cashAdvance: Math.max(0, Number(e.target.value))})}
                            className={`w-full p-3.5 sm:p-5 pl-9 sm:pl-12 bg-slate-50 border-2 border-transparent rounded-[18px] sm:rounded-[22px] font-bold text-base sm:text-xl text-indigo-900 outline-none focus:border-indigo-500 focus:bg-white transition-all shadow-inner tabular-nums ${selectedStaffData?.isReliever ? 'opacity-50 cursor-not-allowed' : ''}`}
                            placeholder="0"
                        />
                      </div>
                      <p className="text-xs sm:text-xs font-semibold text-slate-400 uppercase tracking-tight ml-1">
                        {selectedStaffData?.isReliever ? 'Relievers are paid daily and are ineligible for cash advances.' : 'Advances are recorded for weekly audit and do not impact today\'s performance display.'}
                      </p>
                    </div>

                    <div className="space-y-1 sm:space-y-2">
                      <div className="flex justify-between items-center ml-1">
                        <label className="text-xs sm:text-xs font-bold text-slate-400 uppercase tracking-widest">Late Deduction (₱)</label>
                        {!staffIsCurrentlyLate && (
                          <span className="text-xs sm:text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-widest">On Time</span>
                        )}
                      </div>
                      <div className="relative group">
                        <span className="absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 text-base sm:text-xl font-bold text-slate-300 group-focus-within:text-rose-600">₱</span>
                        <input
                            type="number"
                            min={0}
                            value={attendanceForm.lateDeduction || ''}
                            onChange={e => setAttendanceForm({...attendanceForm, lateDeduction: Math.max(0, Number(e.target.value))})}
                            className="w-full p-3.5 sm:p-5 pl-9 sm:pl-12 bg-slate-50 border-2 border-transparent rounded-[18px] sm:rounded-[22px] font-bold text-base sm:text-xl text-rose-600 outline-none focus:border-rose-500 focus:bg-white transition-all shadow-inner tabular-nums"
                            placeholder="0"
                        />
                      </div>
                    </div>

                    <div className="space-y-1 sm:space-y-2">
                      <div className="flex justify-between items-center ml-1">
                        <label className="text-xs sm:text-xs font-bold text-slate-400 uppercase tracking-widest">OT Pay Addition (₱)</label>
                      </div>
                      <div className="relative group">
                        <span className="absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 text-base sm:text-xl font-bold text-slate-300 group-focus-within:text-emerald-600">₱</span>
                        <input
                            type="number"
                            min={0}
                            value={attendanceForm.otPay || ''}
                            onChange={e => setAttendanceForm({...attendanceForm, otPay: Math.max(0, Number(e.target.value))})}
                            className="w-full p-3.5 sm:p-5 pl-9 sm:pl-12 bg-slate-50 border-2 border-transparent rounded-[18px] sm:rounded-[22px] font-bold text-base sm:text-xl text-emerald-600 outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner tabular-nums"
                            placeholder="0"
                        />
                      </div>
                      <div className="pt-2" />
                      <button
                          onClick={() => setAttendanceForm(prev => ({ ...prev, isHalfDay: !prev.isHalfDay }))}
                          className={`w-full px-5 py-4 sm:py-5 rounded-[18px] sm:rounded-[22px] border-2 transition-all active:scale-95 flex items-center justify-between gap-3 shadow-sm ${attendanceForm.isHalfDay ? 'bg-amber-50 border-amber-400 text-amber-700 shadow-amber-100' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:shadow-md'}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl sm:text-2xl">{attendanceForm.isHalfDay ? '🌗' : '☀️'}</span>
                          <div className="text-left">
                            <p className={`text-xs sm:text-xs font-black uppercase tracking-widest ${attendanceForm.isHalfDay ? 'text-amber-700' : 'text-slate-600'}`}>Half Day</p>
                            <p className={`text-xs font-bold uppercase tracking-widest mt-0.5 ${attendanceForm.isHalfDay ? 'text-amber-400' : 'text-slate-400'}`}>
                              {attendanceForm.isHalfDay ? 'Applied — 50% allowance' : 'Tap to apply'}
                            </p>
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${attendanceForm.isHalfDay ? 'bg-amber-500 border-amber-500' : 'bg-white border-slate-200'}`}>
                          {attendanceForm.isHalfDay && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </button>
                    </div>

                    <div className="p-4 sm:p-6 rounded-[24px] sm:rounded-[32px] border border-slate-100 flex items-center justify-between bg-slate-50/50 shadow-inner">
                      <div className="space-y-0.5 sm:space-y-1">
                        <p className="text-xs sm:text-xs font-bold text-slate-400 uppercase tracking-widest">Take-Home Impact</p>
                        <p className={`text-lg sm:text-2xl font-bold tracking-tighter leading-none ${estimatedImpact < 0 ? 'text-rose-600' : estimatedImpact > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {estimatedImpact < 0 ? '−' : estimatedImpact > 0 ? '+' : ''}₱{Math.abs(estimatedImpact).toLocaleString()}
                        </p>
                      </div>
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-sm sm:text-lg">📊</div>
                    </div>
                  </div>

                  <div className="pt-2 sm:pt-4">
                    <button
                        onClick={handleUpdateAttendance}
                        disabled={isSyncing}
                        className="w-full bg-slate-900 text-white font-bold py-4 sm:py-6 rounded-[18px] sm:rounded-[22px] uppercase tracking-[0.25em] text-xs sm:text-xs shadow-xl hover:bg-emerald-600 flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50"
                    >
                      {isSyncing ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : 'Apply Adjustment'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
        , document.body)}

        <div className="flex items-center justify-between px-4">
          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest leading-none">STAFF PERFORMANCE</h4>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-0.5">Staff allowances and commissions</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Live Audit</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 px-1" onClick={() => { if (justLongPressed.current) { justLongPressed.current = false; return; } setRevealedDeleteId(null); }}>
          {sortedStaff.map((data) => {
            const name = data.name;
            const late = Number(data.attendance?.lateDeduction || 0);
            const ot = Number(data.attendance?.otPay || 0);
            const adv = Number(data.attendance?.cashAdvance || 0);
            const finalPay = data.finalPay;

            const clockInTime = data.attendance?.clockIn;
            const isSettled = data.isPaidDaily && data.count === data.settledUnits;
            const showOTRibbon = ot > 0;

            return (
                <div
                    key={data.employeeId || name}
                    className={`${data.isReliever ? 'bg-purple-50/50 border-purple-100 shadow-sm' : 'bg-white'} p-3 sm:p-5 ${UI_THEME.radius.card} border ${data.isReliever ? 'border-purple-100' : 'border-slate-100'} flex flex-col transition-all duration-300 hover:shadow-xl ${data.isReliever ? 'hover:border-purple-300' : 'hover:border-emerald-200'} group relative overflow-hidden active:scale-[0.99] cursor-default select-none`}
                    onTouchStart={evt => { evt.preventDefault(); startLongPress(name); }}
                    onTouchEnd={cancelLongPress}
                    onTouchMove={cancelLongPress}
                    onMouseDown={() => startLongPress(name)}
                    onMouseUp={cancelLongPress}
                    onMouseLeave={cancelLongPress}
                >
                    {isSettled && (
                      <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity pointer-events-none">
                        <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                      </div>
                    )}
                    <div className="absolute top-0 left-0 right-0 flex flex-wrap gap-1 px-3 sm:px-4 pt-2 sm:pt-3 z-20 pointer-events-none">
                    {data.isReliever && (
                        <div className="bg-purple-600 text-white text-xs font-black uppercase px-2 py-1 rounded-md shadow-lg border border-purple-400">RELIEVER</div>
                    )}
                    {isSettled && (
                        <div className="bg-emerald-600 text-white text-xs font-bold uppercase px-2 py-0.5 rounded-full shadow-lg border border-emerald-400 flex items-center gap-1">
                          <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>
                          Paid
                        </div>
                    )}
                  </div>

                  {/* Long-press remove overlay */}
                  {revealedDeleteId === name && (
                    <div className="absolute inset-0 z-[60] bg-slate-900/80 backdrop-blur-sm rounded-[inherit] flex flex-col animate-in fade-in duration-150">
                      {/* Centered content */}
                      <div className="flex-1 flex flex-col items-center justify-center gap-3">
                        {data.count > 0 ? (
                          <>
                            <div className="w-14 h-14 rounded-2xl bg-slate-700 flex items-center justify-center">
                              <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
                            </div>
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest text-center px-4">Has {data.count} session{data.count !== 1 ? 's' : ''} — cannot remove</p>
                          </>
                        ) : (
                          <>
                            <button
                              onMouseDown={e => e.stopPropagation()}
                              onClick={e => { e.stopPropagation(); handleHideStaff(name); setRevealedDeleteId(null); playSound('click'); }}
                              className="w-16 h-16 rounded-2xl bg-rose-600 hover:bg-rose-500 active:scale-95 transition-all flex items-center justify-center shadow-lg"
                            >
                              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
                            </button>
                            <p className="text-xs font-black text-white uppercase tracking-widest">Remove from today</p>
                          </>
                        )}
                      </div>
                      {/* Cancel pinned to bottom */}
                      <div className="px-4 pb-4">
                        <button
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => { e.stopPropagation(); setRevealedDeleteId(null); }}
                          className="w-full py-3 rounded-2xl bg-slate-700 hover:bg-slate-600 active:scale-95 transition-all text-xs font-black text-slate-200 uppercase tracking-widest"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-3 sm:gap-6">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2 sm:gap-3 overflow-hidden min-w-0">
                        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-2xl flex items-center justify-center text-sm sm:text-lg shadow-inner shrink-0 transition-all duration-500 overflow-hidden ${data.isReliever ? 'bg-purple-50 text-purple-600' : data.attendance ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-300'}`}>
                          {data.profile ? (
                              <img
                                src={data.profile}
                                alt={name}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                                onError={e => { e.currentTarget.style.display = 'none'; }}
                              />
                          ) : (
                              data.attendance ? (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                              ) : '💤'
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-slate-900 uppercase text-xs sm:text-sm tracking-tight truncate leading-none mb-1 group-hover:text-emerald-700 transition-colors">{data.name || name}</h3>
                        </div>
                      </div>

                        <div className="text-right min-w-0 pr-1 sm:pr-2">
                          <p className={`font-bold text-slate-900 tracking-tighter leading-none tabular-nums ${
                            finalPay.toLocaleString().length > 9 ? 'text-sm sm:text-lg' : 
                            finalPay.toLocaleString().length > 7 ? 'text-base sm:text-xl' : 
                            'text-[18px] sm:text-[26px]'
                          }`}>₱{isNaN(finalPay) ? '0' : finalPay.toLocaleString()}</p>
                          <p className={`text-xs sm:text-xs font-bold uppercase tracking-widest mt-0.5 sm:mt-1 ${data.isReliever ? 'text-purple-600' : 'text-emerald-600'}`}>Take Home</p>
                        </div>
                    </div>

                    <div className="space-y-1 sm:space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs sm:text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Service Track</span>
                        <span className="text-xs sm:text-xs font-bold text-slate-900">{data.count} units</span>
                      </div>
                      <div className="flex gap-0.5 sm:gap-1 h-1 sm:h-1.5 px-0.5">
                        {Array.from({ length: 10 }).map((_, i) => (
                            <div
                                key={i}
                                className={`flex-1 rounded-full transition-all duration-700 ${i < data.count ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]' : 'bg-slate-100'}`}
                            ></div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1 sm:gap-2">
                      <div className="bg-slate-50/80 p-1.5 sm:p-3 rounded-lg sm:rounded-2xl border border-slate-100/50">
                        <p className="text-xs sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-0.5">Allowance</p>
                        <p className="text-xs sm:text-xs font-bold text-slate-600 tabular-nums">₱{data.allowance.toLocaleString()}</p>
                      </div>
                      <div className={`p-1.5 sm:p-3 rounded-lg sm:rounded-2xl border transition-all ${adv > 0 ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50/80 border-slate-100/50'}`}>
                        <p className={`text-xs sm:text-xs font-bold uppercase tracking-widest mb-0.5 ${adv > 0 ? 'text-indigo-600' : 'text-slate-400'}`}>Advances</p>
                        <p className={`text-xs sm:text-xs font-bold tabular-nums ${adv > 0 ? 'text-indigo-700' : 'text-slate-300'}`}>
                          {adv > 0 ? `−₱${adv.toLocaleString()}` : '₱0'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-0.5">
                      <div className="flex gap-1 sm:gap-1.5 flex-wrap">
                        {late > 0 && <span className="text-xs sm:text-xs font-bold uppercase px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg border bg-rose-50 text-rose-700 border-rose-100">−₱{late}</span>}
                        {ot > 0 && <span className="text-xs sm:text-xs font-bold uppercase px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg border bg-emerald-50 text-emerald-700 border-emerald-100">+₱{ot}</span>}
                        {data.attendance?.isHalfDay && <span className="text-xs sm:text-xs font-bold uppercase px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg border bg-amber-50 text-amber-700 border-amber-100">Half</span>}
                      </div>
                      <div className="flex items-center gap-1.5 no-print">
                        <button
                            onClick={() => {
                              setSelectedStaff(name);
                              setAttendanceForm({ 
                                lateDeduction: late, 
                                otPay: ot, 
                                cashAdvance: adv, 
                                baseAllowance: data.baseAllowance,
                                isHalfDay: !!data.attendance?.isHalfDay,
                                isPaidDaily: !!(data.attendance?.isPaidDaily || data.attendance?.is_paid_daily)
                              });
                            }}
                            className="w-9 h-9 sm:w-12 sm:h-12 bg-slate-900 text-white rounded-xl sm:rounded-2xl hover:bg-emerald-600 transition-all shadow-lg active:scale-90 flex items-center justify-center group-hover:scale-110 border-2 border-slate-800 hover:border-emerald-500"
                        >
                          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
            );
          })}

          <button
              onClick={() => setShowAddStaffSelector(true)}
              className={`border-2 border-dashed border-slate-200 ${UI_THEME.radius.card} p-4 flex flex-col items-center justify-center gap-2 hover:border-emerald-500 hover:bg-emerald-50/10 transition-all min-h-[120px] group active:scale-[0.98] no-print`}
          >
            <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center text-slate-300 shadow-inner transition-all duration-300 group-hover:bg-emerald-600 group-hover:text-white">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
            </div>
            <div className="text-center space-y-0.5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest group-hover:text-emerald-700">Restore Profiles</p>
              <p className="text-xs font-semibold text-slate-300 uppercase tracking-tight">Access Hidden Registry</p>
            </div>
          </button>
        </div>
      </div>
  );
};