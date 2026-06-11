import { Employee } from '../types';

// PWD / Senior discount thresholds
export const PWD_BASE_THRESHOLD = 900;
export const PWD_DISCOUNT_HIGH = 100;
export const PWD_DISCOUNT_LOW = 50;

/**
 * MAINFRAME PAYROLL UTILITIES
 * 
 * STRATEGY: We are transitioning to a branch-centric data model where 'branch_allowances' 
 * is the source of truth for role and allowance per location.
 * 
 * The flat 'role' and 'allowance' columns in the employees table are maintained 
 * as 'Primary Branch' caches for backward compatibility but should be avoided 
 * in favor of these utilities.
 */

/**
 * Calculates the correct daily allowance for an employee at a specific branch.
 * Source of Truth: branch_allowances[branchId]
 * Fallback: base allowance column (Primary Branch Cache)
 */
export const getEmployeeAllowance = (employee: Employee, branchId: string): number => {
  if (!employee) return 0;

  // 1. Check for branch-specific override (Source of Truth)
  const allowance = employee.branchAllowances?.[branchId];
  if (allowance !== undefined) {
    if (typeof allowance === 'object' && allowance !== null) {
      return Number(allowance.allowance) || 0;
    }
    return Number(allowance) || 0;
  }
  
  // 2. Fallback to base allowance (Primary Branch Cache)
  const baseAllowance = employee.allowance;
  if (typeof baseAllowance === 'object' && baseAllowance !== null) {
    return Number((baseAllowance as any).allowance) || 0;
  }
  return Number(baseAllowance) || 0;
};

/**
 * Retrieves the correct role for an employee at a specific branch.
 * Source of Truth: branch_allowances[branchId].role
 * Fallback: base role column (Primary Branch Cache)
 */
export const getEmployeeRole = (employee: Employee, branchId: string): string => {
  if (!employee) return '';

  // 1. Check for branch-specific override (Source of Truth)
  const config = employee.branchAllowances?.[branchId];
  if (config !== undefined && typeof config === 'object' && config !== null && config.role) {
    return config.role;
  }

  // 2. Fallback to base role (Primary Branch Cache)
  return employee.role || '';
};

/**
 * Generates initials from a name (e.g., "John Doe" -> "JD").
 */
export const getInitials = (name: string): string => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

/**
 * Resolves an employee's name even if they have been deleted from the primary registry.
 * It searches through current employees, then historical attendance, then transactions.
 */
export const resolveEmployeeName = (
  empId: string,
  employees: Employee[],
  attendance: any[] = [],
  transactions: any[] = [],
  salesReports: any[] = [],
  fallbackName?: string
): string => {
  // 1. Check current employees
  const emp = employees.find(e => e.id === empId);
  if (emp) return emp.name;

  // 2. Check provided fallback (from report)
  if (fallbackName && fallbackName !== 'Unknown Staff' && fallbackName.toUpperCase() !== 'UNKNOWN STAFF') return fallbackName;

  // 3. Search historical attendance (usually has staffName)
  const att = attendance.find(a => a.employeeId === empId);
  if (att?.staffName) return att.staffName;

  // 4. Search historical transactions
  const tx = transactions.find(t => t.therapistId === empId || t.bonesetterId === empId);
  if (tx) {
    if (tx.therapistId === empId) return tx.therapistName;
    if (tx.bonesetterId === empId) return tx.bonesetterName || '';
  }

  // 5. Search other sales reports breakdowns
  for (const report of salesReports) {
    const breakdown = report.staffBreakdown || [];
    const entry = breakdown.find((b: any) => b.employeeId === empId);
    if (entry) {
      const entryName = (entry.staffName || entry.name || '').trim();
      if (entryName && entryName.toUpperCase() !== 'UNKNOWN STAFF') {
        return entryName;
      }
    }
  }

  return fallbackName || 'Unknown Staff';
};
