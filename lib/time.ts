/**
 * TIME INTEGRITY SERVICE
 * Synchronizes client clock with server time to prevent local clock manipulation.
 */

let initialServerTime = 0;
let initialPerformanceTime = 0;
let isInitialized = false;

export const syncWithServerTime = async () => {
  const PROXY_URL = '/api/time';
  const TIMEOUT_MS = 5000;

  const attemptSync = async (url: string, name: string): Promise<boolean> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const startPerformance = performance.now();

      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
        signal: controller.signal,
      });

      const endPerformance = performance.now();

      if (!response.ok) throw new Error(`HTTP ${response.status} from ${name}`);

      const data = await response.json();
      let serverTimeValue = data.timestamp || data.iso || data.datetime || data.dateTime || data.currentDateTime;
      if (typeof serverTimeValue === 'string' && /^\d+$/.test(serverTimeValue)) {
        serverTimeValue = parseInt(serverTimeValue, 10);
      }
      const serverTime = new Date(serverTimeValue).getTime();
      if (isNaN(serverTime)) throw new Error(`Invalid date from ${name}`);

      const latency = (endPerformance - startPerformance) / 2;
      initialServerTime = serverTime + latency;
      initialPerformanceTime = endPerformance;
      isInitialized = true;

      return true;
    } finally {
      clearTimeout(timer);
    }
  };

  // Sources: local proxy first (most reliable), then public fallbacks.
  // Removed: worldtimeapi.org (CORS-blocked), Supabase root HEAD (401), google.com HEAD (Capacitor TypeError).
  const sources = [
    { url: PROXY_URL,                                                              name: 'LOCAL_PROXY'  },
    { url: 'https://timeapi.io/api/Time/current/zone?timeZone=Asia/Manila',       name: 'TIME_API_IO'  },
  ];

  try {
    await Promise.any(sources.map(s => attemptSync(s.url, s.name)));
    return true;
  } catch {
    console.warn('⚠️ All time sync sources failed. Falling back to local device clock.');
    initialServerTime = Date.now();
    initialPerformanceTime = performance.now();
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
