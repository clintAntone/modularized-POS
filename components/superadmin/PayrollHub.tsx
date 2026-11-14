import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '../../hooks/useDebounce';
import { Branch, Transaction, Expense, Employee, Attendance, SalesReport } from '../../types';
import { playSound } from '../../lib/audio';
import { PayrollSection } from '../dashboard/sections/PayrollSection';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { getTrueDate } from '../../lib/time';

interface PayrollHubProps {
  branches: Branch[];
  transactions: Transaction[];
  expenses: Expense[];
  employees: Employee[];
  attendance: Attendance[];
  salesReports: SalesReport[];
  onRefresh?: () => void;
}

const EMPLOYEE_COLS = [
  DB_COLUMNS.ID, DB_COLUMNS.BRANCH_ID, DB_COLUMNS.NAME, DB_COLUMNS.FIRST_NAME,
  DB_COLUMNS.MIDDLE_NAME, DB_COLUMNS.LAST_NAME, DB_COLUMNS.USERNAME, DB_COLUMNS.LOGIN_PIN,
  DB_COLUMNS.REQUEST_RESET, DB_COLUMNS.ROLE, DB_COLUMNS.ALLOWANCE, DB_COLUMNS.IS_ACTIVE,
  DB_COLUMNS.PROFILE, DB_COLUMNS.BRANCH_ALLOWANCES, DB_COLUMNS.TIMESTAMP, DB_COLUMNS.CREATED_AT,
  DB_COLUMNS.ON_LEAVE, DB_COLUMNS.LEAVE_TYPE, DB_COLUMNS.LEAVE_START_DATE, DB_COLUMNS.LEAVE_END_DATE,
].join(',');

const ATTENDANCE_COLS = [
  DB_COLUMNS.ID, DB_COLUMNS.BRANCH_ID, DB_COLUMNS.EMPLOYEE_ID,
  DB_COLUMNS.STAFF_NAME, DB_COLUMNS.DATE, DB_COLUMNS.CLOCK_IN, DB_COLUMNS.CLOCK_OUT,
  DB_COLUMNS.CLOCK_IN_METHOD, DB_COLUMNS.CLOCK_IN_PHOTO_URL, DB_COLUMNS.STATUS,
  DB_COLUMNS.LATE_DEDUCTION, DB_COLUMNS.OT_PAY, DB_COLUMNS.CASH_ADVANCE,
  DB_COLUMNS.IS_HALF_DAY, DB_COLUMNS.CREATED_AT, DB_COLUMNS.SHIFT,
].join(',');

const EXPENSE_COLS = [
  DB_COLUMNS.ID, DB_COLUMNS.BRANCH_ID, DB_COLUMNS.TIMESTAMP,
  DB_COLUMNS.NAME, DB_COLUMNS.AMOUNT, DB_COLUMNS.CATEGORY, DB_COLUMNS.RECEIPT_IMAGE,
].join(',');

const SALES_REPORT_COLS = [
  DB_COLUMNS.ID, DB_COLUMNS.BRANCH_ID, DB_COLUMNS.REPORT_DATE, DB_COLUMNS.SUBMITTED_AT,
  DB_COLUMNS.GROSS_SALES, DB_COLUMNS.TOTAL_STAFF_PAY, DB_COLUMNS.TOTAL_EXPENSES,
  DB_COLUMNS.TOTAL_VAULT_PROVISION, DB_COLUMNS.NET_ROI,
  DB_COLUMNS.SESSION_DATA, DB_COLUMNS.STAFF_BREAKDOWN, DB_COLUMNS.EXPENSE_DATA,
  DB_COLUMNS.VAULT_DATA, DB_COLUMNS.BACKFILLED,
].join(',');

const TRANSACTION_COLS = [
  DB_COLUMNS.ID, DB_COLUMNS.BRANCH_ID, DB_COLUMNS.TIMESTAMP,
  DB_COLUMNS.CLIENT_NAME, DB_COLUMNS.THERAPIST_NAME, DB_COLUMNS.THERAPIST_ID,
  DB_COLUMNS.BONESETTER_NAME, DB_COLUMNS.BONESETTER_ID,
  DB_COLUMNS.SERVICE_ID, DB_COLUMNS.SERVICE_NAME, DB_COLUMNS.BASE_PRICE,
  DB_COLUMNS.DISCOUNT, DB_COLUMNS.VOUCHER_VALUE,
  DB_COLUMNS.PRIMARY_COMMISSION, DB_COLUMNS.SECONDARY_COMMISSION,
  DB_COLUMNS.TOTAL, DB_COLUMNS.PAYMENT_METHOD, DB_COLUMNS.PAYMENT_STATUS, DB_COLUMNS.NOTE,
].join(',');

export const PayrollHub: React.FC<PayrollHubProps> = ({
  branches,
  transactions,
  expenses,
  employees,
  attendance,
  salesReports,
  onRefresh,
}) => {
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);

  const lookback90 = useMemo(() => {
    const d = getTrueDate();
    d.setDate(d.getDate() - 90);
    return d.toISOString();
  }, []);

  const lookback90Ymd = useMemo(() => {
    const d = getTrueDate();
    d.setDate(d.getDate() - 90);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d);
  }, []);

  // Fetch all branch-specific data in one parallel shot when a branch is selected.
  // Only fires when the global props are empty (superadmin view).
  const needsSelfFetch = !!selectedBranchId && (
    transactions.length === 0 || employees.length === 0 ||
    attendance.length === 0 || expenses.length === 0 || salesReports.length === 0
  );

  const { data: fetchedData, isLoading: isFetching } = useQuery({
    queryKey: ['payrollHub_all', selectedBranchId],
    queryFn: async () => {
      if (!supabase || !selectedBranchId) return null;

      const [txRes, empRes, attRes, expRes, srpRes] = await Promise.all([
        supabase.from(DB_TABLES.TRANSACTIONS)
          .select(TRANSACTION_COLS)
          .eq(DB_COLUMNS.BRANCH_ID, selectedBranchId)
          .order(DB_COLUMNS.TIMESTAMP, { ascending: false })
          .gte(DB_COLUMNS.TIMESTAMP, lookback90)
          .limit(2000),
        supabase.from(DB_TABLES.EMPLOYEES)
          .select(EMPLOYEE_COLS)
          .eq(DB_COLUMNS.BRANCH_ID, selectedBranchId)
          .order(DB_COLUMNS.NAME, { ascending: true }),
        supabase.from(DB_TABLES.ATTENDANCE)
          .select(ATTENDANCE_COLS)
          .eq(DB_COLUMNS.BRANCH_ID, selectedBranchId)
          .order(DB_COLUMNS.CLOCK_IN, { ascending: false })
          .gte(DB_COLUMNS.CLOCK_IN, lookback90)
          .limit(1000),
        supabase.from(DB_TABLES.EXPENSES)
          .select(EXPENSE_COLS)
          .eq(DB_COLUMNS.BRANCH_ID, selectedBranchId)
          .order(DB_COLUMNS.TIMESTAMP, { ascending: false })
          .gte(DB_COLUMNS.TIMESTAMP, lookback90)
          .limit(1000),
        supabase.from(DB_TABLES.SALES_REPORTS)
          .select(SALES_REPORT_COLS)
          .eq(DB_COLUMNS.BRANCH_ID, selectedBranchId)
          .order(DB_COLUMNS.REPORT_DATE, { ascending: false })
          .gte(DB_COLUMNS.REPORT_DATE, lookback90Ymd)
          .limit(2000),
      ]);

      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(getTrueDate());

      return {
        transactions: (txRes.data || []).map((t: any) => ({
          id: t[DB_COLUMNS.ID], branchId: t[DB_COLUMNS.BRANCH_ID], timestamp: t[DB_COLUMNS.TIMESTAMP],
          clientName: t[DB_COLUMNS.CLIENT_NAME], therapistName: t[DB_COLUMNS.THERAPIST_NAME],
          therapistId: t[DB_COLUMNS.THERAPIST_ID], bonesetterName: t[DB_COLUMNS.BONESETTER_NAME],
          bonesetterId: t[DB_COLUMNS.BONESETTER_ID], serviceId: t[DB_COLUMNS.SERVICE_ID],
          serviceName: t[DB_COLUMNS.SERVICE_NAME], basePrice: Number(t[DB_COLUMNS.BASE_PRICE] || 0),
          discount: Number(t[DB_COLUMNS.DISCOUNT] || 0), voucherValue: Number(t[DB_COLUMNS.VOUCHER_VALUE] || 0),
          primaryCommission: Number(t[DB_COLUMNS.PRIMARY_COMMISSION] || 0),
          secondaryCommission: Number(t[DB_COLUMNS.SECONDARY_COMMISSION] || 0),
          total: Number(t[DB_COLUMNS.TOTAL] || 0), paymentMethod: t[DB_COLUMNS.PAYMENT_METHOD],
          paymentStatus: t[DB_COLUMNS.PAYMENT_STATUS], note: t[DB_COLUMNS.NOTE], signatureUrl: undefined,
        })),
        employees: (empRes.data || []).map((e: any) => {
          const dbOnLeave = e[DB_COLUMNS.ON_LEAVE] === true;
          const endDate: string | null = e[DB_COLUMNS.LEAVE_END_DATE] ?? null;
          const onLeave = dbOnLeave && (!endDate || endDate >= today);
          return {
            id: e[DB_COLUMNS.ID], branchId: e[DB_COLUMNS.BRANCH_ID], name: e[DB_COLUMNS.NAME],
            firstName: e[DB_COLUMNS.FIRST_NAME], middleName: e[DB_COLUMNS.MIDDLE_NAME],
            lastName: e[DB_COLUMNS.LAST_NAME], username: e[DB_COLUMNS.USERNAME],
            hasPinSet: Boolean(e[DB_COLUMNS.LOGIN_PIN]), requestReset: Boolean(e[DB_COLUMNS.REQUEST_RESET]),
            role: e[DB_COLUMNS.ROLE], allowance: Number(e[DB_COLUMNS.ALLOWANCE] || 0),
            isActive: e[DB_COLUMNS.IS_ACTIVE] !== false, profile: e[DB_COLUMNS.PROFILE],
            branchAllowances: typeof e[DB_COLUMNS.BRANCH_ALLOWANCES] === 'string'
              ? JSON.parse(e[DB_COLUMNS.BRANCH_ALLOWANCES]) : (e[DB_COLUMNS.BRANCH_ALLOWANCES] || {}),
            timestamp: e[DB_COLUMNS.TIMESTAMP] || e[DB_COLUMNS.CREATED_AT],
            onLeave, leaveType: e[DB_COLUMNS.LEAVE_TYPE] ?? undefined,
            leaveStartDate: e[DB_COLUMNS.LEAVE_START_DATE] ?? undefined, leaveEndDate: endDate ?? undefined,
          };
        }),
        attendance: (attRes.data || []).map((att: any) => ({
          id: att[DB_COLUMNS.ID], branchId: att[DB_COLUMNS.BRANCH_ID], employeeId: att[DB_COLUMNS.EMPLOYEE_ID],
          staffName: att[DB_COLUMNS.STAFF_NAME], date: att[DB_COLUMNS.DATE],
          clockIn: att[DB_COLUMNS.CLOCK_IN], clockOut: att[DB_COLUMNS.CLOCK_OUT],
          clockInMethod: att[DB_COLUMNS.CLOCK_IN_METHOD] ?? undefined,
          clockInPhotoUrl: att[DB_COLUMNS.CLOCK_IN_PHOTO_URL] ?? undefined,
          status: att[DB_COLUMNS.STATUS], lateDeduction: Number(att[DB_COLUMNS.LATE_DEDUCTION] || 0),
          otPay: Number(att[DB_COLUMNS.OT_PAY] || 0), cashAdvance: Number(att[DB_COLUMNS.CASH_ADVANCE] || 0),
          isHalfDay: Boolean(att[DB_COLUMNS.IS_HALF_DAY]), createdAt: att[DB_COLUMNS.CREATED_AT],
          shift: att[DB_COLUMNS.SHIFT] ? Number(att[DB_COLUMNS.SHIFT]) as 1 | 2 : undefined,
        })),
        expenses: (expRes.data || []).map((e: any) => ({
          id: e[DB_COLUMNS.ID], branchId: e[DB_COLUMNS.BRANCH_ID], timestamp: e[DB_COLUMNS.TIMESTAMP],
          name: e[DB_COLUMNS.NAME], amount: Number(e[DB_COLUMNS.AMOUNT] || 0),
          category: e[DB_COLUMNS.CATEGORY], receiptImage: e[DB_COLUMNS.RECEIPT_IMAGE],
        })),
        salesReports: (srpRes.data || []).map((r: any) => ({
          id: r[DB_COLUMNS.ID], branchId: r[DB_COLUMNS.BRANCH_ID], reportDate: r[DB_COLUMNS.REPORT_DATE],
          submittedAt: r[DB_COLUMNS.SUBMITTED_AT],
          grossSales: Number(r[DB_COLUMNS.GROSS_SALES] ?? 0), totalStaffPay: Number(r[DB_COLUMNS.TOTAL_STAFF_PAY] ?? 0),
          totalExpenses: Number(r[DB_COLUMNS.TOTAL_EXPENSES] ?? 0),
          totalVaultProvision: Number(r[DB_COLUMNS.TOTAL_VAULT_PROVISION] ?? 0),
          netRoi: Number(r[DB_COLUMNS.NET_ROI] ?? 0), backfilled: r[DB_COLUMNS.BACKFILLED] === true,
          sessionData: typeof r[DB_COLUMNS.SESSION_DATA] === 'string' ? JSON.parse(r[DB_COLUMNS.SESSION_DATA]) : (r[DB_COLUMNS.SESSION_DATA] || []),
          staffBreakdown: typeof r[DB_COLUMNS.STAFF_BREAKDOWN] === 'string' ? JSON.parse(r[DB_COLUMNS.STAFF_BREAKDOWN]) : (r[DB_COLUMNS.STAFF_BREAKDOWN] || []),
          expenseData: typeof r[DB_COLUMNS.EXPENSE_DATA] === 'string' ? JSON.parse(r[DB_COLUMNS.EXPENSE_DATA]) : (r[DB_COLUMNS.EXPENSE_DATA] || []),
          vaultData: typeof r[DB_COLUMNS.VAULT_DATA] === 'string' ? JSON.parse(r[DB_COLUMNS.VAULT_DATA]) : (r[DB_COLUMNS.VAULT_DATA] || []),
        })),
      };
    },
    enabled: needsSelfFetch,
    staleTime: 2 * 60 * 1000,
  });

  const effectiveTransactions = needsSelfFetch ? (fetchedData?.transactions ?? []) : transactions;
  const effectiveEmployees   = needsSelfFetch ? (fetchedData?.employees   ?? []) : employees;
  const effectiveAttendance  = needsSelfFetch ? (fetchedData?.attendance  ?? []) : attendance;
  const effectiveExpenses    = needsSelfFetch ? (fetchedData?.expenses    ?? []) : expenses;
  const effectiveSalesReports = needsSelfFetch ? (fetchedData?.salesReports ?? []) : salesReports;

  const filteredBranches = useMemo(() =>
    branches
      .filter(b =>
        b.name.toUpperCase().includes(debouncedSearch.toUpperCase()) ||
        b.id.toUpperCase().includes(debouncedSearch.toUpperCase())
      )
      .sort((a, b) => a.name.localeCompare(b.name)),
    [branches, debouncedSearch]
  );

  const selectedBranch = useMemo(() =>
    branches.find(b => b.id === selectedBranchId),
    [branches, selectedBranchId]
  );

  if (selectedBranch) {
    // Loading skeleton while data is being fetched
    if (needsSelfFetch && isFetching) {
      return (
        <div className="space-y-6">
          {/* Back header */}
          <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSelectedBranchId(null)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors text-slate-400 hover:text-slate-900"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-tight">{selectedBranch.name}</h3>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Loading payroll data…</p>
              </div>
            </div>
            <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
          </div>

          {/* KPI strip skeleton */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-4 shadow-sm space-y-2 animate-pulse">
                <div className="h-2.5 w-20 bg-slate-200 dark:bg-slate-700 rounded-full" />
                <div className="h-6 w-28 bg-slate-200 dark:bg-slate-700 rounded-full" />
                <div className="h-2 w-16 bg-slate-100 dark:bg-slate-700/60 rounded-full" />
              </div>
            ))}
          </div>

          {/* Table skeleton */}
          <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden animate-pulse">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-3">
              <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded-full" />
              <div className="h-4 w-20 bg-slate-100 dark:bg-slate-700/60 rounded-full" />
            </div>
            <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-36 bg-slate-200 dark:bg-slate-700 rounded-full" />
                    <div className="h-2.5 w-24 bg-slate-100 dark:bg-slate-700/60 rounded-full" />
                  </div>
                  <div className="h-4 w-20 bg-slate-100 dark:bg-slate-700/60 rounded-full" />
                  <div className="h-4 w-16 bg-slate-100 dark:bg-slate-700/60 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSelectedBranchId(null)}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors text-slate-400 hover:text-slate-900"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-tight">{selectedBranch.name}</h3>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Branch Payroll Management</p>
            </div>
          </div>
        </div>

        <PayrollSection
          branch={selectedBranch}
          transactions={effectiveTransactions}
          expenses={effectiveExpenses}
          attendance={effectiveAttendance}
          employees={effectiveEmployees}
          salesReports={effectiveSalesReports}
          onRefresh={onRefresh}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-tight">Global Payroll Hub</h3>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Network-wide Compensation Audit</p>
            </div>
          </div>

          <div className="relative group max-w-md w-full">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-emerald-500 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <input
              type="text"
              placeholder="SEARCH BRANCH..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl text-xs font-medium uppercase tracking-wide focus:bg-white dark:focus:bg-slate-600 focus:border-emerald-500 transition-all outline-none dark:text-white dark:placeholder-slate-400"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBranches.map(branch => (
          <button
            key={branch.id}
            onClick={() => { playSound('click'); setSelectedBranchId(branch.id); }}
            className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-xl hover:border-emerald-500 transition-all duration-300 text-left group"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-slate-50 dark:bg-slate-700 rounded-xl flex items-center justify-center text-xl group-hover:bg-emerald-50 transition-colors">🏢</div>
              <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-700 px-2 py-1 rounded-lg border border-slate-100 dark:border-slate-600">
                <div className={`w-1.5 h-1.5 rounded-full ${branch.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{branch.isOpen ? 'LIVE' : 'OFF'}</span>
              </div>
            </div>

            <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-tight group-hover:text-emerald-700 transition-colors">{branch.name}</h4>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-1">Manager: {branch.manager || 'Unassigned'}</p>

            <div className="mt-6 flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-slate-300 dark:text-slate-500 uppercase tracking-widest">Weekly Cutoff</p>
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][Number(branch.weeklyCutoff)]}
                </p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-700 flex items-center justify-center text-slate-300 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M9 5l7 7-7 7" /></svg>
              </div>
            </div>
          </button>
        ))}
      </div>

      {filteredBranches.length === 0 && (
        <div className="py-20 text-center bg-white dark:bg-slate-800 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">No branches found matching your search</p>
        </div>
      )}
    </div>
  );
};
