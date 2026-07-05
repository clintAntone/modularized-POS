import React, { useState, useMemo } from 'react';
import { Branch, Expense, SalesReport } from '../../../types';
import { UI_THEME } from '../../../constants/ui_designs';
import { playSound } from '../../../lib/audio';
import { ChevronLeft, ChevronRight, Download, Search, X, Receipt } from 'lucide-react';

interface ExpenseLedgerSectionProps {
  branch: Branch;
  expenses: Expense[];
  salesReports: SalesReport[];
}

const CATEGORY_CONFIG = {
  OPERATIONAL: { label: 'Operational', bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-500',    border: 'border-rose-100' },
  SETTLEMENT:  { label: 'Settlement',  bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-100' },
} as const;

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

function getManilaToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
}

// Returns a MoM badge element (▲ +X% / ▼ -X% / — if no prev data)
function MomBadge({ current, prev }: { current: number; prev: number }) {
  if (prev === 0 && current === 0) return null;
  if (prev === 0) return <span className="text-xs font-black text-slate-400 uppercase tracking-widest">NEW</span>;

  const pct = Math.round(((current - prev) / prev) * 100);
  if (pct === 0) return <span className="text-xs font-black text-slate-400">—</span>;

  const up = pct > 0;
  return (
    <span className={`text-xs font-black uppercase tracking-widest ${up ? 'text-rose-500' : 'text-emerald-600'}`}>
      {up ? '▲' : '▼'} {up ? '+' : ''}{pct}%
    </span>
  );
}

export const ExpenseLedgerSection: React.FC<ExpenseLedgerSectionProps> = ({ branch, expenses, salesReports }) => {
  const now = new Date();
  const [selectedYear, setSelectedYear]   = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth()); // 0-indexed
  const [searchTerm, setSearchTerm]       = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [previewItem, setPreviewItem]     = useState<any | null>(null);

  const today = getManilaToday();

  // ── Merge live expenses + historical from salesReports ─────
  const allItems = useMemo(() => {
    const historicalItems = salesReports
      .filter(r => r.branchId === branch.id && r.reportDate !== today)
      .flatMap(r => [
        ...(r.expenseData || []).map((e: any) => ({ ...e, _source: 'report' })),
        // Only include SETTLEMENT from vaultData — PROVISION (vault deposits) are not expenses
        ...(r.vaultData   || []).filter((e: any) => e.category === 'SETTLEMENT').map((e: any) => ({ ...e, _source: 'report' })),
      ]);

    const liveItems = expenses
      .filter(e => e.branchId === branch.id && e.category !== 'PROVISION')
      .map(e => ({ ...e, _source: 'live' }));

    const map = new Map<string, any>();
    [...liveItems, ...historicalItems].forEach(item => {
      if (!map.has(item.id)) map.set(item.id, item);
    });

    return Array.from(map.values()).sort((a, b) => {
      const ta = a.timestamp || a.reportDate || '';
      const tb = b.timestamp || b.reportDate || '';
      return tb.localeCompare(ta);
    });
  }, [expenses, salesReports, branch.id, today]);

  // ── Filtered by selected month ─────────────────────────────
  const periodItems = useMemo(() => {
    return allItems.filter(item => {
      const rawDate = item.timestamp || item.reportDate || '';
      const d = new Date(rawDate);
      if (isNaN(d.getTime())) return false;

      const itemYear  = d.getFullYear();
      const itemMonth = d.getMonth();

      if (itemYear !== selectedYear || itemMonth !== selectedMonth) return false;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (searchTerm.trim()) {
        const t = searchTerm.toLowerCase();
        return (item.name || '').toLowerCase().includes(t);
      }
      return true;
    });
  }, [allItems, selectedYear, selectedMonth, categoryFilter, searchTerm]);

  // ── Period totals ──────────────────────────────────────────
  const totals = useMemo(() => {
    const t = { OPERATIONAL: 0, SETTLEMENT: 0, total: 0 };
    periodItems.forEach(item => {
      const amt = Number(item.amount || 0);
      t.total += amt;
      if (item.category in t) (t as any)[item.category] += amt;
    });
    return t;
  }, [periodItems]);

  // ── Previous month items & totals ─────────────────────────
  const prevMonthItems = useMemo(() => {
    const prevMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
    const prevYear  = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
    return allItems.filter(item => {
      const rawDate = item.timestamp || item.reportDate || '';
      const d = new Date(rawDate);
      if (isNaN(d.getTime())) return false;
      return d.getFullYear() === prevYear && d.getMonth() === prevMonth;
    });
  }, [allItems, selectedMonth, selectedYear]);

  const prevTotals = useMemo(() => {
    const t = { OPERATIONAL: 0, SETTLEMENT: 0, total: 0 };
    prevMonthItems.forEach(item => {
      const amt = Number(item.amount || 0);
      t.total += amt;
      if (item.category in t) (t as any)[item.category] += amt;
    });
    return t;
  }, [prevMonthItems]);

  // ── Available years ────────────────────────────────────────
  const availableYears = useMemo(() => {
    const years = new Set<number>([now.getFullYear()]);
    allItems.forEach(item => {
      const d = new Date(item.timestamp || item.reportDate || '');
      if (!isNaN(d.getTime())) years.add(d.getFullYear());
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [allItems]);

  // ── Period navigation ──────────────────────────────────────
  const goBack = () => {
    playSound('click');
    if (selectedMonth === 0) { setSelectedYear(y => y - 1); setSelectedMonth(11); }
    else setSelectedMonth(m => m - 1);
  };
  const goForward = () => {
    playSound('click');
    if (selectedMonth === 11) { setSelectedYear(y => y + 1); setSelectedMonth(0); }
    else setSelectedMonth(m => m + 1);
  };
  const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();

  // ── PDF Export ─────────────────────────────────────────────
  const handleExport = async () => {
    playSound('click');
    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF('l', 'mm', 'a4');
      const pw = doc.internal.pageSize.getWidth();

      doc.setFontSize(18); doc.setTextColor(15, 23, 42);
      doc.text(`${branch.name.replace('BRANCH - ', '')}`, 14, 20);
      doc.setFontSize(10); doc.setTextColor(100, 116, 139);
      doc.text(`Expense Ledger — ${MONTHS[selectedMonth]} ${selectedYear}`, 14, 28);
      doc.setFontSize(8);
      doc.text(`OPERATIONAL: ₱${totals.OPERATIONAL.toLocaleString()}   SETTLEMENT: ₱${totals.SETTLEMENT.toLocaleString()}   TOTAL: ₱${totals.total.toLocaleString()}`, 14, 34);
      doc.setFontSize(7); doc.setTextColor(148, 163, 184);
      doc.text(`Generated: ${new Date().toLocaleString()}`, pw - 14, 20, { align: 'right' });

      autoTable(doc, {
        startY: 42,
        head: [['DATE', 'NAME', 'CATEGORY', 'AMOUNT', 'RECEIPT']],
        body: periodItems.map(item => [
          new Date(item.timestamp || item.reportDate || '').toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }),
          (item.name || '').toUpperCase(),
          CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG]?.label || item.category,
          `₱${Number(item.amount || 0).toLocaleString()}`,
          item.receiptImage ? 'YES' : '—'
        ]),
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42] },
        styles: { fontSize: 7 }
      });

      doc.save(`${branch.name.replace('BRANCH - ', '')}_Ledger_${MONTHS[selectedMonth]}_${selectedYear}.pdf`);
      playSound('success');
    } catch (err) {
      console.error('Export failed', err);
    }
  };

  const periodLabel = `${MONTHS[selectedMonth]} ${selectedYear}`;

  return (
    <div className="w-full mx-auto pb-20 space-y-6">

      {/* ── Header ── */}
      <div className={`bg-white p-6 sm:p-8 ${UI_THEME.radius.card} shadow-sm border border-slate-100`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center text-2xl shadow-xl shrink-0">📒</div>
            <div>
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-tighter leading-none">{branch.name.replace('BRANCH - ', '')}</h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.3em] mt-0.5">Expense Ledger</p>
            </div>
          </div>

          {/* Period Navigation */}
          <div className="flex items-center gap-3">
            <button onClick={goBack} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-black text-slate-900 uppercase tracking-tight min-w-[130px] text-center">{periodLabel}</span>
            <button onClick={goForward} disabled={isCurrentMonth} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all active:scale-95 shadow ml-1">
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {(Object.entries(CATEGORY_CONFIG) as [string, typeof CATEGORY_CONFIG[keyof typeof CATEGORY_CONFIG]][]).map(([cat, cfg]) => (
          <button
            key={cat}
            onClick={() => { setCategoryFilter(f => f === cat ? 'all' : cat); playSound('click'); }}
            className={`p-5 rounded-[24px] border-2 text-left transition-all ${categoryFilter === cat ? `${cfg.bg} ${cfg.border} shadow-md` : 'bg-white border-slate-100 hover:border-slate-200'}`}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${cfg.dot}`}></span>
                <p className={`text-xs font-black uppercase tracking-widest ${categoryFilter === cat ? cfg.text : 'text-slate-400'}`}>{cfg.label}</p>
              </div>
              <MomBadge current={(totals as any)[cat]} prev={(prevTotals as any)[cat]} />
            </div>
            <p className={`text-xl font-black tabular-nums ${categoryFilter === cat ? cfg.text : 'text-slate-900'}`}>
              ₱{(totals as any)[cat].toLocaleString()}
            </p>
          </button>
        ))}
        <div className="p-5 rounded-[24px] border-2 border-slate-200 bg-slate-50 text-left">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Period Total</p>
            <MomBadge current={totals.total} prev={prevTotals.total} />
          </div>
          <p className="text-xl font-black text-slate-900 tabular-nums">₱{totals.total.toLocaleString()}</p>
          <p className="text-xs font-bold text-slate-400 mt-1">{periodItems.length} entries</p>
        </div>
      </div>

      {/* ── Period Highlights ── */}
      {periodItems.length > 0 && (() => {
        // Biggest single expense (unfiltered by category — use raw period data)
        const rawPeriodItems = allItems.filter(item => {
          const rawDate = item.timestamp || item.reportDate || '';
          const d = new Date(rawDate);
          if (isNaN(d.getTime())) return false;
          return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth;
        });

        const biggestItem = rawPeriodItems.reduce<any>((max, item) =>
          Number(item.amount || 0) > Number(max?.amount || 0) ? item : max
        , null);

        // Most frequent expense name
        const nameCounts: Record<string, number> = {};
        rawPeriodItems.forEach(item => {
          const n = (item.name || '').toUpperCase().trim();
          if (n) nameCounts[n] = (nameCounts[n] || 0) + 1;
        });
        const [topName, topCount] = Object.entries(nameCounts).sort((a, b) => b[1] - a[1])[0] || ['', 0];

        // vs last month delta
        const delta = totals.total - prevTotals.total;
        const absDelta = Math.abs(delta);
        const hasLastMonth = prevTotals.total > 0;

        return (
          <div className="bg-white rounded-[24px] border border-slate-100 p-5 space-y-4">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Period Highlights</p>
            <div className="space-y-3">
              {/* Biggest single expense */}
              {biggestItem && (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Biggest Expense</p>
                    <p className="text-xs font-black text-slate-800 uppercase tracking-tight truncate">{biggestItem.name}</p>
                  </div>
                  <p className="text-xs font-black text-rose-600 tabular-nums shrink-0">₱{Number(biggestItem.amount || 0).toLocaleString()}</p>
                </div>
              )}

              {/* Most frequent */}
              {topName && topCount > 1 && (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Most Frequent</p>
                    <p className="text-xs font-black text-slate-800 uppercase tracking-tight truncate">{topName}</p>
                  </div>
                  <p className="text-xs font-black text-amber-600 tabular-nums shrink-0">{topCount}x</p>
                </div>
              )}

              {/* vs Last Month */}
              {hasLastMonth && (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${delta > 0 ? 'bg-rose-400' : 'bg-emerald-400'}`} />
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">vs Last Month</p>
                  </div>
                  <p className={`text-xs font-black tabular-nums shrink-0 ${delta > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {delta > 0 ? '+' : '-'}₱{absDelta.toLocaleString()} {delta > 0 ? 'more' : 'less'}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Search & Filter Bar ── */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="SEARCH NAME, AMOUNT...."
            className="w-full pl-11 pr-10 py-3 bg-white border border-slate-200 rounded-2xl font-bold text-xs uppercase tracking-widest outline-none focus:border-emerald-500 transition-all shadow-sm placeholder:text-slate-300 text-slate-700"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-300 transition-colors">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        {categoryFilter !== 'all' && (
          <button onClick={() => { setCategoryFilter('all'); playSound('click'); }} className="flex items-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest transition-colors">
            <X className="w-3 h-3" /> Clear Filter
          </button>
        )}
      </div>

      {/* ── Ledger ── */}
      {periodItems.length === 0 ? (
        <div className={`bg-white p-16 ${UI_THEME.radius.card} border border-slate-100 text-center space-y-3`}>
          <div className="text-5xl opacity-20">📭</div>
          <p className="text-xs font-black text-slate-300 uppercase tracking-[0.2em]">No expense records for {periodLabel}.</p>
        </div>
      ) : (
        <>
          {/* ── Mobile Cards ── */}
          <div className="sm:hidden space-y-3">
            {periodItems.map((item, i) => {
              const cfg = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG];
              const dateStr = new Date(item.timestamp || item.reportDate || '').toLocaleDateString('en-PH', {
                timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric'
              });
              const amtColor = item.category === 'OPERATIONAL' ? 'text-rose-600' : 'text-emerald-600';
              return (
                <div key={item.id || i} className="bg-white rounded-[20px] border border-slate-100 shadow-sm p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-slate-900 uppercase text-xs tracking-tight leading-snug">{item.name}</p>
                      <p className="text-xs font-bold text-slate-400 mt-0.5">{dateStr}</p>
                    </div>
                    <p className={`font-black tabular-nums text-sm shrink-0 ${amtColor}`}>
                      ₱{Number(item.amount || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    {cfg ? (
                      <span className={`${cfg.bg} ${cfg.text} flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-widest`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}></span>
                        {cfg.label}
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-slate-400 uppercase">{item.category}</span>
                    )}
                    {item.receiptImage ? (
                      <button
                        onClick={() => { playSound('click'); setPreviewItem(item); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-black text-xs uppercase tracking-widest transition-colors"
                      >
                        <Receipt className="w-3 h-3" /> View Proof
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            <div className="bg-slate-50 rounded-[20px] border border-slate-200 p-4 flex items-center justify-between">
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">{periodItems.length} entries</p>
              <p className="font-black text-slate-900 tabular-nums text-sm">₱{totals.total.toLocaleString()}</p>
            </div>
          </div>

          {/* ── Desktop Table ── */}
          <div className={`hidden sm:block bg-white ${UI_THEME.radius.card} border border-slate-100 shadow-sm overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 sm:px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-widest w-28">Date</th>
                    <th className="px-4 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Name</th>
                    <th className="px-4 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Category</th>
                    <th className="px-4 sm:px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Amount</th>
                    <th className="px-4 sm:px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-widest text-center w-16">Proof</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {periodItems.map((item, i) => {
                    const cfg = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG];
                    const dateStr = new Date(item.timestamp || item.reportDate || '').toLocaleDateString('en-PH', {
                      timeZone: 'Asia/Manila', month: 'short', day: 'numeric'
                    });
                    return (
                      <tr key={item.id || i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 sm:px-8 py-4 text-xs font-bold text-slate-400 whitespace-nowrap">{dateStr}</td>
                        <td className="px-4 py-4">
                          <p className="font-black text-slate-900 uppercase text-xs tracking-tight">{item.name}</p>
                        </td>
                        <td className="px-4 py-4">
                          {cfg ? (
                            <span className={`${cfg.bg} ${cfg.text} flex items-center gap-1.5 w-fit px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-widest`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}></span>
                              {cfg.label}
                            </span>
                          ) : (
                            <span className="text-xs font-bold text-slate-400 uppercase">{item.category}</span>
                          )}
                        </td>
                        <td className="px-4 sm:px-8 py-4 text-right">
                          <span className={`font-black tabular-nums text-xs ${
                            item.category === 'OPERATIONAL' ? 'text-rose-600' : 'text-emerald-600'
                          }`}>
                            ₱{Number(item.amount || 0).toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 sm:px-8 py-4 text-center">
                          {item.receiptImage ? (
                            <button
                              onClick={() => { playSound('click'); setPreviewItem(item); }}
                              className="w-7 h-7 rounded-lg bg-indigo-50 hover:bg-indigo-100 flex items-center justify-center text-indigo-500 transition-colors mx-auto"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span className="text-slate-200 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200">
                    <td colSpan={3} className="px-6 sm:px-8 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">
                      {periodItems.length} entries
                    </td>
                    <td className="px-4 sm:px-8 py-4 text-right font-black text-slate-900 tabular-nums text-sm">
                      ₱{totals.total.toLocaleString()}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Receipt Preview Modal ── */}
      {previewItem && (
        <div className={UI_THEME.layout.modalWrapper} onClick={() => setPreviewItem(null)}>
          <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-8 space-y-5 animate-in zoom-in-95 duration-200`} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-lg font-black text-slate-900 uppercase tracking-tight">{previewItem.name}</h4>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                  {CATEGORY_CONFIG[previewItem.category as keyof typeof CATEGORY_CONFIG]?.label || previewItem.category}
                  {' · '}
                  {new Date(previewItem.timestamp || previewItem.reportDate || '').toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <p className={`text-2xl font-black tabular-nums ${previewItem.category === 'OPERATIONAL' ? 'text-rose-600' : previewItem.category === 'SETTLEMENT' ? 'text-emerald-600' : 'text-indigo-600'}`}>
                ₱{Number(previewItem.amount || 0).toLocaleString()}
              </p>
            </div>

            <div className="aspect-square bg-slate-50 rounded-3xl overflow-hidden border border-slate-100 shadow-inner">
              <img src={previewItem.receiptImage} alt="Receipt" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            </div>

            <button onClick={() => setPreviewItem(null)} className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-widest shadow active:scale-95 transition-all">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
