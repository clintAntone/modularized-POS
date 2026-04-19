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
        // We use a heuristic: if we have branch data, the global logo is likely loaded
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
          const empId = s.employeeId;
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

  const staffCycleSummary = useMemo(() => {
    if (!selectedCycle) return [];
    const summary: Record<string, any> = {};

    const cycleStart = new Date(selectedCycle.startDate);
    const cycleEnd = new Date(selectedCycle.endDate);
    let iter = new Date(cycleStart);
    iter.setHours(0,0,0,0);
    const normalizedEnd = new Date(cycleEnd);
    normalizedEnd.setHours(23,59,59,999);

    while (iter <= normalizedEnd) {
      const dateKey = getLocalDateStr(iter);
      const report = salesReports.find(r => r.branchId === branch.id && r.reportDate === dateKey);
      if (report && report.staffBreakdown) {
        report.staffBreakdown.forEach((s: any) => {
          const empId = s.employeeId;
          if (!empId) return;

          if (!summary[empId]) {
            // Prefer the name recorded in staff_breakdown at report time;
            // only fall back to the employees table if the breakdown name is missing.
            const breakdownName = (s.staffName || s.name || '').trim();
            const resolvedName = (breakdownName && breakdownName.toUpperCase() !== 'UNKNOWN STAFF')
              ? breakdownName.toUpperCase()
              : resolveEmployeeName(empId, employees, attendance, transactions, salesReports, breakdownName).toUpperCase();
            summary[empId] = {
              name: resolvedName,
              employeeId: empId,
              sessions: 0,
              commission: 0,
              allowance: 0,
              ot: 0,
              late: 0,
              advance: 0,
              netPay: 0,
              branchName: branch.name,
              period: `${selectedCycle.start} - ${selectedCycle.end}`,
              dailyBreakdown: []
            };
          }
          const att = s.attendance;
          const isPaidDaily = att?.isPaidDaily || att?.is_paid_daily || false;
          const settledUnits = Number(att?.settledUnits || att?.settled_units || 0);
          const currentCount = Number(s.count) || 0;
          const isDaySettled = isPaidDaily && currentCount > 0 && currentCount === settledUnits;

          const dComm = Number(s.commission) || 0;
          const dAllw = Number(s.allowance) || 0;
          const dOt = Number(att?.otPay || att?.ot_pay || 0);
          const dLate = Number(att?.lateDeduction || att?.late_deduction || 0);
          const dAdv = Number(att?.cashAdvance || att?.cash_advance || 0);

          summary[empId].sessions += currentCount;
          summary[empId].commission += dComm;
          summary[empId].allowance += dAllw;
          summary[empId].ot += dOt;
          summary[empId].late += dLate;
          summary[empId].advance += dAdv;
          
          if (isPaidDaily) {
            summary[empId].isPaidDaily = true;
            if (summary[empId].isAllDaysSettled === undefined) summary[empId].isAllDaysSettled = true;
            if (!isDaySettled) summary[empId].isAllDaysSettled = false;
          }

          summary[empId].dailyBreakdown.push({
            date: dateKey,
            commission: dComm,
            allowance: dAllw,
            ot: dOt,
            late: dLate,
            advance: dAdv,
            isPaidDaily,
            isDaySettled,
            net: (dComm + dAllw + dOt - dLate) - dAdv
          });
        });
      }
      iter.setDate(iter.getDate() + 1);
    }

    return Object.values(summary).map(s => ({
      ...s,
      netPay: (s.commission + s.allowance + s.ot - s.late) - s.advance,
      isSettled: s.isPaidDaily ? (s.isAllDaysSettled && s.sessions > 0) : false
    })).sort((a, b) => b.netPay - a.netPay);
  }, [selectedCycle, branch.id, branch.name, salesReports, employees]);

  const groupedCycleData = useMemo(() => {
    if (!selectedCycle) return [];
    const dateGroups: Record<string, Record<string, TherapistSummary>> = {};
    const cycleStart = new Date(selectedCycle.startDate);
    const cycleEnd = new Date(selectedCycle.endDate);
    let iter = new Date(cycleStart);
    iter.setHours(0, 0, 0, 0);
    const normalizedEnd = new Date(cycleEnd);
    normalizedEnd.setHours(23, 59, 59, 999);
    while (iter <= normalizedEnd) {
      const dateKey = getLocalDateStr(iter);
      const report = salesReports.find(r => r.branchId === branch.id && r.reportDate === dateKey);
      if (report && report.staffBreakdown) {
        dateGroups[dateKey] = {};
        report.staffBreakdown.forEach((s: any) => {
          const empId = s.employeeId;
          if (!empId) return;

          const att = s.attendance;
          const ot = Number(att?.otPay || att?.ot_pay || 0);
          const late = Number(att?.lateDeduction || att?.late_deduction || 0);
          const adv = Number(att?.cashAdvance || att?.cash_advance || 0);
          // Prefer the name recorded in staff_breakdown at report time
          const breakdownName = (s.staffName || s.name || '').trim();
          const resolvedName = (breakdownName && breakdownName.toUpperCase() !== 'UNKNOWN STAFF')
            ? breakdownName.toUpperCase()
            : resolveEmployeeName(empId, employees, attendance, transactions, salesReports, breakdownName).toUpperCase();
          dateGroups[dateKey][empId] = {
            name: resolvedName,
            count: Number(s.count) || 0,
            totalCommission: Number(s.commission) || 0,
            allowance: Number(s.allowance) || 0,
            ot, late, advance: adv
          };
        });
      }
      iter.setDate(iter.getDate() + 1);
    }
    return Object.entries(dateGroups)
        .map(([date, staffMap]) => ({
          date,
          staff: Object.values(staffMap).sort((a, b) => ((b.totalCommission + b.allowance + b.ot - b.late) - b.advance) - ((a.totalCommission + a.allowance + a.ot - a.late) - a.advance)),
          dailyTotal: Object.values(staffMap).reduce((sum, s) => sum + (s.totalCommission + s.allowance + s.ot - s.late) - s.advance, 0)
        }))
        .filter(group => group.staff.length > 0)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [selectedCycle, branch.id, salesReports, employees]);

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
        `P${(s.late + s.advance).toLocaleString()}`,
        `P${s.netPay.toLocaleString()}`
      ]);
      
      autoTable(doc, {
        startY: 60,
        head: [['Staff Name', 'Sess.', 'Comm.', 'Allw.', 'OT', 'Ded.', 'Net Pay']],
        body: staffData,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], fontSize: 9 },
        styles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 50 },
          6: { fontStyle: 'bold', halign: 'right' }
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

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 no-print">
            <button 
              onClick={() => { setSelectedCycleId(null); setExpandedGroupId(null); playSound('click'); }} 
              className="flex items-center justify-center sm:justify-start gap-3 px-6 py-4 sm:py-2.5 bg-white border border-slate-200 rounded-2xl sm:rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm group active:scale-95"
            >
              <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" /></svg>
              <span className="text-[11px] font-bold uppercase tracking-widest">Back to cycles</span>
            </button>

            <div className="grid grid-cols-2 sm:flex items-center gap-3">
              {isCycleComplete && (
                <button
                    onClick={() => handleToggleSettlement(selectedCycle)}
                    disabled={isUpdatingSettlement}
                    className={`flex items-center justify-center gap-2 px-4 py-4 sm:py-2.5 rounded-2xl sm:rounded-xl transition-all shadow-sm border active:scale-95 ${
                      isSettled
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                        : 'bg-slate-900 border-slate-900 text-white hover:bg-slate-800'
                    }`}
                >
                  <div className={`w-2 h-2 rounded-full ${isSettled ? 'bg-emerald-500 animate-pulse' : 'bg-white/50'}`}></div>
                  <span className="text-[11px] font-bold uppercase tracking-widest truncate">
                    {isUpdatingSettlement ? 'Updating...' : (isSettled ? 'Settled' : 'Settle')}
                  </span>
                </button>
              )}

              <button
                  onClick={() => handleExportCyclePDF()}
                  className="flex items-center justify-center gap-2 px-4 py-4 sm:py-2.5 bg-white border border-slate-200 text-slate-900 rounded-2xl sm:rounded-xl hover:bg-slate-50 transition-all shadow-sm active:scale-95"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeWidth="2.5" /></svg>
                <span className="text-[11px] font-bold uppercase tracking-widest">Save PDF</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-8 md:p-12 bg-[#0F172A] text-white relative overflow-hidden">
              <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-8">
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold uppercase tracking-tighter leading-none">Week {selectedCycle.id} Audit</h2>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest opacity-80">{selectedCycle.start} — {selectedCycle.end}</p>
                </div>
                <div className="text-left md:text-right border-t md:border-t-0 md:border-l border-white/5 pt-3 md:pt-0 md:pl-10">
                  <p className="text-5xl md:text-6xl font-bold text-emerald-400 tracking-tighter leading-none">₱{totalPayout.toLocaleString()}</p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-2">Aggregated Net Payout</p>
                </div>
              </div>
            </div>

            <div className="p-5 md:p-10 space-y-10">
              <div className="space-y-4">
                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-4">Personnel Weekly Totals</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {staffCycleSummary.map((s: any) => (
                      <div key={s.employeeId || s.name} className="bg-slate-50 p-5 rounded-[28px] border border-slate-100 flex items-center justify-between group hover:bg-white hover:border-emerald-500 transition-all duration-300 shadow-sm">
                        <div className="flex items-center gap-4 overflow-hidden">
                          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-sm shrink-0">{getInitials(s.name)}</div>
                          <div className="overflow-hidden">
                            <div className="flex items-center gap-2">
                              <p className="text-[13px] font-bold text-slate-900 uppercase truncate">{s.name}</p>
                              {(s.isSettled || isSettled) && (
                                <span className="text-[7px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md uppercase tracking-widest">Settled</span>
                              )}
                            </div>
                            <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">₱{s.netPay.toLocaleString()}</p>
                          </div>
                        </div>
                        <button
                            onClick={() => { playSound('click'); setSelectedStaffPayslip({ ...s, isSettled: s.isSettled || isSettled }); }}
                            className="p-3 bg-white rounded-xl shadow-sm border border-slate-200 text-slate-400 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all group-hover:scale-105"
                            title="Generate Payslip"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </button>
                      </div>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-4">Daily Paid Records</h4>
                <div className="divide-y divide-slate-100 border border-slate-100 rounded-[32px] overflow-hidden">
                  {groupedCycleData.map((group) => (
                      <div key={group.date} className="flex flex-col bg-white">
                        <div className="px-8 py-6 flex justify-between items-center bg-slate-50/50">
                          <h4 className="text-[11px] font-bold text-slate-900 uppercase tracking-widest">{new Date(group.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</h4>
                          <span className="text-lg font-bold text-slate-900 tracking-tighter">₱{group.dailyTotal.toLocaleString()}</span>
                        </div>
                        <div className="px-4 py-2">
                          {group.staff.map((s) => {
                            const finalPay = (s.totalCommission + s.allowance + s.ot - s.late) - s.advance;
                            const empId = s.employeeId || s.name;
                            const isExpanded = expandedGroupId === `${group.date}-${empId}`;
                            
                            // Check if this specific day for this staff is settled
                            const staffSummary = staffCycleSummary.find(ss => ss.employeeId === s.employeeId);
                            const dayData = staffSummary?.dailyBreakdown?.find(d => d.date === group.date);
                            const isDaySettled = dayData?.isDaySettled || isSettled;

                            return (
                                <div key={`${group.date}-${empId}`} className={`transition-all duration-300 ${isExpanded ? 'bg-slate-50 rounded-[22px] my-3' : 'mb-1 hover:bg-emerald-50/40 rounded-xl'}`}>
                                  <button onClick={() => toggleExpand(group.date, empId)} className="w-full text-left p-4 md:px-8 flex items-center justify-between gap-4 group">
                                    <div className="flex items-center gap-4 min-w-0 flex-1">
                                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border transition-all ${isExpanded ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}><span className="text-[11px] font-bold italic">{s.count}</span></div>
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className={`text-[12px] font-bold uppercase truncate block transition-colors ${isExpanded ? 'text-emerald-700' : 'text-slate-600'}`}>{s.name}</span>
                                          {isDaySettled && (
                                            <span className="text-[7px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md uppercase tracking-widest">Settled</span>
                                          )}
                                        </div>
                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                          {s.ot > 0 && <span className="text-[7px] font-bold text-emerald-600 uppercase px-1.5 py-0.5 bg-emerald-50 rounded border border-emerald-100">OT +{s.ot}</span>}
                                          {s.late > 0 && <span className="text-[7px] font-bold text-rose-600 uppercase px-1.5 py-0.5 bg-rose-50 rounded border border-rose-100">LATE -{s.late}</span>}
                                          {s.advance > 0 && <span className="text-[7px] font-bold text-indigo-600 uppercase px-1.5 py-0.5 bg-indigo-50 rounded border border-indigo-200">ADV -{s.advance}</span>}
                                        </div>
                                      </div>
                                    </div>
                                    <p className={`text-base font-bold tracking-tighter tabular-nums ${isExpanded ? 'text-emerald-700' : 'text-slate-900'}`}>₱{finalPay.toLocaleString()}</p>
                                  </button>

                                  {isExpanded && (
                                      <div className="px-8 pb-5 pt-1 space-y-4 animate-in fade-in duration-300">
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                          <div className="space-y-0.5">
                                            <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">Base Commission</p>
                                            <p className="text-[13px] font-bold text-slate-700 tabular-nums">₱{s.totalCommission.toLocaleString()}</p>
                                          </div>
                                          <div className="space-y-0.5">
                                            <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">Daily Allowance</p>
                                            <p className="text-[13px] font-bold text-slate-700 tabular-nums">₱{s.allowance.toLocaleString()}</p>
                                          </div>
                                          <div className="space-y-0.5">
                                            <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">OT Bonus</p>
                                            <p className="text-[13px] font-bold text-emerald-600 tabular-nums">₱{s.ot.toLocaleString()}</p>
                                          </div>
                                          <div className="space-y-0.5">
                                            <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">Deductions (Late)</p>
                                            <p className="text-[13px] font-bold text-rose-500 tabular-nums">−₱{s.late.toLocaleString()}</p>
                                          </div>
                                        </div>
                                      </div>
                                  )}
                                </div>
                            );
                          })}
                        </div>
                      </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredCycles.map(cycle => {
                const cycleStartDateStr = getLocalDateStr(new Date(cycle.startDate));
                const settlementKey = `settlement_${branch.id}_${cycleStartDateStr}`;
                const isSettled = settlementStatuses[settlementKey] === 'settled';

                return (
                  <div key={cycle.id} onClick={() => { setSelectedCycleId(Number(cycle.id)); playSound('click'); }} className="group cursor-pointer transition-all">
                    <div className={`bg-white p-6 rounded-[32px] border shadow-sm flex flex-col justify-between h-full gap-6 group-hover:shadow-xl transition-all duration-500 relative overflow-hidden ${
                      isSettled ? 'border-emerald-500/30' : 'border-slate-100 group-hover:border-emerald-500'
                    }`}>
                      <div className={`absolute top-0 right-0 w-24 h-24 blur-2xl rounded-full -translate-y-1/2 translate-x-1/2 transition-colors ${
                        isSettled ? 'bg-emerald-500/10' : 'bg-emerald-500/5 group-hover:bg-emerald-500/10'
                      }`}></div>

                      <div className="space-y-1.5 relative z-10">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${isSettled ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                            <h3 className={`font-bold text-sm uppercase tracking-tight transition-colors ${isSettled ? 'text-emerald-700' : 'text-slate-900 group-hover:text-emerald-600'}`}>Week {cycle.id} Registry</h3>
                          </div>
                          {isSettled && (
                            <span className="text-[7px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full uppercase tracking-widest">Settled</span>
                          )}
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest opacity-80">{cycle.start} — {cycle.end}</p>
                      </div>

                      <div className="flex items-end justify-between relative z-10">
                        <div className="space-y-0.5">
                          <p className={`text-2xl font-bold tracking-tighter leading-none ${isSettled ? 'text-emerald-700' : 'text-emerald-600'}`}>₱{calculateCycleTotalPay(cycle).toLocaleString()}</p>
                          <p className="text-[8px] font-bold text-slate-300 uppercase tracking-[0.2em]">Paid Ledger</p>
                        </div>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                          isSettled ? 'bg-emerald-600 text-white' : 'bg-slate-50 text-slate-300 group-hover:bg-emerald-600 group-hover:text-white'
                        }`}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" /></svg>
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
