import { useMemo } from 'react';
import { Branch, Transaction, Expense, Attendance, Employee, SalesReport, BranchVault, VaultTransaction } from '../../../types';
import { getEmployeeRole, getEmployeeAllowance } from '../../../lib/payroll';
import { toManilaDateStr } from '../../../lib/time';

interface UseTodayDataParams {
  branch: Branch;
  currentTime: Date;
  transactions: Transaction[];
  expenses: Expense[];
  attendance: Attendance[];
  employees: Employee[];
  branchEmployees: Employee[];
  salesReports: SalesReport[];
  branchVault?: BranchVault | null;
  hiddenStaffNames: Set<string>;
  vaultTransactions?: VaultTransaction[];
}

export function useTodayData({
  branch,
  currentTime,
  transactions,
  expenses,
  attendance,
  employees,
  branchEmployees,
  salesReports,
  branchVault,
  hiddenStaffNames,
  vaultTransactions,
}: UseTodayDataParams) {
  const todayStr = useMemo(() =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(currentTime),
  [currentTime]);

  const todayTxs = useMemo(() =>
    transactions
      .filter(t => t.branchId === branch.id && toManilaDateStr(t.timestamp) === todayStr)
      .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || '')),
  [transactions, branch.id, todayStr]);

  const todayExps = useMemo(() =>
    expenses
      .filter(e => e.branchId === branch.id && toManilaDateStr(e.timestamp) === todayStr)
      .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || '')),
  [expenses, branch.id, todayStr]);

  const todayAtt = useMemo(() =>
    attendance.filter(a => a.branchId === branch.id && a.date === todayStr),
  [attendance, branch.id, todayStr]);

  const todayReportExists = useMemo(() =>
    salesReports.some(r => r.branchId === branch.id && r.reportDate === todayStr),
  [salesReports, branch.id, todayStr]);

  const staffSummary = useMemo(() => {
    const summary: Record<string, any> = {};

    // 1. Initialize with branch employees
    branchEmployees.forEach(emp => {
      const nameUpper = (emp.name || '').toUpperCase();
      const hasAttendance = todayAtt.some(a => a.employeeId === emp.id);
      const hasTransactions = todayTxs.some(t =>
        t.therapistName?.toUpperCase() === nameUpper || t.bonesetterName?.toUpperCase() === nameUpper
      );
      if ((hasAttendance || hasTransactions) && !hiddenStaffNames.has(nameUpper)) {
        summary[emp.id] = {
          employeeId: emp.id,
          name: nameUpper,
          staffName: nameUpper,
          count: 0,
          commission: 0,
          baseAllowance: getEmployeeAllowance(emp, branch.id),
          allowance: getEmployeeAllowance(emp, branch.id),
          attendance: null,
          txs: [],
        };
      }
    });

    // 2. Add relievers found in transactions or attendance
    const allActiveEmpIds = new Set([
      ...todayAtt.map(a => a.employeeId),
      ...todayTxs.flatMap(t => [t.therapistId, t.bonesetterId]).filter(Boolean),
    ]);
    allActiveEmpIds.forEach(empId => {
      if (!summary[empId]) {
        const emp = employees.find(e => e.id === empId);
        if (emp) {
          const nameUpper = (emp.name || '').toUpperCase();
          if (!hiddenStaffNames.has(nameUpper)) {
            summary[empId] = {
              employeeId: emp.id,
              name: nameUpper,
              staffName: nameUpper,
              count: 0,
              commission: 0,
              baseAllowance: getEmployeeAllowance(emp, branch.id),
              allowance: getEmployeeAllowance(emp, branch.id),
              attendance: null,
            };
          }
        }
      }
    });

    // 3. Populate counts and commissions
    todayTxs.forEach(t => {
      [
        { id: t.therapistId, name: t.therapistName, comm: t.primaryCommission },
        { id: t.bonesetterId, name: t.bonesetterName, comm: t.secondaryCommission },
      ].forEach((staff, idx) => {
        if (!staff.id && !staff.name) return;
        let item = staff.id ? summary[staff.id] : null;
        if (!item && staff.name) {
          const n = staff.name.trim().toUpperCase();
          item = Object.values(summary).find((s: any) => s.name === n);
        }
        if (item) {
          if (idx === 0 || (staff.name?.trim().toUpperCase() !== t.therapistName?.trim().toUpperCase())) {
            item.count += 1;
          }
          item.commission += (Number(staff.comm) || 0);
        }
      });
    });

    // 4. Attach attendance
    todayAtt.forEach(att => {
      if (att.employeeId && summary[att.employeeId]) {
        summary[att.employeeId].attendance = att;
      } else {
        const sName = att.staffName.toUpperCase();
        const item = Object.values(summary).find((s: any) => s.name === sName);
        if (item) item.attendance = att;
      }
    });

    // 5. Finalize roles and allowances
    Object.values(summary).forEach((item: any) => {
      const emp = employees.find(e => e.id === item.employeeId);
      if (!emp) return;
      const role = getEmployeeRole(emp, branch.id);
      const isThisBranchManager = branch.manager?.toUpperCase() === emp.name?.trim().toUpperCase();
      const isThisBranchTempManager = branch.tempManager?.toUpperCase() === emp.name?.trim().toUpperCase();
      item.isReliever = emp.branchId !== branch.id && !isThisBranchManager && !isThisBranchTempManager;
      item.role = role;
      const att = item.attendance;
      if (att) {
        let finalAllowance = item.baseAllowance;
        if (att.isHalfDay === true || att.is_half_day === true) finalAllowance /= 2;
        item.allowance = finalAllowance;
      }
    });

    return summary;
  }, [todayTxs, todayAtt, branchEmployees, hiddenStaffNames, branch.id, employees]);

  const totals = useMemo(() => {
    const gross = todayTxs.reduce((s, t) => s + (Number(t.total) || 0), 0);

    const getStaffItem = (id?: string, name?: string) => {
      if (id && staffSummary[id]) return staffSummary[id];
      if (name) {
        const n = name.trim().toUpperCase();
        return Object.values(staffSummary).find((item: any) => item.name === n);
      }
      return null;
    };

    const regularStaffPay = todayTxs.reduce((s, t) => {
      const therapistItem = getStaffItem(t.therapistId, t.therapistName);
      const bonesetterItem = getStaffItem(t.bonesetterId, t.bonesetterName);
      let pay = 0;
      if (therapistItem && !therapistItem.isReliever) pay += (Number(t.primaryCommission) || 0);
      if (bonesetterItem && !bonesetterItem.isReliever) pay += (Number(t.secondaryCommission) || 0);
      return s + pay;
    }, 0);

    const relieverPay = Object.values(staffSummary)
      .filter((item: any) => item.isReliever)
      .reduce((sum: any, item: any) => {
        const att = item.attendance;
        const late = Number(att?.lateDeduction || 0);
        const ot = Number(att?.otPay || 0);
        return sum + (item.commission + item.allowance + ot - late);
      }, 0);

    const nonRelieverOperationalExp = todayExps
      .filter(e => e.category === 'OPERATIONAL' && !e.name?.startsWith('RELIEVER PAYOUT:'))
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const operationalExp = nonRelieverOperationalExp + relieverPay;

    const totalAllowances = Object.values(staffSummary)
      .filter((item: any) => !item.isReliever)
      .reduce((sum: any, item: any) => sum + (Number(item.allowance) || 0), 0);

    // Use all non-reliever staff attendance (not just home-branch) so that temp managers'
    // OT and late deductions are included — home-branch filter previously excluded them.
    const regularStaffItems = Object.values(staffSummary).filter((item: any) => !item.isReliever);
    const lateDeductions = regularStaffItems.reduce((s, item: any) => {
      const att = item.attendance;
      return s + (Number(att?.lateDeduction || att?.late_deduction) || 0);
    }, 0);
    const otAdditions = regularStaffItems.reduce((s, item: any) => {
      const att = item.attendance;
      return s + (Number(att?.otPay || att?.ot_pay) || 0);
    }, 0);
    const totalCashAdvances = regularStaffItems.reduce((s, item: any) => {
      const att = item.attendance;
      return s + (Number(att?.cashAdvance || att?.cash_advance) || 0);
    }, 0);
    const totalStaffLiability = regularStaffPay + totalAllowances + otAdditions - lateDeductions;

    const vault = branchVault ?? null;
    const isVaultActive = (branch.vaultEnabled ?? false) && vault !== null && vault.target > 0;
    const vaultWithdrawal = (vaultTransactions ?? [])
      .filter(t => t.branchId === branch.id && t.type === 'WITHDRAWAL' && toManilaDateStr(t.timestamp) === todayStr)
      .reduce((s, t) => s + t.amount, 0);
    const vaultDeposit = (vaultTransactions ?? [])
      .filter(t => t.branchId === branch.id && t.type === 'DEPOSIT' && toManilaDateStr(t.timestamp) === todayStr)
      .reduce((s, t) => s + t.amount, 0);
    const provisionExp = todayExps
      .filter(e => e.category === 'PROVISION')
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);

    // VAULT_WITHDRAWAL expenses are the authoritative source for vault-covered costs.
    // Using vault_transactions for this was fragile: if the vault_transaction INSERT
    // failed (e.g. constraint error), the credit was lost even though the VAULT_WITHDRAWAL
    // expense and vault balance deduction had already succeeded — causing negative net_roi.
    // VAULT_WITHDRAWAL expenses are only ever created by QuickExpenseModal when the vault
    // covers an expense; direct vault withdrawals (rent, bills via BranchVaultSection)
    // do NOT create VAULT_WITHDRAWAL expense records, so there is no double-credit risk.
    const effectiveVaultCredit = todayExps
      .filter(e => e.category === 'VAULT_WITHDRAWAL')
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const rawNet = gross - operationalExp + effectiveVaultCredit - provisionExp - (isVaultActive ? vaultDeposit : 0) - totalStaffLiability;
    const net = rawNet;

    return {
      gross,
      totalStaffLiability,
      totalCashAdvances,
      operationalExp,
      vaultWithdrawal,
      provisionExp,
      isVaultActive,
      net,
    };
  }, [todayTxs, todayExps, todayAtt, staffSummary, branchEmployees, branch.id, branch.vaultEnabled, branchVault, vaultTransactions, todayStr]);

  return { todayStr, todayTxs, todayExps, todayAtt, todayReportExists, staffSummary, totals };
}
