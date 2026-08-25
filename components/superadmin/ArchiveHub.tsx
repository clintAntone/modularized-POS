
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Branch, BranchVault, SalesReport } from '../../types';
import { ReportsMasterSection } from '../dashboard/sections/ReportsMasterSection';
import { playSound } from '../../lib/audio';
import { toDateStr, normalizeDateStr } from '@/src/utils/reportUtils';
import { getTrueDate } from '../../lib/time';
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
  const allowedBranchIdSet = useMemo(() => new Set(branches.map(b => b.id)), [branches]);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>(() => {
    try {
      const saved: string[] = JSON.parse(localStorage.getItem('archive_filter_branches') || '[]');
      const allowed = new Set(branches.map(b => b.id));
      // Clamp to branches available in this session — prevents a superadmin's leftover
      // filter from exposing data that a portal user isn't permitted to see.
      return saved.filter(id => allowed.has(id));
    } catch { return []; }
  });
  // Extra reports loaded on demand (older than the global 30-day window)
  const [olderReports, setOlderReports] = useState<SalesReport[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);

  // Reset older-fetch state whenever the branch filter changes so stale
  // "allLoaded" from a previous selection doesn't block fetching for a new one.
  useEffect(() => {
    setOlderReports([]);
    setAllLoaded(false);
  }, [selectedBranchIds]);

  // Combined reports: global (recent) + older loaded on demand
  const combinedReports = useMemo(() => {
    if (olderReports.length === 0) return salesReports;
    const existingIds = new Set(salesReports.map(r => r.id));
    return [...salesReports, ...olderReports.filter(r => !existingIds.has(r.id))];
  }, [salesReports, olderReports]);

  const sentinelRef = useRef<HTMLDivElement>(null);

  // Filter reports to only selected branches (empty = all) — declared before
  // handleLoadOlder so it can be referenced in the callback's dep array.
  const filteredReports = useMemo(() => {
    if (selectedBranchIds.length === 0) return combinedReports;
    return combinedReports.filter(r => selectedBranchIds.includes(r.branchId));
  }, [combinedReports, selectedBranchIds]);

  const handleLoadOlder = useCallback(async () => {
    if (!supabase || loadingOlder || allLoaded || salesReportsLoading) return;
    setLoadingOlder(true);
    try {
      // Use filteredReports (branch-scoped) to find the oldest visible date so
      // we don't jump past dates that belong to other branches.
      const sourceReports = filteredReports.length > 0 ? filteredReports : combinedReports;
      const allCurrentIds = new Set(combinedReports.map(r => r.id));
      const oldestDate = sourceReports.reduce(
        (min, r) => r.reportDate < min ? r.reportDate : min,
        sourceReports[0]?.reportDate ?? '9999-12-31'
      );

      // Scope query to the active branch filter when set, else all known branches.
      // Always intersect with allowedBranchIdSet so that stale localStorage selections
      // from a previous superadmin session cannot pull data outside this user's scope.
      const allowedIds = branches.map(b => b.id).filter(id => id !== 'all');
      const queryBranchIds = selectedBranchIds.length > 0
        ? selectedBranchIds.filter(id => allowedBranchIdSet.has(id))
        : allowedIds;

      let query = supabase
        .from(DB_TABLES.SALES_REPORTS)
        .select('*')
        .lt(DB_COLUMNS.REPORT_DATE, oldestDate)
        .order(DB_COLUMNS.REPORT_DATE, { ascending: false })
        .order(DB_COLUMNS.SUBMITTED_AT, { ascending: false })
        .limit(500);
      if (queryBranchIds.length > 0) {
        query = query.in(DB_COLUMNS.BRANCH_ID, queryBranchIds);
      }
      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) { setAllLoaded(true); return; }
      if (data.length < 500) setAllLoaded(true);

      const mapped: SalesReport[] = data
        .filter((r: any) => !allCurrentIds.has(r[DB_COLUMNS.ID]) && allowedBranchIdSet.has(r[DB_COLUMNS.BRANCH_ID]))
        .map((r: any) => ({
          id: r[DB_COLUMNS.ID], branchId: r[DB_COLUMNS.BRANCH_ID], reportDate: normalizeDateStr(r[DB_COLUMNS.REPORT_DATE]),
          submittedAt: r[DB_COLUMNS.SUBMITTED_AT],
          grossSales: Number(r[DB_COLUMNS.GROSS_SALES] ?? 0),
          totalStaffPay: Number(r[DB_COLUMNS.TOTAL_STAFF_PAY] ?? 0),
          totalExpenses: Number(r[DB_COLUMNS.TOTAL_EXPENSES] ?? 0),
          totalVaultProvision: Number(r[DB_COLUMNS.TOTAL_VAULT_PROVISION] ?? 0),
          netRoi: Number(r[DB_COLUMNS.NET_ROI] ?? 0),
          backfilled: r[DB_COLUMNS.BACKFILLED] === true,
          sessionData: typeof r[DB_COLUMNS.SESSION_DATA] === 'string' ? JSON.parse(r[DB_COLUMNS.SESSION_DATA]) : (r[DB_COLUMNS.SESSION_DATA] || []),
          staffBreakdown: typeof r[DB_COLUMNS.STAFF_BREAKDOWN] === 'string' ? JSON.parse(r[DB_COLUMNS.STAFF_BREAKDOWN]) : (r[DB_COLUMNS.STAFF_BREAKDOWN] || []),
          expenseData: typeof r[DB_COLUMNS.EXPENSE_DATA] === 'string' ? JSON.parse(r[DB_COLUMNS.EXPENSE_DATA]) : (r[DB_COLUMNS.EXPENSE_DATA] || []),
          vaultData: typeof r[DB_COLUMNS.VAULT_DATA] === 'string' ? JSON.parse(r[DB_COLUMNS.VAULT_DATA]) : (r[DB_COLUMNS.VAULT_DATA] || []),
        }));
      setOlderReports(prev => [...prev, ...mapped]);
    } finally {
      setLoadingOlder(false);
    }
  }, [filteredReports, combinedReports, selectedBranchIds, branches, allowedBranchIdSet, loadingOlder, allLoaded, salesReportsLoading]);

  // Trigger load when sentinel scrolls into view. Re-attaches after each load
  // so if the sentinel is still in the viewport it fires again immediately.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) handleLoadOlder(); },
      { rootMargin: '400px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleLoadOlder, loadingOlder, allLoaded]);

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
    cycleStartDate: branches.length > 0 ? branches[0].cycleStartDate : toDateStr(getTrueDate())
  } as Branch), [branches]);

  // When exactly 1 branch is selected, show that branch's view; otherwise show consolidated
  const activeBranch = useMemo(() => {
    if (selectedBranchIds.length === 1) {
      return branches.find(b => b.id === selectedBranchIds[0]) || consolidatedBranch;
    }
    return consolidatedBranch;
  }, [selectedBranchIds, branches, consolidatedBranch]);

  return (
      <div className="space-y-6 md:space-y-8">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12h12l1-12" /></svg>
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-tighter">Reports History</h3>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Historical Data Explorer</p>
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
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Loading older reports…</span>
              </>
            )}
          </div>
        )}
        {allLoaded && olderReports.length > 0 && (
          <p className="text-center text-xs font-bold text-slate-300 uppercase tracking-widest pb-4">All historical reports loaded</p>
        )}
      </div>
  );
};
