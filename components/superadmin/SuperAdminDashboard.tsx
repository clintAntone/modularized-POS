import React, { useState, useMemo, useEffect, memo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Branch, Transaction, Expense, AuditLog, SalesReport, Employee, Attendance, UserRole, AuthState, PortalPermissions, VaultTransaction, EmployeeComplaint } from '../../types';
import { UI_THEME } from '../../constants/ui_designs';

// Types only (no runtime cost)
import type { CatalogGroup } from './ServiceCatalog';

// Lazy-loaded tab components — each becomes its own chunk, loaded on first visit
const ServiceCatalog    = React.memo(React.lazy(() => import('./ServiceCatalog').then(m => ({ default: m.ServiceCatalog }))));
const NetworkManager    = React.memo(React.lazy(() => import('./NetworkManager').then(m => ({ default: m.NetworkManager }))));
const BranchEditor      = React.memo(React.lazy(() => import('./BranchEditor').then(m => ({ default: m.BranchEditor }))));
const SalesHub          = React.memo(React.lazy(() => import('./SalesHub').then(m => ({ default: m.SalesHub }))));
const SettingsHub       = React.memo(React.lazy(() => import('./SettingsHub').then(m => ({ default: m.SettingsHub }))));
const ArchiveHub        = React.memo(React.lazy(() => import('./ArchiveHub').then(m => ({ default: m.ArchiveHub }))));
const AnalyticsHub      = React.memo(React.lazy(() => import('./AnalyticsHub').then(m => ({ default: m.AnalyticsHub }))));
const GlobalEmployeeManager = React.memo(React.lazy(() => import('./GlobalEmployeeManager').then(m => ({ default: m.GlobalEmployeeManager }))));
const GlobalAuditHub    = React.memo(React.lazy(() => import('./GlobalAuditHub').then(m => ({ default: m.GlobalAuditHub }))));
const AttendanceHub     = React.memo(React.lazy(() => import('./AttendanceHub').then(m => ({ default: m.AttendanceHub }))));
const MassBackfillHub   = React.memo(React.lazy(() => import('./MassBackfillHub').then(m => ({ default: m.MassBackfillHub }))));
const ExpensesHub       = React.memo(React.lazy(() => import('./ExpensesHub').then(m => ({ default: m.ExpensesHub }))));
const PayrollHub        = React.memo(React.lazy(() => import('./PayrollHub').then(m => ({ default: m.PayrollHub }))));
const RequestsHub       = React.memo(React.lazy(() => import('./RequestsHub').then(m => ({ default: m.RequestsHub }))));
const ComplaintsHub     = React.memo(React.lazy(() => import('./ComplaintsHub').then(m => ({ default: m.ComplaintsHub }))));
const WeeklyRemittancesHub = React.memo(React.lazy(() => import('./WeeklyRemittancesHub').then(m => ({ default: m.WeeklyRemittancesHub }))));
const VaultFundHub      = React.memo(React.lazy(() => import('./VaultFundHub').then(m => ({ default: m.VaultFundHub }))));
const PortalUsersSection = React.memo(React.lazy(() => import('./PortalUsersSection').then(m => ({ default: m.PortalUsersSection }))));
const DevicesHub        = React.memo(React.lazy(() => import('./DevicesHub').then(m => ({ default: m.DevicesHub }))));
const InsightsHub       = React.memo(React.lazy(() => import('./InsightsHub').then(m => ({ default: m.InsightsHub }))));
const HowToSection      = React.memo(React.lazy(() => import('../dashboard/sections/HowToSection').then(m => ({ default: m.HowToSection }))));
const ReportAuditHub    = React.memo(React.lazy(() => import('./ReportAuditHub').then(m => ({ default: m.ReportAuditHub }))));
const ServiceTemplatesHub = React.memo(React.lazy(() => import('./ServiceTemplatesHub').then(m => ({ default: m.ServiceTemplatesHub }))));

import { SuperAdminNavbar } from '../navigation/SuperAdminNavbar';
import { playSound, resumeAudioContext } from '../../lib/audio';
import { getTrueDate, formatManilaDate, formatManilaTime } from '../../lib/time';
import { useServiceCatalogs } from '../../hooks/useNetworkData';

import { useScopedData } from './hooks/useScopedData';
import { useSuspiciousActivity } from './hooks/useSuspiciousActivity';
import { useAdminBranchHandlers } from './hooks/useAdminBranchHandlers';
import { useMyAccount } from './hooks/useMyAccount';
import { ConfirmModal } from './modals/ConfirmModal';
import type { ConfirmState } from './modals/ConfirmModal';
import { AddBranchModal } from './modals/AddBranchModal';
import { BulkAddModal } from './modals/BulkAddModal';
import { MyAccountModal } from './modals/MyAccountModal';
import { SuspiciousActivityBanner } from './SuspiciousActivityBanner';

interface SuperAdminDashboardProps {
  user: Exclude<AuthState['user'], null>;
  branches: Branch[];
  transactions: Transaction[];
  expenses: Expense[];
  employees: Employee[];
  attendance: Attendance[];
  auditLogs: AuditLog[];
  requests: Request[];
  onlineUsers: Record<string, boolean>;
  salesReports: SalesReport[];
  salesReportsLoading?: boolean;
  vaultTransactions?: VaultTransaction[];
  complaints?: EmployeeComplaint[];
  onRefresh?: (quiet?: boolean) => void;
  onSyncStatusChange?: (isSyncing: boolean) => void;
  fetchSystemConfig?: () => Promise<void>;
  permissions?: PortalPermissions; // undefined = superadmin (full access)
  onPreviewBranch?: (branchId: string) => void;
}

type AdminTab = 'network' | 'catalogs' | 'sales_hub' | 'analytics' | 'employees' | 'archive' | 'settings' | 'audit' | 'how_to' | 'backfill' | 'expenses' | 'attendance' | 'payroll' | 'requests' | 'remittances' | 'vault' | 'portal_users' | 'devices' | 'insights' | 'report_audit' | 'complaints' | 'service_templates';

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

const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
  user, branches, transactions, expenses, auditLogs, salesReports, salesReportsLoading = false, vaultTransactions = [],
  employees, attendance, requests, complaints = [], onRefresh, onSyncStatusChange, fetchSystemConfig, permissions, onPreviewBranch,
}) => {
  const queryClient = useQueryClient();
  const isPortalUser = !!permissions;
  const isReadOnly = permissions ? permissions.readOnly !== false : false;

  const initialTab = useMemo<AdminTab>(() => {
    const saved = localStorage.getItem(`superadmin_tab_${user?.employeeId ?? 'default'}`) as AdminTab | null;
    if (!permissions) return saved || 'sales_hub';
    const allowedTabs = new Set(Object.entries(permissions.tabs).filter(([, v]) => v).map(([k]) => k));
    if (saved && allowedTabs.has(saved)) return saved;
    const first = Object.entries(permissions.tabs).find(([, v]) => v)?.[0];
    return (first as AdminTab) || 'sales_hub';
  }, []);

  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [mountedTabs, setMountedTabs] = useState<Set<AdminTab>>(new Set([initialTab]));
  const [auditOpenAllDates, setAuditOpenAllDates] = useState(false);

  // ── Scoped data (portal user branch restrictions) ────────────────────────
  const {
    scopedBranches, scopedSalesReports, scopedTransactions, scopedExpenses,
    scopedEmployees, scopedAttendance, scopedAuditLogs, scopedRequests,
  } = useScopedData({ isPortalUser, permissions, branches, salesReports, transactions, expenses, employees, attendance, auditLogs, requests: requests as any[] });

  // ── Security flags ───────────────────────────────────────────────────────
  const { recentHighFlags, dismissFlag, dismissAllFlags } = useSuspiciousActivity(scopedAuditLogs, branches);

  // ── Branch CRUD handlers ─────────────────────────────────────────────────
  const {
    isSaving,
    newBranchName, setNewBranchName,
    showAddModal, setShowAddModal,
    showBulkAddModal, setShowBulkAddModal,
    bulkInput, setBulkInput,
    handleSaveBranch, handleToggleBranch, handleToggleFaceId, handleResetPin,
    handleDeleteBranch, handleForceLogout, handleAddBranch, handleBulkRegister,
  } = useAdminBranchHandlers({ branches, employees, onRefresh, onSyncStatusChange, setConfirmState, fetchSystemConfig });

  // ── My Account (portal users) ────────────────────────────────────────────
  const {
    showMyAccount, setShowMyAccount, openMyAccount,
    myAccountForm, setMyAccountForm,
    myAccountSaving, myAccountError, myAccountSuccess,
    handleUpdateMyAccount,
  } = useMyAccount(user, isPortalUser);

  // ── Service catalogs ─────────────────────────────────────────────────────
  const { data: serviceCatalogsData, refetch: refetchCatalogs } = useServiceCatalogs();
  const masterCatalogs = useMemo(() => {
    if (!serviceCatalogsData) return [];
    return serviceCatalogsData.map(d => ({
      id: d.id,
      name: d.name,
      services: (d.services || []).map((s: any) => ({
        ...s,
        catalogId: s.catalogId || d.id,
        catalogName: s.catalogName || d.name,
        canBeLoyalty: d.can_be_loyalty || false,
      })),
      branchIds: d.branchIds || [],
      can_be_loyalty: d.can_be_loyalty || false,
    }));
  }, [serviceCatalogsData]);

  // Live tab: poll every 2 minutes as a fallback when the realtime WebSocket drops.
  // Reports tab: poll hourly — historical data doesn't need frequent polling.
  // No immediate invalidation on tab entry: staleTime (2 min) on the query already
  // prevents a redundant refetch if data just loaded.
  useEffect(() => {
    if (activeTab === 'sales_hub') {
      const interval = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ['salesReportsHot'] });
        queryClient.invalidateQueries({ queryKey: ['salesReportsWarm'] });
      }, 2 * 60 * 1000);
      return () => clearInterval(interval);
    }
    if (activeTab === 'archive') {
      const interval = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ['salesReportsHot'] });
        queryClient.invalidateQueries({ queryKey: ['salesReportsWarm'] });
      }, 60 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [activeTab, queryClient]);

  const handleTabChange = (id: AdminTab) => {
    resumeAudioContext();
    setMountedTabs(prev => { const n = new Set(prev); n.add(id); return n; });
    setActiveTab(id);
    localStorage.setItem(`superadmin_tab_${user?.employeeId ?? 'default'}`, id);
    setEditingBranchId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRefresh = useCallback(() => { onRefresh?.(); }, [onRefresh]);

  const editingBranch = branches.find(b => b.id === editingBranchId);

  return (
    <div className="bg-slate-50 min-h-screen flex flex-col">

      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div className="sticky top-14 sm:top-16 z-[1000] no-print">
        <div className="bg-white border-b border-slate-100 py-1 px-4">
          <div className={`${UI_THEME.layout.maxContent} ${UI_THEME.layout.mainPadding} h-10 flex justify-between items-center`}>
            <div className="flex items-center gap-1.5">
              <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <LiveClock />
            </div>
            <div className="flex items-center gap-2">
              {isPortalUser && (
                <button
                  onClick={openMyAccount}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors active:scale-95"
                >
                  <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-emerald-700 uppercase leading-none">{(user.username || '?').charAt(0)}</span>
                  </div>
                  <span className="text-xs font-semibold text-slate-600">{user.username}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <SuperAdminNavbar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          employees={employees}
          isSticky={false}
          pendingRequestsCount={(scopedRequests as any[]).filter((r: any) => r.status === 'PENDING').length}
          pendingComplaintsCount={complaints.filter(c => c.status === 'PENDING').length}
          allowedTabs={isPortalUser ? Object.entries(permissions!.tabs).filter(([, v]) => v).map(([k]) => k) : undefined}
        />
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <ConfirmModal
        state={confirmState}
        onClose={() => setConfirmState(p => ({ ...p, isOpen: false }))}
      />

      {showBulkAddModal && (
        <BulkAddModal
          bulkInput={bulkInput}
          isSaving={isSaving}
          onChangeInput={setBulkInput}
          onSubmit={handleBulkRegister}
          onClose={() => setShowBulkAddModal(false)}
        />
      )}

      {showAddModal && (
        <AddBranchModal
          newBranchName={newBranchName}
          isSaving={isSaving}
          onChangeName={setNewBranchName}
          onSubmit={handleAddBranch}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {editingBranchId && editingBranch && (
        <React.Suspense fallback={null}>
          <BranchEditor
            branch={editingBranch}
            employees={employees}
            masterServices={masterCatalogs.filter(c => (c.branchIds || []).includes(editingBranch.id)).flatMap(c => c.services)}
            transactions={transactions}
            salesReports={salesReports}
            attendance={attendance}
            onSave={handleSaveBranch}
            onToggle={handleToggleBranch}
            onToggleFaceId={() => handleToggleFaceId(editingBranch.id, editingBranch.faceIdEnabled !== false)}
            isFaceIdDisabled={editingBranch.faceIdEnabled === false}
            onResetPin={handleResetPin}
            onForceLogout={handleForceLogout}
            onDelete={handleDeleteBranch}
            onClose={() => setEditingBranchId(null)}
            isSaving={isSaving}
            isReadOnly={isReadOnly}
            setConfirmState={setConfirmState as any}
          />
        </React.Suspense>
      )}

      {showMyAccount && isPortalUser && (
        <MyAccountModal
          user={user}
          form={myAccountForm}
          saving={myAccountSaving}
          error={myAccountError}
          success={myAccountSuccess}
          onChange={setMyAccountForm}
          onSubmit={handleUpdateMyAccount}
          onClose={() => setShowMyAccount(false)}
          branches={branches}
        />
      )}

      {/* ── Portal user context banner ────────────────────────────────────── */}
      {isPortalUser && (
        <div className="bg-white border-b border-slate-100">
          <div className={`${UI_THEME.layout.maxContent} ${UI_THEME.layout.mainPadding} flex items-center gap-2.5 h-8`}>
            <svg className="w-3 h-3 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span className="text-[11px] font-bold text-indigo-500 uppercase tracking-widest">Portal Access</span>
            {permissions?.branchIds && permissions.branchIds.length > 0 && (
              <>
                <span className="text-slate-300 text-[10px]">·</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-[11px] font-semibold text-indigo-600">
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  {permissions.branchIds.length === 1
                    ? scopedBranches[0]?.name || '1 Branch'
                    : `${permissions.branchIds.length} Branches`}
                </span>
              </>
            )}
            {isReadOnly && (
              <>
                <span className="text-slate-300 text-[10px]">·</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-600 uppercase tracking-wide">
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Read Only
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Tab content ───────────────────────────────────────────────────── */}
      <main className={`flex-1 ${UI_THEME.layout.mainPadding} ${UI_THEME.layout.maxContent} w-full pb-32 pt-4 md:pt-8`}>
        <React.Suspense fallback={<div className="h-32 flex items-center justify-center"><div className="w-6 h-6 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" /></div>}>
          {mountedTabs.has('sales_hub')    && <div className={activeTab !== 'sales_hub'    ? 'hidden' : ''}><SalesHub branches={scopedBranches} salesReports={scopedSalesReports} salesReportsLoading={salesReportsLoading} employees={scopedEmployees} onRefresh={onRefresh} /></div>}
          {mountedTabs.has('devices')      && <div className={activeTab !== 'devices'      ? 'hidden' : ''}><DevicesHub branches={branches} /></div>}
          {mountedTabs.has('attendance')   && <div className={activeTab !== 'attendance'   ? 'hidden' : ''}><AttendanceHub attendance={scopedAttendance} branches={scopedBranches} employees={scopedEmployees} onRefresh={handleRefresh} isReadOnly={isReadOnly} /></div>}
          {mountedTabs.has('expenses')     && <div className={activeTab !== 'expenses'     ? 'hidden' : ''}><ExpensesHub branches={scopedBranches} salesReports={scopedSalesReports} /></div>}
          {mountedTabs.has('audit')        && <div className={activeTab !== 'audit'        ? 'hidden' : ''}><GlobalAuditHub branches={scopedBranches} auditLogs={scopedAuditLogs} openAllDates={auditOpenAllDates} /></div>}
          {mountedTabs.has('analytics')   && <div className={activeTab !== 'analytics'    ? 'hidden' : ''}><AnalyticsHub branches={scopedBranches} salesReports={scopedSalesReports} /></div>}
          {mountedTabs.has('employees')    && <div className={activeTab !== 'employees'    ? 'hidden' : ''}><GlobalEmployeeManager branches={scopedBranches} employees={scopedEmployees} onRefresh={handleRefresh} onSyncStatusChange={onSyncStatusChange} isReadOnly={isReadOnly} /></div>}
          {mountedTabs.has('archive')      && <div className={activeTab !== 'archive'      ? 'hidden' : ''}><ArchiveHub branches={scopedBranches} salesReports={scopedSalesReports} salesReportsLoading={salesReportsLoading} employees={scopedEmployees} isReadOnly={isReadOnly} onRefresh={handleRefresh} /></div>}
          {mountedTabs.has('vault')        && <div className={activeTab !== 'vault'        ? 'hidden' : ''}><VaultFundHub branches={scopedBranches} salesReports={scopedSalesReports} vaultTransactions={vaultTransactions} isReadOnly={isReadOnly} onRefresh={handleRefresh} /></div>}
          {mountedTabs.has('payroll')      && <div className={activeTab !== 'payroll'      ? 'hidden' : ''}><PayrollHub branches={scopedBranches} transactions={scopedTransactions} expenses={scopedExpenses} employees={scopedEmployees} attendance={scopedAttendance} salesReports={scopedSalesReports} onRefresh={handleRefresh} /></div>}
          {mountedTabs.has('requests')     && <div className={activeTab !== 'requests'     ? 'hidden' : ''}><RequestsHub requests={scopedRequests as any} employees={scopedEmployees} branches={scopedBranches} salesReports={scopedSalesReports} onRefresh={handleRefresh} isReadOnly={isReadOnly} reviewerName={user.username || user.name || 'SUPERADMIN'} /></div>}
          {mountedTabs.has('complaints')   && <div className={activeTab !== 'complaints'   ? 'hidden' : ''}><ComplaintsHub complaints={complaints} employees={scopedEmployees} branches={scopedBranches} onRefresh={handleRefresh} isReadOnly={isReadOnly} reviewerName={user.username || user.name || 'SUPERADMIN'} /></div>}
          {mountedTabs.has('remittances')  && <div className={activeTab !== 'remittances'  ? 'hidden' : ''}><WeeklyRemittancesHub branches={scopedBranches} salesReports={scopedSalesReports} onRefresh={handleRefresh} isReadOnly={isReadOnly} addedBy={user.username || 'SUPERADMIN'} /></div>}
          {mountedTabs.has('backfill')     && <div className={activeTab !== 'backfill'     ? 'hidden' : ''}><MassBackfillHub branches={scopedBranches} employees={scopedEmployees} salesReports={scopedSalesReports} onRefresh={handleRefresh} isReadOnly={isReadOnly} /></div>}
          {mountedTabs.has('network')      && <div className={activeTab !== 'network'      ? 'hidden' : ''}><NetworkManager branches={branches} onAdd={() => setShowAddModal(true)} onAddBulk={() => setShowBulkAddModal(true)} onEdit={setEditingBranchId} onToggle={handleToggleBranch} isReadOnly={isReadOnly} /></div>}
          {mountedTabs.has('catalogs')     && <div className={activeTab !== 'catalogs'     ? 'hidden' : ''}><ServiceCatalog branches={branches} catalogs={masterCatalogs} setConfirmState={setConfirmState} onSave={async () => { await refetchCatalogs(); playSound('success'); if (onRefresh) await onRefresh(true); }} /></div>}
          {mountedTabs.has('settings')     && <div className={activeTab !== 'settings'     ? 'hidden' : ''}><SettingsHub onRefresh={onRefresh} /></div>}
          {mountedTabs.has('portal_users') && <div className={activeTab !== 'portal_users' ? 'hidden' : ''}><PortalUsersSection currentUserId={user.employeeId} branches={branches} /></div>}
          {mountedTabs.has('insights')      && <div className={activeTab !== 'insights'      ? 'hidden' : ''}><InsightsHub branches={scopedBranches} salesReports={scopedSalesReports} /></div>}
          {mountedTabs.has('report_audit')  && <div className={activeTab !== 'report_audit'  ? 'hidden' : ''}><ReportAuditHub branches={scopedBranches} salesReports={scopedSalesReports} vaultTransactions={vaultTransactions} /></div>}
          {mountedTabs.has('how_to')            && <div className={activeTab !== 'how_to'            ? 'hidden' : ''}><HowToSection role={UserRole.SUPERADMIN} /></div>}
          {mountedTabs.has('service_templates') && <div className={activeTab !== 'service_templates' ? 'hidden' : ''}><ServiceTemplatesHub branches={branches} isReadOnly={isReadOnly} onRefresh={handleRefresh} /></div>}
        </React.Suspense>
      </main>

      {/* ── Security alerts banner ────────────────────────────────────────── */}
      {!isPortalUser && (
        <SuspiciousActivityBanner
          flags={recentHighFlags}
          onDismiss={dismissFlag}
          onDismissAll={dismissAllFlags}
          onViewAudit={() => { setAuditOpenAllDates(true); handleTabChange('audit'); dismissAllFlags(); }}
        />
      )}
    </div>
  );
};

export default SuperAdminDashboard;
