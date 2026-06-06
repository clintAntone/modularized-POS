
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Branch, BranchVault, SalesReport } from '../../../types';
import { UI_THEME } from '../../../constants/ui_designs';
import { playSound } from '../../../lib/audio';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';

// Modular Imports
import { ReportFilters } from './reports-master/ReportFilters';
import { ReportTable } from './reports-master/ReportTable';
import { ReportDashboardModal } from './reports-master/ReportDashboardModal';
import { toDateStr, getWeekRange, getReportMonth, parseDate, normalizeDateStr } from '@/src/utils/reportUtils';

interface ReportsMasterProps {
  branch: Branch;
  salesReports: SalesReport[];
  isLoading?: boolean;
  branches?: Branch[];
  branchVaults?: BranchVault[];
  employees?: any[];
  canEdit?: boolean;
  canValidate?: boolean;
  branchVault?: BranchVault | null;
  canDelete?: boolean;
  onDeleted?: () => void;
}

export type ReportViewType = 'daily' | 'weekly' | 'monthly';
type SortField = 'identity' | 'terminal' | 'yield' | 'payroll' | 'expenses' | 'reserve' | 'roi';
type SortOrder = 'asc' | 'desc';

// Helper to get ISO Week number
// Removed local helpers as they are now in reportUtils

export const ReportsMasterSection: React.FC<ReportsMasterProps> = ({ branch, salesReports, isLoading = false, branches = [], branchVaults = [], employees = [], canEdit = false, canValidate = false, branchVault = null, canDelete = false, onDeleted }) => {
  // Merge single branchVault into the array so per-branch lookups work even in branch-manager view
  const effectiveBranchVaults = branchVaults.length > 0
    ? branchVaults
    : branchVault ? [branchVault] : [];

  const [view, setView] = useState<ReportViewType>('daily');
  const [selectedReport, setSelectedReport] = useState<SalesReport | null>(null);
  const [constituents, setConstituents] = useState<SalesReport[]>([]);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('identity');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showWeeklyBreakdown, setShowWeeklyBreakdown] = useState(false);
  
  // Infinite scroll state
  const PAGE_SIZE = 25;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [showPrintConfirm, setShowPrintConfirm] = useState(false);
  const [showMissingPanel, setShowMissingPanel] = useState(false);
  const [showMissingSidebar, setShowMissingSidebar] = useState(false);

  // Debounce search: wait 300 ms after the user stops typing before filtering
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE); // Reset on view/filter change
  }, [view, debouncedSearchQuery, startDate, endDate]);

  // IntersectionObserver to load more when sentinel enters viewport
  const loadMore = useCallback(() => {
    setVisibleCount(c => c + PAGE_SIZE);
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

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

      // 2. Resolve the target branch (used for week grouping)
      const targetBranch = branches.find(b => b.id === r.branchId) || (branch.id === r.branchId ? branch : null);

      const reportDate = parseDate(r.reportDate);
      if (isNaN(reportDate.getTime())) return false;

      // 3. Date Range Filter
      if (startDate && r.reportDate < startDate) return false;
      if (endDate && r.reportDate > endDate) return false;

      // 4. Search filter
      if (debouncedSearchQuery.trim()) {
        const q = debouncedSearchQuery.toUpperCase();
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
            ? `${toDateStr(weekStart)}`
            : `${r.branchId}-${toDateStr(weekStart)}`;
        label = weekLabel;
        sortDate = toDateStr(weekStart);
        periodEnd = toDateStr(weekEnd);
        reportType = 'weekly';
      } else {
        const { month, year } = getReportMonth(d);

        const isConsolidatedMonthly = branch.id === 'all' && !showWeeklyBreakdown;
        key = isConsolidatedMonthly
            ? `${year}-M${month}`
            : `${r.branchId}-${year}-M${month}`;
        label = new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }).toUpperCase();
        sortDate = toDateStr(new Date(year, month - 1, 1));
        periodEnd = toDateStr(new Date(year, month, 0));
        reportType = 'monthly';
      }

      if (!aggregated[key]) {
        const isConsolidated = branch.id === 'all' && !showWeeklyBreakdown;
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
  }, [salesReports, branch.id, view, debouncedSearchQuery, startDate, endDate, branches, showWeeklyBreakdown]);

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
      let primary: number;
      if (typeof valA === 'string') {
        primary = sortOrder === 'asc' ? (valA || '').localeCompare(valB || '') : (valB || '').localeCompare(valA || '');
      } else {
        primary = sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      // Tiebreaker: sort by branch name asc when primary values are equal
      if (primary !== 0) return primary;
      const nameA = branches.find(br => br.id === a.branchId)?.name || '';
      const nameB = branches.find(br => br.id === b.branchId)?.name || '';
      return nameA.localeCompare(nameB);
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

  const visibleData = useMemo(() => sortedData.slice(0, visibleCount), [sortedData, visibleCount]);

  // Fresh-fetch cache: keyed by report ID, populated lazily as rows become visible
  const [freshReports, setFreshReports] = useState<Record<string, SalesReport>>({});

  // Reset cache whenever the parent reloads the source data
  useEffect(() => { setFreshReports({}); }, [salesReports]);

  // Maps a raw Supabase row (snake_case) to the SalesReport shape (camelCase)
  const mapRawReport = (r: any): SalesReport => ({
    id: r[DB_COLUMNS.ID],
    branchId: r[DB_COLUMNS.BRANCH_ID],
    reportDate: normalizeDateStr(r[DB_COLUMNS.REPORT_DATE]),
    submittedAt: r[DB_COLUMNS.SUBMITTED_AT],
    grossSales: Number(r[DB_COLUMNS.GROSS_SALES] ?? 0),
    totalStaffPay: Number(r[DB_COLUMNS.TOTAL_STAFF_PAY] ?? 0),
    totalExpenses: Number(r[DB_COLUMNS.TOTAL_EXPENSES] ?? 0),
    totalVaultProvision: Number(r[DB_COLUMNS.TOTAL_VAULT_PROVISION] ?? 0),
    netRoi: Number(r[DB_COLUMNS.NET_ROI] ?? 0),
    sessionData: typeof r[DB_COLUMNS.SESSION_DATA] === 'string' ? JSON.parse(r[DB_COLUMNS.SESSION_DATA]) : (r[DB_COLUMNS.SESSION_DATA] || []),
    staffBreakdown: typeof r[DB_COLUMNS.STAFF_BREAKDOWN] === 'string' ? JSON.parse(r[DB_COLUMNS.STAFF_BREAKDOWN]) : (r[DB_COLUMNS.STAFF_BREAKDOWN] || []),
    expenseData: typeof r[DB_COLUMNS.EXPENSE_DATA] === 'string' ? JSON.parse(r[DB_COLUMNS.EXPENSE_DATA]) : (r[DB_COLUMNS.EXPENSE_DATA] || []),
    vaultData: typeof r[DB_COLUMNS.VAULT_DATA] === 'string' ? JSON.parse(r[DB_COLUMNS.VAULT_DATA]) : (r[DB_COLUMNS.VAULT_DATA] || []),
  });

  // Batch-fetch fresh data for newly-visible daily reports
  useEffect(() => {
    if (view !== 'daily' || !visibleData.length || !supabase) return;
    const idsToFetch = visibleData
      .map(r => r.id)
      .filter(id => !freshReports[id] && !id.includes('-'));
    if (!idsToFetch.length) return;

    supabase
      .from(DB_TABLES.SALES_REPORTS)
      .select('*')
      .in(DB_COLUMNS.ID, idsToFetch)
      .then(({ data, error }) => {
        if (error || !data) return;
        setFreshReports(prev => {
          const next = { ...prev };
          data.forEach((raw: any) => {
            const mapped = mapRawReport(raw);
            next[mapped.id] = mapped;
          });
          return next;
        });
      });
  }, [visibleData, view]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply fresh overrides for the daily table view
  const visibleDataWithFresh = useMemo(
    () => view === 'daily'
      ? visibleData.map(r => freshReports[r.id] ?? r)
      : visibleData,
    [visibleData, freshReports, view]
  );

  // Missing reports: days within the current weekly cycle (cycleStart → yesterday) with no report.
  // Each branch has its own cutoff day — cycle starts the day after cutoff.
  // Cap the lookback at 90 days to match the data fetch window — dates older than that
  // are simply outside the loaded range and should not be flagged as missing.
  const missingBranches = useMemo(() => {
    const manilaToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
    const todayDate = new Date(manilaToday + 'T12:00:00+08:00');
    const todayDOW = todayDate.getDay();

    const yesterdayDate = new Date(todayDate);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

    // 90-day fetch boundary — never flag dates older than this as "missing"
    const fetchBoundaryDate = new Date(todayDate);
    fetchBoundaryDate.setDate(fetchBoundaryDate.getDate() - 90);
    const fetchBoundaryStr = fetchBoundaryDate.toISOString().slice(0, 10);

    const targetBranches = (branch.id === 'all' ? branches : branches.filter(b => b.id === branch.id))
      .filter(b => !b.name.toUpperCase().includes('TEST'));
    const result: { branch: Branch; missingDates: string[] }[] = [];

    targetBranches.forEach(b => {
      // Cycle starts the day after the weekly cutoff
      const cutoff = Number(b.weeklyCutoff ?? 0);
      const cycleStartDOW = (cutoff + 1) % 7;

      // How many days ago did the current cycle start?
      const daysAgo = (todayDOW - cycleStartDOW + 7) % 7;

      // If daysAgo === 0, cycle just started today — nothing to check yet
      if (daysAgo === 0) return;

      const cycleStart = new Date(todayDate);
      cycleStart.setDate(cycleStart.getDate() - daysAgo);
      const cycleStartStr = cycleStart.toISOString().slice(0, 10);

      // Respect the branch's overall data start date, but never go further back
      // than the 90-day fetch boundary — reports beyond that aren't loaded.
      const effectiveStart = [
        cycleStartStr,
        b.cycleStartDate,
        fetchBoundaryStr,
      ].filter(Boolean).reduce((latest, d) => (d! > latest ? d! : latest), cycleStartStr);

      // Walk each day from effectiveStart → yesterday and find missing ones
      const missingDates: string[] = [];
      const cursor = new Date(effectiveStart + 'T12:00:00+08:00');

      while (cursor <= yesterdayDate) {
        const dateStr = cursor.toISOString().slice(0, 10);
        const report = salesReports.find(r => r.branchId === b.id && r.reportDate === dateStr);
        if (!report) missingDates.push(dateStr);
        cursor.setDate(cursor.getDate() + 1);
      }

      if (missingDates.length > 0) result.push({ branch: b, missingDates });
    });

    return result.sort((a, b) => b.missingDates.length - a.missingDates.length);
  }, [branches, branch.id, salesReports]);

  // A filter is active when the user has typed a search, selected dates, or narrowed to a single branch.
  // Showing "missing reports" while filtered is misleading — hide it.
  const isFiltered = !!(debouncedSearchQuery.trim() || startDate || endDate || branch.id !== 'all');


  return (
      <div className={`${UI_THEME.layout.maxContent} flex flex-col lg:flex-row gap-6 lg:gap-8 lg:items-start`}>
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
                branchVaults={effectiveBranchVaults}
                vaultStartDate={
                  effectiveBranchVaults.find(v => v.branchId === selectedReport.branchId)?.startDate ??
                  branchVault?.startDate ?? null
                }
            />
        )}

        {/* ── Main content ─────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-6 md:space-y-8">

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

        {/* Missing Reports — mobile/tablet inline panel (hidden when filtered or read-only) */}
        {missingBranches.length > 0 && !isFiltered && canEdit && (
          <div className="lg:hidden rounded-2xl border border-rose-200 bg-rose-50/40 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-black text-rose-800 uppercase tracking-widest leading-none">Missing Reports</p>
                <p className="text-[9px] font-bold text-rose-400 uppercase tracking-widest mt-0.5">
                  {missingBranches.length} {missingBranches.length === 1 ? 'branch has' : 'branches have'} missing reports
                </p>
              </div>
              <button
                onClick={() => { setShowMissingPanel(p => !p); playSound('click'); }}
                className="w-8 h-8 rounded-xl bg-rose-100 hover:bg-rose-200 flex items-center justify-center transition-colors shrink-0"
              >
                <svg
                  className={`w-4 h-4 text-rose-500 transition-transform duration-200 ${showMissingPanel ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            {showMissingPanel && (
              <div className="px-4 pb-4 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {missingBranches.map(({ branch: b, missingDates }) => (
                    <div key={b.id} className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                      <p className="text-[11px] font-black text-slate-800 uppercase tracking-wide truncate">{b.name}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {missingDates.map(d => (
                          <span key={d} className="flex items-center gap-1 text-[9px] font-bold text-amber-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                            {new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-row items-center gap-4 px-1 sm:px-2">
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
              Showing {Math.min(visibleCount, sortedData.length).toLocaleString()} of {sortedData.length.toLocaleString()} reports
            </p>
          </div>

          <button
            onClick={() => handleExportPDF()}
            disabled={isExporting || sortedData.length === 0}
            className={`flex items-center gap-2 h-9 px-4 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {isExporting ? (
              <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            )}
            <span>{isExporting ? 'Exporting…' : 'Export PDF'}</span>
          </button>
        </div>

        {showPrintConfirm && (
          <div className="fixed inset-0 z-[6000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-[32px] w-full max-w-md p-10 text-center border border-slate-100 shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M17 17h2a2 2-0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              </div>
              <h4 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Export PDF?</h4>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-relaxed">
                Generate a consolidated PDF summary of all {sortedData.length} filtered reports?
              </p>
              <div className="flex flex-col gap-4 mt-10">
                <button
                  onClick={() => handleExportPDF(true)}
                  className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl text-[12px] uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3"
                >
                  Confirm Export
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

        <div className="md:hidden flex items-center gap-3 px-1">
          <div className="flex-1 h-px bg-slate-200"></div>
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] shrink-0">Reports</span>
          <div className="flex-1 h-px bg-slate-200"></div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-10 h-10 border-[3px] border-slate-100 border-t-slate-400 rounded-full animate-spin" />
            <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Loading reports…</p>
          </div>
        ) : (
          <>
            <ReportTable
                reports={visibleDataWithFresh}
                branches={branches}
                branchVaults={branchVaults}
                viewMode={view}
                currentBranchId={branch.id}
                sortField={sortField}
                sortOrder={sortOrder}
                onSort={handleSort}
                vaultStartDate={branchVault?.startDate ?? null}
                canDelete={canDelete}
                onDeleted={onDeleted}
                onSelect={(r) => {
                  playSound('click');
                  setSelectedReport(r);
                  if (view !== 'daily') {
                    setConstituents(groupedConstituents[r.id] || []);
                  }
                }}
            />

            {/* Infinite scroll sentinel */}
            {visibleCount < sortedData.length && (
              <div ref={sentinelRef} className="flex justify-center py-6">
                <div className="flex gap-1.5">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex flex-col items-center gap-2 pt-8 opacity-20 group">
          <div className="flex gap-2">
            {[1,2,3].map(i => <div key={i} className="w-1 h-1 rounded-full bg-slate-400"></div>)}
          </div>
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.5em]">Network Data Finalized v3.2</p>
        </div>

        </div>{/* end main content */}

        {/* ── Missing reports floating toggle (desktop only) — does NOT affect table width ── */}
        {branch.id === 'all' && !isFiltered && canEdit && missingBranches.length > 0 && (
          <div className="hidden lg:block shrink-0 sticky top-24">
            <div className="relative">
              {/* Toggle pill */}
              <button
                onClick={() => { setShowMissingSidebar(p => !p); playSound('click'); }}
                className="flex items-center gap-2 px-3 py-2 bg-white border border-rose-200 rounded-2xl shadow-sm hover:bg-rose-50 transition-colors whitespace-nowrap"
              >
                <div className="w-2 h-2 rounded-full bg-rose-400 animate-pulse shrink-0" />
                <span className="text-[9px] font-black text-rose-700 uppercase tracking-widest">
                  {missingBranches.length} Missing
                </span>
                <svg
                  className={`w-3 h-3 text-rose-400 transition-transform duration-200 ${showMissingSidebar ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Floating dropdown — absolutely positioned, doesn't push table */}
              {showMissingSidebar && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xl z-50">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="text-[10px] font-black text-rose-700 uppercase tracking-widest leading-none">Missing Reports</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Within current weekly cycle</p>
                  </div>
                  <div className="divide-y divide-slate-50 max-h-[50vh] overflow-y-auto">
                    {missingBranches.map(({ branch: b, missingDates }) => (
                      <div key={b.id} className="px-4 py-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-6 h-6 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0">
                            <svg className="w-3 h-3 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                            </svg>
                          </div>
                          <p className="text-[10px] font-black text-slate-800 uppercase truncate leading-none flex-1">{b.name}</p>
                          <span className="text-[8px] font-black text-rose-500 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded-full shrink-0">{missingDates.length}d</span>
                        </div>
                        <div className="flex flex-wrap gap-1 pl-8">
                          {missingDates.map(d => (
                            <span key={d} className="text-[8px] font-bold text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded-md">
                              {new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
  );
};
