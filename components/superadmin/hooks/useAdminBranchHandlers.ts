import { useState } from 'react';
import { Branch, Employee } from '../../../types';
import { supabase } from '../../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';
import { playSound } from '../../../lib/audio';
import { toDateStr } from '@/src/utils/reportUtils';
import { getTrueDate, getManilaTodayStr } from '../../../lib/time';
import { useUpdateBranch, useDeleteBranch, useAddBranch, useUpdateEmployee } from '../../../hooks/useNetworkData';
import type { ConfirmState } from '../modals/ConfirmModal';

interface UseAdminBranchHandlersParams {
  branches: Branch[];
  employees: Employee[];
  onRefresh?: (quiet?: boolean) => void;
  onSyncStatusChange?: (isSyncing: boolean) => void;
  setConfirmState: React.Dispatch<React.SetStateAction<ConfirmState>>;
  fetchSystemConfig?: () => Promise<void>;
}

export function useAdminBranchHandlers({
  branches,
  employees,
  onRefresh,
  onSyncStatusChange,
  setConfirmState,
  fetchSystemConfig,
}: UseAdminBranchHandlersParams) {
  const [isSaving, setIsSaving] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkAddModal, setShowBulkAddModal] = useState(false);
  const [bulkInput, setBulkInput] = useState('');

  const updateBranch = useUpdateBranch();
  const updateEmployee = useUpdateEmployee();
  const deleteBranch = useDeleteBranch();
  const addBranch = useAddBranch();

  const handleSaveBranch = async (updated: Branch) => {
    setIsSaving(true);
    if (onSyncStatusChange) onSyncStatusChange(true);
    try {
      const oldBranch = branches.find(b => b.id === updated.id);
      const oldManagerName = oldBranch?.manager?.toUpperCase().trim();
      const newManagerName = updated.manager?.toUpperCase().trim();
      const managerChanged = oldManagerName !== newManagerName;

      const oldTempManagerName = oldBranch?.tempManager?.toUpperCase().trim();
      const newTempManagerName = updated.tempManager?.toUpperCase().trim();
      const tempManagerChanged = oldTempManagerName !== newTempManagerName;

      const oldCutoff = oldBranch?.weeklyCutoff ?? 0;
      const newCutoff = updated.weeklyCutoff ?? 0;
      const cutoffChanged = oldBranch && oldCutoff !== newCutoff;

      // When cutoff changes: append to cutoff_history with the effective date
      if (cutoffChanged && updated.cutoffEffectiveDate) {
        const history = [...(oldBranch.cutoffHistory || [])];
        // First cutoff change ever: record the original cutoff so pre-change dates compute correctly
        if (history.length === 0) {
          history.push({ cutoff: oldCutoff, effectiveFrom: oldBranch.cycleStartDate || '2020-01-01' });
        }
        history.push({ cutoff: newCutoff, effectiveFrom: updated.cutoffEffectiveDate });
        updated.cutoffHistory = history;
      }

      const hasManager = (updated.manager && updated.manager.trim() !== '') || (updated.tempManager && updated.tempManager.trim() !== '');
      const currentIsOpen = oldBranch?.isOpen ?? false;
      const finalIsOpen = hasManager ? currentIsOpen : false;

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
        [DB_COLUMNS.SHIFT2_OPENING_TIME]: updated.shift2OpeningTime || null,
        [DB_COLUMNS.SHIFT2_CLOSING_TIME]: updated.shift2ClosingTime || null,
        [DB_COLUMNS.OWNERS]: JSON.stringify(updated.owners || []),
        [DB_COLUMNS.GROUP_LEVY]: updated.groupLevy ? JSON.stringify(updated.groupLevy) : null,
        [DB_COLUMNS.VAULT_ENABLED]: updated.vaultEnabled ?? false,
        ...(updated.cutoffHistory ? { [DB_COLUMNS.CUTOFF_HISTORY]: updated.cutoffHistory } : {}),
      });

      if (managerChanged || tempManagerChanged) {
        const branchId = updated.id;
        const employeeUpdates: Promise<any>[] = [];

        if (oldManagerName && managerChanged) {
          const oldManager = employees.find(e => (e.name || '').toUpperCase().trim() === oldManagerName);
          if (oldManager) {
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
            const nextAllowances = { ...(oldManager.branchAllowances || {}) };
            if (nextAllowances[branchId]) {
              const allowance = nextAllowances[branchId];
              nextAllowances[branchId] = typeof allowance === 'object' && allowance !== null
                ? { ...allowance, role: 'THERAPIST' }
                : { allowance: Number(allowance), role: 'THERAPIST' };
            }
            employeeUpdates.push(updateEmployee.mutateAsync({
              id: oldManager.id,
              [DB_COLUMNS.ROLE]: nextRoles.join(','),
              [DB_COLUMNS.BRANCH_ALLOWANCES]: nextAllowances,
            }));
          }
        }

        if (newManagerName && managerChanged) {
          const newManager = employees.find(e => (e.name || '').toUpperCase().trim() === newManagerName);
          if (newManager) {
            const currentRoles = (newManager.role || '').split(',').filter(Boolean);
            if (!currentRoles.includes('MANAGER')) currentRoles.push('MANAGER');
            const nextAllowances = { ...(newManager.branchAllowances || {}) };

            // Ensure all OTHER branch entries have an explicit role so getEmployeeRole()
            // never falls back to the global MANAGER role for reliever branches.
            const baseRole = (newManager.role || 'THERAPIST').split(',').filter(r => r !== 'MANAGER')[0] || 'THERAPIST';
            for (const [bid, config] of Object.entries(nextAllowances)) {
              if (bid === branchId) continue;
              if (typeof config === 'object' && config !== null && (config as any).role) continue;
              const existingAllowance = typeof config === 'object' && config !== null ? (config as any).allowance : (Number(config) || 0);
              nextAllowances[bid] = { allowance: existingAllowance, role: baseRole };
            }

            const currentAllowance = nextAllowances[branchId];
            const allowanceVal = typeof currentAllowance === 'object' && currentAllowance !== null
              ? (currentAllowance as any).allowance
              : (Number(currentAllowance) || newManager.allowance || 0);
            nextAllowances[branchId] = { allowance: allowanceVal, role: 'MANAGER' };
            employeeUpdates.push(updateEmployee.mutateAsync({
              id: newManager.id,
              [DB_COLUMNS.ROLE]: currentRoles.join(','),
              [DB_COLUMNS.BRANCH_ID]: branchId,
              [DB_COLUMNS.BRANCH_ALLOWANCES]: nextAllowances,
            }));
          }
        }

        if (oldTempManagerName && tempManagerChanged) {
          const oldTempManager = employees.find(e => (e.name || '').toUpperCase().trim() === oldTempManagerName);
          if (oldTempManager) {
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
            const nextAllowances = { ...(oldTempManager.branchAllowances || {}) };
            if (nextAllowances[branchId]) {
              const allowance = nextAllowances[branchId];
              nextAllowances[branchId] = typeof allowance === 'object' && allowance !== null
                ? { ...allowance, role: 'THERAPIST' }
                : { allowance: Number(allowance), role: 'THERAPIST' };
            }
            employeeUpdates.push(updateEmployee.mutateAsync({
              id: oldTempManager.id,
              [DB_COLUMNS.ROLE]: nextRoles.join(','),
              [DB_COLUMNS.BRANCH_ALLOWANCES]: nextAllowances,
            }));
          }
        }

        if (newTempManagerName && tempManagerChanged) {
          const newTempManager = employees.find(e => (e.name || '').toUpperCase().trim() === newTempManagerName);
          if (newTempManager) {
            const currentRoles = (newTempManager.role || '').split(',').filter(Boolean);
            if (!currentRoles.includes('MANAGER')) currentRoles.push('MANAGER');
            const nextAllowances = { ...(newTempManager.branchAllowances || {}) };
            const currentAllowance = nextAllowances[branchId];
            const allowanceVal = typeof currentAllowance === 'object' && currentAllowance !== null
              ? currentAllowance.allowance
              : (Number(currentAllowance) || newTempManager.allowance || 0);
            nextAllowances[branchId] = { allowance: allowanceVal, role: 'MANAGER' };
            employeeUpdates.push(updateEmployee.mutateAsync({
              id: newTempManager.id,
              [DB_COLUMNS.ROLE]: currentRoles.join(','),
              [DB_COLUMNS.BRANCH_ALLOWANCES]: nextAllowances,
            }));
          }
        }

        if (employeeUpdates.length > 0) await Promise.all(employeeUpdates);
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
      await updateBranch.mutateAsync({ id, [DB_COLUMNS.IS_ENABLED]: !currentlyEnabled });
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
        [DB_COLUMNS.IS_PIN_CHANGED]: false,
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
        onConfirm: () => setConfirmState(p => ({ ...p, isOpen: false })),
      });
      return;
    }
    try {
      await deleteBranch.mutateAsync(id);
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
      if (configData) { try { registry = JSON.parse(configData.value); } catch {} }
      registry[branchId] = getTrueDate().getTime();

      const { error } = await supabase.from(DB_TABLES.SYSTEM_CONFIG).upsert({
        [DB_COLUMNS.KEY]: 'force_logout_registry',
        [DB_COLUMNS.VALUE]: JSON.stringify(registry),
      }, { onConflict: DB_COLUMNS.KEY });

      if (error) throw error;
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
      await addBranch.mutateAsync({
        [DB_COLUMNS.ID]: id,
        [DB_COLUMNS.NAME]: newBranchName.trim().toUpperCase(),
        [DB_COLUMNS.PIN]: Math.floor(100000 + Math.random() * 900000).toString(),
        [DB_COLUMNS.IS_PIN_CHANGED]: false,
        [DB_COLUMNS.IS_ENABLED]: true,
        [DB_COLUMNS.CYCLE_START_DATE]: getManilaTodayStr(),
        [DB_COLUMNS.WEEKLY_CUTOFF]: '0',
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
        onConfirm: () => setConfirmState(p => ({ ...p, isOpen: false })),
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
      const newBranches = lines.map(name => ({
        [DB_COLUMNS.NAME]: name.toUpperCase(),
        [DB_COLUMNS.PIN]: Math.floor(100000 + Math.random() * 900000).toString(),
        [DB_COLUMNS.IS_PIN_CHANGED]: false,
        [DB_COLUMNS.IS_ENABLED]: true,
        [DB_COLUMNS.CYCLE_START_DATE]: getManilaTodayStr(),
        [DB_COLUMNS.WEEKLY_CUTOFF]: '0',
      }));
      const { error } = await supabase.from(DB_TABLES.BRANCHES).insert(newBranches);
      if (error) throw error;
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

  const handleToggleFaceId = async (branchId: string, currentlyEnabled: boolean) => {
    if (!supabase) return;
    try {
      const { data } = await supabase
        .from(DB_TABLES.SYSTEM_CONFIG)
        .select(DB_COLUMNS.VALUE)
        .eq(DB_COLUMNS.KEY, 'face_id_disabled_branches')
        .maybeSingle();
      const current: string[] = data?.[DB_COLUMNS.VALUE] ? JSON.parse(data[DB_COLUMNS.VALUE]) : [];
      const next = currentlyEnabled
        ? [...current.filter((id: string) => id !== branchId), branchId]  // disable → add to list
        : current.filter((id: string) => id !== branchId);                // enable → remove from list
      await supabase
        .from(DB_TABLES.SYSTEM_CONFIG)
        .upsert({ [DB_COLUMNS.KEY]: 'face_id_disabled_branches', [DB_COLUMNS.VALUE]: JSON.stringify(next) }, { onConflict: DB_COLUMNS.KEY });
      if (fetchSystemConfig) await fetchSystemConfig();
      else if (onRefresh) onRefresh(true);
    } catch (e) {
      console.error('Failed to toggle face ID:', e);
    }
  };

  return {
    isSaving,
    newBranchName,
    setNewBranchName,
    showAddModal,
    setShowAddModal,
    showBulkAddModal,
    setShowBulkAddModal,
    bulkInput,
    setBulkInput,
    handleSaveBranch,
    handleToggleBranch,
    handleToggleFaceId,
    handleResetPin,
    handleDeleteBranch,
    handleForceLogout,
    handleAddBranch,
    handleBulkRegister,
  };
}
