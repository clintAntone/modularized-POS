import React, { useState, useEffect, useMemo } from 'react';
import { Branch, Transaction } from '../../../types';
import { supabase } from '../../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';
import { UI_THEME } from '../../../constants/ui_designs';
import { formatManilaDate, formatManilaTime, toManilaDateStr } from '../../../lib/time';
import { playSound } from '../../../lib/audio';

interface ClientHistorySectionProps {
  branch: Branch;
}

interface ClientProfile {
  key: string;
  displayName: string;
  visitCount: number;
  totalSpend: number;
  lastVisit: string;
  topService: string;
  transactions: Transaction[];
}

interface DayEntry {
  dateKey: string;      // YYYY-MM-DD (Manila)
  clientCount: number;
  sessionCount: number;
}

function buildProfiles(transactions: Transaction[]): ClientProfile[] {
  const map = new Map<string, Transaction[]>();

  transactions.forEach(tx => {
    const key = (tx.clientName || '').toUpperCase().trim() || 'WALK-IN CLIENT';
    const existing = map.get(key) || [];
    existing.push(tx);
    map.set(key, existing);
  });

  const profiles: ClientProfile[] = [];

  map.forEach((txs, key) => {
    const sorted = [...txs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const serviceCounts: Record<string, number> = {};
    txs.forEach(tx => {
      const s = tx.serviceName || 'Unknown';
      serviceCounts[s] = (serviceCounts[s] || 0) + 1;
    });
    const topService = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

    profiles.push({
      key,
      displayName: key,
      visitCount: txs.length,
      totalSpend: txs.reduce((s, t) => s + (Number(t.total) || 0), 0),
      lastVisit: sorted[0]?.timestamp || '',
      topService,
      transactions: sorted,
    });
  });

  return profiles.sort((a, b) => b.visitCount - a.visitCount);
}

// Build daily summary directly from sales_reports rows — report_date is already
// a Manila YYYY-MM-DD string, so no timestamp parsing or timezone conversion needed.
function buildDailySummaryFromReports(
  reports: { reportDate: string; sessions: Transaction[] }[],
  todayDate: string,
  todayLiveSessions: Transaction[]
): DayEntry[] {
  const entries: DayEntry[] = reports.map(r => {
    const names = new Set(r.sessions.map(tx => (tx.clientName || 'WALK-IN').toUpperCase().trim()));
    return { dateKey: r.reportDate, clientCount: names.size, sessionCount: r.sessions.length };
  });

  // Prepend today's live transactions if not yet submitted as a report
  const hasReportForToday = reports.some(r => r.reportDate === todayDate);
  if (!hasReportForToday && todayLiveSessions.length > 0) {
    const names = new Set(todayLiveSessions.map(tx => (tx.clientName || 'WALK-IN').toUpperCase().trim()));
    entries.unshift({ dateKey: todayDate, clientCount: names.size, sessionCount: todayLiveSessions.length });
  }

  return entries.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

function labelDateKey(dateKey: string): string {
  const now = new Date();
  const manilaToday = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const manilaYesterday = yesterdayDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  if (dateKey === manilaToday) return 'Today';
  if (dateKey === manilaYesterday) return 'Yesterday';
  const d = new Date(dateKey + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Loading Skeleton ────────────────────────────────────────────
const BrowseSkeleton: React.FC = () => (
  <div className="space-y-2.5 animate-pulse">
    {Array.from({ length: 7 }).map((_, i) => (
      <div key={i} className="bg-white rounded-2xl border border-slate-100 px-4 py-3.5 flex items-center gap-4">
        <div className="w-9 h-9 bg-slate-100 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-2.5 bg-slate-100 rounded-full w-28" />
          <div className="h-2 bg-slate-100 rounded-full w-16" />
        </div>
        <div className="h-3 bg-slate-100 rounded-full w-12" />
      </div>
    ))}
  </div>
);

// ── KPI Card ────────────────────────────────────────────────────
const KpiCard: React.FC<{ label: string; value: string; sub?: string; accent?: string }> = ({ label, value, sub, accent = 'text-slate-900' }) => (
  <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-1 shadow-sm">
    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</p>
    <p className={`text-lg font-black tabular-nums leading-none ${accent}`}>{value}</p>
    {sub && <p className="text-xs font-bold text-slate-400 uppercase">{sub}</p>}
  </div>
);

// ── Service Bar Chart ───────────────────────────────────────────
const ServiceBarChart: React.FC<{ txs: Transaction[] }> = ({ txs }) => {
  const counts: Record<string, number> = {};
  txs.forEach(tx => {
    const s = tx.serviceName || 'Unknown';
    counts[s] = (counts[s] || 0) + 1;
  });

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = entries[0]?.[1] || 1;

  return (
    <div className="space-y-3">
      {entries.map(([name, count]) => (
        <div key={name} className="space-y-1.5">
          <div className="flex justify-between items-center">
            <p className="text-xs font-black text-slate-700 uppercase tracking-tight truncate pr-2">{name}</p>
            <p className="text-xs font-black text-slate-500 tabular-nums shrink-0">{count}x</p>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-400 rounded-full transition-all duration-700"
              style={{ width: `${(count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Staff Preference ────────────────────────────────────────────
const PreferredStaff: React.FC<{ txs: Transaction[] }> = ({ txs }) => {
  const staffCounts: Record<string, number> = {};

  txs.forEach(tx => {
    if (tx.therapistName?.trim()) {
      const n = tx.therapistName.trim().toUpperCase();
      staffCounts[n] = (staffCounts[n] || 0) + 1;
    }
    if (tx.bonesetterName?.trim()) {
      const n = tx.bonesetterName.trim().toUpperCase();
      staffCounts[n] = (staffCounts[n] || 0) + 1;
    }
  });

  const entries = Object.entries(staffCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (entries.length === 0) return <p className="text-xs font-bold text-slate-400 uppercase">No staff data</p>;

  return (
    <div className="space-y-2.5">
      {entries.map(([name, count], i) => (
        <div key={name} className="flex items-center gap-3">
          <div className={`w-6 h-6 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
            {i + 1}
          </div>
          <p className="flex-1 text-xs font-black text-slate-800 uppercase tracking-tight truncate">{name}</p>
          <p className="text-xs font-black text-slate-400 tabular-nums shrink-0">{count}x</p>
        </div>
      ))}
    </div>
  );
};

// ── Main Component ──────────────────────────────────────────────
export const ClientHistorySection: React.FC<ClientHistorySectionProps> = ({ branch }) => {
  // allTransactions: used only for client-profile search
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  // reportRows: sales_reports rows with report_date + session_data for the daily summary
  const [reportRows, setReportRows] = useState<{ reportDate: string; sessions: Transaction[] }[]>([]);
  // todayLiveSessions: live transactions for today not yet submitted as a report
  const [todayLiveSessions, setTodayLiveSessions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientProfile | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchAll = async () => {
      setLoading(true);
      try {
        const manilaToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

        // 1. Sales reports — use report_date as the authoritative date key
        const { data: reportData, error: reportError } = await supabase
          .from(DB_TABLES.SALES_REPORTS)
          .select(`${DB_COLUMNS.REPORT_DATE}, ${DB_COLUMNS.SESSION_DATA}`)
          .eq(DB_COLUMNS.BRANCH_ID, branch.id)
          .order(DB_COLUMNS.REPORT_DATE, { ascending: false })
          .limit(90);

        if (reportError) throw reportError;

        const rows: { reportDate: string; sessions: Transaction[] }[] = (reportData || []).map(r => {
          const raw = typeof r[DB_COLUMNS.SESSION_DATA] === 'string'
            ? JSON.parse(r[DB_COLUMNS.SESSION_DATA])
            : (r[DB_COLUMNS.SESSION_DATA] || []);
          return { reportDate: r[DB_COLUMNS.REPORT_DATE], sessions: Array.isArray(raw) ? raw : [] };
        });

        // 2. Today's live transactions (may not have a report yet).
        // Fetch the last 24h worth from the transactions table and filter to Manila today.
        const cutoffIso = new Date(Date.now() - 86400000).toISOString();
        const { data: recentTxs } = await supabase
          .from(DB_TABLES.TRANSACTIONS)
          .select('*')
          .eq(DB_COLUMNS.BRANCH_ID, branch.id)
          .gte(DB_COLUMNS.TIMESTAMP, cutoffIso)
          .order(DB_COLUMNS.TIMESTAMP, { ascending: false });

        const todaySessions = (recentTxs || []).filter(tx => toManilaDateStr(tx.timestamp) === manilaToday);

        // 3. Flatten all sessions for profile search (dedupe by id)
        const seenIds = new Set<string>();
        const allTxs: Transaction[] = [];
        [...todaySessions, ...rows.flatMap(r => r.sessions)].forEach(tx => {
          if (tx.id && seenIds.has(tx.id)) return;
          if (tx.id) seenIds.add(tx.id);
          allTxs.push(tx);
        });

        if (!cancelled) {
          setReportRows(rows);
          setTodayLiveSessions(todaySessions);
          setAllTransactions(allTxs);
        }
      } catch (err) {
        console.error('[ClientHistorySection] fetch error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAll();
    return () => { cancelled = true; };
  }, [branch.id]);

  const manilaToday = useMemo(() =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()),
  []);

  const allProfiles = useMemo(() => buildProfiles(allTransactions), [allTransactions]);
  const dailySummary = useMemo(
    () => buildDailySummaryFromReports(reportRows, manilaToday, todayLiveSessions),
    [reportRows, manilaToday, todayLiveSessions]
  );

  const isSearching = searchQuery.trim().length > 0;

  const filteredProfiles = useMemo(() => {
    if (!isSearching) return allProfiles;
    const q = searchQuery.toUpperCase().trim();
    return allProfiles.filter(p => p.key.includes(q));
  }, [allProfiles, searchQuery, isSearching]);

  const handleSelectClient = (profile: ClientProfile) => {
    playSound('click');
    setSelectedClient(profile);
  };

  const handleBack = () => {
    playSound('click');
    setSelectedClient(null);
  };

  // ── Profile View ──────────────────────────────────────────────
  if (selectedClient) {
    const client = selectedClient;
    const avgPerVisit = client.visitCount > 0 ? Math.round(client.totalSpend / client.visitCount) : 0;

    return (
      <div className="space-y-5 animate-in fade-in duration-300 pb-10">

        {/* Back button — standalone row */}
        <button
          onClick={handleBack}
          className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-2xl text-xs font-black text-slate-600 uppercase tracking-widest hover:border-slate-300 hover:bg-slate-50 transition-all active:scale-95 shadow-sm w-fit"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Clients
        </button>

        {/* Client identity — separate from back button */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
            <span className="text-lg font-black text-indigo-500 uppercase">
              {client.displayName === 'WALK-IN CLIENT' ? 'W' : client.displayName.charAt(0)}
            </span>
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-none">{client.displayName}</h3>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-1">
              {client.visitCount} session{client.visitCount !== 1 ? 's' : ''} · Client Profile
            </p>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="Total Sessions" value={client.visitCount.toString()} />
          <KpiCard label="Total Spent" value={`₱${client.totalSpend.toLocaleString()}`} accent="text-emerald-600" />
          <KpiCard label="Avg per Visit" value={`₱${avgPerVisit.toLocaleString()}`} />
          <KpiCard
            label="Last Visit"
            value={client.lastVisit
              ? formatManilaDate(new Date(client.lastVisit), { month: 'short', day: 'numeric', year: 'numeric' })
              : '—'}
            sub={client.lastVisit ? formatManilaTime(new Date(client.lastVisit)) : undefined}
          />
        </div>

        {/* Service Breakdown + Preferred Staff */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Top Services</p>
            <ServiceBarChart txs={client.transactions} />
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Preferred Staff</p>
            <PreferredStaff txs={client.transactions} />
          </div>
        </div>

        {/* Session History — cards (mobile-friendly, with notes) */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Session History</p>
          </div>
          <div className="divide-y divide-slate-50">
            {client.transactions.map(tx => {
              const staffLine = [tx.therapistName, tx.bonesetterName].filter(Boolean).join(' & ') || '—';
              return (
                <div key={tx.id} className="px-4 py-4 space-y-2">
                  {/* Top row: service + amount */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0 mt-0.5" />
                      <p className="text-xs font-black text-slate-900 uppercase tracking-tight truncate">{tx.serviceName}</p>
                    </div>
                    <p className="text-xs font-black text-slate-900 tabular-nums shrink-0">
                      ₱{Number(tx.total).toLocaleString()}
                    </p>
                  </div>
                  {/* Bottom row: staff + date/time */}
                  <div className="flex items-center justify-between gap-3 pl-3.5">
                    <p className="text-xs font-bold text-slate-400 uppercase truncate">{staffLine}</p>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-black text-slate-500 uppercase tabular-nums">
                        {formatManilaDate(new Date(tx.timestamp), { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      <p className="text-xs font-bold text-slate-400 tabular-nums">
                        {formatManilaTime(new Date(tx.timestamp))}
                      </p>
                    </div>
                  </div>
                  {/* Note (if any) */}
                  {tx.note?.trim() && (
                    <div className="ml-3.5 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                      <p className="text-xs font-black text-amber-600 uppercase tracking-widest mb-0.5">Note</p>
                      <p className="text-xs font-bold text-amber-800 leading-relaxed">{tx.note.trim()}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Browse View ───────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Header Hero Card ── */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 flex items-center justify-between gap-4 shadow-sm">
        {/* Left: icon + title + subtitle */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide leading-none mb-1">Client Lookup</p>
            <p className="text-[15px] font-bold text-slate-900 leading-none truncate">
              {branch.name}
            </p>
          </div>
        </div>

        {/* Right: KPI tiles */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Unique clients */}
          <div className="bg-slate-50 rounded-xl px-3.5 py-2.5 text-center min-w-[64px]">
            <p className="text-[22px] font-black text-slate-900 tabular-nums leading-none">
              {loading ? '—' : allProfiles.length}
            </p>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-1 leading-none">Clients</p>
          </div>
          {/* Total sessions */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3.5 py-2.5 text-center min-w-[64px]">
            <p className="text-[22px] font-black text-indigo-600 tabular-nums leading-none">
              {loading ? '—' : allTransactions.length}
            </p>
            <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wide mt-1 leading-none">Sessions</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="SEARCH CLIENT BY NAME TO VIEW PROFILE..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full h-12 pl-11 pr-10 bg-white border border-slate-200 rounded-2xl font-bold text-xs uppercase tracking-widest outline-none focus:border-indigo-400 transition-all shadow-sm placeholder:text-slate-300 placeholder:normal-case placeholder:tracking-normal text-slate-700"
        />
        {isSearching && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-300 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {loading ? (
        <BrowseSkeleton />
      ) : isSearching ? (
        /* ── Search results: show client profiles with names ── */
        filteredProfiles.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center">
            <div className="flex flex-col items-center gap-3 opacity-20">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-sm font-semibold uppercase tracking-wide">No clients found</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide px-1">
              {filteredProfiles.length} result{filteredProfiles.length !== 1 ? 's' : ''}
            </p>
            {filteredProfiles.map(profile => (
              <button
                key={profile.key}
                onClick={() => handleSelectClient(profile)}
                className="w-full bg-white rounded-2xl border border-slate-100 px-4 py-3.5 flex items-center gap-3 hover:border-indigo-200 hover:shadow-md transition-all group text-left active:scale-[0.99]"
              >
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 group-hover:bg-indigo-50 transition-colors">
                  <span className="text-xs font-black text-slate-500 group-hover:text-indigo-600 transition-colors uppercase">
                    {profile.displayName === 'WALK-IN CLIENT' ? 'W' : profile.displayName.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-slate-900 uppercase tracking-tight truncate group-hover:text-indigo-700 transition-colors">
                    {profile.displayName}
                  </p>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-tight truncate mt-0.5">
                    {profile.topService}
                  </p>
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  <p className="text-xs font-black text-slate-800 tabular-nums">{profile.visitCount} visits</p>
                  <p className="text-xs font-bold text-emerald-600 tabular-nums">₱{profile.totalSpend.toLocaleString()}</p>
                </div>
                <svg className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        )
      ) : (
        /* ── Default view: activity summary by day (no client names) ── */
        dailySummary.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center shadow-sm">
            <div className="flex flex-col items-center gap-3 opacity-20">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm font-semibold uppercase tracking-wide">No sessions recorded yet</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">

            {/* Privacy notice pill */}
            <div className="flex items-center gap-0">
              <div className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-full px-3 py-1.5">
                <svg className="w-3 h-3 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide leading-none">
                  Client names are hidden — search by name to view a profile
                </p>
              </div>
            </div>

            {/* Daily activity list */}
            {(() => {
              const maxSessions = Math.max(...dailySummary.map(e => e.sessionCount), 1);
              return (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  {/* List header */}
                  <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Daily Activity</p>
                    <div className="flex items-center gap-5">
                      <p className="text-xs font-black text-slate-300 uppercase tracking-widest hidden sm:block">Clients</p>
                      <p className="text-xs font-black text-slate-300 uppercase tracking-widest">Sessions</p>
                    </div>
                  </div>

                  {/* Rows */}
                  <div className="divide-y divide-slate-50">
                    {dailySummary.map(entry => {
                      const label = labelDateKey(entry.dateKey);
                      const isToday = label === 'Today';
                      const isYesterday = label === 'Yesterday';
                      const barPct = maxSessions > 0 ? (entry.sessionCount / maxSessions) * 100 : 0;
                      const hasActivity = entry.sessionCount > 0;

                      // Formatted date for older rows: "Mon, Jun 3"
                      const formattedDate = (() => {
                        const d = new Date(entry.dateKey + 'T12:00:00');
                        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                      })();

                      return (
                        <div
                          key={entry.dateKey}
                          className={`px-5 py-3.5 flex items-center gap-4 ${isToday ? 'bg-indigo-50/60' : ''}`}
                        >
                          {/* Left: dot + label + progress bar */}
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex items-center gap-2.5">
                              {/* Status dot */}
                              {isToday ? (
                                <span className="relative flex shrink-0">
                                  <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-indigo-400 opacity-75" />
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
                                </span>
                              ) : (
                                <div className={`w-2 h-2 rounded-full shrink-0 ${isYesterday ? 'bg-slate-400' : 'bg-slate-200'}`} />
                              )}

                              {/* Date label */}
                              <p className={`text-xs font-black uppercase tracking-tight leading-none ${
                                isToday
                                  ? 'text-indigo-600'
                                  : isYesterday
                                  ? 'text-slate-600'
                                  : 'text-slate-400'
                              }`}>
                                {isToday || isYesterday ? label : formattedDate}
                              </p>
                            </div>

                            {/* Mini progress bar */}
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden ml-4.5">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  !hasActivity
                                    ? 'bg-slate-200'
                                    : isToday
                                    ? 'bg-indigo-400'
                                    : 'bg-emerald-400'
                                }`}
                                style={{ width: hasActivity ? `${barPct}%` : '4%', opacity: hasActivity ? 1 : 0.4 }}
                              />
                            </div>
                          </div>

                          {/* Right: counts */}
                          <div className="flex items-center gap-5 shrink-0">
                            {/* Clients (hidden on mobile) */}
                            <div className="text-right hidden sm:block">
                              <p className={`text-sm font-black tabular-nums leading-none ${
                                isToday ? 'text-indigo-600' : isYesterday ? 'text-slate-600' : 'text-slate-400'
                              }`}>
                                {entry.clientCount}
                              </p>
                              <p className="text-xs font-black text-slate-300 uppercase tracking-widest mt-0.5">
                                client{entry.clientCount !== 1 ? 's' : ''}
                              </p>
                            </div>

                            {/* Sessions */}
                            <div className="text-right">
                              <p className={`text-sm font-black tabular-nums leading-none ${
                                isToday ? 'text-indigo-600' : isYesterday ? 'text-slate-600' : 'text-slate-400'
                              }`}>
                                {entry.sessionCount}
                              </p>
                              <p className="text-xs font-black text-slate-300 uppercase tracking-widest mt-0.5">
                                session{entry.sessionCount !== 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )
      )}
    </div>
  );
};
