
import React, { useState, useMemo, useEffect } from 'react';
import { Branch, SalesReport } from '../../../types';
import { UI_THEME } from '../../../constants/ui_designs';
import { playSound } from '../../../lib/audio';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Modular Imports
import { ReportFilters } from './reports-master/ReportFilters';
import { ReportTable } from './reports-master/ReportTable';
import { ReportDashboardModal } from './reports-master/ReportDashboardModal';
import { Pagination } from './common/Pagination';
import { toDateStr, getWeekRange, getReportMonth, parseDate } from '@/src/utils/reportUtils';

interface ReportsMasterProps {
  branch: Branch;
  salesReports: SalesReport[];
  branches?: Branch[];
  employees?: any[];
  canEdit?: boolean;
  canValidate?: boolean;
}

export type ReportViewType = 'daily' | 'weekly' | 'monthly';
type SortField = 'identity' | 'terminal' | 'yield' | 'payroll' | 'expenses' | 'reserve' | 'roi';
type SortOrder = 'asc' | 'desc';

// Helper to get ISO Week number
// Removed local helpers as they are now in reportUtils

export const ReportsMasterSection: React.FC<ReportsMasterProps> = ({ branch, salesReports, branches = [], employees = [], canEdit = false, canValidate = false }) => {
  const [view, setView] = useState<ReportViewType>('daily');
  const [selectedReport, setSelectedReport] = useState<SalesReport | null>(null);
  const [constituents, setConstituents] = useState<SalesReport[]>([]);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('identity');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showWeeklyBreakdown, setShowWeeklyBreakdown] = useState(false);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const [isExporting, setIsExporting] = useState(false);
  const [showPrintConfirm, setShowPrintConfirm] = useState(false);

  useEffect(() => {
    setCurrentPage(1); // Reset to first page on view/filter change
  }, [view, searchQuery, startDate, endDate]);

  useEffect(() => {
    if (selectedReport) {
      window.history.pushState({ modal: 'report-detail' }, '');
      const handlePop = () => {
        setSelectedReport(null);
        setConstituents([]);
      };
      window.addEventListener('popstate', handlePop);
      return () => window.removeEventListener('popstate', handlePop);
    }
  }, [selectedReport]);

  const handleCloseModal = () => {
    setSelectedReport(null);
    setConstituents([]);
    playSound('click');
    if (window.history.state?.modal === 'report-detail') {
      window.history.back();
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    playSound('click');
  };

  const { displayData, groupedConstituents } = useMemo(() => {
    const reports = (salesReports || []).filter(r => {
      // 1. Branch filter
      if (branch.id !== 'all' && r.branchId !== branch.id) return false;

      // 2. Cycle Start Date Filter (Always apply per-branch if available)
      const targetBranch = branches.find(b => b.id === r.branchId) || (branch.id === r.branchId ? branch : null);
      if (targetBranch?.cycleStartDate && r.reportDate < targetBranch.cycleStartDate) return false;

      const reportDate = parseDate(r.reportDate);
      if (isNaN(reportDate.getTime())) return false;

      // 3. Date Range Filter
      if (startDate && r.reportDate < startDate) return false;
      if (endDate && r.reportDate > endDate) return false;

      // 4. Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toUpperCase();
        const branchName = (branches.find(b => b.id === r.branchId)?.name || '').toUpperCase();
        
        // Exact match for branch name if it's a short word, or standard includes
        const matchesBranch = branchName === q || branchName.startsWith(q + " ") || branchName.includes(" " + q) || branchName.includes(q);
        
        const dateStr = r.reportDate.toUpperCase();
        const monthName = reportDate.toLocaleDateString(undefined, { month: 'long' }).toUpperCase();
        const yearStr = reportDate.getFullYear().toString();
        const traceId = r.id.toUpperCase();
        
        // Numeric fields for search
        const grossStr = r.grossSales.toString();
        const netStr = r.netRoi.toString();
        const payStr = r.totalStaffPay.toString();
        const expStr = r.totalExpenses.toString();

        const matchesSearch = branchName.includes(q) ||
            dateStr.includes(q) ||
            monthName.includes(q) ||
            yearStr.includes(q) ||
            traceId.includes(q) ||
            grossStr.includes(q) ||
            netStr.includes(q) ||
            payStr.includes(q) ||
            expStr.includes(q);

        if (!matchesSearch) return false;
      }

      return true;
    });

    if (view === 'daily') {
      const dailyReports = reports.map(r => ({ ...r, reportType: 'daily' as const }));
      return { displayData: dailyReports, groupedConstituents: {} };
    }

    const aggregated: Record<string, SalesReport> = {};
    const subGroups: Record<string, SalesReport[]> = {};

    reports.forEach(r => {
      const d = parseDate(r.reportDate);
      let key = "";
      let label = "";
      let sortDate = "";
      let periodEnd = "";
      let reportType: 'daily' | 'weekly' | 'monthly' = 'daily';

      if (view === 'weekly') {
        const targetBranch = branches.find(b => b.id === r.branchId) || branch;
        const { weekIndex, weekStart, weekEnd, label: weekLabel } = getWeekRange(d, targetBranch);

        const isConsolidated = branch.id === 'all' && !showWeeklyBreakdown;

        key = isConsolidated
            ? `W${weekIndex}-${weekStart.getMonth() + 1}-${weekStart.getFullYear()}`
            : `${r.branchId}-W${weekIndex}-${weekStart.getMonth() + 1}-${weekStart.getFullYear()}`;
        label = weekLabel;
        sortDate = toDateStr(weekStart);
        periodEnd = toDateStr(weekEnd);
        reportType = 'weekly';
      } else {
        const { month, year } = getReportMonth(d);

        key = branch.id === 'all'
            ? `${year}-M${month}`
            : `${r.branchId}-${year}-M${month}`;
        label = new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }).toUpperCase();
        sortDate = toDateStr(new Date(year, month - 1, 1));
        periodEnd = toDateStr(new Date(year, month, 0));
        reportType = 'monthly';
      }

      if (!aggregated[key]) {
        const isConsolidated = branch.id === 'all' && (view !== 'weekly' || !showWeeklyBreakdown);
        aggregated[key] = {
          ...r,
          id: key,
          branchId: isConsolidated ? 'all' : r.branchId,
          reportDate: label,
          reportType: reportType as any,
          sortDate: sortDate,
          periodEnd: periodEnd,
          grossSales: 0,
          totalStaffPay: 0,
          totalExpenses: 0,
          totalVaultProvision: 0,
          netRoi: 0,
          sessionData: [], staffBreakdown: [], expenseData: [], vaultData: []
        };
        subGroups[key] = [];
      }

      const target = aggregated[key];
      target.grossSales += r.grossSales;
      target.totalStaffPay += r.totalStaffPay;
      target.totalExpenses += r.totalExpenses;
      target.totalVaultProvision += r.totalVaultProvision;
      target.netRoi += r.netRoi;

      // Aggregate detailed data
      target.sessionData = [...(target.sessionData || []), ...(r.sessionData || [])];
      target.expenseData = [...(target.expenseData || []), ...(r.expenseData || [])];
      target.vaultData = [...(target.vaultData || []), ...(r.vaultData || [])];

      // Aggregate staff breakdown by employeeId
      const currentStaff = [...(target.staffBreakdown || [])];
      (r.staffBreakdown || []).forEach((s: any) => {
        const existingIndex = currentStaff.findIndex((e: any) => e.employeeId === s.employeeId);
        if (existingIndex !== -1) {
          const existing = { ...currentStaff[existingIndex] };
          existing.count = (existing.count || 0) + (s.count || 0);
          existing.commission = (existing.commission || 0) + (s.commission || 0);
          existing.allowance = (existing.allowance || 0) + (s.allowance || 0);
          
          if (s.attendance) {
            const existingAttendance = existing.attendance ? { ...existing.attendance } : null;
            if (!existingAttendance) {
              existing.attendance = { ...s.attendance };
            } else {
              existingAttendance.lateDeduction = (existingAttendance.lateDeduction || 0) + (s.attendance.lateDeduction || 0);
              existingAttendance.otPay = (existingAttendance.otPay || 0) + (s.attendance.otPay || 0);
              existingAttendance.cashAdvance = (existingAttendance.cashAdvance || 0) + (s.attendance.cashAdvance || 0);
              existing.attendance = existingAttendance;
            }
          }
          currentStaff[existingIndex] = existing;
        } else {
          currentStaff.push({ ...s });
        }
      });
      target.staffBreakdown = currentStaff;

      subGroups[key].push(r);
    });

    return {
      displayData: Object.values(aggregated),
      groupedConstituents: subGroups
    };
  }, [salesReports, branch.id, view, searchQuery, startDate, endDate, branches, showWeeklyBreakdown]);

  const sortedData = useMemo(() => {
    return [...displayData].sort((a, b) => {
      let valA: any, valB: any;
      switch (sortField) {
        case 'identity': valA = a.sortDate || a.reportDate; valB = b.sortDate || b.reportDate; break;
        case 'terminal':
          valA = branches.find(br => br.id === a.branchId)?.name || '';
          valB = branches.find(br => br.id === b.branchId)?.name || '';
          break;
        case 'yield': valA = a.grossSales; valB = b.grossSales; break;
        case 'payroll': valA = a.totalStaffPay; valB = b.totalStaffPay; break;
        case 'expenses': valA = a.totalExpenses; valB = b.totalExpenses; break;
        case 'reserve': valA = a.totalVaultProvision; valB = b.totalVaultProvision; break;
        case 'roi': valA = a.netRoi; valB = b.netRoi; break;
        default: valA = a.reportDate; valB = b.reportDate;
      }
      if (typeof valA === 'string') {
        return sortOrder === 'asc' ? (valA || '').localeCompare(valB || '') : (valB || '').localeCompare(valA || '');
      }
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });
  }, [displayData, sortField, sortOrder, branches]);

  const handleExportPDF = async (confirmed = false) => {
    if (!confirmed) {
      playSound('warning');
      setShowPrintConfirm(true);
      return;
    }

    setShowPrintConfirm(false);
    setIsExporting(true);
    playSound('click');

    try {
      const doc = new jsPDF('l', 'mm', 'a4'); // Landscape
      const pageWidth = doc.internal.pageSize.getWidth();

      // 1. Header
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text('NETWORK SALES CONSOLIDATED REPORT', 14, 20);

      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139); // slate-400
      doc.text(`VIEW MODE: ${view.toUpperCase()} | SCOPE: ${branch.name.toUpperCase()}`, 14, 26);

      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 20, { align: 'right' });
      doc.text(`Total Records: ${sortedData.length}`, pageWidth - 14, 26, { align: 'right' });

      // 2. Table
      autoTable(doc, {
        startY: 35,
        head: [[
          'Period/Identity', 
          'Terminal Node', 
          'Gross Yield', 
          'Staff Payroll', 
          'Operational Exp', 
          'Vault Reserve', 
          'Net ROI'
        ]],
        body: sortedData.map(r => [
          (r.reportDate || '').toUpperCase(),
          (branches.find(b => b.id === r.branchId)?.name || (r.branchId === 'all' ? 'CONSOLIDATED' : 'UNKNOWN')).toUpperCase(),
          `PHP ${Number(r.grossSales || 0).toLocaleString()}`,
          `PHP ${Number(r.totalStaffPay || 0).toLocaleString()}`,
          `PHP ${Number(r.totalExpenses || 0).toLocaleString()}`,
          `PHP ${Number(r.totalVaultProvision || 0).toLocaleString()}`,
          `PHP ${Number(r.netRoi || 0).toLocaleString()}`
        ]),
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 7 },
        columnStyles: {
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right', fontStyle: 'bold' }
        },
        rowPageBreak: 'avoid'
      });

      // 3. Totals
      const totalGross = sortedData.reduce((sum, r) => sum + (r.grossSales || 0), 0);
      const totalPayroll = sortedData.reduce((sum, r) => sum + (r.totalStaffPay || 0), 0);
      const totalExp = sortedData.reduce((sum, r) => sum + (r.totalExpenses || 0), 0);
      const totalVault = sortedData.reduce((sum, r) => sum + (r.totalVaultProvision || 0), 0);
      const totalNet = sortedData.reduce((sum, r) => sum + (r.netRoi || 0), 0);

      const finalY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text('NETWORK TOTALS', 14, finalY);
      
      autoTable(doc, {
        startY: finalY + 2,
        body: [[
          'CONSOLIDATED TOTALS',
          `PHP ${totalGross.toLocaleString()}`,
          `PHP ${totalPayroll.toLocaleString()}`,
          `PHP ${totalExp.toLocaleString()}`,
          `PHP ${totalVault.toLocaleString()}`,
          `PHP ${totalNet.toLocaleString()}`
        ]],
        theme: 'plain',
        styles: { fontSize: 9, fontStyle: 'bold' },
        columnStyles: {
          1: { halign: 'right' },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' }
        }
      });

      doc.save(`NETWORK_REPORTS_${view.toUpperCase()}_${new Date().toISOString().split('T')[0]}.pdf`);
      playSound('success');
    } catch (error) {
      console.error('PDF Export failed:', error);
      alert('Failed to generate PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(start, start + itemsPerPage);
  }, [sortedData, currentPage]);

  const totalPages = Math.ceil(sortedData.length / itemsPerPage);

  return (
      <div className={`space-y-6 md:space-y-8 animate-in fade-in duration-500 ${UI_THEME.layout.maxContent}`}>
        {selectedReport && (
            <ReportDashboardModal
                report={selectedReport}
                constituents={constituents}
                branchName={branch.id === 'all' ? (selectedReport.branchId === 'all' ? 'NETWORK CONSOLIDATED' : (branches.find(b => b.id === selectedReport.branchId)?.name || 'BRANCH NODE')) : branch.name}
                employees={employees}
                onClose={handleCloseModal}
                canEdit={canEdit}
                canValidate={canValidate}
                branch={branches.find(b => b.id === selectedReport.branchId) || branch}
                branches={branches}
            />
        )}

        <ReportFilters
            view={view}
            setView={setView}
            activeDropdown={activeDropdown}
            setActiveDropdown={setActiveDropdown}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            showBreakdown={showWeeklyBreakdown}
            setShowBreakdown={setShowWeeklyBreakdown}
            isNetworkView={branch.id === 'all'}
        />

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 px-1 sm:px-2">
          <div className="w-full sm:flex-1 min-w-0">
            <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                totalItems={sortedData.length}
                itemsPerPage={itemsPerPage}
            />
          </div>

          <button
            onClick={() => handleExportPDF()}
            disabled={isExporting || sortedData.length === 0}
            className={`h-14 w-full sm:w-auto px-6 rounded-2xl bg-emerald-600 text-white flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg active:scale-95 shrink-0 ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isExporting ? (
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            ) : (
              <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            )}
            <span>{isExporting ? 'Exporting...' : 'Print All Reports'}</span>
          </button>
        </div>

        {showPrintConfirm && (
          <div className="fixed inset-0 z-[6000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-[32px] w-full max-w-md p-10 text-center border border-slate-100 shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M17 17h2a2 2-0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              </div>
              <h4 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Print All Reports?</h4>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-relaxed">
                Generate a consolidated PDF summary of all {sortedData.length} filtered reports?
              </p>
              <div className="flex flex-col gap-4 mt-10">
                <button
                  onClick={() => handleExportPDF(true)}
                  className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl text-[12px] uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3"
                >
                  Confirm Print
                </button>
                <button
                  onClick={() => setShowPrintConfirm(false)}
                  className="w-full text-slate-400 font-black py-4 rounded-xl text-[12px] uppercase tracking-widest"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <ReportTable
            reports={paginatedData}
            branches={branches}
            viewMode={view}
            currentBranchId={branch.id}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={handleSort}
            onSelect={(r) => {
              playSound('click');
              setSelectedReport(r);
              if (view !== 'daily') {
                setConstituents(groupedConstituents[r.id] || []);
              }
            }}
        />

        <div className="flex flex-col items-center gap-2 pt-8 opacity-20 group">
          <div className="flex gap-2">
            {[1,2,3].map(i => <div key={i} className="w-1 h-1 rounded-full bg-slate-400"></div>)}
          </div>
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.5em]">Network Data Finalized v3.2</p>
        </div>
      </div>
  );
};
