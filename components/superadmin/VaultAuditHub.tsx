import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Branch } from '../../types';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';

interface VaultAuditHubProps {
  branches: Branch[];
}

interface VaultAuditRow {
  branchId: string;
  branchName: string;
  storedBalance: number;
  initialBalance: number;
  sumDeposits: number;
  sumWithdrawals: number;
  expectedBalance: number;
  discrepancy: number; // storedBalance - expectedBalance; positive = excess, negative = missing
}

const fmt = (n: number) =>
  n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const VaultAuditHub: React.FC<VaultAuditHubProps> = ({ branches }) => {
  const [vaultAuditLoading, setVaultAuditLoading] = useState(false);
  const [vaultBranchData, setVaultBranchData] = useState<Array<{ branchId: string; balance: number; initialBalance: number }>>([]);
  const [vaultTxSums, setVaultTxSums] = useState<Array<{ branchId: string; type: string; amount: number }>>([]);
  const [vaultAuditLoaded, setVaultAuditLoaded] = useState(false);
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [fixingAll, setFixingAll] = useState(false);
  const [fixedIds, setFixedIds] = useState<Set<string>>(new Set());

  const loadVaultAudit = useCallback(async () => {
    if (!supabase || vaultAuditLoaded) return;
    setVaultAuditLoading(true);
    try {
      // Paginate vault_transactions to bypass the server-side max_rows cap (typically 1000).
      // Fetching all branches in one unordered query would silently truncate large tables.
      const PAGE = 1000;
      const allTx: Array<{ branchId: string; type: string; amount: number }> = [];
      let from = 0;
      while (true) {
        const { data: page, error } = await supabase
          .from(DB_TABLES.VAULT_TRANSACTIONS)
          .select(`${DB_COLUMNS.BRANCH_ID}, ${DB_COLUMNS.TYPE}, ${DB_COLUMNS.AMOUNT}`)
          .order(DB_COLUMNS.ID, { ascending: true })
          .range(from, from + PAGE - 1);
        if (error || !page || page.length === 0) break;
        page.forEach((r: any) => allTx.push({
          branchId: r[DB_COLUMNS.BRANCH_ID],
          type: r[DB_COLUMNS.TYPE],
          amount: Number(r[DB_COLUMNS.AMOUNT] ?? 0),
        }));
        if (page.length < PAGE) break;
        from += PAGE;
      }

      const { data: vaultData } = await supabase
        .from(DB_TABLES.BRANCH_VAULTS)
        .select(`${DB_COLUMNS.BRANCH_ID}, ${DB_COLUMNS.VAULT_BALANCE}, ${DB_COLUMNS.VAULT_INITIAL_BALANCE}`);

      setVaultBranchData(
        (vaultData ?? []).map((r: any) => ({
          branchId: r[DB_COLUMNS.BRANCH_ID],
          balance: Number(r[DB_COLUMNS.VAULT_BALANCE] ?? 0),
          initialBalance: Number(r[DB_COLUMNS.VAULT_INITIAL_BALANCE] ?? 0),
        }))
      );
      setVaultTxSums(allTx);
      setVaultAuditLoaded(true);
    } finally {
      setVaultAuditLoading(false);
    }
  }, [vaultAuditLoaded]);

  useEffect(() => {
    loadVaultAudit();
  }, [loadVaultAudit]);

  const handleFixBalance = useCallback(async (row: VaultAuditRow) => {
    if (!supabase || fixingId) return;
    setFixingId(row.branchId);
    try {
      const { error } = await supabase
        .from(DB_TABLES.BRANCH_VAULTS)
        .update({ [DB_COLUMNS.VAULT_BALANCE]: row.expectedBalance })
        .eq(DB_COLUMNS.BRANCH_ID, row.branchId);
      if (error) throw error;
      // Update local state so the row immediately shows OK
      setVaultBranchData(prev =>
        prev.map(r => r.branchId === row.branchId ? { ...r, balance: row.expectedBalance } : r)
      );
      setFixedIds(prev => new Set(prev).add(row.branchId));
    } catch (err) {
      console.error('Fix balance failed:', err);
    } finally {
      setFixingId(null);
    }
  }, [fixingId]);

  const handleFixAll = useCallback(async (rows: VaultAuditRow[]) => {
    if (!supabase || fixingAll) return;
    setFixingAll(true);
    try {
      // Run sequentially to avoid rate-limiting; these are admin-only so speed isn't critical
      for (const row of rows) {
        const { error } = await supabase
          .from(DB_TABLES.BRANCH_VAULTS)
          .update({ [DB_COLUMNS.VAULT_BALANCE]: row.expectedBalance })
          .eq(DB_COLUMNS.BRANCH_ID, row.branchId);
        if (!error) {
          setVaultBranchData(prev =>
            prev.map(r => r.branchId === row.branchId ? { ...r, balance: row.expectedBalance } : r)
          );
          setFixedIds(prev => new Set(prev).add(row.branchId));
        }
      }
    } finally {
      setFixingAll(false);
    }
  }, [fixingAll]);

  const vaultAuditRows = useMemo<VaultAuditRow[]>(() => {
    if (!vaultAuditLoaded) return [];

    return branches
      .filter(b => b.vaultEnabled)
      .map(b => {
        const vaultRow = vaultBranchData.find(r => r.branchId === b.id);
        const storedBalance = vaultRow?.balance ?? 0;
        const initialBalance = vaultRow?.initialBalance ?? 0;

        const branchTxns = vaultTxSums.filter(t => t.branchId === b.id);
        const sumDeposits = branchTxns
          .filter(t => t.type === 'DEPOSIT' || t.type === 'ADMIN_DEPOSIT')
          .reduce((s, t) => s + t.amount, 0);
        const sumWithdrawals = branchTxns
          .filter(t => t.type === 'WITHDRAWAL' || t.type === 'VAULT_WITHDRAWAL')
          .reduce((s, t) => s + t.amount, 0);

        const expectedBalance = initialBalance + sumDeposits - sumWithdrawals;
        const discrepancy = storedBalance - expectedBalance;

        return {
          branchId: b.id,
          branchName: b.name,
          storedBalance,
          initialBalance,
          sumDeposits,
          sumWithdrawals,
          expectedBalance,
          discrepancy,
        };
      })
      .filter(r => r.storedBalance > 0 || r.sumDeposits > 0)
      .sort((a, b) => Math.abs(b.discrepancy) - Math.abs(a.discrepancy));
  }, [branches, vaultBranchData, vaultTxSums, vaultAuditLoaded]);

  const vaultIssueCount = useMemo(
    () => vaultAuditRows.filter(r => Math.abs(r.discrepancy) >= 1).length,
    [vaultAuditRows]
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-black text-slate-900 tracking-tight uppercase">Vault Balance Audit</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Checks if <code className="bg-slate-100 px-1 rounded text-xs">balance = initial + deposits − withdrawals</code> for every vault-enabled branch.
        </p>
      </div>

      {/* Loading */}
      {vaultAuditLoading && (
        <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-500">
          <svg className="w-3.5 h-3.5 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          Loading vault data…
        </div>
      )}

      {/* Summary alert */}
      {vaultAuditLoaded && !vaultAuditLoading && (
        vaultIssueCount > 0 ? (
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              </svg>
              <span className="text-xs font-semibold text-rose-700">
                {vaultIssueCount} vault{vaultIssueCount !== 1 ? 's' : ''} with balance discrepancies across {vaultAuditRows.length} vault-enabled branches.
              </span>
            </div>
            <button
              onClick={() => handleFixAll(vaultAuditRows.filter(r => Math.abs(r.discrepancy) >= 1))}
              disabled={fixingAll}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wide transition-all"
            >
              {fixingAll ? (
                <>
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                  Fixing…
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                  Fix All {vaultIssueCount}
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
            </svg>
            <span className="text-xs font-semibold text-emerald-700">
              All {vaultAuditRows.length} vault balances check out.
            </span>
          </div>
        )
      )}

      {/* Explanation card */}
      {vaultAuditLoaded && (
        <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs text-slate-500 leading-relaxed space-y-1">
          <p><strong className="text-slate-700">What this checks:</strong> For each vault-enabled branch, the stored balance should equal <code className="bg-white border border-slate-200 px-1 rounded">initial_balance + Σ deposits − Σ withdrawals</code>.</p>
          <p><strong className="text-slate-700">Common cause of drift:</strong> Editing vault settings (changing the Initial Balance field) adjusts the stored balance directly without creating a transaction record. If Initial Balance was changed and later reversed, the balance shifts without any entry in the ledger.</p>
        </div>
      )}

      {/* Desktop table */}
      {vaultAuditLoaded && vaultAuditRows.length > 0 && (
        <div className="hidden lg:block bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-3 py-2.5 font-bold text-slate-500 uppercase tracking-widest">Branch</th>
                  <th className="text-right px-3 py-2.5 font-bold text-slate-500 uppercase tracking-widest">Initial</th>
                  <th className="text-right px-3 py-2.5 font-bold text-slate-500 uppercase tracking-widest">Deposits</th>
                  <th className="text-right px-3 py-2.5 font-bold text-slate-500 uppercase tracking-widest">Withdrawals</th>
                  <th className="text-right px-3 py-2.5 font-bold text-slate-500 uppercase tracking-widest">Expected</th>
                  <th className="text-right px-3 py-2.5 font-bold text-slate-500 uppercase tracking-widest">Stored</th>
                  <th className="text-right px-3 py-2.5 font-bold text-slate-500 uppercase tracking-widest">Gap Δ</th>
                  <th className="text-center px-3 py-2.5 font-bold text-slate-500 uppercase tracking-widest">Status</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {vaultAuditRows.map(row => {
                  const hasIssue = Math.abs(row.discrepancy) >= 1;
                  const isFixing = fixingId === row.branchId;
                  const isFixed = fixedIds.has(row.branchId);
                  return (
                    <tr key={row.branchId} className={hasIssue && !isFixed ? 'bg-rose-50/30' : 'hover:bg-slate-50/50'}>
                      <td className="px-3 py-2.5 font-semibold text-slate-800 max-w-[160px] truncate" title={row.branchName}>{row.branchName}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-500">
                        {row.initialBalance > 0 ? fmt(row.initialBalance) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-emerald-700">+{fmt(row.sumDeposits)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-rose-600">
                        {row.sumWithdrawals > 0 ? `−${fmt(row.sumWithdrawals)}` : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-700 font-semibold">{fmt(row.expectedBalance)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-700 font-semibold">{fmt(row.storedBalance)}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold">
                        {!hasIssue
                          ? <span className="text-emerald-500">—</span>
                          : <span className={row.discrepancy > 0 ? 'text-amber-600' : 'text-rose-600'}>
                              {row.discrepancy > 0 ? '+' : ''}{fmt(row.discrepancy)}
                            </span>
                        }
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="relative group inline-block">
                          {hasIssue && !isFixed ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-lg border text-xs font-bold uppercase tracking-wide ${row.discrepancy > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                              {row.discrepancy > 0 ? 'Excess' : 'Deficit'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg border text-xs font-bold uppercase tracking-wide bg-emerald-50 text-emerald-700 border-emerald-200">OK</span>
                          )}
                          {hasIssue && !isFixed && (
                            <div className="pointer-events-none absolute bottom-full right-0 mb-2 w-64 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                              <div className="bg-slate-900 text-white text-xs leading-relaxed rounded-xl px-3 py-2.5 shadow-xl">
                                <p className="font-black uppercase tracking-widest text-[10px] mb-1.5 opacity-50">{row.discrepancy > 0 ? 'Excess Balance' : 'Balance Deficit'}</p>
                                <p className="font-medium leading-relaxed">
                                  {row.discrepancy > 0
                                    ? `Stored balance is ₱${fmt(Math.abs(row.discrepancy))} more than transaction records justify. Likely caused by an initial balance edit that increased the stored balance without a matching deposit transaction.`
                                    : `Stored balance is ₱${fmt(Math.abs(row.discrepancy))} less than transaction records justify. Possible causes: initial balance edit, direct DB edit, or a failed write that decremented balance but did not create a transaction.`
                                  }
                                </p>
                              </div>
                              <div className="w-2 h-2 bg-slate-900 rotate-45 ml-auto mr-3 -mt-1" />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {hasIssue && !isFixed && (
                          <button
                            onClick={() => handleFixBalance(row)}
                            disabled={isFixing || fixingAll}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest transition-all"
                          >
                            {isFixing ? (
                              <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                            ) : (
                              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                            )}
                            {isFixing ? 'Fixing…' : 'Fix'}
                          </button>
                        )}
                        {isFixed && (
                          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Fixed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mobile cards */}
      {vaultAuditLoaded && vaultAuditRows.length > 0 && (
        <div className="lg:hidden space-y-2">
          {vaultAuditRows.map(row => {
            const hasIssue = Math.abs(row.discrepancy) >= 1;
            const isFixing = fixingId === row.branchId;
            const isFixed = fixedIds.has(row.branchId);
            return (
              <div key={row.branchId} className={`bg-white rounded-2xl border p-4 shadow-sm ${hasIssue && !isFixed ? 'border-rose-100' : 'border-slate-100'}`}>
                <div className="flex justify-between items-start mb-3">
                  <p className="font-bold text-slate-800 text-sm">{row.branchName}</p>
                  <span className={`px-2.5 py-1 rounded-xl border text-xs font-bold uppercase tracking-wide ${hasIssue && !isFixed ? (row.discrepancy > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-700 border-rose-200') : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                    {hasIssue && !isFixed ? (row.discrepancy > 0 ? 'Excess' : 'Deficit') : 'OK'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {row.initialBalance > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Initial</span>
                      <span className="font-mono text-slate-600">₱{fmt(row.initialBalance)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-400">Deposits</span>
                    <span className="font-mono text-emerald-700">+₱{fmt(row.sumDeposits)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Withdrawals</span>
                    <span className="font-mono text-rose-600">{row.sumWithdrawals > 0 ? `−₱${fmt(row.sumWithdrawals)}` : '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Expected</span>
                    <span className="font-mono font-semibold text-slate-700">₱{fmt(row.expectedBalance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Stored</span>
                    <span className="font-mono font-semibold text-slate-700">₱{fmt(row.storedBalance)}</span>
                  </div>
                  {hasIssue && !isFixed && (
                    <div className="flex justify-between items-center col-span-2 pt-2 border-t border-slate-100 mt-1">
                      <div>
                        <span className="text-slate-400">Gap Δ </span>
                        <span className={`font-mono font-black ${row.discrepancy > 0 ? 'text-amber-600' : 'text-rose-600'}`}>
                          {row.discrepancy > 0 ? '+' : ''}{fmt(row.discrepancy)}
                        </span>
                      </div>
                      <button
                        onClick={() => handleFixBalance(row)}
                        disabled={isFixing || fixingAll}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest transition-all"
                      >
                        {isFixing ? (
                          <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                        ) : (
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                        )}
                        {isFixing ? 'Fixing…' : 'Fix Balance'}
                      </button>
                    </div>
                  )}
                  {isFixed && (
                    <div className="col-span-2 pt-2 border-t border-slate-100 mt-1 text-center text-[10px] font-black text-emerald-600 uppercase tracking-widest">Fixed</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {vaultAuditLoaded && vaultAuditRows.length === 0 && (
        <div className="text-center py-12 text-slate-400 text-xs">No vault-enabled branches with activity found.</div>
      )}
    </div>
  );
};
