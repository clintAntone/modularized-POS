import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { Branch, SalesReport, VaultTransaction } from '../../types';

interface ReportAuditHubProps {
  branches: Branch[];
  salesReports: SalesReport[];
  vaultTransactions: VaultTransaction[];
}

interface DiagRow {
  id: string;
  branchId: string;
  branchName: string;
  reportDate: string;
  grossSales: number;
  storedSalary: number;
  computedSalary: number;
  salaryDiff: number;
  storedExpenses: number;
  computedExpenses: number;
  expenseDiff: number;
  storedVault: number;
  vaultFromTransactions: number;
  vaultDiff: number;
  storedRoi: number;
  expectedRoi: number;
  roiDiscrepancy: number;
  diagnosis: string;
}

const fmt = (n: number) =>
  n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDiff = (n: number) => {
  if (Math.abs(n) < 0.01) return <span className="text-slate-400">—</span>;
  return (
    <span className={n > 0 ? 'text-amber-600 font-semibold' : 'text-rose-600 font-semibold'}>
      {n > 0 ? '+' : ''}{fmt(n)}
    </span>
  );
};

const DIAG_DESCRIPTIONS: Record<string, string> = {
  'OK':             'Math checks out — gross sales minus salary, expenses, and vault provision equals the stored net ROI.',
  'ROI INFLATED':   'Stored net ROI is higher than computed. The report is keeping more than the numbers justify — possible unreported expense or understated salary.',
  'ROI DEFLATED':   'Stored net ROI is lower than computed. More was deducted than the numbers account for — possible duplicate expense or overstated salary.',
  'VAULT UNLOGGED': 'Vault provision is ₱0 in the report but vault transactions exist linked to it — the deposit was recorded in the vault ledger but not reflected in the report.',
  'BACKFILL':       'Manually backfilled report with no POS session data. A math discrepancy exists but cannot be reliably diagnosed without session records.',
};

const diagColor = (d: string) => {
  if (d === 'OK') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (d === 'ROI INFLATED') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (d === 'ROI DEFLATED') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (d === 'VAULT UNLOGGED') return 'bg-violet-50 text-violet-700 border-violet-200';
  if (d === 'BACKFILL') return 'bg-slate-100 text-slate-500 border-slate-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
};

// ── Branch picker ────────────────────────────────────────────────────────────
const BranchPicker: React.FC<{
  branches: [string, string][];
  value: string;
  onChange: (id: string) => void;
}> = ({ branches, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = branches.filter(([, name]) => name.toLowerCase().includes(query.toLowerCase()));
  const selectedName = value ? (branches.find(([id]) => id === value)?.[1] ?? value) : null;

  return (
    <div className="space-y-1" ref={ref}>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Branch</p>
      <div className="relative">
        <button
          onClick={() => { setOpen(o => !o); setQuery(''); }}
          className={`w-full flex items-center justify-between px-3 py-2 text-xs border rounded-xl outline-none transition-all bg-slate-50 hover:bg-white ${open ? 'border-slate-400 bg-white' : 'border-slate-200'}`}
        >
          <span className={selectedName ? 'text-slate-800 font-semibold truncate' : 'text-slate-400'}>
            {selectedName ?? 'All Branches'}
          </span>
          <svg className={`w-3 h-3 ml-2 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
        </button>

        {open && (
          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
            {/* Search */}
            <div className="p-2 border-b border-slate-100">
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search branch..."
                  className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-slate-400 bg-slate-50"
                />
              </div>
            </div>
            {/* List */}
            <div className="max-h-52 overflow-y-auto">
              <button
                onClick={() => { onChange(''); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs font-semibold transition-colors ${!value ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                All Branches
              </button>
              {filtered.map(([id, name]) => (
                <button
                  key={id}
                  onClick={() => { onChange(id); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors ${value === id ? 'bg-slate-800 text-white font-semibold' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  {name}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-3 py-3 text-xs text-slate-400 text-center">No branches found</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const ReportAuditHub: React.FC<ReportAuditHubProps> = ({
  branches, salesReports, vaultTransactions,
}) => {
  const [branchFilter, setBranchFilter] = useState('');
  const [diagFilter, setDiagFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [sortCol, setSortCol] = useState<'roiDiscrepancy' | 'reportDate' | 'grossSales'>('roiDiscrepancy');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const branchMap = useMemo(() => {
    const m = new Map<string, string>();
    branches.forEach(b => m.set(b.id, b.name));
    return m;
  }, [branches]);

  // Group vault transactions by reportId
  const vaultByReport = useMemo(() => {
    const m = new Map<string, number>();
    vaultTransactions.forEach(vt => {
      if (!vt.reportId) return;
      const prev = m.get(vt.reportId) ?? 0;
      // DEPOSIT / ADMIN_DEPOSIT add; others subtract
      const delta = (vt.type === 'DEPOSIT' || vt.type === 'ADMIN_DEPOSIT') ? vt.amount : -vt.amount;
      m.set(vt.reportId, prev + delta);
    });
    return m;
  }, [vaultTransactions]);

  const rows = useMemo<DiagRow[]>(() => {
    return salesReports.map(r => {
      // --- Reliever names from expense_data ---
      const expenseData: any[] = Array.isArray(r.expenseData) ? r.expenseData : [];
      const relieverNames = new Set<string>();
      expenseData.forEach(e => {
        const name: string = (e.name || e.description || '').toUpperCase().trim();
        if (name.startsWith('RELIEVER PAYOUT:')) {
          relieverNames.add(name.replace('RELIEVER PAYOUT:', '').trim());
        }
      });

      // --- Computed salary (exclude relievers) ---
      const staffBreakdown: any[] = Array.isArray(r.staffBreakdown) ? r.staffBreakdown : [];
      let computedSalary = 0;
      staffBreakdown.forEach(s => {
        const staffName = (s.name || '').toUpperCase().trim();
        if (s.isReliever || relieverNames.has(staffName)) return; // skip reliever
        const att = s.attendance || {};
        // CA is settled in weekly payroll, not deducted from daily total_staff_pay.
        // Read both commission and salary fields — old backfill records used salary instead of commission.
        computedSalary +=
          (Number(s.commission) || 0) +
          (Number(s.salary) || 0) +
          (Number(s.allowance) || 0) +
          (Number(att.otPay ?? att.ot_pay) || 0) -
          (Number(att.lateDeduction ?? att.late_deduction) || 0);
      });

      // --- Computed expenses: OPERATIONAL minus VAULT_WITHDRAWAL (matches useAutoSaveReport: operationalExp - vaultCoveredExp) ---
      let computedExpenses = 0;
      expenseData.forEach(e => {
        if (e.category === 'OPERATIONAL') computedExpenses += Number(e.amount) || 0;
        if (e.category === 'VAULT_WITHDRAWAL') computedExpenses -= Number(e.amount) || 0;
      });
      computedExpenses = Math.max(0, computedExpenses);

      const storedSalary = r.totalStaffPay ?? 0;
      const storedExpenses = r.totalExpenses ?? 0;
      const storedVault = r.totalVaultProvision ?? 0;
      const storedRoi = r.netRoi ?? 0;
      const grossSales = r.grossSales ?? 0;

      const vaultFromTransactions = vaultByReport.get(r.id) ?? 0;

      // Expected ROI uses stored salary/expense/vault — this checks the arithmetic is internally consistent
      const expectedRoi = grossSales - computedSalary - storedExpenses - storedVault;
      const roiDiscrepancy = storedRoi - expectedRoi;

      const isBackfill = r.id.includes('_BACKFILL_') || r.backfilled === true;

      let diagnosis: string;
      if (Math.abs(roiDiscrepancy) < 0.01) {
        diagnosis = 'OK';
      } else if (isBackfill) {
        // Math doesn't add up but it's a backfill — can't reliably diagnose
        diagnosis = 'BACKFILL';
      } else if (storedVault === 0 && vaultFromTransactions > 0.01) {
        diagnosis = 'VAULT UNLOGGED';
      } else if (roiDiscrepancy > 0) {
        diagnosis = 'ROI INFLATED';
      } else {
        diagnosis = 'ROI DEFLATED';
      }

      return {
        id: r.id,
        branchId: r.branchId,
        branchName: branchMap.get(r.branchId) ?? r.branchId,
        reportDate: r.reportDate,
        grossSales,
        storedSalary,
        computedSalary,
        salaryDiff: storedSalary - computedSalary,
        storedExpenses,
        computedExpenses,
        expenseDiff: storedExpenses - computedExpenses,
        storedVault,
        vaultFromTransactions,
        vaultDiff: storedVault - vaultFromTransactions,
        storedRoi,
        expectedRoi,
        roiDiscrepancy,
        diagnosis,
      };
    });
  }, [salesReports, vaultByReport, branchMap]);

  const filtered = useMemo(() => {
    let r = rows;
    if (branchFilter) r = r.filter(x => x.branchId === branchFilter);
    if (diagFilter === 'NOT_OK') r = r.filter(x => x.diagnosis !== 'OK' && x.diagnosis !== 'BACKFILL');
    else if (diagFilter) r = r.filter(x => x.diagnosis === diagFilter);
    if (dateFrom) r = r.filter(x => x.reportDate >= dateFrom);
    if (dateTo) r = r.filter(x => x.reportDate <= dateTo);
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      r = r.filter(x => x.branchName.toLowerCase().includes(q) || x.reportDate.includes(q) || x.id.includes(q));
    }
    r = [...r].sort((a, b) => {
      let diff = 0;
      if (sortCol === 'roiDiscrepancy') diff = Math.abs(a.roiDiscrepancy) - Math.abs(b.roiDiscrepancy);
      else if (sortCol === 'grossSales') diff = a.grossSales - b.grossSales;
      else diff = a.reportDate.localeCompare(b.reportDate);
      return sortDir === 'desc' ? -diff : diff;
    });
    return r;
  }, [rows, branchFilter, diagFilter, dateFrom, dateTo, debouncedSearch, sortCol, sortDir]);

  const issueCount = useMemo(() => rows.filter(r => r.diagnosis !== 'OK' && r.diagnosis !== 'BACKFILL').length, [rows]);


  const diagCounts = useMemo(() => {
    const c: Record<string, number> = {};
    rows.forEach(r => { c[r.diagnosis] = (c[r.diagnosis] ?? 0) + 1; });
    return c;
  }, [rows]);

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: typeof sortCol }) => (
    <span className="ml-0.5 text-slate-400">
      {sortCol === col ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
    </span>
  );

  const uniqueBranches = useMemo(() =>
    [...new Map(rows.map(r => [r.branchId, r.branchName])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1])),
    [rows]
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-lg font-black text-slate-900 tracking-tight uppercase">Report Math Audit</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Checks if <code className="bg-slate-100 px-1 rounded text-xs">net_roi = gross_sales − salary − expenses − vault_provision</code> for every sales report.
        </p>
      </div>

      {/* Issue alert */}
      {issueCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
          <span className="text-xs font-semibold text-amber-700">
            {issueCount} report{issueCount !== 1 ? 's' : ''} with discrepancies across {rows.length} total reports.
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-4">

        {/* Diagnosis pills */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Diagnosis</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setDiagFilter('')}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold uppercase tracking-wide transition-all ${diagFilter === '' ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-400'}`}
            >
              All · {rows.length}
            </button>
            <button
              onClick={() => setDiagFilter(diagFilter === 'NOT_OK' ? '' : 'NOT_OK')}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold uppercase tracking-wide transition-all ${diagFilter === 'NOT_OK' ? 'bg-rose-600 text-white border-rose-600' : 'bg-rose-50 text-rose-600 border-rose-200 hover:border-rose-400'}`}
            >
              Issues Only · {rows.filter(r => r.diagnosis !== 'OK' && r.diagnosis !== 'BACKFILL').length}
            </button>
            {(['OK', 'ROI INFLATED', 'ROI DEFLATED', 'VAULT UNLOGGED', 'BACKFILL'] as const).map(d => (
              <div key={d} className="relative group">
                <button
                  onClick={() => setDiagFilter(diagFilter === d ? '' : d)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold uppercase tracking-wide transition-all ${
                    diagFilter === d
                      ? diagColor(d) + ' ring-2 ring-offset-1 ring-current'
                      : (diagCounts[d] ?? 0) === 0
                        ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-default'
                        : diagColor(d) + ' opacity-70 hover:opacity-100'
                  }`}
                  disabled={(diagCounts[d] ?? 0) === 0}
                >
                  {diagCounts[d] ?? 0} · {d}
                </button>
                {/* Tooltip */}
                <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <div className="bg-slate-900 text-white text-xs leading-relaxed rounded-xl px-3 py-2 shadow-xl">
                    <p className="font-medium uppercase tracking-wide text-xs mb-1 opacity-60">{d}</p>
                    <p>{DIAG_DESCRIPTIONS[d]}</p>
                  </div>
                  <div className="w-2 h-2 bg-slate-900 rotate-45 mx-auto -mt-1" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Search + Branch + Date row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {/* Search */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Search</p>
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Branch / Date / ID"
                className="w-full pl-7 pr-3 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:border-slate-400 bg-slate-50"
              />
            </div>
          </div>

          {/* Branch picker */}
          <BranchPicker
            branches={uniqueBranches}
            value={branchFilter}
            onChange={setBranchFilter}
          />

          {/* Date From */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Date From</p>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:border-slate-400 bg-slate-50"
            />
          </div>

          {/* Date To */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Date To</p>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:border-slate-400 bg-slate-50"
            />
          </div>
        </div>

        {(branchFilter || diagFilter || dateFrom || dateTo || search) && (
          <button
            onClick={() => { setBranchFilter(''); setDiagFilter(''); setDateFrom(''); setDateTo(''); setSearch(''); }}
            className="text-xs font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest"
          >
            Clear all filters
          </button>
        )}
      </div>

      <p className="text-xs text-slate-500">
        Showing <strong>{filtered.length}</strong> of <strong>{rows.length}</strong> reports
      </p>

      {/* Desktop table */}
      <div className="hidden lg:block bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-3 py-2.5 font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">
                  <button onClick={() => toggleSort('reportDate')} className="hover:text-slate-700">
                    Date <SortIcon col="reportDate" />
                  </button>
                </th>
                <th className="text-left px-3 py-2.5 font-bold text-slate-500 uppercase tracking-widest">Branch</th>
                <th className="text-right px-3 py-2.5 font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">
                  <button onClick={() => toggleSort('grossSales')} className="hover:text-slate-700">
                    Gross <SortIcon col="grossSales" />
                  </button>
                </th>
                <th className="text-right px-3 py-2.5 font-bold text-slate-500 uppercase tracking-widest">Salary</th>
                <th className="text-right px-3 py-2.5 font-bold text-slate-500 uppercase tracking-widest">Expenses</th>
                <th className="text-right px-3 py-2.5 font-bold text-slate-500 uppercase tracking-widest">Vault</th>
                <th className="text-right px-3 py-2.5 font-bold text-slate-500 uppercase tracking-widest">Stored ROI</th>
                <th className="text-right px-3 py-2.5 font-bold text-slate-500 uppercase tracking-widest">Expected ROI</th>
                <th className="text-right px-3 py-2.5 font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">
                  <button onClick={() => toggleSort('roiDiscrepancy')} className="hover:text-slate-700">
                    ROI Δ <SortIcon col="roiDiscrepancy" />
                  </button>
                </th>
                <th className="text-center px-3 py-2.5 font-bold text-slate-500 uppercase tracking-widest">Diagnosis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-400 text-xs">No records match the current filters</td>
                </tr>
              )}
              {filtered.map(row => (
                <tr key={row.id} className={`hover:bg-slate-50/50 ${row.diagnosis !== 'OK' ? 'bg-rose-50/20' : ''}`}>
                  <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap">{row.reportDate}</td>
                  <td className="px-3 py-2.5 font-semibold text-slate-800 max-w-[140px] truncate" title={row.branchName}>{row.branchName}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-700">{fmt(row.grossSales)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    <span className="text-slate-700">{fmt(row.storedSalary)}</span>
                    {Math.abs(row.salaryDiff) >= 0.01 && (
                      <div className="text-xs text-slate-400 mt-0.5">
                        computed <span className="font-bold text-slate-600">{fmt(row.computedSalary)}</span>
                        <span className={`ml-1 font-bold ${row.salaryDiff > 0 ? 'text-amber-500' : 'text-rose-500'}`}>
                          ({row.salaryDiff > 0 ? '+' : ''}{fmt(row.salaryDiff)})
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    <span className="text-slate-700">{row.storedExpenses > 0 ? fmt(row.storedExpenses) : <span className="text-slate-300">—</span>}</span>
                    {Math.abs(row.expenseDiff) >= 0.01 && (
                      <div className="text-xs text-slate-400 mt-0.5">
                        computed <span className="font-bold text-slate-600">{fmt(row.computedExpenses)}</span>
                        <span className={`ml-1 font-bold ${row.expenseDiff > 0 ? 'text-amber-500' : 'text-rose-500'}`}>
                          ({row.expenseDiff > 0 ? '+' : ''}{fmt(row.expenseDiff)})
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                    {row.storedVault > 0 ? fmt(row.storedVault) : <span className="text-slate-300">—</span>}
                    {row.vaultFromTransactions > 0 && Math.abs(row.vaultDiff) >= 0.01 && <span className={`ml-1 text-xs font-bold ${row.vaultDiff > 0 ? 'text-amber-500' : 'text-rose-500'}`}>({row.vaultDiff > 0 ? '+' : ''}{fmt(row.vaultDiff)})</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-700">{fmt(row.storedRoi)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-700">{fmt(row.expectedRoi)}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold">
                    {Math.abs(row.roiDiscrepancy) < 0.01
                      ? <span className="text-emerald-500">—</span>
                      : <span className={row.roiDiscrepancy > 0 ? 'text-amber-600' : 'text-rose-600'}>
                          {row.roiDiscrepancy > 0 ? '+' : ''}{fmt(row.roiDiscrepancy)}
                        </span>
                    }
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg border text-xs font-bold uppercase tracking-wide ${diagColor(row.diagnosis)}`}>
                      {row.diagnosis}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-xs">No records match the current filters</div>
        )}
        {filtered.map(row => (
          <div key={row.id} className={`bg-white rounded-2xl border p-4 shadow-sm ${row.diagnosis !== 'OK' ? 'border-rose-100' : 'border-slate-100'}`}>
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="font-bold text-slate-800 text-sm">{row.branchName}</p>
                <p className="font-mono text-xs text-slate-500">{row.reportDate}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-xl border text-xs font-bold uppercase tracking-wide ${diagColor(row.diagnosis)}`}>
                {row.diagnosis}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Gross</span>
                <span className="font-mono font-semibold text-slate-700">₱{fmt(row.grossSales)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">ROI Δ</span>
                <span className="font-mono font-bold">
                  {Math.abs(row.roiDiscrepancy) < 0.01
                    ? <span className="text-emerald-500">OK</span>
                    : <span className={row.roiDiscrepancy > 0 ? 'text-amber-600' : 'text-rose-600'}>
                        {row.roiDiscrepancy > 0 ? '+' : ''}{fmt(row.roiDiscrepancy)}
                      </span>
                  }
                </span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-slate-400">Salary</span>
                <div className="text-right font-mono">
                  <span className="text-slate-700">₱{fmt(row.storedSalary)}</span>
                  {Math.abs(row.salaryDiff) >= 0.01 && (
                    <div className="text-xs text-slate-400">
                      computed <span className="font-bold text-slate-600">{fmt(row.computedSalary)}</span>
                      <span className={`ml-1 font-bold ${row.salaryDiff > 0 ? 'text-amber-500' : 'text-rose-500'}`}>
                        ({row.salaryDiff > 0 ? '+' : ''}{fmt(row.salaryDiff)})
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-slate-400">Expenses</span>
                <div className="text-right font-mono">
                  <span className="text-slate-700">{row.storedExpenses > 0 ? `₱${fmt(row.storedExpenses)}` : '—'}</span>
                  {Math.abs(row.expenseDiff) >= 0.01 && (
                    <div className="text-xs text-slate-400">
                      computed <span className="font-bold text-slate-600">{fmt(row.computedExpenses)}</span>
                      <span className={`ml-1 font-bold ${row.expenseDiff > 0 ? 'text-amber-500' : 'text-rose-500'}`}>
                        ({row.expenseDiff > 0 ? '+' : ''}{fmt(row.expenseDiff)})
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Stored ROI</span>
                <span className="font-mono text-slate-700">₱{fmt(row.storedRoi)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Expected ROI</span>
                <span className="font-mono text-slate-700">₱{fmt(row.expectedRoi)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
