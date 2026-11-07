import React, { useState, useMemo, useCallback } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { Branch, SalesReport } from '../../types';
import { useReportVaultData } from '../../hooks/useReportVaultData';
import { UI_THEME } from '../../constants/ui_designs';
import { playSound } from '../../lib/audio';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BranchCheckboxDropdown } from '../shared/BranchCheckboxDropdown';
import { getManilaTodayStr, getTrueDate } from '../../lib/time';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';

interface ExpensesHubProps {
  branches: Branch[];
  salesReports: SalesReport[];
  realTimeExpenses?: any[];
  hideHeader?: boolean;
}

const XMAS_BONUS_NAME = 'XMAS BONUS PROVISION';

const CATEGORY_CONFIG: Record<string, { label: string; color: string; dot: string; badge: string }> = {
  all:         { label: 'All',         color: 'bg-slate-100 text-slate-600 border-slate-200',    dot: 'bg-slate-400',   badge: '' },
  OPERATIONAL: { label: 'Operational', color: 'bg-rose-50 text-rose-600 border-rose-100',        dot: 'bg-rose-500',    badge: 'bg-rose-50 text-rose-600 border-rose-100' },
  PROVISION:   { label: 'Provision',   color: 'bg-indigo-50 text-indigo-600 border-indigo-100',  dot: 'bg-indigo-500',  badge: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
  SETTLEMENT:  { label: 'Settlement',  color: 'bg-emerald-50 text-emerald-600 border-emerald-100', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  XMAS_BONUS:  { label: 'Xmas Bonus',  color: 'bg-amber-50 text-amber-700 border-amber-200',    dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200' },
};


export const ExpensesHub: React.FC<ExpensesHubProps> = ({ branches, salesReports, realTimeExpenses = [], hideHeader = false }) => {
  const { vaultDataMap } = useReportVaultData();
  const [searchTerm, setSearchTerm]       = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [startDate, setStartDate]         = useState('');
  const [endDate, setEndDate]             = useState('');
  const [isExporting, setIsExporting]     = useState(false);
  const [receiptExp, setReceiptExp]       = useState<any | null>(null);
  // Migration modal state
  const [showMigration, setShowMigration] = useState(false);
  const [migStartDate, setMigStartDate]   = useState(() => {
    const d = getTrueDate(); d.setDate(d.getDate() - 14);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d);
  });
  const [migEndDate, setMigEndDate]       = useState(getManilaTodayStr);
  const [migCandidates, setMigCandidates] = useState<any[]>([]);
  const [migSelected, setMigSelected]     = useState<Set<string>>(new Set());
  const [migLoading, setMigLoading]       = useState(false);
  const [isMigrating, setIsMigrating]     = useState(false);
  const [migMsg, setMigMsg]               = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [migBranchId, setMigBranchId]     = useState<string>('');
  const [migSearch, setMigSearch]         = useState('');

  const setDatePreset = (preset: 'today' | 'week' | 'month') => {
    playSound('click');
    const now = getTrueDate();
    const fmt = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d);
    if (preset === 'today') {
      const t = fmt(now); setStartDate(t); setEndDate(t);
    } else if (preset === 'week') {
      const s = new Date(now); s.setDate(now.getDate() - now.getDay());
      setStartDate(fmt(s)); setEndDate(fmt(now));
    } else {
      const s = new Date(now); s.setDate(1);
      setStartDate(fmt(s)); setEndDate(fmt(now));
    }
  };

  const allExpenses = useMemo(() => {
    const expenses: any[] = [];
    salesReports.forEach(report => {
      const branch = branches.find(b => b.id === report.branchId);
      const vaultData = report.vaultData?.length ? report.vaultData : (vaultDataMap[report.id] ?? []);
      [...(report.expenseData || []), ...vaultData].forEach(exp => {
        expenses.push({ ...exp, branchId: report.branchId, branchName: branch?.name || 'UNKNOWN NODE', reportDate: report.reportDate });
      });
    });
    realTimeExpenses.forEach(exp => {
      if (!expenses.some(e => e.id === exp.id)) {
        const branch = branches.find(b => b.id === exp.branchId);
        expenses.push({ ...exp, branchName: branch?.name || 'UNKNOWN NODE', reportDate: exp.timestamp?.split('T')[0] || exp.timestamp?.split(' ')[0] || '' });
      }
    });
    return expenses.sort((a, b) => new Date(b.reportDate).getTime() - new Date(a.reportDate).getTime());
  }, [salesReports, branches, realTimeExpenses, vaultDataMap]);

  const filteredExpenses = useMemo(() => allExpenses.filter(exp => {
    const matchesBranch   = selectedBranchIds.length === 0 || selectedBranchIds.includes(exp.branchId);
    const matchesCategory = categoryFilter === 'all'
      ? true
      : categoryFilter === 'XMAS_BONUS'
        ? exp.name === XMAS_BONUS_NAME
        : exp.category === categoryFilter;
    const matchesSearch   = exp.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                            exp.branchName.toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchesStart    = !startDate || exp.reportDate >= startDate;
    const matchesEnd      = !endDate   || exp.reportDate <= endDate;
    return matchesBranch && matchesCategory && matchesSearch && matchesStart && matchesEnd;
  }), [allExpenses, selectedBranchIds, categoryFilter, debouncedSearch, startDate, endDate]);

  // Per-branch summary for the Xmas Bonus dashboard view
  const xmasBonusByBranch = useMemo(() => {
    if (categoryFilter !== 'XMAS_BONUS') return [];
    const map: Record<string, { branchName: string; total: number; count: number; lastDate: string }> = {};
    filteredExpenses.forEach(exp => {
      const key = exp.branchId || exp.branchName;
      if (!map[key]) map[key] = { branchName: exp.branchName, total: 0, count: 0, lastDate: '' };
      map[key].total += Number(exp.amount) || 0;
      map[key].count += 1;
      if (!map[key].lastDate || exp.reportDate > map[key].lastDate) map[key].lastDate = exp.reportDate;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filteredExpenses, categoryFilter]);

  const totals = useMemo(() => filteredExpenses.reduce((acc, curr) => {
    acc.total += curr.amount;
    acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
    return acc;
  }, { total: 0 } as any), [filteredExpenses]);

  const handlePrint = () => {
    setIsExporting(true);
    playSound('click');
    try {
      const doc = new jsPDF('l', 'mm', 'a4');
      const pw = doc.internal.pageSize.getWidth();
      doc.setFontSize(18); doc.setTextColor(15, 23, 42);
      doc.text('EXPENSES AUDIT LEDGER', 14, 20);
      doc.setFontSize(10); doc.setTextColor(100, 116, 139);
      doc.text(`PERIOD: ${startDate || 'ALL'} TO ${endDate || 'ALL'} | TOTAL: PHP ${totals.total.toLocaleString()}`, 14, 26);
      doc.setFontSize(8); doc.setTextColor(148, 163, 184);
      doc.text(`Generated: ${getTrueDate().toLocaleString()}`, pw - 14, 20, { align: 'right' });
      autoTable(doc, {
        startY: 35,
        head: [['DATE', 'BRANCH', 'ITEM', 'CATEGORY', 'AMOUNT', 'RECEIPT']],
        body: filteredExpenses.map(exp => [
          exp.reportDate, exp.branchName, exp.name.toUpperCase(),
          exp.category, `PHP ${Number(exp.amount).toLocaleString()}`,
          exp.receiptImage ? 'YES' : '—'
        ]),
        theme: 'striped',
        headStyles: { fillColor: [5, 150, 105] },
        styles: { fontSize: 7 }
      });
      doc.save(`EXPENSES_LEDGER_${getManilaTodayStr()}.pdf`);
      playSound('success');
    } catch { alert('Failed to generate PDF.'); }
    finally { setIsExporting(false); }
  };

  const handleRowClick = (exp: any) => {
    if (exp.receiptImage) { playSound('click'); setReceiptExp(exp); }
  };

  const loadMigrationCandidates = useCallback(async () => {
    setMigLoading(true);
    setMigMsg(null);
    const { data } = await supabase
      .from(DB_TABLES.EXPENSES)
      .select(`${DB_COLUMNS.ID}, ${DB_COLUMNS.BRANCH_ID}, ${DB_COLUMNS.TIMESTAMP}, ${DB_COLUMNS.NAME}, ${DB_COLUMNS.AMOUNT}, ${DB_COLUMNS.CATEGORY}`)
      .gte(DB_COLUMNS.TIMESTAMP, `${migStartDate}T00:00:00+08:00`)
      .lte(DB_COLUMNS.TIMESTAMP, `${migEndDate}T23:59:59+08:00`)
      .eq(DB_COLUMNS.CATEGORY, 'OPERATIONAL')
      .neq(DB_COLUMNS.NAME, XMAS_BONUS_NAME)
      .order(DB_COLUMNS.TIMESTAMP, { ascending: false });
    const rows = (data || []).map((r: any) => {
      const branch = branches.find(b => b.id === r[DB_COLUMNS.BRANCH_ID]);
      return { ...r, branchName: branch?.name || r[DB_COLUMNS.BRANCH_ID] };
    });
    setMigCandidates(rows);
    // Auto-select anything that looks like an xmas bonus entry
    const autoSelect = new Set(
      rows.filter((r: any) => /xmas|bonus|christmas/i.test(r[DB_COLUMNS.NAME])).map((r: any) => r[DB_COLUMNS.ID])
    );
    setMigSelected(autoSelect);
    setMigLoading(false);
  }, [migStartDate, migEndDate, branches]);

  const handleMigrate = useCallback(async () => {
    if (migSelected.size === 0) return;
    setIsMigrating(true);
    setMigMsg(null);
    const ids = Array.from(migSelected);
    const { error } = await supabase
      .from(DB_TABLES.EXPENSES)
      .update({ [DB_COLUMNS.NAME]: XMAS_BONUS_NAME })
      .in(DB_COLUMNS.ID, ids);
    if (error) {
      setMigMsg({ type: 'error', text: `Failed: ${error.message}` });
    } else {
      setMigMsg({ type: 'success', text: `${ids.length} expense${ids.length > 1 ? 's' : ''} relabeled to "${XMAS_BONUS_NAME}" successfully.` });
      setMigCandidates(prev => prev.filter(r => !migSelected.has(r[DB_COLUMNS.ID])));
      setMigSelected(new Set());
      playSound('success');
    }
    setIsMigrating(false);
  }, [migSelected]);

  const migVisibleCandidates = useMemo(() => migCandidates.filter(r => {
    const matchBranch = !migBranchId || r[DB_COLUMNS.BRANCH_ID] === migBranchId;
    const matchSearch = !migSearch || r[DB_COLUMNS.NAME].toLowerCase().includes(migSearch.toLowerCase());
    return matchBranch && matchSearch;
  }), [migCandidates, migBranchId, migSearch]);

  // Group filtered expenses by branch, sorted by branch name
  const groupedExpenses = useMemo(() => {
    const groups: Record<string, { branchName: string; total: number; items: any[] }> = {};
    filteredExpenses.forEach(exp => {
      const key = exp.branchId || exp.branchName;
      if (!groups[key]) groups[key] = { branchName: exp.branchName, total: 0, items: [] };
      groups[key].items.push(exp);
      groups[key].total += Number(exp.amount) || 0;
    });
    return Object.values(groups).sort((a, b) => a.branchName.localeCompare(b.branchName));
  }, [filteredExpenses]);

  return (
    <div className="space-y-4 pb-20">

      {/* ── HEADER ─────────────────────────────────────────────── */}
      {!hideHeader && (
        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5 no-print">

          {/* Title row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-slate-900 text-white rounded-xl flex items-center justify-center text-lg shadow-inner">📊</div>
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tighter leading-none">Ledger</h3>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-0.5">Global Expenditure Audit</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {categoryFilter === 'XMAS_BONUS' && (
                <button
                  onClick={() => { setShowMigration(true); loadMigrationCandidates(); playSound('click'); }}
                  className="h-9 rounded-2xl bg-amber-500 text-white px-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide hover:bg-amber-600 transition-all shadow-sm active:scale-95"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                  <span className="hidden sm:inline">Migrate Old</span>
                </button>
              )}
            <button
              onClick={handlePrint}
              disabled={isExporting}
              className="h-9 rounded-2xl bg-emerald-600 text-white px-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide hover:bg-emerald-700 transition-all shadow-sm active:scale-95 disabled:opacity-50"
            >
              {isExporting
                ? <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2-2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              }
              <span className="hidden sm:inline">{isExporting ? 'Exporting...' : 'Export PDF'}</span>
            </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative group">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-emerald-500 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search expense or branch..."
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold uppercase tracking-wider text-slate-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/5 transition-all placeholder:text-slate-300 placeholder:normal-case placeholder:tracking-normal"
            />
          </div>

          {/* Branch filter */}
          {branches.length > 1 && (
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Branch</p>
              <BranchCheckboxDropdown
                branches={branches}
                selectedIds={selectedBranchIds}
                onChange={ids => { playSound('click'); setSelectedBranchIds(ids); }}
              />
            </div>
          )}

          {/* Category + Date range — always visible */}
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Category pills */}
            <div className="flex-1">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Category</p>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => { playSound('click'); setCategoryFilter(key); }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wide border transition-all ${
                      categoryFilter === key
                        ? 'bg-slate-900 text-white border-slate-900 shadow'
                        : `bg-white text-slate-500 border-slate-200 hover:border-slate-400`
                    }`}
                  >
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date range */}
            <div className="sm:w-64">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Date Range</p>
                <div className="flex gap-1">
                  {(['today','week','month'] as const).map(p => (
                    <button key={p} onClick={() => setDatePreset(p)}
                      className="px-2 py-0.5 rounded-lg text-xs font-semibold uppercase tracking-wide bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">
                      {p}
                    </button>
                  ))}
                  {(startDate || endDate) && (
                    <button onClick={() => { setStartDate(''); setEndDate(''); playSound('click'); }}
                      className="px-2 py-0.5 rounded-lg text-xs font-semibold uppercase tracking-wide bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors">
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 transition-all" />
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 transition-all" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── COMPACT KPI STRIP ──────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 no-print">
        {[
          { label: 'Total', value: totals.total, accent: 'text-slate-900', border: 'border-slate-200' },
          { label: 'Operational', value: totals.OPERATIONAL || 0, accent: 'text-rose-600', border: 'border-rose-100' },
          { label: 'Provision', value: totals.PROVISION || 0, accent: 'text-indigo-600', border: 'border-indigo-100' },
          { label: 'Settlement', value: totals.SETTLEMENT || 0, accent: 'text-emerald-600', border: 'border-emerald-100' },
        ].map(({ label, value, accent, border }) => (
          <div key={label} className={`bg-white rounded-2xl border ${border} px-4 py-3 shadow-sm`}>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-base font-black ${accent} tabular-nums leading-tight`}>₱{value.toLocaleString()}</p>
            {totals.total > 0 && label !== 'Total' && (
              <p className="text-xs font-bold text-slate-400 mt-0.5">{Math.round((value / totals.total) * 100)}% of total</p>
            )}
          </div>
        ))}
      </div>

      {/* ── XMAS BONUS PER-BRANCH DASHBOARD ───────────────────── */}
      {categoryFilter === 'XMAS_BONUS' && xmasBonusByBranch.length > 0 && (
        <div className="bg-white rounded-3xl border border-amber-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 bg-amber-50 border-b border-amber-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-amber-500 text-white rounded-xl flex items-center justify-center text-sm font-black shadow-inner">★</div>
              <div>
                <p className="text-xs font-black text-amber-900 uppercase tracking-tight">Xmas Bonus Summary</p>
                <p className="text-xs text-amber-600 font-medium mt-0.5">{xmasBonusByBranch.length} branches · ₱{filteredExpenses.reduce((s, e) => s + Number(e.amount), 0).toLocaleString()} total provision</p>
              </div>
            </div>
          </div>
          <div className="hidden sm:block">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-amber-100 bg-amber-50/40">
                  <th className="px-5 py-2.5 text-xs font-black text-amber-700 uppercase tracking-widest">#</th>
                  <th className="px-5 py-2.5 text-xs font-black text-amber-700 uppercase tracking-widest">Branch</th>
                  <th className="px-5 py-2.5 text-xs font-black text-amber-700 uppercase tracking-widest text-center">Entries</th>
                  <th className="px-5 py-2.5 text-xs font-black text-amber-700 uppercase tracking-widest">Last Entry</th>
                  <th className="px-5 py-2.5 text-xs font-black text-amber-700 uppercase tracking-widest text-right">Total Provision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-50">
                {xmasBonusByBranch.map((row, i) => (
                  <tr key={row.branchName} className="hover:bg-amber-50/30 transition-colors">
                    <td className="px-5 py-3 text-xs font-bold text-slate-400">{i + 1}</td>
                    <td className="px-5 py-3 text-xs font-black text-slate-900 uppercase tracking-tight">{row.branchName}</td>
                    <td className="px-5 py-3 text-xs font-bold text-slate-500 text-center">{row.count}</td>
                    <td className="px-5 py-3 text-xs font-bold text-slate-400">{row.lastDate}</td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-sm font-black text-amber-700 tabular-nums">₱{row.total.toLocaleString()}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-amber-100">
            {xmasBonusByBranch.map((row, i) => (
              <div key={row.branchName} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-5 h-5 rounded-lg bg-amber-100 flex items-center justify-center text-xs font-black text-amber-700 shrink-0">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-900 uppercase tracking-tight truncate">{row.branchName}</p>
                    <p className="text-xs text-slate-400 font-medium">{row.count} {row.count === 1 ? 'entry' : 'entries'} · last {row.lastDate}</p>
                  </div>
                </div>
                <span className="text-sm font-black text-amber-700 tabular-nums shrink-0">₱{row.total.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── LEDGER LIST ────────────────────────────────────────── */}
      <div className={`bg-white ${UI_THEME.radius.card} border border-slate-200 shadow-sm overflow-hidden`}>

        {filteredExpenses.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate-400 font-medium uppercase tracking-wide text-xs">No expenses found matching criteria</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {groupedExpenses.map(group => (
              <div key={group.branchName}>
                {/* Branch group header */}
                <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <p className="text-xs font-black text-slate-700 uppercase tracking-widest">{group.branchName}</p>
                    <span className="text-xs font-bold text-slate-400">({group.items.length} {group.items.length === 1 ? 'item' : 'items'})</span>
                  </div>
                  <p className="text-xs font-black text-slate-900 tabular-nums">₱{group.total.toLocaleString()}</p>
                </div>

                {/* MOBILE: Cards */}
                <div className="sm:hidden divide-y divide-slate-100">
                  {group.items.map((exp, idx) => {
                    const cfg = CATEGORY_CONFIG[exp.category] || CATEGORY_CONFIG.all;
                    const hasReceipt = !!exp.receiptImage;
                    return (
                      <div
                        key={`${exp.id}-${idx}`}
                        onClick={() => handleRowClick(exp)}
                        className={`px-4 py-4 flex flex-col gap-2 ${hasReceipt ? 'cursor-pointer active:bg-slate-50' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-black px-2 py-0.5 rounded-lg border uppercase tracking-wider ${cfg.badge || 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                              {exp.category}
                            </span>
                            <span className="text-xs font-bold text-slate-400">{exp.reportDate}</span>
                          </div>
                          <span className="text-sm font-black text-slate-900 tabular-nums shrink-0">₱{Number(exp.amount).toLocaleString()}</span>
                        </div>
                        <p className="text-sm font-black text-slate-900 uppercase tracking-tight leading-snug">{exp.name}</p>
                        {hasReceipt && (
                          <span className="flex items-center gap-1 text-xs font-black text-emerald-600 uppercase tracking-widest">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            View Receipt
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* DESKTOP: Table rows */}
                <div className="hidden sm:block">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="px-5 py-2.5 text-xs font-black text-slate-300 uppercase tracking-widest w-28">Date</th>
                        <th className="px-5 py-2.5 text-xs font-black text-slate-300 uppercase tracking-widest">Expense Item</th>
                        <th className="px-5 py-2.5 text-xs font-black text-slate-300 uppercase tracking-widest">Category</th>
                        <th className="px-5 py-2.5 text-xs font-black text-slate-300 uppercase tracking-widest text-right">Amount</th>
                        <th className="px-5 py-2.5 text-xs font-black text-slate-300 uppercase tracking-widest text-center w-24">Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {group.items.map((exp, idx) => {
                        const cfg = CATEGORY_CONFIG[exp.category] || CATEGORY_CONFIG.all;
                        const hasReceipt = !!exp.receiptImage;
                        return (
                          <tr
                            key={`${exp.id}-${idx}`}
                            onClick={() => handleRowClick(exp)}
                            className={`transition-colors group ${hasReceipt ? 'cursor-pointer hover:bg-emerald-50/40' : 'hover:bg-slate-50/50'}`}
                          >
                            <td className="px-5 py-3">
                              <p className="text-xs font-bold text-slate-400">{exp.reportDate}</p>
                            </td>
                            <td className="px-5 py-3">
                              <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{exp.name}</p>
                            </td>
                            <td className="px-5 py-3">
                              <span className={`text-xs font-black px-2 py-1 rounded-lg border uppercase tracking-widest ${cfg.badge || 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                {exp.category}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <p className="text-sm font-black text-slate-900 tabular-nums">₱{Number(exp.amount).toLocaleString()}</p>
                            </td>
                            <td className="px-5 py-3 text-center">
                              {hasReceipt ? (
                                <span className="inline-flex items-center gap-1 text-xs font-black text-emerald-600 uppercase tracking-widest group-hover:underline">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                  View
                                </span>
                              ) : (
                                <span className="text-xs text-slate-300">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── MIGRATION MODAL ───────────────────────────────────── */}
      {showMigration && (
        <div className="fixed inset-0 z-[1200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div>
                <p className="text-sm font-black text-slate-900 uppercase tracking-tight">Migrate Expenses → Xmas Bonus</p>
                <p className="text-xs font-medium text-slate-400 mt-0.5">Select expenses to relabel as "{XMAS_BONUS_NAME}"</p>
              </div>
              <button onClick={() => setShowMigration(false)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-slate-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Date range filter */}
            <div className="px-6 py-4 border-b border-slate-100 space-y-3">
              <div className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex gap-2 flex-1">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">From</p>
                    <input type="date" value={migStartDate} onChange={e => setMigStartDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-amber-500 transition-all" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">To</p>
                    <input type="date" value={migEndDate} onChange={e => setMigEndDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-amber-500 transition-all" />
                  </div>
                </div>
                <button
                  onClick={loadMigrationCandidates}
                  disabled={migLoading}
                  className="h-9 px-4 rounded-2xl bg-slate-900 text-white text-xs font-semibold uppercase tracking-wide hover:bg-slate-700 transition-all disabled:opacity-50 flex items-center gap-2 shrink-0"
                >
                  {migLoading ? <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : null}
                  {migLoading ? 'Loading…' : 'Search'}
                </button>
              </div>
              {migCandidates.length > 0 && (
                <div className="flex gap-2">
                  <select
                    value={migBranchId}
                    onChange={e => setMigBranchId(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-amber-500 transition-all"
                  >
                    <option value="">All branches</option>
                    {branches
                      .filter(b => migCandidates.some(r => r[DB_COLUMNS.BRANCH_ID] === b.id))
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map(b => <option key={b.id} value={b.id}>{b.name}</option>)
                    }
                  </select>
                  <input
                    type="text"
                    value={migSearch}
                    onChange={e => setMigSearch(e.target.value)}
                    placeholder="Search expense name…"
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-amber-500 transition-all placeholder:font-normal placeholder:text-slate-300"
                  />
                </div>
              )}
            </div>

            {/* Candidates list */}
            <div className="flex-1 overflow-y-auto">
              {migLoading ? (
                <div className="py-16 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-amber-200 border-t-amber-500 rounded-full animate-spin" />
                </div>
              ) : migVisibleCandidates.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                    {migCandidates.length === 0 ? 'No OPERATIONAL expenses found in this range' : 'No results match the current filter'}
                  </p>
                  <p className="text-xs text-slate-300 mt-1">
                    {migCandidates.length === 0 ? 'Adjust the date range and search again' : 'Try a different branch or search term'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {/* Select all visible */}
                  <div className="flex items-center gap-3 px-6 py-3 bg-slate-50">
                    <input type="checkbox"
                      checked={migVisibleCandidates.length > 0 && migVisibleCandidates.every(r => migSelected.has(r[DB_COLUMNS.ID]))}
                      onChange={e => setMigSelected(prev => {
                        const s = new Set(prev);
                        migVisibleCandidates.forEach(r => e.target.checked ? s.add(r[DB_COLUMNS.ID]) : s.delete(r[DB_COLUMNS.ID]));
                        return s;
                      })}
                      className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Select visible ({migVisibleCandidates.length}) · {migSelected.size} total selected
                    </span>
                  </div>
                  {migVisibleCandidates.map((r: any) => {
                    const dateStr = (r[DB_COLUMNS.TIMESTAMP] || '').split('T')[0];
                    return (
                      <label key={r[DB_COLUMNS.ID]} className="flex items-center gap-3 px-6 py-3 hover:bg-amber-50/40 cursor-pointer transition-colors">
                        <input type="checkbox"
                          checked={migSelected.has(r[DB_COLUMNS.ID])}
                          onChange={e => setMigSelected(prev => { const s = new Set(prev); e.target.checked ? s.add(r[DB_COLUMNS.ID]) : s.delete(r[DB_COLUMNS.ID]); return s; })}
                          className="w-4 h-4 rounded accent-amber-500 cursor-pointer shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <p className="text-xs font-black text-slate-900 uppercase tracking-tight truncate">{r[DB_COLUMNS.NAME]}</p>
                            <span className="text-xs font-bold text-slate-400 shrink-0">{r.branchName}</span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">{dateStr}</p>
                        </div>
                        <span className="text-sm font-black text-slate-900 tabular-nums shrink-0">₱{Number(r[DB_COLUMNS.AMOUNT]).toLocaleString()}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 space-y-3">
              {migMsg && (
                <p className={`text-xs font-bold text-center ${migMsg.type === 'success' ? 'text-emerald-600' : 'text-rose-500'}`}>{migMsg.text}</p>
              )}
              <div className="flex gap-3">
                <button onClick={() => setShowMigration(false)} className="flex-1 py-3 text-slate-500 font-bold text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-100 transition-all">
                  Close
                </button>
                <button
                  onClick={handleMigrate}
                  disabled={migSelected.size === 0 || isMigrating}
                  className="flex-1 py-3 bg-amber-500 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-amber-600 transition-all disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-2"
                >
                  {isMigrating ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
                  {isMigrating ? 'Saving…' : `Relabel ${migSelected.size > 0 ? migSelected.size : ''} Selected`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── RECEIPT MODAL ─────────────────────────────────────── */}
      {receiptExp && (
        <div
          className="fixed inset-0 z-[1100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setReceiptExp(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{receiptExp.name}</p>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-0.5">
                  {receiptExp.branchName} · {receiptExp.reportDate} · ₱{Number(receiptExp.amount).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => setReceiptExp(null)}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-slate-500"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Receipt image */}
            <div className="p-4 bg-slate-50">
              <img
                src={receiptExp.receiptImage}
                alt="Receipt"
                className="w-full rounded-2xl object-contain max-h-[60vh] bg-white shadow-inner"
                onError={e => { (e.target as HTMLImageElement).src = ''; }}
              />
            </div>

            {/* Open full size */}
            <div className="px-5 py-4 border-t border-slate-100">
              <a
                href={receiptExp.receiptImage}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl bg-slate-900 text-white text-xs font-semibold uppercase tracking-wide hover:bg-slate-700 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                Open Full Size
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
