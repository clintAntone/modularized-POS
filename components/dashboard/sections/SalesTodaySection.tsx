import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Branch, Transaction, Expense, Attendance, Employee, BranchVault, SalesReport, VaultTransaction } from '../../../types';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';
import { UI_THEME } from '../../../constants/ui_designs';
import { supabase } from '../../../lib/supabase';
import { playSound } from '../../../lib/audio';
import { deleteFileByUrl } from '../../../lib/storage';
import { getEmployeeAllowance, getEmployeeRole } from '../../../lib/payroll';
import { getTrueDate, toManilaDateStr } from '../../../lib/time';
import { logAudit } from '../../../lib/audit';

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import { syncRelieverPayouts } from '../../../src/services/relieverPayoutService';

// Modular Sub-components
import { SessionLogs } from './sales-today/SessionLogs';
import { StaffPerformance } from './sales-today/StaffPerformance';
import { VaultExpenses } from './sales-today/VaultExpenses';
import { SalesKPIStrip } from './sales-today/SalesKPIStrip';
import { QuickExpenseModal } from './sales-today/QuickExpenseModal';
import { ExpenseDetailModal } from './sales-today/ExpenseDetailModal';

interface SalesTodayProps {
  user?: any;
  branch: Branch;
  transactions: Transaction[];
  expenses: Expense[];
  attendance: Attendance[];
  employees: Employee[];
  salesReports?: SalesReport[];
  setActiveTab?: (id: any) => void;
  autoSyncStatus?: 'synced' | 'saving' | 'error';
  connStatus?: 'connecting' | 'connected' | 'error' | 'offline';
  pendingSyncCount?: number;
  todayStr?: string;
  hiddenStaffNames: Set<string>;
  setHiddenStaffNames: React.Dispatch<React.SetStateAction<Set<string>>>;
  isClosedMode?: boolean;
  onRefresh?: () => void;
  loading?: boolean;
  branchVault?: BranchVault | null;
  totalBillsAmount?: number;
  vaultTransactions?: VaultTransaction[];
  onForceSync?: () => void;
}

interface Toast {
  message: string;
  type: 'success' | 'error';
}

import { KPISkeleton, CardSkeleton } from '../../ui/Skeleton';

export const SalesTodaySection: React.FC<SalesTodayProps> = ({
  user,
  branch, transactions, expenses, attendance, employees, salesReports = [],
  setActiveTab,
  autoSyncStatus = 'synced', connStatus = 'connected', pendingSyncCount = 0,
  todayStr: propTodayStr,
  hiddenStaffNames, setHiddenStaffNames,
  isClosedMode = false, onRefresh, loading = false, branchVault = null, totalBillsAmount = 0,
  vaultTransactions = [], onForceSync,
}) => {
  const [viewingExpense, setViewingExpense] = useState<Expense | null>(null);
  const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
  const [openExpenseModalOnDeposit, setOpenExpenseModalOnDeposit] = useState(false);
  const [openExpenseModalOnLegacyDeposit, setOpenExpenseModalOnLegacyDeposit] = useState(false);
  const [showVaultDepositPrompt, setShowVaultDepositPrompt] = useState(false);
  const [vaultDepositInput, setVaultDepositInput] = useState('');
  const [vaultDepositRemitAll, setVaultDepositRemitAll] = useState(true);
  const [vaultDepositTargetDate, setVaultDepositTargetDate] = useState<string>('');
  const [isSubmittingVaultDeposit, setIsSubmittingVaultDeposit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [vaultDepositToDelete, setVaultDepositToDelete] = useState<{ id: string; amount: number; timestamp?: string } | null>(null);
  const [isDeletingVaultDeposit, setIsDeletingVaultDeposit] = useState(false);
  const [vaultWithdrawalToDelete, setVaultWithdrawalToDelete] = useState<{ id: string; amount: number; expenseName: string; source: 'vault_transactions' | 'expenses' } | null>(null);
  const [isDeletingVaultWithdrawal, setIsDeletingVaultWithdrawal] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showPDFConfirm, setShowPDFConfirm] = useState(false);

  // Today's vault deposits — derived from salesReports prop so it stays in sync with refreshes
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  };

  const todayStr = useMemo(() => {
    if (propTodayStr) return propTodayStr;
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(getTrueDate());
  }, [propTodayStr]);

  const yesterdayStr = useMemo(() => {
    const d = new Date(todayStr + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, [todayStr]);

  // Previous-day report — available for late vault deposits when the manager's shift crossed midnight
  const yesterdayReport = useMemo(() =>
    salesReports.find(r => r.branchId === branch.id && r.reportDate === yesterdayStr) ?? null,
  [salesReports, branch.id, yesterdayStr]);

  // Tracks each employee's branch assignment — changes when someone becomes a reliever
  const employeeBranchFingerprint = useMemo(
    () => employees.map(e => `${e.id}:${e.branchId}`).sort().join('|'),
    [employees]
  );

  // Sync reliever payouts on load and whenever transactions/attendance/employees change
  useEffect(() => {
    if (employees.length === 0) return; // wait for employees to load before syncing
    syncRelieverPayouts(branch, todayStr, employees, hiddenStaffNames);
  }, [branch.id, todayStr, transactions.length, attendance.length, employeeBranchFingerprint]);

  const todayVaultData = useMemo(() =>
    vaultTransactions.filter(t =>
      t.branchId === branch.id &&
      t.type === 'DEPOSIT' &&
      toManilaDateStr(t.timestamp) === todayStr
    ).map(t => ({ id: t.id, name: t.name ?? 'VAULT DEPOSIT', amount: t.amount, category: 'VAULT_DEPOSIT', timestamp: t.timestamp })),
  [vaultTransactions, branch.id, todayStr]);

  const txs = useMemo(() => transactions.filter(t => t.branchId === branch.id && toManilaDateStr(t.timestamp) === todayStr).sort((a,b) => (b.timestamp || '').localeCompare(a.timestamp || '')), [transactions, branch.id, todayStr]);
  const exps = useMemo(() => expenses.filter(e => e.branchId === branch.id && toManilaDateStr(e.timestamp) === todayStr).sort((a,b) => (b.timestamp || '').localeCompare(a.timestamp || '')), [expenses, branch.id, todayStr]);
  const dailyAttendance = useMemo(() => attendance.filter(a => a.branchId === branch.id && a.date === todayStr), [attendance, branch.id, todayStr]);

  const activeRoster = useMemo(() => {
    return employees.filter(e => {
      const isHomeBranch = e.branchId === branch.id;
      const isDesignatedManager = branch.manager?.toUpperCase() === e.name?.toUpperCase();
      const isTempManager = branch.tempManager?.toUpperCase() === e.name?.toUpperCase();
      const isAuthorizedByAllowance = e.branchAllowances && typeof e.branchAllowances === 'object' && branch.id in (e.branchAllowances as any);
      
      return isHomeBranch || isDesignatedManager || isTempManager || isAuthorizedByAllowance;
    });
  }, [employees, branch.id, branch.manager, branch.tempManager]);

  const metrics = useMemo(() => {
    const gross = txs.reduce((s, t) => s + (Number(t.total) || 0), 0);
    const cashTotal = txs.filter(t => t.paymentMethod === 'CASH' || !t.paymentMethod).reduce((s, t) => s + (Number(t.total) || 0), 0);
    const gcashTotal = txs.filter(t => t.paymentMethod === 'GCASH').reduce((s, t) => s + (Number(t.total) || 0), 0);
    const baseStaffPay = txs.reduce((s, t) => s + (Number(t.primaryCommission) || 0) + (Number(t.secondaryCommission) || 0), 0);

    const summary: Record<string, any> = {};

    // 1. Initialize with active roster staff
    activeRoster.forEach(emp => {
      const n = (emp.name || '').toUpperCase();
      const attRecord = dailyAttendance.find(a => a.employeeId === emp.id);

      if (attRecord || txs.some(t => t.therapistName?.trim().toUpperCase() === n || t.bonesetterName?.trim().toUpperCase() === n)) {
        if (!hiddenStaffNames.has(n)) {
          const role = getEmployeeRole(emp, branch.id);
          const cfg = emp.branchAllowances?.[branch.id];
          const excluded = typeof cfg === 'object' && cfg !== null ? (cfg.excludeFromReliever || false) : false;
          const isMainManager = branch.manager?.toUpperCase() === (emp.name || '').toUpperCase();
          const isTempManager = branch.tempManager?.toUpperCase() === (emp.name || '').toUpperCase();
          const isReliever = emp.branchId !== branch.id && !isMainManager && !isTempManager && !excluded;

          summary[n] = {
            employeeId: emp.id,
            name: emp.name,
            profile: emp.profile,
            count: 0,
            commission: 0,
            baseAllowance: getEmployeeAllowance(emp, branch.id),
            allowance: getEmployeeAllowance(emp, branch.id),
            role: role,
            isReliever,
            isPaidDaily: attRecord?.isPaidDaily || attRecord?.is_paid_daily || false,
            settledUnits: Number(attRecord?.settledUnits || attRecord?.settled_units || 0),
            attendance: attRecord || null,
            txs: []
          };
        }
      }
    });

    // 2. Add relievers found in transactions or attendance who are NOT in activeRoster
    const allActiveEmpIds = new Set([
      ...dailyAttendance.map(a => a.employeeId),
      ...txs.flatMap(t => [t.therapistId, t.bonesetterId]).filter(Boolean)
    ]);

    allActiveEmpIds.forEach(empId => {
      const emp = employees.find(e => e.id === empId);
      if (emp) {
        const n = (emp.name || '').toUpperCase();
        if (!summary[n] && !hiddenStaffNames.has(n)) {
          const role = getEmployeeRole(emp, branch.id);
          const crossCfg = emp.branchAllowances?.[branch.id];
          const crossExcluded = typeof crossCfg === 'object' && crossCfg !== null ? (crossCfg.excludeFromReliever || false) : false;
          const isMainManager = branch.manager?.toUpperCase() === (emp.name || '').toUpperCase();
          const isTempManager = branch.tempManager?.toUpperCase() === (emp.name || '').toUpperCase();
          const isReliever = emp.branchId !== branch.id && !isMainManager && !isTempManager && !crossExcluded;
          const attRecord = dailyAttendance.find(a => a.employeeId === empId);

          summary[n] = {
            employeeId: emp.id,
            name: emp.name,
            profile: emp.profile,
            count: 0,
            commission: 0,
            baseAllowance: getEmployeeAllowance(emp, branch.id),
            allowance: getEmployeeAllowance(emp, branch.id),
            role: role,
            isReliever,
            isPaidDaily: attRecord?.isPaidDaily || attRecord?.is_paid_daily || false,
            settledUnits: Number(attRecord?.settledUnits || attRecord?.settled_units || 0),
            attendance: attRecord || null,
            txs: []
          };
        }
      }
    });

    // 3. Populate counts and commissions
    txs.forEach(t => {
      [
        { name: t.therapistName, comm: t.primaryCommission },
        { name: t.bonesetterName, comm: t.secondaryCommission }
      ].forEach((staff, idx) => {
        if (!staff.name) return;
        const n = staff.name.trim().toUpperCase();
        if (summary[n]) {
          if (idx === 0 || n !== t.therapistName?.trim().toUpperCase()) summary[n].count += 1;
          summary[n].commission += idx === 0 ? (Number(t.primaryCommission) || 0) : (Number(t.secondaryCommission) || 0);
          summary[n].txs = [...(summary[n].txs || []), t];
        }
      });
    });

    // Apply half-day allowance adjustment
    Object.values(summary).forEach((item: any) => {
      const att = item.attendance;
      if (att) {
        let finalAllowance = item.baseAllowance;
        if (att.isHalfDay === true || att.is_half_day === true) finalAllowance /= 2;
        item.allowance = finalAllowance;
      }
    });

    const totalOperationalExp = exps.filter(e => e.category === 'OPERATIONAL').reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalVaultCoveredOps = exps.filter(e => e.category === 'VAULT_WITHDRAWAL').reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalVaultProvision = todayVaultData.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    // Vault withdrawals now live in vault_transactions (type WITHDRAWAL)
    const todayWithdrawals = vaultTransactions.filter(t =>
      t.branchId === branch.id && t.type === 'WITHDRAWAL' && toManilaDateStr(t.timestamp) === todayStr
    );
    const totalVaultWithdrawalExp = todayWithdrawals.reduce((s, t) => s + t.amount, 0);
    const totalProvisionExp = exps.filter(e => e.category === 'PROVISION').reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const regularAttendance = dailyAttendance.filter(a => {
      const emp = employees.find(e => e.id === a.employeeId);
      return emp && emp.branchId === branch.id;
    });

    const regularLateDeductions = regularAttendance.reduce((s, a) => s + (Number(a.lateDeduction) || 0), 0);
    const regularOtAdditions = regularAttendance.reduce((s, a) => s + (Number(a.otPay) || 0), 0);
    const regularTotalCashAdvances = regularAttendance.reduce((s, a) => s + (Number(a.cashAdvance) || 0), 0);

    const totalAllowances = Object.values(summary).filter((item: any) => !item.isReliever).reduce((sum, item: any) => sum + item.allowance, 0);
    
    // Recalculate baseStaffPay for non-relievers only
    const regularStaffPay = txs.reduce((s, t) => {
      const therapist = t.therapistName?.trim().toUpperCase();
      const bonesetter = t.bonesetterName?.trim().toUpperCase();
      const isTherapistReliever = therapist && summary[therapist]?.isReliever;
      const isBonesetterReliever = bonesetter && summary[bonesetter]?.isReliever;
      
      let pay = 0;
      if (therapist && !isTherapistReliever) pay += (Number(t.primaryCommission) || 0);
      if (bonesetter && !isBonesetterReliever) pay += (Number(t.secondaryCommission) || 0);
      return s + pay;
    }, 0);

    const totalStaffLiability = regularStaffPay + regularOtAdditions + totalAllowances - regularLateDeductions;
    const finalStaffPayTotal = totalStaffLiability - regularTotalCashAdvances;
    const net = gross - totalOperationalExp + totalVaultCoveredOps - totalProvisionExp - totalVaultProvision - totalStaffLiability;

    return {
      gross, cashTotal, gcashTotal,
      operationalExp: totalOperationalExp,
      vaultProvision: totalVaultProvision,
      vaultWithdrawal: totalVaultWithdrawalExp,
      vaultCoveredExp: totalVaultCoveredOps,
      provisionExp: totalProvisionExp,
      totalStaffLiability, finalStaffPayTotal,
      lateDeductions: regularLateDeductions, otAdditions: regularOtAdditions,
      totalCashAdvances: regularTotalCashAdvances, totalAllowances, net, staffSummary: summary
    };
  }, [txs, dailyAttendance, exps, activeRoster, hiddenStaffNames, branch.id, todayVaultData, vaultTransactions, todayStr]);

  // Auto-sync to sales_reports when data finishes loading and vault deposit is present.
  // This ensures the DB stays consistent without requiring the user to click Sync manually.
  const hasSyncedOnLoad = useRef(false);
  useEffect(() => {
    if (loading || hasSyncedOnLoad.current) return;
    if (metrics.vaultProvision > 0 && onForceSync) {
      hasSyncedOnLoad.current = true;
      onForceSync();
    }
  }, [loading, metrics.vaultProvision]);

  const handleHideStaff = async (name: string) => {
    playSound('warning');
    const upperName = name.toUpperCase();
    const newHidden = new Set<string>(hiddenStaffNames);
    newHidden.add(upperName);
    setHiddenStaffNames(newHidden);
    
    // If it's a reliever, sync their payout (which will now be deleted because they are hidden)
    const emp = employees.find(e => e.name?.toUpperCase() === upperName);
    if (emp && emp.branchId !== branch.id) {
      await syncRelieverPayouts(branch, todayStr, employees, newHidden);
      onRefresh?.();
    }
  };

  const handleRestoreStaff = async (name: string) => {
    playSound('success');
    const upperName = name.toUpperCase();
    const newHidden = new Set<string>(hiddenStaffNames);
    newHidden.delete(upperName);
    setHiddenStaffNames(newHidden);

    // If it's a reliever, restore their payout expense
    const emp = employees.find(e => e.name?.toUpperCase() === upperName);
    if (emp && emp.branchId !== branch.id) {
      await syncRelieverPayouts(branch, todayStr, employees, newHidden);
    }
  };

  const handleDeleteExpenseTrigger = (id: string) => {
    const target = exps.find(e => e.id === id);
    if (target) {
      playSound('warning');
      setExpenseToDelete(target);
    }
  };

  const handleFinalDeleteExpense = async () => {
    if (!expenseToDelete || isDeleting || isClosedMode) return;
    const target = expenseToDelete;

    if (target.name.startsWith('RELIEVER PAYOUT:')) {
      // Allow deletion if explicitly requested via scrub
    }

    setIsDeleting(true);
    try {
      if (target.receiptImage) {
        await deleteFileByUrl(target.receiptImage, 'receipts');
      }

      const { error } = await supabase.from(DB_TABLES.EXPENSES).delete().eq(DB_COLUMNS.ID, target.id);
      if (error) throw error;

      // If this OPERATIONAL expense had a vault cover, cascade-delete the paired VAULT_WITHDRAWAL expense
      // and its vault_transactions record, then restore the vault balance
      if (target.category === 'OPERATIONAL') {
        const pairedVaultCover = exps.find(e =>
          e.category === 'VAULT_WITHDRAWAL' &&
          (e.name || '').toUpperCase() === `VAULT: ${(target.name || '').toUpperCase()}`
        );
        if (pairedVaultCover) {
          await supabase.from(DB_TABLES.EXPENSES).delete().eq(DB_COLUMNS.ID, pairedVaultCover.id);
          // Also delete the vault_transactions record (same ID if created via cover-from-vault)
          await supabase.from(DB_TABLES.VAULT_TRANSACTIONS).delete().eq(DB_COLUMNS.ID, pairedVaultCover.id);
          // Restore vault balance
          const { data: liveVault } = await supabase
            .from(DB_TABLES.BRANCH_VAULTS)
            .select(DB_COLUMNS.VAULT_BALANCE)
            .eq(DB_COLUMNS.BRANCH_ID, branch.id)
            .single();
          const liveBalance: number = liveVault?.[DB_COLUMNS.VAULT_BALANCE] ?? 0;
          await supabase
            .from(DB_TABLES.BRANCH_VAULTS)
            .update({ [DB_COLUMNS.VAULT_BALANCE]: liveBalance + (Number(pairedVaultCover.amount) || 0) })
            .eq(DB_COLUMNS.BRANCH_ID, branch.id);
        }
      }

      await logAudit({
        branchId: branch.id,
        activityType: 'DELETE',
        entityType: 'EXPENSE',
        entityId: target.id,
        description: `Authorized ledger scrub: ${target.name} (₱${target.amount}) removed from ${target.category} registry.`,
        amount: target.amount,
        performerName: user?.username || branch.manager || 'AUTHORIZED MANAGER'
      });

      playSound('success');
      showToast('Record Scrubbed');
      setExpenseToDelete(null);
      onRefresh?.();
    } catch (err) {
      showToast('Scrub Protocol Fault', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteVaultDepositTrigger = (depositId: string) => {
    const deposit = todayVaultData.find((e: any) => e.id === depositId);
    if (!deposit) return;
    playSound('warning');
    setVaultDepositToDelete({ id: deposit.id, amount: Number(deposit.amount), timestamp: deposit.timestamp });
  };

  const handleFinalDeleteVaultDeposit = async () => {
    if (!vaultDepositToDelete || isDeletingVaultDeposit || isClosedMode) return;
    const { id: depositId, amount: refundAmount } = vaultDepositToDelete;
    setIsDeletingVaultDeposit(true);
    try {
      // Delete from vault_transactions — atomic, no partial-failure risk
      const { error: txErr, count } = await supabase
        .from(DB_TABLES.VAULT_TRANSACTIONS)
        .delete({ count: 'exact' })
        .eq(DB_COLUMNS.ID, depositId)
        .eq(DB_COLUMNS.BRANCH_ID, branch.id);
      if (txErr) throw txErr;
      if ((count ?? 0) === 0) throw new Error(`Deposit ${depositId} not found — vault balance unchanged.`);

      // Refund the deposit amount back to vault balance
      const { data: liveVault } = await supabase
        .from(DB_TABLES.BRANCH_VAULTS)
        .select(DB_COLUMNS.VAULT_BALANCE)
        .eq(DB_COLUMNS.BRANCH_ID, branch.id)
        .single();
      const liveBalance: number = liveVault?.[DB_COLUMNS.VAULT_BALANCE] ?? 0;
      const { error: vaultErr } = await supabase
        .from(DB_TABLES.BRANCH_VAULTS)
        .update({ [DB_COLUMNS.VAULT_BALANCE]: Math.max(0, liveBalance - refundAmount) })
        .eq(DB_COLUMNS.BRANCH_ID, branch.id);
      if (vaultErr) throw vaultErr;

      await logAudit({
        branchId: branch.id,
        activityType: 'DELETE',
        entityType: 'EXPENSE',
        entityId: depositId,
        description: `Vault deposit reversal: ₱${refundAmount.toLocaleString()} removed from today's vault deposit log at ${branch.name}. Vault balance reduced accordingly.`,
        amount: refundAmount,
        performerName: user?.username || branch.manager || 'AUTHORIZED MANAGER',
      });

      playSound('success');
      showToast('Vault Deposit Reversed');
      setVaultDepositToDelete(null);
      onRefresh?.();
    } catch (err) {
      showToast('Reversal Failed', 'error');
    } finally {
      setIsDeletingVaultDeposit(false);
    }
  };

  // Triggered from vault fund panel when user wants to reverse a vault withdrawal
  const handleVaultWithdrawalDeleteTrigger = (withdrawalId: string) => {
    // Check vault_transactions first (Pay Bill withdrawals)
    const vaultTxRecord = vaultTransactions.find(t => t.id === withdrawalId && t.type === 'WITHDRAWAL');
    if (vaultTxRecord) {
      playSound('warning');
      setVaultWithdrawalToDelete({ id: withdrawalId, amount: vaultTxRecord.amount, expenseName: (vaultTxRecord.name || '').trim(), source: 'vault_transactions' });
      return;
    }
    // Fallback: check expenses table (cover-from-vault records stored as VAULT_WITHDRAWAL category)
    const expRecord = exps.find(e => e.id === withdrawalId && e.category === 'VAULT_WITHDRAWAL');
    if (expRecord) {
      playSound('warning');
      setVaultWithdrawalToDelete({ id: withdrawalId, amount: Number(expRecord.amount) || 0, expenseName: (expRecord.name || '').replace(/^VAULT:\s*/i, '').trim(), source: 'expenses' });
    }
  };

  const handleFinalDeleteVaultWithdrawal = async () => {
    if (!vaultWithdrawalToDelete || isDeletingVaultWithdrawal || isClosedMode) return;
    const { id: withdrawalId, amount: refundAmount, expenseName, source } = vaultWithdrawalToDelete;
    setIsDeletingVaultWithdrawal(true);
    try {
      if (source === 'vault_transactions') {
        // Delete the vault_transaction WITHDRAWAL record
        const { error: wErr } = await supabase.from(DB_TABLES.VAULT_TRANSACTIONS).delete().eq(DB_COLUMNS.ID, withdrawalId);
        if (wErr) throw wErr;

        // Also delete the paired OPERATIONAL expense (full reversal — restores ROI)
        const pairedOp = exps.find(e => e.category === 'OPERATIONAL' && (e.name || '').toUpperCase() === expenseName.toUpperCase());
        if (pairedOp) {
          if (pairedOp.receiptImage) await deleteFileByUrl(pairedOp.receiptImage, 'receipts');
          await supabase.from(DB_TABLES.EXPENSES).delete().eq(DB_COLUMNS.ID, pairedOp.id);
        }
      } else {
        // Cover-from-vault: delete the VAULT_WITHDRAWAL expense record
        const { error: wErr } = await supabase.from(DB_TABLES.EXPENSES).delete().eq(DB_COLUMNS.ID, withdrawalId);
        if (wErr) throw wErr;

        // Also delete the paired OPERATIONAL expense if it still exists
        const pairedOp = exps.find(e => e.category === 'OPERATIONAL' && (e.name || '').toUpperCase() === expenseName.toUpperCase());
        if (pairedOp) {
          if (pairedOp.receiptImage) await deleteFileByUrl(pairedOp.receiptImage, 'receipts');
          await supabase.from(DB_TABLES.EXPENSES).delete().eq(DB_COLUMNS.ID, pairedOp.id);
        }
      }

      // Refund vault balance
      const { data: liveVault } = await supabase
        .from(DB_TABLES.BRANCH_VAULTS)
        .select(DB_COLUMNS.VAULT_BALANCE)
        .eq(DB_COLUMNS.BRANCH_ID, branch.id)
        .single();
      const liveBalance: number = liveVault?.[DB_COLUMNS.VAULT_BALANCE] ?? 0;
      await supabase
        .from(DB_TABLES.BRANCH_VAULTS)
        .update({ [DB_COLUMNS.VAULT_BALANCE]: liveBalance + refundAmount })
        .eq(DB_COLUMNS.BRANCH_ID, branch.id);

      await logAudit({
        branchId: branch.id,
        activityType: 'DELETE',
        entityType: 'EXPENSE',
        entityId: withdrawalId,
        description: `Vault withdrawal reversal: ₱${refundAmount.toLocaleString()} for ${expenseName} reversed at ${branch.name}. Vault balance restored and expense removed.`,
        amount: refundAmount,
        performerName: user?.username || branch.manager || 'AUTHORIZED MANAGER',
      });

      playSound('success');
      showToast('Vault Usage Reversed');
      setVaultWithdrawalToDelete(null);
      onRefresh?.();
    } catch (err) {
      console.error('[VaultWithdrawalDelete]', err);
      showToast('Reversal Failed', 'error');
    } finally {
      setIsDeletingVaultWithdrawal(false);
    }
  };

  const hiddenRosterStaff = useMemo(() => {
    return employees.filter(e => {
      if (!hiddenStaffNames.has((e.name || '').toUpperCase())) return false;
      const isHomeBranch = e.branchId === branch.id;
      const isAuthorized = e.branchAllowances && typeof e.branchAllowances === 'object' && branch.id in (e.branchAllowances as any);
      const isDesignatedManager = branch.manager?.toUpperCase() === e.name?.toUpperCase();
      const isTempManager = branch.tempManager?.toUpperCase() === e.name?.toUpperCase();
      return isHomeBranch || isAuthorized || isDesignatedManager || isTempManager;
    });
  }, [employees, branch.id, branch.manager, branch.tempManager, hiddenStaffNames]);

  const handleVaultDeposit = async (amount: number, targetDate?: string) => {
    if (!branchVault) return;
    const depositDate = targetDate || todayStr;
    const now = getTrueDate();
    const timePart = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(now);
    const timestamp = `${depositDate}T${timePart}.000+08:00`;
    const reportId = `${branch.id}_${depositDate.replace(/-/g, '')}`;

    // One-deposit-per-day: check for an existing DEPOSIT for this date
    const existingDeposit = vaultTransactions.find(
      t => t.branchId === branch.id && t.type === 'DEPOSIT' && toManilaDateStr(t.timestamp) === depositDate
    );

    const { data: liveVault } = await supabase
      .from(DB_TABLES.BRANCH_VAULTS)
      .select(DB_COLUMNS.VAULT_BALANCE)
      .eq(DB_COLUMNS.BRANCH_ID, branch.id)
      .single();
    const liveBalance: number = liveVault?.[DB_COLUMNS.VAULT_BALANCE] ?? branchVault.balance;

    let newVaultBalance: number;
    if (existingDeposit) {
      // UPDATE existing — adjust balance by delta only
      const delta = amount - existingDeposit.amount;
      newVaultBalance = liveBalance + delta;
      const { error: txErr } = await supabase
        .from(DB_TABLES.VAULT_TRANSACTIONS)
        .update({ [DB_COLUMNS.AMOUNT]: amount, [DB_COLUMNS.TIMESTAMP]: timestamp })
        .eq(DB_COLUMNS.ID, existingDeposit.id);
      if (txErr) throw txErr;

      const { error: vaultErr } = await supabase
        .from(DB_TABLES.BRANCH_VAULTS)
        .update({ [DB_COLUMNS.VAULT_BALANCE]: newVaultBalance })
        .eq(DB_COLUMNS.BRANCH_ID, branch.id);
      if (vaultErr) throw vaultErr;
    } else {
      // INSERT new deposit
      newVaultBalance = liveBalance + amount;
      const txId = Math.random().toString(36).substr(2, 9);
      const { error: txErr } = await supabase
        .from(DB_TABLES.VAULT_TRANSACTIONS)
        .insert({
          [DB_COLUMNS.ID]: txId,
          [DB_COLUMNS.BRANCH_ID]: branch.id,
          [DB_COLUMNS.REPORT_ID]: reportId,
          [DB_COLUMNS.TYPE]: 'DEPOSIT',
          [DB_COLUMNS.AMOUNT]: amount,
          [DB_COLUMNS.NAME]: 'VAULT DEPOSIT',
          [DB_COLUMNS.TIMESTAMP]: timestamp,
          [DB_COLUMNS.PERFORMED_BY]: user?.username || branch.manager || null,
        });
      if (txErr) throw txErr;

      const { error: vaultErr } = await supabase
        .from(DB_TABLES.BRANCH_VAULTS)
        .update({ [DB_COLUMNS.VAULT_BALANCE]: newVaultBalance })
        .eq(DB_COLUMNS.BRANCH_ID, branch.id);
      if (vaultErr) throw vaultErr;
    }

    // Sync total_vault_provision to sales_reports immediately so it doesn't
    // depend on the auto-save chain catching up (which can lag or miss entirely).
    try {
      const { data: allDeposits } = await supabase
        .from(DB_TABLES.VAULT_TRANSACTIONS)
        .select(DB_COLUMNS.AMOUNT)
        .eq(DB_COLUMNS.BRANCH_ID, branch.id)
        .eq(DB_COLUMNS.TYPE, 'DEPOSIT')
        .gte(DB_COLUMNS.TIMESTAMP, `${depositDate}T00:00:00`)
        .lt(DB_COLUMNS.TIMESTAMP, `${depositDate}T23:59:59.999`);
      const totalProvision = (allDeposits || []).reduce((s, t) => s + Number(t[DB_COLUMNS.AMOUNT] ?? 0), 0);

      const { data: existingReport } = await supabase
        .from(DB_TABLES.SALES_REPORTS)
        .select(`${DB_COLUMNS.NET_ROI}, ${DB_COLUMNS.TOTAL_VAULT_PROVISION}`)
        .eq(DB_COLUMNS.ID, reportId)
        .maybeSingle();

      if (existingReport) {
        const prevProvision = Number(existingReport[DB_COLUMNS.TOTAL_VAULT_PROVISION] ?? 0);
        const prevNet = Number(existingReport[DB_COLUMNS.NET_ROI] ?? 0);
        const provisionDelta = totalProvision - prevProvision;
        const newNet = Math.max(0, prevNet - provisionDelta);

        await supabase
          .from(DB_TABLES.SALES_REPORTS)
          .update({
            [DB_COLUMNS.TOTAL_VAULT_PROVISION]: totalProvision,
            [DB_COLUMNS.NET_ROI]: newNet,
          })
          .eq(DB_COLUMNS.ID, reportId);
      }
    } catch (syncErr) {
      console.error('[VaultDeposit] Failed to sync to sales_reports:', syncErr);
    }

    onRefresh?.();
  };

  const handleVaultDepositPromptSubmit = async () => {
    const target = branchVault?.target ?? 0;
    const netRoi = Math.max(0, metrics.net);

    // Guard: ROI must be positive
    if (netRoi <= 0) return;

    // Re-fetch live vault balance to prevent stale-state bypass (e.g. two tabs open)
    const { data: liveVaultData } = await supabase
      .from(DB_TABLES.BRANCH_VAULTS)
      .select(DB_COLUMNS.VAULT_BALANCE)
      .eq(DB_COLUMNS.BRANCH_ID, branch.id)
      .single();
    const liveBalance: number = liveVaultData?.[DB_COLUMNS.VAULT_BALANCE] ?? (branchVault?.balance ?? 0);

    const spaceInTarget = target > 0 ? Math.max(0, target - liveBalance) : Infinity;
    const maxDeposit = Math.min(netRoi, spaceInTarget === Infinity ? netRoi : spaceInTarget);
    const remitAllAmt = maxDeposit;
    const amount = vaultDepositRemitAll ? remitAllAmt : Number(vaultDepositInput);

    // Hard guards — these run even if the UI is bypassed via devtools
    if (!amount || amount <= 0) return;
    if (amount > netRoi) { showToast('Deposit cannot exceed today\'s ROI', 'error'); return; }
    if (target > 0 && liveBalance + amount > target) { showToast('Deposit would exceed vault target', 'error'); return; }

    setIsSubmittingVaultDeposit(true);
    try {
      await handleVaultDeposit(amount, vaultDepositTargetDate || todayStr);
      playSound('success');
      setShowVaultDepositPrompt(false);
      setVaultDepositInput('');
    } catch (err) {
      showToast('Vault deposit failed', 'error');
    } finally {
      setIsSubmittingVaultDeposit(false);
    }
  };

  const handleExportPDF = async (confirmed = false) => {
    if (!confirmed) {
      playSound('warning');
      setShowPDFConfirm(true);
      return;
    }

    setShowPDFConfirm(false);
    setIsExporting(true);
    playSound('click');

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const displayDate = new Date(todayStr).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();

      // 1. Header
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text((branch.name || '').toUpperCase(), 14, 20);

      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139); // slate-400
      doc.text('DAILY OPERATIONAL LEDGER', 14, 26);

      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(displayDate, pageWidth - 14, 20, { align: 'right' });

      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(`Generated: ${new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).format(getTrueDate())}`, pageWidth - 14, 26, { align: 'right' });

      // 2. Financial Summary
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text('FINANCIAL SUMMARY', 14, 40);

      autoTable(doc, {
        startY: 43,
        head: [['Metric', 'Amount']],
        body: [
          ['Gross Sales', `PHP ${metrics.gross.toLocaleString()}`],
          ['  - Cash Payments', `PHP ${metrics.cashTotal.toLocaleString()}`],
          ['  - GCash Payments', `PHP ${metrics.gcashTotal.toLocaleString()}`],
          ['Expenses', ''],
          ['    Operational', `PHP ${Math.max(0, metrics.operationalExp - metrics.vaultCoveredExp).toLocaleString()}`],
          ...(metrics.vaultCoveredExp > 0 ? [['    Vault Shouldered', `PHP ${metrics.vaultCoveredExp.toLocaleString()}`]] : []),
          ...(metrics.vaultProvision > 0 ? [['Vault Deposit', `PHP ${metrics.vaultProvision.toLocaleString()}`]] : []),
          ['Staff Payroll', `PHP ${metrics.totalStaffLiability.toLocaleString()}`],
          ['Net ROI', `PHP ${metrics.net.toLocaleString()}`],
        ],
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 9 },
        columnStyles: {
          1: { halign: 'right', fontStyle: 'bold' }
        },
        rowPageBreak: 'avoid'
      });

      let currentY = (doc as any).lastAutoTable.finalY + 15;

      // 3. Session Logs
      doc.setFontSize(11);
      doc.text('SESSION LOGS', 14, currentY);

      autoTable(doc, {
        startY: currentY + 3,
        head: [['Time', 'Client', 'Service', 'Total', 'Settlement', 'Providers', 'ROI']],
        body: txs.map(t => {
          const therapistComm = Number(t.primaryCommission) || 0;
          const bonesetterComm = Number(t.secondaryCommission) || 0;
          const sessionDeduction = Number(t.deduction) || 0;
          const netTotal = (Number(t.basePrice) - (Number(t.discount) || 0));
          const netRoi = (netTotal - therapistComm - bonesetterComm + sessionDeduction);

          let providers = '';
          if (t.therapistName) providers += `T: ${t.therapistName} (P${therapistComm})`;
          if (t.bonesetterName) providers += `${providers ? '\n' : ''}B: ${t.bonesetterName} (P${bonesetterComm})`;

          const settlement = `${t.paymentMethod || 'CASH'} (${t.paymentStatus || 'PAID'})`;

          return [
            new Date(t.timestamp.replace(/(\+00:00|Z)$/, "")).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
            (t.clientName || '').toUpperCase(),
            (t.serviceName || '').toUpperCase(),
            `PHP ${netTotal.toLocaleString()}`,
            settlement.toUpperCase(),
            providers,
            `PHP ${netRoi.toLocaleString()}`
          ];
        }),
        theme: 'grid',
        headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
        styles: { fontSize: 7 },
        columnStyles: {
          3: { halign: 'right' },
          6: { halign: 'right', fontStyle: 'bold' }
        },
        rowPageBreak: 'avoid'
      });

      currentY = (doc as any).lastAutoTable.finalY + 15;

      // Check for page overflow
      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }

      // 4. Staff Performance
      doc.setFontSize(11);
      doc.text('STAFF PERFORMANCE MATRIX', 14, currentY);

      autoTable(doc, {
        startY: currentY + 3,
        head: [['Employee', 'Sessions', 'Base Pay', 'Late', 'OT', 'Advance', 'Final Pay']],
        body: Object.entries(metrics.staffSummary).map(([name, data]: [string, any]) => {
          const late = Number(data.attendance?.lateDeduction || 0);
          const ot = Number(data.attendance?.otPay || 0);
          const adv = Number(data.attendance?.cashAdvance || 0);
          const finalPay = data.commission + data.allowance + ot - late;
          const isHalfDay = data.attendance?.isHalfDay || data.attendance?.is_half_day || false;
          const isReliever = data.isReliever;

          let displayName = name.toUpperCase();
          if (isReliever) displayName += ' (RELIEVER)';
          if (isHalfDay) displayName += ' (HALF DAY)';

          return [
            displayName,
            Number(data.count || 0),
            `PHP ${(data.commission + data.allowance).toLocaleString()}`,
            `-PHP ${late.toLocaleString()}`,
            `+PHP ${ot.toLocaleString()}`,
            `PHP ${adv.toLocaleString()}`,
            `PHP ${finalPay.toLocaleString()}`
          ];
        }),
        theme: 'grid',
        headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
        styles: { fontSize: 8 },
        columnStyles: {
          1: { halign: 'center' },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right', fontStyle: 'bold' }
        },
        rowPageBreak: 'avoid'
      });

      currentY = (doc as any).lastAutoTable.finalY + 15;

      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }

      // Build vault coverage map: expense name → vault-shouldered amount
      const allTodayVaultTxs = vaultTransactions.filter(
        t => t.branchId === branch.id && toManilaDateStr(t.timestamp) === todayStr
      );
      const vaultCovMap: Record<string, number> = {};
      allTodayVaultTxs
        .filter(t => t.type === 'WITHDRAWAL')
        .forEach(t => {
          const expName = (t.name || '').replace(/^VAULT:\s*/i, '').trim().toUpperCase();
          vaultCovMap[expName] = (vaultCovMap[expName] ?? 0) + t.amount;
        });

      // 5. Expenses — show ROI portion only (deduct vault-shouldered amount per line)
      const expenseBody = exps.filter(e => e.category === 'OPERATIONAL' || e.category === 'PROVISION').map(e => {
        const expName = (e.name || '').trim().toUpperCase();
        const vaultCov = vaultCovMap[expName] ?? 0;
        const roiAmount = Math.max(0, Number(e.amount || 0) - vaultCov);
        return [(e.name || '').toUpperCase(), `-PHP ${roiAmount.toLocaleString()}`];
      });

      doc.setFontSize(11);
      doc.setTextColor(220, 38, 38);
      doc.text('EXPENSES', 14, currentY);
      doc.setTextColor(0, 0, 0);

      autoTable(doc, {
        startY: currentY + 3,
        head: [['Item', 'Amount']],
        body: expenseBody.length > 0 ? expenseBody : [['No expenses recorded', '—']],
        theme: 'grid',
        headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255] },
        styles: { fontSize: 8 },
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
        rowPageBreak: 'avoid'
      });

      currentY = (doc as any).lastAutoTable.finalY + 10;

      // 6. Vault Transactions — withdrawals (vault-shouldered) + deposits
      if (allTodayVaultTxs.length > 0) {
        if (currentY > 250) { doc.addPage(); currentY = 20; }

        doc.setFontSize(11);
        doc.setTextColor(109, 40, 217); // violet-700
        doc.text('VAULT TRANSACTIONS', 14, currentY);
        doc.setTextColor(0, 0, 0);

        const vaultTxBody = allTodayVaultTxs
          .sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''))
          .map(t => {
            const ts = t.timestamp
              ? new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(t.timestamp))
              : '—';
            const isDeposit = t.type === 'DEPOSIT';
            // For withdrawals, strip the "VAULT: " prefix for a cleaner label
            const rawName = t.name || (isDeposit ? 'VAULT DEPOSIT' : 'VAULT WITHDRAWAL');
            const label = rawName.replace(/^VAULT:\s*/i, '').trim().toUpperCase();
            const amount = isDeposit
              ? `+PHP ${Number(t.amount || 0).toLocaleString()}`
              : `-PHP ${Number(t.amount || 0).toLocaleString()}`;
            return [label, isDeposit ? 'Deposit' : 'Vault Shouldered', ts, amount];
          });

        autoTable(doc, {
          startY: currentY + 3,
          head: [['Description', 'Type', 'Time', 'Amount']],
          body: vaultTxBody,
          theme: 'grid',
          headStyles: { fillColor: [109, 40, 217], textColor: [255, 255, 255] },
          styles: { fontSize: 8 },
          columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } },
          rowPageBreak: 'avoid'
        });

        currentY = (doc as any).lastAutoTable.finalY + 10;
      }

      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }


      doc.save(`DAILY_REPORT_${branch.name.replace(/\s+/g, '_')}_${todayStr}.pdf`);
      playSound('success');
    } catch (error) {
      console.error('PDF Export failed:', error);
      alert('Failed to generate PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-8 max-w-7xl mx-auto px-4">
        <KPISkeleton />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-32 max-w-7xl mx-auto relative">
        {/* Print Only Header */}
        <div className="hidden print:block mb-8 border-b-2 border-slate-900 pb-6">
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-black uppercase tracking-tighter text-slate-900">{branch.name}</h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">Daily Operational Ledger</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold uppercase tracking-tight text-slate-900">{new Date(todayStr).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Generated: {new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).format(getTrueDate())}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-row justify-between items-center no-print px-2 mb-2">
          {/* SYNC STATUS LEGEND */}
          <div className="flex-1">
            {(connStatus === 'offline' || autoSyncStatus === 'saving') && (
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all duration-500 shadow-sm ${connStatus === 'offline' ? 'bg-rose-50 border-rose-100 shadow-rose-50' : 'bg-emerald-50 border-emerald-100 shadow-emerald-50'}`}>
                <div className="relative">
                  {connStatus === 'offline' ? (
                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e]"></div>
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]"></div>
                  )}
                </div>
                <div className="w-px h-2.5 bg-slate-200"></div>
                <span className={`text-[8px] font-black uppercase tracking-widest tabular-nums ${connStatus === 'offline' ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {connStatus === 'offline' 
                    ? `OFFLINE: ${pendingSyncCount} PENDING RELAY` 
                    : autoSyncStatus === 'saving' 
                      ? 'SAVING...' 
                      : 'SYNCED'}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onForceSync && (
              <button
                onClick={() => { playSound('click'); onForceSync(); }}
                disabled={autoSyncStatus === 'saving'}
                title="Force sync report to database"
                className={`flex items-center gap-1.5 px-3 py-2 bg-white text-slate-400 border border-slate-200 rounded-xl text-[9px] font-bold uppercase tracking-widest hover:bg-slate-50 hover:text-slate-600 transition-all shadow-sm active:scale-95 ${autoSyncStatus === 'saving' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <svg className={`w-3 h-3 ${autoSyncStatus === 'saving' ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Sync
              </button>
            )}
          <button
              onClick={() => handleExportPDF()}
              disabled={isExporting}
              className={`flex items-center gap-1.5 px-4 py-2 bg-white text-slate-500 border border-slate-200 rounded-xl text-[9px] font-bold uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm active:scale-95 shrink-0 ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isExporting ? (
                <div className="w-3 h-3 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin"></div>
            ) : (
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2-0 01-2-2V5a2 2-0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2-0 01-2 2z" /></svg>
            )}
            {isExporting ? 'Exporting...' : 'Export PDF'}
          </button>
          </div>
        </div>

        <div className="space-y-6 print:hidden">
          {toast && (
              <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 rounded-full shadow-2xl animate-in slide-in-from-top-6 duration-300 font-black text-[11px] uppercase tracking-[0.1em] bg-slate-900 text-white border border-white/10 flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${toast.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'} animate-pulse`}></div>
                {toast.message}
              </div>
          )}

          {expenseToDelete && ReactDOM.createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md no-print animate-in fade-in duration-200" onClick={() => !isDeleting && setExpenseToDelete(null)}>
              <div className="w-full max-w-md bg-white shadow-2xl rounded-[32px] p-10 text-center border border-slate-100 animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
                <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </div>
                <h4 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Remove Record?</h4>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-relaxed">
                  Permanently delete {expenseToDelete.name} (₱{expenseToDelete.amount.toLocaleString()}) from the registry? This cannot be undone.
                </p>
                <div className="flex flex-col gap-4 mt-10">
                  <button
                    onClick={handleFinalDeleteExpense}
                    disabled={isDeleting}
                    className="w-full bg-rose-600 text-white font-black py-5 rounded-2xl text-[12px] uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3"
                  >
                    {isDeleting ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : 'Delete Record'}
                  </button>
                  <button
                    onClick={() => setExpenseToDelete(null)}
                    disabled={isDeleting}
                    className="w-full text-slate-400 font-black py-4 rounded-xl text-[12px] uppercase tracking-widest"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

          {vaultDepositToDelete && ReactDOM.createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md no-print animate-in fade-in duration-200" onClick={() => !isDeletingVaultDeposit && setVaultDepositToDelete(null)}>
              <div className="w-full max-w-md bg-white shadow-2xl rounded-[32px] p-10 text-center border border-slate-100 animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
                <div className="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20V4m0 0l-6 6m6-6l6 6" /></svg>
                </div>
                <h4 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Reverse Deposit?</h4>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-relaxed">
                  Remove this ₱{vaultDepositToDelete.amount.toLocaleString()} vault deposit{vaultDepositToDelete.timestamp ? ` from ${new Date(vaultDepositToDelete.timestamp.replace(' ', 'T')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })}` : ''}? The amount will be deducted back from the vault balance.
                </p>
                <div className="flex flex-col gap-4 mt-10">
                  <button
                    onClick={handleFinalDeleteVaultDeposit}
                    disabled={isDeletingVaultDeposit}
                    className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl text-[12px] uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3"
                  >
                    {isDeletingVaultDeposit ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : 'Reverse Deposit'}
                  </button>
                  <button
                    onClick={() => setVaultDepositToDelete(null)}
                    disabled={isDeletingVaultDeposit}
                    className="w-full text-slate-400 font-black py-4 rounded-xl text-[12px] uppercase tracking-widest"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

          {vaultWithdrawalToDelete && ReactDOM.createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md no-print animate-in fade-in duration-200" onClick={() => !isDeletingVaultWithdrawal && setVaultWithdrawalToDelete(null)}>
              <div className="w-full max-w-md bg-white shadow-2xl rounded-[32px] p-10 text-center border border-slate-100 animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
                <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20V4m0 16l-6-6m6 6l6-6" /></svg>
                </div>
                <h4 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Reverse Vault Usage?</h4>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-relaxed">
                  This will remove the <span className="text-slate-700">{vaultWithdrawalToDelete.expenseName}</span> expense and restore ₱{vaultWithdrawalToDelete.amount.toLocaleString()} to the vault fund.
                </p>
                <p className="text-[9px] font-semibold text-amber-500 uppercase tracking-widest mt-3">The paired expense record will also be deleted and ROI will be restored.</p>
                <div className="flex flex-col gap-4 mt-10">
                  <button
                    onClick={handleFinalDeleteVaultWithdrawal}
                    disabled={isDeletingVaultWithdrawal}
                    className="w-full bg-amber-600 text-white font-black py-5 rounded-2xl text-[12px] uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3"
                  >
                    {isDeletingVaultWithdrawal ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : 'Reverse Vault Usage'}
                  </button>
                  <button
                    onClick={() => setVaultWithdrawalToDelete(null)}
                    disabled={isDeletingVaultWithdrawal}
                    className="w-full text-slate-400 font-black py-4 rounded-xl text-[12px] uppercase tracking-widest"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

          {(isAddExpenseModalOpen || openExpenseModalOnDeposit || openExpenseModalOnLegacyDeposit) && (
            <QuickExpenseModal
              branch={branch}
              todayStr={todayStr}
              onClose={() => { setIsAddExpenseModalOpen(false); setOpenExpenseModalOnDeposit(false); setOpenExpenseModalOnLegacyDeposit(false); }}
              onRefresh={onRefresh}
              performerName={user?.username}
              branchVault={branchVault}
              currentNetRoi={metrics.net}
              defaultIsVaultDeposit={openExpenseModalOnDeposit}
              defaultIsLegacyDeposit={openExpenseModalOnLegacyDeposit}
              onDeposit={handleVaultDeposit}
              hideDepositTab={isAddExpenseModalOpen && !openExpenseModalOnDeposit && !openExpenseModalOnLegacyDeposit}
            />
          )}
          {viewingExpense && (<ExpenseDetailModal expense={viewingExpense} onClose={() => setViewingExpense(null)} />)}

          {showVaultDepositPrompt && ReactDOM.createPortal(
            <div className={UI_THEME.layout.modalWrapper} onClick={() => { setShowVaultDepositPrompt(false); setVaultDepositInput(''); }}>
              <div className="w-full max-w-xs bg-white rounded-[28px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                {(() => {
                  const currentBalance = branchVault?.balance ?? 0;
                  const target = branchVault?.target ?? 0;
                  const isDepositingYesterday = vaultDepositTargetDate === yesterdayStr && !!yesterdayReport;
                  const netRoi = isDepositingYesterday
                    ? Math.max(0, yesterdayReport!.netRoi || 0)
                    : Math.max(0, metrics.net);
                  // Cap by both: today's ROI and remaining space to target
                  const spaceInTarget = target > 0 ? Math.max(0, target - currentBalance) : Infinity;
                  const maxDeposit = Math.min(netRoi, spaceInTarget === Infinity ? netRoi : spaceInTarget);
                  const remitAllAmt = maxDeposit;
                  // Summary figures for the selected day
                  const summaryGross = isDepositingYesterday ? (yesterdayReport!.grossSales || 0) : metrics.gross;
                  const summaryExpenses = isDepositingYesterday ? (yesterdayReport!.totalExpenses || 0) : Math.max(0, metrics.operationalExp - metrics.vaultCoveredExp);
                  const summaryStaff = isDepositingYesterday ? (yesterdayReport!.totalStaffPay || 0) : metrics.finalStaffPayTotal;
                  const depositAmt = vaultDepositRemitAll ? remitAllAmt : (Number(vaultDepositInput) || 0);
                  const wouldExceed = target > 0 && depositAmt > maxDeposit;
                  const afterBalance = currentBalance + depositAmt;
                  const afterPct = target > 0 ? Math.min(100, Math.round((afterBalance / target) * 100)) : 0;
                  const currentPct = target > 0 ? Math.min(100, Math.round((currentBalance / target) * 100)) : 0;
                  return (
                    <>
                      {/* Header */}
                      <div className="bg-indigo-50 px-5 pt-5 pb-4">
                        <p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">Vault Deposit</p>
                        <p className="text-base font-black text-slate-900 uppercase tracking-tight leading-none">{branch.name}</p>

                        {/* Current fund + target */}
                        <div className="mt-3 flex items-end justify-between">
                          <div>
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Current Fund</p>
                            <p className="text-xl font-black text-indigo-700 tabular-nums leading-none">₱{currentBalance.toLocaleString()}</p>
                          </div>
                          {target > 0 && (
                            <div className="text-right">
                              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Target</p>
                              <p className="text-sm font-black text-slate-500 tabular-nums leading-none">₱{target.toLocaleString()}</p>
                            </div>
                          )}
                        </div>

                        {/* Progress bar */}
                        {target > 0 && (
                          <div className="mt-2.5">
                            <div className="w-full h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-400 rounded-full transition-all duration-500" style={{ width: `${currentPct}%` }} />
                            </div>
                            <p className="text-[8px] font-bold text-indigo-300 uppercase tracking-widest mt-1">{currentPct}% of target</p>
                          </div>
                        )}

                        {/* Vault summary table */}
                        <div className="mt-3 bg-white/60 rounded-2xl border border-indigo-100 overflow-hidden">
                          <div className="divide-y divide-indigo-50">
                            <div className="flex items-center justify-between px-3 py-1.5">
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Current Balance</span>
                              <span className="text-[10px] font-black text-slate-600 tabular-nums">₱{currentBalance.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between px-3 py-1.5">
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Depositing</span>
                              <span className="text-[10px] font-black text-indigo-500 tabular-nums">+₱{depositAmt.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between px-3 py-2 bg-indigo-50/60">
                              <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">Expected Total</span>
                              <span className="text-[11px] font-black text-indigo-700 tabular-nums">₱{(currentBalance + depositAmt).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Body */}
                      <div className="px-5 py-4 flex flex-col gap-3">
                        {netRoi <= 0 ? (
                          /* Negative / zero ROI — deposit not possible */
                          <div className="flex items-start gap-3 p-3.5 bg-rose-50 border-2 border-rose-200 rounded-2xl">
                            <svg className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                            </svg>
                            <div>
                              <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Deposit Not Available</p>
                              <p className="text-[9px] font-semibold text-rose-400 mt-0.5 leading-relaxed">Today's ROI is ₱{metrics.net.toLocaleString()} — there is nothing to deposit into the vault.</p>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Deposit full ROI checkbox (checked by default) */}
                            <button
                              type="button"
                              onClick={() => { setVaultDepositRemitAll(v => !v); setVaultDepositInput(''); }}
                              className={`flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all text-left ${vaultDepositRemitAll ? 'bg-indigo-50 border-indigo-300' : 'bg-slate-50 border-slate-200 hover:border-indigo-200'}`}
                            >
                              <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${vaultDepositRemitAll ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300'}`}>
                                {vaultDepositRemitAll && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className={`text-[11px] font-black uppercase tracking-widest leading-none ${vaultDepositRemitAll ? 'text-indigo-900' : 'text-slate-600'}`}>Deposit full ROI</p>
                                <p className={`text-[9px] font-bold tabular-nums mt-0.5 ${vaultDepositRemitAll ? 'text-indigo-400' : 'text-slate-400'}`}>
                                  ₱{remitAllAmt.toLocaleString()}
                                  {spaceInTarget !== Infinity && spaceInTarget < netRoi && <span className="ml-1 text-amber-500">(capped by target)</span>}
                                </p>
                              </div>
                            </button>

                            {/* Custom amount input — shown when full ROI unchecked */}
                            {!vaultDepositRemitAll && (() => {
                              const customAmt = Number(vaultDepositInput) || 0;
                              const isOverMax = customAmt > maxDeposit;
                              const isZero = vaultDepositInput !== '' && customAmt <= 0;
                              const isInvalid = isOverMax || isZero;
                              const validationMsg = isOverMax
                                ? `Exceeds your available ROI of ₱${maxDeposit.toLocaleString()}${spaceInTarget !== Infinity && spaceInTarget < netRoi ? ' (capped by vault target)' : ''}`
                                : isZero
                                ? 'Amount must be greater than ₱0'
                                : null;
                              return (
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between px-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Custom Amount</label>
                                    <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">Max ₱{maxDeposit.toLocaleString()}</span>
                                  </div>
                                  <div className="relative">
                                    <span className={`absolute left-4 top-1/2 -translate-y-1/2 text-base font-black pointer-events-none ${isInvalid ? 'text-rose-300' : 'text-slate-300'}`}>₱</span>
                                    <input
                                      type="number"
                                      autoFocus
                                      min={1}
                                      max={maxDeposit}
                                      value={vaultDepositInput}
                                      onChange={e => setVaultDepositInput(e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter' && !isInvalid && customAmt > 0) handleVaultDepositPromptSubmit(); }}
                                      placeholder="0"
                                      className={`w-full pl-9 pr-4 py-3 text-[18px] font-black tabular-nums rounded-2xl outline-none transition-all border-2 ${
                                        isInvalid
                                          ? 'border-rose-400 bg-rose-50 text-rose-700 focus:border-rose-500'
                                          : 'border-slate-200 bg-slate-50 text-indigo-900 focus:border-indigo-400 focus:bg-white'
                                      }`}
                                    />
                                  </div>
                                  {validationMsg && (
                                    <p className="text-[9px] font-bold text-rose-500 px-1 leading-snug">{validationMsg}</p>
                                  )}
                                </div>
                              );
                            })()}
                          </>
                        )}

                        {/* Actions */}
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            onClick={() => { setShowVaultDepositPrompt(false); setVaultDepositInput(''); }}
                            className="py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all"
                          >Cancel</button>
                          <button
                            onClick={handleVaultDepositPromptSubmit}
                            disabled={netRoi <= 0 || depositAmt <= 0 || depositAmt > maxDeposit || isSubmittingVaultDeposit}
                            className="py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                          >{isSubmittingVaultDeposit ? 'Saving...' : `Deposit ₱${depositAmt.toLocaleString()}`}</button>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>,
            document.body
          )}

          {showPDFConfirm && ReactDOM.createPortal(
            <div className={UI_THEME.layout.modalWrapper} onClick={() => setShowPDFConfirm(false)}>
              <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-10 text-center border border-slate-100`} onClick={e => e.stopPropagation()}>
                <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2-0 01-2-2V5a2 2-0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2-0 01-2 2z" /></svg>
                </div>
                <h4 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Export PDF?</h4>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-relaxed">
                  Generate and download the daily operational ledger for {branch.name}?
                </p>
                <div className="flex flex-col gap-4 mt-10">
                  <button
                    onClick={() => handleExportPDF(true)}
                    className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl text-[12px] uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3"
                  >
                    Confirm Export
                  </button>
                  <button
                    onClick={() => setShowPDFConfirm(false)}
                    className="w-full text-slate-400 font-black py-4 rounded-xl text-[12px] uppercase tracking-widest"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

          <SalesKPIStrip
              gross={metrics.gross}
              cashTotal={metrics.cashTotal}
              gcashTotal={metrics.gcashTotal}
              operationalExp={metrics.operationalExp}
              vaultDeposit={metrics.vaultProvision}
              vaultWithdrawal={metrics.vaultWithdrawal}
              vaultCoveredExp={metrics.vaultCoveredExp}
              vaultBalance={branchVault?.balance ?? 0}
              vaultTarget={branchVault?.target ?? 0}
              rentAndBillsTotal={metrics.provisionExp}
              isLegacy={!branch.vaultEnabled || (branchVault?.startDate ? todayStr < branchVault.startDate : true)}
              finalStaffPayTotal={metrics.totalStaffLiability}
              net={metrics.net}
              totalAllowances={metrics.totalAllowances}
              otAdditions={metrics.otAdditions}
              lateDeductions={metrics.lateDeductions}
              totalCashAdvances={metrics.totalCashAdvances}
              connStatus={connStatus}
              pendingSyncCount={pendingSyncCount}
          />
          <SessionLogs transactions={txs} services={branch?.services ?? []} />
          <StaffPerformance
              branch={branch}
              staffSummary={metrics.staffSummary}
              hiddenRosterStaff={hiddenRosterStaff}
              handleHideStaff={handleHideStaff}
              handleRestoreStaff={handleRestoreStaff}
              onRefresh={onRefresh}
              todayStr={todayStr}
              transactions={txs}
              employees={employees}
              hiddenStaffNames={hiddenStaffNames}
          />
          <VaultExpenses
              operationalLogs={exps}
              vaultDepositLogs={todayVaultData}
              operationalTotal={metrics.operationalExp}
              setIsAddExpenseModalOpen={setIsAddExpenseModalOpen}
              setViewingExpense={setViewingExpense}
              isClosedMode={isClosedMode}
              onDeleteExpense={handleDeleteExpenseTrigger}
              onDeleteVaultDeposit={handleDeleteVaultDepositTrigger}
              onDeleteVaultWithdrawal={handleVaultWithdrawalDeleteTrigger}
              currentNetRoi={metrics.net}
              isLegacy={!branch.vaultEnabled || (branchVault?.startDate ? todayStr < branchVault.startDate : true)}
              onOpenVaultDeposit={() => { setVaultDepositTargetDate(todayStr); setShowVaultDepositPrompt(true); }}
              onOpenLegacyDeposit={branch.vaultEnabled ? () => setOpenExpenseModalOnLegacyDeposit(true) : undefined}
              onOpenRecordExpense={() => setIsAddExpenseModalOpen(true)}
              vaultBalance={branchVault?.balance ?? 0}
              vaultInitialBalance={(branchVault as any)?.initialBalance ?? 0}
          />
        </div>

        {/* PRINT ONLY TABLE VIEW */}
        <div className="hidden print:block space-y-8">
          {/* KPI SUMMARY TABLE */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Financial Summary</h4>
            <table className="w-full border-collapse border border-slate-200 text-[11px]">
              <thead>
              <tr className="bg-slate-50">
                <th className="border border-slate-200 px-4 py-2 text-left uppercase tracking-widest">Metric</th>
                <th className="border border-slate-200 px-4 py-2 text-right uppercase tracking-widest">Amount</th>
              </tr>
              </thead>
              <tbody>
              <tr>
                <td className="border border-slate-200 px-4 py-2 font-bold uppercase">Gross Sales</td>
                <td className="border border-slate-200 px-4 py-2 text-right font-bold tabular-nums">₱{metrics.gross.toLocaleString()}</td>
              </tr>
              <tr>
                <td className="border border-slate-200 px-4 py-2 text-[9px] uppercase text-slate-500 pl-8 italic">  - Cash Payments</td>
                <td className="border border-slate-200 px-4 py-2 text-right text-[9px] tabular-nums text-slate-500 italic">₱{metrics.cashTotal.toLocaleString()}</td>
              </tr>
              <tr>
                <td className="border border-slate-200 px-4 py-2 text-[9px] uppercase text-slate-500 pl-8 italic">  - GCash Payments</td>
                <td className="border border-slate-200 px-4 py-2 text-right text-[9px] tabular-nums text-slate-500 italic">₱{metrics.gcashTotal.toLocaleString()}</td>
              </tr>
              <tr>
                <td className="border border-slate-200 px-4 py-2 font-bold uppercase text-rose-600">Expenses</td>
                <td className="border border-slate-200 px-4 py-2 text-right tabular-nums text-slate-400">—</td>
              </tr>
              <tr>
                <td className="border border-slate-200 px-4 py-2 text-[9px] uppercase text-slate-500 pl-8 italic">  Operational</td>
                <td className="border border-slate-200 px-4 py-2 text-right text-[9px] tabular-nums text-slate-500 italic">₱{metrics.operationalExp.toLocaleString()}</td>
              </tr>
              {metrics.vaultProvision > 0 && (
              <tr>
                <td className="border border-slate-200 px-4 py-2 text-[9px] uppercase text-slate-500 pl-8 italic">  Vault Deposit</td>
                <td className="border border-slate-200 px-4 py-2 text-right text-[9px] tabular-nums text-slate-500 italic">₱{metrics.vaultProvision.toLocaleString()}</td>
              </tr>
              )}
              <tr>
                <td className="border border-slate-200 px-4 py-2 font-bold uppercase text-amber-600">Staff Payroll</td>
                <td className="border border-slate-200 px-4 py-2 text-right font-bold tabular-nums text-amber-600">₱{metrics.totalStaffLiability.toLocaleString()}</td>
              </tr>
              <tr className="bg-slate-900 text-white">
                <td className="border border-slate-900 px-4 py-2 font-black uppercase tracking-widest">Net ROI</td>
                <td className="border border-slate-900 px-4 py-2 text-right font-black tabular-nums">₱{metrics.net.toLocaleString()}</td>
              </tr>
              {branchVault && branchVault.target > 0 && (
              <tr>
                <td className="border border-slate-200 px-4 py-2 font-bold uppercase text-indigo-600">Vault Balance</td>
                <td className="border border-slate-200 px-4 py-2 text-right font-bold tabular-nums text-indigo-600">₱{branchVault.balance.toLocaleString()}</td>
              </tr>
              )}
              </tbody>
            </table>
          </div>

          {/* SESSION LOGS TABLE */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Session Logs</h4>
            <table className="w-full border-collapse border border-slate-200 text-[9px]">
              <thead>
              <tr className="bg-slate-50 font-bold uppercase tracking-widest">
                <th className="border border-slate-200 px-2 py-1.5 text-left">Time</th>
                <th className="border border-slate-200 px-2 py-1.5 text-left">Client</th>
                <th className="border border-slate-200 px-2 py-1.5 text-left">Service</th>
                <th className="border border-slate-200 px-2 py-1.5 text-right">Total</th>
                <th className="border border-slate-200 px-2 py-1.5 text-left">Settlement</th>
                <th className="border border-slate-200 px-2 py-1.5 text-left">Providers</th>
                <th className="border border-slate-200 px-2 py-1.5 text-right">ROI</th>
              </tr>
              </thead>
              <tbody>
              {txs.map((t: any) => {
                const therapistComm = Number(t.primaryCommission) || 0;
                const bonesetterComm = Number(t.secondaryCommission) || 0;
                const sessionDeduction = Number(t.deduction) || 0;
                const netTotal = (Number(t.basePrice) - (Number(t.discount) || 0));
                const netRoi = (netTotal - therapistComm - bonesetterComm + sessionDeduction);
                return (
                    <tr key={t.id}>
                      <td className="border border-slate-200 px-2 py-1.5 tabular-nums">
                        {new Date(t.timestamp.replace(/(\+00:00|Z)$/, "")).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </td>
                      <td className="border border-slate-200 px-2 py-1.5 font-bold uppercase">{t.clientName}</td>
                      <td className="border border-slate-200 px-2 py-1.5 uppercase leading-tight">{t.serviceName}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums">₱{netTotal.toLocaleString()}</td>
                      <td className="border border-slate-200 px-2 py-1.5 uppercase text-[8px]">
                        {t.paymentMethod === 'GCASH' ? 'GCASH' : (t.paymentMethod || 'CASH')} ({t.paymentStatus || 'PAID'})
                      </td>
                      <td className="border border-slate-200 px-2 py-1.5 uppercase text-[8px]">
                        {t.therapistName && <div>T: {t.therapistName} (₱{therapistComm})</div>}
                        {t.bonesetterName && <div>B: {t.bonesetterName} (₱{bonesetterComm})</div>}
                      </td>
                      <td className="border border-slate-200 px-2 py-1.5 text-right font-bold tabular-nums">₱{netRoi.toLocaleString()}</td>
                    </tr>
                );
              })}
              </tbody>
            </table>
          </div>

          {/* STAFF PERFORMANCE TABLE */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Staff Performance Matrix</h4>
            <table className="w-full border-collapse border border-slate-200 text-[10px]">
              <thead>
              <tr className="bg-slate-50 font-bold uppercase tracking-widest">
                <th className="border border-slate-200 px-3 py-2 text-left">Employee</th>
                <th className="border border-slate-200 px-3 py-2 text-center">Sessions</th>
                <th className="border border-slate-200 px-3 py-2 text-right">Base Pay</th>
                <th className="border border-slate-200 px-3 py-2 text-right">Late</th>
                <th className="border border-slate-200 px-3 py-2 text-right">OT</th>
                <th className="border border-slate-200 px-3 py-2 text-right">Advance</th>
                <th className="border border-slate-200 px-3 py-2 text-right font-black">Final Pay</th>
              </tr>
              </thead>
              <tbody>
              {Object.entries(metrics.staffSummary).map(([name, data]: [string, any]) => {
                const late = Number(data.attendance?.lateDeduction || 0);
                const ot = Number(data.attendance?.otPay || 0);
                const adv = Number(data.attendance?.cashAdvance || 0);
                const finalPay = data.commission + data.allowance + ot - late;
                const isHalfDay = data.attendance?.isHalfDay || data.attendance?.is_half_day || false;
                const isReliever = data.isReliever;
                return (
                    <tr key={name}>
                      <td className="border border-slate-200 px-3 py-2 font-bold uppercase">
                        {name}
                        {isReliever && <span className="ml-1 text-[7px] text-purple-600 font-black">(RELIEVER)</span>}
                        {isHalfDay && <span className="ml-1 text-[7px] text-amber-600 font-black">(HALF DAY)</span>}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-center tabular-nums">{data.count}</td>
                      <td className="border border-slate-200 px-3 py-2 text-right tabular-nums">₱{(data.commission + data.allowance).toLocaleString()}</td>
                      <td className="border border-slate-200 px-3 py-2 text-right tabular-nums text-rose-600">-₱{late.toLocaleString()}</td>
                      <td className="border border-slate-200 px-3 py-2 text-right tabular-nums text-emerald-600">+₱{ot.toLocaleString()}</td>
                      <td className="border border-slate-200 px-3 py-2 text-right tabular-nums text-indigo-600">₱{adv.toLocaleString()}</td>
                      <td className="border border-slate-200 px-3 py-2 text-right font-black tabular-nums">₱{finalPay.toLocaleString()}</td>
                    </tr>
                );
              })}
              </tbody>
            </table>
          </div>

          {/* OPERATIONAL EXPENSES TABLE */}
          <div className={`${exps.some(e => e.category === 'PROVISION') ? 'grid grid-cols-2 gap-8' : ''}`}>
            <div className="space-y-2">
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Operational Outflows</h4>
              <table className="w-full border-collapse border border-slate-200 text-[9px]">
                <thead>
                <tr className="bg-slate-50 font-bold uppercase tracking-widest">
                  <th className="border border-slate-200 px-2 py-1.5 text-left">Expense</th>
                  <th className="border border-slate-200 px-2 py-1.5 text-right">Amount</th>
                </tr>
                </thead>
                <tbody>
                {exps.filter(e => e.category === 'OPERATIONAL').map((e: any) => (
                    <tr key={e.id}>
                      <td className="border border-slate-200 px-2 py-1.5 font-bold uppercase">{e.name}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-right font-bold tabular-nums text-rose-600">₱{Number(e.amount || 0).toLocaleString()}</td>
                    </tr>
                ))}
                </tbody>
              </table>
            </div>

            {/* Legacy rent & bills provision — only on old reports */}
            {exps.some(e => e.category === 'PROVISION') && (
              <div className="space-y-2">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Rent & Bills</h4>
                <table className="w-full border-collapse border border-slate-200 text-[9px]">
                  <thead>
                  <tr className="bg-slate-50 font-bold uppercase tracking-widest">
                    <th className="border border-slate-200 px-2 py-1.5 text-left">Provision</th>
                    <th className="border border-slate-200 px-2 py-1.5 text-right">Amount</th>
                  </tr>
                  </thead>
                  <tbody>
                  {exps.filter(e => e.category === 'PROVISION').map((e: any) => (
                      <tr key={e.id}>
                        <td className="border border-slate-200 px-2 py-1.5 font-bold uppercase">{e.name}</td>
                        <td className="border border-slate-200 px-2 py-1.5 text-right font-bold tabular-nums text-indigo-600">₱{Number(e.amount || 0).toLocaleString()}</td>
                      </tr>
                  ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
  );
};