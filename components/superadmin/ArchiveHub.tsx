
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Branch, BranchVault, SalesReport } from '../../types';
import { ReportsMasterSection } from '../dashboard/sections/ReportsMasterSection';
import { playSound } from '../../lib/audio';
import { toDateStr } from '@/src/utils/reportUtils';
import { BranchCheckboxDropdown } from '../shared/BranchCheckboxDropdown';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';

interface ArchiveHubProps {
  branches: Branch[];
  salesReports: SalesReport[];
  salesReportsLoading?: boolean;
  employees?: any[];
  isReadOnly?: boolean;
  onRefresh?: () => void;
}

export const ArchiveHub: React.FC<ArchiveHubProps> = ({ branches, salesReports, salesReportsLoading = false, employees = [], isReadOnly, onRefresh }) => {
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('archive_filter_branches') || '[]'); } catch { return []; }
  });
  // Extra reports loaded on demand (older than the global 90-day window)
  const [olderReports, setOlderReports] = useState<SalesReport[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);

  // Combined reports: global (recent) + older loaded on demand
  const combinedReports = useMemo(() => {
    if (olderReports.length === 0) return salesReports;
    const existingIds = new Set(salesReports.map(r => r.id));
    return [...salesReports, ...olderReports.filter(r => !existingIds.has(r.id))];
  }, [salesReports, olderReports]);

  const sentinelRef = useRef<HTMLDivElement>(null);

  const handleLoadOlder = useCallback(async () => {
    if (!supabase || loadingOlder || allLoaded || salesReportsLoading) return;
    setLoadingOlder(true);
    try {
      // Find oldest date currently loaded, fetch everything before it
      const allCurrentIds = new Set(combinedReports.map(r => r.id));
      const oldestDate = combinedReports.reduce((min, r) => r.reportDate < min ? r.reportDate : min,
        combinedReports[0]?.reportDate ?? '9999-12-31');

      const scopedBranchIds = branches.map(b => b.id).filter(id => id !== 'all');
      let query = supabase
        .from(DB_TABLES.SALES_REPORTS)
        .select('*')
        .lt(DB_COLUMNS.REPORT_DATE, oldestDate)
        .order(DB_COLUMNS.REPORT_DATE, { ascending: false })
        .limit(500);
      if (scopedBranchIds.length > 0) {
        query = query.in(DB_COLUMNS.BRANCH_ID, scopedBranchIds);
      }
      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) { setAllLoaded(true); return; }
      if (data.length < 500) setAllLoaded(true);

      const mapped: SalesReport[] = data
        .filter((r: any) => !allCurrentIds.has(r[DB_COLUMNS.ID]))
        .map((r: any) => ({
          id: r[DB_COLUMNS.ID], branchId: r[DB_COLUMNS.BRANCH_ID], reportDate: r[DB_COLUMNS.REPORT_DATE],
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
        }));
      setOlderReports(prev => [...prev, ...mapped]);
    } finally {
      setLoadingOlder(false);
    }
  }, [combinedReports, loadingOlder, allLoaded]);

  // Trigger load when sentinel scrolls into view
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) handleLoadOlder(); },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleLoadOlder]);

  useEffect(() => {
    localStorage.setItem('archive_filter_branches', JSON.stringify(selectedBranchIds));
  }, [selectedBranchIds]);

  const { data: branchVaults = [] } = useQuery<BranchVault[]>({
    queryKey: ['all_branch_vaults'],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from(DB_TABLES.BRANCH_VAULTS)
        .select(`${DB_COLUMNS.BRANCH_ID}, ${DB_COLUMNS.VAULT_TARGET}, ${DB_COLUMNS.VAULT_BALANCE}, ${DB_COLUMNS.VAULT_INITIAL_BALANCE}, ${DB_COLUMNS.VAULT_START_DATE}`);
      if (error) throw error;
      return (data || []).map((r: any) => ({
        branchId: r[DB_COLUMNS.BRANCH_ID],
        target: Number(r[DB_COLUMNS.VAULT_TARGET] ?? 0),
        balance: Number(r[DB_COLUMNS.VAULT_BALANCE] ?? 0),
        initialBalance: Number(r[DB_COLUMNS.VAULT_INITIAL_BALANCE] ?? 0),
        lastDepositedDate: null,
        startDate: r[DB_COLUMNS.VAULT_START_DATE] ?? null,
      }));
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const consolidatedBranch = useMemo(() => ({
    id: 'all',
    name: 'NETWORK CONSOLIDATED',
    pin: '000000',
    isPinChanged: true,
    isEnabled: true,
    services: [],
    weeklyCutoff: 0,
    cycleStartDate: branches.length > 0 ? branches[0].cycleStartDate : toDateStr(new Date())
  } as Branch), [branches]);

  // When exactly 1 branch is selected, show that branch's view; otherwise show consolidated
  const activeBranch = useMemo(() => {
    if (selectedBranchIds.length === 1) {
      return branches.find(b => b.id === selectedBranchIds[0]) || consolidatedBranch;
    }
    return consolidatedBranch;
  }, [selectedBranchIds, branches, consolidatedBranch]);

  // Filter reports to only selected branches (empty = all)
  const filteredReports = useMemo(() => {
    if (selectedBranchIds.length === 0) return combinedReports;
    return combinedReports.filter(r => selectedBranchIds.includes(r.branchId));
  }, [combinedReports, selectedBranchIds]);

  return (
      <div className="space-y-6 md:space-y-8">
        <div className="bg-white p-4 rounded-[24px] border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12h12l1-12" /></svg>
            </div>
            <div>
              <h3 className="text-[14px] font-black text-slate-900 uppercase tracking-tighter">Reports History</h3>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Historical Data Explorer</p>
            </div>
          </div>

          <BranchCheckboxDropdown
            branches={branches}
            selectedIds={selectedBranchIds}
            onChange={ids => { setSelectedBranchIds(ids); playSound('click'); }}
            placeholder="Network (All Branches)"
            className="w-full sm:w-64"
          />
        </div>

        <ReportsMasterSection
            branch={activeBranch}
            salesReports={filteredReports}
            isLoading={salesReportsLoading}
            branches={branches}
            branchVaults={branchVaults}
            employees={employees}
            canEdit={!isReadOnly}
            canValidate={!isReadOnly}
            canDelete={!isReadOnly}
            onDeleted={onRefresh}
        />

        {/* Infinite scroll sentinel — triggers older report fetch when scrolled into view */}
        {!allLoaded && (
          <div ref={sentinelRef} className="flex items-center justify-center py-6 gap-3">
            {loadingOlder && (
              <>
                <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Loading older reports…</span>
              </>
            )}
          </div>
        )}
        {allLoaded && olderReports.length > 0 && (
          <p className="text-center text-[9px] font-bold text-slate-300 uppercase tracking-widest pb-4">All historical reports loaded</p>
        )}
      </div>
  );
};
