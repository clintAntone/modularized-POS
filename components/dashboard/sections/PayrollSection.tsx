import React, { useState, useMemo, useEffect } from 'react';
import { Branch, Transaction, Attendance, Employee, SalesReport } from '../../../types';
import { useBranchData } from '../hooks/useBranchData';
import { playSound } from '../../../lib/audio';
import { getInitials, resolveEmployeeName } from '../../../lib/payroll';
import { PayslipModal } from './payroll/PayslipModal';
import { UI_THEME } from '../../../constants/ui_designs';
import { supabase } from '../../../lib/supabase';

interface PayrollSectionProps {
  branch: Branch;
  transactions: Transaction[];
  expenses: any[];
  attendance: Attendance[];
  employees: Employee[];
  salesReports: SalesReport[];
  onRefresh?: () => void;
}

interface TherapistSummary {
  employeeId: string;
  name: string;
  count: number;
  totalCommission: number;
  allowance: number;
  ot: number;
  late: number;
  advance: number;
}

export const PayrollSection: React.FC<PayrollSectionProps> = ({ branch, transactions, expenses, attendance, employees, salesReports, onRefresh }) => {
  const [selectedCycleId, setSelectedCycleId] = useState<number | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [selectedStaffPayslip, setSelectedStaffPayslip] = useState<any | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>('all');
  const [showYearDropdown, setShowYearDropdown] = useState(false);
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [settlementStatuses, setSettlementStatuses] = useState<Record<string, string>>({});
  const [isUpdatingSettlement, setIsUpdatingSettlement] = useState(false);

  const months = [
    { value: 0, label: 'January' },
    { value: 1, label: 'February' },
    { value: 2, label: 'March' },
    { value: 3, label: 'April' },
    { value: 4, label: 'May' },
    { value: 5, label: 'June' },
    { value: 6, label: 'July' },
    { value: 7, label: 'August' },
    { value: 8, label: 'September' },
    { value: 9, label: 'October' },
    { value: 10, label: 'November' },
    { value: 11, label: 'December' },
  ];

  const { yearlyCycles } = useBranchData(branch, transactions, expenses);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    yearlyCycles.forEach(c => {
      if (!c.isFuture) {
        years.add(new Date(c.startDate).getFullYear());
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [yearlyCycles]);

  useEffect(() => {
    if (onRefresh) onRefresh();

    const fetchSettlements = async () => {
      try {
        const { data, error } = await supabase
          .from('payroll')
          .select('branch_id, settlement, status')
          .eq('branch_id', branch.id);

        if (!error && data) {
          const statuses: Record<string, string> = {};
          data.forEach(item => {
            const key = `settlement_${branch.id}_${item.settlement}`;
            statuses[key] = item.status;
          });
          setSettlementStatuses(statuses);
        }
      } catch (err) {
        console.error('Failed to fetch settlements:', err);
      }
    };

    fetchSettlements();

    // Cache logo for immediate favicon sync on next load
    if (branch.id && transactions.length > 0) {
        const logo = document.querySelector('link[rel="icon"]')?.getAttribute('href');
        if (logo && logo.startsWith('http')) {
            localStorage.setItem('hilot_system_logo', logo);
        }
    }

    // Autorefresh every 30 seconds to keep ledger data current
    const interval = setInterval(() => {
      onRefresh?.();
      fetchSettlements();
    }, 30000);

    return () => clearInterval(interval);
  }, [onRefresh, branch.id]);

  const handleToggleSettlement = async (cycle: any) => {
    if (isUpdatingSettlement) return;
    setIsUpdatingSettlement(true);
    playSound('click');

    const startDateStr = getLocalDateStr(new Date(cycle.startDate));
    const key = `settlement_${branch.id}_${startDateStr}`;
    const currentStatus = settlementStatuses[key] || 'open';
    const nextStatus = currentStatus === 'settled' ? 'open' : 'settled';

    // Prepare data to save if settling
    const totalPayout = calculateCycleTotalPay(cycle);
    const staffSummary = staffCycleSummary;
    const dailyRecords = groupedCycleData;
    const metadata = {
      cycle_id: cycle.id,
      start_date: cycle.start,
      end_date: cycle.end,
      branch_name: branch.name,
      settled_at: new Date().toISOString()
    };

    try {
      // Manual upsert: Check if record exists first to avoid "ON CONFLICT" errors if constraint is missing
      const { data: existing } = await supabase
        .from('payroll')
        .select('id')
        .eq('branch_id', branch.id)
        .eq('settlement', startDateStr)
        .maybeSingle();

      let error;
      const payload = {
        branch_id: branch.id,
        settlement: startDateStr,
        status: nextStatus,
        total_payout: totalPayout,
        staff_summary: staffSummary,
        daily_records: dailyRecords,
        metadata: metadata
      };

      if (existing) {
        const { error: updateError } = await supabase
          .from('payroll')
          .update(payload)
          .eq('id', existing.id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from('payroll')
          .insert(payload);
        error = insertError;
      }

      if (error) throw error;

      setSettlementStatuses(prev => ({ ...prev, [key]: nextStatus }));
      playSound('success');
    } catch (err) {
      console.error('Failed to update settlement:', err);
      playSound('warning');
    } finally {
      setIsUpdatingSettlement(false);
    }
  };

  const selectedCycle = yearlyCycles.find(c => c.id === selectedCycleId);

  const getLocalDateStr = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const calculateCycleTotalPay = (cycle: any) => {
    if (!cycle) return 0;
    const cycleStart = new Date(cycle.startDate);
    const cycleEnd = new Date(cycle.endDate);
    let totalNetPayout = 0;
    let iter = new Date(cycleStart);
    iter.setHours(0, 0, 0, 0);
    const normalizedEnd = new Date(cycleEnd);
    normalizedEnd.setHours(23, 59, 59, 999);
    while (iter <= normalizedEnd) {
      const dateStr = getLocalDateStr(iter);
      const report = salesReports.find(r => r.branchId === branch.id && r.reportDate === dateStr);
      if (report && report.staffBreakdown) {
        report.staffBreakdown.forEach((s: any) => {
          // Skip relievers — they are paid by their home branch.
          // Exception: this branch's designated manager/tempManager are always included.
          const staffDisplayName = (s.staffName || s.name || '').trim().toUpperCase();
          const isThisBranchManager =
            branch.manager?.toUpperCase() === staffDisplayName ||
            branch.tempManager?.toUpperCase() === staffDisplayName;
          if (!isThisBranchManager) {
            const emp = employees.find((e: Employee) => e.id === s.employeeId);
            const isCrossBranch = s.isReliever === true || (emp && emp.branchId !== branch.id);
            if (isCrossBranch && !(emp && emp.branchId === branch.id)) return;
          }

          const comm = Number(s.commission) || 0;
          const allw = Number(s.allowance) || 0;
          const att = s.attendance;
          const ot = Number(att?.otPay || att?.ot_pay || 0);
          const late = Number(att?.lateDeduction || att?.late_deduction || 0);
          const adv = Number(att?.cashAdvance || att?.cash_advance || 0);
          totalNetPayout += (comm + allw + ot - late) - adv;
        });
      }
      iter.setDate(iter.getDate() + 1);
    }
    return totalNetPayout;
  };

  // Helper: apply the reliever filter consistently across both memos.
  // Excluded if: the employee is cross-branch AND is not this branch's manager/tempManager
  // AND has no branchAllowances entry here (which would mean they were legitimately configured
  // for this branch, e.g. mid-cycle transfer).
  // Uses live employee data as fallback for old records where isReliever may not have been
  // set correctly (e.g. cross-branch managers saved before the branch-specific manager fix).
  const isRelieverExcluded = (s: any) => {
    const displayName = (s.staffName || s.name || '').trim().toUpperCase();
    // Always keep this branch's designated manager and temp manager
    const isThisBranchManager =
      branch.manager?.toUpperCase() === displayName ||
      branch.tempManager?.toUpperCase() === displayName;
    if (isThisBranchManager) return false;

    const emp = employees.find((e: Employee) => e.id === s.employeeId);

    // Determine if cross-branch: trust the stored flag first, fall back to live employee data
    const isCrossBranch = s.isReliever === true || (emp && emp.branchId !== branch.id);
    if (!isCrossBranch) return false;

    // Exception: employee was transferred to this branch mid-cycle — their branchId now
    // matches but old records still carry isReliever: true. Keep them in payroll.
    if (emp && emp.branchId === branch.id) return false;

    return true;
  };

  // salesReports for this branch within the selected cycle — single shared filter.
  const cycleReports = useMemo(() => {
    if (!selectedCycle) return [];
    // startDate/endDate are Date objects from useBranchData; convert to YYYY-MM-DD strings
    // so the comparison against r.reportDate (which is a string) works correctly.
    const cycleStartStr = getLocalDateStr(new Date(selectedCycle.startDate));
    const cycleEndStr = getLocalDateStr(new Date(selectedCycle.endDate));
    return salesReports.filter(r =>
      r.branchId === branch.id &&
      r.reportDate >= cycleStartStr &&
      r.reportDate <= cycleEndStr &&
      Array.isArray(r.staffBreakdown) &&
      r.staffBreakdown.length > 0
    );
  }, [selectedCycle, branch.id, salesReports]);

  // Daily paid records: one entry per date, built directly from staffBreakdown.
  // Each staff entry carries attendance metadata so staffCycleSummary can derive from this
  // without re-reading cycleReports, guaranteeing weekly totals == sum of daily records.
  const groupedCycleData = useMemo(() => {
    return cycleReports.map(report => {
      const dateKey = report.reportDate;
      const staffMap: Record<string, any> = {};

      report.staffBreakdown.forEach((s: any) => {
        const empId = s.employeeId;
        if (!empId || isRelieverExcluded(s)) return;

        const att = s.attendance;
        const count = Number(s.count) || 0;
        const comm = Number(s.commission) || 0;
        const allw = Number(s.allowance) || 0;
        const ot = Number(att?.otPay || att?.ot_pay || 0);
        const late = Number(att?.lateDeduction || att?.late_deduction || 0);
        const adv = Number(att?.cashAdvance || att?.cash_advance || 0);
        const isPaidDaily = !!(att?.isPaidDaily || att?.is_paid_daily);
        const settledUnits = Number(att?.settledUnits || att?.settled_units || 0);
        const isDaySettled = isPaidDaily && count > 0 && count === settledUnits;

        const breakdownName = (s.staffName || s.name || '').trim();
        const resolvedName = (breakdownName && breakdownName.toUpperCase() !== 'UNKNOWN STAFF')
          ? breakdownName.toUpperCase()
          : resolveEmployeeName(empId, employees, attendance, transactions, salesReports, breakdownName).toUpperCase();

        staffMap[empId] = {
          employeeId: empId,
          name: resolvedName,
          count, totalCommission: comm, allowance: allw, ot, late, advance: adv,
          isPaidDaily, isDaySettled,
        };
      });

      const staffList = Object.values(staffMap).sort(
        (a, b) => ((b.totalCommission + b.allowance + b.ot - b.late) - b.advance) -
                  ((a.totalCommission + a.allowance + a.ot - a.late) - a.advance)
      );
      return {
        date: dateKey,
        staff: staffList,
        dailyTotal: staffList.reduce((sum, s) => sum + (s.totalCommission + s.allowance + s.ot - s.late) - s.advance, 0),
      };
    })
    .filter(g => g.staff.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  }, [cycleReports, employees]);

  // Personnel Weekly Totals:
  // Step 1 — collect every unique employee that appears in Daily Paid Records.
  // Step 2 — for each employee, walk every day in the daily records.
  // Step 3 — if they have a record that day, add it to their summary.
  const staffCycleSummary = useMemo(() => {
    if (!selectedCycle) return [];

    // Step 1: unique employees listed in daily paid records
    const employeeMap: Record<string, { name: string; employeeId: string }> = {};
    groupedCycleData.forEach(({ staff }) => {
      staff.forEach((s: any) => {
        if (s.employeeId && !employeeMap[s.employeeId]) {
          employeeMap[s.employeeId] = { name: s.name, employeeId: s.employeeId };
        }
      });
    });

    // Step 2 & 3: for each employee, find their record on each day
    return Object.values(employeeMap).map(({ name, employeeId: empId }) => {
      let sessions = 0, commission = 0, allowance = 0, ot = 0, late = 0, advance = 0;
      let isPaidDaily = false;
      let isAllDaysSettled: boolean | undefined = undefined;
      const dailyBreakdown: any[] = [];

      groupedCycleData.forEach(({ date: dateKey, staff }) => {
        const dayRecord = staff.find((s: any) => s.employeeId === empId);
        if (!dayRecord) return; // no record for this employee on this day

        sessions += dayRecord.count;
        commission += dayRecord.totalCommission;
        allowance += dayRecord.allowance;
        ot += dayRecord.ot;
        late += dayRecord.late;
        advance += dayRecord.advance;

        if (dayRecord.isPaidDaily) {
          isPaidDaily = true;
          if (isAllDaysSettled === undefined) isAllDaysSettled = true;
          if (!dayRecord.isDaySettled) isAllDaysSettled = false;
        }

        dailyBreakdown.push({
          date: dateKey,
          commission: dayRecord.totalCommission,
          allowance: dayRecord.allowance,
          ot: dayRecord.ot,
          late: dayRecord.late,
          advance: dayRecord.advance,
          isPaidDaily: dayRecord.isPaidDaily,
          isDaySettled: dayRecord.isDaySettled,
          net: (dayRecord.totalCommission + dayRecord.allowance + dayRecord.ot - dayRecord.late) - dayRecord.advance,
        });
      });

      const netPay = (commission + allowance + ot - late) - advance;
      const emp = employees.find((e: Employee) => e.id === empId);
      const formattedEmpId = emp?.timestamp
        ? (() => {
            const d = new Date(emp.timestamp);
            return `EMP-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}-${emp.id}`.toUpperCase();
          })()
        : undefined;

      return {
        name, employeeId: empId, formattedEmpId,
        sessions, commission, allowance, ot, late, advance, netPay,
        branchName: branch.name,
        period: `${selectedCycle.start} - ${selectedCycle.end}`,
        isPaidDaily,
        isAllDaysSettled,
        dailyBreakdown,
        isSettled: isPaidDaily ? (isAllDaysSettled === true && sessions > 0) : false,
      };
    }).sort((a, b) => b.netPay - a.netPay);
  }, [selectedCycle, groupedCycleData, branch.name, employees]);

  const toggleExpand = (date: string, empId: string) => {
    playSound('click');
    const id = `${date}-${empId}`;
    setExpandedGroupId(expandedGroupId === id ? null : id);
  };

  const filteredCycles = useMemo(() => {
    return yearlyCycles.filter(c => {
      if (c.isFuture) return false;
      const d = new Date(c.startDate);
      const yearMatch = d.getFullYear() === selectedYear;
      const monthMatch = selectedMonth === 'all' || d.getMonth() === selectedMonth;
      return yearMatch && monthMatch;
    }).reverse();
  }, [yearlyCycles, selectedYear, selectedMonth]);

  const handleExportCyclePDF = async () => {
    if (!selectedCycle) return;
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF();

      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42);
      doc.text(`WEEK ${selectedCycle.id} PAYROLL AUDIT`, 14, 22);

      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text(`Period: ${selectedCycle.start} - ${selectedCycle.end}`, 14, 28);
      doc.text(`Branch: ${branch.name}`, 14, 34);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 40);

      const totalPayout = groupedCycleData.reduce((sum, g) => sum + g.dailyTotal, 0);
      doc.setFontSize(14);
      doc.setTextColor(16, 185, 129);
      doc.text(`TOTAL AGGREGATED PAYOUT: P${totalPayout.toLocaleString()}`, 14, 52);

      // Staff Summary Table
      const staffData = staffCycleSummary.map((s: any) => [
        s.name.toUpperCase(),
        s.sessions,
        `P${s.commission.toLocaleString()}`,
        `P${s.allowance.toLocaleString()}`,
        `P${s.ot.toLocaleString()}`,
        `P${s.late.toLocaleString()}`,
        `P${s.advance.toLocaleString()}`,
        `P${s.netPay.toLocaleString()}`
      ]);

      autoTable(doc, {
        startY: 60,
        head: [['Staff Name', 'Sess.', 'Comm.', 'Allw.', 'OT', 'Late', 'Cash Adv.', 'Net Pay']],
        body: staffData,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], fontSize: 9 },
        styles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 45 },
          7: { fontStyle: 'bold', halign: 'right' }
        }
      });

      doc.save(`Payroll_Audit_Week_${selectedCycle.id}_${branch.name.replace(/\s+/g, '_')}.pdf`);
      playSound('success');
    } catch (err) {
      console.error('Cycle PDF Export Failed:', err);
      playSound('warning');
    }
  };

  if (selectedCycle) {
    const totalPayout = groupedCycleData.reduce((sum, g) => sum + g.dailyTotal, 0);
    const cycleStartDateStr = getLocalDateStr(new Date(selectedCycle.startDate));
    const settlementKey = `settlement_${branch.id}_${cycleStartDateStr}`;
    const isSettled = settlementStatuses[settlementKey] === 'settled';

    const cycleEndDay = new Date(selectedCycle.endDate);
    cycleEndDay.setHours(23, 59, 59, 999);
    const isCycleComplete = new Date() > cycleEndDay;

    return (
        <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-32 px-2 sm:px-4">
          {selectedStaffPayslip && (
              <PayslipModal
                  data={selectedStaffPayslip}
                  onClose={() => setSelectedStaffPayslip(null)}
              />
          )}

          <div className="flex items-center justify-between gap-3 no-print">
            <button
              onClick={() => { setSelectedCycleId(null); setExpandedGroupId(null); playSound('click'); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all shadow-sm group active:scale-95"
            >
              <svg className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" /></svg>
              <span className="text-[10px] font-bold uppercase tracking-widest">Cycles</span>
            </button>

            <div className="flex items-center gap-2">
              {isCycleComplete && (
                <button
                    onClick={() => handleToggleSettlement(selectedCycle)}
                    disabled={isUpdatingSettlement}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all shadow-sm border active:scale-95 ${
                      isSettled
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                        : 'bg-slate-900 border-slate-900 text-white hover:bg-slate-800'
                    }`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${isSettled ? 'bg-emerald-500 animate-pulse' : 'bg-white/50'}`}></div>
                  <span className="text-[10px] font-bold uppercase tracking-widest">
                    {isUpdatingSettlement ? '...' : (isSettled ? 'Settled' : 'Settle')}
                  </span>
                </button>
              )}

              <button
                  onClick={() => handleExportCyclePDF()}
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all shadow-sm active:scale-95"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeWidth="2.5" /></svg>
                <span className="text-[10px] font-bold uppercase tracking-widest">Save PDF</span>
              </button>
            </div>
          </div>

          {/* Header strip */}
          <div className="relative bg-[#0F172A] rounded-3xl px-8 md:px-10 py-8 overflow-hidden">
            <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-emerald-500/5 pointer-events-none" />
            <div className="absolute -bottom-8 right-24 w-32 h-32 rounded-full bg-emerald-500/5 pointer-events-none" />
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                </div>
                <div>
                  <p className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.3em]">Payroll Audit · Week {selectedCycle.id}</p>
                  <h2 className="text-xl font-black text-white uppercase tracking-tighter leading-tight mt-0.5">{selectedCycle.start} — {selectedCycle.end}</h2>
                </div>
              </div>
              <div className="flex items-center gap-8 border-t sm:border-t-0 sm:border-l border-white/5 pt-4 sm:pt-0 sm:pl-8 ml-[60px] sm:ml-0">
                <div>
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Headcount</p>
                  <p className="text-2xl font-black text-white tabular-nums">{staffCycleSummary.length}</p>
                </div>
                <div>
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Net Payout</p>
                  <p className="text-2xl font-black text-emerald-400 tabular-nums">₱{totalPayout.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Payslip table */}
          {staffCycleSummary.length > 0 ? (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              {/* Column headers — Employee ID hidden on mobile */}
              <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[160px_1fr_120px] items-center px-4 sm:px-6 py-3 border-b border-slate-100 bg-slate-50">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest hidden sm:block">Employee ID</p>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Name</p>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest text-right">Salary</p>
              </div>

              {/* Rows */}
              <div className="divide-y divide-slate-50">
                {staffCycleSummary.map((s: any) => (
                  <div
                    key={s.employeeId || s.name}
                    onClick={() => { playSound('click'); setSelectedStaffPayslip({ ...s, isSettled: s.isSettled || isSettled }); }}
                    className="grid grid-cols-[1fr_auto] sm:grid-cols-[160px_1fr_120px] items-center px-4 sm:px-6 py-3.5 cursor-pointer group hover:bg-emerald-50/50 transition-colors"
                  >
                    <p className="text-[9px] font-mono font-bold text-slate-400 truncate pr-4 hidden sm:block">{s.formattedEmpId ?? '—'}</p>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-[10px] shrink-0 group-hover:bg-emerald-600 transition-colors">
                        {getInitials(s.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] sm:text-[12px] font-bold text-slate-800 uppercase truncate leading-tight">{s.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-[9px] text-slate-400">{s.sessions} session{s.sessions !== 1 ? 's' : ''}</p>
                          {(s.isSettled || isSettled) && <span className="text-[7px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full uppercase tracking-widest">Settled</span>}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-black text-slate-900 tabular-nums group-hover:text-emerald-700 transition-colors">₱{s.netPay.toLocaleString()}</p>
                      {s.advance > 0 && <p className="text-[8px] font-bold text-rose-400 tabular-nums">−₱{s.advance.toLocaleString()} adv</p>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer — total only, no count */}
              <div className="flex items-center justify-between px-4 sm:px-6 py-4 bg-slate-900">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total Payout</p>
                <p className="text-[15px] font-black text-emerald-400 tabular-nums">₱{staffCycleSummary.reduce((sum: number, s: any) => sum + s.netPay, 0).toLocaleString()}</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 gap-3 opacity-40">
              <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/></svg>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No records for this period</p>
            </div>
          )}
        </div>
    );
  }

  return (
      <div className="w-full space-y-8 no-print pb-10 px-2 sm:px-4">
        <div className={`bg-white ${UI_THEME.radius.card} border border-slate-100 p-4 sm:p-6 md:p-8 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 no-print`}>
          <div className="flex items-center gap-3 sm:gap-4 overflow-hidden">
            <div className="w-10 h-10 sm:w-14 sm:h-14 bg-slate-900 text-white rounded-2xl sm:rounded-3xl flex items-center justify-center text-xl sm:text-2xl shadow-xl border border-white/5 shrink-0">🏢</div>
            <div className="space-y-0.5 sm:space-y-1 overflow-hidden">
              <h3 className="text-lg sm:text-2xl font-bold text-slate-900 uppercase tracking-tighter leading-none truncate">Payroll Archive</h3>
              <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] sm:tracking-[0.4em] truncate">Historical Ledger Registry</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                    onClick={() => { setShowYearDropdown(!showYearDropdown); setShowMonthDropdown(false); playSound('click'); }}
                    className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm hover:border-emerald-500 transition-all min-w-[100px]"
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-900">{selectedYear}</span>
                  <svg className={`w-3 h-3 text-slate-400 transition-transform ${showYearDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                </button>
                {showYearDropdown && (
                    <>
                      <div className="fixed inset-0 z-[100]" onClick={() => setShowYearDropdown(false)}></div>
                      <div className="absolute top-full left-0 mt-2 w-32 bg-white border border-slate-100 rounded-2xl shadow-xl z-[110] overflow-hidden animate-in zoom-in-95 duration-200 p-1.5">
                        {availableYears.map(y => (
                            <button
                                key={y}
                                onClick={() => { setSelectedYear(y); setShowYearDropdown(false); playSound('click'); }}
                                className={`w-full text-left px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${selectedYear === y ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                              {y}
                            </button>
                        ))}
                      </div>
                    </>
                )}
              </div>

              <div className="relative">
                <button
                    onClick={() => { setShowMonthDropdown(!showMonthDropdown); setShowYearDropdown(false); playSound('click'); }}
                    className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm hover:border-emerald-500 transition-all min-w-[140px]"
                >
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-900">
                  {selectedMonth === 'all' ? 'All Months' : months.find(m => m.value === selectedMonth)?.label}
                </span>
                  <svg className={`w-3 h-3 text-slate-400 transition-transform ${showMonthDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                </button>
                {showMonthDropdown && (
                    <>
                      <div className="fixed inset-0 z-[100]" onClick={() => setShowMonthDropdown(false)}></div>
                      <div className="absolute top-full right-0 md:left-0 mt-2 w-48 bg-white border border-slate-100 rounded-2xl shadow-xl z-[110] overflow-hidden animate-in zoom-in-95 duration-200 p-1.5 max-h-[60vh] overflow-y-auto no-scrollbar">
                        <button
                            onClick={() => { setSelectedMonth('all'); setShowMonthDropdown(false); playSound('click'); }}
                            className={`w-full text-left px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${selectedMonth === 'all' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                        >
                          All Months
                        </button>
                        <div className="h-px bg-slate-50 my-1"></div>
                        {months.map(m => (
                            <button
                                key={m.value}
                                onClick={() => { setSelectedMonth(m.value); setShowMonthDropdown(false); playSound('click'); }}
                                className={`w-full text-left px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${selectedMonth === m.value ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                              {m.label}
                            </button>
                        ))}
                      </div>
                    </>
                )}
              </div>
            </div>
          </div>
        </div>

        {filteredCycles.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredCycles.map(cycle => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const cycleEnd = new Date(cycle.endDate);
                cycleEnd.setHours(0, 0, 0, 0);
                const isProcessed = cycleEnd < today;

                return (
                  <div key={cycle.id} onClick={() => { setSelectedCycleId(Number(cycle.id)); playSound('click'); }} className="group cursor-pointer transition-all">
                    <div className={`bg-white p-6 rounded-[32px] border shadow-sm flex flex-col justify-between h-full gap-6 group-hover:shadow-lg transition-all duration-300 relative overflow-hidden ${
                      isProcessed ? 'border-emerald-500/30 group-hover:border-emerald-500' : 'border-amber-400/40 group-hover:border-amber-400'
                    }`}>
                      <div className={`absolute top-0 right-0 w-28 h-28 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2 ${
                        isProcessed ? 'bg-emerald-500/10' : 'bg-amber-400/10'
                      }`} />

                      <div className="space-y-1.5 relative z-10">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${isProcessed ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}`} />
                            <h3 className={`font-bold text-sm uppercase tracking-tight ${isProcessed ? 'text-emerald-700' : 'text-amber-600'}`}>Week {cycle.id} Registry</h3>
                          </div>
                          <span className={`text-[7px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest ${
                            isProcessed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {isProcessed ? 'Processed' : 'In Progress'}
                          </span>
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{cycle.start} — {cycle.end}</p>
                      </div>

                      <div className="flex items-end justify-between relative z-10">
                        <div className="space-y-0.5">
                          <p className={`text-2xl font-bold tracking-tighter leading-none ${isProcessed ? 'text-emerald-700' : 'text-amber-600'}`}>₱{calculateCycleTotalPay(cycle).toLocaleString()}</p>
                          <p className="text-[8px] font-bold text-slate-300 uppercase tracking-[0.2em]">{isProcessed ? 'Paid Ledger' : 'Running Total'}</p>
                        </div>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                          isProcessed ? 'bg-emerald-600 text-white' : 'bg-amber-100 text-amber-500'
                        }`}>
                          {isProcessed ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
        ) : (
            <div className="py-32 text-center bg-white rounded-[40px] border border-dashed border-slate-200">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl grayscale opacity-50">📁</div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No records found for the selected period</p>
            </div>
        )}
      </div>
  );
};
