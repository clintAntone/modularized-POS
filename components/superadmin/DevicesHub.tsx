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
    <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-slate-100 ${colors[browser] || 'text-slate-500'}`}>
      {browser}
    </span>
  );
};

const deviceTypeColor: Record<string, string> = {
  Mobile:  'bg-rose-50 text-rose-600 border-rose-100',
  Tablet:  'bg-amber-50 text-amber-600 border-amber-100',
  Desktop: 'bg-sky-50 text-sky-600 border-sky-100',
};

type DatePreset = '' | 'today' | 'yesterday' | '7d' | '30d' | 'custom';

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
  const [filterBranch, setFilterBranch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [sortBy, setSortBy] = useState<'last_seen' | 'first_seen' | 'session_count'>('last_seen');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchDevices = async () => {
    setLoading(true);
    const { data } = await supabase
      .from(DB_TABLES.DEVICE_LOGS)
      .select('*')
      .order('last_seen', { ascending: false });
    setDevices(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchDevices(); }, []);

  const branchMap = useMemo(() => Object.fromEntries(branches.map(b => [b.id, b])), [branches]);

  const filtered = useMemo(() => {
    const term = searchTerm.toUpperCase();

    // Compute date range boundaries from preset
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const ago7 = new Date(todayStart); ago7.setDate(ago7.getDate() - 7);
    const ago30 = new Date(todayStart); ago30.setDate(ago30.getDate() - 30);

    return devices
      .filter(d => {
        const branch = branchMap[d.branch_id];
        const branchName = branch?.name?.toUpperCase() || '';
        if (term && !branchName.includes(term) && !d.browser.toUpperCase().includes(term) && !d.os.toUpperCase().includes(term) && !d.screen_resolution.includes(term)) return false;
        if (filterBranch && d.branch_id !== filterBranch) return false;
        if (filterType && d.device_type !== filterType) return false;

        // Date filter against last_seen
        const lastSeen = new Date(d.last_seen);
        if (datePreset === 'today' && lastSeen < todayStart) return false;
        if (datePreset === 'yesterday' && (lastSeen < yesterdayStart || lastSeen >= todayStart)) return false;
        if (datePreset === '7d' && lastSeen < ago7) return false;
        if (datePreset === '30d' && lastSeen < ago30) return false;
        if (datePreset === 'custom') {
          if (dateFrom) {
            const from = new Date(dateFrom); from.setHours(0, 0, 0, 0);
            if (lastSeen < from) return false;
          }
          if (dateTo) {
            const to = new Date(dateTo); to.setHours(23, 59, 59, 999);
            if (lastSeen > to) return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'session_count') return b.session_count - a.session_count;
        return new Date(b[sortBy]).getTime() - new Date(a[sortBy]).getTime();
      });
  }, [devices, searchTerm, filterBranch, filterType, sortBy, branchMap, datePreset, dateFrom, dateTo]);

  // Stats
  const stats = useMemo(() => {
    const byType = { Mobile: 0, Tablet: 0, Desktop: 0 };
    const byBranch: Record<string, number> = {};
    devices.forEach(d => {
      byType[d.device_type as keyof typeof byType] = (byType[d.device_type as keyof typeof byType] || 0) + 1;
      byBranch[d.branch_id] = (byBranch[d.branch_id] || 0) + 1;
    });
    const recentlyActive = devices.filter(d => Date.now() - new Date(d.last_seen).getTime() < 7 * 86400000).length;
    return { total: devices.length, byType, recentlyActive };
  }, [devices]);

  if (loading) {
    return (
      <div className="animate-in fade-in duration-700 pb-20 space-y-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-white rounded-3xl border border-slate-100 p-5 animate-pulse h-20" />
        ))}
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-700 pb-20 space-y-5">

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Devices', value: stats.total, color: 'text-slate-900', bg: 'bg-white' },
          { label: 'Active (7d)', value: stats.recentlyActive, color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: 'Mobile', value: stats.byType.Mobile, color: 'text-rose-700', bg: 'bg-rose-50' },
          { label: 'Desktop / Tablet', value: stats.byType.Desktop + stats.byType.Tablet, color: 'text-sky-700', bg: 'bg-sky-50' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl border border-slate-100 p-4`}>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{s.label}</p>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-3xl border border-slate-100 p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              type="text"
              placeholder="SEARCH BRANCH, BROWSER, OS..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value.toUpperCase())}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border-2 border-transparent rounded-xl font-black text-[10px] uppercase tracking-widest outline-none focus:border-slate-300 focus:bg-white transition-all"
            />
          </div>

          {/* Branch filter */}
          <select
            value={filterBranch}
            onChange={e => setFilterBranch(e.target.value)}
            className="px-3 py-2.5 bg-slate-50 border-2 border-transparent rounded-xl font-black text-[10px] uppercase tracking-widest outline-none focus:border-slate-300 focus:bg-white transition-all"
          >
            <option value="">ALL BRANCHES</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name.replace('BRANCH - ', '')}</option>)}
          </select>

          {/* Type filter */}
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="px-3 py-2.5 bg-slate-50 border-2 border-transparent rounded-xl font-black text-[10px] uppercase tracking-widest outline-none focus:border-slate-300 focus:bg-white transition-all"
          >
            <option value="">ALL TYPES</option>
            <option value="Mobile">Mobile</option>
            <option value="Tablet">Tablet</option>
            <option value="Desktop">Desktop</option>
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="px-3 py-2.5 bg-slate-50 border-2 border-transparent rounded-xl font-black text-[10px] uppercase tracking-widest outline-none focus:border-slate-300 focus:bg-white transition-all"
          >
            <option value="last_seen">SORT: LAST SEEN</option>
            <option value="first_seen">SORT: FIRST SEEN</option>
            <option value="session_count">SORT: SESSIONS</option>
          </select>

          <button
            onClick={fetchDevices}
            className="px-4 py-2.5 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-700 transition-all active:scale-95"
          >
            Refresh
          </button>
        </div>

        {/* Date filter */}
        <div className="space-y-2 pt-1 border-t border-slate-50">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Filter by Last Seen</p>
          <div className="flex flex-wrap gap-1.5">
            {([
              { value: '',          label: 'All Time'  },
              { value: 'today',     label: 'Today'     },
              { value: 'yesterday', label: 'Yesterday' },
              { value: '7d',        label: 'Last 7 Days'  },
              { value: '30d',       label: 'Last 30 Days' },
              { value: 'custom',    label: 'Custom Range' },
            ] as { value: DatePreset; label: string }[]).map(p => (
              <button
                key={p.value}
                onClick={() => {
                  setDatePreset(p.value);
                  if (p.value !== 'custom') { setDateFrom(''); setDateTo(''); }
                }}
                className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                  datePreset === p.value
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {datePreset === 'custom' && (
            <div className="flex flex-wrap items-center gap-2 pt-1 animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">From</label>
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || getLocalDateStr(new Date())}
                  onChange={e => setDateFrom(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border-2 border-transparent rounded-xl font-bold text-[10px] text-slate-700 outline-none focus:border-slate-300 focus:bg-white transition-all"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">To</label>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom}
                  max={getLocalDateStr(new Date())}
                  onChange={e => setDateTo(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border-2 border-transparent rounded-xl font-bold text-[10px] text-slate-700 outline-none focus:border-slate-300 focus:bg-white transition-all"
                />
              </div>
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => { setDateFrom(''); setDateTo(''); }}
                  className="text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-rose-500 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
          {filtered.length} device{filtered.length !== 1 ? 's' : ''} found
        </p>
      </div>

      {/* Device List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 p-16 text-center">
          <div className="text-5xl opacity-20 mb-4">📱</div>
          <p className="text-xs font-black text-slate-300 uppercase tracking-[0.2em]">No devices found</p>
          <p className="text-[10px] text-slate-300 mt-1">Devices will appear when managers open their POS dashboard</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(device => {
            const branch = branchMap[device.branch_id];
            const isExpanded = expandedId === device.device_id;
            const isRecent = Date.now() - new Date(device.last_seen).getTime() < 3600000; // 1h

            return (
              <div
                key={device.device_id}
                className="bg-white rounded-2xl border border-slate-100 overflow-hidden transition-all duration-200 hover:border-slate-200 hover:shadow-sm"
              >
                <button
                  className="w-full flex items-center gap-3 p-4 text-left"
                  onClick={() => setExpandedId(isExpanded ? null : device.device_id)}
                >
                  {/* Device type icon */}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${deviceTypeColor[device.device_type] || deviceTypeColor.Desktop}`}>
                    <DeviceTypeIcon type={device.device_type} />
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight truncate">
                        {branch?.name?.replace('BRANCH - ', '') || device.branch_id}
                      </p>
                      {isRecent && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 border border-emerald-100 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-[7px] font-black text-emerald-600 uppercase tracking-widest">Active</span>
                        </span>
                      )}
                      <BrowserIcon browser={device.browser} />
                      {device.device_model && device.device_model !== 'Unknown' && (
                        <span className="text-[9px] font-bold text-slate-500 hidden sm:inline">{device.device_model}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                        {device.os} · {device.session_count} session{device.session_count !== 1 ? 's' : ''} · {formatRelativeTime(device.last_seen)}
                      </p>
                      {device.location && (
                        <span className="flex items-center gap-1 text-[9px] font-bold text-indigo-500">
                          <svg className="w-2.5 h-2.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                          {device.location}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Chevron */}
                  <svg className={`w-4 h-4 text-slate-300 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                  </svg>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-slate-50 px-4 pb-4 pt-3 space-y-3 animate-in fade-in duration-150">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {[
                        { label: 'Branch', value: branch?.name || device.branch_id },
                        { label: 'Device Type', value: device.device_type },
                        { label: 'Browser', value: `${device.browser} ${device.browser_version}`.trim() },
                        { label: 'Operating System', value: device.os },
                        { label: 'Screen', value: device.screen_resolution },
                        { label: 'Total Sessions', value: device.session_count.toString() },
                      ].map(f => (
                        <div key={f.label} className="bg-slate-50 rounded-xl p-3">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{f.label}</p>
                          <p className="text-[11px] font-black text-slate-800">{f.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-50 rounded-xl p-3">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">First Seen</p>
                        <p className="text-[10px] font-black text-slate-700">{formatDateTime(device.first_seen)}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-3">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Last Seen</p>
                        <p className="text-[10px] font-black text-slate-700">{formatDateTime(device.last_seen)}</p>
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">User Agent</p>
                      <p className="text-[9px] font-mono text-slate-500 break-all leading-relaxed">{device.user_agent}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
