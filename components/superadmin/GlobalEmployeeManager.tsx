import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { Shield } from 'lucide-react';
import { Branch, Employee } from '../../types';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { UI_THEME } from '../../constants/ui_designs';
import { playSound } from '../../lib/audio';
import { compressImage } from '../../lib/image';
import { deleteFileByUrl } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { useAddEmployee, useUpdateEmployee, useUpdateBranch, useAddAuditLog, useDeleteEmployee } from '../../hooks/useNetworkData';
import { getEmployeeRole } from '../../lib/payroll';
import { getManilaTodayStr, getTrueISOString, getTrueDate } from '../../lib/time';
import { invalidateBranchSessions } from '../../lib/audit';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { Pagination } from '../dashboard/sections/common/Pagination';
import { BranchCheckboxDropdown } from '../shared/BranchCheckboxDropdown';

// Modular Components
import { EmployeeTable } from './employee-manager/EmployeeTable';
import { EmployeeMobileList } from './employee-manager/EmployeeMobileList';
import { RecoveryModal } from './employee-manager/RecoveryModal';
import { EditorModal } from './employee-manager/EditorModal';
import { EmployeeIDCardModal } from './employee-manager/EmployeeIDCardModal';

interface GlobalEmployeeManagerProps {
  branches: Branch[];
  employees: Employee[];
  onRefresh?: () => void;
  onSyncStatusChange?: (isSyncing: boolean) => void;
  isReadOnly?: boolean;
}

export const GlobalEmployeeManager: React.FC<GlobalEmployeeManagerProps> = ({ branches, employees, onRefresh, onSyncStatusChange, isReadOnly }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [resetRequestedOnly, setResetRequestedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'pay_asc' | 'pay_desc'>('name');
  
  const [editingEmployee, setEditingEmployee] = useState<Partial<Employee> | null>(null);
  const [idCardEmployee, setIdCardEmployee] = useState<Employee | null>(null);
  const [showAdminWipeConfirm, setShowAdminWipeConfirm] = useState<Employee | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Employee | null>(null);
  const [showEndLeaveConfirm, setShowEndLeaveConfirm] = useState<Employee | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const [showPrintConfirm, setShowPrintConfirm] = useState(false);
  
  const [resettingEmployee, setResettingEmployee] = useState<Employee | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [customRoles, setCustomRoles] = useState<string[]>([]);
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  const addEmployee = useAddEmployee();
  const updateEmployee = useUpdateEmployee();
  const deleteEmployee = useDeleteEmployee();
  const updateBranch = useUpdateBranch();
  const addAuditLog = useAddAuditLog();

  const roleDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  // Re-fetch whenever the editor opens so newly-created custom roles are always visible
  useEffect(() => {
    supabase.from(DB_TABLES.SYSTEM_CONFIG).select('value').eq(DB_COLUMNS.KEY, 'custom_roles').maybeSingle()
      .then(({ data }) => {
        if (data?.value) { try { setCustomRoles(JSON.parse(data.value)); } catch {} }
      });
  }, [editingEmployee?.id]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(e.target as Node)) setIsRoleDropdownOpen(false);
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) setIsStatusDropdownOpen(false);
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) setIsSortDropdownOpen(false);
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target as Node)) setExportDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredEmployees = useMemo(() => {
    let res = employees.filter(e => {
        const isNodeMatch = selectedBranchIds.length === 0 ||
                           selectedBranchIds.includes(e.branchId) ||
                           (e.branchAllowances && typeof e.branchAllowances === 'object' && selectedBranchIds.some(id => id in e.branchAllowances));
        const isAssignedManagerOfFiltered = selectedBranchIds.length > 0 && selectedBranchIds.some(id => {
          const b = branches.find(br => br.id === id);
          return b?.manager?.toUpperCase() === (e.name || '').toUpperCase();
        });
        const isTarget = isNodeMatch || isAssignedManagerOfFiltered;
        
        const isStatusValid = 
          statusFilter === 'all' ? true :
          statusFilter === 'active' ? e.isActive !== false :
          e.isActive === false;

        const isRoleMatch = roleFilter === 'all' || (e.role || '').includes(roleFilter);

        const isResetMatch = !resetRequestedOnly || e.requestReset;

        return isTarget && isStatusValid && isRoleMatch && isResetMatch;
    });

    if (debouncedSearch.trim()) {
      const raw = debouncedSearch.toUpperCase().trim();
      // Strip EMP-MM-DD- prefix if typed, so searching "EMP-04-05-abc" or just "abc" both work
      const term = raw.replace(/^EMP-\d{2}-\d{2}-/, '');
      const stripPrefix = (s: string) => s.replace(/^EMP-\d{2}-\d{2}-/, '');
      res = res.filter(e => {
        const name = (e.name || '').toUpperCase();
        const id = (e.id || '').toUpperCase();
        const formattedId = e.timestamp
          ? (() => { const d = new Date(e.timestamp); const mm = String(d.getUTCMonth() + 1).padStart(2, '0'); const dd = String(d.getUTCDate()).padStart(2, '0'); return `EMP-${mm}-${dd}-${e.id}`.toUpperCase(); })()
          : '';
        return (
          name.includes(term) ||
          id.includes(term) ||
          stripPrefix(id).includes(term) ||
          formattedId.includes(raw) ||
          stripPrefix(formattedId).includes(term)
        );
      });
    }
    
    return res.sort((a, b) => {
      if (!a || !b) return 0;
      if (sortBy === 'pay_asc') return (a.allowance || 0) - (b.allowance || 0);
      if (sortBy === 'pay_desc') return (b.allowance || 0) - (a.allowance || 0);
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [employees, selectedBranchIds, debouncedSearch, statusFilter, roleFilter, sortBy, branches, resetRequestedOnly]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, selectedBranchIds, roleFilter, statusFilter, sortBy, resetRequestedOnly]);

  const resetRequestedCount = useMemo(() => 
    employees.filter(e => e.requestReset).length
  , [employees]);

  const paginatedEmployees = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredEmployees.slice(start, start + itemsPerPage);
  }, [filteredEmployees, currentPage]);

  const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);

  const handleOpenEdit = (emp?: Employee) => {
    playSound('click');
    if (emp) {
      setEditingEmployee({ ...emp });
    } else {
      setEditingEmployee({ 
        name: '', 
        firstName: '',
        middleName: '',
        lastName: '',
        role: '', 
        allowance: 0, 
        isActive: true, 
        branchId: selectedBranchIds.length === 1 ? selectedBranchIds[0] : ''
      });
    }
  };

  const handleOpenResetModal = (emp: Employee) => {
    playSound('click');
    setResettingEmployee(emp);
    setError('');
  };

  const handleDeleteEmployee = async () => {
    if (!showDeleteConfirm) return;
    
    setIsSaving(true);
    try {
      // Cleanup profile image if exists
      if (showDeleteConfirm.profile) {
        await deleteFileByUrl(showDeleteConfirm.profile, 'profiles');
      }
      
      await deleteEmployee.mutateAsync(showDeleteConfirm.id);
      
      await addAuditLog.mutateAsync({
        activity_type: 'DELETE',
        entity_type: 'EMPLOYEE',
        entity_id: showDeleteConfirm.id,
        description: `Deleted suspended employee: ${showDeleteConfirm.name}`,
        performer_name: 'SUPERADMIN'
      });
      
      playSound('success');
      setShowDeleteConfirm(null);
      setEditingEmployee(null);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to delete employee');
      playSound('warning');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEndLeave = async () => {
    if (!showEndLeaveConfirm || isSaving) return;
    const target = showEndLeaveConfirm;
    setIsSaving(true);
    try {
      await updateEmployee.mutateAsync({
        id: target.id,
        [DB_COLUMNS.ON_LEAVE]: false,
        [DB_COLUMNS.LEAVE_TYPE]: null,
        [DB_COLUMNS.LEAVE_START_DATE]: null,
        [DB_COLUMNS.LEAVE_END_DATE]: null,
      });
      await addAuditLog.mutateAsync({
        activity_type: 'UPDATE',
        entity_type: 'EMPLOYEE',
        entity_id: target.id,
        description: `Admin override: returned ${target.name} from leave`,
        performer_name: 'SUPERADMIN',
      });
      playSound('success');
      setShowEndLeaveConfirm(null);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to end leave');
      playSound('warning');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdminCredentialWipe = async () => {
    if (!showAdminWipeConfirm || isSaving) return;
    const target = showAdminWipeConfirm;
    
    setIsSaving(true);
    if (onSyncStatusChange) onSyncStatusChange(true);
    
    try {
        await updateEmployee.mutateAsync({
            id: target.id,
            [DB_COLUMNS.USERNAME]: null, 
            [DB_COLUMNS.LOGIN_PIN]: null, 
            [DB_COLUMNS.PIN_SALT]: null,
            [DB_COLUMNS.REQUEST_RESET]: false 
        });
        
        // Only reset branch setup status if the wiped employee is currently the assigned manager
        const branch = branches.find(b => b.id === target.branchId);
        const isManager = branch?.manager?.toUpperCase() === (target.name || '').toUpperCase();

        if (isManager) {
            await updateBranch.mutateAsync({
                id: target.branchId,
                [DB_COLUMNS.IS_PIN_CHANGED]: false,
                [DB_COLUMNS.PIN]: Math.floor(100000 + Math.random() * 900000).toString()
            });
        }

        await addAuditLog.mutateAsync({
            [DB_COLUMNS.BRANCH_ID]: null,
            [DB_COLUMNS.TIMESTAMP]: getTrueISOString(),
            [DB_COLUMNS.ACTIVITY_TYPE]: 'UPDATE',
            [DB_COLUMNS.ENTITY_TYPE]: 'SECURITY',
            [DB_COLUMNS.ENTITY_ID]: target.id,
            [DB_COLUMNS.DESCRIPTION]: `Administrator handled credentials reset for: ${target.name || 'UNNAMED'}. Access reverted to Setup Mode.`,
            [DB_COLUMNS.PERFORMER_NAME]: 'SYSTEM ADMIN'
        });

        const affectedBranchIds = [
            target.branchId,
            ...Object.keys(target.branchAllowances || {}),
        ].filter(Boolean) as string[];
        if (affectedBranchIds.length > 0) await invalidateBranchSessions(affectedBranchIds);

        playSound('success');
        setShowAdminWipeConfirm(null);
        setEditingEmployee(null);
        if (onRefresh) onRefresh();
    } catch (err) {
        setError('Reset Protocol Fault');
        playSound('warning');
    } finally {
        setIsSaving(false);
        if (onSyncStatusChange) onSyncStatusChange(false);
    }
  };

  const handleSaveEmployee = async (payload: any, authorizedBranchIds: string[], profileFile: File | null) => {
    if (isSaving) return;
    setIsSaving(true);
    if (onSyncStatusChange) onSyncStatusChange(true);
    setError('');

    try {
      const firstName = payload[DB_COLUMNS.FIRST_NAME]?.trim().toUpperCase();
      const middleName = payload[DB_COLUMNS.MIDDLE_NAME]?.trim().toUpperCase() || null;
      const lastName = payload[DB_COLUMNS.LAST_NAME]?.trim().toUpperCase();
      const cleanName = `${firstName} ${middleName ? middleName + ' ' : ''}${lastName}`.trim().toUpperCase();
      const finalHomeBranchId = payload[DB_COLUMNS.BRANCH_ID];
      const oldName = editingEmployee?.name?.toUpperCase().trim();
      const oldBranchId = editingEmployee?.branchId;

      // 0. DUPLICATION CHECK (Branch-Level)
      const isDuplicate = employees.some(e => {
        if (editingEmployee?.id && e.id === editingEmployee.id) return false;
        if (e.branchId !== finalHomeBranchId) return false;
        if (!e.isActive) return false;

        const existingFullName = e.firstName && e.lastName 
          ? `${e.firstName} ${e.middleName ? e.middleName + ' ' : ''}${e.lastName}`.trim().toUpperCase() 
          : (e.name || '').toUpperCase();

        return existingFullName === cleanName;
      });

      if (isDuplicate) {
        setError(`DUPLICATE IDENTITY: A staff member with this name is already registered in this branch.`);
        playSound('warning');
        setIsSaving(false);
        if (onSyncStatusChange) onSyncStatusChange(false);
        return;
      }

      let profileUrl = payload[DB_COLUMNS.PROFILE] || '';
      if (profileFile) {
        if (payload[DB_COLUMNS.PROFILE]) await deleteFileByUrl(payload[DB_COLUMNS.PROFILE], 'profiles');
        const compressed = await compressImage(profileFile, { maxWidth: 400, maxHeight: 400, quality: 0.5 });
        const path = `${finalHomeBranchId || 'global'}/profiles/${Date.now()}_admin.jpg`;
        const { error: uploadErr } = await supabase.storage.from('profiles').upload(path, compressed, { contentType: 'image/jpeg', upsert: true });
        if (!uploadErr) profileUrl = supabase.storage.from('profiles').getPublicUrl(path).data.publicUrl;
        payload[DB_COLUMNS.PROFILE] = profileUrl;
      }

      const id = editingEmployee?.id || Math.random().toString(36).substr(2,9);
      if (editingEmployee?.id) {
        await updateEmployee.mutateAsync({ id, ...payload });
      } else {
        await addEmployee.mutateAsync({ [DB_COLUMNS.ID]: id, ...payload });
      }
      
      const nameChanged = oldName && oldName !== cleanName;

      // 1. BRANCH SYNC: Update manager/temp_manager slots in branches
      const branchSyncPromises = branches.map(async (b) => {
          const branchAllowance = payload[DB_COLUMNS.BRANCH_ALLOWANCES]?.[b.id];
          const branchRole = (typeof branchAllowance === 'object' && branchAllowance !== null && branchAllowance.role) 
            ? branchAllowance.role 
            : (payload[DB_COLUMNS.ROLE] || '');
          
          const isManagerOfThisBranch = (branchRole || '').includes('MANAGER');
          const shouldBeManagerOfThisBranch = isManagerOfThisBranch && authorizedBranchIds.includes(b.id);
          
          const isCurrentlyMarkedAsManagerOfThisBranch = b.manager?.toUpperCase() === oldName || b.manager?.toUpperCase() === cleanName;
          const isCurrentlyMarkedAsTempManager = b.tempManager?.toUpperCase() === oldName;

          const branchUpdates: any = { id: b.id };
          let needsUpdate = false;

          // Case 1: Person is assigned as manager to this branch
          if (shouldBeManagerOfThisBranch) {
              if (b.manager?.toUpperCase() !== cleanName) {
                  const previousManagerName = b.manager?.toUpperCase().trim();
                  branchUpdates[DB_COLUMNS.MANAGER] = cleanName;
                  needsUpdate = true;

                  // Handle previous manager role persistence
                  if (previousManagerName && previousManagerName !== oldName) {
                      const previousManager = employees.find(e => (e.name || '').toUpperCase().trim() === previousManagerName);
                      if (previousManager) {
                          // Check if they are still a manager of ANY OTHER branch (primary or temp)
                          const isManagerElsewhere = branches.some(otherBranch => 
                              otherBranch.id !== b.id && 
                              (otherBranch.manager?.toUpperCase().trim() === previousManagerName || 
                               otherBranch.tempManager?.toUpperCase().trim() === previousManagerName)
                          );

                          const currentRoles = (previousManager.role || '').split(',').filter(Boolean);
                          let nextRoles = [...currentRoles];
                          
                          if (!isManagerElsewhere) {
                              nextRoles = nextRoles.filter(r => r !== 'MANAGER');
                              if (nextRoles.length === 0) nextRoles.push('THERAPIST');
                          }
                          
                          const finalRoles = nextRoles.join(',');

                          const nextAllowances = { ...(previousManager.branchAllowances || {}) };
                          if (nextAllowances[b.id]) {
                              const allowance = nextAllowances[b.id];
                              if (typeof allowance === 'object' && allowance !== null) {
                                  nextAllowances[b.id] = { ...allowance, role: finalRoles };
                              } else {
                                  nextAllowances[b.id] = { allowance: Number(allowance), role: finalRoles };
                              }
                          }

                          await updateEmployee.mutateAsync({
                              id: previousManager.id,
                              [DB_COLUMNS.ROLE]: finalRoles,
                              [DB_COLUMNS.BRANCH_ALLOWANCES]: nextAllowances
                          });
                      }
                  }
              }
              // Ensure they are not also marked as temp manager
              if (b.tempManager?.toUpperCase() === cleanName || b.tempManager?.toUpperCase() === oldName) {
                  branchUpdates[DB_COLUMNS.TEMP_MANAGER] = '';
                  needsUpdate = true;
              }
          } 
          // Case 2: Name change cascade for existing management slots
          else if (nameChanged) {
              if (b.manager?.toUpperCase() === oldName) {
                  branchUpdates[DB_COLUMNS.MANAGER] = cleanName;
                  needsUpdate = true;
              }
              if (b.tempManager?.toUpperCase() === oldName) {
                  branchUpdates[DB_COLUMNS.TEMP_MANAGER] = cleanName;
                  needsUpdate = true;
              }
          }
          // Case 3: Removal from manager slot
          else if (isCurrentlyMarkedAsManagerOfThisBranch && !shouldBeManagerOfThisBranch) {
              branchUpdates[DB_COLUMNS.MANAGER] = '';
              branchUpdates[DB_COLUMNS.IS_OPEN] = false;
              needsUpdate = true;
          }

          if (needsUpdate) {
              return updateBranch.mutateAsync(branchUpdates);
          }
          return Promise.resolve();
      });
      
      await Promise.all(branchSyncPromises);

      // 2. DATA CASCADE: Update all historical records if name changed
      if (nameChanged) {
          const cascadePromises = [
              // Transactions: Update both therapist and bonesetter roles
              supabase.from(DB_TABLES.TRANSACTIONS).update({ [DB_COLUMNS.THERAPIST_NAME]: cleanName }).eq(DB_COLUMNS.THERAPIST_NAME, oldName),
              supabase.from(DB_TABLES.TRANSACTIONS).update({ [DB_COLUMNS.BONESETTER_NAME]: cleanName }).eq(DB_COLUMNS.BONESETTER_NAME, oldName),
              
              supabase.from(DB_TABLES.ATTENDANCE).update({ [DB_COLUMNS.STAFF_NAME]: cleanName }).eq(DB_COLUMNS.EMPLOYEE_ID, id),
              supabase.from(DB_TABLES.AUDIT_LOGS).update({ [DB_COLUMNS.PERFORMER_NAME]: cleanName }).eq(DB_COLUMNS.PERFORMER_NAME, oldName)
          ];
          
          // Execute all updates in parallel
          await Promise.all(cascadePromises);
      }

      await addAuditLog.mutateAsync({
        [DB_COLUMNS.BRANCH_ID]: null,
        [DB_COLUMNS.TIMESTAMP]: getTrueISOString(),
        [DB_COLUMNS.ACTIVITY_TYPE]: editingEmployee?.id ? 'UPDATE' : 'CREATE',
        [DB_COLUMNS.ENTITY_TYPE]: 'EMPLOYEE',
        [DB_COLUMNS.ENTITY_ID]: id,
        [DB_COLUMNS.DESCRIPTION]: `${editingEmployee?.id ? 'Modified' : 'Registered'} staff identity: ${cleanName}${nameChanged ? ` (Previously: ${oldName || 'UNNAMED'})` : ''}${oldBranchId && oldBranchId !== finalHomeBranchId ? ` | Transferred from ${branches.find(b => b.id === oldBranchId)?.name || 'Unknown'} to ${branches.find(b => b.id === finalHomeBranchId)?.name || 'Unknown'}` : ''}`,
        [DB_COLUMNS.PERFORMER_NAME]: 'SYSTEM ADMIN'
      });

      playSound('success');
      setEditingEmployee(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(err);
      setError('SYSTEM SYNC FAULT. PLEASE RETRY.');
      playSound('warning');
    } finally {
      setIsSaving(false);
      if (onSyncStatusChange) onSyncStatusChange(false);
    }
  };

  const handleSavePersonalDetails = async (payload: { name: string; firstName: string; middleName: string | null; lastName: string; details: Employee['details'] }, profileFile: File | null) => {
    if (!editingEmployee?.id) return;
    setIsSaving(true);
    if (onSyncStatusChange) onSyncStatusChange(true);
    try {
      let profileUrl = (editingEmployee as Employee).profile ?? null;
      if (profileFile) {
        if (profileUrl) await deleteFileByUrl(profileUrl, 'profiles');
        const compressed = await compressImage(profileFile, { maxWidth: 400, maxHeight: 400, quality: 0.5 });
        const path = `${editingEmployee.branchId || 'global'}/profiles/${Date.now()}_personal.jpg`;
        const { error: uploadErr } = await supabase.storage.from('profiles').upload(path, compressed, { contentType: 'image/jpeg', upsert: true });
        if (!uploadErr) profileUrl = supabase.storage.from('profiles').getPublicUrl(path).data.publicUrl;
      }
      await updateEmployee.mutateAsync({
        id: editingEmployee.id,
        [DB_COLUMNS.NAME]: payload.name,
        [DB_COLUMNS.FIRST_NAME]: payload.firstName,
        [DB_COLUMNS.MIDDLE_NAME]: payload.middleName,
        [DB_COLUMNS.LAST_NAME]: payload.lastName,
        [DB_COLUMNS.PROFILE]: profileUrl,
        [DB_COLUMNS.DETAILS]: payload.details ?? null,
      });

      // If the name changed, sync it to any branch where this employee is listed
      // as the manager or temp manager — otherwise their login breaks because
      // branches.manager is compared against employees.name during authentication.
      const oldName = (editingEmployee.name || '').toUpperCase().trim();
      const newName = (payload.name || '').toUpperCase().trim();
      if (oldName !== newName) {
        const branchSyncs = branches
          .filter(b => {
            const bMgr = (b.manager || '').toUpperCase().trim();
            const bTemp = (b.tempManager || '').toUpperCase().trim();
            return bMgr === oldName || bTemp === oldName;
          })
          .map(b => {
            const updates: Record<string, string> = { id: b.id };
            if ((b.manager || '').toUpperCase().trim() === oldName) updates[DB_COLUMNS.MANAGER] = payload.name;
            if ((b.tempManager || '').toUpperCase().trim() === oldName) updates[DB_COLUMNS.TEMP_MANAGER] = payload.name;
            return updateBranch.mutateAsync(updates);
          });
        await Promise.all(branchSyncs);
      }

      playSound('success');
      setEditingEmployee(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(err);
      playSound('warning');
    } finally {
      setIsSaving(false);
      if (onSyncStatusChange) onSyncStatusChange(false);
    }
  };

  const handleExportPDF = async (confirmed = false) => {
    if (!confirmed) {
      playSound('warning');
      setShowPrintConfirm(true);
      return;
    }

    setShowPrintConfirm(false);
    setIsExporting(true);
    playSound('click');

    try {
      const doc = new jsPDF({ orientation: 'landscape' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const now = getTrueDate();

      // 1. Header bar
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 22, 'F');

      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text('STAFF DIRECTORY REPORT', 14, 10);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text('HILOT CENTER MANAGEMENT SYSTEM', 14, 16);

      doc.setFontSize(8);
      doc.setTextColor(203, 213, 225);
      doc.text(`Generated: ${now.toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}`, pageWidth - 14, 10, { align: 'right' });
      doc.text(`Total Staff: ${filteredEmployees.length}`, pageWidth - 14, 16, { align: 'right' });

      // 2. Active filters summary
      const filterParts: string[] = [];
      if (selectedBranchIds.length > 0) filterParts.push(`Branch: ${selectedBranchIds.map(id => branches.find(b => b.id === id)?.name || id).join(', ')}`);
      if (roleFilter !== 'all') filterParts.push(`Role: ${roleFilter}`);
      if (statusFilter !== 'all') filterParts.push(`Status: ${statusFilter}`);
      if (filterParts.length > 0) {
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(`Filters: ${filterParts.join('  •  ')}`, 14, 28);
      }

      const tableStartY = filterParts.length > 0 ? 33 : 27;

      // 3. Table
      autoTable(doc, {
        startY: tableStartY,
        head: [['NAME', 'EMP ID', 'HOME BRANCH', 'R-BRANCH (RELIEVER)', 'SPECIALIZATION', 'STATUS', 'POSITION']],
        body: filteredEmployees.map(emp => {
          const empNameUpper = (emp.name || '').toUpperCase();
          const homeBranch = branches.find(b => b.id === emp.branchId)?.name || '—';
          const relieverBranches = branches
            .filter(b => b.id !== emp.branchId && (
              b.manager?.toUpperCase() === empNameUpper ||
              b.tempManager?.toUpperCase() === empNameUpper ||
              (emp.branchAllowances && typeof emp.branchAllowances === 'object' && b.id in emp.branchAllowances)
            ))
            .map(b => b.name)
            .join(', ') || '—';
          const specialization = getEmployeeRole(emp, emp.branchId)
            .split(',')
            .filter(r => !['MANAGER', 'RELIEVER'].includes(r.trim().toUpperCase()))
            .join(', ') || '—';
          const isManager = branches.some(b => b.manager?.toUpperCase() === empNameUpper);
          const empId = emp.timestamp
            ? (() => { const d = new Date(emp.timestamp); const mm = String(d.getUTCMonth() + 1).padStart(2, '0'); const dd = String(d.getUTCDate()).padStart(2, '0'); return `EMP-${mm}-${dd}-${emp.id}`; })()
            : emp.id;

          return [
            empNameUpper,
            empId.toUpperCase(),
            homeBranch.toUpperCase(),
            relieverBranches.toUpperCase(),
            specialization.toUpperCase(),
            emp.isActive ? 'ACTIVE' : 'INACTIVE',
            isManager ? 'MANAGER' : 'REGULAR',
          ];
        }),
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
        bodyStyles: { fontSize: 7.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 45, fontStyle: 'bold' },
          1: { cellWidth: 32, font: 'courier', fontSize: 6.5 },
          2: { cellWidth: 40 },
          3: { cellWidth: 55 },
          4: { cellWidth: 28, halign: 'center' },
          5: { cellWidth: 20, halign: 'center' },
          6: { cellWidth: 22, halign: 'center' },
        },
        didParseCell: (data) => {
          if (data.section === 'body') {
            if (data.column.index === 5) {
              data.cell.styles.textColor = data.cell.raw === 'ACTIVE' ? [5, 150, 105] : [100, 116, 139];
            }
            if (data.column.index === 6) {
              data.cell.styles.textColor = data.cell.raw === 'MANAGER' ? [79, 70, 229] : [100, 116, 139];
            }
          }
        },
        rowPageBreak: 'avoid',
      });

      // 4. Footer on each page
      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(`Page ${i} of ${totalPages}`, pageWidth - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
        doc.text('HILOT CENTER — CONFIDENTIAL', 14, doc.internal.pageSize.getHeight() - 8);
      }

      doc.save(`STAFF_DIRECTORY_${getManilaTodayStr()}.pdf`);
      playSound('success');
    } catch (error) {
      console.error('PDF Export failed:', error);
      alert('Failed to generate PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCSV = () => {
    if (isExporting || filteredEmployees.length === 0) return;
    setIsExporting(true);
    playSound('click');
    try {
      const rows = filteredEmployees.map(emp => {
        const empNameUpper = (emp.name || '').toUpperCase();
        const homeBranch = branches.find(b => b.id === emp.branchId)?.name || '—';
        const relieverBranches = branches
          .filter(b => b.id !== emp.branchId && (
            b.manager?.toUpperCase() === empNameUpper ||
            b.tempManager?.toUpperCase() === empNameUpper ||
            (emp.branchAllowances && typeof emp.branchAllowances === 'object' && b.id in emp.branchAllowances)
          ))
          .map(b => b.name)
          .join(', ') || '—';
        const specialization = getEmployeeRole(emp, emp.branchId)
          .split(',')
          .filter(r => !['MANAGER', 'RELIEVER'].includes(r.trim().toUpperCase()))
          .join(', ') || '—';
        const isManager = branches.some(b => b.manager?.toUpperCase() === empNameUpper);
        const empId = emp.timestamp
          ? (() => { const d = new Date(emp.timestamp); const mm = String(d.getUTCMonth() + 1).padStart(2, '0'); const dd = String(d.getUTCDate()).padStart(2, '0'); return `EMP-${mm}-${dd}-${emp.id}`; })()
          : emp.id;
        return {
          'FIRST NAME': (emp.firstName || '').toUpperCase(),
          'MIDDLE NAME': (emp.middleName || '').toUpperCase(),
          'LAST NAME': (emp.lastName || '').toUpperCase(),
          'FULL NAME': empNameUpper,
          'EMP ID': empId.toUpperCase(),
          'HOME BRANCH': homeBranch.toUpperCase(),
          'RELIEVER BRANCHES': relieverBranches.toUpperCase(),
          'SPECIALIZATION': specialization.toUpperCase(),
          'STATUS': emp.isActive ? 'ACTIVE' : 'INACTIVE',
          'POSITION': isManager ? 'MANAGER' : 'REGULAR',
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Staff Directory');
      XLSX.writeFile(wb, `STAFF_DIRECTORY_${getManilaTodayStr()}.xlsx`);
      playSound('success');
    } catch (error) {
      console.error('CSV Export failed:', error);
      alert('Failed to generate spreadsheet.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={`animate-in fade-in duration-300 ${UI_THEME.layout.maxContent} pb-32`}>

      {/* SECURITY WIPE MODAL */}
      {showAdminWipeConfirm && (
        <div className={`${UI_THEME.layout.modalWrapper} no-print`}>
           <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-10 text-center border border-slate-100`}>
              <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner">
                <Shield className="w-8 h-8 text-rose-500" />
              </div>
              <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Authorize Data Wipe?</h4>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide leading-relaxed mb-10">
                Wiping credentials for <span className="text-slate-900 truncate" title={showAdminWipeConfirm.name || 'UNNAMED'}>{showAdminWipeConfirm.name || 'UNNAMED'}</span>. Account will revert to setup mode and require a new terminal handshake.
              </p>
              <div className="flex flex-col gap-3">
                 <button onClick={handleAdminCredentialWipe} disabled={isSaving} className="w-full bg-rose-600 text-white font-black py-5 rounded-2xl uppercase tracking-widest text-xs shadow-lg active:scale-95 transition-all">
                    {isSaving ? 'Establishing Link...' : 'Confirm Identity Wipe'}
                 </button>
                 <button onClick={() => setShowAdminWipeConfirm(null)} disabled={isSaving} className="w-full py-4 text-slate-400 font-black text-xs uppercase tracking-widest">Abort</button>
              </div>
           </div>
        </div>
      )}

      {/* HEADER + FILTER SECTION */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm mb-6 space-y-6 no-print">
        <div className="flex flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">Staff Directory</h3>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Global Identity Management</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!isReadOnly && (
              <button
                onClick={() => handleOpenEdit()}
                className="h-10 sm:h-11 rounded-2xl bg-emerald-500 px-4 sm:px-6 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wide text-white hover:bg-emerald-600 transition-all active:scale-95"
              >
                <span className="text-lg leading-none">+</span>
                <span className="hidden sm:inline">Register Staff</span>
              </button>
            )}
          </div>
        </div>

        {/* SEARCH + FILTER TOGGLE ROW */}
        <div className="flex flex-row items-center gap-2 sm:gap-4">
          <div className={`relative flex-1 group ${UI_THEME.styles.controlHeight}`}>
            <div className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors">
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth="3" /></svg>
            </div>
            <input 
              type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} 
              placeholder="SEARCH NAME OR EMPLOYEE ID..."
              className={`w-full h-full pl-10 sm:pl-14 pr-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs sm:text-sm uppercase tracking-wider outline-none focus:bg-white focus:border-emerald-500 transition-all placeholder:text-slate-300 shadow-inner`}
            />
          </div>

          <button
            onClick={() => { setShowFilters(!showFilters); playSound('click'); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border transition-all text-xs font-semibold uppercase tracking-wide shrink-0 ${showFilters ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-500 hover:text-emerald-600'}`}
          >
            <svg className={`w-4 h-4 transition-transform duration-300 ${showFilters ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M19 9l-7 7-7-7" /></svg>
            <span className="hidden sm:inline">{showFilters ? 'Hide Filters' : 'Filters'}</span>
            {(selectedBranchIds.length > 0 || roleFilter !== 'all' || statusFilter !== 'active' || resetRequestedOnly) && !showFilters && <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>}
          </button>
        </div>

        {showFilters && (
          <div className="space-y-4 sm:space-y-6 animate-in fade-in slide-in-from-top-2 duration-300 pt-4 border-t border-slate-100">
            <div className="flex gap-2 shrink-0 flex-wrap lg:flex-nowrap relative z-[200]">
              {/* BRANCH DROPDOWN */}
              <BranchCheckboxDropdown
                branches={branches}
                selectedIds={selectedBranchIds}
                onChange={ids => { setSelectedBranchIds(ids); playSound('click'); }}
                className="flex-1 sm:flex-none sm:min-w-[180px]"
              />

              {/* ROLE DROPDOWN */}
              <div className="relative flex-1 sm:flex-none" ref={roleDropdownRef}>
                <button 
                  onClick={() => { setIsRoleDropdownOpen(!isRoleDropdownOpen); playSound('click'); }}
                  className={`h-11 sm:h-12 min-w-[140px] sm:min-w-[160px] w-full flex items-center justify-between px-4 sm:px-5 bg-slate-50 border border-slate-200 rounded-2xl transition-all ${isRoleDropdownOpen ? 'bg-white border-emerald-500 shadow-lg' : 'hover:border-slate-300'}`}
                >
                  <span className={`${UI_THEME.text.metadata} text-slate-900 truncate pr-2`}>
                    {roleFilter === 'all' ? 'All Roles' : roleFilter.charAt(0) + roleFilter.slice(1).toLowerCase() + 's'}
                  </span>
                  <svg className="w-3 h-3 sm:w-4 sm:h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeWidth="4" /></svg>
                </button>
                {isRoleDropdownOpen && (
                  <div className={`absolute top-[calc(100%+8px)] left-0 sm:right-0 sm:left-auto w-56 bg-white border border-slate-200 rounded-2xl ${UI_THEME.shadows.extreme} overflow-hidden z-[1000] p-1.5 animate-in zoom-in-95 duration-200 backdrop-blur-xl`}>
                    {['all', 'MANAGER', 'THERAPIST', 'BONESETTER'].map(role => (
                      <button 
                        key={role} 
                        onClick={() => { setRoleFilter(role); setIsRoleDropdownOpen(false); }} 
                        className={`w-full text-left px-4 py-3 rounded-lg ${UI_THEME.text.metadata} mb-1 last:mb-0 ${roleFilter === role ? 'bg-slate-900 text-white shadow-lg' : 'hover:bg-slate-50'}`}
                      >
                        {role === 'all' ? 'All Roles' : role.charAt(0) + role.slice(1).toLowerCase() + 's'}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* RESET REQUEST TOGGLE */}
              <button
                onClick={() => { setResetRequestedOnly(!resetRequestedOnly); playSound('click'); }}
                className={`h-11 sm:h-12 px-5 rounded-2xl border transition-all flex items-center gap-3 ${resetRequestedOnly ? 'bg-rose-600 border-rose-600 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-600 hover:border-rose-400 hover:text-rose-600'}`}
              >
                <div className={`w-2 h-2 rounded-full ${resetRequestedOnly ? 'bg-white animate-pulse' : 'bg-rose-500'}`}></div>
                <span className="text-xs font-semibold uppercase tracking-wide whitespace-nowrap">
                  {resetRequestedOnly ? 'Showing Requests' : 'Filter Requests'}
                </span>
                {resetRequestedCount > 0 && !resetRequestedOnly && (
                  <span className="bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-md text-xs font-black">
                    {resetRequestedCount}
                  </span>
                )}
              </button>

              {/* STATUS DROPDOWN */}
              <div className="relative flex-1 sm:flex-none" ref={statusDropdownRef}>
                <button 
                  onClick={() => { setIsStatusDropdownOpen(!isStatusDropdownOpen); playSound('click'); }}
                  className={`h-11 sm:h-12 min-w-[140px] sm:min-w-[160px] w-full flex items-center justify-between px-4 sm:px-5 bg-slate-50 border border-slate-200 rounded-2xl transition-all ${isStatusDropdownOpen ? 'bg-white border-emerald-500 shadow-lg' : 'hover:border-slate-300'}`}
                >
                  <span className={`${UI_THEME.text.metadata} text-slate-900 truncate pr-2`}>
                    {statusFilter === 'all' ? 'All Status' : statusFilter === 'active' ? 'Active Only' : 'Inactive Only'}
                  </span>
                  <svg className="w-3 h-3 sm:w-4 sm:h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeWidth="4" /></svg>
                </button>
                {isStatusDropdownOpen && (
                  <div className={`absolute top-[calc(100%+8px)] left-0 sm:right-0 sm:left-auto w-56 bg-white border border-slate-200 rounded-2xl ${UI_THEME.shadows.extreme} overflow-hidden z-[1000] p-1.5 animate-in zoom-in-95 duration-200 backdrop-blur-xl`}>
                    {[
                      { id: 'active', label: 'Active Only' },
                      { id: 'inactive', label: 'Inactive Only' },
                      { id: 'all', label: 'All Status' }
                    ].map(item => (
                      <button 
                        key={item.id} 
                        onClick={() => { setStatusFilter(item.id as any); setIsStatusDropdownOpen(false); }} 
                        className={`w-full text-left px-4 py-3 rounded-lg ${UI_THEME.text.metadata} mb-1 last:mb-0 ${statusFilter === item.id ? 'bg-slate-900 text-white shadow-lg' : 'hover:bg-slate-50'}`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* SORT DROPDOWN */}
              <div className="relative flex-1 sm:flex-none" ref={sortDropdownRef}>
                <button 
                  onClick={() => { setIsSortDropdownOpen(!isSortDropdownOpen); playSound('click'); }}
                  className={`h-11 sm:h-12 min-w-[140px] sm:min-w-[160px] w-full flex items-center justify-between px-4 sm:px-5 bg-slate-50 border border-slate-200 rounded-2xl transition-all ${isSortDropdownOpen ? 'bg-white border-emerald-500 shadow-lg' : 'hover:border-slate-300'}`}
                >
                  <span className={`${UI_THEME.text.metadata} text-slate-900 truncate pr-2`}>
                    {sortBy === 'name' ? 'Sort by Name' : sortBy === 'pay_desc' ? 'Highest Pay' : 'Lowest Pay'}
                  </span>
                  <svg className="w-3 h-3 sm:w-4 sm:h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeWidth="4" /></svg>
                </button>
                {isSortDropdownOpen && (
                  <div className={`absolute top-[calc(100%+8px)] left-0 sm:right-0 sm:left-auto w-56 bg-white border border-slate-200 rounded-2xl ${UI_THEME.shadows.extreme} overflow-hidden z-[1000] p-1.5 animate-in zoom-in-95 duration-200 backdrop-blur-xl`}>
                    {[
                      { id: 'name', label: 'Sort by Name' },
                      { id: 'pay_desc', label: 'Highest Pay' },
                      { id: 'pay_asc', label: 'Lowest Pay' }
                    ].map(item => (
                      <button 
                        key={item.id} 
                        onClick={() => { setSortBy(item.id as any); setIsSortDropdownOpen(false); }} 
                        className={`w-full text-left px-4 py-3 rounded-lg ${UI_THEME.text.metadata} mb-1 last:mb-0 ${sortBy === item.id ? 'bg-slate-900 text-white shadow-lg' : 'hover:bg-slate-50'}`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-1 space-y-4 no-print">
        <div className="flex items-center gap-3 px-1 sm:px-2">
          <div className="flex-1 min-w-0">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={filteredEmployees.length}
              itemsPerPage={itemsPerPage}
              onItemsPerPageChange={(n) => { setItemsPerPage(n); setCurrentPage(1); }}
            />
          </div>

          <div ref={exportDropdownRef} className="relative shrink-0">
            <div className={`flex h-14 rounded-2xl overflow-hidden shadow-lg ${isExporting || filteredEmployees.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
              <button
                onClick={() => { setExportDropdownOpen(false); handleExportPDF(); }}
                className="flex items-center gap-2.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold uppercase tracking-wide transition-all active:scale-95"
              >
                {isExporting ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>}
                <span className="hidden sm:inline">{isExporting ? 'Exporting...' : 'Export'}</span>
              </button>
              <div className="w-px bg-emerald-700" />
              <button onClick={() => setExportDropdownOpen(o => !o)} className="px-3 bg-emerald-600 hover:bg-emerald-700 text-white transition-all active:scale-95">
                <svg className={`w-3.5 h-3.5 transition-transform ${exportDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
            </div>
            {exportDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-44 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden z-50">
                <button onMouseDown={e => e.stopPropagation()} onClick={() => { setExportDropdownOpen(false); handleExportPDF(); }} className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                  Export PDF
                </button>
                <div className="h-px bg-slate-100 dark:bg-slate-700" />
                <button onMouseDown={e => e.stopPropagation()} onClick={() => { setExportDropdownOpen(false); handleExportCSV(); }} className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Export Excel
                </button>
              </div>
            )}
          </div>
        </div>

        {showPrintConfirm && (
          <div className={UI_THEME.layout.modalWrapper}>
            <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-10 text-center border border-slate-100`}>
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M17 17h2a2 2-0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              </div>
              <h4 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Export Employees?</h4>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide leading-relaxed">
                Generate and download the global staff directory report?
              </p>
              <div className="flex flex-col gap-4 mt-10">
                <button
                  onClick={() => handleExportPDF(true)}
                  className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3"
                >
                  Confirm Export
                </button>
                <button
                  onClick={() => setShowPrintConfirm(false)}
                  className="w-full text-slate-400 font-black py-4 rounded-xl text-xs uppercase tracking-widest"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <EmployeeTable
          employees={paginatedEmployees}
          branches={branches}
          onEdit={isReadOnly ? undefined : handleOpenEdit}
          onReset={isReadOnly ? undefined : handleOpenResetModal}
          onDelete={isReadOnly ? undefined : (emp) => { setShowDeleteConfirm(emp); playSound('click'); }}
          onEndLeave={isReadOnly ? undefined : (emp) => { setShowEndLeaveConfirm(emp); playSound('click'); }}
          currentBranchId={selectedBranchIds.length === 1 ? selectedBranchIds[0] : undefined}
        />
        <EmployeeMobileList
          employees={paginatedEmployees}
          branches={branches}
          onEdit={isReadOnly ? undefined : handleOpenEdit}
          onReset={isReadOnly ? undefined : handleOpenResetModal}
          onDelete={isReadOnly ? undefined : (emp) => { setShowDeleteConfirm(emp); playSound('click'); }}
          onEndLeave={isReadOnly ? undefined : (emp) => { setShowEndLeaveConfirm(emp); playSound('click'); }}
          currentBranchId={selectedBranchIds.length === 1 ? selectedBranchIds[0] : undefined}
        />
      </div>

      {idCardEmployee && (
        <EmployeeIDCardModal
          employee={idCardEmployee}
          branches={branches}
          onClose={() => setIdCardEmployee(null)}
        />
      )}

      {resettingEmployee && (
        <div className="no-print">
          <RecoveryModal
            employee={resettingEmployee}
            branches={branches}
            isSaving={updateEmployee.isPending}
            onClose={() => setResettingEmployee(null)}
            onRefresh={onRefresh}
            onSyncStatusChange={onSyncStatusChange}
          />
        </div>
      )}

      {editingEmployee && !resettingEmployee && (
        <div className="no-print">
          <EditorModal
            key={editingEmployee?.id || 'new'}
            employee={{...editingEmployee, allEmployees: employees} as any}
            branches={branches}
            isSaving={isSaving}
            error={error}
            customRoles={customRoles}
            onClose={() => setEditingEmployee(null)}
            onSave={handleSaveEmployee}
            onSavePersonalDetails={handleSavePersonalDetails}
            onWipe={(target) => { setShowAdminWipeConfirm(target as Employee); }}
            onReset={handleOpenResetModal}
            onDelete={(emp) => { setShowDeleteConfirm(emp); playSound('click'); }}
            onViewID={(emp) => { setEditingEmployee(null); setIdCardEmployee(emp); playSound('click'); }}
          />
        </div>
      )}

      {showEndLeaveConfirm && (
        <div className={UI_THEME.layout.modalWrapper}>
          <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-10 text-center border border-slate-100`}>
            <div className="w-16 h-16 bg-purple-50 text-purple-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner text-3xl">🏥</div>
            <h4 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tighter">End Leave?</h4>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide leading-relaxed">
              Return <span className="text-purple-600 truncate" title={showEndLeaveConfirm.name}>{showEndLeaveConfirm.name}</span> from leave and restore their active status.
            </p>
            <div className="flex flex-col gap-4 mt-10">
              <button
                onClick={handleEndLeave}
                disabled={isSaving}
                className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {isSaving ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : 'Confirm Return from Leave'}
              </button>
              <button onClick={() => setShowEndLeaveConfirm(null)} className="w-full text-slate-400 font-black py-4 rounded-xl text-xs uppercase tracking-widest">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className={UI_THEME.layout.modalWrapper}>
          <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-10 text-center border border-slate-100`}>
            <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h4 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Delete Personnel?</h4>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide leading-relaxed">
              Are you sure you want to permanently delete <span className="text-rose-600 truncate" title={showDeleteConfirm.name}>{showDeleteConfirm.name}</span>? This action cannot be undone.
            </p>
            <div className="flex flex-col gap-4 mt-10">
              <button
                onClick={handleDeleteEmployee}
                disabled={isSaving}
                className="w-full bg-rose-600 text-white font-black py-5 rounded-2xl text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {isSaving ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : 'Confirm Deletion'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="w-full text-slate-400 font-black py-4 rounded-xl text-xs uppercase tracking-widest"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
