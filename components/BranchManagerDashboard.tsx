import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Branch, Transaction, Expense, Employee, SalesReport, AuditLog, Attendance, AuthState, UserRole } from '../types';
import { DB_TABLES, DB_COLUMNS } from '../constants/db_schema';
import { UI_THEME } from '../constants/ui_designs';
import { useBranchData } from './dashboard/hooks/useBranchData';
import { POSSection } from './dashboard/sections/POSSection';
import { ExpensesSection } from './dashboard/sections/ExpensesSection';
import { ExpensesManagerSection } from './dashboard/sections/ExpensesManagerSection';
import { MonthlyExpenseSection } from './dashboard/sections/MonthlyExpenseSection';
import { MonthlyBillsSection } from './dashboard/sections/MonthlyBillsSection';
import { ExpenseLedgerSection } from './dashboard/sections/ExpenseLedgerSection';
import { PayrollSection } from './dashboard/sections/PayrollSection';
import { SalesTodaySection } from './dashboard/sections/SalesTodaySection';
import { StaffDirectorySection } from './dashboard/sections/StaffDirectorySection';
import { ReportsMasterSection } from './dashboard/sections/ReportsMasterSection';
import { SettingsSection } from './dashboard/sections/SettingsSection';
import { BackfillRequestSection } from './dashboard/sections/BackfillRequestSection';
import { HowToSection } from './dashboard/sections/HowToSection';
import { DeveloperSection } from './dashboard/sections/DeveloperSection';
import { ClientHistorySection } from './dashboard/sections/ClientHistorySection';
import { RemittanceSection } from './dashboard/sections/RemittanceSection';
import { BranchNavbar } from './navigation/BranchNavbar';
import { resumeAudioContext, playSound } from '../lib/audio';
import { getEmployeeRole, getEmployeeAllowance } from '../lib/payroll';
import { syncRelieverPayouts } from '@/src/services/relieverPayoutService';
import { supabase } from '../lib/supabase';
import { getTrueDate, formatManilaDate, formatManilaTime, isTimeSynced, toManilaDateStr } from '../lib/time';
import { 
  AlertCircle, 
  Clock, 
  Store, 
  Zap, 
  ChevronRight, 
  Lock
} from 'lucide-react';

interface BranchManagerDashboardProps {
  user: Exclude<AuthState['user'], null>;
  branch: Branch;
  isRelief: boolean;
  branches: Branch[];
  transactions: Transaction[];
  expenses: Expense[];
  attendance: Attendance[];
  employees: Employee[];
  salesReports: SalesReport[];
  auditLogs: AuditLog[];
  autoRefreshTime: string;
  isPaymongoEnabled?: boolean;
  loading?: boolean;
  connStatus?: 'connecting' | 'connected' | 'error' | 'offline';
  pendingSyncCount?: number;
  onRefresh?: (quiet?: boolean) => void;
  onSwitchBranch?: (branchId: string) => void;
  onSyncStatusChange?: (isSyncing: boolean) => void;
}

export type TabID = 'pos' | 'sales' | 'staff' | 'clients' | 'expenses_hub' | 'monthly_bills' | 'expense_reports' | 'salaries' | 'sales_reports' | 'remittance' | 'settings' | 'how_to' | 'backfill';

const BranchManagerDashboard: React.FC<BranchManagerDashboardProps> = (props) => {
  const [currentTime, setCurrentTime] = useState(getTrueDate());
  const [autoSyncStatus, setAutoSyncStatus] = useState<'synced' | 'saving' | 'error'>('synced');
  const [showStatusEnforcer, setShowStatusEnforcer] = useState(!props.branch.isOpen);
  const [showToggleConfirm, setShowToggleConfirm] = useState(false);
  const [showClosingWarning, setShowClosingWarning] = useState(false);
  const [hasDismissedWarning, setHasDismissedWarning] = useState(false);
  const [showRemittanceOpenReminder, setShowRemittanceOpenReminder] = useState(false);
  const [showRemittanceCloseReminder, setShowRemittanceCloseReminder] = useState(false);
  const [showRemittanceFollowUpReminder, setShowRemittanceFollowUpReminder] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [isSwitchingOpen, setIsSwitchingOpen] = useState(false);
  const lastSyncTimeRef = useRef<string>(new Date().toISOString());
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentEmployee = useMemo(() => 
    props.user.employeeId ? props.employees.find(e => e.id === props.user.employeeId) : null
  , [props.user.employeeId, props.employees]);

  const branchEmployees = useMemo(() => {
    return props.employees.filter(e => {
      const isHomeBranch = e.branchId === props.branch.id;
      const isAuthorized = e.branchAllowances && typeof e.branchAllowances === 'object' && props.branch.id in (e.branchAllowances as any);
      const isDesignatedManager = props.branch.manager?.toUpperCase() === (e.name || '').toUpperCase();
      const isTempManager = props.branch.tempManager?.toUpperCase() === (e.name || '').toUpperCase();
      
      // Check if they have MANAGER role in branchAllowances for THIS branch
      const allowance = e.branchAllowances?.[props.branch.id];
      const hasManagerRole = allowance && typeof allowance === 'object' && allowance.role?.includes('MANAGER');
      
      return isHomeBranch || isAuthorized || isDesignatedManager || isTempManager || hasManagerRole;
    });
  }, [props.employees, props.branch.id, props.branch.manager, props.branch.tempManager]);

  const isSetupRequired = useMemo(() => {
    return !branchEmployees.some(e => {
        const role = getEmployeeRole(e, props.branch.id);
        return role.includes('THERAPIST') || role.includes('BONESETTER');
    });
  }, [branchEmployees, props.branch.id]);

  const [activeTab, setActiveTab] = useState<TabID>('pos');
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [pendingSwitchBranchId, setPendingSwitchBranchId] = useState<string | null>(null);
  const [unlockPin, setUnlockPin] = useState('');
  const [unlockError, setUnlockError] = useState('');

  const [hasBills, setHasBills] = useState<boolean | null>(null);
  const [showBillsGuide, setShowBillsGuide] = useState(false);
  const [highlightDeposit, setHighlightDeposit] = useState(false);

  useEffect(() => {
    if (props.isRelief) return;
    supabase
      .from(DB_TABLES.BRANCH_BILLS)
      .select('id', { count: 'exact', head: true })
      .eq(DB_COLUMNS.BRANCH_ID, props.branch.id)
      .eq(DB_COLUMNS.IS_ACTIVE, true)
      .then(({ count }) => {
        const none = (count ?? 0) === 0;
        setHasBills(!none);
        if (none) setShowBillsGuide(true);
      });
  }, [props.branch.id, props.isRelief]);

  const [hiddenStaffNames, setHiddenStaffNames] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(`hidden_staff_${props.branch.id}`);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  const { yearlyCycles } = useBranchData(props.branch, props.transactions, props.expenses);

  const [unsettledPayrollCount, setUnsettledPayrollCount] = useState(0);

  useEffect(() => {
    const checkUnsettled = async () => {
      try {
        const { data } = await supabase
          .from('payroll')
          .select('settlement, status')
          .eq('branch_id', props.branch.id);

        const settledDates = new Set(
          (data || []).filter(r => r.status === 'settled').map(r => r.settlement)
        );

        const toDateStr = (d: Date) => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        };

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const count = yearlyCycles.filter(c => {
          if (c.isFuture) return false;
          const endDate = new Date(c.endDate);
          endDate.setHours(23, 59, 59, 999);
          if (endDate >= todayStart) return false; // skip current/future cycles
          return !settledDates.has(toDateStr(new Date(c.startDate)));
        }).length;

        setUnsettledPayrollCount(count);
      } catch { /* non-critical */ }
    };

    if (yearlyCycles.length > 0) checkUnsettled();
  }, [yearlyCycles, props.branch.id]);

  const managedNodes = useMemo(() => {
    const empName = currentEmployee?.name?.toUpperCase() || props.user.username?.toUpperCase();
    if (!empName) return [];

    return props.branches.filter(b => {
      if (b.id === props.branch.id) return false;
      if (!b.isEnabled) return false;

      const isPrimaryManager = b.manager?.toUpperCase() === empName;
      const isTempManager = b.tempManager?.toUpperCase() === empName;

      return isPrimaryManager || isTempManager;
    });
  }, [props.branches, props.branch.id, props.isRelief, currentEmployee, props.user.username]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (isSwitchingOpen && dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsSwitchingOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isSwitchingOpen]);

  // Reset prevTotalsRef when tab becomes visible so auto-save re-evaluates with current data
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        prevTotalsRef.current = '';
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Synchronize enforcer visibility with data
  useEffect(() => {
    if (props.branch.isOpen) {
      setShowStatusEnforcer(false);
    } else {
      setShowStatusEnforcer(true);
    }
  }, [props.branch.isOpen]);

  // MAINTENANCE SENTINEL
  useEffect(() => {
    const checkMaintenanceWindow = () => {
      if (!props.branch.isOpen) return;

      const now = getTrueDate();
      const manilaToday = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(now);

      const manilaHHMM = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false
      }).format(now);

      const [currH, currM] = manilaHHMM.split(':').map(Number);
      const [refH, refM] = props.autoRefreshTime.split(':').map(Number);

      const isPastThreshold = (currH > refH) || (currH === refH && currM >= refM);
      const isStaleNode = props.branch.isOpenDate && props.branch.isOpenDate < manilaToday;

      if (isPastThreshold && isStaleNode) {
        props.onRefresh?.(true);
      }
    };

    const sentinelInterval = setInterval(checkMaintenanceWindow, 60000);
    return () => clearInterval(sentinelInterval);
  }, [props.branch.isOpen, props.branch.isOpenDate, props.autoRefreshTime, props.onRefresh]);

  useEffect(() => {
    const checkClosingTime = () => {
      if (!props.branch.isOpen || !props.branch.closingTime || hasDismissedWarning) return;

      const now = getTrueDate();
      const [closeH, closeM] = props.branch.closingTime.split(':').map(Number);

      const closingDate = getTrueDate();
      closingDate.setHours(closeH, closeM, 0, 0);

      const diffMs = closingDate.getTime() - now.getTime();
      const diffMins = diffMs / (1000 * 60);

      if (diffMins > 0 && diffMins <= 15) {
        setShowClosingWarning(true);
        playSound('warning');
      }
    };

    const timer = setInterval(() => {
      setCurrentTime(getTrueDate());
      checkClosingTime();
    }, 1000);
    return () => clearInterval(timer);
  }, [props.branch.isOpen, props.branch.closingTime, hasDismissedWarning]);

  // REMITTANCE REMINDER: cutoff day (open + 1h before close) + follow-up next day if not submitted
  useEffect(() => {
    if (!props.branch.isOpen) {
      setShowRemittanceOpenReminder(false);
      setShowRemittanceCloseReminder(false);
      setShowRemittanceFollowUpReminder(false);
      return;
    }

    const now = getTrueDate();
    const manilaDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(now);
    const manilaDOW = new Date(manilaDateStr + 'T12:00:00').getDay();
    const cutoff = Number(props.branch.weeklyCutoff);
    const isCutoffDay = manilaDOW === cutoff;
    const isFollowUpDay = manilaDOW === (cutoff + 1) % 7;

    // ── Cutoff day reminders ──
    if (isCutoffDay) {
      setShowRemittanceFollowUpReminder(false);
      const openKey = `remittance_open_reminded_${manilaDateStr}`;
      if (!localStorage.getItem(openKey)) setShowRemittanceOpenReminder(true);

      if (props.branch.closingTime) {
        const [closeH, closeM] = props.branch.closingTime.split(':').map(Number);
        const closingDate = getTrueDate();
        closingDate.setHours(closeH, closeM, 0, 0);
        const diffMins = (closingDate.getTime() - now.getTime()) / 60000;
        const closeKey = `remittance_close_reminded_${manilaDateStr}`;
        if (diffMins > 0 && diffMins <= 60 && !localStorage.getItem(closeKey)) {
          setShowRemittanceCloseReminder(true);
        }
      }
      return;
    }

    // ── Day-after follow-up: only if remittance not yet submitted ──
    if (isFollowUpDay) {
      setShowRemittanceOpenReminder(false);
      setShowRemittanceCloseReminder(false);
      const submittedLabel = localStorage.getItem(`remittance_submitted_${props.branch.id}`);
      const followUpKey = `remittance_followup_reminded_${manilaDateStr}`;
      // Determine the cutoff period label we'd expect — if submitted label exists, skip
      if (!submittedLabel && !localStorage.getItem(followUpKey)) {
        setShowRemittanceFollowUpReminder(true);
      }
      return;
    }

    setShowRemittanceOpenReminder(false);
    setShowRemittanceCloseReminder(false);
    setShowRemittanceFollowUpReminder(false);
  }, [currentTime, props.branch.isOpen, props.branch.weeklyCutoff, props.branch.closingTime, props.branch.id]);

  const changeTab = (tabId: TabID) => {
    resumeAudioContext();
    if (tabId !== activeTab) {
      if (tabId !== 'pos') {
        window.history.pushState({ tab: tabId }, '');
      }
      setActiveTab(tabId);
      if (['salaries', 'reports_master', 'sales'].includes(tabId)) {
        props.onRefresh?.(true);
      }
    }
  };

  const todayStr = useMemo(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(currentTime), [currentTime]);

  const todayTxs = useMemo(() => props.transactions.filter(t => t.branchId === props.branch.id && toManilaDateStr(t.timestamp) === todayStr).sort((a,b) => (b.timestamp || '').localeCompare(a.timestamp || '')), [props.transactions, props.branch.id, todayStr]);
  const todayExps = useMemo(() => props.expenses.filter(e => e.branchId === props.branch.id && toManilaDateStr(e.timestamp) === todayStr).sort((a,b) => (b.timestamp || '').localeCompare(a.timestamp || '')), [props.expenses, props.branch.id, todayStr]);
  const todayAtt = useMemo(() => props.attendance.filter(a => a.branchId === props.branch.id && a.date === todayStr), [props.attendance, props.branch.id, todayStr]);

  const staffSummary = useMemo(() => {
    const summary: Record<string, any> = {};

    // 1. Initialize with branch employees
    branchEmployees.forEach(emp => {
      const nameUpper = (emp.name || '').toUpperCase();
      const hasAttendance = todayAtt.some(a => a.employeeId === emp.id);
      const hasTransactions = todayTxs.some(t => t.therapistName?.toUpperCase() === nameUpper || t.bonesetterName?.toUpperCase() === nameUpper);

      const isActiveToday = hasAttendance || hasTransactions;

      if (isActiveToday && !hiddenStaffNames.has(nameUpper)) {
        summary[emp.id] = {
          employeeId: emp.id,
          name: nameUpper,
          staffName: nameUpper,
          count: 0,
          commission: 0,
          baseAllowance: getEmployeeAllowance(emp, props.branch.id),
          allowance: getEmployeeAllowance(emp, props.branch.id),
          attendance: null,
          txs: []
        };
      }
    });

    // 2. Add relievers found in transactions or attendance
    const allActiveEmpIds = new Set([
      ...todayAtt.map(a => a.employeeId),
      ...todayTxs.flatMap(t => [t.therapistId, t.bonesetterId]).filter(Boolean)
    ]);

    allActiveEmpIds.forEach(empId => {
      if (!summary[empId]) {
        const emp = props.employees.find(e => e.id === empId);
        if (emp) {
          const nameUpper = (emp.name || '').toUpperCase();
          if (!hiddenStaffNames.has(nameUpper)) {
            summary[empId] = {
              employeeId: emp.id,
              name: nameUpper,
              staffName: nameUpper,
              count: 0,
              commission: 0,
              baseAllowance: getEmployeeAllowance(emp, props.branch.id),
              allowance: getEmployeeAllowance(emp, props.branch.id),
              attendance: null
            };
          }
        }
      }
    });

    // 3. Populate counts and commissions
    todayTxs.forEach(t => {
      [
        { id: t.therapistId, name: t.therapistName, comm: t.primaryCommission },
        { id: t.bonesetterId, name: t.bonesetterName, comm: t.secondaryCommission }
      ].forEach((staff, idx) => {
        if (!staff.id && !staff.name) return;
        
        // Try to find by ID first, then by name
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
      const emp = props.employees.find(e => e.id === item.employeeId);
      if (!emp) return;
      
      const role = getEmployeeRole(emp, props.branch.id);
      item.isReliever = emp.branchId !== props.branch.id && !role.includes('MANAGER');
      item.role = role;

      const att = item.attendance;
      if (att) {
        let finalAllowance = item.baseAllowance;
        if (att.isHalfDay === true || att.is_half_day === true) finalAllowance /= 2;
        item.allowance = finalAllowance;
      }
    });

    return summary;
  }, [todayTxs, todayAtt, branchEmployees, hiddenStaffNames, props.branch.id]);

  const totals = useMemo(() => {
    const gross = todayTxs.reduce((s, t) => s + (Number(t.total) || 0), 0);
    
    const regularStaffPay = todayTxs.reduce((s, t) => {
      const getStaffItem = (id?: string, name?: string) => {
        if (id && staffSummary[id]) return staffSummary[id];
        if (name) {
          const n = name.trim().toUpperCase();
          return Object.values(staffSummary).find((item: any) => item.name === n);
        }
        return null;
      };

      const therapistItem = getStaffItem(t.therapistId, t.therapistName);
      const bonesetterItem = getStaffItem(t.bonesetterId, t.bonesetterName);
      
      let pay = 0;
      if (therapistItem && !therapistItem.isReliever) pay += (Number(t.primaryCommission) || 0);
      if (bonesetterItem && !bonesetterItem.isReliever) pay += (Number(t.secondaryCommission) || 0);
      return s + pay;
    }, 0);

    const relieverPay = Object.values(staffSummary).filter((item: any) => item.isReliever).reduce((sum: any, item: any) => {
      const att = item.attendance;
      const late = Number(att?.lateDeduction || 0);
      const ot = Number(att?.otPay || 0);
      return sum + (item.commission + item.allowance + ot - late);
    }, 0);

    // Exclude RELIEVER PAYOUT expenses from the DB sum — they're already counted via relieverPay (live calculation).
    // This prevents double-counting once syncRelieverPayouts creates the DB expense.
    const nonRelieverOperationalExp = todayExps.filter(e => e.category === 'OPERATIONAL' && !e.name?.startsWith('RELIEVER PAYOUT:')).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const operationalExp = nonRelieverOperationalExp + relieverPay;
    const provisionExp = todayExps.filter(e => e.category === 'PROVISION').reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const totalAllowances = Object.values(staffSummary).filter((item: any) => !item.isReliever).reduce((sum: any, item: any) => sum + (Number(item.allowance) || 0), 0);

    const regularAttendance = todayAtt.filter(a => {
      const emp = branchEmployees.find(e => e.id === a.employeeId);
      return emp && emp.branchId === props.branch.id;
    });

    const lateDeductions = regularAttendance.reduce((s, a) => s + (Number(a.lateDeduction) || 0), 0);
    const otAdditions = regularAttendance.reduce((s, a) => s + (Number(a.otPay) || 0), 0);
    const totalCashAdvances = regularAttendance.reduce((s, a) => s + (Number(a.cashAdvance) || 0), 0);

    const totalStaffLiability = regularStaffPay + totalAllowances + otAdditions - lateDeductions;

    return {
      gross,
      totalStaffLiability,
      totalCashAdvances,
      operationalExp,
      provisionExp,
      net: gross - operationalExp - provisionExp - totalStaffLiability
    };
  }, [todayTxs, todayExps, todayAtt, staffSummary, branchEmployees, props.branch.id]);

  const prevTotalsRef = useRef<string>('');

  useEffect(() => {
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);

    // Don't save while data is still loading — avoids overwriting the report with zeros on mount
    if (props.loading) {
      return;
    }

    // Only auto-save from the active/visible tab — prevents multiple open tabs from overwriting each other
    if (document.hidden) {
      return;
    }

    // Check if totals actually changed to avoid redundant writes
    const currentTotalsStr = JSON.stringify({ totals, todayTxsCount: todayTxs.length, todayExpsCount: todayExps.length, todayAttCount: todayAtt.length });
    if (currentTotalsStr === prevTotalsRef.current) {
      setAutoSyncStatus('synced');
      return;
    }

    setAutoSyncStatus('saving');
    syncTimeoutRef.current = setTimeout(async () => {
    // SYNC GUARD: Removed as per user request to favor real-time updates
    try {
      // Fire-and-forget reliever payout sync — don't block the sales report save
      syncRelieverPayouts(props.branch, todayStr, props.employees, hiddenStaffNames)
        .catch(err => console.error('[RelieverSync] Background sync failed in dashboard:', err));

      const reportId = `${props.branch.id}_${todayStr.replace(/-/g, '')}`;

      console.log('[SalesReport] Saving report:', { gross: totals.gross, staffPay: totals.totalStaffLiability, opExp: totals.operationalExp, txCount: todayTxs.length, expCount: todayExps.length });

      const payload = {
          [DB_COLUMNS.ID]: reportId,
          [DB_COLUMNS.BRANCH_ID]: props.branch.id,
          [DB_COLUMNS.REPORT_DATE]: todayStr,
          [DB_COLUMNS.SUBMITTED_AT]: new Date().toISOString(),
          [DB_COLUMNS.GROSS_SALES]: totals.gross,
          [DB_COLUMNS.TOTAL_STAFF_PAY]: totals.totalStaffLiability,
          [DB_COLUMNS.TOTAL_EXPENSES]: totals.operationalExp,
          [DB_COLUMNS.TOTAL_VAULT_PROVISION]: totals.provisionExp,
          [DB_COLUMNS.NET_ROI]: totals.net,
          [DB_COLUMNS.SESSION_DATA]: todayTxs.map(t => ({
            ...t,
            settlement: t.paymentMethod?.toLowerCase() || 'cash'
          })),
          [DB_COLUMNS.STAFF_BREAKDOWN]: Object.values(staffSummary).map(({ txs, ...rest }: any) => rest),
          [DB_COLUMNS.EXPENSE_DATA]: todayExps.filter(e => e.category === 'OPERATIONAL'),
          [DB_COLUMNS.VAULT_DATA]: todayExps.filter(e => e.category !== 'OPERATIONAL')
        };
        const { error } = await supabase.from(DB_TABLES.SALES_REPORTS).upsert(payload);
        if (error) throw error;

        lastSyncTimeRef.current = payload[DB_COLUMNS.SUBMITTED_AT];
        prevTotalsRef.current = currentTotalsStr;
        setAutoSyncStatus('synced');
      } catch (err) {
        console.error('[SalesReport] Auto-save failed:', err);
        setAutoSyncStatus('error');
      }
    }, 3000); // Increased to 3 seconds for better performance
    return () => { if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current); };
  }, [totals, todayTxs.length, todayExps.length, todayAtt.length, props.branch.id, todayStr, staffSummary, props.loading]);

  const handleToggleBranchStatus = async () => {
    setIsOpening(true);
    if (props.onSyncStatusChange) props.onSyncStatusChange(true);
    playSound('click');
    const nextStatus = !props.branch.isOpen;
    try {
      const trueNow = getTrueDate();
      const manilaToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(trueNow);

      if (nextStatus === true) {
        // SAFETY: Only purge if todayStr matches manilaToday to avoid overwriting previous day's report
        if (todayStr !== manilaToday) {
          console.warn('Registry Maintenance: Deferred purge due to date mismatch.');
        } else {
          /* 
          // Automated Daily Registry Purge: Historical sessions migrated to Sales Report archive.
          // DISABLED: We now keep transactions for the Client History feature.
          const { error: purgeError } = await supabase
              .from(DB_TABLES.TRANSACTIONS)
              .delete()
              .eq(DB_COLUMNS.BRANCH_ID, props.branch.id)
              .lt(DB_COLUMNS.TIMESTAMP, `${manilaToday}T00:00:00.000Z`);

          if (purgeError) console.error('Registry Maintenance: Purge Failed', purgeError);
          else {
            await supabase.from(DB_TABLES.AUDIT_LOGS).insert({
              [DB_COLUMNS.BRANCH_ID]: props.branch.id,
              [DB_COLUMNS.TIMESTAMP]: trueNow.toISOString(),
              [DB_COLUMNS.ACTIVITY_TYPE]: 'DELETE',
              [DB_COLUMNS.ENTITY_TYPE]: 'TRANSACTION',
              [DB_COLUMNS.DESCRIPTION]: 'Automated Daily Registry Purge: Historical sessions migrated to Sales Report archive.',
              [DB_COLUMNS.PERFORMER_NAME]: 'SYSTEM CORE'
            });
          }
          */
        }
      }

      const updateData: any = {
        [DB_COLUMNS.IS_OPEN]: nextStatus,
        [DB_COLUMNS.IS_OPEN_DATE]: nextStatus ? manilaToday : props.branch.isOpenDate
      };

      const { error } = await supabase.from(DB_TABLES.BRANCHES).update(updateData).eq(DB_COLUMNS.ID, props.branch.id);
      if (error) throw error;

      playSound('success');
      setShowToggleConfirm(false);
      setShowStatusEnforcer(false);
      props.onRefresh?.();
    } catch (e) {
      console.error(e);
    } finally {
      setIsOpening(false);
      if (props.onSyncStatusChange) props.onSyncStatusChange(false);
    }
  };

  const todayReportExists = useMemo(() =>
    props.salesReports.some(r => r.branchId === props.branch.id && r.reportDate === todayStr)
  , [props.salesReports, props.branch.id, todayStr]);

  const hasDailyProvision = useMemo(() =>
    todayExps.some(e => e.category === 'PROVISION')
  , [todayExps]);

  const handleUnlock = () => {
    playSound('click');
    const managerPin = props.user.loginPin || currentEmployee?.loginPin;
    
    if (unlockPin === managerPin) {
      if (pendingSwitchBranchId && props.onSwitchBranch) {
        props.onSwitchBranch(pendingSwitchBranchId);
      }
      setShowUnlockModal(false);
      setPendingSwitchBranchId(null);
      setUnlockPin('');
      setUnlockError('');
      playSound('success');
    } else {
      setUnlockError('INVALID PIN');
      playSound('warning');
    }
  };

  const renderContent = () => {
    const isClosedMode = !props.branch.isOpen;
    
    return (
      <div className="space-y-6">
        {!todayReportExists && props.branch.isOpen && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-500">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h4 className="text-[11px] font-black text-amber-900 uppercase tracking-tight">Daily Deposit Reminder</h4>
              <p className="text-[10px] font-bold text-amber-700/80 uppercase tracking-widest leading-none mt-1">
                You haven't submitted your daily sales report yet. Please ensure all deposits are recorded.
              </p>
            </div>
            <button
              onClick={() => { setActiveTab('sales'); playSound('click'); }}
              className="px-4 py-2 bg-amber-600 text-white text-[9px] font-black uppercase tracking-widest rounded-lg shadow-sm hover:bg-amber-700 transition-colors"
            >
              Go to Sales
            </button>
          </div>
        )}

        {showRemittanceCloseReminder && (
          <div className="bg-amber-600 rounded-2xl p-4 flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-500 shadow-lg shadow-amber-200">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h4 className="text-[12px] font-black text-white uppercase tracking-widest">⚠ Remittance Cut-Off — 1 Hour Left</h4>
              <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest leading-none mt-1">
                This is your weekly cut-off day. Finalize your remittance report before the period closes.
              </p>
            </div>
            <button
              onClick={() => { setActiveTab('remittance'); playSound('click'); }}
              className="px-3 py-2 bg-white text-amber-700 text-[9px] font-black uppercase tracking-widest rounded-lg shadow-sm hover:bg-amber-50 transition-colors shrink-0"
            >
              Review
            </button>
            <button
              onClick={() => {
                const manilaDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(getTrueDate());
                localStorage.setItem(`remittance_close_reminded_${manilaDateStr}`, '1');
                setShowRemittanceCloseReminder(false);
              }}
              className="w-7 h-7 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center text-white text-[12px] font-black shrink-0 transition-colors"
              aria-label="Dismiss"
            >✕</button>
          </div>
        )}

        {showRemittanceOpenReminder && !showRemittanceCloseReminder && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-500">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h4 className="text-[11px] font-black text-amber-900 uppercase tracking-tight">Today is Your Remittance Cut-Off</h4>
              <p className="text-[10px] font-bold text-amber-700/80 uppercase tracking-widest leading-none mt-1">
                Please review and finalize your weekly remittance report before the period closes tonight.
              </p>
            </div>
            <button
              onClick={() => { setActiveTab('remittance'); playSound('click'); }}
              className="px-4 py-2 bg-amber-600 text-white text-[9px] font-black uppercase tracking-widest rounded-lg shadow-sm hover:bg-amber-700 transition-colors shrink-0"
            >
              Review
            </button>
            <button
              onClick={() => {
                const manilaDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(getTrueDate());
                localStorage.setItem(`remittance_open_reminded_${manilaDateStr}`, '1');
                setShowRemittanceOpenReminder(false);
              }}
              className="w-7 h-7 bg-amber-100 hover:bg-amber-200 rounded-lg flex items-center justify-center text-amber-600 text-[12px] font-black shrink-0 transition-colors"
              aria-label="Dismiss"
            >✕</button>
          </div>
        )}

        {showRemittanceFollowUpReminder && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-500">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h4 className="text-[11px] font-black text-amber-900 uppercase tracking-tight">Remittance Not Yet Submitted</h4>
              <p className="text-[10px] font-bold text-amber-700/80 uppercase tracking-widest leading-none mt-1">
                Last week's remittance report has not been submitted. Please finalize and submit it now.
              </p>
            </div>
            <button
              onClick={() => { setActiveTab('remittance'); playSound('click'); }}
              className="px-4 py-2 bg-amber-600 text-white text-[9px] font-black uppercase tracking-widest rounded-lg shadow-sm hover:bg-amber-700 transition-colors shrink-0"
            >
              Go
            </button>
            <button
              onClick={() => {
                const manilaDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(getTrueDate());
                localStorage.setItem(`remittance_followup_reminded_${manilaDateStr}`, '1');
                setShowRemittanceFollowUpReminder(false);
              }}
              className="w-7 h-7 bg-amber-100 hover:bg-amber-200 rounded-lg flex items-center justify-center text-amber-600 text-[12px] font-black shrink-0 transition-colors"
              aria-label="Dismiss"
            >✕</button>
          </div>
        )}

        {unsettledPayrollCount > 0 && activeTab === 'salaries' && (
          <div className="bg-violet-50 border border-violet-200 rounded-2xl p-3.5 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-500">
            <div className="w-8 h-8 bg-violet-100 rounded-xl flex items-center justify-center text-violet-600 shrink-0 text-sm">💸</div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-black text-violet-900 uppercase tracking-tight">
                {unsettledPayrollCount} Payroll {unsettledPayrollCount === 1 ? 'Cycle' : 'Cycles'} Pending Settlement
              </p>
              <p className="text-[9px] font-bold text-violet-500 uppercase tracking-widest mt-0.5">Staff payouts not yet marked as settled</p>
            </div>
            <button
              onClick={() => { setActiveTab('salaries'); playSound('click'); }}
              className="px-3 py-2 bg-violet-600 text-white text-[9px] font-black uppercase tracking-widest rounded-xl shadow-sm hover:bg-violet-700 transition-colors shrink-0"
            >
              Review
            </button>
          </div>
        )}

        {!hasDailyProvision && props.branch.isOpen && (props.branch.dailyProvisionAmount || 0) > 0 && activeTab === 'sales' && (
          <div className="bg-rose-600 rounded-2xl p-4 flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-500 shadow-lg shadow-rose-200">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h4 className="text-[12px] font-black text-white uppercase tracking-widest">⚠ Rent & Bills Not Logged</h4>
              <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest leading-none mt-1">
                Today's Daily R&B Provision (₱{(props.branch.dailyProvisionAmount || 0).toLocaleString()}) has not been recorded yet.
              </p>
            </div>
            <button
              onClick={() => {
                playSound('click');
                setHighlightDeposit(true);
                setTimeout(() => {
                  document.getElementById('daily-deposit-btn')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 50);
                setTimeout(() => setHighlightDeposit(false), 3500);
              }}
              className="px-4 py-2 bg-white text-rose-600 text-[9px] font-black uppercase tracking-widest rounded-lg shadow-sm hover:bg-rose-50 transition-colors shrink-0"
            >
              Log Now
            </button>
          </div>
        )}

        {(() => {
          switch (activeTab) {
            case 'pos': return <POSSection {...props} attendance={props.attendance} todayStr={todayStr} isClosedMode={isClosedMode} isPaymongoEnabled={props.isPaymongoEnabled} onSyncStatusChange={props.onSyncStatusChange} loading={props.loading} hiddenStaffNames={hiddenStaffNames} />;
            case 'sales': return <SalesTodaySection {...props} user={props.user} todayStr={todayStr} setActiveTab={setActiveTab as any} connStatus={props.connStatus} pendingSyncCount={props.pendingSyncCount} hiddenStaffNames={hiddenStaffNames} setHiddenStaffNames={setHiddenStaffNames} isClosedMode={isClosedMode} onRefresh={props.onRefresh} loading={props.loading} highlightDeposit={highlightDeposit} />;
            case 'staff': return <StaffDirectorySection branch={props.branch} branches={props.branches} employees={props.employees} attendance={props.attendance} transactions={props.transactions} isClosedMode={isClosedMode} onRefresh={props.onRefresh} isSetupRequired={isSetupRequired} onSyncStatusChange={props.onSyncStatusChange} isDelegate={props.isRelief} />;
            case 'clients': return <ClientHistorySection branch={props.branch} />;
            case 'remittance': return <RemittanceSection branch={props.branch} salesReports={props.salesReports} />;
            case 'expenses_hub': return (
                <ExpensesManagerSection 
                    branch={props.branch} 
                    expenses={props.expenses} 
                    salesReports={props.salesReports} 
                    isClosedMode={isClosedMode} 
                    onRefresh={props.onRefresh} 
                    onSyncStatusChange={props.onSyncStatusChange} 
                />
            );
            case 'monthly_bills': return (
                <MonthlyBillsSection
                    user={props.user}
                    branch={props.branch}
                    expenses={props.expenses}
                    salesReports={props.salesReports}
                    isClosedMode={isClosedMode}
                    onRefresh={props.onRefresh}
                />
            );
            case 'expense_reports': return (
              <ExpenseLedgerSection
                branch={props.branch}
                expenses={props.expenses}
                salesReports={props.salesReports}
              />
            );
            case 'salaries': return <PayrollSection {...props} attendance={props.attendance} onRefresh={() => props.onRefresh?.(true)} />;
            case 'sales_reports': return <ReportsMasterSection branch={props.branch} salesReports={props.salesReports} branches={props.branches} employees={props.employees} />;
            case 'backfill': return (
              <BackfillRequestSection 
                branch={props.branch} 
                employees={branchEmployees} 
                transactions={props.transactions}
                expenses={props.expenses}
                attendance={props.attendance}
                salesReports={props.salesReports}
                onRefresh={props.onRefresh} 
              />
            );
            case 'settings': return (
                <SettingsSection
                    user={props.user}
                    branch={props.branch}
                    branches={props.branches}
                    todayTxs={todayTxs}
                    todayAtt={todayAtt}
                    todayReportExists={todayReportExists}
                    employees={props.employees}
                    onRefresh={props.onRefresh}
                />
            );
            case 'how_to': return <HowToSection role={UserRole.BRANCH_MANAGER} />;
            default: return null;
          }
        })()}
      </div>
    );
  };

  const branchCleanName = useMemo(() => {
    return props.branch.name.replace(/BRANCH - /g, '').toUpperCase();
  }, [props.branch.name]);

  return (
      <div className="pb-32 min-h-screen bg-slate-50">
        {showClosingWarning && (
            <div className={UI_THEME.layout.modalWrapper}>
              <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-10 text-center border-4 border-amber-500 shadow-[0_0_100px_rgba(245,158,11,0.3)] animate-premium-pulse`}>
                <div className="w-20 h-20 bg-amber-500 text-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl">
                  <Clock className="w-10 h-10" strokeWidth={2.5} />
                </div>
                <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-2">MANDATORY FINALIZATION</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed mb-6">
                  Branch closes at <span className="text-amber-600">{props.branch.closingTime}</span>. Complete all items before the automated registry purge.
                </p>

                {/* Pre-closing checklist */}
                <div className="space-y-3 mb-8 text-left">
                  {/* Sales Report / Deposit */}
                  <div className={`flex items-center gap-4 p-4 rounded-2xl border-2 ${todayReportExists ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-black text-[14px] ${todayReportExists ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                      {todayReportExists ? '✓' : '!'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[11px] font-black uppercase tracking-tight ${todayReportExists ? 'text-emerald-800' : 'text-rose-800'}`}>Daily Sales Report</p>
                      <p className={`text-[9px] font-bold uppercase tracking-widest mt-0.5 ${todayReportExists ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {todayReportExists ? 'Deposit recorded — you\'re good' : 'Not submitted yet — deposit required'}
                      </p>
                    </div>
                    {!todayReportExists && (
                      <button
                        onClick={() => { setActiveTab('sales'); setShowClosingWarning(false); setHasDismissedWarning(true); playSound('click'); }}
                        className="px-3 py-2 bg-rose-600 text-white text-[9px] font-black uppercase tracking-widest rounded-xl shrink-0"
                      >
                        Go
                      </button>
                    )}
                  </div>

                  {/* Rent & Bills Provision */}
                  {(props.branch.dailyProvisionAmount || 0) > 0 && (
                    <div className={`flex items-center gap-4 p-4 rounded-2xl border-2 ${hasDailyProvision ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-black text-[14px] ${hasDailyProvision ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                        {hasDailyProvision ? '✓' : '!'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[11px] font-black uppercase tracking-tight ${hasDailyProvision ? 'text-emerald-800' : 'text-rose-800'}`}>Rent & Bills Provision</p>
                        <p className={`text-[9px] font-bold uppercase tracking-widest mt-0.5 ${hasDailyProvision ? 'text-emerald-600' : 'text-rose-500'}`}>
                          {hasDailyProvision ? `₱${(props.branch.dailyProvisionAmount || 0).toLocaleString()} logged` : `₱${(props.branch.dailyProvisionAmount || 0).toLocaleString()} not recorded yet`}
                        </p>
                      </div>
                      {!hasDailyProvision && (
                        <button
                          onClick={() => { setActiveTab('expenses_hub'); setShowClosingWarning(false); setHasDismissedWarning(true); playSound('click'); }}
                          className="px-3 py-2 bg-rose-600 text-white text-[9px] font-black uppercase tracking-widest rounded-xl shrink-0"
                        >
                          Go
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3">
                  <button
                      onClick={() => { setShowClosingWarning(false); setHasDismissedWarning(true); playSound('click'); }}
                      className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl text-[12px] uppercase tracking-widest shadow-2xl active:scale-95 transition-all"
                  >
                    Acknowledged
                  </button>
                </div>
              </div>
            </div>
        )}

        {showStatusEnforcer && (
            <div className={UI_THEME.layout.modalWrapper}>
              <div className={`${UI_THEME.layout.modalLarge} ${UI_THEME.radius.modal} p-10 text-center relative overflow-hidden border border-white/5`}>
                <div className="relative z-10 space-y-8">
                  <div className="w-20 h-20 bg-slate-900 rounded-[28px] flex items-center justify-center mx-auto text-white shadow-xl">
                    <Store className="w-8 h-8" strokeWidth={2.5} />
                  </div>
                  <h3 className="text-3xl font-bold text-slate-900 tracking-tight uppercase leading-tight break-words">
                    {branchCleanName} IS CURRENTLY{" "}
                    <span className="text-red-600">
                      CLOSED
                    </span>
                  </h3>
                  <div className="flex flex-col gap-4">
                    <button
                        onClick={handleToggleBranchStatus}
                        disabled={isOpening}
                        className="w-full text-white font-bold py-6 px-2 rounded-[20px] text-[13px] uppercase tracking-[0.2em] shadow-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition-all"
                    >
                      {isOpening ? 'INITIALIZING...' : 'Initialize Daily Opening'}
                    </button>
                    <button onClick={() => { playSound('click'); setShowStatusEnforcer(false); }} className="w-full text-slate-400 font-bold py-4 text-[11px] uppercase tracking-widest">Proceed without opening</button>
                  </div>
                </div>
              </div>
            </div>
        )}

        {showToggleConfirm && (
            <div className={UI_THEME.layout.modalWrapper}>
              <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-10 text-center border border-slate-100`}>
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner ${props.branch.isOpen ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-500'}`}>
                  <Zap className="w-8 h-8" strokeWidth={3} />
                </div>
                <h4 className="text-2xl font-bold text-slate-900 mb-2 uppercase tracking-tighter">{props.branch.isOpen ? 'Close Branch?' : 'Open Branch?'}</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                  {props.branch.isOpen 
                    ? 'Disabling POS operations for this node. Ensure all staff have clocked out to avoid system auto-logout.' 
                    : 'Enabling POS operations and shift tracking.'}
                </p>
                <div className="flex flex-col gap-3 mt-10">
                  <button
                      onClick={handleToggleBranchStatus}
                      disabled={isOpening}
                      className={`w-full text-white font-bold py-5 rounded-2xl text-[12px] uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3 ${props.branch.isOpen ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
                  >
                    {isOpening ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : (props.branch.isOpen ? 'Confirm Closure' : 'Confirm Open')}
                  </button>
                  <button onClick={() => setShowToggleConfirm(false)} className="w-full text-slate-400 font-bold py-4 rounded-xl text-[11px] uppercase tracking-widest">Cancel</button>
                </div>
              </div>
            </div>
        )}

        <div className="sticky top-[72px] sm:top-20 left-0 right-0 z-[60] no-print shadow-lg">
          <div className="bg-slate-800 text-white transition-all duration-500">
            <div className={`${UI_THEME.layout.maxContent} ${UI_THEME.layout.mainPadding} py-2 flex flex-row justify-between items-center gap-2`}>
              <div className="flex flex-row items-center gap-2 sm:gap-5 text-slate-500 overflow-hidden shrink-0">
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <Clock className="w-3 h-3 text-emerald-500" strokeWidth={3} />
                  <span className="text-[10px] sm:text-[11px] font-bold font-mono tabular-nums tracking-tighter text-slate-100">
                      {formatManilaDate(currentTime, { day: '2-digit', month: 'short' })}
                    {' • '}
                    {formatManilaTime(currentTime)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-4 shrink-0" ref={dropdownRef}>
                <button
                    onClick={() => { playSound('click'); setShowToggleConfirm(true); }}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border transition-all active:scale-[0.96] shadow-md ${props.branch.isOpen ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30'}`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full shadow-[0_0_8px] ${props.branch.isOpen ? 'bg-emerald-400 shadow-emerald-400 animate-pulse' : 'bg-rose-50 shadow-rose-500'}`}></div>
                  <span className={`text-[8px] sm:text-[10px] font-bold uppercase tracking-widest ${props.branch.isOpen ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {props.branch.isOpen ? 'STATUS: OPEN' : 'STATUS: CLOSE'}
                  </span>
                </button>

                {managedNodes.length > 0 && (
                    <div className="relative">
                      <button onClick={() => { setIsSwitchingOpen(!isSwitchingOpen); playSound('click'); }} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all text-[8px] sm:text-[9px] font-bold uppercase tracking-widest active:scale-[0.96] ${isSwitchingOpen ? 'bg-slate-700 border-white/20 text-white' : 'bg-white/5 border-white/10 text-slate-400'}`}>
                        <Store className="w-3.5 h-3.5" strokeWidth={3} />
                        <span className="hidden sm:inline">Switch</span>
                        <span className="bg-white/10 px-1 rounded-md ml-0.5">{managedNodes.length}</span>
                      </button>

                      {isSwitchingOpen && (
                          <div className="absolute top-full right-0 mt-2 w-60 bg-slate-800 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 p-1.5 z-[70]">
                            <p className="text-[7px] font-bold text-slate-500 uppercase tracking-widest px-3 py-1 mb-1">Managed Nodes</p>
                            {managedNodes.map(n => (
                                <button key={n.id} onClick={() => { setPendingSwitchBranchId(n.id); setShowUnlockModal(true); setIsSwitchingOpen(false); playSound('click'); }} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/5 transition-all flex items-center justify-between group">
                                  <p className="text-[10px] font-bold text-white uppercase truncate pr-4">{n.name.replace(/BRANCH - /i, '')}</p>
                                  <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-emerald-500 transition-colors" strokeWidth={3} />
                                </button>
                            ))}
                          </div>
                      )}
                    </div>
                )}
              </div>
            </div>
          </div>

          <BranchNavbar
              activeTab={activeTab}
              onTabChange={setActiveTab}
              enableShiftTracking={props.branch.enableShiftTracking || false}
              isRelief={props.isRelief}
              showBillsAlert={hasBills === false}
          />
        </div>

        {/* Bills Setup Guide Modal */}
        {showBillsGuide && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-sm rounded-[28px] shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-300">
              {/* Header */}
              <div className="bg-slate-900 px-6 pt-6 pb-5 text-white relative overflow-hidden">
                <div className="absolute -top-6 -right-6 w-28 h-28 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
                <div className="w-10 h-10 bg-amber-400/20 rounded-xl flex items-center justify-center mb-3">
                  <span className="text-xl">🧾</span>
                </div>
                <h3 className="text-[15px] font-black uppercase tracking-tight leading-tight">Monthly Bills Not Set Up</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Configuration Required</p>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-4">
                <p className="text-[12px] font-medium text-slate-600 leading-relaxed">
                  Track your recurring branch expenses so you never miss a payment. Set up bills for things like:
                </p>
                <ul className="space-y-2">
                  {['Rent', 'Electricity', 'Water', 'Internet / Cable', 'Other dues'].map(item => (
                    <li key={item} className="flex items-center gap-2.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-widest">{item}</span>
                    </li>
                  ))}
                </ul>

                {/* Arrow hint */}
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                  <span className="text-amber-500 text-base animate-bounce">↑</span>
                  <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">
                    Find it under <span className="text-amber-900">Monthly Bills</span> in the nav
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="px-6 pb-6 flex gap-2">
                <button
                  onClick={() => setShowBillsGuide(false)}
                  className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 border border-slate-200 transition-all"
                >
                  Later
                </button>
                <button
                  onClick={() => {
                    setShowBillsGuide(false);
                    setActiveTab('monthly_bills');
                    playSound('click');
                  }}
                  className="flex-[2] py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-slate-900 text-white hover:bg-amber-500 transition-all shadow-lg active:scale-95"
                >
                  Set Up Now →
                </button>
              </div>
            </div>
          </div>
        )}

        {showUnlockModal && (
          <div className={UI_THEME.layout.modalWrapper}>
            <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-8 text-center border border-slate-100 shadow-2xl animate-in zoom-in-95`}>
              <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                <Lock className="w-8 h-8" strokeWidth={3} />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mb-2 uppercase tracking-tight">Unlock Manager Access</h4>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed mb-6">Enter your Manager PIN to restore full access.</p>
              
              <div className="space-y-4">
                <input
                  type="password"
                  value={unlockPin}
                  onChange={(e) => { setUnlockPin(e.target.value); setUnlockError(''); }}
                  placeholder="ENTER PIN"
                  className={`w-full h-16 bg-slate-50 border ${unlockError ? 'border-rose-500' : 'border-slate-200'} rounded-2xl text-center text-2xl font-black tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all`}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                />
                {unlockError && <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">{unlockError}</p>}
                
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={handleUnlock}
                    className="bg-slate-900 text-white font-bold py-4 rounded-xl text-[11px] uppercase tracking-widest shadow-lg active:scale-95 transition-all"
                  >
                    Unlock
                  </button>
                  <button 
                    onClick={() => { setShowUnlockModal(false); setUnlockPin(''); setUnlockError(''); playSound('click'); }}
                    className="bg-slate-100 text-slate-500 font-bold py-4 rounded-xl text-[11px] uppercase tracking-widest hover:bg-slate-200 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className={`${UI_THEME.layout.mainPadding} ${UI_THEME.layout.maxContent} py-4 md:py-8 animate-in fade-in duration-500`}>
          {renderContent()}
        </div>
      </div>
  );
};

export default BranchManagerDashboard;