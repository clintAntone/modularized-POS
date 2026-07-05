import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Branch, BranchVault, Employee, SalesReport } from '../../../types';
import { ReportsMasterSection } from './ReportsMasterSection';
import { supabase } from '../../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';
import { normalizeDateStr } from '@/src/utils/reportUtils';

interface BranchReportsTabProps {
  branch: Branch;
  salesReports: SalesReport[];
  salesReportsLoading?: boolean;
  branches: Branch[];
  employees: Employee[];
  branchVault: BranchVault | null;
}

export const BranchReportsTab: React.FC<BranchReportsTabProps> = ({
  branch,
  salesReports,
  salesReportsLoading = false,
  branches,
  employees,
  branchVault,
}) => {
  const [olderReports, setOlderReports] = useState<SalesReport[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset when branch changes
  useEffect(() => {
    setOlderReports([]);
    setAllLoaded(false);
  }, [branch.id]);

  const combinedReports = useMemo(() => {
    if (olderReports.length === 0) return salesReports;
    const existingIds = new Set(salesReports.map(r => r.id));
    return [...salesReports, ...olderReports.filter(r => !existingIds.has(r.id))];
  }, [salesReports, olderReports]);

  const handleLoadOlder = useCallback(async () => {
    if (!supabase || loadingOlder || allLoaded || salesReportsLoading) return;
    setLoadingOlder(true);
    try {
      const allCurrentIds = new Set(combinedReports.map(r => r.id));
      const oldestDate = combinedReports.reduce(
        (min, r) => (r.reportDate < min ? r.reportDate : min),
        combinedReports[0]?.reportDate ?? '9999-12-31'
      );

      const { data, error } = await supabase
        .from(DB_TABLES.SALES_REPORTS)
        .select('*')
        .eq(DB_COLUMNS.BRANCH_ID, branch.id)
        .lt(DB_COLUMNS.REPORT_DATE, oldestDate)
        .order(DB_COLUMNS.REPORT_DATE, { ascending: false })
        .order(DB_COLUMNS.SUBMITTED_AT, { ascending: false })
        .limit(500);

      if (error) throw error;
      if (!data || data.length === 0) { setAllLoaded(true); return; }
      if (data.length < 500) setAllLoaded(true);

      const mapped: SalesReport[] = data
        .filter((r: any) => !allCurrentIds.has(r[DB_COLUMNS.ID]))
        .map((r: any) => ({
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
        }));

      setOlderReports(prev => [...prev, ...mapped]);
    } finally {
      setLoadingOlder(false);
    }
  }, [combinedReports, branch.id, loadingOlder, allLoaded, salesReportsLoading]);

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

  return (
    <div className="space-y-4">
      <ReportsMasterSection
        branch={branch}
        salesReports={combinedReports}
        isLoading={salesReportsLoading}
        branches={branches}
        employees={employees}
        branchVault={branchVault}
      />

      {!allLoaded && (
        <div ref={sentinelRef} className="flex items-center justify-center py-4 gap-3">
          {loadingOlder && (
            <>
              <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading older reports…</span>
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
