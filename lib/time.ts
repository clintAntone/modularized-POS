/**
 * TIME INTEGRITY SERVICE
 * Synchronizes client clock with server time to prevent local clock manipulation.
 */

let initialServerTime = 0;
let initialPerformanceTime = 0;
let isInitialized = false;

export const syncWithServerTime = async () => {
  const PROXY_URL = '/api/time';
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

  const attemptSync = async (url: string, isSupabase = false, name = '') => {
    const startPerformance = performance.now();
    const startWall = Date.now();
    
    const response = await fetch(url, { 
      method: isSupabase ? 'HEAD' : 'GET',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    const endPerformance = performance.now();
    
    if (!response.ok && !isSupabase) throw new Error(`Failed to fetch from ${url}`);
    
    let serverTime: number;

    if (isSupabase || name === 'GOOGLE_HEADER') {
      const dateHeader = response.headers.get('Date');
      if (!dateHeader) throw new Error('No Date header in response');
      serverTime = new Date(dateHeader).getTime();
    } else {
      const data = await response.json();
      let serverTimeValue = data.timestamp || data.iso || data.datetime || data.dateTime;
      if (typeof serverTimeValue === 'string' && /^\d+$/.test(serverTimeValue)) {
        serverTimeValue = parseInt(serverTimeValue);
      }
      serverTime = new Date(serverTimeValue).getTime();
    }

    if (isNaN(serverTime)) throw new Error('Invalid date received');
    
    const latency = (endPerformance - startPerformance) / 2;
    
    // Anchor the true time to performance.now() instead of Date.now()
    initialServerTime = serverTime + latency;
    initialPerformanceTime = endPerformance;
    isInitialized = true;
    
    console.log(`🕒 Time Sync [${name || url}]: Anchored to Monotonic Clock (Latency: ${latency.toFixed(2)}ms)`);
    return true;
  };

  // Try in parallel for speed, but prioritize the most reliable ones
  const urlsToTry = [
    { url: PROXY_URL, isSupabase: false, name: 'LOCAL_PROXY' },
    { url: 'https://worldtimeapi.org/api/timezone/Asia/Manila', isSupabase: false, name: 'WORLD_TIME_API' },
    { url: 'https://timeapi.io/api/Time/current/zone?timeZone=Asia/Manila', isSupabase: false, name: 'TIME_API_IO' },
    { url: SUPABASE_URL, isSupabase: true, name: 'SUPABASE_HEADER' },
    { url: 'https://www.google.com', isSupabase: true, name: 'GOOGLE_HEADER' }
  ].filter(item => !!item.url);

  try {
    // Use Promise.any to get the first successful sync
    await Promise.any(urlsToTry.map(item => attemptSync(item.url, item.isSupabase, item.name)));
    return true;
  } catch (e) {
    console.error('❌ All time sync attempts failed or timed out. System will use local device time.');
    // Fallback to wall clock if everything fails
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
