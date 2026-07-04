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

  const commit = (serverTime: number, perfTime: number, source: string) => {
    if (isInitialized) return; // first writer wins — ignore race losers
    const deviceTime = Date.now();
    initialServerTime = serverTime;
    initialPerformanceTime = perfTime;
    isInitialized = true;
    syncMetadata = {
      source,
      serverTime,
      deviceTime,
      driftSeconds: Math.round((serverTime - deviceTime) / 10) / 100,
    };
  };

  // Source 1: timeapi.io — external reference clock
  const attemptTimeApi = async (): Promise<void> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const t0 = performance.now();
      const response = await fetch(
        'https://timeapi.io/api/Time/current/zone?timeZone=Asia/Manila',
        { method: 'GET', cache: 'no-store', headers: { 'Cache-Control': 'no-cache' }, signal: controller.signal }
      );
      const t1 = performance.now();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      let val = data.timestamp || data.iso || data.datetime || data.dateTime || data.currentDateTime;
      if (typeof val === 'string' && /^\d+$/.test(val)) val = parseInt(val, 10);
      const serverTime = new Date(val).getTime();
      if (isNaN(serverTime)) throw new Error('Invalid date from timeapi.io');
      commit(serverTime + (t1 - t0) / 2, t1, 'timeapi.io');
    } finally {
      clearTimeout(timer);
    }
  };

  // Source 2: Supabase Date header — always reachable if the app is working at all
  const attemptSupabase = async (): Promise<void> => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) throw new Error('No Supabase URL configured');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const t0 = performance.now();
      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'HEAD',
        headers: { 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || '' },
        signal: controller.signal,
      });
      const t1 = performance.now();
      const dateHeader = response.headers.get('Date');
      if (!dateHeader) throw new Error('No Date header in Supabase response');
      const serverTime = new Date(dateHeader).getTime();
      if (isNaN(serverTime)) throw new Error('Invalid Date header from Supabase');
      commit(serverTime + (t1 - t0) / 2, t1, 'Supabase');
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    // Race both sources — whichever responds first wins
    await Promise.any([attemptTimeApi(), attemptSupabase()]);
    return true;
  } catch {
    initialServerTime = Date.now();
    initialPerformanceTime = performance.now();
    syncMetadata = { source: 'device_clock', serverTime: initialServerTime, deviceTime: initialServerTime, driftSeconds: 0 };
    return false;
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
