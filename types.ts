import { DB_COLUMNS } from './constants/db_schema';

export enum UserRole {
  SUPERADMIN = 'SUPERADMIN',
  BRANCH_MANAGER = 'BRANCH_MANAGER',
  PORTAL_USER = 'PORTAL_USER'
}

export interface PortalPermissions {
  tabs: Record<string, boolean>;
  /** undefined / absent = all branches; non-empty array = restricted to listed branch IDs */
  branchIds?: string[];
  /** true = read-only (cannot perform write actions); false = full read-write. Defaults to true. */
  readOnly?: boolean;
}

export interface PortalUser {
  id: string;
  username: string;
  displayName: string;
  loginPin: string;
  pinSalt: string;
  permissions: PortalPermissions;
  isSuperadmin: boolean;
  isActive: boolean;
  createdAt: string;
  createdBy?: string;
}

export type CommissionType = 'percentage' | 'fixed';
export type ProviderRole = 'THERAPIST' | 'BONESETTER' | 'MANAGER' | 'TRAINEE';

export interface Branch {
  id: string;
  name: string;
  pin: string;
  isPinChanged: boolean;
  isEnabled: boolean;
  isOpen: boolean;
  isOpenDate: string;
  manager?: string;
  tempManager?: string;
  services: Service[];
  weeklyCutoff: number;
  cycleStartDate: string;
  dailyProvisionAmount?: number;
  enableShiftTracking?: boolean;
  openingTime?: string;
  closingTime?: string;
  owners?: { name: string; percentage: number }[];
  groupLevy?: { name: string; percentage: number } | null;
  refreshSignal?: number | null;
  vaultEnabled?: boolean;
  cutoffHistory?: { cutoff: number; effectiveFrom: string }[];
  /** Ephemeral — only used during save to pass the effective date for a cutoff change */
  cutoffEffectiveDate?: string;
}

/**
 * Vault / Rent Fund — stored in the `branch_vaults` table (one row per branch).
 * Kept separate from Branch to avoid polluting the branches table with feature columns.
 */
export interface VaultTransaction {
  id: string;
  branchId: string;
  reportId: string | null;
  type: 'DEPOSIT' | 'ADMIN_DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  name: string | null;
  timestamp: string;
  performedBy: string | null;
  receiptImage: string | null;
  createdAt: string;
}

export interface BranchVault {
  branchId: string;
  target: number;           // accumulation target (e.g. 15000)
  balance: number;          // current balance
  initialBalance: number;   // balance recorded when vault was first enabled
  lastDepositedDate: string | null;    // guards against double-deposit on same day
  startDate: string | null;            // date vault system was enabled for this branch (YYYY-MM-DD)
}

export interface Service {
  id: string;
  name: string;
  price: number;
  duration: number;
  primaryRole?: ProviderRole;
  secondaryRole?: ProviderRole;
  commissionType: CommissionType;
  commissionValue: number;
  isDualProvider?: boolean;
  secondaryCommissionType?: CommissionType;
  secondaryCommissionValue?: number;
  catalogId?: string;
  catalogName?: string;
  canBeLoyalty?: boolean;
}

export type ExpenseCategory = 'OPERATIONAL' | 'PROVISION' | 'SETTLEMENT' | 'VAULT_WITHDRAWAL' | 'VAULT_DEPOSIT' | 'VAULT_FUND_DEPOSIT' | 'VAULT_REMITTANCE';

export interface Expense {
  id: string;
  branchId: string;
  timestamp: string;
  name: string;
  amount: number;
  category: ExpenseCategory;
  receiptImage?: string;
}

export interface Transaction {
  id: string;
  branchId: string;
  timestamp: string;
  clientName: string;
  therapistName: string;
  therapistId?: string;
  bonesetterName?: string;
  bonesetterId?: string;
  serviceId: string;
  serviceName: string;
  basePrice: number;
  discount: number;
  voucherValue: number;
  primaryCommission: number;
  secondaryCommission?: number;
  deduction?: number;
  total: number;
  note?: string;
  paymentMethod?: 'CASH' | 'GCASH';
  paymentStatus?: 'PENDING' | 'PAID' | 'FAILED';
  paymongoLinkId?: string;
}

export interface Attendance {
  id: string;
  branchId: string;
  employeeId: string;
  staffName: string;
  date: string;
  clockIn: string;
  clockOut?: string;
  status: string;
  lateDeduction: number;
  otPay: number;
  cashAdvance: number;
  createdAt: string;
  isHalfDay?: boolean;
  isPaidDaily?: boolean;
  settledUnits?: number;
}

export interface EmployeeDetails {
  dateStart?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  maritalStatus?: 'SINGLE' | 'MARRIED' | 'WIDOWED' | 'SEPARATED';
  contactNumber?: string;
  dateOfBirth?: string;
  address?: string;
  facebookLink?: string;
  gmail?: string;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactNumber?: string;
  emergencyContactAddress?: string;
}

export interface Employee {
  id: string;
  branchId: string;
  timestamp: string;
  name: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  username?: string;
  /** True if this employee has a hashed PIN stored in the DB. The hash itself is never sent to clients. */
  hasPinSet?: boolean;
  requestReset?: boolean;
  resetApproved?: boolean;
  role: string;
  allowance: number;
  salary?: number;
  isActive: boolean;
  profile?: string;
  branchAllowances?: Record<string, number | { allowance: number; role?: string; excludeFromReliever?: boolean }>;
  details?: EmployeeDetails;
}

export interface SalesReport {
  id: string;
  branchId: string;
  reportDate: string;
  submittedAt: string;
  grossSales: number;
  totalStaffPay: number;
  totalExpenses: number;
  totalVaultProvision: number;
  netRoi: number;
  sortDate?: string;
  periodEnd?: string;
  sessionData: any[];
  staffBreakdown: any[];
  expenseData: any[];
  vaultData: any[];
  isFinalized?: boolean;
  finalizedAt?: string;
  finalizedBy?: string;
  notes?: string;
}

export interface AuditLog {
  id: string;
  branchId: string;
  timestamp: string;
  activityType: 'CREATE' | 'UPDATE' | 'DELETE';
  entityType: 'TRANSACTION' | 'EXPENSE' | 'ATTENDANCE' | 'EMPLOYEE';
  entityId: string;
  description: string;
  amount?: number;
  performerName?: string;
}

export interface Request {
  id: string;
  branchId: string;
  timestamp: string;
  type: 'BACKFILL_TRANSACTION' | 'BACKFILL_ATTENDANCE' | 'BACKFILL_REPORT' | 'PASSWORD_RESET' | 'DISABLE_EMPLOYEE' | 'EMPLOYEE_REPORT';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  data: any;
  requesterId: string;
  requesterName: string;
  reviewedBy?: string;
  reviewNote?: string;
  updatedAt?: string;
}

export interface EmployeeComplaint {
  id: string;
  branchId: string;
  employeeId: string;
  employeeName: string;
  reportType: string;
  incidentDate: string;
  incidentTime?: string;
  witnesses?: string;
  description: string;
  filedById: string;
  filedByName: string;
  filedAt: string;
  status: 'PENDING' | 'ACKNOWLEDGED' | 'DISMISSED';
  actionTaken: 'NONE' | 'SUSPENDED' | 'WARNING' | 'NOTED';
  judgment?: string;
  resolution?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface BillsCatalogItem {
  id: string;
  name: string;
  category: 'MONTHLY' | 'AS_NEEDED';
  dueDay?: number;
  suggestedAmount: number;
  notes?: string;
  isActive: boolean;
  createdBy?: string;
  createdAt: string;
}

export interface BranchBill {
  id: string;
  branchId: string;
  catalogId?: string;  // set when assigned from a bills_catalog template
  name: string;
  category: 'MONTHLY' | 'AS_NEEDED';
  amount: number;
  dueDay?: number;
  dueNextMonth?: boolean;  // if true, due_day refers to the 1st of the following month (e.g. April bill due May 1)
  isActive: boolean;
  notes?: string;
  createdAt: string;
}

export interface BillPayment {
  id: string;
  branchId: string;
  billId: string;
  periodCovered: string;  // 'YYYY-MM'
  amountPaid: number;
  paidAt: string;
  notes?: string;
  receiptImage?: string;
  recordedBy?: string;
  createdAt: string;
}

export type BillStatus = 'PAID' | 'OVERDUE' | 'DUE_SOON' | 'UPCOMING' | 'AS_NEEDED';


export interface AuthState {
  user: {
    role: UserRole;
    branchId?: string;
    employeeId?: string;
    username?: string;
    lastActive: number;
    loginPin?: string;
    sessionStart: number;
    permissions?: PortalPermissions;
  } | null;
}