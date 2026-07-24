import React, { useState, useMemo, useEffect } from 'react';
import { Branch, Transaction, Attendance, Employee, SalesReport } from '../../../types';
import { useBranchData } from '../hooks/useBranchData';
import { playSound } from '../../../lib/audio';
import { getInitials, resolveEmployeeName } from '../../../lib/payroll';
import { PayslipModal } from './payroll/PayslipModal';
import { UI_THEME } from '../../../constants/ui_designs';
import { supabase } from '../../../lib/supabase';
import { getTrueISOString, getManilaYear, getManilaMonth, getTrueDate } from '../../../lib/time';
import { usePayrollReports } from '../../../hooks/usePayrollReports';

interface PayrollSectionProps {
  branch: Branch;
  transactions: Transaction[];
  expenses: any[];
  attendance: Attendance[];
  employees: Employee[];
  salesReports: SalesReport[];
  salesReportsLoading?: boolean;
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

export const PayrollSection: React.FC<PayrollSectionProps> = ({ branch, transactions, expenses, attendance, employees, salesReports, salesReportsLoading, onRefresh }) => {
  const { staffBreakdownMap } = usePayrollReports(branch.id);

  // Merge lazy-loaded staffBreakdown into the salesReports from global data.
  // salesReports from useGlobalData no longer carry staff_breakdown to reduce startup payload.
  const reportsWithBreakdown = useMemo<SalesReport[]>(() =>
    salesReports.map(r =>
      r.staffBreakdown?.length
        ? r                                                         // already populated (shouldn't happen, but guard)
        : { ...r, staffBreakdown: staffBreakdownMap[r.reportDate] ?? [] }
    ),
    [salesReports, staffBreakdownMap]
  );

  const [selectedCycleId, setSelectedCycleId] = useState<number | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [selectedStaffPayslip, setSelectedStaffPayslip] = useState<any | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(getManilaYear());
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>('all');
  const [showYearDropdown, setShowYearDropdown] = useState(false);
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [settlementStatuses, setSettlementStatuses] = useState<Record<string, string>>({});
  const [isUpdatingSettlement, setIsUpdatingSettlement] = useState(false);
  const [payrollView, setPayrollView] = useState<'weekly' | 'monthly'>('weekly');
  const [monthlyMonth, setMonthlyMonth] = useState(getManilaMonth());
  const [monthlyYear, setMonthlyYear] = useState(getManilaYear());

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
      settled_at: getTrueISOString()
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
      const report = reportsWithBreakdown.find(r => r.branchId === branch.id && r.reportDate === dateStr);
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
            const isCrossBranch = s.isReliever === true ||
              (s.isReliever !== false && emp && emp.branchId !== branch.id);
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

    // Determine if cross-branch:
    // - isReliever === true  → definitely a reliever at time of record
    // - isReliever === false → was home-branch at time of record; trust it even if employee
    //                          has since transferred to another branch (live branchId differs)
    // - isReliever undefined → old record without flag; fall back to live branchId check
    const isCrossBranch = s.isReliever === true ||
      (s.isReliever !== false && emp && emp.branchId !== branch.id);
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
    return reportsWithBreakdown.filter(r =>
      r.branchId === branch.id &&
      r.reportDate >= cycleStartStr &&
      r.reportDate <= cycleEndStr &&
      Array.isArray(r.staffBreakdown) &&
      r.staffBreakdown.length > 0
    );
  }, [selectedCycle, branch.id, reportsWithBreakdown]);

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
        const breakdownName = (s.staffName || s.name || '').trim();
        const resolvedName = (breakdownName && breakdownName.toUpperCase() !== 'UNKNOWN STAFF')
          ? breakdownName.toUpperCase()
          : resolveEmployeeName(empId, employees, attendance, transactions, reportsWithBreakdown, breakdownName).toUpperCase();

        staffMap[empId] = {
          employeeId: empId,
          name: resolvedName,
          count, totalCommission: comm, allowance: allw, ot, late, advance: adv,
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

        dailyBreakdown.push({
          date: dateKey,
          commission: dayRecord.totalCommission,
          allowance: dayRecord.allowance,
          ot: dayRecord.ot,
          late: dayRecord.late,
          advance: dayRecord.advance,
          net: (dayRecord.totalCommission + dayRecord.allowance + dayRecord.ot - dayRecord.late) - dayRecord.advance,
        });
      });

      const netPay = (commission + allowance + ot - late) - advance;
      const emp = employees.find((e: Employee) => e.id === empId);
      const formattedEmpId = emp?.timestamp
        ? (() => {
            const d = new Date(emp.timestamp);
            const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(d.getUTCDate()).padStart(2, '0');
            return `EMP-${mm}-${dd}-${emp.id}`.toUpperCase();
          })()
        : undefined;

      return {
        name, employeeId: empId, formattedEmpId,
        sessions, commission, allowance, ot, late, advance, netPay,
        branchName: branch.name,
        period: `${selectedCycle.start} - ${selectedCycle.end}`,
        dailyBreakdown,
        isSettled: false,
      };
    }).sort((a, b) => b.netPay - a.netPay);
  }, [selectedCycle, groupedCycleData, branch.name, employees]);

  const MONTHS_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const isMonthlyfuture = (m: number, y: number) => {
    const n = getTrueDate();
    return y > n.getFullYear() || (y === n.getFullYear() && m >= n.getMonth());
  };
  const prevMonthly = () => {
    playSound('click');
    if (monthlyMonth === 0) { setMonthlyMonth(11); setMonthlyYear(y => y - 1); } else setMonthlyMonth(m => m - 1);
  };
  const nextMonthly = () => {
    if (isMonthlyfuture(monthlyMonth, monthlyYear)) return;
    playSound('click');
    if (monthlyMonth === 11) { setMonthlyMonth(0); setMonthlyYear(y => y + 1); } else setMonthlyMonth(m => m + 1);
  };

  const monthlyEmployeeSummaries = useMemo(() => {
    if (payrollView !== 'monthly') return [];
    const prefix = `${monthlyYear}-${String(monthlyMonth + 1).padStart(2, '0')}`;
    const empMap: Record<string, any> = {};
    for (const report of reportsWithBreakdown) {
      if (report.branchId !== branch.id || !report.reportDate.startsWith(prefix)) continue;
      for (const s of (report.staffBreakdown ?? [])) {
        if (!s.employeeId || isRelieverExcluded(s)) continue;
        if (!empMap[s.employeeId]) {
          empMap[s.employeeId] = {
            employeeId: s.employeeId,
            name: (s.staffName || s.name || '').trim().toUpperCase(),
            commission: 0, allowance: 0, ot: 0, late: 0, advance: 0, sessions: 0, dailyBreakdown: [],
          };
        }
        const att = s.attendance ?? {};
        const commission = Number(s.commission ?? 0);
        const allowance  = Number(s.allowance ?? 0);
        const ot     = Number(att.otPay ?? att.ot_pay ?? 0);
        const late   = Number(att.lateDeduction ?? att.late_deduction ?? 0);
        const advance = Number(att.cashAdvance ?? att.cash_advance ?? 0);
        empMap[s.employeeId].commission += commission;
        empMap[s.employeeId].allowance  += allowance;
        empMap[s.employeeId].ot         += ot;
        empMap[s.employeeId].late       += late;
        empMap[s.employeeId].advance    += advance;
        empMap[s.employeeId].sessions   += Number(s.count ?? 0);
        empMap[s.employeeId].dailyBreakdown.push({
          date: report.reportDate, commission, allowance, ot, late, advance,
          net: commission + allowance + ot - late - advance,
        });
      }
    }
    return Object.values(empMap).map((data: any) => {
      const emp = employees.find(e => e.id === data.employeeId);
      const netPay = data.commission + data.allowance + data.ot - data.late - data.advance;
      const formattedEmpId = emp?.timestamp ? (() => {
        const d = new Date(emp.timestamp);
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(d.getUTCDate()).padStart(2, '0');
        return `EMP-${mm}-${dd}-${emp.id}`.toUpperCase();
      })() : undefined;
      return { ...data, netPay, formattedEmpId, branchName: branch.name };
    }).sort((a: any, b: any) => b.netPay - a.netPay);
  }, [payrollView, monthlyMonth, monthlyYear, reportsWithBreakdown, branch.id, employees]);

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
      doc.text(`Generated: ${getTrueDate().toLocaleString()}`, 14, 40);

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

  // ─── Cycle detail view ────────────────────────────────────────────────────
  if (selectedCycle) {
    const totalPayout = groupedCycleData.reduce((sum, g) => sum + g.dailyTotal, 0);
    const cycleStartDateStr = getLocalDateStr(new Date(selectedCycle.startDate));
    const settlementKey = `settlement_${branch.id}_${cycleStartDateStr}`;
    const isSettled = settlementStatuses[settlementKey] === 'settled';

    const cycleEndDay = new Date(selectedCycle.endDate);
    cycleEndDay.setHours(0, 0, 0, 0);
    const todayMidnight = getTrueDate(); todayMidnight.setHours(0, 0, 0, 0);
    const isCycleComplete = cycleEndDay < todayMidnight;

    return (
      <div className="w-full space-y-4 pb-32 px-3 sm:px-4 animate-in fade-in slide-in-from-bottom-4 duration-400">
        {selectedStaffPayslip && (
          <PayslipModal
            data={selectedStaffPayslip}
            onClose={() => setSelectedStaffPayslip(null)}
            employee={employees.find((e: Employee) => e.id === selectedStaffPayslip.employeeId) ?? null}
            salesReports={reportsWithBreakdown}
            branch={branch}
          />
        )}

        {/* Top action bar */}
        <div className="flex items-center justify-between gap-3 no-print pt-1">
          <button
            onClick={() => { setSelectedCycleId(null); setExpandedGroupId(null); setSelectedStaffPayslip(null); playSound('click'); }}
            className="flex items-center gap-2 px-4 py-3 min-h-[44px] bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm active:scale-95"
          >
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-semibold text-slate-700">All Cycles</span>
          </button>

          <div className="flex items-center gap-2">
            {isCycleComplete && (
              <button
                onClick={() => handleToggleSettlement(selectedCycle)}
                disabled={isUpdatingSettlement}
                className={`flex items-center gap-2 px-4 py-3 min-h-[44px] rounded-xl transition-all shadow-sm border active:scale-95 text-sm font-semibold ${
                  isSettled
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-slate-900 border-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${isSettled ? 'bg-emerald-500' : 'bg-white/40'}`} />
                {isUpdatingSettlement ? 'Saving…' : (isSettled ? 'Settled' : 'Mark Settled')}
              </button>
            )}

            <button
              onClick={() => handleExportCyclePDF()}
              className="flex items-center gap-2 px-4 py-3 min-h-[44px] bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all shadow-sm active:scale-95 text-sm font-semibold"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" strokeWidth="2" />
              </svg>
              <span className="hidden sm:inline">Export PDF</span>
            </button>
          </div>
        </div>

        {/* Summary card */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-emerald-600 mb-1">Week {selectedCycle.id} · Payroll</p>
              <h2 className="text-lg font-bold text-slate-900">{selectedCycle.start} — {selectedCycle.end}</h2>
            </div>
            <div className="flex items-center gap-6 sm:border-l sm:border-slate-100 sm:pl-6">
              <div>
                <p className="text-xs text-slate-400 font-medium mb-0.5">Headcount</p>
                <p className="text-2xl font-bold text-slate-900 tabular-nums">{staffCycleSummary.length}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium mb-0.5">Net Payout</p>
                <p className="text-2xl font-bold text-emerald-600 tabular-nums">₱{totalPayout.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Employee list */}
        {staffCycleSummary.length > 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
            {/* Column header */}
            <div className="hidden sm:grid sm:grid-cols-[160px_1fr_140px] items-center px-5 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
              <p className="text-xs font-semibold text-slate-400">Employee ID</p>
              <p className="text-xs font-semibold text-slate-400">Name</p>
              <p className="text-xs font-semibold text-slate-400 text-right">Net Pay</p>
            </div>

            <div className="divide-y divide-slate-50">
              {staffCycleSummary.map((s: any) => (
                <button
                  key={s.employeeId || s.name}
                  onClick={() => { playSound('click'); setSelectedStaffPayslip({ ...s, isSettled: s.isSettled || isSettled }); }}
                  className="w-full text-left grid grid-cols-[1fr_auto] sm:grid-cols-[160px_1fr_140px] items-center px-5 py-4 min-h-[64px] hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group"
                >
                  <p className="text-xs font-mono text-slate-400 truncate pr-4 hidden sm:block">{s.formattedEmpId ?? '—'}</p>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-sm shrink-0 border border-emerald-100 group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600 transition-colors">
                      {getInitials(s.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{s.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-slate-400">{s.sessions} session{s.sessions !== 1 ? 's' : ''}</p>
                        {(s.isSettled || isSettled) && (
                          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                            Settled
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums group-hover:text-emerald-600 transition-colors">
                      ₱{s.netPay.toLocaleString()}
                    </p>
                    {s.advance > 0 && (
                      <p className="text-xs text-rose-400 tabular-nums font-semibold">−₱{s.advance.toLocaleString()} adv</p>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Footer total */}
            <div className="flex items-center justify-between px-5 py-4 bg-slate-50 border-t border-slate-100">
              <p className="text-sm font-semibold text-slate-500">Total Payout</p>
              <p className="text-lg font-bold text-emerald-600 tabular-nums">
                ₱{staffCycleSummary.reduce((sum: number, s: any) => sum + s.netPay, 0).toLocaleString()}
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-slate-400">No staff records for this period</p>
            <p className="text-xs text-slate-300">Records appear once daily reports are submitted.</p>
          </div>
        )}
      </div>
    );
  }

  // ─── Cycle list view ──────────────────────────────────────────────────────
  return (
    <div className="w-full space-y-5 no-print pb-10 px-3 sm:px-4">
      {selectedStaffPayslip && (
        <PayslipModal
          data={selectedStaffPayslip}
          onClose={() => setSelectedStaffPayslip(null)}
          employee={employees.find((e: Employee) => e.id === selectedStaffPayslip.employeeId) ?? null}
          salesReports={reportsWithBreakdown}
          branch={branch}
        />
      )}

      {/* Header + filters */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm no-print">
        {/* Row 1: icon + title + view toggle */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
            <svg className="w-4.5 h-4.5 w-[18px] h-[18px] text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight">Payroll Archive</h3>
            <p className="text-[11px] text-slate-400 leading-tight mt-0.5">
              {payrollView === 'weekly' ? 'By weekly cycle' : 'Monthly per employee'}
            </p>
          </div>
          <div className="flex-1" />
          {/* Weekly / Monthly toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-700/60 rounded-lg p-0.5">
            {(['weekly', 'monthly'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => { setPayrollView(tab); setSelectedStaffPayslip(null); setSelectedCycleId(null); playSound('click'); }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  payrollView === tab
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: filter strip */}
        <div className="border-t border-slate-100 dark:border-slate-700/60 px-4 py-2 flex items-center gap-2">

          {/* Year dropdown */}
          <div className="relative">
            <button
              onClick={() => { setShowYearDropdown(!showYearDropdown); setShowMonthDropdown(false); playSound('click'); }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
            >
              <svg className="w-3.5 h-3.5 opacity-50 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {payrollView === 'weekly' ? selectedYear : monthlyYear}
              <svg className={`w-3 h-3 opacity-40 transition-transform ${showYearDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showYearDropdown && (
              <>
                <div className="fixed inset-0 z-[100]" onClick={() => setShowYearDropdown(false)} />
                <div className="absolute top-full left-0 mt-2 w-32 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl shadow-xl z-[110] p-1.5">
                  {availableYears.map(y => {
                    const activeYear = payrollView === 'weekly' ? selectedYear : monthlyYear;
                    return (
                      <button
                        key={y}
                        onClick={() => {
                          if (payrollView === 'weekly') setSelectedYear(y);
                          else setMonthlyYear(y);
                          setShowYearDropdown(false);
                          playSound('click');
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          activeYear === y ? 'bg-emerald-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        {y}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Month dropdown — weekly only */}
          {payrollView === 'weekly' && (
            <>
              <div className="w-px h-3.5 bg-slate-200 dark:bg-slate-600" />
              <div className="relative">
                <button
                  onClick={() => { setShowMonthDropdown(!showMonthDropdown); setShowYearDropdown(false); playSound('click'); }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                    selectedMonth !== 'all'
                      ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 dark:bg-emerald-500/20'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {selectedMonth === 'all' ? 'All months' : months.find(m => m.value === selectedMonth)?.label}
                  <svg className={`w-3 h-3 opacity-40 transition-transform ${showMonthDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showMonthDropdown && (
                  <>
                    <div className="fixed inset-0 z-[100]" onClick={() => setShowMonthDropdown(false)} />
                    <div className="absolute top-full left-0 mt-2 w-44 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl shadow-xl z-[110] p-1.5 max-h-[60vh] overflow-y-auto">
                      <button
                        onClick={() => { setSelectedMonth('all'); setShowMonthDropdown(false); playSound('click'); }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          selectedMonth === 'all' ? 'bg-emerald-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        All months
                      </button>
                      <div className="h-px bg-slate-100 dark:bg-slate-700 my-1" />
                      {months.map(m => (
                        <button
                          key={m.value}
                          onClick={() => { setSelectedMonth(m.value); setShowMonthDropdown(false); playSound('click'); }}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            selectedMonth === m.value ? 'bg-emerald-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Monthly view ── */}
      {payrollView === 'monthly' && (
        <div className="space-y-4">
          {/* Month navigator */}
          <div className="flex items-center gap-3">
            <button
              onClick={prevMonthly}
              className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <p className="flex-1 text-center text-base font-bold text-slate-900 dark:text-slate-100">
              {MONTHS_NAMES[monthlyMonth]}
            </p>
            <button
              onClick={nextMonthly}
              disabled={isMonthlyfuture(monthlyMonth, monthlyYear)}
              className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Employee monthly list */}
          {monthlyEmployeeSummaries.length > 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="hidden sm:grid sm:grid-cols-[160px_1fr_140px] items-center px-5 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                <p className="text-xs font-semibold text-slate-400">Employee ID</p>
                <p className="text-xs font-semibold text-slate-400">Name</p>
                <p className="text-xs font-semibold text-slate-400 text-right">Net Pay</p>
              </div>
              <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
                {monthlyEmployeeSummaries.map((s: any) => (
                  <button
                    key={s.employeeId}
                    onClick={() => {
                      playSound('click');
                      setSelectedStaffPayslip({
                        ...s, period: `${MONTHS_NAMES[monthlyMonth]} ${monthlyYear}`, isMonthly: true,
                      });
                    }}
                    className="w-full text-left grid grid-cols-[1fr_auto] sm:grid-cols-[160px_1fr_140px] items-center px-5 py-4 min-h-[64px] hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group"
                  >
                    <p className="text-xs font-mono text-slate-400 truncate pr-4 hidden sm:block">{s.formattedEmpId ?? '—'}</p>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-sm shrink-0 border border-emerald-100 group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600 transition-colors">
                        {getInitials(s.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{s.name}</p>
                        <p className="text-xs text-slate-400">{s.sessions} session{s.sessions !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums group-hover:text-emerald-600 transition-colors">
                        ₱{s.netPay.toLocaleString()}
                      </p>
                      {s.advance > 0 && (
                        <p className="text-xs text-rose-400 tabular-nums font-semibold">−₱{s.advance.toLocaleString()} adv</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between px-5 py-4 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700">
                <p className="text-sm font-semibold text-slate-500">Total Payout</p>
                <p className="text-lg font-bold text-emerald-600 tabular-nums">
                  ₱{monthlyEmployeeSummaries.reduce((sum: number, s: any) => sum + s.netPay, 0).toLocaleString()}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-100 dark:border-slate-600 flex items-center justify-center text-2xl">📁</div>
              <p className="text-sm font-semibold text-slate-500">No records for {MONTHS_NAMES[monthlyMonth]} {monthlyYear}</p>
              <p className="text-xs text-slate-400">No sales reports found for this month.</p>
            </div>
          )}
        </div>
      )}

      {/* Cycle grid — weekly only */}
      {payrollView === 'weekly' && ((salesReportsLoading || (filteredCycles.length > 0 && salesReports.length === 0)) ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-5 min-h-[120px] flex flex-col justify-between gap-4 animate-pulse">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-slate-200 dark:bg-slate-600" />
                    <div className="h-3.5 w-16 bg-slate-200 dark:bg-slate-600 rounded-md" />
                  </div>
                  <div className="h-3 w-28 bg-slate-100 dark:bg-slate-700 rounded-md" />
                </div>
                <div className="h-5 w-20 bg-slate-100 dark:bg-slate-700 rounded-full" />
              </div>
              <div className="flex items-end justify-between">
                <div className="space-y-1.5">
                  <div className="h-2.5 w-16 bg-slate-100 dark:bg-slate-700 rounded-md" />
                  <div className="h-6 w-24 bg-slate-200 dark:bg-slate-600 rounded-md" />
                </div>
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-700" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredCycles.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredCycles.map(cycle => {
            const today = getTrueDate();
            today.setHours(0, 0, 0, 0);
            const cycleEnd = new Date(cycle.endDate);
            cycleEnd.setHours(0, 0, 0, 0);
            const isProcessed = cycleEnd < today;

            return (
              <button
                key={cycle.id}
                onClick={() => { setSelectedCycleId(Number(cycle.id)); playSound('click'); }}
                className="text-left bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 transition-all active:scale-[0.99] p-5 min-h-[120px] flex flex-col justify-between gap-4 group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${isProcessed ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}`} />
                      <span className="text-sm font-bold text-slate-900">Week {cycle.id}</span>
                    </div>
                    <p className="text-xs text-slate-400 font-medium">{cycle.start} — {cycle.end}</p>
                  </div>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
                    isProcessed
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}>
                    {isProcessed ? 'Processed' : 'In Progress'}
                  </span>
                </div>

                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs text-slate-400 font-medium mb-0.5">{isProcessed ? 'Paid out' : 'Running total'}</p>
                    <p className="text-xl font-bold text-slate-900 tabular-nums group-hover:text-emerald-600 transition-colors">
                      ₱{calculateCycleTotalPay(cycle).toLocaleString()}
                    </p>
                  </div>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    isProcessed ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-500'
                  }`}>
                    {isProcessed ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-2xl">
            📁
          </div>
          <p className="text-sm font-semibold text-slate-500">No payroll records found</p>
          <p className="text-xs text-slate-400">Try a different year or month filter.</p>
        </div>
      ))}
    </div>
  );
};
