import React, { useState, useMemo } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { Branch, SalesReport } from '../../types';
import { UI_THEME } from '../../constants/ui_designs';
import { playSound } from '../../lib/audio';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BranchCheckboxDropdown } from '../shared/BranchCheckboxDropdown';
import { getManilaTodayStr } from '../../lib/time';

interface ExpensesHubProps {
  branches: Branch[];
  salesReports: SalesReport[];
  realTimeExpenses?: any[];
  hideHeader?: boolean;
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string; dot: string; badge: string }> = {
  all:         { label: 'All',         color: 'bg-slate-100 text-slate-600 border-slate-200',    dot: 'bg-slate-400',   badge: '' },
  OPERATIONAL: { label: 'Operational', color: 'bg-rose-50 text-rose-600 border-rose-100',        dot: 'bg-rose-500',    badge: 'bg-rose-50 text-rose-600 border-rose-100' },
  PROVISION:   { label: 'Provision',   color: 'bg-indigo-50 text-indigo-600 border-indigo-100',  dot: 'bg-indigo-500',  badge: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
  SETTLEMENT:  { label: 'Settlement',  color: 'bg-emerald-50 text-emerald-600 border-emerald-100', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
};


export const ExpensesHub: React.FC<ExpensesHubProps> = ({ branches, salesReports, realTimeExpenses = [], hideHeader = false }) => {
  const [searchTerm, setSearchTerm]       = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [startDate, setStartDate]         = useState('');
  const [endDate, setEndDate]             = useState('');
  const [isExporting, setIsExporting]     = useState(false);
  const [receiptExp, setReceiptExp]       = useState<any | null>(null);

  const setDatePreset = (preset: 'today' | 'week' | 'month') => {
    playSound('click');
    const now = new Date();
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
      [...(report.expenseData || []), ...(report.vaultData || [])].forEach(exp => {
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
  }, [salesReports, branches, realTimeExpenses]);

  const filteredExpenses = useMemo(() => allExpenses.filter(exp => {
    const matchesBranch   = selectedBranchIds.length === 0 || selectedBranchIds.includes(exp.branchId);
    const matchesCategory = categoryFilter === 'all' || exp.category === categoryFilter;
    const matchesSearch   = exp.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                            exp.branchName.toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchesStart    = !startDate || exp.reportDate >= startDate;
    const matchesEnd      = !endDate   || exp.reportDate <= endDate;
    return matchesBranch && matchesCategory && matchesSearch && matchesStart && matchesEnd;
  }), [allExpenses, selectedBranchIds, categoryFilter, debouncedSearch, startDate, endDate]);

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
      doc.text(`Generated: ${new Date().toLocaleString()}`, pw - 14, 20, { align: 'right' });
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
