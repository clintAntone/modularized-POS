import React, { useState, useMemo, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Branch, SalesReport, Employee } from '../../types';
import { UI_THEME } from '../../constants/ui_designs';
import { playSound, resumeAudioContext } from '../../lib/audio';
import { ReportDashboardModal } from '../dashboard/sections/reports-master/ReportDashboardModal';
import { Pagination } from '../dashboard/sections/common/Pagination';
import { parseDate, toDateStr } from '@/src/utils/reportUtils';
import { getTrueDate, getManilaTodayStr } from '../../lib/time';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface SalesHubProps {
  branches: Branch[];
  salesReports: SalesReport[];
  salesReportsLoading?: boolean;
  employees: Employee[];
  onRefresh?: (quiet?: boolean) => void;
}

type SortKey = 'gross' | 'net' | 'sessions' | 'name';

export const SalesHub: React.FC<SalesHubProps> = ({ branches, salesReports, salesReportsLoading = false, employees, onRefresh }) => {
  const [selectedDate, setSelectedDate] = useState<string>(getManilaTodayStr());
  const [searchTerm, setSearchTerm] = useState<string>(() => {
    const saved = localStorage.getItem('live_filter_search') || '';
    // If the saved search would hide every available branch, discard it.
    // This prevents a superadmin's leftover filter from blanking the view for a
    // portal user whose assigned branches don't match that search term.
    if (saved && branches.length > 0) {
      const term = saved.toUpperCase();
      const anyMatch = branches.some(b => (b.name || '').toUpperCase().includes(term) || (b.id || '').toUpperCase().includes(term));
      if (!anyMatch) return '';
    }
    return saved;
  });
  const [lastSync, setLastSync] = useState<Date>(getTrueDate());
  const [mobileSortBy, setMobileSortBy] = useState<SortKey>('gross');
  const [selectedReport, setSelectedReport] = useState<{ report: SalesReport; branch: Branch } | null>(null);
  const [liveFilter, setLiveFilter] = useState<'all' | 'live' | 'closed'>('all');
  const [managerFilter, setManagerFilter] = useState<'all' | 'has_manager' | 'no_manager'>('all');
  const [complianceFilter, setComplianceFilter] = useState<'all' | 'compliant' | 'uncompliant'>('all');
  const [missedDaysThreshold, setMissedDaysThreshold] = useState<number | null>(null);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [showDownloadConfirm, setShowDownloadConfirm] = useState(false);
  const [showLateOpenDropdown, setShowLateOpenDropdown] = useState(false);
  const [showMissingModal, setShowMissingModal] = useState(false);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  useEffect(() => {
    setCurrentPage(1); // Reset to first page on search/sort change
  }, [searchTerm, mobileSortBy, selectedDate, managerFilter, liveFilter, missedDaysThreshold]);

  useEffect(() => {
    localStorage.setItem('live_filter_search', searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLastSync(getTrueDate());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-refresh data every 30 seconds
  useEffect(() => {
    if (!onRefresh) return;
    const interval = setInterval(() => {
      onRefresh(true);
      setLastSync(getTrueDate());
    }, 30000);
    return () => clearInterval(interval);
  }, [onRefresh]);

  const handleDateShift = (days: number) => {
    const d = parseDate(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(toDateStr(d));
    playSound('click');
  };

  // Compute consecutive days without a report (going back from Manila today) per branch
  const missedDaysMap = useMemo(() => {
    const manilaToday = getManilaTodayStr();
    const map: Record<string, number> = {};
    branches.forEach(branch => {
      let count = 0;
      const d = new Date(manilaToday + 'T12:00:00');
      for (let i = 0; i < 60; i++) {
        const dateStr = toDateStr(d);
        const hasReport = salesReports.some(r => r.branchId === branch.id && r.reportDate === dateStr);
        if (hasReport) break;
        count++;
        d.setDate(d.getDate() - 1);
      }
      map[branch.id] = count;
    });
    return map;
  }, [branches, salesReports]);

  const branchStats = useMemo(() => {
    // Ensure we process ALL branches in the registry
    let stats = branches.map(branch => {
      const report = salesReports.find(r => r.branchId === branch.id && r.reportDate === selectedDate);

      return {
        id: branch.id,
        name: branch.name,
        isEnabled: branch.isEnabled,
        isOpen: branch.isOpen,
        manager: branch.manager,
        tempManager: branch.tempManager,
        dailyProvisionAmount: branch.dailyProvisionAmount,
        sessionCount: report ? (report.sessionData?.length || 0) : 0,
        gross: report?.grossSales || 0,
        staffPay: report?.totalStaffPay || 0,
        isLegacy: !branch.vaultEnabled,
        operational: (() => {
          const base = (report?.totalExpenses || 0) + (branch.vaultEnabled ? 0 : (report?.totalVaultProvision || 0));
          if (!branch.vaultEnabled) return base;
          // For vault branches: subtract vault-covered portion when totalExpenses was saved
          // as the full amount (transition reports without VAULT_WITHDRAWAL records in expense_data).
          const expData: any[] = report?.expenseData || [];
          const hasVaultRecords = expData.some((e: any) => e.category === 'VAULT_WITHDRAWAL');
          if (hasVaultRecords) return base; // totalExpenses already ROI-only
          const vaultCovered = expData
            .filter((e: any) => e.category === 'OPERATIONAL')
            .reduce((s: number, e: any) => s + Number(e.from_vault || 0), 0);
          return base - vaultCovered;
        })(),
        vault: report?.totalVaultProvision || 0,
        net: report?.netRoi || 0,
        rawReport: report,
        missedDays: missedDaysMap[branch.id] ?? 0,
      };
    });

    // Apply Missed Days Filter
    if (missedDaysThreshold !== null) {
      stats = stats.filter(b => b.missedDays >= missedDaysThreshold);
    }

    // Apply Live Filter
    if (liveFilter !== 'all') {
      stats = stats.filter(b => liveFilter === 'live' ? b.isOpen : !b.isOpen);
    }

    // Apply Manager Filter
    if (managerFilter !== 'all') {
      if (managerFilter === 'no_manager') {
        stats = stats.filter(b => !b.manager && !b.tempManager);
      } else if (managerFilter === 'has_manager') {
        stats = stats.filter(b => b.manager || b.tempManager);
      }
    }

    // Apply Compliance Filter
    if (complianceFilter !== 'all') {
      stats = stats.filter(b => complianceFilter === 'compliant' ? !!b.rawReport : !b.rawReport);
    }

    // Apply Search Filter
    if (searchTerm.trim()) {
      const term = searchTerm.toUpperCase();
      stats = stats.filter(b => (b.name || '').toUpperCase().includes(term) || (b.id || '').toUpperCase().includes(term));
    }

    // Apply Sort
    return stats.sort((a, b) => {
      if (!a || !b) return 0;
      if (mobileSortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      return (b[mobileSortBy] || 0) - (a[mobileSortBy] || 0);
    });
  }, [branches, salesReports, selectedDate, mobileSortBy, searchTerm, managerFilter, liveFilter, complianceFilter, missedDaysThreshold, missedDaysMap]);

  const paginatedStats = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return branchStats.slice(start, start + itemsPerPage);
  }, [branchStats, currentPage]);

  const totalPages = Math.ceil(branchStats.length / itemsPerPage);

  const networkTotals = useMemo(() => {
    // Totals should always reflect the filtered view or the whole network if no filter
    return branchStats.reduce((acc, curr) => ({
      gross: acc.gross + curr.gross,
      staffPay: acc.staffPay + curr.staffPay,
      operational: acc.operational + curr.operational,
      vault: acc.vault + curr.vault,
      net: acc.net + curr.net,
      sessions: acc.sessions + curr.sessionCount
    }), { gross: 0, staffPay: 0, operational: 0, vault: 0, net: 0, sessions: 0 });
  }, [branchStats]);

  const lateToOpenBranches = useMemo(() => {
    const manilaToday = getManilaTodayStr();
    if (selectedDate !== manilaToday) return [];
    const manilaTime = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(lastSync);
    return branches.filter(branch => {
      if (!branch.isEnabled) return false;
      if (branch.isOpen) return false;
      if (!branch.openingTime) return false;
      if ((branch.name || '').toUpperCase().includes('TEST')) return false;
      // If the branch already has a report for today, it opened at some point — don't flag it
      const hasReportToday = salesReports.some(r => r.branchId === branch.id && r.reportDate === manilaToday);
      if (hasReportToday) return false;
      return manilaTime > branch.openingTime;
    });
  }, [branches, salesReports, selectedDate, lastSync]);


  const isToday = selectedDate === getManilaTodayStr();

  // Branches with no report filed for the selected date (enabled, non-test)
  const missingReportBranches = useMemo(() => {
    if (!isToday || salesReportsLoading) return [];
    const manilaTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(getTrueDate());
    return branches.filter(b => {
      if (!b.isEnabled) return false;
      if ((b.name || '').toUpperCase().includes('TEST')) return false;
      // Only flag branches whose opening time has already passed
      if (b.openingTime && manilaTime < b.openingTime) return false;
      return !salesReports.some(r => r.branchId === b.id && r.reportDate === selectedDate);
    });
  }, [branches, salesReports, salesReportsLoading, selectedDate, isToday, lastSync]);

  const formattedDisplayDate = useMemo(() => {
    const d = parseDate(selectedDate);
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
  }, [selectedDate]);

  const handleSortChange = (key: SortKey) => {
    resumeAudioContext();
    playSound('click');
    setMobileSortBy(key);
  };

  const handleRowClick = (b: any) => {
    if (b.rawReport) {
      playSound('click');
      const branch = branches.find(br => br.id === b.id);
      if (branch) {
        setSelectedReport({ report: b.rawReport, branch });
      }
    }
  };

  const handleExportPDF = () => {
    resumeAudioContext();
    playSound('success');
    
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    // Header
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text('DAILY NETWORK SALES REPORT', 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`DATE: ${formattedDisplayDate}`, 14, 28);
    doc.text(`GENERATED AT: ${getTrueDate().toLocaleString()}`, 14, 33);

    const tableData = branchStats.map(b => [
      b.name || 'UNNAMED',
      b.rawReport ? 'SUBMITTED' : 'NO REPORT',
      `P${b.gross.toLocaleString()}`,
      `P${b.staffPay.toLocaleString()}`,
      `P${b.operational.toLocaleString()}`,
      `P${b.vault.toLocaleString()}`,
      `P${b.net.toLocaleString()}`
    ]);

    autoTable(doc, {
      head: [['Branch Node', 'Report', 'Gross', 'Payroll', 'Expenses', 'Vault', 'Net ROI']],
      body: tableData,
      startY: 40,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 3,
        font: 'helvetica',
        valign: 'middle'
      },
      headStyles: {
        fillColor: [5, 150, 105], // emerald-600
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center'
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 50 },
        1: { halign: 'center' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right', fontStyle: 'bold' }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 1) {
          if (data.cell.raw === 'NO REPORT') {
            data.cell.styles.textColor = [225, 29, 72]; // rose-600
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    });

    // Summary Section
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('NETWORK CONSOLIDATED TOTALS:', 14, finalY);
    
    const summaryData = [
      ['Total Units', networkTotals.sessions.toString()],
      ['Total Gross Yield', `P${networkTotals.gross.toLocaleString()}`],
      ['Total Payroll', `P${networkTotals.staffPay.toLocaleString()}`],
      ['Total Expenses', `P${networkTotals.operational.toLocaleString()}`],
      ['Total Vault Fund', `P${networkTotals.vault.toLocaleString()}`],
      ['Total Net ROI', `P${networkTotals.net.toLocaleString()}`]
    ];

    autoTable(doc, {
      body: summaryData,
      startY: finalY + 5,
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 50 },
        1: { halign: 'left', fontStyle: 'bold' }
      }
    });

    doc.save(`Daily_Network_Report_${selectedDate}.pdf`);
    setShowDownloadConfirm(false);
  };

  const getFontSize = (value: number) => {
    const len = Math.abs(value).toLocaleString().length;
    if (len > 14) return 'text-lg sm:text-xl';
    if (len > 11) return 'text-xl sm:text-2xl';
    if (len > 8) return 'text-2xl sm:text-3xl';
    return 'text-3xl sm:text-4xl';
  };

  const getMobileFontSize = (value: number) => {
    const len = Math.abs(value).toLocaleString().length;
    if (len > 12) return 'text-sm';
    if (len > 10) return 'text-base';
    return 'text-lg';
  };

  return (
    <div className={`flex flex-col lg:flex-row gap-6 lg:gap-8 lg:items-start pb-32`}>
        {/* Missing report modal */}
        {showMissingModal && ReactDOM.createPortal(
          <div className="fixed inset-0 z-[9999] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowMissingModal(false)}>
            <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="px-6 pt-6 pb-4 border-b border-slate-100">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black text-amber-500 uppercase tracking-widest mb-1">Today — {formattedDisplayDate}</p>
                    <h3 className="text-[15px] font-black text-slate-900 uppercase tracking-tight leading-tight">
                      {missingReportBranches.length} Branch{missingReportBranches.length !== 1 ? 'es' : ''} Not Yet Open
                    </h3>
                  </div>
                  <button onClick={() => setShowMissingModal(false)} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-all shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
              {/* List */}
              <div className="max-h-[50vh] overflow-y-auto divide-y divide-slate-50">
                {missingReportBranches.map((b, i) => (
                  <div key={b.id} className="flex items-center gap-3 px-6 py-3.5">
                    <span className="text-xs font-black text-slate-300 w-5 shrink-0">{i + 1}</span>
                    <div className="w-7 h-7 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-slate-800 uppercase tracking-tight truncate leading-none">{b.name}</p>
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-0.5">
                        {b.manager ? `MGR: ${b.manager}` : 'No manager assigned'}
                        {b.openingTime ? ` · Opens ${b.openingTime}` : ''}
                      </p>
                    </div>
                    <div className={`shrink-0 w-2 h-2 rounded-full ${b.isOpen ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                  </div>
                ))}
              </div>
              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
                <button
                  onClick={() => { setComplianceFilter('uncompliant'); setShowMissingModal(false); playSound('click'); }}
                  className="flex-1 h-10 rounded-2xl bg-slate-900 text-white text-xs font-semibold uppercase tracking-wide hover:bg-amber-600 active:scale-95 transition-all"
                >
                  Filter to These Branches
                </button>
                <button
                  onClick={() => setShowMissingModal(false)}
                  className="h-10 px-5 rounded-2xl border border-slate-200 text-slate-500 text-xs font-semibold uppercase tracking-wide hover:bg-slate-50 transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {showDownloadConfirm && ReactDOM.createPortal(
          <div className="fixed inset-0 z-[9999] bg-slate-950/95 flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => setShowDownloadConfirm(false)}>
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-8 space-y-6 animate-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center text-3xl mx-auto shadow-inner">📄</div>
              <div className="text-center space-y-2">
                <h4 className="text-lg font-black text-slate-900 uppercase tracking-tighter">Confirm Export</h4>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide leading-relaxed">
                  Generate and download the network sales report for <span className="text-slate-900">{formattedDisplayDate}</span>?
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleExportPDF}
                  className="w-full bg-emerald-600 text-white font-black py-4 rounded-xl uppercase tracking-widest text-xs shadow-lg hover:bg-emerald-700 transition-all active:scale-95"
                >
                  Confirm Export
                </button>
                <button
                  onClick={() => setShowDownloadConfirm(false)}
                  className="w-full bg-slate-100 text-slate-400 font-black py-4 rounded-xl uppercase tracking-widest text-xs hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
        {selectedReport && (
            <ReportDashboardModal
                report={selectedReport.report}
                branch={selectedReport.branch}
                branchName={selectedReport.branch.name}
                employees={employees}
                onClose={() => setSelectedReport(null)}
                canEdit={false}
                canValidate={true}
                branches={branches}
            />
        )}
        
        {/* ── Main content ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-6">

        {/* UNIFIED COMMAND BAR */}
        <div className={`bg-white p-4 md:px-8 md:py-6 ${UI_THEME.radius.card} border border-slate-200 shadow-sm no-print space-y-6`}>
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" /></svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-tighter">Live Sales Hub</h3>
                  <div className="flex items-center gap-1.5 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                    <span className="text-xs font-black text-emerald-800 uppercase tracking-widest">LIVE</span>
                  </div>
                </div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                  Last Sync: {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </p>
              </div>
            </div>
          </div>

          {/* SEARCH + FILTER TOGGLE ROW */}
          <div className="flex flex-row items-center gap-2 sm:gap-4">
            <div className="relative flex-1 group">
              <div className="absolute left-4 md:left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-emerald-500 transition-colors">
                <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
              <input
                  type="text"
                  placeholder="SEARCH BRANCH NAME..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 md:pl-14 pr-4 md:pr-6 py-3.5 md:py-5 bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl text-xs md:text-sm font-medium uppercase tracking-wide focus:bg-white focus:border-emerald-500 focus:ring-8 focus:ring-emerald-500/5 transition-all outline-none shadow-inner placeholder:text-slate-300"
              />
            </div>

            <button
              onClick={() => { setIsFiltersOpen(!isFiltersOpen); playSound('click'); }}
              className={`flex items-center gap-2 px-4 py-2.5 md:py-5 rounded-xl md:rounded-2xl border transition-all text-xs font-semibold uppercase tracking-wide shrink-0 ${isFiltersOpen ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-500 hover:text-emerald-600'}`}
            >
              <svg className={`w-4 h-4 transition-transform duration-300 ${isFiltersOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M19 9l-7 7-7-7" /></svg>
              <span className="hidden sm:inline">{isFiltersOpen ? 'Hide Filters' : 'Filters'}</span>
              {(managerFilter !== 'all' || liveFilter !== 'all' || complianceFilter !== 'all' || missedDaysThreshold !== null) && !isFiltersOpen && <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>}
            </button>
          </div>

          {isFiltersOpen && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300 pt-4 border-t border-slate-100 space-y-5">

              {/* — Primary: Date navigator (full-width accent) — */}
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2 ml-1">Target Date</p>
                <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner h-12 max-w-sm">
                  <button
                    onClick={() => handleDateShift(-1)}
                    className="w-10 h-full flex items-center justify-center hover:bg-white hover:shadow-md rounded-xl transition-all text-slate-400 hover:text-emerald-600 active:scale-90"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <div className="relative flex-1 text-center flex items-center justify-center h-full px-2 group cursor-pointer">
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => { setSelectedDate(e.target.value); playSound('click'); }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                    />
                    <span className="font-black text-xs text-slate-900 uppercase tracking-tight whitespace-nowrap leading-none pointer-events-none">
                      {formattedDisplayDate}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDateShift(1)}
                    className="w-10 h-full flex items-center justify-center hover:bg-white hover:shadow-md rounded-xl transition-all text-slate-400 hover:text-emerald-600 active:scale-90"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>
              </div>

              {/* — Secondary: filter groups — */}
              <div className="space-y-3">

                {/* Row 1: 4 equal-width toggles */}
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                  {/* Live Status */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">Live Status</p>
                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner h-10">
                      {(['all', 'live', 'closed'] as const).map((val) => (
                        <button key={val} onClick={() => { setLiveFilter(val); playSound('click'); }}
                          className={`flex-1 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${liveFilter === val ? 'bg-white text-slate-900 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>
                          {val === 'all' ? 'All' : val === 'live' ? 'Online' : 'Offline'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Compliance Status */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">Report Status</p>
                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner h-10">
                      {(['all', 'compliant', 'uncompliant'] as const).map((val) => (
                        <button key={val} onClick={() => { setComplianceFilter(val); playSound('click'); }}
                          className={`flex-1 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${complianceFilter === val ? 'bg-white text-slate-900 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>
                          {val === 'all' ? 'All' : val === 'compliant' ? 'Filed' : 'Missing'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Manager Status */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">Manager</p>
                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner h-10">
                      {(['all', 'has_manager', 'no_manager'] as const).map((val) => (
                        <button key={val} onClick={() => { setManagerFilter(val); playSound('click'); }}
                          className={`flex-1 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${managerFilter === val ? 'bg-white text-slate-900 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>
                          {val === 'all' ? 'All' : val === 'has_manager' ? 'Assigned' : 'Empty'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sort By */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">Sort By</p>
                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner h-10">
                      {(['gross', 'net', 'sessions', 'name'] as SortKey[]).map((key) => (
                        <button key={key} onClick={() => handleSortChange(key)}
                          className={`flex-1 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${mobileSortBy === key ? 'bg-white text-slate-900 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>
                          {key === 'sessions' ? 'Units' : key === 'name' ? 'A–Z' : key}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Row 2: No Report For — compact, left-aligned */}
                <div className="space-y-1.5">
                  <p className="text-xs font-black text-rose-400 uppercase tracking-widest ml-1">No Report For</p>
                  <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner h-10 w-full xl:w-fit gap-0.5">
                    {([null, 3, 5, 7, 14, 30] as (number | null)[]).map((val) => (
                      <button key={val ?? 'all'} onClick={() => { setMissedDaysThreshold(val); playSound('click'); }}
                        className={`flex-1 xl:flex-none xl:px-5 rounded-lg text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                          missedDaysThreshold === val
                            ? val === null ? 'bg-white text-slate-900 shadow-sm border border-slate-100' : 'bg-rose-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-600'
                        }`}>
                        {val === null ? 'Off' : `${val}d+`}
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              {/* Active filters summary chips */}
              {(liveFilter !== 'all' || complianceFilter !== 'all' || managerFilter !== 'all' || missedDaysThreshold !== null) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {liveFilter !== 'all' && (
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-xs font-black text-emerald-700 uppercase tracking-widest">
                      {liveFilter === 'live' ? 'Online' : 'Offline'}
                      <button onClick={() => setLiveFilter('all')} className="hover:text-rose-500 transition-colors">✕</button>
                    </span>
                  )}
                  {complianceFilter !== 'all' && (
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-200 rounded-full text-xs font-black text-indigo-700 uppercase tracking-widest">
                      {complianceFilter === 'compliant' ? 'Filed' : 'Missing Report'}
                      <button onClick={() => setComplianceFilter('all')} className="hover:text-rose-500 transition-colors">✕</button>
                    </span>
                  )}
                  {managerFilter !== 'all' && (
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs font-black text-amber-700 uppercase tracking-widest">
                      {managerFilter === 'has_manager' ? 'Has Manager' : 'No Manager'}
                      <button onClick={() => setManagerFilter('all')} className="hover:text-rose-500 transition-colors">✕</button>
                    </span>
                  )}
                  {missedDaysThreshold !== null && (
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-rose-50 border border-rose-200 rounded-full text-xs font-black text-rose-700 uppercase tracking-widest">
                      No report {missedDaysThreshold}d+
                      <button onClick={() => setMissedDaysThreshold(null)} className="hover:text-rose-500 transition-colors">✕</button>
                    </span>
                  )}
                  <button
                    onClick={() => { setLiveFilter('all'); setComplianceFilter('all'); setManagerFilter('all'); setMissedDaysThreshold(null); playSound('click'); }}
                    className="text-xs font-medium text-slate-400 uppercase tracking-wide hover:text-rose-500 transition-colors px-2"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>
          )}
        </div>


        {/* ── Missing report alert ── */}
        {isToday && missingReportBranches.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-2xl">
            <div className="w-7 h-7 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-amber-800 leading-none">
                {missingReportBranches.length} {missingReportBranches.length === 1 ? 'branch has' : 'branches have'} not yet opened today
              </p>
              <p className="text-xs text-amber-600 font-semibold mt-0.5 truncate">
                {missingReportBranches.slice(0, 5).map(b => b.name).join(', ')}{missingReportBranches.length > 5 ? ` +${missingReportBranches.length - 5} more` : ''}
              </p>
            </div>
            <button
              onClick={() => { setShowMissingModal(true); playSound('click'); }}
              className="shrink-0 h-8 px-3 rounded-xl bg-amber-600 text-white text-xs font-semibold uppercase tracking-wide hover:bg-amber-700 active:scale-95 transition-all"
            >
              Show
            </button>
          </div>
        )}

        <div className="flex flex-row items-center justify-between gap-4 px-1 sm:px-2">
          <div className="flex-1 min-w-0">
            <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                totalItems={branchStats.length}
                itemsPerPage={itemsPerPage}
                onItemsPerPageChange={(n) => { setItemsPerPage(n); setCurrentPage(1); }}
            />
          </div>

          <button
              onClick={() => setShowDownloadConfirm(true)}
              className="h-14 px-5 rounded-2xl bg-emerald-600 text-white flex items-center justify-center gap-2.5 text-xs font-semibold uppercase tracking-wide hover:bg-emerald-700 transition-all shadow-lg active:scale-95 shrink-0"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            <span className="hidden sm:inline">Export PDF</span>
            <svg className="w-3 h-3 text-white/60 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>
        </div>

        {/* KPI HUB */}
        <div className="flex flex-wrap lg:flex-nowrap gap-3 sm:gap-4 px-2 sm:px-0">
          <div className={`flex-[1.5] min-w-[280px] p-6 sm:p-8 ${UI_THEME.radius.card} shadow-lg flex flex-col justify-center transition-all duration-500 relative overflow-hidden group ${networkTotals.net >= 0 ? 'bg-slate-900' : 'bg-rose-900'}`}>
            <p className={`${UI_THEME.text.metadata} text-white opacity-40 uppercase tracking-widest`}>Consolidated ROI</p>
            <p className={`font-bold tabular-nums tracking-tighter mt-3 whitespace-nowrap leading-none ${getFontSize(networkTotals.net)} ${networkTotals.net >= 0 ? 'text-emerald-400' : 'text-rose-300'}`}>
              <span className="text-xl sm:text-2xl mr-1 font-medium">₱</span>{networkTotals.net.toLocaleString()}
            </p>
          </div>

          <div className={`flex-1 min-w-[200px] bg-white p-6 sm:p-8 ${UI_THEME.radius.card} border border-slate-200 shadow-sm flex flex-col justify-center`}>
            <p className={`${UI_THEME.text.metadata} opacity-40 uppercase tracking-widest`}>Gross Yield</p>
            <p className={`font-bold text-slate-900 mt-3 tabular-nums tracking-tighter whitespace-nowrap leading-none ${getFontSize(networkTotals.gross)}`}>₱{networkTotals.gross.toLocaleString()}</p>
          </div>

          <div className={`flex-1 min-w-[200px] bg-white p-6 sm:p-8 ${UI_THEME.radius.card} border border-slate-200 shadow-sm flex flex-col justify-center`}>
            <p className={`${UI_THEME.text.metadata} opacity-40 uppercase tracking-widest`}>Payroll Total</p>
            <p className={`font-bold text-amber-600 mt-3 tabular-nums tracking-tighter whitespace-nowrap leading-none ${getFontSize(networkTotals.staffPay)}`}>₱{networkTotals.staffPay.toLocaleString()}</p>
          </div>

          <div className={`flex-1 min-w-[200px] bg-white p-6 sm:p-8 ${UI_THEME.radius.card} border border-slate-200 shadow-sm flex flex-col justify-center`}>
            <p className={`${UI_THEME.text.metadata} opacity-40 uppercase tracking-widest`}>Rent & Bills</p>
            <p className={`font-bold text-indigo-600 mt-3 tabular-nums tracking-tighter whitespace-nowrap leading-none ${getFontSize(networkTotals.vault)}`}>₱{networkTotals.vault.toLocaleString()}</p>
          </div>
        </div>

        {/* DESKTOP TABLE VIEW - ENHANCED READABILITY */}
        <div className={`hidden md:block bg-white ${UI_THEME.radius.card} border border-slate-200 shadow-sm overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-fixed">
              <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className={`px-8 py-5 w-[20%] ${UI_THEME.text.metadata}`}>Branch Node</th>
                <th className={`px-4 py-5 w-[10%] text-center ${UI_THEME.text.metadata}`}>Status</th>
                <th className={`px-4 py-5 w-[8%] text-right ${UI_THEME.text.metadata}`}>Units</th>
                <th className={`px-4 py-5 w-[12%] text-right ${UI_THEME.text.metadata}`}>Gross Yield</th>
                <th className={`px-4 py-5 w-[12%] text-right ${UI_THEME.text.metadata}`}>Payroll</th>
                <th className={`px-4 py-5 w-[12%] text-right ${UI_THEME.text.metadata}`}>Expenses</th>
                <th className={`px-4 py-5 w-[12%] text-right ${UI_THEME.text.metadata}`}>Rent & Bills</th>
                <th className={`px-8 py-5 w-[14%] text-right ${UI_THEME.text.metadata}`}>Net ROI</th>
              </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
              {paginatedStats.length > 0 ? paginatedStats.map((b) => {
                const isPositive = b.net >= 0;
                return (
                    <tr
                        key={b.id}
                        onClick={() => handleRowClick(b)}
                        className={`transition-colors group cursor-pointer ${b.rawReport ? 'hover:bg-slate-50/80' : 'opacity-50 grayscale cursor-not-allowed'}`}
                    >
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${b.isEnabled ? 'bg-slate-100 text-slate-500' : 'bg-rose-50 text-rose-300 grayscale'}`}>🏢</div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-slate-900 uppercase text-sm tracking-tight truncate group-hover:text-emerald-700 transition-colors">{b.name}</p>
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-1">NODE: {b.id.slice(0, 8).toUpperCase()}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-6 text-center">
                        {isToday ? (
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-slate-100 bg-white">
                            <div className={`w-1.5 h-1.5 rounded-full ${b.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
                            <span className={`text-xs font-bold uppercase tracking-wider ${b.isOpen ? 'text-emerald-600' : 'text-slate-400'}`}>{b.isOpen ? 'Live' : 'Off'}</span>
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">—</span>
                        )}
                      </td>
                      <td className="px-4 py-6 text-right">
                        <span className="text-sm font-semibold text-slate-900 tabular-nums">{b.sessionCount}</span>
                      </td>
                      <td className="px-4 py-6 text-right">
                        <span className="text-sm font-bold text-slate-900 tabular-nums">₱{b.gross.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-6 text-right">
                        <span className="text-sm font-semibold text-amber-600 tabular-nums">₱{b.staffPay.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-6 text-right">
                        <span className="text-sm font-semibold text-rose-500 tabular-nums">₱{b.operational.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-6 text-right">
                        <span className="text-sm font-semibold text-indigo-700 tabular-nums">₱{b.vault.toLocaleString()}</span>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <div
                            className={`inline-flex items-center px-4 py-2 rounded-xl border transition-all ${isPositive ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}
                        >
                        <span className={`text-base font-bold tabular-nums leading-none truncate max-w-[120px] block ${isPositive ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {b.net < 0 ? '−' : ''}₱{Math.abs(b.net).toLocaleString()}
                        </span>
                        </div>
                      </td>
                    </tr>
                );
              }) : (
                  <tr>
                    <td colSpan={8} className="py-32 text-center">
                      <div className="flex flex-col items-center gap-4 opacity-20">
                        <div className="text-6xl">🏢</div>
                        <p className="text-sm font-bold uppercase tracking-wide">No matching terminals in registry</p>
                      </div>
                    </td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        </div>

        {/* MOBILE CARD VIEW */}
        <div className="md:hidden flex items-center gap-3 px-3">
          <div className="flex-1 h-px bg-slate-200"></div>
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide shrink-0">Branch Sales Reports</span>
          <div className="flex-1 h-px bg-slate-200"></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:hidden px-3">
          {paginatedStats.map((b) => (
            <div
              key={b.id}
              onClick={() => handleRowClick(b)}
              className={`bg-white ${UI_THEME.radius.card} border border-slate-200 shadow-sm flex flex-col overflow-hidden transition-all duration-200 ${!b.isEnabled ? 'grayscale opacity-70' : ''} ${b.rawReport ? 'cursor-pointer active:scale-[0.98]' : 'cursor-not-allowed opacity-50'}`}
            >
              {/* Header */}
              <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-black text-slate-900 uppercase text-sm tracking-tight leading-tight truncate">{b.name}</h3>
                  {isToday && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${b.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                      <span className={`text-xs font-medium uppercase tracking-wide ${b.isOpen ? 'text-emerald-600' : 'text-slate-400'}`}>{b.isOpen ? 'Live' : 'Offline'}</span>
                    </div>
                  )}
                </div>
                {b.sessionCount > 0 && (
                  <div className="shrink-0 bg-slate-100 rounded-lg px-2 py-1 text-xs font-black text-slate-600 uppercase tracking-wide">
                    {b.sessionCount} clients
                  </div>
                )}
              </div>

              {/* Metric tiles */}
              <div className="grid grid-cols-3 gap-1.5 px-3 pb-3">
                <div className="bg-slate-50 rounded-xl px-2.5 py-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Gross</p>
                  <p className="text-xs font-black text-slate-900 tabular-nums mt-0.5 truncate">₱{b.gross.toLocaleString()}</p>
                </div>
                <div className="bg-amber-50/70 rounded-xl px-2.5 py-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-amber-500">Payroll</p>
                  <p className="text-xs font-black text-amber-600 tabular-nums mt-0.5 truncate">₱{b.staffPay.toLocaleString()}</p>
                </div>
                <div className="bg-rose-50/70 rounded-xl px-2.5 py-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-rose-400">Expenses</p>
                  <p className="text-xs font-black text-rose-500 tabular-nums mt-0.5 truncate">₱{b.operational.toLocaleString()}</p>
                </div>
              </div>

              {/* Floating ROI footer */}
              <div className={`mx-2 mb-2 rounded-xl flex items-center justify-between px-4 py-3 ${b.net >= 0 ? 'bg-slate-800' : 'bg-rose-900'}`}>
                <span className={`text-xs font-medium uppercase tracking-wide ${b.net >= 0 ? 'text-slate-400' : 'text-rose-300/60'}`}>ROI</span>
                <p className={`font-black tabular-nums leading-none ${getMobileFontSize(b.net)} ${b.net >= 0 ? 'text-emerald-400' : 'text-rose-300'}`}>
                  {b.net < 0 ? '−' : ''}₱{Math.abs(b.net).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* MINI STATUS INDICATOR */}
        <div className="flex flex-col items-center gap-2 pt-8 opacity-20 group">
          <p className="text-xs font-black text-slate-400 uppercase tracking-[0.5em]">Synchronized Global Registry v5.2</p>
        </div>

        </div>{/* end main content */}

        {/* ── Late-to-open floating toggle (desktop only, only when there are late branches) ── */}
        {lateToOpenBranches.length > 0 && (
          <div className="hidden lg:block shrink-0 sticky top-24">
            <div className="relative">
              <button
                onClick={() => { setShowLateOpenDropdown(p => !p); playSound('click'); }}
                className="flex items-center gap-2 px-3 py-2 bg-white border border-amber-200 rounded-2xl shadow-sm hover:bg-amber-50 transition-colors whitespace-nowrap"
              >
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                <span className="text-xs font-black text-amber-700 uppercase tracking-widest">
                  {lateToOpenBranches.length} Late
                </span>
                <svg
                  className={`w-3 h-3 text-amber-400 transition-transform duration-200 ${showLateOpenDropdown ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showLateOpenDropdown && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xl z-50">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="text-xs font-black text-amber-700 uppercase tracking-widest leading-none">Late to Open</p>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-0.5">Branches not yet opened today</p>
                  </div>
                  <div className="divide-y divide-slate-50 max-h-[50vh] overflow-y-auto">
                    {lateToOpenBranches.map(b => (
                      <div key={b.id} className="px-4 py-3 flex items-center gap-3">
                        <div className="w-6 h-6 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                          <svg className="w-3 h-3 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-800 uppercase truncate leading-none">{b.name}</p>
                          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-0.5">
                            {b.openingTime ? `Since ${b.openingTime}` : 'Not opened today'}
                          </p>
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