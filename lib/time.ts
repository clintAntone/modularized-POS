/**
 * TIME INTEGRITY SERVICE
 * Synchronizes client clock with server time to prevent local clock manipulation.
 */

let initialServerTime = 0;
let initialPerformanceTime = 0;
let isInitialized = false;

// Sync metadata — populated after syncWithServerTime() completes
let syncMetadata: {
  source: string;
  serverTime: number;
  deviceTime: number;
  driftSeconds: number;
} | null = null;

export const getSyncMetadata = () => syncMetadata;

export const syncWithServerTime = async () => {
  const TIMEOUT_MS = 5000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const t0 = performance.now();
    const response = await fetch('/api/time', {
      cache: 'no-store',
      signal: controller.signal,
    });
    const t1 = performance.now();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.timestamp || isNaN(data.timestamp)) throw new Error('Invalid timestamp');

    const serverTime = data.timestamp + (t1 - t0) / 2;
    const deviceTime = Date.now();
    initialServerTime = serverTime;
    initialPerformanceTime = t1;
    isInitialized = true;
    syncMetadata = {
      source: 'hilotcenter-time-api',
      serverTime,
      deviceTime,
      driftSeconds: Math.round((serverTime - deviceTime) / 10) / 100,
    };
    return true;
  } catch {
    // Fall back to device clock if server unreachable
    if (!isInitialized) {
      initialServerTime = Date.now();
      initialPerformanceTime = performance.now();
      isInitialized = true;
      syncMetadata = { source: 'device_clock', serverTime: initialServerTime, deviceTime: initialServerTime, driftSeconds: 0 };
    }
    return false;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Returns a Date object adjusted by monotonic performance time.
 * This is IMMUNE to device clock changes after the initial sync.
 */
export const getTrueDate = (): Date => {
  if (!isInitialized) return new Date();
  const elapsed = performance.now() - initialPerformanceTime;
  return new Date(initialServerTime + elapsed);
};

/**
 * Returns the current timestamp in ISO format using the true server time.
 */
export const getTrueISOString = (): string => {
  return getTrueDate().toISOString();
};

/**
 * Returns the current timestamp in ISO format but adjusted to Manila time (UTC+8)
 * so that .startsWith(todayStr) works correctly for Manila business days.
 * Format: YYYY-MM-DDTHH:mm:ss.sss+08:00
 */
export const getTrueManilaISOString = (): string => {
  const now = getTrueDate();
  const manilaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const manilaTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now);
  
  // Get milliseconds from the true date
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  
  return `${manilaDate}T${manilaTime}.${ms}+08:00`;
};

export const isTimeSynced = () => isInitialized;

/**
 * Fetches the authoritative server time from /api/time at the exact moment of
 * the operation, bypassing the pre-synced client clock entirely.
 * Falls back to getTrueManilaISOString() if the server is unreachable.
 */
export const getServerTimestamp = async (): Promise<string> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const url = import.meta.env.VITE_TIME_API_URL || '/api/time';
    const t0 = performance.now();
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    const t1 = performance.now();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const ms = data.timestamp;
    if (!ms || isNaN(ms)) throw new Error('Invalid timestamp');

    // Re-sync the monotonic baseline so getTrueManilaISOString() stays accurate
    // even if visibilitychange hasn't fired yet (e.g., device just woke from sleep).
    initialServerTime = ms + (t1 - t0) / 2;
    initialPerformanceTime = t1;
    isInitialized = true;

    const serverDate = new Date(ms);
    const manilaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(serverDate);
    const manilaTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(serverDate);
    const msStr = String(serverDate.getMilliseconds()).padStart(3, '0');
    return `${manilaDate}T${manilaTime}.${msStr}+08:00`;
  } catch {
    return getTrueManilaISOString();
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Converts a Supabase TIMESTAMPTZ string to a Manila date string (YYYY-MM-DD).
 * Supabase returns UTC timestamps like "2026-04-16 17:44:31.015+00" which must be
 * interpreted in Manila time (UTC+8) to get the correct local business date.
 * Use this instead of .startsWith(todayStr) when filtering transactions/expenses.
 */
export const toManilaDateStr = (timestamp: string): string => {
  // Normalize Supabase format: "2026-04-16 17:44:31+00" → valid ISO string
  const normalized = timestamp.replace(' ', 'T').replace(/\+00$/, '+00:00');
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(normalized));
};

/**
 * Formats a date in Manila time (UTC+8) regardless of local timezone.
 */
export const formatManilaTime = (date: Date, options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: true }) => {
  return new Intl.DateTimeFormat('en-US', {
    ...options,
    timeZone: 'Asia/Manila'
  }).format(date);
};

/**
 * Formats a date in Manila date format (UTC+8).
 */
export const formatManilaDate = (date: Date, options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }) => {
  return new Intl.DateTimeFormat('en-US', {
    ...options,
    timeZone: 'Asia/Manila'
  }).format(date);
};

/**
 * Returns the current Manila year as a number (e.g. 2026).
 * Use instead of new Date().getFullYear() to avoid local timezone drift.
 */
export const getManilaYear = (): number => {
  return parseInt(getManilaTodayStr().slice(0, 4), 10);
};

/**
 * Returns the current Manila month as a 0-indexed number (0=Jan, 11=Dec).
 * Use instead of new Date().getMonth() to avoid local timezone drift.
 */
export const getManilaMonth = (): number => {
  return parseInt(getManilaTodayStr().slice(5, 7), 10) - 1;
};

/**
 * Formats a number as Philippine Peso with thousand separators.
 * Shows decimal places only when the amount has non-zero cents.
 * Examples: 10000 → "₱10,000" | 1250.50 → "₱1,250.50"
 */
export const formatPeso = (amount: number): string => {
  const hasDecimals = amount % 1 !== 0;
  return `₱${new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount)}`;
};

/**
 * Returns the current date string in YYYY-MM-DD format for Manila.
 */
export const getManilaTodayStr = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(getTrueDate());
};
