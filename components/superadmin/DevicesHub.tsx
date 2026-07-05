import React, { useState, useEffect, useMemo } from 'react';
import { Branch } from '../../types';
import { supabase } from '../../lib/supabase';
import { DB_TABLES } from '../../constants/db_schema';

interface DeviceLog {
  device_id: string;
  branch_id: string;
  user_agent: string;
  browser: string;
  browser_version: string;
  os: string;
  device_type: string;
  device_model?: string;
  screen_resolution: string;
  first_seen: string;
  last_seen: string;
  session_count: number;
  location?: string;
  fingerprint_id?: string;
}

interface DevicesHubProps {
  branches: Branch[];
}

const formatRelativeTime = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatDateTime = (iso: string) => {
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

const DeviceTypeIcon = ({ type }: { type: string }) => {
  if (type === 'Mobile') return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
      <line x1="12" y1="18" x2="12.01" y2="18"/>
    </svg>
  );
  if (type === 'Tablet') return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2"/>
      <line x1="12" y1="18" x2="12.01" y2="18"/>
    </svg>
  );
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  );
};

const BrowserIcon = ({ browser }: { browser: string }) => {
  const colors: Record<string, string> = {
    Chrome: 'text-yellow-500', Firefox: 'text-orange-500', Safari: 'text-blue-500',
    Edge: 'text-blue-600', Opera: 'text-red-500',
  };
  return (
    <span className={`text-xs font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-slate-100 ${colors[browser] || 'text-slate-500'}`}>
      {browser}
    </span>
  );
};

const deviceTypeColor: Record<string, string> = {
  Mobile:  'bg-rose-50 text-rose-600 border-rose-100',
  Tablet:  'bg-amber-50 text-amber-600 border-amber-100',
  Desktop: 'bg-sky-50 text-sky-600 border-sky-100',
};

type DatePreset = 'today' | 'yesterday' | '7d' | '30d';

const getLocalDateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

export const DevicesHub: React.FC<DevicesHubProps> = ({ branches }) => {
  const [devices, setDevices] = useState<DeviceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('today');
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [expandedDeviceId, setExpandedDeviceId] = useState<string | null>(null);

  const fetchDevices = async () => {
    const { data } = await supabase
      .from(DB_TABLES.DEVICE_LOGS)
      .select('*')
      .order('last_seen', { ascending: false });
    // Deduplicate by device_id — keep only the most-recent entry per device
    const seen = new Set<string>();
    const deduped = (data || []).filter((d: DeviceLog) => {
      if (seen.has(d.device_id)) return false;
      seen.add(d.device_id);
      return true;
    });
    setDevices(deduped);
    setLoading(false);
  };

  useEffect(() => {
    fetchDevices();
    const channel = supabase
      .channel('device_logs_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: DB_TABLES.DEVICE_LOGS }, fetchDevices)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const branchMap = useMemo(() => Object.fromEntries(branches.map(b => [b.id, b])), [branches]);

  const branchSummary = useMemo(() => {
    const todayManila = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());

    const byBranch: Record<string, { todayDevices: DeviceLog[]; periodDevices: DeviceLog[] }> = {};

    devices.forEach(d => {
      if (!byBranch[d.branch_id]) byBranch[d.branch_id] = { todayDevices: [], periodDevices: [] };

      const lastSeenStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date(d.last_seen));

      if (lastSeenStr === todayManila) byBranch[d.branch_id].todayDevices.push(d);

      // Date period filter
      const lastSeen = new Date(d.last_seen);
      const now = new Date();
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
      const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      const ago7 = new Date(todayStart); ago7.setDate(ago7.getDate() - 7);
      const ago30 = new Date(todayStart); ago30.setDate(ago30.getDate() - 30);

      let inPeriod = false;
      if (datePreset === 'today' && lastSeenStr === todayManila) inPeriod = true;
      if (datePreset === 'yesterday' && lastSeen >= yesterdayStart && lastSeen < todayStart) inPeriod = true;
      if (datePreset === '7d' && lastSeen >= ago7) inPeriod = true;
      if (datePreset === '30d' && lastSeen >= ago30) inPeriod = true;

      if (inPeriod) byBranch[d.branch_id].periodDevices.push(d);
    });

    return byBranch;
  }, [devices, datePreset]);

  const visibleBranches = useMemo(() => {
    const term = searchTerm.toUpperCase();
    return Object.entries(branchSummary)
      .filter(([, s]) => s.periodDevices.length > 0)
      .filter(([branchId]) => {
        const name = (branchMap[branchId]?.name || branchId).toUpperCase();
        if (name.includes('TEST')) return false;
        return !term || name.includes(term);
      })
      .map(([branchId, s]) => ({
        branchId,
        branch: branchMap[branchId],
        todayCount: s.todayDevices.length,
        periodCount: s.periodDevices.length,
        isMultiDevice: s.todayDevices.length >= 3,
        todayDevices: s.todayDevices.sort(
          (a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime()
        ),
      }))
      .sort((a, b) => b.todayCount - a.todayCount || b.periodCount - a.periodCount);
  }, [branchSummary, branchMap, searchTerm]);


  if (loading) {
    return (
      <div className="pb-20 space-y-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-white rounded-3xl border border-slate-100 p-5 animate-pulse h-20" />
        ))}
      </div>
    );
  }

  return (
    <div className="pb-20 space-y-5">

      {/* Filter bar */}
      <div className="bg-white rounded-2xl border border-slate-100 p-3 flex flex-wrap gap-2 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input
            type="text"
            placeholder="Search branch..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value.toUpperCase())}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border-2 border-transparent rounded-xl font-black text-xs uppercase tracking-widest outline-none focus:border-slate-300 focus:bg-white transition-all"
          />
        </div>

        {/* Date preset dropdown */}
        <select
          value={datePreset}
          onChange={e => {
            setDatePreset(e.target.value as DatePreset);
            setSelectedBranchId(null);
          }}
          className="px-3 py-2.5 bg-slate-50 border-2 border-transparent rounded-xl font-black text-xs uppercase tracking-widest outline-none focus:border-slate-300 focus:bg-white transition-all"
        >
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
        </select>

        {/* Count */}
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">
          {visibleBranches.length} branch{visibleBranches.length !== 1 ? 'es' : ''}
        </span>
      </div>

      {/* Branch list */}
      {visibleBranches.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center">
          <div className="text-5xl opacity-20 mb-4">📱</div>
          <p className="text-xs font-black text-slate-300 uppercase tracking-wider">No branches found</p>
          <p className="text-xs text-slate-300 mt-1">No devices seen for the selected period</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {/* Desktop-only column header */}
          <div className="hidden md:flex items-center gap-4 px-5 py-3 bg-slate-50 border-b border-slate-100">
            <p className="flex-1 text-xs font-medium text-slate-400 uppercase tracking-wide">Branch</p>
            {datePreset !== 'today' && (
              <p className="w-24 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Period</p>
            )}
            <p className="w-24 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Today</p>
            <p className="w-28 text-xs font-medium text-slate-400 uppercase tracking-wide">Status</p>
            <div className="w-4" />
          </div>

          <div className="divide-y divide-slate-100">
            {visibleBranches.map(({ branchId, branch, todayCount, periodCount, isMultiDevice, todayDevices }) => {
              const isOpen = selectedBranchId === branchId;
              const branchName = (branch?.name || branchId).replace('BRANCH - ', '');

              return (
                <div key={branchId} className={isMultiDevice ? 'border-l-4 border-l-rose-500' : 'border-l-4 border-l-transparent'}>
                  {/* Branch row */}
                  <button
                    onClick={() => { setSelectedBranchId(isOpen ? null : branchId); setExpandedDeviceId(null); }}
                    className={`w-full flex items-center gap-4 px-4 py-3.5 text-left transition-colors ${isOpen ? 'bg-slate-50' : 'hover:bg-slate-50/80'}`}
                  >
                    {/* Branch name */}
                    <p className="flex-1 text-xs font-black text-slate-900 uppercase tracking-tight leading-tight truncate min-w-0">
                      {branchName}
                    </p>

                    {/* Period count — desktop only */}
                    {datePreset !== 'today' && (
                      <span className="hidden md:inline-flex w-20 justify-end text-xs font-black text-slate-400 tabular-nums shrink-0">
                        {periodCount}
                      </span>
                    )}

                    {/* Today count — desktop */}
                    <span className={`hidden md:inline-flex w-20 justify-end text-xs font-black tabular-nums shrink-0 ${isMultiDevice ? 'text-rose-600' : 'text-slate-600'}`}>
                      {todayCount}
                    </span>

                    {/* Today count badge — mobile */}
                    <span className={`md:hidden inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black shrink-0 ${isMultiDevice ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                      {isMultiDevice && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />}
                      {todayCount}
                    </span>

                    {/* Status badge — desktop */}
                    <div className="hidden md:flex w-28 shrink-0">
                      {isMultiDevice ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-rose-600 text-white uppercase tracking-widest">
                          <span className="w-1.5 h-1.5 rounded-full bg-white/70 animate-pulse" />
                          Multi-device
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-slate-300">—</span>
                      )}
                    </div>

                    {/* Chevron */}
                    <svg className={`w-4 h-4 shrink-0 transition-transform duration-200 text-slate-400 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Expanded device list */}
                  {isOpen && (
                    <div className="border-t border-slate-100 bg-slate-50/50">
                      {todayDevices.length === 0 ? (
                        <div className="px-5 py-6 text-center">
                          <p className="text-xs font-black text-slate-300 uppercase tracking-widest">No devices seen today</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {todayDevices.map(device => {
                            const isDeviceOpen = expandedDeviceId === device.device_id;
                            return (
                              <div key={device.device_id}>
                                {/* Device row — clickable */}
                                <button
                                  onClick={() => setExpandedDeviceId(isDeviceOpen ? null : device.device_id)}
                                  className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-white/70 transition-colors"
                                >
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 ${deviceTypeColor[device.device_type] || deviceTypeColor.Desktop}`}>
                                    <DeviceTypeIcon type={device.device_type} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <BrowserIcon browser={device.browser} />
                                      <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">{device.os}</span>
                                      {device.device_model && device.device_model !== 'Unknown' && (
                                        <span className="text-xs font-bold text-slate-400">{device.device_model}</span>
                                      )}
                                    </div>
                                    <p className="text-xs font-bold text-slate-400 mt-0.5">
                                      Last seen {formatRelativeTime(device.last_seen)}
                                    </p>
                                  </div>
                                  <span className="shrink-0 px-2 py-1 bg-white border border-slate-100 text-slate-500 rounded-lg text-xs font-black tabular-nums">
                                    {device.session_count} session{device.session_count !== 1 ? 's' : ''}
                                  </span>
                                  <svg className={`w-3.5 h-3.5 shrink-0 text-slate-300 transition-transform duration-150 ${isDeviceOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>

                                {/* Device detail panel */}
                                {isDeviceOpen && (
                                  <div className="px-5 pb-4 pt-1 bg-white border-t border-slate-100">
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                      {[
                                        { label: 'Device Type', value: device.device_type },
                                        { label: 'Browser', value: `${device.browser} ${device.browser_version}`.trim() },
                                        { label: 'OS', value: device.os },
                                        { label: 'Screen', value: device.screen_resolution },
                                        { label: 'First Seen', value: formatDateTime(device.first_seen) },
                                        { label: 'Last Seen', value: formatDateTime(device.last_seen) },
                                        ...(device.location ? [{ label: 'Location', value: device.location }] : []),
                                      ].map(f => (
                                        <div key={f.label} className="bg-slate-50 rounded-xl p-3">
                                          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">{f.label}</p>
                                          <p className="text-xs font-black text-slate-800 leading-snug">{f.value}</p>
                                        </div>
                                      ))}
                                    </div>
                                    {device.user_agent && (
                                      <div className="mt-2 bg-slate-50 rounded-xl p-3">
                                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">User Agent</p>
                                        <p className="text-xs font-mono text-slate-500 break-all leading-relaxed">{device.user_agent}</p>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
