import React, { useState, useMemo, useEffect } from 'react';
import { Branch, Transaction, Expense, Service, AuditLog, SalesReport, Employee, Attendance, UserRole, AuthState, PortalPermissions } from '../../types';
import { UI_THEME } from '../../constants/ui_designs';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';

// Modular Imports
import { ServiceCatalog, CatalogGroup } from './ServiceCatalog';
import { NetworkManager } from './NetworkManager';
import { BranchEditor } from './BranchEditor';
import { SalesHub } from './SalesHub';
import { GlobalServicesMatrix } from './Matrix';
import { SettingsHub } from './SettingsHub';
import { ArchiveHub } from './ArchiveHub';
import { AnalyticsHub } from './AnalyticsHub';
import { GlobalEmployeeManager } from './GlobalEmployeeManager';
import { GlobalAuditHub } from './GlobalAuditHub';
import { AttendanceHub } from './AttendanceHub';
import { MassBackfillHub } from './MassBackfillHub';
import { ExpensesHub } from './ExpensesHub';
import { PayrollHub } from './PayrollHub';
import { RequestsHub } from './RequestsHub';
import { WeeklyRemittancesHub } from './WeeklyRemittancesHub';
import { BillsCatalogHub } from './BillsCatalogHub';
import { PortalUsersSection } from './PortalUsersSection';
import { HowToSection } from '../dashboard/sections/HowToSection';
import { SuperAdminNavbar } from '../navigation/SuperAdminNavbar';
import { playSound, resumeAudioContext } from '../../lib/audio';
import { hashPin, generateSalt } from '../../lib/crypto';
import { toDateStr } from '@/src/utils/reportUtils';
import { getTrueDate, formatManilaDate, formatManilaTime, isTimeSynced, getTrueISOString } from '../../lib/time';
import { useUpdateBranch, useDeleteBranch, useAddBranch, useServiceCatalogs, useUpdateEmployee } from '../../hooks/useNetworkData';
import { logAudit } from '../../lib/audit';

interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  variant?: 'danger' | 'success' | 'warning';
  confirmText?: string;
  showCancel?: boolean;
}

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
  onRefresh?: (quiet?: boolean) => void;
  onSyncStatusChange?: (isSyncing: boolean) => void;
  permissions?: PortalPermissions; // undefined = superadmin (full access)
}

type AdminTab = 'network' | 'catalogs' | 'sales_hub' | 'analytics' | 'employees' | 'archive' | 'settings' | 'audit' | 'how_to' | 'backfill' | 'expenses' | 'attendance' | 'payroll' | 'requests' | 'remittances' | 'bills' | 'portal_users';

const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ user, branches, transactions, expenses, auditLogs, salesReports, employees, attendance, requests, onRefresh, onSyncStatusChange, permissions }) => {
  const isPortalUser = !!permissions;
  const isReadOnly = permissions ? permissions.readOnly !== false : false;

  const initialTab = useMemo<AdminTab>(() => {
    if (!permissions) return 'sales_hub';
    const first = Object.entries(permissions.tabs).find(([, v]) => v)?.[0];
    return (first as AdminTab) || 'sales_hub';
  }, []);

  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkAddModal, setShowBulkAddModal] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // My Account (portal users only)
  const [showMyAccount, setShowMyAccount] = useState(false);
  const [myAccountForm, setMyAccountForm] = useState({ username: '', confirmUsername: '', pin: '', confirmPin: '' });
  const [myAccountSaving, setMyAccountSaving] = useState(false);
  const [myAccountError, setMyAccountError] = useState('');
  const [myAccountSuccess, setMyAccountSuccess] = useState(false);

  useEffect(() => {
    if (!showMyAccount || !isPortalUser || !user.employeeId) return;
    supabase
      .from(DB_TABLES.PORTAL_USERS)
      .select('username')
      .eq('id', user.employeeId)
      .single()
      .then(({ data }) => {
        if (data) setMyAccountForm({ username: data.username, confirmUsername: data.username, pin: '', confirmPin: '' });
      });
  }, [showMyAccount]);

  const handleUpdateMyAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setMyAccountError('');
    setMyAccountSuccess(false);

    const newUsername = myAccountForm.username.trim().toLowerCase();
    if (!newUsername) { setMyAccountError('Username cannot be empty.'); return; }
    if (newUsername !== myAccountForm.confirmUsername.trim().toLowerCase()) {
      setMyAccountError('Usernames do not match.'); return;
    }

    if (myAccountForm.pin) {
      if (!/^\d{6,}$/.test(myAccountForm.pin)) { setMyAccountError('PIN must be at least 6 digits.'); return; }
      if (myAccountForm.pin !== myAccountForm.confirmPin) { setMyAccountError('PINs do not match.'); return; }
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };

    // Check username conflict (against other users)
    const { data: conflict } = await supabase
      .from(DB_TABLES.PORTAL_USERS)
      .select('id')
      .eq(DB_COLUMNS.USERNAME, newUsername)
      .neq('id', user.employeeId!)
      .maybeSingle();
    if (conflict) { setMyAccountError('That username is already in use.'); return; }
    updates[DB_COLUMNS.USERNAME] = newUsername;

    if (myAccountForm.pin) {
      const salt = generateSalt();
      const hash = await hashPin(myAccountForm.pin, salt);
      updates[DB_COLUMNS.LOGIN_PIN] = hash;
      updates[DB_COLUMNS.PIN_SALT] = salt;
    }

    setMyAccountSaving(true);
    try {
      const { error } = await supabase
        .from(DB_TABLES.PORTAL_USERS)
        .update(updates)
        .eq('id', user.employeeId!);
      if (error) throw error;
      playSound('success');
      setMyAccountSuccess(true);
      setMyAccountForm(f => ({ ...f, confirmUsername: f.username, pin: '', confirmPin: '' }));
    } catch {
      setMyAccountError('Failed to save. Please try again.');
    } finally {
      setMyAccountSaving(false);
    }
  };

  // ── Branch-scoped data for portal users ─────────────────
  const allowedBranchIds = useMemo<string[] | null>(() => {
    if (!isPortalUser || !permissions) return null; // superadmin: no restriction
    const ids = permissions.branchIds;
    if (!ids || ids.length === 0) return null; // no restriction set: see all
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
        canBeLoyalty: d.can_be_loyalty || false
      })),
      branchIds: d.branchIds || [],
      can_be_loyalty: d.can_be_loyalty || false
    }));
  }, [serviceCatalogsData]);

  const updateBranch = useUpdateBranch();
  const updateEmployee = useUpdateEmployee();
  const deleteBranch = useDeleteBranch();
  const addBranch = useAddBranch();
  
  const handleSaveBranch = async (updated: Branch) => {
    setIsSaving(true);
    if (onSyncStatusChange) onSyncStatusChange(true);
    try {
      const oldManagerName = branches.find(b => b.id === updated.id)?.manager?.toUpperCase().trim();
      const newManagerName = updated.manager?.toUpperCase().trim();
      const managerChanged = oldManagerName !== newManagerName;

      const oldTempManagerName = branches.find(b => b.id === updated.id)?.tempManager?.toUpperCase().trim();
      const newTempManagerName = updated.tempManager?.toUpperCase().trim();
      const tempManagerChanged = oldTempManagerName !== newTempManagerName;

      const hasManager = (updated.manager && updated.manager.trim() !== '') || (updated.tempManager && updated.tempManager.trim() !== '');
      const finalIsOpen = hasManager ? updated.isOpen : false;

      await updateBranch.mutateAsync({
        id: updated.id,
        [DB_COLUMNS.NAME]: updated.name,
        [DB_COLUMNS.MANAGER]: updated.manager,
        [DB_COLUMNS.TEMP_MANAGER]: updated.tempManager,
        [DB_COLUMNS.IS_PIN_CHANGED]: updated.isPinChanged,
        [DB_COLUMNS.IS_OPEN]: finalIsOpen,
        [DB_COLUMNS.WEEKLY_CUTOFF]: updated.weeklyCutoff.toString(),
        [DB_COLUMNS.CYCLE_START_DATE]: updated.cycleStartDate,
        [DB_COLUMNS.DAILY_PROVISION_AMOUNT]: updated.dailyProvisionAmount,
        [DB_COLUMNS.ENABLE_SHIFT_TRACKING]: updated.enableShiftTracking,
        [DB_COLUMNS.OPENING_TIME]: updated.openingTime,
        [DB_COLUMNS.CLOSING_TIME]: updated.closingTime,
        [DB_COLUMNS.OWNERS]: JSON.stringify(updated.owners || []),
        [DB_COLUMNS.GROUP_LEVY]: updated.groupLevy ? JSON.stringify(updated.groupLevy) : null
      });

      // Handle Manager Role Persistence
      if (managerChanged || tempManagerChanged) {
        const branchId = updated.id;
        const employeeUpdates: Promise<any>[] = [];

        // 1. Update Old Manager (if exists)
        if (oldManagerName && managerChanged) {
          const oldManager = employees.find(e => (e.name || '').toUpperCase().trim() === oldManagerName);
          if (oldManager) {
            // Check if they are still a manager of ANY OTHER branch (primary or temp)
            const isManagerElsewhere = branches.some(b => 
              b.id !== branchId && 
              (b.manager?.toUpperCase().trim() === oldManagerName || b.tempManager?.toUpperCase().trim() === oldManagerName)
            );

            const currentRoles = (oldManager.role || '').split(',').filter(Boolean);
            let nextRoles = [...currentRoles];
            
            if (!isManagerElsewhere) {
              nextRoles = nextRoles.filter(r => r !== 'MANAGER');
              if (nextRoles.length === 0) nextRoles.push('THERAPIST');
            }
            
            const finalRoles = nextRoles.join(',');
            
            const nextAllowances = { ...(oldManager.branchAllowances || {}) };
            if (nextAllowances[branchId]) {
              const allowance = nextAllowances[branchId];
              // For the branch they were removed from, they should be a THERAPIST (or whatever their non-manager role is)
              const branchSpecificRole = 'THERAPIST'; 
              if (typeof allowance === 'object' && allowance !== null) {
                nextAllowances[branchId] = { ...allowance, role: branchSpecificRole };
              } else {
                nextAllowances[branchId] = { allowance: Number(allowance), role: branchSpecificRole };
              }
            }

            employeeUpdates.push(updateEmployee.mutateAsync({
              id: oldManager.id,
              [DB_COLUMNS.ROLE]: finalRoles,
              [DB_COLUMNS.BRANCH_ALLOWANCES]: nextAllowances
            }));
          }
        }

        // 2. Update New Manager (if exists)
        if (newManagerName && managerChanged) {
          const newManager = employees.find(e => (e.name || '').toUpperCase().trim() === newManagerName);
          if (newManager) {
            const currentRoles = (newManager.role || '').split(',').filter(Boolean);
            if (!currentRoles.includes('MANAGER')) {
              currentRoles.push('MANAGER');
            }
            const finalRoles = currentRoles.join(',');

            const nextAllowances = { ...(newManager.branchAllowances || {}) };
            const currentAllowance = nextAllowances[branchId];
            const allowanceVal = typeof currentAllowance === 'object' && currentAllowance !== null 
              ? currentAllowance.allowance 
              : (Number(currentAllowance) || newManager.allowance || 0);

            // For the branch they are now managing, they should be a MANAGER
            nextAllowances[branchId] = { allowance: allowanceVal, role: 'MANAGER' };

            employeeUpdates.push(updateEmployee.mutateAsync({
              id: newManager.id,
              [DB_COLUMNS.ROLE]: finalRoles,
              [DB_COLUMNS.BRANCH_ID]: branchId,
              [DB_COLUMNS.BRANCH_ALLOWANCES]: nextAllowances
            }));
          }
        }

        // 3. Update Old Temp Manager (if exists)
        if (oldTempManagerName && tempManagerChanged) {
          const oldTempManager = employees.find(e => (e.name || '').toUpperCase().trim() === oldTempManagerName);
          if (oldTempManager) {
            // Check if they are still a manager elsewhere
            const isManagerElsewhere = branches.some(b => 
              b.id !== branchId && 
              (b.manager?.toUpperCase().trim() === oldTempManagerName || b.tempManager?.toUpperCase().trim() === oldTempManagerName)
            );

            const currentRoles = (oldTempManager.role || '').split(',').filter(Boolean);
            let nextRoles = [...currentRoles];
            
            if (!isManagerElsewhere) {
              nextRoles = nextRoles.filter(r => r !== 'MANAGER');
              if (nextRoles.length === 0) nextRoles.push('THERAPIST');
            }
            
            const finalRoles = nextRoles.join(',');
            
            const nextAllowances = { ...(oldTempManager.branchAllowances || {}) };
            if (nextAllowances[branchId]) {
              const allowance = nextAllowances[branchId];
              // For the branch they were removed from, they should be a THERAPIST
              const branchSpecificRole = 'THERAPIST';
              if (typeof allowance === 'object' && allowance !== null) {
                nextAllowances[branchId] = { ...allowance, role: branchSpecificRole };
              } else {
                nextAllowances[branchId] = { allowance: Number(allowance), role: branchSpecificRole };
              }
            }

            employeeUpdates.push(updateEmployee.mutateAsync({
              id: oldTempManager.id,
              [DB_COLUMNS.ROLE]: finalRoles,
              [DB_COLUMNS.BRANCH_ALLOWANCES]: nextAllowances
            }));
          }
        }

        // 4. Update New Temp Manager (if exists)
        if (newTempManagerName && tempManagerChanged) {
          const newTempManager = employees.find(e => (e.name || '').toUpperCase().trim() === newTempManagerName);
          if (newTempManager) {
            const currentRoles = (newTempManager.role || '').split(',').filter(Boolean);
            if (!currentRoles.includes('MANAGER')) {
              currentRoles.push('MANAGER');
            }
            const finalRoles = currentRoles.join(',');

            const nextAllowances = { ...(newTempManager.branchAllowances || {}) };
            const currentAllowance = nextAllowances[branchId];
            const allowanceVal = typeof currentAllowance === 'object' && currentAllowance !== null 
              ? currentAllowance.allowance 
              : (Number(currentAllowance) || newTempManager.allowance || 0);

            // For the branch they are now managing, they should be a MANAGER
            nextAllowances[branchId] = { allowance: allowanceVal, role: 'MANAGER' };

            employeeUpdates.push(updateEmployee.mutateAsync({
              id: newTempManager.id,
              [DB_COLUMNS.ROLE]: finalRoles,
              [DB_COLUMNS.BRANCH_ALLOWANCES]: nextAllowances
            }));
          }
        }

        if (employeeUpdates.length > 0) {
          await Promise.all(employeeUpdates);
        }
      }

      onRefresh?.(true);
    } catch (e) {
      console.error(e);
      throw e;
    } finally {
      setIsSaving(false);
      if (onSyncStatusChange) onSyncStatusChange(false);
    }
  };

  const handleToggleBranch = async (id: string, currentlyEnabled: boolean) => {
    try {
      await updateBranch.mutateAsync({
        id,
        [DB_COLUMNS.IS_ENABLED]: !currentlyEnabled
      });

      const b = branches.find(br => br.id === id);
      await logAudit({
        branchId: id,
        activityType: 'UPDATE',
        entityType: 'BRANCH',
        entityId: id,
        description: `Branch access ${currentlyEnabled ? 'SUSPENDED' : 'RESTORED'} for ${b?.name}`,
        performerName: user.username
      });

      onRefresh?.(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetPin = async (branch: Branch) => {
    const newPin = Math.floor(100000 + Math.random() * 900000).toString();
    try {
      await updateBranch.mutateAsync({
        id: branch.id,
        [DB_COLUMNS.PIN]: newPin,
        [DB_COLUMNS.IS_PIN_CHANGED]: false
      });

      await logAudit({
        branchId: branch.id,
        activityType: 'UPDATE',
        entityType: 'SECURITY',
        entityId: branch.id,
        description: `Access PIN reset by SuperAdmin for ${branch.name}`,
        performerName: user.username
      });

      onRefresh?.(true);
      return newPin;
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const handleDeleteBranch = async (id: string) => {
    const branchEmployees = employees.filter(e => e.branchId === id);
    if (branchEmployees.length > 0) {
      setConfirmState({
        isOpen: true,
        title: 'Deletion Blocked',
        message: `This branch still has ${branchEmployees.length} employee records (active or inactive). Please reassign or remove them before deleting the branch.`,
        variant: 'warning',
        confirmText: 'Understood',
        showCancel: false,
        onConfirm: () => setConfirmState(p => ({ ...p, isOpen: false }))
      });
      return;
    }

    try {
      const b = branches.find(br => br.id === id);
      await deleteBranch.mutateAsync(id);

      await logAudit({
        branchId: null,
        activityType: 'DELETE',
        entityType: 'BRANCH',
        entityId: id,
        description: `Branch ERASED: ${b?.name}`,
        performerName: user.username
      });

      onRefresh?.(true);
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const handleForceLogout = async (branchId: string) => {
    try {
      const { data: configData } = await supabase.from(DB_TABLES.SYSTEM_CONFIG).select('*').eq(DB_COLUMNS.KEY, 'force_logout_registry').single();
      let registry: Record<string, number> = {};
      if (configData) {
        try { registry = JSON.parse(configData.value); } catch {}
      }
      registry[branchId] = getTrueDate().getTime();

      const { error } = await supabase.from(DB_TABLES.SYSTEM_CONFIG).upsert({
        [DB_COLUMNS.KEY]: 'force_logout_registry',
        [DB_COLUMNS.VALUE]: JSON.stringify(registry)
      }, { onConflict: DB_COLUMNS.KEY });

      if (error) throw error;

      const b = branches.find(br => br.id === branchId);
      await logAudit({
        branchId: branchId,
        activityType: 'UPDATE',
        entityType: 'SECURITY',
        entityId: branchId,
        description: `Remote session termination triggered by SuperAdmin for ${b?.name}`,
        performerName: user.username
      });

      onRefresh?.(true);
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim() || isSaving) return;
    setIsSaving(true);
    if (onSyncStatusChange) onSyncStatusChange(true);
    try {
      const id = Math.random().toString(36).substr(2, 9);
      const cleanName = newBranchName.trim().toUpperCase();
      const initialPin = Math.floor(100000 + Math.random() * 900000).toString();

      await addBranch.mutateAsync({
        [DB_COLUMNS.ID]: id,
        [DB_COLUMNS.NAME]: cleanName,
        [DB_COLUMNS.PIN]: initialPin,
        [DB_COLUMNS.IS_PIN_CHANGED]: false,
        [DB_COLUMNS.IS_ENABLED]: true,
        [DB_COLUMNS.CYCLE_START_DATE]: toDateStr(getTrueDate()),
        [DB_COLUMNS.WEEKLY_CUTOFF]: '0'
      });

      await logAudit({
        branchId: id,
        activityType: 'CREATE',
        entityType: 'BRANCH',
        entityId: id,
        description: `New physical branch DEPLOYED: ${cleanName}`,
        performerName: user.username
      });

      setNewBranchName('');
      setShowAddModal(false);
      playSound('success');
      onRefresh?.(true);
    } catch (e) {
      console.error(e);
      setConfirmState({
        isOpen: true,
        title: 'REGISTRATION FAILED',
        message: 'Could not establish new branch. This may be due to a network interruption or duplicate identifier. Please verify connection and retry.',
        variant: 'danger',
        confirmText: 'Acknowledge Error',
        showCancel: false,
        onConfirm: () => setConfirmState(p => ({ ...p, isOpen: false }))
      });
    } finally {
      setIsSaving(false);
      if (onSyncStatusChange) onSyncStatusChange(false);
    }
  };

  const handleBulkRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkInput.trim() || isSaving) return;
    
    const lines = bulkInput.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return;

    setIsSaving(true);
    if (onSyncStatusChange) onSyncStatusChange(true);
    playSound('click');

    try {
      const newBranches = lines.map(name => {
        const initialPin = Math.floor(100000 + Math.random() * 900000).toString();
        return {
          [DB_COLUMNS.NAME]: name.toUpperCase(),
          [DB_COLUMNS.PIN]: initialPin,
          [DB_COLUMNS.IS_PIN_CHANGED]: false,
          [DB_COLUMNS.IS_ENABLED]: true,
          [DB_COLUMNS.CYCLE_START_DATE]: toDateStr(getTrueDate()),
          [DB_COLUMNS.WEEKLY_CUTOFF]: '0'
        };
      });

      // Insert all at once
      const { error } = await supabase.from(DB_TABLES.BRANCHES).insert(newBranches);
      if (error) throw error;

      await logAudit({
        branchId: 'SYSTEM',
        activityType: 'CREATE',
        entityType: 'BRANCH',
        entityId: 'BULK',
        description: `Bulk registered ${newBranches.length} branches`,
        performerName: user.username
      });

      playSound('success');
      setShowBulkAddModal(false);
      setBulkInput('');
      onRefresh?.();
    } catch (e) {
      console.error(e);
      playSound('warning');
      alert('Failed to bulk register branches.');
    } finally {
      setIsSaving(false);
      if (onSyncStatusChange) onSyncStatusChange(false);
    }
  };

  const handleTabChange = (id: AdminTab) => {
    resumeAudioContext();
    setActiveTab(id);
    setEditingBranchId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'network': return <NetworkManager branches={branches} onAdd={() => setShowAddModal(true)} onAddBulk={() => setShowBulkAddModal(true)} onEdit={setEditingBranchId} onToggle={handleToggleBranch} isReadOnly={isReadOnly} />;
      case 'catalogs': return (
          <ServiceCatalog
              branches={branches}
              catalogs={masterCatalogs}
              setConfirmState={setConfirmState}
              onSave={async (cats) => {
                await refetchCatalogs();
                playSound('success');
                if (onRefresh) await onRefresh(true);
              }}
          />
      );
      case 'sales_hub': return <SalesHub branches={scopedBranches} salesReports={scopedSalesReports} employees={scopedEmployees} onRefresh={onRefresh} />;
      case 'analytics': return <AnalyticsHub branches={scopedBranches} salesReports={scopedSalesReports} />;
      case 'employees': return <GlobalEmployeeManager branches={scopedBranches} employees={scopedEmployees} onRefresh={() => onRefresh?.()} onSyncStatusChange={onSyncStatusChange} isReadOnly={isReadOnly} />;
      case 'archive': return <ArchiveHub branches={scopedBranches} salesReports={scopedSalesReports} employees={scopedEmployees} isReadOnly={isReadOnly} />;
      case 'settings': return <SettingsHub onRefresh={onRefresh} />;
      case 'audit': return <GlobalAuditHub branches={scopedBranches} auditLogs={scopedAuditLogs} />;
      case 'attendance': return <AttendanceHub attendance={scopedAttendance} branches={scopedBranches} employees={scopedEmployees} onRefresh={() => onRefresh?.()} isReadOnly={isReadOnly} />;
      case 'payroll': return <PayrollHub branches={scopedBranches} transactions={scopedTransactions} expenses={scopedExpenses} employees={scopedEmployees} attendance={scopedAttendance} salesReports={scopedSalesReports} onRefresh={() => onRefresh?.()} />;
      case 'expenses': return <ExpensesHub branches={scopedBranches} salesReports={scopedSalesReports} />;
      case 'backfill': return <MassBackfillHub branches={scopedBranches} employees={scopedEmployees} salesReports={scopedSalesReports} onRefresh={() => onRefresh?.()} isReadOnly={isReadOnly} />;
      case 'remittances': return <WeeklyRemittancesHub branches={scopedBranches} salesReports={scopedSalesReports} onRefresh={() => onRefresh?.()} isReadOnly={isReadOnly} />;
      case 'bills': return <BillsCatalogHub branches={scopedBranches} isReadOnly={isReadOnly} />;
      case 'requests': return <RequestsHub requests={scopedRequests} employees={scopedEmployees} branches={scopedBranches} salesReports={scopedSalesReports} onRefresh={() => onRefresh?.()} isReadOnly={isReadOnly} />;
      case 'how_to': return <HowToSection role={UserRole.SUPERADMIN} />;
      case 'portal_users': return <PortalUsersSection currentUserId={user.employeeId} branches={branches} />;
      default: return null;
    }
  };

  const editingBranch = branches.find(b => b.id === editingBranchId);

  const [currentTime, setCurrentTime] = useState(getTrueDate());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(getTrueDate());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
      <div className="bg-slate-50 min-h-screen flex flex-col">
        {/* STICKY HEADER CONTAINER */}
        <div className="sticky top-[72px] sm:top-20 z-[1000] no-print">
          {/* TIME BAR */}
          <div className="bg-slate-900 text-white py-1.5 px-4 shadow-md">
            <div className={`${UI_THEME.layout.maxContent} ${UI_THEME.layout.mainPadding} flex justify-between items-center`}>
              <div className="flex items-center gap-2">
                <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <span className="text-[10px] sm:text-[11px] font-bold font-mono tabular-nums tracking-tighter text-slate-100">
                  {formatManilaDate(currentTime, { day: '2-digit', month: 'short' })}
                  {' • '}
                  {formatManilaTime(currentTime)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {isPortalUser && (
                  <button
                    onClick={() => { setShowMyAccount(true); setMyAccountError(''); setMyAccountSuccess(false); }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-white/10 transition-colors active:scale-95"
                  >
                    <div className="w-5 h-5 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                      <span className="text-[9px] font-black text-white uppercase leading-none">{(user.username || '?').charAt(0)}</span>
                    </div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest hidden sm:block">{user.username}</span>
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
              allowedTabs={isPortalUser ? Object.entries(permissions!.tabs).filter(([, v]) => v).map(([k]) => k) : undefined}
          />
        </div>

        {confirmState.isOpen && (
            <div className={UI_THEME.layout.modalWrapper}>
              <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-6 sm:p-10 text-center border border-slate-100`}>
                <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-3xl flex items-center justify-center mx-auto mb-4 sm:mb-8 shadow-xl ${confirmState.variant === 'danger' ? 'bg-rose-50 text-rose-500' : confirmState.variant === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  <svg className="w-8 h-8 sm:w-10 sm:h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <h3 className={UI_THEME.text.title}>{confirmState.title}</h3>
                <p className={`${UI_THEME.text.metadata} leading-relaxed mb-6 sm:mb-10`}>{confirmState.message}</p>
                <div className="flex flex-col gap-3">
                  <button
                      onClick={confirmState.onConfirm}
                      className={`w-full py-4 sm:py-6 ${UI_THEME.radius.pill} ${UI_THEME.text.metadata} shadow-xl ${UI_THEME.styles.buttonBase} ${confirmState.variant === 'danger' ? 'bg-rose-600 hover:bg-rose-500 text-white' : 'bg-slate-900 hover:bg-emerald-600 text-white'}`}
                  >
                    {confirmState.confirmText || 'Confirm Authorization'}
                  </button>
                  {confirmState.showCancel !== false && (
                    <button onClick={() => setConfirmState(p => ({...p, isOpen: false}))} className={`w-full py-2 sm:py-4 text-slate-400 ${UI_THEME.text.metadata}`}>Cancel / Go Back</button>
                  )}
                </div>
              </div>
            </div>
        )}

        {showBulkAddModal && (
            <div className={UI_THEME.layout.modalWrapper}>
              <form onSubmit={handleBulkRegister} className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-6 sm:p-10 space-y-6 sm:space-y-8 border border-slate-100`}>
                <div className="space-y-2">
                  <h3 className={UI_THEME.text.title}>Bulk Branch Registry</h3>
                  <p className={UI_THEME.text.metadata}>Enter branch names (one per line)</p>
                </div>
                <div className="space-y-1 sm:space-y-2">
                  <label className={UI_THEME.text.label}>Branch List</label>
                  <textarea
                      autoFocus
                      required
                      value={bulkInput}
                      onChange={e => setBulkInput(e.target.value)}
                      placeholder="E.G.&#10;MANDALUYONG CENTRAL&#10;PASIG MAIN&#10;MAKATI SOUTH..."
                      rows={8}
                      className={`${UI_THEME.styles.inputBase} ${UI_THEME.radius.input} font-bold text-sm sm:text-base uppercase resize-none`}
                  />
                </div>
                <div className="flex flex-col gap-3 pt-2 sm:pt-4">
                  <button type="submit" disabled={isSaving || !bulkInput.trim()} className={`w-full bg-slate-900 text-white font-black py-4 sm:py-6 ${UI_THEME.radius.pill} ${UI_THEME.text.metadata} shadow-xl hover:bg-emerald-600 ${UI_THEME.styles.buttonBase}`}>
                    {isSaving ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : 'Register Branches'}
                  </button>
                  <button type="button" onClick={() => setShowBulkAddModal(false)} className={`w-full py-2 sm:py-4 text-slate-400 ${UI_THEME.text.metadata}`}>Cancel</button>
                </div>
              </form>
            </div>
        )}

        {showAddModal && (
            <div className={UI_THEME.layout.modalWrapper}>
              <form onSubmit={handleAddBranch} className={`${UI_THEME.layout.modalLarge} ${UI_THEME.radius.modal} p-6 sm:p-10 space-y-4 sm:space-y-8`}>
                <div className="text-center space-y-1 sm:space-y-2">
                  <h3 className={UI_THEME.text.title}>Register Branch</h3>
                  <p className={UI_THEME.text.metadata}>Establish New Physical Branch</p>
                </div>
                <div className="space-y-1 sm:space-y-2">
                  <label className={UI_THEME.text.label}>Branch Designation (Name)</label>
                  <input
                      autoFocus
                      required
                      value={newBranchName}
                      onChange={e => setNewBranchName(e.target.value.toUpperCase())}
                      placeholder="E.G. MANDALUYONG CENTRAL..."
                      className={`${UI_THEME.styles.inputBase} ${UI_THEME.radius.input} font-black text-sm sm:text-base uppercase`}
                  />
                </div>
                <div className="flex flex-col gap-3 pt-2 sm:pt-4">
                  <button type="submit" disabled={isSaving || !newBranchName.trim()} className={`w-full bg-slate-900 text-white font-black py-4 sm:py-6 ${UI_THEME.radius.pill} ${UI_THEME.text.metadata} shadow-xl hover:bg-emerald-600 ${UI_THEME.styles.buttonBase}`}>
                    {isSaving ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : 'Register Branch'}
                  </button>
                  <button type="button" onClick={() => setShowAddModal(false)} className={`w-full py-2 sm:py-4 text-slate-400 ${UI_THEME.text.metadata}`}>Cancel</button>
                </div>
              </form>
            </div>
        )}

        {editingBranchId && editingBranch && (
            <BranchEditor
                branch={editingBranch}
                employees={employees}
                masterServices={masterCatalogs.flatMap(c => c.services)}
                transactions={transactions}
                salesReports={salesReports}
                attendance={attendance}
                onSave={handleSaveBranch}
                onToggle={handleToggleBranch}
                onResetPin={handleResetPin}
                onForceLogout={handleForceLogout}
                onDelete={handleDeleteBranch}
                onClose={() => setEditingBranchId(null)}
                isSaving={isSaving}
                isReadOnly={isReadOnly}
                setConfirmState={setConfirmState as any}
            />
        )}

        <main className={`flex-1 ${UI_THEME.layout.mainPadding} ${UI_THEME.layout.maxContent} w-full pb-32 pt-4 md:pt-8`}>
          {renderContent()}
        </main>

        {/* My Account modal — portal users only */}
        {showMyAccount && isPortalUser && (
          <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="w-full sm:max-w-sm bg-white rounded-t-[36px] sm:rounded-[36px] shadow-2xl max-h-[92dvh] overflow-y-auto animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">

              {/* Drag handle */}
              <div className="pt-3 flex justify-center sm:hidden">
                <div className="w-10 h-1 bg-slate-200 rounded-full" />
              </div>

              {/* Dark hero header */}
              <div className="relative bg-slate-900 px-6 pt-6 pb-8 overflow-hidden">
                {/* Decorative glow */}
                <div className="absolute -top-8 -right-8 w-36 h-36 bg-indigo-600/20 rounded-full blur-2xl pointer-events-none" />
                <div className="absolute -bottom-6 -left-6 w-28 h-28 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

                <div className="relative flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center shrink-0 shadow-inner">
                      <span className="text-2xl font-black text-white uppercase leading-none">
                        {(user.username || '?').charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.3em]">Portal Access</p>
                      <h3 className="text-lg font-black text-white uppercase tracking-tight leading-tight mt-0.5">{user.username}</h3>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Active Session</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowMyAccount(false)}
                    className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-400 hover:text-white transition-all shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
              </div>

              {/* Form body */}
              <form onSubmit={handleUpdateMyAccount} className="p-5 space-y-4">

                {/* ── Username section ── */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                    </div>
                    <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Username</p>
                  </div>

                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">New Username</label>
                    <input
                      type="text"
                      value={myAccountForm.username}
                      onChange={e => setMyAccountForm(f => ({ ...f, username: e.target.value.toLowerCase() }))}
                      placeholder="enter new username"
                      autoCapitalize="none"
                      className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-slate-900 outline-none focus:border-indigo-400 focus:bg-white transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Confirm Username</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={myAccountForm.confirmUsername}
                        onChange={e => setMyAccountForm(f => ({ ...f, confirmUsername: e.target.value.toLowerCase() }))}
                        placeholder="repeat username"
                        autoCapitalize="none"
                        className={`w-full h-11 px-4 pr-10 bg-slate-50 border rounded-2xl font-bold text-sm text-slate-900 outline-none focus:bg-white transition-all ${
                          myAccountForm.confirmUsername && myAccountForm.confirmUsername !== myAccountForm.username
                            ? 'border-rose-300 bg-rose-50/50 focus:border-rose-400'
                            : myAccountForm.confirmUsername && myAccountForm.confirmUsername === myAccountForm.username
                            ? 'border-emerald-300 bg-emerald-50/50 focus:border-emerald-400'
                            : 'border-slate-200 focus:border-indigo-400'
                        }`}
                      />
                      {myAccountForm.confirmUsername && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          {myAccountForm.confirmUsername === myAccountForm.username
                            ? <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                            : <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                          }
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100" />

                {/* ── PIN section ── */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                        <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                      </div>
                      <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Security PIN</p>
                    </div>
                    <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Optional</span>
                  </div>

                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">New PIN</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      value={myAccountForm.pin}
                      onChange={e => setMyAccountForm(f => ({ ...f, pin: e.target.value, confirmPin: '' }))}
                      placeholder="────────"
                      maxLength={8}
                      className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-slate-900 outline-none focus:border-emerald-400 focus:bg-white transition-all tracking-[0.4em] text-center"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Confirm PIN</label>
                    <div className="relative">
                      <input
                        type="password"
                        inputMode="numeric"
                        value={myAccountForm.confirmPin}
                        onChange={e => setMyAccountForm(f => ({ ...f, confirmPin: e.target.value }))}
                        placeholder="────────"
                        maxLength={8}
                        disabled={!myAccountForm.pin}
                        className={`w-full h-11 px-4 pr-10 bg-slate-50 border rounded-2xl font-black text-slate-900 outline-none focus:bg-white transition-all tracking-[0.4em] text-center disabled:opacity-30 disabled:cursor-not-allowed ${
                          myAccountForm.confirmPin && myAccountForm.confirmPin !== myAccountForm.pin
                            ? 'border-rose-300 bg-rose-50/50 focus:border-rose-400'
                            : myAccountForm.confirmPin && myAccountForm.confirmPin === myAccountForm.pin
                            ? 'border-emerald-300 bg-emerald-50/50 focus:border-emerald-400'
                            : 'border-slate-200 focus:border-emerald-400'
                        }`}
                      />
                      {myAccountForm.confirmPin && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          {myAccountForm.confirmPin === myAccountForm.pin
                            ? <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                            : <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                          }
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Feedback */}
                {myAccountError && (
                  <div className="flex items-center gap-2.5 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3">
                    <svg className="w-4 h-4 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                    <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest">{myAccountError}</p>
                  </div>
                )}
                {myAccountSuccess && (
                  <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
                    <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                    <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Credentials updated successfully.</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={myAccountSaving || !myAccountForm.username.trim()}
                  className="w-full h-13 py-3.5 bg-slate-900 hover:bg-emerald-600 text-white font-black rounded-2xl text-[11px] uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-slate-900/20"
                >
                  {myAccountSaving
                    ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    : <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                        Save Changes
                      </>
                  }
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
  );
};

export default SuperAdminDashboard;