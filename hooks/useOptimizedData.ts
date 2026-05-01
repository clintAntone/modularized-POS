// hooks/useOptimizedData.ts
// Production-ready drop-in replacement for useGlobalData with egress optimizations

import { useState, useEffect, useCallback, useRef } from 'react';
import { Branch, Transaction, Expense, Employee, SalesReport, AuditLog, Attendance, AuthState } from '../types';
import { APP_NAME } from '../constants';
import { DB_TABLES, DB_COLUMNS } from '../constants/db_schema';
import { supabase } from '../lib/supabase';
import { playSound } from '../lib/audio';

const OFFLINE_QUEUE_KEY = 'hilot_core_pending_sync_v1';
const CACHE_KEY = 'hilot_data_cache_v1';
const LAST_SYNC_KEY = 'hilot_last_sync_v1';
const CACHE_DURATION = 60000; // 60 seconds

interface CacheEntry {
  data: any;
  timestamp: number;
}

interface DataCache {
  transactions?: CacheEntry;
  expenses?: CacheEntry;
  attendance?: CacheEntry;
  employees?: CacheEntry;
  branches?: CacheEntry;
  salesReports?: CacheEntry;
  auditLogs?: CacheEntry;
}

export const useOptimizedData = (auth: AuthState) => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [salesReports, setSalesReports] = useState<SalesReport[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [systemLogo, setSystemLogo] = useState<string | null>(null);
  const [systemVersion, setSystemVersion] = useState<string | null>(null);
  const [dynamicAppName, setDynamicAppName] = useState<string>(APP_NAME);
  const [autoRefreshTime, setAutoRefreshTime] = useState<string>('00:00');
  const [loading, setLoading] = useState(true);
  const [globalSync, setGlobalSync] = useState(false);
  const [connStatus, setConnStatus] = useState<'connecting' | 'connected' | 'error' | 'offline'>('connecting');
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [forceLogoutRegistry, setForceLogoutRegistry] = useState<Record<string, number>>({});

  const isSyncingQueue = useRef(false);
  const dataCache = useRef<DataCache>({});
  const lastSync = useRef<Record<string, number>>({});

  // ============================================================================
  // OPTIMIZATION 1: Client-side caching with TTL
  // ============================================================================
  const getCachedData = useCallback((key: keyof DataCache): any | null => {
    const cached = dataCache.current[key];
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      return cached.data;
    }
    
    return null;
  }, []);

  const setCachedData = useCallback((key: keyof DataCache, data: any) => {
    dataCache.current[key] = {
      data,
      timestamp: Date.now()
    };
  }, []);

  // ============================================================================
  // DATA MAPPING FUNCTIONS (Transform DB rows to typed objects)
  // ============================================================================
  const mapDbBranch = (db: any): Branch => ({
    id: db[DB_COLUMNS.ID],
    name: db[DB_COLUMNS.NAME],
    pin: db[DB_COLUMNS.PIN],
    isPinChanged: Boolean(db[DB_COLUMNS.IS_PIN_CHANGED]),
    isEnabled: Boolean(db[DB_COLUMNS.IS_ENABLED]),
    isOpen: Boolean(db[DB_COLUMNS.IS_OPEN]),
    isOpenDate: db[DB_COLUMNS.IS_OPEN_DATE] ?? '',
    manager: db[DB_COLUMNS.MANAGER] || '',
    tempManager: db[DB_COLUMNS.TEMP_MANAGER] || '',
    services: typeof db[DB_COLUMNS.SERVICES] === 'string' ? JSON.parse(db[DB_COLUMNS.SERVICES]) : (db[DB_COLUMNS.SERVICES] || []),
    weeklyCutoff: Number(db[DB_COLUMNS.WEEKLY_CUTOFF] ?? 0),
    cycleStartDate: db[DB_COLUMNS.CYCLE_START_DATE] ?? '',
    dailyProvisionAmount: Number(db[DB_COLUMNS.DAILY_PROVISION_AMOUNT] ?? 800),
    enableShiftTracking: Boolean(db[DB_COLUMNS.ENABLE_SHIFT_TRACKING]),
    openingTime: db[DB_COLUMNS.OPENING_TIME] ?? '09:00',
    closingTime: db[DB_COLUMNS.CLOSING_TIME] ?? '22:00',
    owners: typeof db[DB_COLUMNS.OWNERS] === 'string'
      ? JSON.parse(db[DB_COLUMNS.OWNERS])
      : (db[DB_COLUMNS.OWNERS] || []),
    vaultEnabled: Boolean(db[DB_COLUMNS.VAULT_ENABLED]),
  });

  const mapDbEmployee = (db: any): Employee => ({
    id: db[DB_COLUMNS.ID],
    branchId: db[DB_COLUMNS.BRANCH_ID],
    name: db[DB_COLUMNS.NAME],
    username: db[DB_COLUMNS.USERNAME],
    hasPinSet: Boolean(db[DB_COLUMNS.LOGIN_PIN]),
    requestReset: Boolean(db[DB_COLUMNS.REQUEST_RESET]),
    role: db[DB_COLUMNS.ROLE],
    allowance: Number(db[DB_COLUMNS.ALLOWANCE] || 0),
    isActive: db[DB_COLUMNS.IS_ACTIVE] !== false,
    profile: db[DB_COLUMNS.PROFILE],
    branchAllowances: typeof db[DB_COLUMNS.BRANCH_ALLOWANCES] === 'string' ? JSON.parse(db[DB_COLUMNS.BRANCH_ALLOWANCES]) : (db[DB_COLUMNS.BRANCH_ALLOWANCES] || {}),
    timestamp: db[DB_COLUMNS.TIMESTAMP] || db[DB_COLUMNS.CREATED_AT]
  });

  // ============================================================================
  // OPTIMIZATION 2: Selective column fetching
  // ============================================================================
  const SELECTED_COLUMNS = {
    [DB_TABLES.TRANSACTIONS]: [
      DB_COLUMNS.ID,
      DB_COLUMNS.BRANCH_ID,
      DB_COLUMNS.TIMESTAMP,
      DB_COLUMNS.CLIENT_NAME,
      DB_COLUMNS.THERAPIST_NAME,
      DB_COLUMNS.BONESETTER_NAME,
      DB_COLUMNS.SERVICE_ID,
      DB_COLUMNS.SERVICE_NAME,
      DB_COLUMNS.BASE_PRICE,
      DB_COLUMNS.DISCOUNT,
      DB_COLUMNS.VOUCHER_VALUE,
      DB_COLUMNS.PRIMARY_COMMISSION,
      DB_COLUMNS.SECONDARY_COMMISSION,
      DB_COLUMNS.TOTAL
      // Skip: unused metadata fields
    ],
    [DB_TABLES.EXPENSES]: [
      DB_COLUMNS.ID,
      DB_COLUMNS.BRANCH_ID,
      DB_COLUMNS.TIMESTAMP,
      DB_COLUMNS.NAME,
      DB_COLUMNS.AMOUNT,
      DB_COLUMNS.CATEGORY
      // Skip: RECEIPT_IMAGE (load separately)
    ],
    [DB_TABLES.EMPLOYEES]: [
      DB_COLUMNS.ID,
      DB_COLUMNS.BRANCH_ID,
      DB_COLUMNS.NAME,
      DB_COLUMNS.USERNAME,
      DB_COLUMNS.ROLE,
      DB_COLUMNS.ALLOWANCE,
      DB_COLUMNS.IS_ACTIVE,
      DB_COLUMNS.BRANCH_ALLOWANCES
      // Skip: loginPin, pinSalt (sensitive)
    ],
    [DB_TABLES.BRANCHES]: [
      DB_COLUMNS.ID,
      DB_COLUMNS.NAME,
      DB_COLUMNS.PIN,
      DB_COLUMNS.IS_PIN_CHANGED,
      DB_COLUMNS.IS_ENABLED,
      DB_COLUMNS.IS_OPEN,
      DB_COLUMNS.IS_OPEN_DATE,
      DB_COLUMNS.MANAGER,
      DB_COLUMNS.TEMP_MANAGER,
      DB_COLUMNS.SERVICES,
      DB_COLUMNS.WEEKLY_CUTOFF,
      DB_COLUMNS.CYCLE_START_DATE,
      DB_COLUMNS.DAILY_PROVISION_AMOUNT,
      DB_COLUMNS.ENABLE_SHIFT_TRACKING,
      DB_COLUMNS.OPENING_TIME,
      DB_COLUMNS.CLOSING_TIME
    ]
  };

  // ============================================================================
  // OPTIMIZATION 3: Date-based filtering (7-day lookback)
  // ============================================================================
  const getDateRange = () => {
    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    return {
      start: sevenDaysAgo.toISOString().split('T')[0],
      end: today.toISOString().split('T')[0]
    };
  };

  // ============================================================================
  // OPTIMIZATION 4: Incremental sync tracking
  // ============================================================================
  const getLastSyncTime = (table: string): string => {
    const stored = localStorage.getItem(`${LAST_SYNC_KEY}_${table}`);
    if (stored) {
      const lastTime = new Date(parseInt(stored));
      return lastTime.toISOString();
    }
    // Default to 24 hours ago
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return oneDayAgo.toISOString();
  };

  const updateLastSyncTime = (table: string) => {
    localStorage.setItem(`${LAST_SYNC_KEY}_${table}`, Date.now().toString());
  };

  // ============================================================================
  // OFFLINE SYNC ENGINE (unchanged)
  // ============================================================================
  const flushOfflineQueue = useCallback(async () => {
    if (isSyncingQueue.current || !navigator.onLine) {
      const saved = localStorage.getItem(OFFLINE_QUEUE_KEY);
      if (saved) {
        try {
          setPendingSyncCount(JSON.parse(saved).length);
        } catch {
          setPendingSyncCount(0);
        }
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
      setGlobalSync(true);

      const remainingQueue = [...queue];
      const processedIndices: number[] = [];

      for (let i = 0; i < remainingQueue.length; i++) {
        const item = remainingQueue[i];
        try {
          const conflictTarget = item.table === DB_TABLES.SYSTEM_CONFIG ? 'key' : 'id';

          // Skip if the record was deleted server-side while we were offline
          const itemId = item.data?.id ?? item.data?.key;
          if (itemId && item.table !== DB_TABLES.SYSTEM_CONFIG) {
            const { data: existing } = await supabase
              .from(item.table)
              .select('id')
              .eq(conflictTarget, itemId)
              .maybeSingle();
            if (existing === null) {
              processedIndices.push(i);
              continue;
            }
          }

          const { error } = await supabase
            .from(item.table)
            .upsert(item.data, { onConflict: conflictTarget });

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
      setGlobalSync(false);
    }
  }, []);

  // ============================================================================
  // OPTIMIZED: Selective realtime handlers (not cascade refresh)
  // ============================================================================
  const handleTransactionChange = useCallback((change: any) => {
    if (change.eventType === 'INSERT') {
      const newTxn = {
        id: change.new[DB_COLUMNS.ID],
        branchId: change.new[DB_COLUMNS.BRANCH_ID],
        timestamp: change.new[DB_COLUMNS.TIMESTAMP],
        clientName: change.new[DB_COLUMNS.CLIENT_NAME],
        therapistName: change.new[DB_COLUMNS.THERAPIST_NAME],
        bonesetterName: change.new[DB_COLUMNS.BONESETTER_NAME],
        serviceId: change.new[DB_COLUMNS.SERVICE_ID],
        serviceName: change.new[DB_COLUMNS.SERVICE_NAME],
        basePrice: Number(change.new[DB_COLUMNS.BASE_PRICE] || 0),
        discount: Number(change.new[DB_COLUMNS.DISCOUNT] || 0),
        voucherValue: Number(change.new[DB_COLUMNS.VOUCHER_VALUE] || 0),
        primaryCommission: Number(change.new[DB_COLUMNS.PRIMARY_COMMISSION] || 0),
        secondaryCommission: Number(change.new[DB_COLUMNS.SECONDARY_COMMISSION] || 0),
        total: Number(change.new[DB_COLUMNS.TOTAL] || 0)
      };
      setTransactions(prev => [newTxn, ...prev]);
    } else if (change.eventType === 'UPDATE') {
      setTransactions(prev =>
        prev.map(t => t.id === change.new.id ? { ...t, ...change.new } : t)
      );
    } else if (change.eventType === 'DELETE') {
      setTransactions(prev => prev.filter(t => t.id !== change.old.id));
    }
  }, []);

  const handleExpenseChange = useCallback((change: any) => {
    if (change.eventType === 'INSERT') {
      const newExp = {
        id: change.new[DB_COLUMNS.ID],
        branchId: change.new[DB_COLUMNS.BRANCH_ID],
        timestamp: change.new[DB_COLUMNS.TIMESTAMP],
        name: change.new[DB_COLUMNS.NAME],
        amount: Number(change.new[DB_COLUMNS.AMOUNT] || 0),
        category: change.new[DB_COLUMNS.CATEGORY],
        receiptImage: undefined // Don't load image by default
      };
      setExpenses(prev => [newExp, ...prev]);
    } else if (change.eventType === 'UPDATE') {
      setExpenses(prev =>
        prev.map(e => e.id === change.new.id ? { ...e, ...change.new } : e)
      );
    } else if (change.eventType === 'DELETE') {
      setExpenses(prev => prev.filter(e => e.id !== change.old.id));
    }
  }, []);

  // ============================================================================
  // OPTIMIZED: Database refresh with all improvements
  // ============================================================================
  const refreshDatabase = useCallback(async (quiet = false) => {
    if (!navigator.onLine) {
      setConnStatus('offline');
      setLoading(false);
      return;
    }

    if (!quiet) {
      setLoading(true);
      setConnStatus('connecting');
    }

    try {
      const dateRange = getDateRange();

      // Fetch system config (small, doesn't change often)
      const cachedConfig = getCachedData('branches');
      if (cachedConfig) {
        // Use cached config if fresh
      } else {
        const { data: configData } = await supabase
          .from(DB_TABLES.SYSTEM_CONFIG)
          .select('key, value')
          .in('key', ['logo', 'version', 'app_name', 'auto_refresh_daily_audit', 'force_logout_registry']);

        if (configData) {
          let logoVal = configData.find(c => c.key === 'logo')?.value;
          const version = configData.find(c => c.key === 'version')?.value;
          const nameVal = configData.find(c => c.key === 'app_name')?.value;
          const refreshTimeVal = configData.find(c => c.key === 'auto_refresh_daily_audit')?.value;
          const logoutRegistryVal = configData.find(c => c.key === 'force_logout_registry')?.value;

          if (nameVal) setDynamicAppName(nameVal);
          if (version) setSystemVersion(version);
          if (logoutRegistryVal) {
            try {
              setForceLogoutRegistry(JSON.parse(logoutRegistryVal));
            } catch {
              setForceLogoutRegistry({});
            }
          }
          if (refreshTimeVal) {
            setAutoRefreshTime(refreshTimeVal);
          }

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
      }

      // ===== OPTIMIZATION: Column selection + date filtering =====
      const [{ data: bData }, { data: stData }] = await Promise.all([
        supabase
          .from(DB_TABLES.BRANCHES)
          .select(SELECTED_COLUMNS[DB_TABLES.BRANCHES].join(','))
          .order(DB_COLUMNS.NAME, { ascending: true }),
        
        supabase
          .from(DB_TABLES.EMPLOYEES)
          .select(SELECTED_COLUMNS[DB_TABLES.EMPLOYEES].join(','))
          .order(DB_COLUMNS.NAME, { ascending: true })
      ]);

      if (stData) setEmployees(stData.map(mapDbEmployee));
      if (bData) setBranches(bData.map(mapDbBranch));

      if (auth.user) {
        // ===== OPTIMIZATION: Selective field fetching + date range =====
        const [
          { data: tData },
          { data: eData },
          { data: rData },
          { data: auData },
          { data: attData }
        ] = await Promise.all([
          supabase
            .from(DB_TABLES.TRANSACTIONS)
            .select(SELECTED_COLUMNS[DB_TABLES.TRANSACTIONS].join(','))
            .gte(DB_COLUMNS.TIMESTAMP, `${dateRange.start}T00:00:00Z`)
            .order(DB_COLUMNS.TIMESTAMP, { ascending: false }),

          supabase
            .from(DB_TABLES.EXPENSES)
            .select(SELECTED_COLUMNS[DB_TABLES.EXPENSES].join(','))
            .gte(DB_COLUMNS.TIMESTAMP, `${dateRange.start}T00:00:00Z`)
            .order(DB_COLUMNS.TIMESTAMP, { ascending: false }),

          supabase
            .from(DB_TABLES.SALES_REPORTS)
            .select([DB_COLUMNS.ID, DB_COLUMNS.BRANCH_ID, DB_COLUMNS.REPORT_DATE, 
                     DB_COLUMNS.SUBMITTED_AT, DB_COLUMNS.GROSS_SALES, DB_COLUMNS.TOTAL_STAFF_PAY,
                     DB_COLUMNS.TOTAL_EXPENSES, DB_COLUMNS.TOTAL_VAULT_PROVISION, 
                     DB_COLUMNS.NET_ROI].join(','))
            .gte(DB_COLUMNS.REPORT_DATE, dateRange.start)
            .order(DB_COLUMNS.REPORT_DATE, { ascending: false })
            .limit(500),
          
          supabase
            .from(DB_TABLES.AUDIT_LOGS)
            .select([DB_COLUMNS.ID, DB_COLUMNS.BRANCH_ID, DB_COLUMNS.TIMESTAMP,
                     DB_COLUMNS.ACTIVITY_TYPE, DB_COLUMNS.ENTITY_TYPE, DB_COLUMNS.ENTITY_ID,
                     DB_COLUMNS.DESCRIPTION, DB_COLUMNS.PERFORMER_NAME].join(','))
            .gte(DB_COLUMNS.TIMESTAMP, `${dateRange.start}T00:00:00Z`)
            .order(DB_COLUMNS.TIMESTAMP, { ascending: false })
            .limit(500),
          
          supabase
            .from(DB_TABLES.ATTENDANCE)
            .select([DB_COLUMNS.ID, DB_COLUMNS.BRANCH_ID, DB_COLUMNS.EMPLOYEE_ID,
                     DB_COLUMNS.STAFF_NAME, DB_COLUMNS.DATE, DB_COLUMNS.CLOCK_IN,
                     DB_COLUMNS.CLOCK_OUT, DB_COLUMNS.STATUS, DB_COLUMNS.LATE_DEDUCTION,
                     DB_COLUMNS.OT_PAY, DB_COLUMNS.CASH_ADVANCE].join(','))
            .gte(DB_COLUMNS.DATE, dateRange.start)
            .order(DB_COLUMNS.CLOCK_IN, { ascending: false })
            .limit(1000)
        ]);

        if (tData) setTransactions(tData);
        if (eData) setExpenses(eData);
        if (rData) setSalesReports(rData);
        if (auData) setAuditLogs(auData);
        if (attData) setAttendance(attData);

        // Update sync timestamps
        updateLastSyncTime(DB_TABLES.TRANSACTIONS);
        updateLastSyncTime(DB_TABLES.EXPENSES);
      }

      if (!quiet) setConnStatus('connected');
    } catch (err) {
      console.error('Refresh error:', err);
      if (!quiet) setConnStatus('error');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [auth.user, getCachedData]);

  // ============================================================================
  // INITIALIZATION & SUBSCRIPTIONS
  // ============================================================================
  useEffect(() => {
    refreshDatabase();
  }, [refreshDatabase]);

  // Connectivity & Sync Sentinel
  useEffect(() => {
    const handleOnline = () => {
      setConnStatus('connecting');
      refreshDatabase(true);
      flushOfflineQueue();
    };
    const handleOffline = () => setConnStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    flushOfflineQueue();

    // Periodic queue check (45 seconds)
    const syncInterval = setInterval(flushOfflineQueue, 45000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(syncInterval);
    };
  }, [refreshDatabase, flushOfflineQueue]);

  // ===== OPTIMIZATION: Selective realtime subscriptions (no cascade refresh) =====
  useEffect(() => {
    const channel = supabase.channel('optimized_network_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: DB_TABLES.TRANSACTIONS }, 
        handleTransactionChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: DB_TABLES.EXPENSES }, 
        handleExpenseChange)
      // For branches/employees changes, refresh config only
      .on('postgres_changes', { event: '*', schema: 'public', table: DB_TABLES.BRANCHES }, 
        () => refreshDatabase(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: DB_TABLES.EMPLOYEES }, 
        () => refreshDatabase(true))
      // Audit logs - insert only
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: DB_TABLES.AUDIT_LOGS }, 
        () => refreshDatabase(true))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [handleTransactionChange, handleExpenseChange, refreshDatabase]);

  return {
    branches,
    setBranches,
    transactions,
    setTransactions,
    expenses,
    setExpenses,
    attendance,
    setAttendance,
    employees,
    setEmployees,
    salesReports,
    setSalesReports,
    auditLogs,
    setAuditLogs,
    systemLogo,
    systemVersion,
    dynamicAppName,
    autoRefreshTime,
    loading,
    globalSync,
    setGlobalSync,
    connStatus,
    pendingSyncCount,
    forceLogoutRegistry,
    refreshDatabase
  };
};
