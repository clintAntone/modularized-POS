import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Branch } from '../../types';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { logAudit } from '../../lib/audit';

interface VaultAuditHubProps {
  branches: Branch[];
  performedBy?: string | null;
}

interface OrphanedAdjustment {
  id: string;
  branchId: string;
  branchName: string;
  periodLabel: string;
  amount: number;
  targetOwner: string;
  createdAt: string;
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

export const VaultAuditHub: React.FC<VaultAuditHubProps> = ({ branches, performedBy }) => {
  const [vaultAuditLoading, setVaultAuditLoading] = useState(false);
  const [vaultBranchData, setVaultBranchData] = useState<Array<{ branchId: string; balance: number; initialBalance: number }>>([]);
  const [vaultTxSums, setVaultTxSums] = useState<Array<{ branchId: string; type: string; amount: number }>>([]);
  const [vaultAuditLoaded, setVaultAuditLoaded] = useState(false);
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [fixingAll, setFixingAll] = useState(false);
  const [fixedIds, setFixedIds] = useState<Set<string>>(new Set());

  // Orphaned vault deposit scan
  const [orphanScanLoading, setOrphanScanLoading] = useState(false);
  const [orphanScanLoaded, setOrphanScanLoaded] = useState(false);
  const [orphanedAdjs, setOrphanedAdjs] = useState<OrphanedAdjustment[]>([]);
  const [repairingOrphanId, setRepairingOrphanId] = useState<string | null>(null);
  const [repairedOrphanIds, setRepairedOrphanIds] = useState<Set<string>>(new Set());

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

  const runOrphanScan = useCallback(async () => {
    setOrphanScanLoading(true);
    setOrphanScanLoaded(false);
    setOrphanedAdjs([]);
    try {
      // Fetch all VAULT DEPOSIT adjustments that have a target_owner
      const { data: adjs, error: adjErr } = await supabase
        .from(DB_TABLES.REMITTANCE_ADJUSTMENTS)
        .select(`id, ${DB_COLUMNS.BRANCH_ID}, ${DB_COLUMNS.PERIOD_LABEL}, ${DB_COLUMNS.AMOUNT}, ${DB_COLUMNS.TARGET_OWNER}, created_at`)
        .eq(DB_COLUMNS.DESCRIPTION, 'VAULT DEPOSIT')
        .not(DB_COLUMNS.TARGET_OWNER, 'is', null);
      if (adjErr) throw adjErr;
      if (!adjs || adjs.length === 0) {
        setOrphanedAdjs([]);
        setOrphanScanLoaded(true);
        return;
      }

      // Fetch vault_transactions by the IDs referenced in target_owner
      const targetIds = adjs.map((a: any) => a[DB_COLUMNS.TARGET_OWNER]).filter(Boolean);
      const { data: txns, error: txErr } = await supabase
        .from(DB_TABLES.VAULT_TRANSACTIONS)
        .select('id')
        .in('id', targetIds);
      if (txErr) throw txErr;

      const existingIds = new Set((txns ?? []).map((t: any) => t.id));

      const orphans: OrphanedAdjustment[] = adjs
        .filter((a: any) => !existingIds.has(a[DB_COLUMNS.TARGET_OWNER]))
        .map((a: any) => {
          const br = branches.find(b => b.id === a[DB_COLUMNS.BRANCH_ID]);
          return {
            id: a.id,
            branchId: a[DB_COLUMNS.BRANCH_ID],
            branchName: br?.name ?? a[DB_COLUMNS.BRANCH_ID],
            periodLabel: a[DB_COLUMNS.PERIOD_LABEL] ?? '',
            amount: Math.abs(Number(a[DB_COLUMNS.AMOUNT] ?? 0)),
            targetOwner: a[DB_COLUMNS.TARGET_OWNER],
            createdAt: a.created_at ?? '',
          };
        })
        .sort((a: OrphanedAdjustment, b: OrphanedAdjustment) => b.createdAt.localeCompare(a.createdAt));

      setOrphanedAdjs(orphans);
      setOrphanScanLoaded(true);
    } catch (err) {
      console.error('Orphan scan failed:', err);
    } finally {
      setOrphanScanLoading(false);
    }
  }, [branches]);

  const handleRepairOrphan = useCallback(async (orphan: OrphanedAdjustment) => {
    if (repairingOrphanId) return;
    setRepairingOrphanId(orphan.id);
    try {
      const { error } = await supabase.rpc('record_vault_remittance_deposit', {
        p_branch_id: orphan.branchId,
        p_amount: orphan.amount,
        p_period_label: orphan.periodLabel,
        p_transaction_id: orphan.targetOwner,
      });
      if (error) throw error;
      setRepairedOrphanIds(prev => new Set(prev).add(orphan.id));
      await logAudit({
        branchId: orphan.branchId,
        activityType: 'REPAIR_VAULT_DEPOSIT',
        entityType: 'vault_transaction',
        entityId: orphan.targetOwner,
        description: `[SuperAdmin scan] Repaired orphaned vault deposit for period "${orphan.periodLabel}" — created missing vault_transaction and updated balance. Amount: ₱${orphan.amount.toLocaleString()}`,
        amount: orphan.amount,
        performerName: performedBy ?? 'SuperAdmin',
      });
    } catch (err) {
      console.error('Repair failed:', err);
    } finally {
      setRepairingOrphanId(null);
    }
  }, [repairingOrphanId, performedBy]);

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
          .filter(t => t.type === 'DEPOSIT' || t.type === 'ADMIN_DEPOSIT' || t.type === 'REMITTANCE_DEPOSIT')
          .reduce((s, t) => s + t.amount, 0);
        const sumWithdrawals = branchTxns
          .filter(t => t.type === 'WITHDRAWAL')
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

      {/* ── ORPHANED VAULT DEPOSIT SCAN ──────────────────────── */}
      <div className="pt-4 border-t border-slate-100">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-black text-slate-900 tracking-tight uppercase">Orphaned Vault Deposits</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Finds manager vault deposits in <code className="bg-slate-100 px-1 rounded text-xs">remittance_adjustments</code> that have no matching record in <code className="bg-slate-100 px-1 rounded text-xs">vault_transactions</code>. These leave the vault balance incorrect.
            </p>
          </div>
          <button
            onClick={runOrphanScan}
            disabled={orphanScanLoading}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wide transition-colors"
          >
            {orphanScanLoading ? (
              <>
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                Scanning…
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/></svg>
                {orphanScanLoaded ? 'Re-scan' : 'Scan Now'}
              </>
            )}
          </button>
        </div>

        {orphanScanLoaded && !orphanScanLoading && (
          orphanedAdjs.length === 0 ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
              <span className="text-xs font-semibold text-emerald-700">No orphaned vault deposits found — all adjustments have matching vault transactions.</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
                </svg>
                <span className="text-xs font-semibold text-amber-800 flex-1">
                  {orphanedAdjs.filter(o => !repairedOrphanIds.has(o.id)).length} orphaned vault deposit{orphanedAdjs.filter(o => !repairedOrphanIds.has(o.id)).length !== 1 ? 's' : ''} found — vault balance{orphanedAdjs.filter(o => !repairedOrphanIds.has(o.id)).length !== 1 ? 's are' : ' is'} understated.
                </span>
              </div>

              {/* Desktop table */}
              <div className="hidden lg:block bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-3 py-2.5 font-bold text-slate-500 uppercase tracking-widest">Branch</th>
                      <th className="text-left px-3 py-2.5 font-bold text-slate-500 uppercase tracking-widest">Period</th>
                      <th className="text-right px-3 py-2.5 font-bold text-slate-500 uppercase tracking-widest">Amount</th>
                      <th className="text-left px-3 py-2.5 font-bold text-slate-500 uppercase tracking-widest">Date Logged</th>
                      <th className="text-center px-3 py-2.5 font-bold text-slate-500 uppercase tracking-widest">Status</th>
                      <th className="px-3 py-2.5"/>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {orphanedAdjs.map(o => {
                      const isFixed = repairedOrphanIds.has(o.id);
                      const isRepairing = repairingOrphanId === o.id;
                      const dateStr = o.createdAt ? o.createdAt.split('T')[0] : '—';
                      return (
                        <tr key={o.id} className={isFixed ? 'hover:bg-slate-50/50' : 'bg-amber-50/20'}>
                          <td className="px-3 py-2.5 font-semibold text-slate-800">{o.branchName}</td>
                          <td className="px-3 py-2.5 text-slate-600">{o.periodLabel || '—'}</td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-teal-700">+{fmt(o.amount)}</td>
                          <td className="px-3 py-2.5 text-slate-400">{dateStr}</td>
                          <td className="px-3 py-2.5 text-center">
                            {isFixed
                              ? <span className="inline-flex items-center px-2 py-0.5 rounded-lg border text-xs font-bold uppercase tracking-wide bg-emerald-50 text-emerald-700 border-emerald-200">Fixed</span>
                              : <span className="inline-flex items-center px-2 py-0.5 rounded-lg border text-xs font-bold uppercase tracking-wide bg-amber-50 text-amber-700 border-amber-200">Orphaned</span>
                            }
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {!isFixed && (
                              <button
                                onClick={() => handleRepairOrphan(o)}
                                disabled={isRepairing || !!repairingOrphanId}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest transition-colors"
                              >
                                {isRepairing
                                  ? <><svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Fixing…</>
                                  : <>
                                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                                      Fix
                                    </>
                                }
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="lg:hidden space-y-2">
                {orphanedAdjs.map(o => {
                  const isFixed = repairedOrphanIds.has(o.id);
                  const isRepairing = repairingOrphanId === o.id;
                  const dateStr = o.createdAt ? o.createdAt.split('T')[0] : '—';
                  return (
                    <div key={o.id} className={`bg-white rounded-2xl border p-4 shadow-sm ${isFixed ? 'border-slate-100' : 'border-amber-200'}`}>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{o.branchName}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{o.periodLabel || '—'} · {dateStr}</p>
                        </div>
                        <span className={`px-2.5 py-1 rounded-xl border text-xs font-bold uppercase tracking-wide ${isFixed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                          {isFixed ? 'Fixed' : 'Orphaned'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <span className="text-sm font-black text-teal-700 tabular-nums">+₱{fmt(o.amount)}</span>
                        {!isFixed && (
                          <button
                            onClick={() => handleRepairOrphan(o)}
                            disabled={isRepairing || !!repairingOrphanId}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest transition-colors"
                          >
                            {isRepairing
                              ? <><svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Fixing…</>
                              : 'Fix Now'
                            }
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
};
