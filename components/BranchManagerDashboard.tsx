import React, { useState, useEffect, useMemo, memo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Branch, BranchVault, Transaction, Expense, Employee, SalesReport, AuditLog, Attendance, AuthState, UserRole, VaultTransaction, Request, EmployeeComplaint } from '../types';
import { UI_THEME } from '../constants/ui_designs';
import { useBranchData } from './dashboard/hooks/useBranchData';

// Lazy-loaded tab sections — each becomes its own chunk, loaded on first visit
const POSSection             = React.memo(React.lazy(() => import('./dashboard/sections/POSSection').then(m => ({ default: m.POSSection }))));
const ExpensesManagerSection = React.memo(React.lazy(() => import('./dashboard/sections/ExpensesManagerSection').then(m => ({ default: m.ExpensesManagerSection }))));
const BranchVaultSection     = React.memo(React.lazy(() => import('./dashboard/sections/BranchVaultSection').then(m => ({ default: m.BranchVaultSection }))));
const ExpenseLedgerSection   = React.memo(React.lazy(() => import('./dashboard/sections/ExpenseLedgerSection').then(m => ({ default: m.ExpenseLedgerSection }))));
const PayrollSection         = React.memo(React.lazy(() => import('./dashboard/sections/PayrollSection').then(m => ({ default: m.PayrollSection }))));
const SalesTodaySection      = React.memo(React.lazy(() => import('./dashboard/sections/SalesTodaySection').then(m => ({ default: m.SalesTodaySection }))));
const StaffDirectorySection  = React.memo(React.lazy(() => import('./dashboard/sections/StaffDirectorySection').then(m => ({ default: m.StaffDirectorySection }))));
const ReportsMasterSection   = React.memo(React.lazy(() => import('./dashboard/sections/ReportsMasterSection').then(m => ({ default: m.ReportsMasterSection }))));
const BranchReportsTab       = React.memo(React.lazy(() => import('./dashboard/sections/BranchReportsTab').then(m => ({ default: m.BranchReportsTab }))));
const SettingsSection        = React.memo(React.lazy(() => import('./dashboard/sections/SettingsSection').then(m => ({ default: m.SettingsSection }))));
const BackfillRequestSection = React.memo(React.lazy(() => import('./dashboard/sections/BackfillRequestSection').then(m => ({ default: m.BackfillRequestSection }))));
const HowToSection           = React.memo(React.lazy(() => import('./dashboard/sections/HowToSection').then(m => ({ default: m.HowToSection }))));
const ClientHistorySection   = React.memo(React.lazy(() => import('./dashboard/sections/ClientHistorySection').then(m => ({ default: m.ClientHistorySection }))));
const RemittanceSection      = React.memo(React.lazy(() => import('./dashboard/sections/RemittanceSection').then(m => ({ default: m.RemittanceSection }))));
const InsightsHub            = React.memo(React.lazy(() => import('./superadmin/InsightsHub').then(m => ({ default: m.InsightsHub }))));
const ComplaintsSection      = React.memo(React.lazy(() => import('./dashboard/sections/ComplaintsSection').then(m => ({ default: m.ComplaintsSection }))));

import { BranchNavbar } from './navigation/BranchNavbar';
import { resumeAudioContext, playSound } from '../lib/audio';
import { getEmployeeRole } from '../lib/payroll';
import { supabase } from '../lib/supabase';
import { getTrueDate, formatManilaDate, formatManilaTime, toManilaDateStr, getManilaTodayStr } from '../lib/time';
import { DB_TABLES } from '../constants/db_schema';
import { Clock, Store, ChevronRight } from 'lucide-react';

import { useDeviceLogging } from './branch-manager/hooks/useDeviceLogging';
import { useTodayData } from './branch-manager/hooks/useTodayData';
import { useAutoSaveReport } from './branch-manager/hooks/useAutoSaveReport';
import { useBranchStatus } from './branch-manager/hooks/useBranchStatus';
import { useRemittanceReminders } from './branch-manager/hooks/useRemittanceReminders';
import { useBranchSwitch } from './branch-manager/hooks/useBranchSwitch';
import { ClosingWarningModal } from './branch-manager/modals/ClosingWarningModal';
import { StatusEnforcerModal } from './branch-manager/modals/StatusEnforcerModal';
import { ToggleConfirmModal } from './branch-manager/modals/ToggleConfirmModal';
import { UnlockModal } from './branch-manager/modals/UnlockModal';
import { RemittanceBanners } from './branch-manager/RemittanceBanners';

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
  salesReportsLoading?: boolean;
  vaultTransactions?: VaultTransaction[];
  auditLogs: AuditLog[];
  autoRefreshTime: string;
  isPaymongoEnabled?: boolean;
  branchVault?: BranchVault | null;
  loading?: boolean;
  connStatus?: 'connecting' | 'connected' | 'error' | 'offline';
  pendingSyncCount?: number;
  requests?: Request[];
  complaints?: EmployeeComplaint[];
  onRefresh?: (quiet?: boolean) => void;
  onSwitchBranch?: (branchId: string) => void;
  onSyncStatusChange?: (isSyncing: boolean) => void;
  isPreview?: boolean;
}

export type TabID = 'pos' | 'sales' | 'staff' | 'clients' | 'expenses_hub' | 'monthly_bills' | 'expense_reports' | 'salaries' | 'sales_reports' | 'remittance' | 'settings' | 'how_to' | 'backfill' | 'insights' | 'complaints';

// Isolated clock — has its own 1s timer so the parent dashboard doesn't re-render every second
const LiveClock = memo(() => {
  const [now, setNow] = React.useState(getTrueDate());
  React.useEffect(() => {
    const t = setInterval(() => setNow(getTrueDate()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="text-xs font-semibold font-mono tabular-nums tracking-tight text-slate-500">
      {formatManilaDate(now, { day: '2-digit', month: 'short' })}
      {' · '}
      {formatManilaTime(now)}
    </span>
  );
});

const BranchManagerDashboard: React.FC<BranchManagerDashboardProps> = (props) => {
  const queryClient = useQueryClient();
  const [currentTime, setCurrentTime] = useState(getTrueDate());
  const [activeTab, setActiveTab] = useState<TabID>(() => {
    const saved = localStorage.getItem(`branch_tab_${props.branch?.id ?? 'default'}`);
    return (saved as TabID) || 'pos';
  });
  const [mountedTabs, setMountedTabs] = useState<Set<TabID>>(() => {
    const saved = localStorage.getItem(`branch_tab_${props.branch?.id ?? 'default'}`);
    return new Set<TabID>(['pos', ...(saved ? [saved as TabID] : [])]);
  });
  const [totalBillsAmount, setTotalBillsAmount] = useState(0);
  const [highlightDeposit, setHighlightDeposit] = useState(false);
  const [hiddenStaffNames, setHiddenStaffNames] = useState<Set<string>>(() => {
    try {
      const todayDate = getManilaTodayStr();
      const saved = localStorage.getItem(`hidden_staff_${props.branch.id}`);
      if (!saved) return new Set();
      const parsed = JSON.parse(saved);
      // If stored value has a date and it doesn't match today, clear it (new day = fresh slate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        if (parsed.date !== todayDate) return new Set();
        return new Set(parsed.names ?? []);
      }
      // Legacy format (plain array) — migrate by clearing since we don't know which day it's from
      return new Set();
    } catch { return new Set(); }
  });
  const [hasDismissedWarning, setHasDismissedWarning] = useState(false);

  // Persist hidden staff names with today's date so they auto-clear on a new day
  useEffect(() => {
    try {
      const todayDate = getManilaTodayStr();
      localStorage.setItem(`hidden_staff_${props.branch.id}`, JSON.stringify({ date: todayDate, names: [...hiddenStaffNames] }));
    } catch { /* storage quota exceeded — ignore */ }
  }, [hiddenStaffNames, props.branch.id]);

  // Total monthly bills (used by SalesTodaySection)
  useEffect(() => {
    if (props.isRelief) return;
    supabase.from(DB_TABLES.BRANCH_BILLS)
      .select('amount, category')
      .eq('branch_id', props.branch.id)
      .eq('is_active', true)
      .then(({ data }) => {
        const total = (data || [])
          .filter((b: any) => b.category === 'MONTHLY' && Number(b.amount || 0) > 0)
          .reduce((s: number, b: any) => s + Number(b.amount), 0);
        setTotalBillsAmount(total);
      });
  }, [props.branch.id, props.isRelief]);

  // 1-minute tick for remittance reminder checks
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(getTrueDate()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Refetch sales reports immediately on tab entry + every 60s while active
  useEffect(() => {
    if (activeTab !== 'sales_reports') return;
    queryClient.invalidateQueries({ queryKey: ['salesReports'] });
    const interval = setInterval(() => queryClient.invalidateQueries({ queryKey: ['salesReports'] }), 60000);
    return () => clearInterval(interval);
  }, [activeTab, queryClient]);

  // Refetch remittance data immediately on tab entry + every 60s while active
  useEffect(() => {
    if (activeTab !== 'remittance') return;
    queryClient.invalidateQueries({ queryKey: ['salesReportsHot'] });
    queryClient.invalidateQueries({ queryKey: ['salesReportsWarm'] });
    queryClient.invalidateQueries({ queryKey: ['vaultTransactions'] });
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['salesReportsHot'] });
      queryClient.invalidateQueries({ queryKey: ['salesReportsWarm'] });
      queryClient.invalidateQueries({ queryKey: ['vaultTransactions'] });
    }, 60000);
    return () => clearInterval(interval);
  }, [activeTab, queryClient]);

  // ── Hooks ──────────────────────────────────────────────────────────────────
  useDeviceLogging(props.branch.id);

  const branchEmployees = useMemo(() => {
    return props.employees.filter(e => {
      if (!e.isActive) return false;
      const isHomeBranch = e.branchId === props.branch.id;
      const isAuthorized = e.branchAllowances && typeof e.branchAllowances === 'object' && props.branch.id in (e.branchAllowances as any);
      const isDesignatedManager = props.branch.manager?.toUpperCase() === (e.name || '').toUpperCase();
      const isTempManager = props.branch.tempManager?.toUpperCase() === (e.name || '').toUpperCase();
      const allowance = e.branchAllowances?.[props.branch.id];
      const hasManagerRole = allowance && typeof allowance === 'object' && allowance.role?.includes('MANAGER');
      return isHomeBranch || isAuthorized || isDesignatedManager || isTempManager || hasManagerRole;
    });
  }, [props.employees, props.branch.id, props.branch.manager, props.branch.tempManager]);

  const isSetupRequired = useMemo(() =>
    !branchEmployees.some(e => {
      const role = getEmployeeRole(e, props.branch.id);
      return role.includes('THERAPIST') || role.includes('BONESETTER');
    }),
  [branchEmployees, props.branch.id]);

  const { todayStr, todayTxs, todayExps, todayAtt, todayReportExists, staffSummary, totals } = useTodayData({
    branch: props.branch,
    currentTime,
    transactions: props.transactions,
    expenses: props.expenses,
    attendance: props.attendance,
    employees: props.employees,
    branchEmployees,
    salesReports: props.salesReports,
    branchVault: props.branchVault,
    hiddenStaffNames,
    vaultTransactions: props.vaultTransactions,
  });

  const todayVaultTxs = useMemo(() =>
    (props.vaultTransactions ?? []).filter(t => t.branchId === props.branch.id && toManilaDateStr(t.timestamp) === todayStr),
  [props.vaultTransactions, props.branch.id, todayStr]);

  const { autoSyncStatus, forceSync } = useAutoSaveReport({
    branch: props.branch,
    branchVault: props.branchVault,
    todayStr,
    todayTxs,
    todayExps,
    todayAtt,
    todayVaultTxs,
    staffSummary,
    totals,
    employees: props.employees,
    hiddenStaffNames,
    todayReportExists,
    loading: props.loading,
    isPreview: props.isPreview,
  });

  const {
    showStatusEnforcer, setShowStatusEnforcer,
    showToggleConfirm, setShowToggleConfirm,
    showClosingWarning, setShowClosingWarning,
    isOpening, handleToggleBranchStatus,
  } = useBranchStatus({
    branch: props.branch,
    salesReports: props.salesReports,
    todayStr,
    currentTime,
    hasDismissedWarning,
    onRefresh: props.onRefresh,
    onSyncStatusChange: props.onSyncStatusChange,
  });

  const {
    showRemittanceCloseReminder, setShowRemittanceCloseReminder,
    showRemittanceFollowUpReminder, setShowRemittanceFollowUpReminder,
    showVaultUnconfiguredNotif, setShowVaultUnconfiguredNotif,
  } = useRemittanceReminders(currentTime, props.branch);

  // Vault unconfigured notification (once per day, on first login)
  useEffect(() => {
    if (!props.branch.vaultEnabled) return;
    const hasTarget = (props.branchVault?.target ?? 0) > 0;
    if (hasTarget) { setShowVaultUnconfiguredNotif(false); return; }
    const today = getManilaTodayStr();
    const key = `vault_notif_${props.branch.id}_${today}`;
    if (!localStorage.getItem(key)) setShowVaultUnconfiguredNotif(true);
  }, [props.branch.id, props.branch.vaultEnabled, props.branchVault]);

  const {
    showUnlockModal, setShowUnlockModal,
    pendingSwitchBranchId, setPendingSwitchBranchId,
    unlockPin, setUnlockPin,
    unlockError, setUnlockError,
    isSwitchingOpen, setIsSwitchingOpen,
    dropdownRef, handleUnlock,
  } = useBranchSwitch({ loginPin: props.user.loginPin, onSwitchBranch: props.onSwitchBranch });

  const { yearlyCycles } = useBranchData(props.branch, props.transactions, props.expenses);

  // ── Derived state ──────────────────────────────────────────────────────────
  const branchCleanName = useMemo(() =>
    props.branch.name.replace(/BRANCH - /g, '').toUpperCase(),
  [props.branch.name]);

  const manilaDay = useMemo(() => {
    const manila = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(getTrueDate());
    return parseInt(manila.split('-')[2], 10);
  }, [currentTime]);

  const managedNodes = useMemo(() => {
    const empName = props.employees.find(e => e.id === props.user.employeeId)?.name?.toUpperCase() || props.user.username?.toUpperCase();
    if (!empName) return [];
    return props.branches.filter(b => {
      if (b.id === props.branch.id || !b.isEnabled) return false;
      return b.manager?.toUpperCase() === empName || b.tempManager?.toUpperCase() === empName;
    });
  }, [props.branches, props.branch.id, props.employees, props.user.employeeId, props.user.username]);

  const branchSalesReports = useMemo(
    () => props.salesReports.filter(r => r.branchId === props.branch.id),
    [props.salesReports, props.branch.id]
  );

  const changeTab = (tabId: TabID) => {
    resumeAudioContext();
    if (tabId !== activeTab) {
      if (tabId !== 'pos') window.history.pushState({ tab: tabId }, '');
      setMountedTabs(prev => { const next = new Set(prev); next.add(tabId); return next; });
      setActiveTab(tabId);
      localStorage.setItem(`branch_tab_${props.branch?.id ?? 'default'}`, tabId);
      if (['salaries', 'reports_master', 'sales', 'sales_reports', 'remittance'].includes(tabId)) props.onRefresh?.(true);
    }
  };

  const handleRefresh = useCallback(() => { props.onRefresh?.(); }, [props.onRefresh]);
  const handleRefreshForce = useCallback(() => { props.onRefresh?.(true); }, [props.onRefresh]);
  const handleNavigateToComplaints = useCallback(() => changeTab('complaints'), [changeTab]);

  return (
    <div className="pb-24 bg-slate-50 dark:bg-slate-900">

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {showClosingWarning && (
        <ClosingWarningModal
          closingTime={props.branch.shift2ClosingTime || props.branch.closingTime || ''}
          todayReportExists={todayReportExists}
          vaultEnabled={props.branch.vaultEnabled}
          branchVault={props.branchVault}
          netTotal={totals.net}
          onGoToSales={() => { changeTab('sales'); setShowClosingWarning(false); setHasDismissedWarning(true); playSound('click'); }}
          onAcknowledge={() => { setShowClosingWarning(false); setHasDismissedWarning(true); playSound('click'); }}
        />
      )}

      {showStatusEnforcer && (
        <StatusEnforcerModal
          branchCleanName={branchCleanName}
          isOpening={isOpening}
          onOpen={handleToggleBranchStatus}
          onDismiss={() => { playSound('click'); setShowStatusEnforcer(false); }}
        />
      )}

      {showToggleConfirm && (
        <ToggleConfirmModal
          isOpen={props.branch.isOpen}
          isOpening={isOpening}
          onConfirm={handleToggleBranchStatus}
          onCancel={() => setShowToggleConfirm(false)}
        />
      )}

      {showUnlockModal && (
        <UnlockModal
          unlockPin={unlockPin}
          unlockError={unlockError}
          onChangePin={pin => { setUnlockPin(pin); setUnlockError(''); }}
          onUnlock={handleUnlock}
          onCancel={() => { setShowUnlockModal(false); setUnlockPin(''); setUnlockError(''); playSound('click'); }}
        />
      )}

      {/* ── Sticky header ────────────────────────────────────────────────────── */}
      <div className="sticky top-14 sm:top-16 left-0 right-0 z-[60] no-print bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-700">
        <div>
          <div className={`${UI_THEME.layout.maxContent} ${UI_THEME.layout.mainPadding} h-10 flex flex-row justify-between items-center gap-2`}>
            <div className="flex items-center gap-1.5 shrink-0">
              <Clock className="w-3 h-3 text-emerald-500" strokeWidth={2.5} />
              <LiveClock />
            </div>

            <div className="flex items-center gap-2 shrink-0" ref={dropdownRef}>
              <button
                onClick={() => { playSound('click'); setShowToggleConfirm(true); }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold transition-all active:scale-[0.96] ${props.branch.isOpen ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-600'}`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${props.branch.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-400'}`} />
                {props.branch.isOpen ? 'Open' : 'Closed'}
              </button>

              {managedNodes.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => { setIsSwitchingOpen(!isSwitchingOpen); playSound('click'); }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold transition-all active:scale-[0.96] ${isSwitchingOpen ? 'bg-slate-900 border-slate-900 text-white' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}
                  >
                    <Store className="w-3 h-3" strokeWidth={2.5} />
                    <span className="hidden sm:inline">Switch</span>
                    <span className={`text-xs font-black px-1 rounded ${isSwitchingOpen ? 'text-slate-300' : 'text-slate-500'}`}>{managedNodes.length}</span>
                  </button>
                  {isSwitchingOpen && (
                    <div className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 p-1.5 z-[70]">
                      <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 px-3 py-1.5 mb-0.5">Managed Branches</p>
                      {managedNodes.map(n => (
                        <button
                          key={n.id}
                          onClick={() => { setPendingSwitchBranchId(n.id); setShowUnlockModal(true); setIsSwitchingOpen(false); playSound('click'); }}
                          className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all flex items-center justify-between group"
                        >
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate pr-4">{n.name.replace(/BRANCH - /i, '')}</p>
                          <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-500 group-hover:text-emerald-500 transition-colors" strokeWidth={2.5} />
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
          onTabChange={changeTab}
          enableShiftTracking={props.branch.enableShiftTracking || false}
          isRelief={props.isRelief}
          showBillsAlert={false}
          vaultEnabled={props.branch.vaultEnabled ?? false}
          hasVaultRecord={!!props.branchVault}
        />
      </div>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className={`${UI_THEME.layout.mainPadding} ${UI_THEME.layout.maxContent} py-4 md:py-6 pb-28`}>
        <div className="space-y-4">
          <RemittanceBanners
            branchId={props.branch.id}
            showCloseReminder={showRemittanceCloseReminder}
            showFollowUpReminder={showRemittanceFollowUpReminder}
            showVaultUnconfigured={showVaultUnconfiguredNotif}
            onDismissCloseReminder={() => setShowRemittanceCloseReminder(false)}
            onDismissFollowUp={() => setShowRemittanceFollowUpReminder(false)}
            onDismissVaultNotif={() => setShowVaultUnconfiguredNotif(false)}
            onGoToRemittance={() => changeTab('remittance')}
          />

          <React.Suspense fallback={null}>
            {mountedTabs.has('pos')            && <div className={activeTab !== 'pos'            ? 'hidden' : ''}><POSSection {...props} attendance={props.attendance} todayStr={todayStr} isClosedMode={!props.branch.isOpen} isPaymongoEnabled={props.isPaymongoEnabled} onSyncStatusChange={props.onSyncStatusChange} loading={props.loading} hiddenStaffNames={hiddenStaffNames} onForceSync={forceSync} /></div>}
            {mountedTabs.has('sales')          && <div className={activeTab !== 'sales'          ? 'hidden' : ''}><SalesTodaySection {...props} user={props.user} todayStr={todayStr} setActiveTab={changeTab as any} connStatus={props.connStatus} pendingSyncCount={props.pendingSyncCount} hiddenStaffNames={hiddenStaffNames} setHiddenStaffNames={setHiddenStaffNames} isClosedMode={!props.branch.isOpen} onRefresh={props.onRefresh} loading={props.loading} totalBillsAmount={totalBillsAmount} vaultTransactions={props.vaultTransactions} autoSyncStatus={autoSyncStatus} onForceSync={forceSync} /></div>}
            {mountedTabs.has('staff')          && <div className={activeTab !== 'staff'          ? 'hidden' : ''}><StaffDirectorySection branch={props.branch} branches={props.branches} employees={props.employees} attendance={props.attendance} transactions={props.transactions} isClosedMode={!props.branch.isOpen} onRefresh={props.onRefresh} isSetupRequired={isSetupRequired} onSyncStatusChange={props.onSyncStatusChange} isDelegate={props.isRelief} isManagerView onNavigateToComplaints={!props.isRelief ? handleNavigateToComplaints : undefined} complaints={props.complaints ?? []} /></div>}
            {mountedTabs.has('clients')        && <div className={activeTab !== 'clients'        ? 'hidden' : ''}><ClientHistorySection branch={props.branch} /></div>}
            {mountedTabs.has('remittance')     && <div className={activeTab !== 'remittance'     ? 'hidden' : ''}><RemittanceSection branch={props.branch} salesReports={props.salesReports} vaultTransactions={props.vaultTransactions} performedBy={props.user.username ?? null} canDepositToVault={props.user.role === UserRole.BRANCH_MANAGER || props.user.role === UserRole.SUPERADMIN} isDelegate={props.isRelief} onRefresh={props.onRefresh} /></div>}
            {mountedTabs.has('expenses_hub')   && <div className={activeTab !== 'expenses_hub'   ? 'hidden' : ''}><ExpensesManagerSection branch={props.branch} expenses={props.expenses} salesReports={props.salesReports} isClosedMode={!props.branch.isOpen} onRefresh={props.onRefresh} onSyncStatusChange={props.onSyncStatusChange} /></div>}
            {mountedTabs.has('monthly_bills')  && <div className={activeTab !== 'monthly_bills'  ? 'hidden' : ''}><BranchVaultSection branch={props.branch} branchVault={props.branchVault} salesReports={props.salesReports} isClosedMode={!props.branch.isOpen} todayNetRoi={totals.net} todayStr={todayStr} performedBy={props.user.username ?? null} onRefresh={props.onRefresh} /></div>}
            {mountedTabs.has('expense_reports') && <div className={activeTab !== 'expense_reports' ? 'hidden' : ''}><ExpenseLedgerSection branch={props.branch} expenses={props.expenses} salesReports={props.salesReports} /></div>}
            {mountedTabs.has('salaries')       && <div className={activeTab !== 'salaries'       ? 'hidden' : ''}><PayrollSection {...props} attendance={props.attendance} onRefresh={handleRefreshForce} /></div>}
            {mountedTabs.has('sales_reports')  && <div className={activeTab !== 'sales_reports'  ? 'hidden' : ''}><BranchReportsTab branch={props.branch} salesReports={props.salesReports} salesReportsLoading={props.salesReportsLoading} branches={props.branches} employees={props.employees} branchVault={props.branchVault} /></div>}
            {mountedTabs.has('backfill')       && <div className={activeTab !== 'backfill'       ? 'hidden' : ''}><BackfillRequestSection branch={props.branch} branchVault={props.branchVault} employees={branchEmployees} transactions={props.transactions} expenses={props.expenses} attendance={props.attendance} salesReports={props.salesReports} vaultTransactions={props.vaultTransactions} requests={props.requests ?? []} onRefresh={props.onRefresh} /></div>}
            {mountedTabs.has('settings')       && <div className={activeTab !== 'settings'       ? 'hidden' : ''}><SettingsSection user={props.user} branch={props.branch} branches={props.branches} todayTxs={todayTxs} todayAtt={todayAtt} todayReportExists={todayReportExists} employees={props.employees} branchVault={props.branchVault} isRelief={props.isRelief} onRefresh={props.onRefresh} /></div>}
            {mountedTabs.has('insights')        && <div className={activeTab !== 'insights'        ? 'hidden' : ''}><InsightsHub branches={[props.branch]} salesReports={branchSalesReports} isBranchView /></div>}
            {mountedTabs.has('complaints')      && <div className={activeTab !== 'complaints'      ? 'hidden' : ''}><ComplaintsSection branch={props.branch} employees={props.employees} complaints={props.complaints ?? []} filedById={props.user.employeeId ?? props.user.username ?? ''} filedByName={props.employees.find(e => e.id === props.user.employeeId)?.name || props.user.username || ''} managerPin={props.user.loginPin} isDelegate={props.isRelief || props.user.role === UserRole.PORTAL_USER} /></div>}
            {mountedTabs.has('how_to')         && <div className={activeTab !== 'how_to'         ? 'hidden' : ''}><HowToSection role={UserRole.BRANCH_MANAGER} /></div>}
          </React.Suspense>
        </div>
      </div>
    </div>
  );
};

export default BranchManagerDashboard;
