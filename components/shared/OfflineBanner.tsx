import React, { useState, useEffect } from 'react';
import { getLastSync } from '../../lib/offlineDb';

interface OfflineBannerProps {
  isOffline: boolean;
}

function formatAgo(ms: number): string {
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ isOffline }) => {
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!isOffline) return;
    // Read the most recent sync timestamp across all stores
    getLastSync('branches').then(t => { if (t) setLastSync(t); }).catch(() => {});
    // Tick every minute to keep the "X minutes ago" label fresh
    const interval = setInterval(() => setTick(n => n + 1), 60_000);
    return () => clearInterval(interval);
  }, [isOffline]);

  if (!isOffline) return null;

  return (
    <div className="w-full bg-amber-500/10 dark:bg-amber-500/15 border-b border-amber-500/20 dark:border-amber-500/25 px-4 py-2 flex items-center justify-center gap-2.5 no-print">
      <svg className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M12 12h.01M8.464 15.536a5 5 0 010-7.072M5.636 18.364a9 9 0 010-12.728" />
        <line x1="2" y1="2" x2="22" y2="22" strokeLinecap="round" />
      </svg>
      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
        Offline — showing cached data
        {lastSync ? ` from ${formatAgo(lastSync)}` : ''}
      </p>
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
    </div>
  );
};
