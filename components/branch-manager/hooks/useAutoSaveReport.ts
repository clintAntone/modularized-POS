import { useState, useRef, useEffect, useCallback } from 'react';
import { Branch, Transaction, Expense, Attendance, Employee, BranchVault, VaultTransaction } from '../../../types';
import { supabase } from '../../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';
import { syncRelieverPayouts } from '@/src/services/relieverPayoutService';
import { getTrueISOString } from '../../../lib/time';

interface UseAutoSaveReportParams {
  branch: Branch;
  branchVault?: BranchVault | null;
  todayStr: string;
  todayTxs: Transaction[];
  todayExps: Expense[];
  todayAtt: Attendance[];
  todayVaultTxs: VaultTransaction[];
  staffSummary: Record<string, any>;
  totals: {
    gross: number;
    totalStaffLiability: number;
    operationalExp: number;
    vaultWithdrawal: number;
    provisionExp: number;
    net: number;
    isVaultActive: boolean;
  };
  employees: Employee[];
  hiddenStaffNames: Set<string>;
  todayReportExists: boolean;
  loading?: boolean;
}

export function useAutoSaveReport({
  branch,
  branchVault,
  todayStr,
  todayTxs,
  todayExps,
  todayAtt,
  todayVaultTxs,
  staffSummary,
  totals,
  employees,
  hiddenStaffNames,
  todayReportExists,
  loading,
}: UseAutoSaveReportParams) {
  const [autoSyncStatus, setAutoSyncStatus] = useState<'synced' | 'saving' | 'error'>('synced');
  const [forceSyncTick, setForceSyncTick] = useState(0);
  const prevTotalsRef = useRef<string>('');
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const forceSync = useCallback(() => {
    prevTotalsRef.current = '';
    setForceSyncTick(t => t + 1);
  }, []);

  // Reset prevTotalsRef when tab becomes visible so auto-save re-evaluates with current data
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) prevTotalsRef.current = '';
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);

    if (loading) return;
    if (document.hidden) return;

    // Don't create a new report entry if the branch hasn't been opened yet today.
    // If a report already exists (branch opened earlier and then closed), allow updates.
    if (!branch.isOpen && !todayReportExists) return;

    const currentTotalsStr = JSON.stringify({
      totals,
      todayTxsCount: todayTxs.length,
      todayExpsCount: todayExps.length,
      todayAttCount: todayAtt.length,
      todayVaultTxsCount: todayVaultTxs.length, // must include so deposit triggers re-save
    });
    if (currentTotalsStr === prevTotalsRef.current) {
      setAutoSyncStatus('synced');
      return;
    }

    setAutoSyncStatus('saving');
    syncTimeoutRef.current = setTimeout(async () => {
      try {
        syncRelieverPayouts(branch, todayStr, employees, hiddenStaffNames)
          .catch(err => console.error('[RelieverSync] Background sync failed in dashboard:', err));

        const reportId = `${branch.id}_${todayStr.replace(/-/g, '')}`;

        // Use branch.vaultEnabled + branchVault presence — NOT totals.isVaultActive — so that
        // vault provision is tracked even for branches with vault enabled but no target set.
        // (isVaultActive requires vault.target > 0, which caused provision to be saved as 0
        // for target-less vault branches even when real deposits existed.)
        const isVaultBranch = (branch.vaultEnabled ?? false) && branchVault !== null;
        let savedVaultProvision = 0;
        if (isVaultBranch) {
          // Compute from todayVaultTxs state — avoids DB round-trip timing issues where
          // a freshly committed INSERT may not be visible on a different PgBouncer connection.
          // By the time this fires (3s debounce), todayVaultTxs has been refreshed via
          // realtime subscription or onRefresh(), so the latest deposit is already reflected.
          savedVaultProvision = todayVaultTxs
            .filter(t => t.type === 'DEPOSIT')
            .reduce((s, t) => s + t.amount, 0);
        }

        // Vault-covered expenses (expenses table VAULT_WITHDRAWAL records) — authoritative source
        // for how much of operationalExp was paid by the vault (not charged to ROI).
        const vaultCoveredExp = todayExps
          .filter(e => e.category === 'VAULT_WITHDRAWAL')
          .reduce((s, e) => s + (Number(e.amount) || 0), 0);

        // net_roi computation:
        // - isVaultActive=true (target>0): useTodayData already deducted vault from totals.net — use as-is
        // - isVaultBranch but isVaultActive=false (target=0): totals.net did NOT deduct vault — subtract savedVaultProvision here
        // - non-vault branch: legacy path, subtract provisionExp
        let netRoi: number;
        if (totals.isVaultActive) {
          netRoi = totals.net;
        } else if (isVaultBranch) {
          netRoi = Math.max(0, totals.net - savedVaultProvision);
        } else {
          netRoi = totals.net - totals.provisionExp;
        }

        const basePayload = {
          [DB_COLUMNS.ID]: reportId,
          [DB_COLUMNS.BRANCH_ID]: branch.id,
          [DB_COLUMNS.REPORT_DATE]: todayStr,
          [DB_COLUMNS.SUBMITTED_AT]: getTrueISOString(),
          [DB_COLUMNS.GROSS_SALES]: totals.gross,
          [DB_COLUMNS.TOTAL_STAFF_PAY]: totals.totalStaffLiability,
          [DB_COLUMNS.TOTAL_EXPENSES]: Math.max(0, totals.operationalExp - vaultCoveredExp),
          [DB_COLUMNS.NET_ROI]: netRoi,
          [DB_COLUMNS.SESSION_DATA]: todayTxs.map(t => ({
            ...t,
            settlement: t.paymentMethod?.toLowerCase() || 'cash',
          })),
          [DB_COLUMNS.STAFF_BREAKDOWN]: Object.values(staffSummary).map(({ txs, ...rest }: any) => rest),
          [DB_COLUMNS.EXPENSE_DATA]: [
            // OPERATIONAL expenses (ROI-funded)
            ...todayExps.filter(e => e.category === 'OPERATIONAL'),
            // VAULT_WITHDRAWAL expenses (vault-funded) — kept so the report can
            // compute ROI-only operational = total_expenses + vault_covered separately
            ...todayExps.filter(e => e.category === 'VAULT_WITHDRAWAL'),
          ],
        };

        const payload = isVaultBranch
          ? {
              ...basePayload,
              // Keep total_vault_provision in sync with vault_data so the column never drifts
              [DB_COLUMNS.TOTAL_VAULT_PROVISION]: savedVaultProvision,
            }
          : {
              ...basePayload,
              [DB_COLUMNS.TOTAL_VAULT_PROVISION]: totals.provisionExp,
              [DB_COLUMNS.VAULT_DATA]: todayExps.filter(e => !['OPERATIONAL', 'VAULT_FUND_DEPOSIT', 'VAULT_WITHDRAWAL'].includes(e.category)),
            };

        const { error } = await supabase.from(DB_TABLES.SALES_REPORTS).upsert(payload);
        if (error) throw error;

        prevTotalsRef.current = currentTotalsStr;
        setAutoSyncStatus('synced');
      } catch (err) {
        console.error('[SalesReport] Auto-save failed:', err);
        setAutoSyncStatus('error');
      }
    }, 3000);

    return () => { if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current); };
  }, [totals, todayTxs.length, todayExps.length, todayAtt.length, todayVaultTxs.length, branch.id, todayStr, staffSummary, loading, forceSyncTick]);

  return { autoSyncStatus, forceSync };
}
