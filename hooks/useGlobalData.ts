import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Branch, BranchVault, Transaction, Expense, Employee, SalesReport, AuditLog, Attendance, AuthState, UserRole } from '../types';
import { APP_NAME } from '../constants';
import { DB_TABLES, DB_COLUMNS } from '../constants/db_schema';
import { supabase } from '../lib/supabase';
import { playSound } from '../lib/audio';
import { getTrueDate } from '../lib/time';

const OFFLINE_QUEUE_KEY = 'hilot_core_pending_sync_v1';

export const useGlobalData = (auth: AuthState) => {
    const queryClient = useQueryClient();
    const [systemLogo, setSystemLogo] = useState<string | null>(null);
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
            const queue: { table: string; data: any; audit?: any }[] = JSON.parse(saved);
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
                    const conflictTarget = item.table === DB_TABLES.SYSTEM_CONFIG ? 'key' : 'id';

                    // Skip if the record was deleted server-side while we were offline
                    // (prevents re-inserting records that an admin intentionally removed)
                    const itemId = item.data?.id ?? item.data?.key;
                    if (itemId && item.table !== DB_TABLES.SYSTEM_CONFIG) {
                        const { data: existing } = await supabase
                            .from(item.table)
                            .select('id')
                            .eq(conflictTarget, itemId)
                            .maybeSingle();
                        // If the record no longer exists (was deleted), drop this queue item silently
                        if (existing === null) {
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
            // Only expose the setup PIN for branches that haven't completed initial setup yet.
            // Once isPinChanged = true, the setup PIN is no longer used and should not be sent to clients.
            pin: db[DB_COLUMNS.IS_PIN_CHANGED] ? '' : (db[DB_COLUMNS.PIN] || ''),
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
            enableShiftTracking: Boolean(db[DB_COLUMNS.ENABLE_SHIFT_TRACKING]),
            openingTime: db[DB_COLUMNS.OPENING_TIME] ?? '09:00',
            closingTime: db[DB_COLUMNS.CLOSING_TIME] ?? '22:00',
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
            console.error("Failed to parse branchAllowances for employee", db[DB_COLUMNS.ID], e);
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
            timestamp: db[DB_COLUMNS.TIMESTAMP] || db[DB_COLUMNS.CREATED_AT]
        };
    };

    // React Query Queries
    const { data: branches = [], isLoading: branchesLoading, error: branchesError } = useQuery({
        queryKey: ['branches'],
        queryFn: async () => {
            if (!supabase) return [];
            const { data, error } = await supabase.from(DB_TABLES.BRANCHES).select('*').order(DB_COLUMNS.NAME, { ascending: true });
            if (error) throw error;
            return data.map(mapDbBranch);
        },
        enabled: !!supabase,
        staleTime: 5 * 60 * 1000
    });

    const { data: employees = [], isLoading: employeesLoading, error: employeesError } = useQuery({
        queryKey: ['employees', auth.user?.branchId, auth.user?.employeeId],
        queryFn: async () => {
            if (!supabase) return [];
            // Fetch all employees to ensure we get those authorized via branch_allowances
            // Filtering is handled client-side in the components
            const { data, error } = await supabase.from(DB_TABLES.EMPLOYEES).select('*').order(DB_COLUMNS.NAME, { ascending: true });
            if (error) throw error;
            return data.map(mapDbEmployee);
        },
        enabled: !!supabase,
        staleTime: 5 * 60 * 1000
    });

    const { data: transactions = [], isLoading: transactionsLoading, error: transactionsError } = useQuery({
        queryKey: ['transactions', auth.user?.branchId],
        queryFn: async () => {
            if (!supabase) return [];
            const lookbackDate = new Date();
            lookbackDate.setDate(lookbackDate.getDate() - 90);
            const lookbackIso = lookbackDate.toISOString();

            let query = supabase.from(DB_TABLES.TRANSACTIONS).select('*').order(DB_COLUMNS.TIMESTAMP, { ascending: false }).gte(DB_COLUMNS.TIMESTAMP, lookbackIso).limit(2000);
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
        },
        enabled: !!supabase && !!auth.user,
        staleTime: 2 * 60 * 1000
    });

    const { data: expenses = [], isLoading: expensesLoading, error: expensesError } = useQuery({
        queryKey: ['expenses', auth.user?.branchId],
        queryFn: async () => {
            if (!supabase) return [];
            const lookbackDate = new Date();
            lookbackDate.setDate(lookbackDate.getDate() - 90);
            const lookbackIso = lookbackDate.toISOString();

            let query = supabase.from(DB_TABLES.EXPENSES).select('*').order(DB_COLUMNS.TIMESTAMP, { ascending: false }).gte(DB_COLUMNS.TIMESTAMP, lookbackIso).limit(1000);
            if (auth.user?.role === UserRole.BRANCH_MANAGER && auth.user.branchId) {
                query = query.eq(DB_COLUMNS.BRANCH_ID, auth.user.branchId);
            }
            const { data, error } = await query;
            if (error) throw error;
            return data.map(e => ({
                id: e[DB_COLUMNS.ID], branchId: e[DB_COLUMNS.BRANCH_ID], timestamp: e[DB_COLUMNS.TIMESTAMP],
                name: e[DB_COLUMNS.NAME], amount: Number(e[DB_COLUMNS.AMOUNT] || 0), category: e[DB_COLUMNS.CATEGORY], receiptImage: e[DB_COLUMNS.RECEIPT_IMAGE]
            }));
        },
        enabled: !!supabase && !!auth.user,
        staleTime: 2 * 60 * 1000
    });

    const { data: salesReports = [], isLoading: salesReportsLoading, error: salesReportsError } = useQuery({
        queryKey: ['salesReports', auth.user?.branchId],
        queryFn: async () => {
            if (!supabase) return [];
            const lookbackDate = new Date();
            lookbackDate.setDate(lookbackDate.getDate() - 90);
            const lookbackYmd = lookbackDate.toISOString().split('T')[0];

            let query = supabase.from(DB_TABLES.SALES_REPORTS).select('*').order(DB_COLUMNS.REPORT_DATE, { ascending: false }).gte(DB_COLUMNS.REPORT_DATE, lookbackYmd).limit(2000);
            if (auth.user?.role === UserRole.BRANCH_MANAGER && auth.user.branchId) {
                query = query.eq(DB_COLUMNS.BRANCH_ID, auth.user.branchId);
            }
            const { data, error } = await query;
            if (error) throw error;
            return data.map(r => ({
                id: r[DB_COLUMNS.ID], branchId: r[DB_COLUMNS.BRANCH_ID], reportDate: r[DB_COLUMNS.REPORT_DATE], submittedAt: r[DB_COLUMNS.SUBMITTED_AT],
                grossSales: Number(r[DB_COLUMNS.GROSS_SALES] ?? 0), totalStaffPay: Number(r[DB_COLUMNS.TOTAL_STAFF_PAY] ?? 0),
                totalExpenses: Number(r[DB_COLUMNS.TOTAL_EXPENSES] ?? 0), totalVaultProvision: Number(r[DB_COLUMNS.TOTAL_VAULT_PROVISION] ?? 0),
                netRoi: Number(r[DB_COLUMNS.NET_ROI] ?? 0),
                isValidated: r[DB_COLUMNS.IS_VALIDATED] ?? false,
                sessionData: typeof r[DB_COLUMNS.SESSION_DATA] === 'string' ? JSON.parse(r[DB_COLUMNS.SESSION_DATA]) : (r[DB_COLUMNS.SESSION_DATA] || []),
                staffBreakdown: typeof r[DB_COLUMNS.STAFF_BREAKDOWN] === 'string' ? JSON.parse(r[DB_COLUMNS.STAFF_BREAKDOWN]) : (r[DB_COLUMNS.STAFF_BREAKDOWN] || []),
                expenseData: typeof r[DB_COLUMNS.EXPENSE_DATA] === 'string' ? JSON.parse(r[DB_COLUMNS.EXPENSE_DATA]) : (r[DB_COLUMNS.EXPENSE_DATA] || []),
                vaultData: typeof r[DB_COLUMNS.VAULT_DATA] === 'string' ? JSON.parse(r[DB_COLUMNS.VAULT_DATA]) : (r[DB_COLUMNS.VAULT_DATA] || []),
                vaultDeposit: Number(r[DB_COLUMNS.VAULT_DEPOSIT] ?? 0),
                vaultBalanceSnapshot: Number(r[DB_COLUMNS.VAULT_BALANCE_SNAPSHOT] ?? 0),
            }));
        },
        enabled: !!supabase && !!auth.user,
        staleTime: 2 * 60 * 1000
    });

    const { data: auditLogs = [], isLoading: auditLogsLoading, error: auditLogsError } = useQuery({
        queryKey: ['auditLogs', auth.user?.branchId],
        queryFn: async () => {
            if (!supabase) return [];
            const lookbackDate = new Date();
            lookbackDate.setDate(lookbackDate.getDate() - 90);
            const lookbackIso = lookbackDate.toISOString();

            let query = supabase.from(DB_TABLES.AUDIT_LOGS).select('*').order(DB_COLUMNS.TIMESTAMP, { ascending: false }).gte(DB_COLUMNS.TIMESTAMP, lookbackIso).limit(500);
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
        },
        enabled: !!supabase && !!auth.user,
        staleTime: 2 * 60 * 1000
    });

    const { data: attendance = [], isLoading: attendanceLoading, error: attendanceError } = useQuery({
        queryKey: ['attendance', auth.user?.branchId],
        queryFn: async () => {
            if (!supabase) return [];
            const lookbackDate = new Date();
            lookbackDate.setDate(lookbackDate.getDate() - 90);
            const lookbackIso = lookbackDate.toISOString();

            let query = supabase.from(DB_TABLES.ATTENDANCE).select('*').order(DB_COLUMNS.CLOCK_IN, { ascending: false }).gte(DB_COLUMNS.CLOCK_IN, lookbackIso).limit(1000);
            if (auth.user?.role === UserRole.BRANCH_MANAGER && auth.user.branchId) {
                query = query.eq(DB_COLUMNS.BRANCH_ID, auth.user.branchId);
            }
            const { data, error } = await query;
            if (error) throw error;
            return data.map(att => ({
                id: att[DB_COLUMNS.ID], branchId: att[DB_COLUMNS.BRANCH_ID], employeeId: att[DB_COLUMNS.EMPLOYEE_ID],
                staffName: att[DB_COLUMNS.STAFF_NAME], date: att[DB_COLUMNS.DATE], clockIn: att[DB_COLUMNS.CLOCK_IN],
                clockOut: att[DB_COLUMNS.CLOCK_OUT], status: att[DB_COLUMNS.STATUS], lateDeduction: Number(att[DB_COLUMNS.LATE_DEDUCTION] || 0),
                otPay: Number(att[DB_COLUMNS.OT_PAY] || 0), cashAdvance: Number(att[DB_COLUMNS.CASH_ADVANCE] || 0), 
                isHalfDay: Boolean(att[DB_COLUMNS.IS_HALF_DAY]),
                createdAt: att[DB_COLUMNS.CREATED_AT]
            }));
        },
        enabled: !!supabase && !!auth.user,
        staleTime: 2 * 60 * 1000
    });

    const { data: requests = [], isLoading: requestsLoading, error: requestsError } = useQuery({
        queryKey: ['requests', auth.user?.branchId],
        queryFn: async () => {
            if (!supabase) return [];
            const lookbackDate = new Date();
            lookbackDate.setDate(lookbackDate.getDate() - 90);
            const lookbackIso = lookbackDate.toISOString();

            let query = supabase.from(DB_TABLES.REQUESTS).select('*').order(DB_COLUMNS.TIMESTAMP, { ascending: false }).gte(DB_COLUMNS.TIMESTAMP, lookbackIso);
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
        },
        enabled: !!supabase && !!auth.user,
        staleTime: 2 * 60 * 1000
    });

    // Branch vault — one row per branch, loaded for branch managers only
    const { data: branchVault = null } = useQuery<BranchVault | null>({
        queryKey: ['branchVault', auth.user?.branchId],
        queryFn: async (): Promise<BranchVault | null> => {
            if (!supabase || !auth.user?.branchId) return null;
            const { data, error } = await supabase
                .from(DB_TABLES.BRANCH_VAULTS)
                .select('*')
                .eq(DB_COLUMNS.BRANCH_ID, auth.user.branchId)
                .maybeSingle();
            if (error) throw error;
            if (!data) return null;
            return {
                branchId: data[DB_COLUMNS.BRANCH_ID],
                target: Number(data[DB_COLUMNS.VAULT_TARGET] ?? 0),
                balance: Number(data[DB_COLUMNS.VAULT_BALANCE] ?? 0),
                lastDepositedDate: data[DB_COLUMNS.VAULT_LAST_DEPOSITED_DATE] ?? null,
                startDate: data[DB_COLUMNS.VAULT_START_DATE] ?? null,
            };
        },
        enabled: !!supabase && !!auth.user && auth.user.role === UserRole.BRANCH_MANAGER,
        staleTime: 2 * 60 * 1000
    });

    const fetchSystemConfig = useCallback(async () => {
        if (!supabase) return;
        const { data: configData } = await supabase.from(DB_TABLES.SYSTEM_CONFIG).select('*');
        if (configData) {
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
            if (nameVal) setDynamicAppName(nameVal);
            if (version) setSystemVersion(version);
            if (fontVal) setFontFamily(fontVal);
            if (paymongoEnabledVal) setIsPaymongoEnabled(paymongoEnabledVal === 'true');
            if (latestVal) setSystemLatest(latestVal !== 'false');

            // Fetch APK URL
            try {
                const { data: files } = await supabase.storage.from('apk').list();
                let targetFilename = null;

                if (files && files.length > 0) {
                    // Prioritize file with "Latest" in name
                    const latestFile = files.find(f => f.name.includes('Latest'));
                    if (latestFile) {
                        targetFilename = latestFile.name;
                    } else if (apkFilenameVal) {
                        // Fallback to config value
                        targetFilename = apkFilenameVal;
                    } else {
                        // Fallback to first file
                        targetFilename = files[0].name;
                    }
                }

                if (targetFilename) {
                    const { data } = supabase.storage.from('apk').getPublicUrl(targetFilename);
                    setApkUrl(data.publicUrl);
                }
            } catch (err) {
                console.error('Failed to fetch APK URL:', err);
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
            .on('postgres_changes', { event: '*', schema: 'public', table: DB_TABLES.REQUESTS }, () => refreshDatabase('requests'))
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

    const loading = branchesLoading || employeesLoading;
    const error = branchesError || employeesError || transactionsError || expensesError || salesReportsError || auditLogsError || attendanceError || requestsError;

    // Sentinel removed — employee time-out is manual only via STAFF tab

    useEffect(() => {
        if (loading) {
        }
    }, [loading, branchesLoading, employeesLoading, transactionsLoading, expensesLoading, salesReportsLoading, auditLogsLoading, attendanceLoading]);

    return {
        branches, transactions, expenses, attendance, employees,
        salesReports, auditLogs, requests, branchVault,
        systemLogo, systemVersion, systemLatest, apkUrl,
        dynamicAppName, autoRefreshTime, fontFamily, isPaymongoEnabled, loading, error, globalSync, setGlobalSync, connStatus,
        pendingSyncCount, forceLogoutRegistry, displayChanges, refreshDatabase
    };
};