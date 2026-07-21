import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Branch, BranchVault, Transaction, Expense, Employee, SalesReport, AuditLog, Attendance, AuthState, UserRole, EmployeeComplaint } from '../types';
import { APP_NAME } from '../constants';
import { DB_TABLES, DB_COLUMNS } from '../constants/db_schema';
import { supabase } from '../lib/supabase';
import { playSound } from '../lib/audio';
import { getTrueDate } from '../lib/time';
import { normalizeDateStr } from '../src/utils/reportUtils';
import { withOfflineCache, putOne, putBatch, getAll, setLastSync, STORES } from '../lib/offlineDb';

const OFFLINE_QUEUE_KEY = 'hilot_core_pending_sync_v1';


// Explicit column lists — avoids over-fetching with select('*')
const COLS = {
    branches: [
        DB_COLUMNS.ID, DB_COLUMNS.NAME, DB_COLUMNS.PIN, DB_COLUMNS.IS_PIN_CHANGED,
        DB_COLUMNS.IS_ENABLED, DB_COLUMNS.IS_OPEN, DB_COLUMNS.IS_OPEN_DATE,
        DB_COLUMNS.MANAGER, DB_COLUMNS.TEMP_MANAGER, DB_COLUMNS.SERVICES,
        DB_COLUMNS.WEEKLY_CUTOFF, DB_COLUMNS.CYCLE_START_DATE, DB_COLUMNS.DAILY_PROVISION_AMOUNT,
        DB_COLUMNS.OPENING_TIME, DB_COLUMNS.CLOSING_TIME,
        DB_COLUMNS.ADDRESS, DB_COLUMNS.PIN_LOCATION,
        DB_COLUMNS.SHIFT2_OPENING_TIME, DB_COLUMNS.SHIFT2_CLOSING_TIME,
        DB_COLUMNS.OWNERS, DB_COLUMNS.GROUP_LEVY, DB_COLUMNS.REFRESH_SIGNAL, DB_COLUMNS.VAULT_ENABLED, DB_COLUMNS.CUTOFF_HISTORY,
    ].join(','),
    employees: [
        DB_COLUMNS.ID, DB_COLUMNS.BRANCH_ID, DB_COLUMNS.NAME, DB_COLUMNS.FIRST_NAME,
        DB_COLUMNS.MIDDLE_NAME, DB_COLUMNS.LAST_NAME, DB_COLUMNS.USERNAME, DB_COLUMNS.LOGIN_PIN,
        DB_COLUMNS.REQUEST_RESET, DB_COLUMNS.ROLE, DB_COLUMNS.ALLOWANCE, DB_COLUMNS.IS_ACTIVE,
        DB_COLUMNS.PROFILE, DB_COLUMNS.BRANCH_ALLOWANCES, DB_COLUMNS.TIMESTAMP, DB_COLUMNS.CREATED_AT,
        DB_COLUMNS.DETAILS, DB_COLUMNS.FACE_DESCRIPTORS,
        DB_COLUMNS.ON_LEAVE, DB_COLUMNS.LEAVE_TYPE, DB_COLUMNS.LEAVE_START_DATE, DB_COLUMNS.LEAVE_END_DATE,
    ].join(','),
    transactions: [
        DB_COLUMNS.ID, DB_COLUMNS.BRANCH_ID, DB_COLUMNS.TIMESTAMP,
        DB_COLUMNS.CLIENT_NAME, DB_COLUMNS.THERAPIST_NAME, DB_COLUMNS.THERAPIST_ID,
        DB_COLUMNS.BONESETTER_NAME, DB_COLUMNS.BONESETTER_ID,
        DB_COLUMNS.SERVICE_ID, DB_COLUMNS.SERVICE_NAME, DB_COLUMNS.BASE_PRICE,
        DB_COLUMNS.DISCOUNT, DB_COLUMNS.VOUCHER_VALUE,
        DB_COLUMNS.PRIMARY_COMMISSION, DB_COLUMNS.SECONDARY_COMMISSION,
        DB_COLUMNS.TOTAL, DB_COLUMNS.PAYMENT_METHOD, DB_COLUMNS.PAYMENT_STATUS,
        DB_COLUMNS.PAYMONGO_LINK_ID, DB_COLUMNS.NOTE,
    ].join(','),
    expenses: [
        DB_COLUMNS.ID, DB_COLUMNS.BRANCH_ID, DB_COLUMNS.TIMESTAMP,
        DB_COLUMNS.NAME, DB_COLUMNS.AMOUNT, DB_COLUMNS.CATEGORY, DB_COLUMNS.RECEIPT_IMAGE,
    ].join(','),
    salesReports: [
        DB_COLUMNS.ID, DB_COLUMNS.BRANCH_ID, DB_COLUMNS.REPORT_DATE, DB_COLUMNS.SUBMITTED_AT,
        DB_COLUMNS.GROSS_SALES, DB_COLUMNS.TOTAL_STAFF_PAY, DB_COLUMNS.TOTAL_EXPENSES,
        DB_COLUMNS.TOTAL_VAULT_PROVISION, DB_COLUMNS.NET_ROI,
        DB_COLUMNS.EXPENSE_DATA, DB_COLUMNS.STAFF_BREAKDOWN, DB_COLUMNS.BACKFILLED,
    ].join(','),
    vaultTransactions: [
        DB_COLUMNS.ID, DB_COLUMNS.BRANCH_ID, DB_COLUMNS.REPORT_ID, DB_COLUMNS.TYPE,
        DB_COLUMNS.AMOUNT, DB_COLUMNS.NAME, DB_COLUMNS.TIMESTAMP,
        DB_COLUMNS.PERFORMED_BY, DB_COLUMNS.RECEIPT_IMAGE, DB_COLUMNS.CREATED_AT,
    ].join(','),
    auditLogs: [
        DB_COLUMNS.ID, DB_COLUMNS.BRANCH_ID, DB_COLUMNS.TIMESTAMP,
        DB_COLUMNS.ACTIVITY_TYPE, DB_COLUMNS.ENTITY_TYPE, DB_COLUMNS.ENTITY_ID,
        DB_COLUMNS.DESCRIPTION, DB_COLUMNS.AMOUNT, DB_COLUMNS.PERFORMER_NAME,
    ].join(','),
    attendance: [
        DB_COLUMNS.ID, DB_COLUMNS.BRANCH_ID, DB_COLUMNS.EMPLOYEE_ID,
        DB_COLUMNS.STAFF_NAME, DB_COLUMNS.DATE, DB_COLUMNS.CLOCK_IN, DB_COLUMNS.CLOCK_OUT,
        DB_COLUMNS.CLOCK_IN_METHOD, DB_COLUMNS.STATUS, DB_COLUMNS.LATE_DEDUCTION, DB_COLUMNS.OT_PAY,
        DB_COLUMNS.CASH_ADVANCE, DB_COLUMNS.IS_HALF_DAY, DB_COLUMNS.CREATED_AT, DB_COLUMNS.SHIFT,
    ].join(','),
    requests: [
        DB_COLUMNS.ID, DB_COLUMNS.BRANCH_ID, DB_COLUMNS.TIMESTAMP,
        DB_COLUMNS.TYPE, DB_COLUMNS.STATUS, DB_COLUMNS.DATA,
        DB_COLUMNS.REQUESTER_ID, DB_COLUMNS.REQUESTER_NAME,
        DB_COLUMNS.REVIEWED_BY, DB_COLUMNS.REVIEW_NOTE, DB_COLUMNS.UPDATED_AT,
    ].join(','),
    branchVault: [
        DB_COLUMNS.BRANCH_ID, DB_COLUMNS.VAULT_TARGET, DB_COLUMNS.VAULT_BALANCE,
        DB_COLUMNS.VAULT_INITIAL_BALANCE, DB_COLUMNS.VAULT_LAST_DEPOSITED_DATE, DB_COLUMNS.VAULT_START_DATE,
    ].join(','),
    employeeComplaints: [
        DB_COLUMNS.ID, DB_COLUMNS.BRANCH_ID, DB_COLUMNS.EMPLOYEE_ID, DB_COLUMNS.EMPLOYEE_NAME,
        DB_COLUMNS.REPORT_TYPE, DB_COLUMNS.INCIDENT_DATE, DB_COLUMNS.DESCRIPTION,
        DB_COLUMNS.FILED_BY_ID, DB_COLUMNS.FILED_BY_NAME, DB_COLUMNS.FILED_AT,
        DB_COLUMNS.STATUS, DB_COLUMNS.ACTION_TAKEN, DB_COLUMNS.JUDGMENT, DB_COLUMNS.RESOLUTION,
        DB_COLUMNS.REVIEWED_BY, DB_COLUMNS.REVIEWED_AT,
    ].join(','),
};

export const useGlobalData = (auth: AuthState) => {
    const queryClient = useQueryClient();
    const [systemLogo, setSystemLogo] = useState<string | null>(() => localStorage.getItem('hilot_cached_logo'));
    const [systemVersion, setSystemVersion] = useState<string | null>(null);
    const [dynamicAppName, setDynamicAppName] = useState<string>(APP_NAME);
    const [autoRefreshTime, setAutoRefreshTime] = useState<string>('00:00');
    const [fontFamily, setFontFamily] = useState<string>('Outfit');
    const [isPaymongoEnabled, setIsPaymongoEnabled] = useState<boolean>(false);
    const [systemLatest, setSystemLatest] = useState<boolean>(true);
    const [apkUrl, setApkUrl] = useState<string | null>(null);
    const [globalSync, setGlobalSync] = useState(false);
    const [connStatus, setConnStatus] = useState<'connecting' | 'connected' | 'error' | 'offline'>('connecting');
    const [pendingSyncCount, setPendingSyncCount] = useState(0);
    const [forceLogoutRegistry, setForceLogoutRegistry] = useState<Record<string, number>>({});
    const [displayChanges, setDisplayChanges] = useState(false);
    const [faceIdDisabledBranches, setFaceIdDisabledBranches] = useState<string[]>([]);
    // Heavy queries (transactions, expenses, etc.) are deferred until branches+employees finish
    // loading to avoid a network congestion spike on login.
    const [deferredEnabled, setDeferredEnabled] = useState(false);
    // Sales reports are the heaviest query (paginated, thousands of rows). Delay them 1.5s
    // after the POS-critical data (transactions, expenses, attendance) has started loading,
    // so the POS tab is interactive before the Reports tab data arrives.
    const [historyEnabled, setHistoryEnabled] = useState(false);

    const isSyncingQueue = useRef(false);

    // OFFLINE SYNC ENGINE
    const flushOfflineQueue = useCallback(async () => {
        if (isSyncingQueue.current || !navigator.onLine) {
            const saved = localStorage.getItem(OFFLINE_QUEUE_KEY);
            if (saved) {
                try { setPendingSyncCount(JSON.parse(saved).length); } catch { setPendingSyncCount(0); }
            } else {
                setPendingSyncCount(0);
            }
            return;
        }

        const saved = localStorage.getItem(OFFLINE_QUEUE_KEY);
        if (!saved) {
            setPendingSyncCount(0);
            return;
        }

        try {
            const queue: { table: string; data: any; audit?: any; conflictKey?: string; isNew?: boolean }[] = JSON.parse(saved);
            if (queue.length === 0) {
                setPendingSyncCount(0);
                return;
            }

            isSyncingQueue.current = true;

            const remainingQueue = [...queue];
            const processedIndices: number[] = [];

            for (let i = 0; i < remainingQueue.length; i++) {
                const item = remainingQueue[i];
                try {
                    // Branch-scoped validation: non-superadmin users may only sync
                    // items that belong to their own branch. Drop anything that doesn't match.
                    const userBranchId = auth.user?.branchId;
                    const itemBranchId = item.data?.[DB_COLUMNS.BRANCH_ID];
                    if (
                        auth.user?.role !== UserRole.SUPERADMIN &&
                        userBranchId &&
                        itemBranchId &&
                        itemBranchId !== userBranchId
                    ) {
                        console.warn('[offlineQueue] Dropped item — branchId mismatch:', item.table, itemBranchId);
                        processedIndices.push(i);
                        continue;
                    }

                    const conflictTarget = item.conflictKey ?? (item.table === DB_TABLES.SYSTEM_CONFIG ? 'key' : 'id');

                    // Skip if the record was deleted server-side while we were offline —
                    // BUT only for update-style items (isNew: false), not for new inserts.
                    // New records (isNew: true or unset for backwards compat) always proceed.
                    // This prevents accidentally dropping offline clock-ins and other new records.
                    const itemId = item.data?.[conflictTarget];
                    const isNewRecord = item.isNew === true;
                    if (!isNewRecord && itemId && item.table !== DB_TABLES.SYSTEM_CONFIG && item.table !== DB_TABLES.BRANCH_VAULTS) {
                        const { data: existing } = await supabase
                            .from(item.table)
                            .select(conflictTarget)
                            .eq(conflictTarget, itemId)
                            .maybeSingle();
                        // If the record no longer exists (was deleted), drop this queue item silently
                        if (existing === null) {
                            console.warn('[offlineQueue] Dropping item — record deleted server-side:', item.table, itemId);
                            processedIndices.push(i);
                            continue;
                        }
                    }

                    const { error } = await supabase.from(item.table).upsert(item.data, { onConflict: conflictTarget });

                    if (!error) {
                        if (item.audit) await supabase.from(DB_TABLES.AUDIT_LOGS).insert(item.audit);
                        processedIndices.push(i);
                    }
                } catch (e) {
                    console.error("Sync partial failure for item", i, e);
                }
            }

            const newQueue = remainingQueue.filter((_, idx) => !processedIndices.includes(idx));
            if (newQueue.length === 0) {
                localStorage.removeItem(OFFLINE_QUEUE_KEY);
                setPendingSyncCount(0);
                playSound('success');
            } else {
                localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(newQueue));
                setPendingSyncCount(newQueue.length);
            }
        } catch (err) {
            console.error("Critical Sync Engine Failure:", err);
        } finally {
            isSyncingQueue.current = false;
        }
    }, []);

    const mapDbBranch = (db: any): Branch => {
        let services = [];
        try {
            services = typeof db[DB_COLUMNS.SERVICES] === 'string' 
                ? JSON.parse(db[DB_COLUMNS.SERVICES]) 
                : (db[DB_COLUMNS.SERVICES] || []);
            if (!Array.isArray(services)) services = [];
        } catch (e) {
            console.error("Failed to parse services for branch", db[DB_COLUMNS.ID], e);
            services = [];
        }

        return {
            id: db[DB_COLUMNS.ID],
            name: db[DB_COLUMNS.NAME],
            pin: db[DB_COLUMNS.PIN] || '',
            isPinChanged: Boolean(db[DB_COLUMNS.IS_PIN_CHANGED]),
            isEnabled: Boolean(db[DB_COLUMNS.IS_ENABLED]),
            isOpen: Boolean(db[DB_COLUMNS.IS_OPEN]),
            isOpenDate: db[DB_COLUMNS.IS_OPEN_DATE] ?? '',
            manager: db[DB_COLUMNS.MANAGER] || '',
            tempManager: db[DB_COLUMNS.TEMP_MANAGER] || '',
            services,
            weeklyCutoff: Number(db[DB_COLUMNS.WEEKLY_CUTOFF] ?? 0),
            cycleStartDate: db[DB_COLUMNS.CYCLE_START_DATE] ?? '',
            dailyProvisionAmount: Number(db[DB_COLUMNS.DAILY_PROVISION_AMOUNT] ?? 800),
            openingTime: db[DB_COLUMNS.OPENING_TIME] ?? '09:00',
            address: db[DB_COLUMNS.ADDRESS] ?? undefined,
            pinLocation: db[DB_COLUMNS.PIN_LOCATION] ?? undefined,
            closingTime: db[DB_COLUMNS.CLOSING_TIME] ?? '22:00',
            shift2OpeningTime: db[DB_COLUMNS.SHIFT2_OPENING_TIME] || undefined,
            shift2ClosingTime: db[DB_COLUMNS.SHIFT2_CLOSING_TIME] || undefined,
            owners: typeof db[DB_COLUMNS.OWNERS] === 'string'
                ? JSON.parse(db[DB_COLUMNS.OWNERS])
                : (db[DB_COLUMNS.OWNERS] || []),
            groupLevy: (() => {
                const raw = db[DB_COLUMNS.GROUP_LEVY];
                if (!raw) return null;
                try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
            })(),
            refreshSignal: db[DB_COLUMNS.REFRESH_SIGNAL] ? Number(db[DB_COLUMNS.REFRESH_SIGNAL]) : null,
            vaultEnabled: Boolean(db[DB_COLUMNS.VAULT_ENABLED]),
            cutoffHistory: (() => {
                const raw = db[DB_COLUMNS.CUTOFF_HISTORY];
                if (!raw) return [];
                try { return typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []); } catch { return []; }
            })(),
        };
    };

    const mapDbEmployee = (db: any): Employee => {
        let branchAllowances = {};
        try {
            branchAllowances = typeof db[DB_COLUMNS.BRANCH_ALLOWANCES] === 'string' 
                ? JSON.parse(db[DB_COLUMNS.BRANCH_ALLOWANCES]) 
                : (db[DB_COLUMNS.BRANCH_ALLOWANCES] || {});
            if (typeof branchAllowances !== 'object' || branchAllowances === null) branchAllowances = {};
        } catch (e) {
            console.warn("branchAllowances is null or invalid for employee", db[DB_COLUMNS.ID], "— defaulting to {}");
            branchAllowances = {};
        }

        return {
            id: db[DB_COLUMNS.ID],
            branchId: db[DB_COLUMNS.BRANCH_ID],
            name: db[DB_COLUMNS.NAME],
            firstName: db[DB_COLUMNS.FIRST_NAME],
            middleName: db[DB_COLUMNS.MIDDLE_NAME],
            lastName: db[DB_COLUMNS.LAST_NAME],
            username: db[DB_COLUMNS.USERNAME],
            // Credentials are not stored in the global cache — only a presence flag is kept.
            // The actual hash is fetched directly at login time via a targeted query.
            hasPinSet: Boolean(db[DB_COLUMNS.LOGIN_PIN]),
            requestReset: Boolean(db[DB_COLUMNS.REQUEST_RESET]),
            role: db[DB_COLUMNS.ROLE],
            allowance: Number(db[DB_COLUMNS.ALLOWANCE] || 0),
            isActive: db[DB_COLUMNS.IS_ACTIVE] !== false,
            profile: db[DB_COLUMNS.PROFILE],
            branchAllowances,
            details: db[DB_COLUMNS.DETAILS] || null,
            faceDescriptors: db[DB_COLUMNS.FACE_DESCRIPTORS] || undefined,
            timestamp: db[DB_COLUMNS.TIMESTAMP] || db[DB_COLUMNS.CREATED_AT],
            ...(() => {
                const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(getTrueDate());
                const dbOnLeave = db[DB_COLUMNS.ON_LEAVE] === true;
                const endDate: string | null = db[DB_COLUMNS.LEAVE_END_DATE] ?? null;
                // Auto-return: if leave_end_date is set and has passed, treat as no longer on leave
                const onLeave = dbOnLeave && (!endDate || endDate >= today);
                return {
                    onLeave,
                    leaveType: db[DB_COLUMNS.LEAVE_TYPE] ?? undefined,
                    leaveStartDate: db[DB_COLUMNS.LEAVE_START_DATE] ?? undefined,
                    leaveEndDate: endDate ?? undefined,
                };
            })(),
        };
    };

    // React Query Queries
    const { data: branches = [], isLoading: branchesLoading, error: branchesError } = useQuery({
        queryKey: ['branches'],
        queryFn: () => withOfflineCache(STORES.BRANCHES, async () => {
            if (!supabase) return [];
            const { data, error } = await supabase.from(DB_TABLES.BRANCHES).select(COLS.branches).order(DB_COLUMNS.NAME, { ascending: true });
            if (error) throw error;
            return data.map(mapDbBranch);
        }),
        enabled: !!supabase,
        staleTime: 0,
        gcTime: 0,
    });

    const { data: employees = [], isLoading: employeesLoading, error: employeesError } = useQuery({
        queryKey: ['employees', auth.user?.branchId, auth.user?.employeeId],
        queryFn: () => withOfflineCache(STORES.EMPLOYEES, async () => {
            if (!supabase) return [];
            // Fetch all employees to ensure we get those authorized via branch_allowances
            // Filtering is handled client-side in the components
            const { data, error } = await supabase.from(DB_TABLES.EMPLOYEES).select(COLS.employees).order(DB_COLUMNS.NAME, { ascending: true });
            if (error) throw error;
            return data.map(mapDbEmployee);
        }),
        enabled: !!supabase,
        staleTime: 5 * 60 * 1000
    });

    // Reset deferred flag on logout; enable it once the lightweight core queries settle.
    useEffect(() => {
        if (!auth.user) { setDeferredEnabled(false); setHistoryEnabled(false); return; }
        if (!branchesLoading && !employeesLoading) {
            setDeferredEnabled(true);
            // Delay sales reports (heaviest query) so POS-critical data gets bandwidth first
            const t = setTimeout(() => setHistoryEnabled(true), 1500);
            return () => clearTimeout(t);
        }
    }, [auth.user, branchesLoading, employeesLoading]);

    const { data: transactions = [], isLoading: transactionsLoading, error: transactionsError } = useQuery({
        queryKey: ['transactions', auth.user?.branchId],
        queryFn: () => withOfflineCache(STORES.TRANSACTIONS, async () => {
            if (!supabase) return [];
            const lookbackDate = getTrueDate();
            lookbackDate.setDate(lookbackDate.getDate() - 90);
            const lookbackIso = lookbackDate.toISOString();

            let query = supabase.from(DB_TABLES.TRANSACTIONS).select(COLS.transactions).order(DB_COLUMNS.TIMESTAMP, { ascending: false }).gte(DB_COLUMNS.TIMESTAMP, lookbackIso).limit(2000);
            if (auth.user?.role === UserRole.BRANCH_MANAGER && auth.user.branchId) {
                query = query.eq(DB_COLUMNS.BRANCH_ID, auth.user.branchId);
            }
            const { data, error } = await query;
            if (error) throw error;
            return data.map(t => ({
                id: t[DB_COLUMNS.ID], branchId: t[DB_COLUMNS.BRANCH_ID], timestamp: t[DB_COLUMNS.TIMESTAMP],
                clientName: t[DB_COLUMNS.CLIENT_NAME], therapistName: t[DB_COLUMNS.THERAPIST_NAME], therapistId: t[DB_COLUMNS.THERAPIST_ID], bonesetterName: t[DB_COLUMNS.BONESETTER_NAME], bonesetterId: t[DB_COLUMNS.BONESETTER_ID],
                serviceId: t[DB_COLUMNS.SERVICE_ID], serviceName: t[DB_COLUMNS.SERVICE_NAME], basePrice: Number(t[DB_COLUMNS.BASE_PRICE] || 0),
                discount: Number(t[DB_COLUMNS.DISCOUNT] || 0), voucherValue: Number(t[DB_COLUMNS.VOUCHER_VALUE] || 0),
                primaryCommission: Number(t[DB_COLUMNS.PRIMARY_COMMISSION] || 0), secondaryCommission: Number(t[DB_COLUMNS.SECONDARY_COMMISSION] || 0),
                total: Number(t[DB_COLUMNS.TOTAL] || 0),
                paymentMethod: t[DB_COLUMNS.PAYMENT_METHOD],
                paymentStatus: t[DB_COLUMNS.PAYMENT_STATUS],
                paymongoLinkId: t[DB_COLUMNS.PAYMONGO_LINK_ID],
                note: t[DB_COLUMNS.NOTE]
            }));
        }),
        enabled: !!supabase && deferredEnabled,
        staleTime: 2 * 60 * 1000
    });

    const { data: expenses = [], isLoading: expensesLoading, error: expensesError } = useQuery({
        queryKey: ['expenses', auth.user?.branchId],
        queryFn: () => withOfflineCache(STORES.EXPENSES, async () => {
            if (!supabase) return [];
            const lookbackDate = getTrueDate();
            lookbackDate.setDate(lookbackDate.getDate() - 90);
            const lookbackIso = lookbackDate.toISOString();

            let query = supabase.from(DB_TABLES.EXPENSES).select(COLS.expenses).order(DB_COLUMNS.TIMESTAMP, { ascending: false }).gte(DB_COLUMNS.TIMESTAMP, lookbackIso).limit(1000);
            if (auth.user?.role === UserRole.BRANCH_MANAGER && auth.user.branchId) {
                query = query.eq(DB_COLUMNS.BRANCH_ID, auth.user.branchId);
            }
            const { data, error } = await query;
            if (error) throw error;
            return data.map(e => ({
                id: e[DB_COLUMNS.ID], branchId: e[DB_COLUMNS.BRANCH_ID], timestamp: e[DB_COLUMNS.TIMESTAMP],
                name: e[DB_COLUMNS.NAME], amount: Number(e[DB_COLUMNS.AMOUNT] || 0), category: e[DB_COLUMNS.CATEGORY], receiptImage: e[DB_COLUMNS.RECEIPT_IMAGE]
            }));
        }),
        enabled: !!supabase && deferredEnabled,
        staleTime: 2 * 60 * 1000
    });

    const { data: salesReports = [], isLoading: salesReportsLoading, error: salesReportsError } = useQuery({
        queryKey: ['salesReports', auth.user?.branchId],
        queryFn: () => withOfflineCache(STORES.SALES_REPORTS, async () => {
            if (!supabase) return [];
            const lookbackDate = getTrueDate();
            // Superadmin: initial load covers 2 months (~60 days). ArchiveHub's
            // infinite scroll fetches older records on demand as the user scrolls.
            // Branch managers keep 90 days since they have no infinite scroll.
            const isBranchManager = auth.user?.role === UserRole.BRANCH_MANAGER;
            lookbackDate.setDate(lookbackDate.getDate() - (isBranchManager ? 90 : 60));
            const lbd = lookbackDate;
            const lookbackYmd = `${lbd.getFullYear()}-${String(lbd.getMonth() + 1).padStart(2, '0')}-${String(lbd.getDate()).padStart(2, '0')}`;

            // Branch managers cap at 500 rows (90 days × 1 branch always fits in one page).
            // Superadmin uses 1000-row pages and may span multiple pages.
            const PAGE_SIZE = isBranchManager ? 500 : 1000;

            const buildPage = (from: number) => {
                let q = supabase
                    .from(DB_TABLES.SALES_REPORTS)
                    .select(COLS.salesReports)
                    .order(DB_COLUMNS.REPORT_DATE, { ascending: false })
                    .order(DB_COLUMNS.SUBMITTED_AT, { ascending: false })
                    .gte(DB_COLUMNS.REPORT_DATE, lookbackYmd)
                    .range(from, from + PAGE_SIZE - 1);
                if (isBranchManager && auth.user?.branchId) {
                    q = q.eq(DB_COLUMNS.BRANCH_ID, auth.user.branchId);
                }
                return q;
            };

            let allRows: any[] = [];

            if (isBranchManager) {
                // Single-page fetch — one branch always fits within 500 rows
                const { data, error } = await buildPage(0);
                if (error) throw error;
                allRows = data || [];
            } else {
                // Superadmin: fetch the first 3 pages in parallel, then continue
                // sequentially if the last parallel page came back full (rare).
                const PARALLEL_BATCH = 3;
                const results = await Promise.all(
                    Array.from({ length: PARALLEL_BATCH }, (_, i) => buildPage(i * PAGE_SIZE))
                );
                for (const { data, error } of results) {
                    if (error) throw error;
                    if (data && data.length > 0) allRows.push(...data);
                }
                // If the last parallel page was full there may be a 4th+ page
                const lastBatch = results[PARALLEL_BATCH - 1];
                if ((lastBatch.data?.length ?? 0) === PAGE_SIZE) {
                    let from = PARALLEL_BATCH * PAGE_SIZE;
                    while (true) {
                        const { data, error } = await buildPage(from);
                        if (error) throw error;
                        if (data && data.length > 0) allRows.push(...data);
                        if (!data || data.length < PAGE_SIZE) break;
                        from += PAGE_SIZE;
                    }
                }
            }

            return allRows.map(r => ({
                id: r[DB_COLUMNS.ID], branchId: r[DB_COLUMNS.BRANCH_ID], reportDate: normalizeDateStr(r[DB_COLUMNS.REPORT_DATE]), submittedAt: r[DB_COLUMNS.SUBMITTED_AT],
                grossSales: Number(r[DB_COLUMNS.GROSS_SALES] ?? 0), totalStaffPay: Number(r[DB_COLUMNS.TOTAL_STAFF_PAY] ?? 0),
                totalExpenses: Number(r[DB_COLUMNS.TOTAL_EXPENSES] ?? 0), totalVaultProvision: Number(r[DB_COLUMNS.TOTAL_VAULT_PROVISION] ?? 0),
                netRoi: Number(r[DB_COLUMNS.NET_ROI] ?? 0),
                backfilled: r[DB_COLUMNS.BACKFILLED] === true,
                sessionData: typeof r[DB_COLUMNS.SESSION_DATA] === 'string' ? JSON.parse(r[DB_COLUMNS.SESSION_DATA]) : (r[DB_COLUMNS.SESSION_DATA] || []),
                staffBreakdown: typeof r[DB_COLUMNS.STAFF_BREAKDOWN] === 'string' ? JSON.parse(r[DB_COLUMNS.STAFF_BREAKDOWN]) : (r[DB_COLUMNS.STAFF_BREAKDOWN] || []),
                expenseData: typeof r[DB_COLUMNS.EXPENSE_DATA] === 'string' ? JSON.parse(r[DB_COLUMNS.EXPENSE_DATA]) : (r[DB_COLUMNS.EXPENSE_DATA] || []),
                vaultData: typeof r[DB_COLUMNS.VAULT_DATA] === 'string' ? JSON.parse(r[DB_COLUMNS.VAULT_DATA]) : (r[DB_COLUMNS.VAULT_DATA] || []),
            }));
        }),
        enabled: !!supabase && historyEnabled,
        staleTime: 2 * 60 * 1000
    });

    const { data: vaultTransactions = [] } = useQuery({
        queryKey: ['vaultTransactions', auth.user?.branchId],
        queryFn: () => withOfflineCache(STORES.VAULT_TRANSACTIONS, async () => {
            if (!supabase) return [];
            const vtLookback = getTrueDate();
            vtLookback.setDate(vtLookback.getDate() - 90);
            const vtLookbackIso = vtLookback.toISOString();
            let query = supabase
                .from(DB_TABLES.VAULT_TRANSACTIONS)
                .select(COLS.vaultTransactions)
                .order(DB_COLUMNS.TIMESTAMP, { ascending: false })
                .gte(DB_COLUMNS.TIMESTAMP, vtLookbackIso)
                .limit(1000);
            if (auth.user?.role === UserRole.BRANCH_MANAGER && auth.user.branchId) {
                query = query.eq(DB_COLUMNS.BRANCH_ID, auth.user.branchId);
            }
            const { data, error } = await query;
            if (error) throw error;
            return (data || []).map((r: any) => ({
                id: r[DB_COLUMNS.ID],
                branchId: r[DB_COLUMNS.BRANCH_ID],
                reportId: r[DB_COLUMNS.REPORT_ID] ?? null,
                type: r[DB_COLUMNS.TYPE],
                amount: Number(r[DB_COLUMNS.AMOUNT] ?? 0),
                name: r[DB_COLUMNS.NAME] ?? null,
                timestamp: r[DB_COLUMNS.TIMESTAMP],
                performedBy: r[DB_COLUMNS.PERFORMED_BY] ?? null,
                receiptImage: r[DB_COLUMNS.RECEIPT_IMAGE] ?? null,
                createdAt: r[DB_COLUMNS.CREATED_AT],
            }));
        }),
        enabled: !!supabase && deferredEnabled,
        staleTime: 2 * 60 * 1000,
    });

    const { data: auditLogs = [], isLoading: auditLogsLoading, error: auditLogsError } = useQuery({
        queryKey: ['auditLogs', auth.user?.branchId],
        queryFn: () => withOfflineCache(STORES.AUDIT_LOGS, async () => {
            if (!supabase) return [];
            const lookbackDate = getTrueDate();
            lookbackDate.setDate(lookbackDate.getDate() - 90);
            const lookbackIso = lookbackDate.toISOString();

            let query = supabase.from(DB_TABLES.AUDIT_LOGS).select(COLS.auditLogs).order(DB_COLUMNS.TIMESTAMP, { ascending: false }).gte(DB_COLUMNS.TIMESTAMP, lookbackIso).limit(500);
            if (auth.user?.role === UserRole.BRANCH_MANAGER && auth.user.branchId) {
                query = query.eq(DB_COLUMNS.BRANCH_ID, auth.user.branchId);
            }
            const { data, error } = await query;
            if (error) throw error;
            return data.map(au => ({
                id: String(au[DB_COLUMNS.ID]), branchId: au[DB_COLUMNS.BRANCH_ID], timestamp: au[DB_COLUMNS.TIMESTAMP],
                activityType: au[DB_COLUMNS.ACTIVITY_TYPE], entityType: au[DB_COLUMNS.ENTITY_TYPE], entityId: au[DB_COLUMNS.ENTITY_ID],
                description: au[DB_COLUMNS.DESCRIPTION], amount: Number(au[DB_COLUMNS.AMOUNT] || 0), performerName: au[DB_COLUMNS.PERFORMER_NAME]
            }));
        }),
        enabled: !!supabase && deferredEnabled,
        staleTime: 2 * 60 * 1000
    });

    const { data: attendance = [], isLoading: attendanceLoading, error: attendanceError } = useQuery({
        queryKey: ['attendance', auth.user?.branchId],
        queryFn: () => withOfflineCache(STORES.ATTENDANCE, async () => {
            if (!supabase) return [];
            const lookbackDate = getTrueDate();
            lookbackDate.setDate(lookbackDate.getDate() - 90);
            const lookbackIso = lookbackDate.toISOString();

            let query = supabase.from(DB_TABLES.ATTENDANCE).select(COLS.attendance).order(DB_COLUMNS.CLOCK_IN, { ascending: false }).gte(DB_COLUMNS.CLOCK_IN, lookbackIso).limit(1000);
            if (auth.user?.role === UserRole.BRANCH_MANAGER && auth.user.branchId) {
                query = query.eq(DB_COLUMNS.BRANCH_ID, auth.user.branchId);
            }
            const { data, error } = await query;
            if (error) throw error;
            return data.map(att => ({
                id: att[DB_COLUMNS.ID], branchId: att[DB_COLUMNS.BRANCH_ID], employeeId: att[DB_COLUMNS.EMPLOYEE_ID],
                staffName: att[DB_COLUMNS.STAFF_NAME], date: att[DB_COLUMNS.DATE], clockIn: att[DB_COLUMNS.CLOCK_IN],
                clockOut: att[DB_COLUMNS.CLOCK_OUT], clockInMethod: att[DB_COLUMNS.CLOCK_IN_METHOD] ?? undefined,
                status: att[DB_COLUMNS.STATUS], lateDeduction: Number(att[DB_COLUMNS.LATE_DEDUCTION] || 0),
                otPay: Number(att[DB_COLUMNS.OT_PAY] || 0), cashAdvance: Number(att[DB_COLUMNS.CASH_ADVANCE] || 0),
                isHalfDay: Boolean(att[DB_COLUMNS.IS_HALF_DAY]),
                createdAt: att[DB_COLUMNS.CREATED_AT],
                shift: att[DB_COLUMNS.SHIFT] ? Number(att[DB_COLUMNS.SHIFT]) as 1 | 2 : undefined
            }));
        }),
        enabled: !!supabase && deferredEnabled,
        // Attendance is clock-in/out sensitive — poll every 30s as a safety net behind
        // the realtime subscription (missed WebSocket events won't leave the UI stale).
        staleTime: 30 * 1000,
        refetchInterval: 30 * 1000,
    });

    const { data: requests = [], isLoading: requestsLoading, error: requestsError } = useQuery({
        queryKey: ['requests', auth.user?.branchId],
        queryFn: () => withOfflineCache(STORES.REQUESTS, async () => {
            if (!supabase) return [];
            const lookbackDate = getTrueDate();
            lookbackDate.setDate(lookbackDate.getDate() - 90);
            const lookbackIso = lookbackDate.toISOString();

            let query = supabase.from(DB_TABLES.REQUESTS).select(COLS.requests).order(DB_COLUMNS.TIMESTAMP, { ascending: false }).gte(DB_COLUMNS.TIMESTAMP, lookbackIso).limit(500);
            if (auth.user?.role === UserRole.BRANCH_MANAGER && auth.user.branchId) {
                query = query.eq(DB_COLUMNS.BRANCH_ID, auth.user.branchId);
            }
            const { data, error } = await query;
            if (error) throw error;
            return data.map(r => ({
                id: r[DB_COLUMNS.ID],
                branchId: r[DB_COLUMNS.BRANCH_ID],
                timestamp: r[DB_COLUMNS.TIMESTAMP],
                type: r[DB_COLUMNS.TYPE],
                status: r[DB_COLUMNS.STATUS],
                data: r[DB_COLUMNS.DATA],
                requesterId: r[DB_COLUMNS.REQUESTER_ID],
                requesterName: r[DB_COLUMNS.REQUESTER_NAME],
                reviewedBy: r[DB_COLUMNS.REVIEWED_BY],
                reviewNote: r[DB_COLUMNS.REVIEW_NOTE],
                updatedAt: r[DB_COLUMNS.UPDATED_AT]
            }));
        }),
        enabled: !!supabase && deferredEnabled,
        staleTime: 30 * 1000,
        refetchInterval: 30 * 1000,
    });

    const { data: employeeComplaints = [] } = useQuery<EmployeeComplaint[]>({
        queryKey: ['employeeComplaints', auth.user?.branchId],
        queryFn: (): Promise<EmployeeComplaint[]> => withOfflineCache(STORES.EMPLOYEE_COMPLAINTS, async () => {
            if (!supabase) return [];
            const ecLookback = getTrueDate();
            ecLookback.setDate(ecLookback.getDate() - 90);
            const ecLookbackIso = ecLookback.toISOString();
            let query = supabase
                .from(DB_TABLES.EMPLOYEE_COMPLAINTS)
                .select(COLS.employeeComplaints)
                .order(DB_COLUMNS.FILED_AT, { ascending: false })
                .gte(DB_COLUMNS.FILED_AT, ecLookbackIso)
                .limit(500);
            if (auth.user?.role === UserRole.BRANCH_MANAGER && auth.user.branchId) {
                const branchId = auth.user.branchId;
                // Reuse the already-loaded employees from React Query cache — avoids an
                // extra round trip since employeeComplaints only runs after employees are loaded.
                const cachedEmployees = queryClient.getQueryData<Employee[]>(
                    ['employees', auth.user.branchId, auth.user.employeeId]
                );
                const empIds = (cachedEmployees || [])
                    .filter(e => e.branchId === branchId)
                    .map(e => e.id);
                if (empIds.length > 0) {
                    query = query.or(
                        `${DB_COLUMNS.BRANCH_ID}.eq.${branchId},${DB_COLUMNS.EMPLOYEE_ID}.in.(${empIds.join(',')})`
                    );
                } else {
                    query = query.eq(DB_COLUMNS.BRANCH_ID, branchId);
                }
            }
            const { data, error } = await query;
            if (error) throw error;
            return (data || []).map((c: any) => ({
                id: c[DB_COLUMNS.ID],
                branchId: c[DB_COLUMNS.BRANCH_ID],
                employeeId: c[DB_COLUMNS.EMPLOYEE_ID],
                employeeName: c[DB_COLUMNS.EMPLOYEE_NAME],
                reportType: c[DB_COLUMNS.REPORT_TYPE],
                incidentDate: c[DB_COLUMNS.INCIDENT_DATE],
                description: c[DB_COLUMNS.DESCRIPTION],
                filedById: c[DB_COLUMNS.FILED_BY_ID],
                filedByName: c[DB_COLUMNS.FILED_BY_NAME],
                filedAt: c[DB_COLUMNS.FILED_AT],
                status: c[DB_COLUMNS.STATUS] as EmployeeComplaint['status'],
                actionTaken: (c[DB_COLUMNS.ACTION_TAKEN] ?? 'NONE') as EmployeeComplaint['actionTaken'],
                judgment: c[DB_COLUMNS.JUDGMENT] ?? undefined,
                resolution: c[DB_COLUMNS.RESOLUTION] ?? undefined,
                reviewedBy: c[DB_COLUMNS.REVIEWED_BY] ?? undefined,
                reviewedAt: c[DB_COLUMNS.REVIEWED_AT] ?? undefined,
            }));
        }),
        enabled: !!supabase && deferredEnabled,
        staleTime: 2 * 60 * 1000,
    });

    // Branch vault — one row per branch, loaded for branch managers only
    const { data: branchVault = null } = useQuery<BranchVault | null>({
        queryKey: ['branchVault', auth.user?.branchId],
        queryFn: async (): Promise<BranchVault | null> => {
            const branchId = auth.user?.branchId;
            if (!supabase || !branchId) return null;

            if (!navigator.onLine) {
                const cached = await getAll<BranchVault>(STORES.BRANCH_VAULTS);
                return cached.find(v => v.branchId === branchId) ?? null;
            }

            try {
                const { data, error } = await supabase
                    .from(DB_TABLES.BRANCH_VAULTS)
                    .select(COLS.branchVault)
                    .eq(DB_COLUMNS.BRANCH_ID, branchId)
                    .maybeSingle();
                if (error) throw error;
                if (!data) return null;
                const mapped: BranchVault = {
                    branchId: data[DB_COLUMNS.BRANCH_ID],
                    target: Number(data[DB_COLUMNS.VAULT_TARGET] ?? 0),
                    balance: Number(data[DB_COLUMNS.VAULT_BALANCE] ?? 0),
                    initialBalance: Number(data[DB_COLUMNS.VAULT_INITIAL_BALANCE] ?? 0),
                    lastDepositedDate: data[DB_COLUMNS.VAULT_LAST_DEPOSITED_DATE] ?? null,
                    startDate: data[DB_COLUMNS.VAULT_START_DATE] ?? null,
                };
                // Write-through
                putOne(STORES.BRANCH_VAULTS, mapped).catch(console.warn);
                return mapped;
            } catch (err) {
                const cached = await getAll<BranchVault>(STORES.BRANCH_VAULTS);
                return cached.find(v => v.branchId === branchId) ?? null;
            }
        },
        enabled: !!supabase && !!auth.user && auth.user.role === UserRole.BRANCH_MANAGER,
        staleTime: 2 * 60 * 1000
    });

    const fetchSystemConfig = useCallback(async () => {
        if (!supabase) return;

        // Offline: restore system config from IndexedDB cache
        if (!navigator.onLine) {
            const cachedRows = await getAll<{ key: string; value: string }>(STORES.SYSTEM_CONFIG);
            if (cachedRows.length > 0) {
                const find = (k: string) => cachedRows.find(c => c.key === k)?.value;
                const nameVal = find('app_name');
                const fontVal = find('font_family');
                const paymongoEnabledVal = find('paymongo_enabled');
                const latestVal = find('latest');
                const displayChangesVal = find('display_changes');
                const faceIdDisabledVal = find('face_id_disabled_branches');
                const logoutRegistryVal = find('force_logout_registry');
                const refreshTimeVal = find('auto_refresh_daily_audit');
                const version = find('version');
                setDisplayChanges(displayChangesVal === 'true');
                try { setFaceIdDisabledBranches(faceIdDisabledVal ? JSON.parse(faceIdDisabledVal) : []); } catch { setFaceIdDisabledBranches([]); }
                if (nameVal) setDynamicAppName(nameVal);
                if (version) setSystemVersion(version);
                if (fontVal) setFontFamily(fontVal);
                if (paymongoEnabledVal) setIsPaymongoEnabled(paymongoEnabledVal === 'true');
                if (latestVal) setSystemLatest(latestVal !== 'false');
                if (logoutRegistryVal) { try { setForceLogoutRegistry(JSON.parse(logoutRegistryVal)); } catch { setForceLogoutRegistry({}); } }
                if (refreshTimeVal) setAutoRefreshTime(refreshTimeVal);
            }
            return;
        }

        // Fetch config rows and APK storage listing in parallel — they're independent
        const [{ data: configData }, { data: apkFiles }] = await Promise.all([
            supabase.from(DB_TABLES.SYSTEM_CONFIG).select('*'),
            supabase.storage.from('apk').list().catch(() => ({ data: null })),
        ]);
        if (configData) {
            // Write-through: persist config rows to IDB for offline use
            putBatch(STORES.SYSTEM_CONFIG, configData.map((c: any) => ({ key: c[DB_COLUMNS.KEY], value: c.value }))).catch(console.warn);

            let logoVal = configData.find(c => c[DB_COLUMNS.KEY] === 'logo')?.value;
            const version = configData.find(c => c[DB_COLUMNS.KEY] === 'version')?.value;
            const nameVal = configData.find(c => c[DB_COLUMNS.KEY] === 'app_name')?.value;
            const refreshTimeVal = configData.find(c => c[DB_COLUMNS.KEY] === 'auto_refresh_daily_audit')?.value;
            const logoutRegistryVal = configData.find(c => c[DB_COLUMNS.KEY] === 'force_logout_registry')?.value;
            const fontVal = configData.find(c => c[DB_COLUMNS.KEY] === 'font_family')?.value;
            const paymongoEnabledVal = configData.find(c => c[DB_COLUMNS.KEY] === 'paymongo_enabled')?.value;
            const latestVal = configData.find(c => c[DB_COLUMNS.KEY] === 'latest')?.value;
            const apkFilenameVal = configData.find(c => c[DB_COLUMNS.KEY] === 'apk_filename')?.value;
            const displayChangesVal = configData.find(c => c[DB_COLUMNS.KEY] === 'display_changes')?.value;
            setDisplayChanges(displayChangesVal === 'true');
            const faceIdDisabledVal = configData.find(c => c[DB_COLUMNS.KEY] === 'face_id_disabled_branches')?.value;
            try { setFaceIdDisabledBranches(faceIdDisabledVal ? JSON.parse(faceIdDisabledVal) : []); } catch { setFaceIdDisabledBranches([]); }
            if (nameVal) { setDynamicAppName(nameVal); localStorage.setItem('hilot_cached_app_name', nameVal); }
            if (version) setSystemVersion(version);
            if (fontVal) setFontFamily(fontVal);
            if (paymongoEnabledVal) setIsPaymongoEnabled(paymongoEnabledVal === 'true');
            if (latestVal) setSystemLatest(latestVal !== 'false');

            // Resolve APK URL using the already-fetched storage listing
            try {
                const files = apkFiles;
                let targetFilename = null;
                if (files && files.length > 0) {
                    const latestFile = files.find((f: any) => f.name.includes('Latest'));
                    if (latestFile) {
                        targetFilename = latestFile.name;
                    } else if (apkFilenameVal) {
                        targetFilename = apkFilenameVal;
                    } else {
                        targetFilename = files[0].name;
                    }
                }
                if (targetFilename) {
                    const { data } = supabase.storage.from('apk').getPublicUrl(targetFilename);
                    setApkUrl(data.publicUrl);
                }
            } catch (err) {
                console.error('Failed to resolve APK URL:', err);
            }
            if (logoutRegistryVal) {
                try { setForceLogoutRegistry(JSON.parse(logoutRegistryVal)); } catch { setForceLogoutRegistry({}); }
            }
            if (refreshTimeVal) setAutoRefreshTime(refreshTimeVal);

            if (logoVal) {
                if (!logoVal.startsWith('http')) {
                    const parts = logoVal.split('/');
                    if (parts.length >= 2) {
                        const bucket = parts[0];
                        const filePath = parts.slice(1).join('/');
                        const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
                        logoVal = data.publicUrl;
                    }
                }
                setSystemLogo(logoVal);
                localStorage.setItem('hilot_cached_logo', logoVal);
            }
        }
    }, []);

    useEffect(() => {
        fetchSystemConfig();
    }, [fetchSystemConfig]);


    const refreshDatabase = useCallback(async (key?: string | string[]) => {
        if (!navigator.onLine) {
            setConnStatus('offline');
            return;
        }
        
        if (key) {
            // Targeted refetch
            const queryKey = Array.isArray(key) ? key : [key];
            await queryClient.refetchQueries({ queryKey });
        } else {
            // Full refetch (legacy behavior)
            await queryClient.refetchQueries();
            await fetchSystemConfig();
        }
        
        setConnStatus('connected');
    }, [queryClient, fetchSystemConfig]);

    // CONNECTIVITY & SYNC SENTINEL
    useEffect(() => {
        const handleOnline = () => {
            setConnStatus('connecting');
            refreshDatabase();
            flushOfflineQueue();
        };
        const handleOffline = () => setConnStatus('offline');

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        flushOfflineQueue();

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [refreshDatabase, flushOfflineQueue]);

    useEffect(() => {
        // Create a dedicated channel for high-priority global sync events
        const channel = supabase.channel('global_network_sync_v2')
            .on('postgres_changes', { event: '*', schema: 'public', table: DB_TABLES.BRANCHES }, () => refreshDatabase('branches'))
            .on('postgres_changes', { event: '*', schema: 'public', table: DB_TABLES.TRANSACTIONS }, () => refreshDatabase('transactions'))
            .on('postgres_changes', { event: '*', schema: 'public', table: DB_TABLES.EXPENSES }, () => refreshDatabase('expenses'))
            .on('postgres_changes', { event: '*', schema: 'public', table: DB_TABLES.EMPLOYEES }, () => refreshDatabase('employees'))
            .on('postgres_changes', { event: '*', schema: 'public', table: DB_TABLES.ATTENDANCE }, () => refreshDatabase('attendance'))
            .on('postgres_changes', { event: '*', schema: 'public', table: DB_TABLES.SALES_REPORTS }, () => refreshDatabase('salesReports'))
            .on('postgres_changes', { event: '*', schema: 'public', table: DB_TABLES.SERVICE_CATALOGS }, () => refreshDatabase('service_catalogs'))
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: DB_TABLES.REQUESTS }, (payload: any) => {
                refreshDatabase('requests');
                // When a CREATE_EMPLOYEE or DISABLE_EMPLOYEE request is approved/rejected,
                // force-refresh employees immediately so the staff tab updates without a manual refresh
                const type = payload.new?.type;
                const status = payload.new?.status;
                if ((type === 'CREATE_EMPLOYEE' || type === 'DISABLE_EMPLOYEE') && (status === 'APPROVED' || status === 'REJECTED')) {
                    refreshDatabase('employees');
                }
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: DB_TABLES.REQUESTS }, () => refreshDatabase('requests'))
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: DB_TABLES.REQUESTS }, () => refreshDatabase('requests'))
            .on('postgres_changes', { event: '*', schema: 'public', table: DB_TABLES.EMPLOYEE_COMPLAINTS }, () => refreshDatabase('employeeComplaints'))
            .on('postgres_changes', { event: '*', schema: 'public', table: DB_TABLES.VAULT_TRANSACTIONS }, () => refreshDatabase('vaultTransactions'))
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: DB_TABLES.BRANCH_VAULTS }, () => refreshDatabase('branchVault'))
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: DB_TABLES.AUDIT_LOGS }, () => refreshDatabase('auditLogs'))
            .on('postgres_changes', { event: '*', schema: 'public', table: DB_TABLES.SYSTEM_CONFIG }, () => fetchSystemConfig())
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                }
            });

        return () => { 
            supabase.removeChannel(channel); 
        };
    }, [refreshDatabase, fetchSystemConfig, queryClient]);

    // Only block the splash on branches — Login only needs branches to render.
    // Employees load in the background; the dashboard handles its own loading state.
    const loading = branchesLoading;
    const error = branchesError || employeesError || transactionsError || expensesError || salesReportsError || auditLogsError || attendanceError || requestsError;

    // Sentinel removed — employee time-out is manual only via STAFF tab

    useEffect(() => {
        if (loading) {
        }
    }, [loading, branchesLoading, employeesLoading, transactionsLoading, expensesLoading, salesReportsLoading, auditLogsLoading, attendanceLoading]);

    const branchesWithFaceId = useMemo(() =>
        branches.map(b => ({ ...b, faceIdEnabled: !faceIdDisabledBranches.includes(b.id) })),
        [branches, faceIdDisabledBranches]
    );

    return {
        branches: branchesWithFaceId, fetchSystemConfig, transactions, expenses, attendance, employees,
        salesReports, salesReportsLoading, auditLogs, requests, branchVault, vaultTransactions, employeeComplaints,
        systemLogo, systemVersion, systemLatest, apkUrl,
        dynamicAppName, autoRefreshTime, fontFamily, isPaymongoEnabled, loading, error, globalSync, setGlobalSync, connStatus,
        pendingSyncCount, forceLogoutRegistry, refreshDatabase
    };
};