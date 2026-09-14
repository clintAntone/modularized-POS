import { useMemo } from 'react';
import { Branch, Transaction, Expense, AuditLog, SalesReport, Employee, Attendance, PortalPermissions } from '../../../types';

interface UseScopedDataParams {
  isPortalUser: boolean;
  permissions?: PortalPermissions;
  branches: Branch[];
  salesReports: SalesReport[];
  transactions: Transaction[];
  expenses: Expense[];
  employees: Employee[];
  attendance: Attendance[];
  auditLogs: AuditLog[];
  requests: any[];
}

export function useScopedData({
  isPortalUser,
  permissions,
  branches,
  salesReports,
  transactions,
  expenses,
  employees,
  attendance,
  auditLogs,
  requests,
}: UseScopedDataParams) {
  const allowedBranchIds = useMemo<string[] | null>(() => {
    if (!isPortalUser || !permissions) return null;
    const ids = permissions.branchIds;
    if (!ids || ids.length === 0) return [];
    return ids;
  }, [isPortalUser, permissions]);

  const scopedBranches = useMemo(() =>
    allowedBranchIds ? branches.filter(b => allowedBranchIds.includes(b.id)) : branches,
  [branches, allowedBranchIds]);

  const scopedSalesReports = useMemo(() =>
    allowedBranchIds ? salesReports.filter(r => allowedBranchIds.includes(r.branchId)) : salesReports,
  [salesReports, allowedBranchIds]);

  const scopedTransactions = useMemo(() =>
    allowedBranchIds ? transactions.filter(t => allowedBranchIds.includes(t.branchId)) : transactions,
  [transactions, allowedBranchIds]);

  const scopedExpenses = useMemo(() =>
    allowedBranchIds ? expenses.filter(e => allowedBranchIds.includes(e.branchId)) : expenses,
  [expenses, allowedBranchIds]);

  const scopedEmployees = useMemo(() =>
    allowedBranchIds ? employees.filter(e => allowedBranchIds.includes(e.branchId)) : employees,
  [employees, allowedBranchIds]);

  const scopedAttendance = useMemo(() =>
    allowedBranchIds ? attendance.filter(a => allowedBranchIds.includes(a.branchId)) : attendance,
  [attendance, allowedBranchIds]);

  const scopedAuditLogs = useMemo(() =>
    allowedBranchIds ? auditLogs.filter(l => allowedBranchIds.includes(l.branchId)) : auditLogs,
  [auditLogs, allowedBranchIds]);

  const scopedRequests = useMemo(() =>
    allowedBranchIds ? requests.filter((r: any) => allowedBranchIds.includes(r.branchId)) : requests,
  [requests, allowedBranchIds]);

  return {
    allowedBranchIds,
    scopedBranches,
    scopedSalesReports,
    scopedTransactions,
    scopedExpenses,
    scopedEmployees,
    scopedAttendance,
    scopedAuditLogs,
    scopedRequests,
  };
}
