/**
 * offlineDb.ts — IndexedDB wrapper for full offline support.
 *
 * Provides a persistent cache for all entities loaded by useGlobalData,
 * plus a dedicated auth_creds store for offline PIN verification.
 *
 * No external dependencies — uses the raw IDB API via a promise wrapper.
 */

import { UserRole, PortalPermissions } from '../types';

const DB_NAME = 'hilot_offline_v1';
const DB_VERSION = 1;

/** Cached offline credentials older than this are rejected at login. */
export const MAX_OFFLINE_CREDENTIAL_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const STORES = {
  AUTH_CREDS:          'auth_creds',
  BRANCHES:            'branches',
  EMPLOYEES:           'employees',
  SYSTEM_CONFIG:       'system_config',
  TRANSACTIONS:        'transactions',
  EXPENSES:            'expenses',
  ATTENDANCE:          'attendance',
  SALES_REPORTS:       'sales_reports',
  VAULT_TRANSACTIONS:  'vault_transactions',
  AUDIT_LOGS:          'audit_logs',
  REQUESTS:            'requests',
  EMPLOYEE_COMPLAINTS: 'employee_complaints',
  BRANCH_VAULTS:       'branch_vaults',
  SYNC_META:           'sync_meta',
} as const;

export type StoreKey = typeof STORES[keyof typeof STORES];

export interface OfflineCredential {
  username: string;          // lowercase; IDB key
  hashedPin: string;         // SHA-256(pin + salt)
  salt: string;              // random salt used in hash
  role: UserRole;
  branchId?: string;
  employeeId?: string;
  displayName?: string;
  permissions?: PortalPermissions;
  cachedAt: number;          // Date.now() — used for "data from X ago" display
}

// ─── DB lifecycle ────────────────────────────────────────────────────────────

let _db: IDBDatabase | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      const storeKeys: [StoreKey, string][] = [
        [STORES.AUTH_CREDS,          'username'],
        [STORES.BRANCHES,            'id'],
        [STORES.EMPLOYEES,           'id'],
        [STORES.SYSTEM_CONFIG,       'key'],
        [STORES.TRANSACTIONS,        'id'],
        [STORES.EXPENSES,            'id'],
        [STORES.ATTENDANCE,          'id'],
        [STORES.SALES_REPORTS,       'id'],
        [STORES.VAULT_TRANSACTIONS,  'id'],
        [STORES.AUDIT_LOGS,          'id'],
        [STORES.REQUESTS,            'id'],
        [STORES.EMPLOYEE_COMPLAINTS, 'id'],
        [STORES.BRANCH_VAULTS,       'branchId'],
        [STORES.SYNC_META,           'key'],
      ];
      for (const [name, keyPath] of storeKeys) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath });
        }
      }
    };

    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

// ─── Generic CRUD ─────────────────────────────────────────────────────────────

export async function putBatch(store: StoreKey, items: any[]): Promise<void> {
  if (!items.length) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    for (const item of items) os.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function putOne(store: StoreKey, item: any): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAll<T = any>(store: StoreKey): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export async function getByKey<T = any>(store: StoreKey, key: IDBValidKey): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function clearStore(store: StoreKey): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Auth credentials ─────────────────────────────────────────────────────────

export async function saveAuthCredential(cred: OfflineCredential): Promise<void> {
  await putOne(STORES.AUTH_CREDS, cred);
}

export async function getAuthCredential(username: string): Promise<OfflineCredential | null> {
  return getByKey<OfflineCredential>(STORES.AUTH_CREDS, username.toLowerCase());
}

export async function clearAllAuthCredentials(): Promise<void> {
  await clearStore(STORES.AUTH_CREDS);
}

// ─── Sync metadata ────────────────────────────────────────────────────────────

export async function setLastSync(entity: string, timestamp: number): Promise<void> {
  await putOne(STORES.SYNC_META, { key: entity, value: timestamp });
}

export async function getLastSync(entity: string): Promise<number | null> {
  const row = await getByKey<{ key: string; value: number }>(STORES.SYNC_META, entity);
  return row?.value ?? null;
}

// ─── Write-through cache helper ───────────────────────────────────────────────

/**
 * Wraps any async fetch function with an IndexedDB fallback.
 *
 * - Online:  fetches from Supabase, writes result to IDB in background.
 * - Offline: returns cached data from IDB immediately.
 * - Error:   if fetch fails but IDB has data, returns cached data silently.
 */
export async function withOfflineCache<T>(
  store: StoreKey,
  fetchFn: () => Promise<T[]>,
): Promise<T[]> {
  if (!navigator.onLine) {
    return getAll<T>(store);
  }

  try {
    const data = await fetchFn();
    // Write-through: persist to IDB without blocking the return
    putBatch(store, data as any[])
      .then(() => setLastSync(store, Date.now()))
      .catch((err) => console.warn('[offlineDb] write-through failed:', err));
    return data;
  } catch (err) {
    // Network error while theoretically online — try IDB fallback
    const cached = await getAll<T>(store);
    if (cached.length > 0) {
      console.warn('[offlineDb] fetch failed, serving from cache:', store);
      return cached;
    }
    throw err;
  }
}
