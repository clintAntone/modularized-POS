import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Branch, Employee, Transaction, Attendance } from '../../../types';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';
import { UI_THEME } from '../../../constants/ui_designs';
import { supabase } from '../../../lib/supabase';
import { logAudit } from '../../../lib/audit';
import { playSound } from '../../../lib/audio';
import { compressImage } from '../../../lib/image';
import { deleteFileByUrl } from '../../../lib/storage';
import { getEmployeeAllowance, getEmployeeRole } from '../../../lib/payroll';
import { useAddEmployee, useUpdateEmployee, useAddAttendance, useUpdateAttendance, useAddAuditLog } from '../../../hooks/useNetworkData';
import { getTrueDate, getTrueISOString, getTrueManilaISOString } from '../../../lib/time';
import { syncRelieverPayouts } from '@/src/services/relieverPayoutService';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { AlertTriangle, Users } from 'lucide-react';

// Modular Imports
import { StaffCard } from './staff/StaffCard';
import { StaffHeader } from './staff/StaffHeader';
import { StaffModals } from './staff/StaffModals';
import { FaceTimeInModal } from './staff/FaceTimeInModal';

interface StaffDirectorySectionProps {
  branch: Branch;
  branches: Branch[];
  employees: Employee[];
  attendance: Attendance[];
  transactions: Transaction[];
  isClosedMode?: boolean;
  onRefresh?: (quiet?: boolean) => void;
  isSetupRequired?: boolean;
  onSyncStatusChange?: (isSyncing: boolean) => void;
  isDelegate?: boolean;
  isManagerView?: boolean;
  onNavigateToComplaints?: () => void;
}

interface Toast {
  message: string;
  type: 'success' | 'error';
}

export const StaffDirectorySection: React.FC<StaffDirectorySectionProps> = ({ branch, branches, employees, attendance, transactions, isClosedMode = false, onRefresh, isSetupRequired, onSyncStatusChange, isDelegate = false, isManagerView = false, onNavigateToComplaints }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRoles, setFilterRoles] = useState<string[]>([]);
  const [filterActiveOnly, setFilterActiveOnly] = useState(true);

  const [isSyncing, setIsSyncing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPullMode, setIsPullMode] = useState(false);
  const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);
  const [showBranchClosedModal, setShowBranchClosedModal] = useState(false);
  const [selectedEmpForTime, setSelectedEmpForTime] = useState<Employee | null>(null);
  const [showFaceTimeIn, setShowFaceTimeIn] = useState(false);
  const [faceTimeInTarget, setFaceTimeInTarget] = useState<Employee | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Partial<Employee> | null>(null);
  const [recoveryEmployee, setRecoveryEmployee] = useState<Employee | null>(null);
  const [originalName, setOriginalName] = useState<string>('');
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [confirmPromoteEmployee, setConfirmPromoteEmployee] = useState<Employee | null>(null);
  const [promoteConfirmInput, setPromoteConfirmInput] = useState('');
  const [isPromoting, setIsPromoting] = useState(false);

  // Return from leave confirmation
  const [returnEmployee, setReturnEmployee] = useState<Employee | null>(null);

  // Leave modal
  const [leaveEmployee, setLeaveEmployee] = useState<Employee | null>(null);
  const [leaveSubtype, setLeaveSubtype] = useState<'LEAVE'>('LEAVE' as 'LEAVE');
  const [leaveType, setLeaveType] = useState('');
  const [leaveStartDate, setLeaveStartDate] = useState('');
  const [leaveEndDate, setLeaveEndDate] = useState('');
  const [leaveNotes, setLeaveNotes] = useState('');
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);

  const openLeaveModal = (emp: Employee) => {
    setLeaveEmployee(emp);
    setLeaveSubtype('');
    setLeaveType('');
    setLeaveStartDate('');
    setLeaveEndDate('');
    setLeaveNotes('');
  };
  const closeLeaveModal = () => setLeaveEmployee(null);

  // Disable modal
  const [disableEmployee, setDisableEmployee] = useState<Employee | null>(null);
  const [disableReason, setDisableReason] = useState<'RESIGNED' | 'TERMINATED' | ''>('');
  const [complaintRef, setComplaintRef] = useState('');
  const [disableNotes, setDisableNotes] = useState('');
  const [isSubmittingDisable, setIsSubmittingDisable] = useState(false);

  const openDisableModal = (emp: Employee) => {
    setDisableEmployee(emp);
    setDisableReason('');
    setComplaintRef('');
    setDisableNotes('');
  };
  const closeDisableModal = () => setDisableEmployee(null);

  // New employee creation request
  const [showNewEmpRequest, setShowNewEmpRequest] = useState(false);
  const [newEmpFirstName, setNewEmpFirstName] = useState('');
  const [newEmpMiddleName, setNewEmpMiddleName] = useState('');
  const [newEmpLastName, setNewEmpLastName] = useState('');
  const [newEmpRole, setNewEmpRole] = useState('');
  const [newEmpAllowance, setNewEmpAllowance] = useState('');
  const [newEmpSimilarWarning, setNewEmpSimilarWarning] = useState<string | null>(null);
  const [newEmpBlockError, setNewEmpBlockError] = useState<string | null>(null);
  const [isSubmittingNewEmp, setIsSubmittingNewEmp] = useState(false);

  const [removeRelieversEmployee, setRemoveRelieversEmployee] = useState<Employee | null>(null);
  const [isRemovingReliever, setIsRemovingReliever] = useState(false);

  const addEmployee = useAddEmployee();
  const updateEmployee = useUpdateEmployee();
  const addAttendance = useAddAttendance();
  const updateAttendance = useUpdateAttendance();
  const addAuditLog = useAddAuditLog();
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [now, setNow] = useState(getTrueDate());
  useEffect(() => {
    const timer = setInterval(() => setNow(getTrueDate()), 60000);
    return () => clearInterval(timer);
  }, []);

  const todayStr = useMemo(() => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now), [now]);

  // 1-second tick only while clock-out modal is open, to unlock after 1 minute
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!isTimeModalOpen) return;
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [isTimeModalOpen]);

  const clockOutLocked = useMemo(() => {
    if (!isTimeModalOpen || !selectedEmpForTime) return false;
    const ongoingRec = (attendance || []).find(a =>
      a.employeeId === selectedEmpForTime.id && a.date === todayStr && a.clockIn && !a.clockOut
    );
    if (!ongoingRec) return false;
    const elapsed = (getTrueDate().getTime() - new Date(ongoingRec.clockIn).getTime()) / 1000;
    return elapsed < 60;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTimeModalOpen, selectedEmpForTime?.id, attendance, todayStr, tick]);


  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  };

  const operatorName = useMemo(() => {
    const saved = localStorage.getItem('hilot_core_session_v4');
    if (saved) {
      const parsed = JSON.parse(saved);
      const empId = parsed.user?.employeeId;
      return employees.find(e => e.id === empId)?.name || '';
    }
    return '';
  }, [employees]);

  const branchStaff = useMemo(() => {
    let list = employees.filter(e => {
        const isHomeBranch = e.branchId === branch.id;
        const isAuthorized = e.branchAllowances && typeof e.branchAllowances === 'object' && branch.id in (e.branchAllowances as any);
        const isDesignatedManager = branch.manager?.toUpperCase() === e.name?.toUpperCase();
        const isTempManager = branch.tempManager?.toUpperCase() === e.name?.toUpperCase();
        
        // Check if they have MANAGER role in branchAllowances for THIS branch
        const allowance = e.branchAllowances?.[branch.id];
        const hasManagerRole = allowance && typeof allowance === 'object' && allowance.role?.includes('MANAGER');
        
        return isHomeBranch || isAuthorized || isDesignatedManager || isTempManager || hasManagerRole;
    });

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(e => e.name.toLowerCase().includes(term));
    }

    if (filterRoles.length > 0) {
      list = list.filter(e => {
        const currentRole = getEmployeeRole(e, branch.id);
        const empRoles = (currentRole || '').split(',').map(r => r.trim());
        return filterRoles.some(r => empRoles.includes(r));
      });
    }

    if (filterActiveOnly) {
      list = list.filter(e => e.isActive !== false);
    }

    return list.sort((a, b) => {
        if (!a || !b) return 0;
        const isAMain = branch.manager?.toUpperCase() === (a.name || '').toUpperCase();
        const isBMain = branch.manager?.toUpperCase() === (b.name || '').toUpperCase();
        const isATemp = branch.tempManager?.toUpperCase() === (a.name || '').toUpperCase();
        const isBTemp = branch.tempManager?.toUpperCase() === (b.name || '').toUpperCase();

        const aRole = getEmployeeRole(a, branch.id);
        const bRole = getEmployeeRole(b, branch.id);
        const isAManagerRole = aRole.includes('MANAGER');
        const isBManagerRole = bRole.includes('MANAGER');

        const isAReliever = a.branchId !== branch.id;
        const isBReliever = b.branchId !== branch.id;

        // Priority 1: Main Manager
        if (isAMain && !isBMain) return -1;
        if (!isAMain && isBMain) return 1;

        // Priority 2: Temp Manager
        if (isATemp && !isBTemp) return -1;
        if (!isATemp && isBTemp) return 1;

        // Priority 3: Any Manager Role
        if (isAManagerRole && !isBManagerRole) return -1;
        if (!isAManagerRole && isBManagerRole) return 1;

        // Priority 4: Regular (home branch) before relievers
        if (!isAReliever && isBReliever) return -1;
        if (isAReliever && !isBReliever) return 1;

        // Priority 5: On leave at the bottom
        if (a.onLeave && !b.onLeave) return 1;
        if (!a.onLeave && b.onLeave) return -1;

        return (a.name || '').localeCompare(b.name || '');
    });
  }, [employees, branch.id, branch.manager, branch.tempManager, searchTerm, filterRoles, filterActiveOnly]);


  const handleOpenEdit = (emp?: Employee) => {
    playSound('click');
    setIsPullMode(false);
    if (emp) {
      setEditingEmployee({ ...emp });
      setOriginalName(emp.name?.toUpperCase().trim() || '');
    } else {
      setEditingEmployee({ 
        name: '', 
        firstName: '',
        middleName: '',
        lastName: '',
        role: '', 
        allowance: 0, 
        isActive: true, 
        branchId: branch.id 
      });
      setOriginalName('');
    }
    setProfileFile(null);
    setIsModalOpen(true);
  };

  const handleOpenPull = () => {
    playSound('click');
    setIsPullMode(true);
    setEditingEmployee({ 
      name: '', 
      firstName: '',
      middleName: '',
      lastName: '',
      role: '', 
      allowance: 0, 
      isActive: true, 
      branchId: branch.id 
    });
    setOriginalName('');
    setProfileFile(null);
    setIsModalOpen(true);
  };

  const handleOpenReset = (emp: Employee) => {
    playSound('click');
    setRecoveryEmployee(emp);
  };

  const handlePromoteToRegular = (emp: Employee) => {
    playSound('click');
    setConfirmPromoteEmployee(emp);
    setPromoteConfirmInput('');
  };

  const handleConfirmPromotion = async () => {
    if (!confirmPromoteEmployee || isPromoting) return;
    setIsPromoting(true);
    try {
      const { error } = await supabase
        .from(DB_TABLES.EMPLOYEES)
        .update({ [DB_COLUMNS.BRANCH_ID]: branch.id })
        .eq('id', confirmPromoteEmployee.id);

      if (error) throw error;

      await addAuditLog.mutateAsync({
        [DB_COLUMNS.BRANCH_ID]: branch.id,
        [DB_COLUMNS.TIMESTAMP]: getTrueManilaISOString(),
        [DB_COLUMNS.ACTIVITY_TYPE]: 'PROMOTE_TO_REGULAR',
        [DB_COLUMNS.ENTITY_TYPE]: 'EMPLOYEE',
        [DB_COLUMNS.ENTITY_ID]: confirmPromoteEmployee.id,
        [DB_COLUMNS.DESCRIPTION]: `${confirmPromoteEmployee.name} transferred from reliever to regular staff at ${branch.name}. Previous branch: ${confirmPromoteEmployee.branchId}.`,
      });

      playSound('success');
      showToast(`${confirmPromoteEmployee.name} promoted to regular staff`);
      setConfirmPromoteEmployee(null);
      onRefresh?.();
    } catch (err) {
      console.error('Promotion failed:', err);
      playSound('warning');
      showToast('Promotion failed. Please try again.', 'error');
    } finally {
      setIsPromoting(false);
    }
  };

  const handleReturnFromLeave = (emp: Employee) => {
    setReturnEmployee(emp);
  };

  const confirmReturnFromLeave = async () => {
    if (!returnEmployee) return;
    try {
      const { error } = await supabase
        .from(DB_TABLES.EMPLOYEES)
        .update({
          [DB_COLUMNS.ON_LEAVE]: false,
          [DB_COLUMNS.LEAVE_TYPE]: null,
          [DB_COLUMNS.LEAVE_START_DATE]: null,
          [DB_COLUMNS.LEAVE_END_DATE]: null,
        })
        .eq(DB_COLUMNS.ID, returnEmployee.id);
      if (error) throw error;
      await logAudit({
        branchId: branch.id,
        activityType: 'EMPLOYEE_LEAVE_RETURNED',
        entityType: 'EMPLOYEE',
        entityId: returnEmployee.id,
        description: `${returnEmployee.name} returned from leave`,
        performerName: operatorName || 'MANAGER',
      });
      playSound('success');
      setReturnEmployee(null);
      showToast(`${returnEmployee.name} has returned from leave`);
      onRefresh?.();
    } catch {
      playSound('warning');
      showToast('Failed to update. Try again.', 'error');
    }
  };

  const handleSubmitLeaveRequest = async () => {
    if (!leaveEmployee || isSubmittingLeave || !leaveType) return;
    const finalLeaveType = leaveType;
    const noDates = ['SICK', 'EMERGENCY'].includes(finalLeaveType);
    if (!noDates && !leaveStartDate) return;
    const needsEnd = ['VACATION', 'MATERNITY', 'PATERNITY'].includes(finalLeaveType);
    if (needsEnd && !leaveEndDate) return;
    setIsSubmittingLeave(true);
    try {
      const { error } = await supabase
        .from(DB_TABLES.EMPLOYEES)
        .update({
          [DB_COLUMNS.ON_LEAVE]: true,
          [DB_COLUMNS.LEAVE_TYPE]: finalLeaveType,
          [DB_COLUMNS.LEAVE_START_DATE]: leaveStartDate || null,
          [DB_COLUMNS.LEAVE_END_DATE]: leaveEndDate || null,
        })
        .eq(DB_COLUMNS.ID, leaveEmployee.id);
      if (error) throw error;
      await logAudit({
        branchId: branch.id,
        activityType: 'EMPLOYEE_LEAVE_SET',
        entityType: 'EMPLOYEE',
        entityId: leaveEmployee.id,
        description: `${leaveEmployee.name} placed on ${finalLeaveType} leave${leaveNotes.trim() ? ` — ${leaveNotes.trim()}` : ''}`,
        performerName: operatorName || 'MANAGER',
      });
      playSound('success');
      showToast(`${leaveEmployee.name} has been placed on leave`);
      closeLeaveModal();
      onRefresh?.();
    } catch (err) {
      playSound('warning');
      showToast('Failed to update leave status. Try again.', 'error');
    } finally {
      setIsSubmittingLeave(false);
    }
  };

  const handleSubmitDisableRequest = async () => {
    if (!disableEmployee || isSubmittingDisable || !disableReason) return;
    if (disableReason === 'TERMINATED' && !complaintRef.trim()) return;
    setIsSubmittingDisable(true);
    try {
      const { error } = await supabase.from(DB_TABLES.REQUESTS).insert({
        [DB_COLUMNS.ID]: Math.random().toString(36).substr(2, 9),
        [DB_COLUMNS.BRANCH_ID]: branch.id,
        [DB_COLUMNS.TIMESTAMP]: getTrueISOString(),
        [DB_COLUMNS.TYPE]: 'DISABLE_EMPLOYEE',
        [DB_COLUMNS.STATUS]: 'PENDING',
        [DB_COLUMNS.DATA]: {
          employeeId: disableEmployee.id,
          employeeName: disableEmployee.name,
          reasonType: disableReason,
          reason: disableNotes.trim(),
          ...(disableReason === 'TERMINATED' && { complaintRef: complaintRef.trim() }),
        },
        [DB_COLUMNS.REQUESTER_ID]: operatorName,
        [DB_COLUMNS.REQUESTER_NAME]: operatorName || 'MANAGER',
      });
      if (error) throw error;
      playSound('success');
      showToast(`Disable request submitted for ${disableEmployee.name}`);
      closeDisableModal();
      onRefresh?.();
    } catch (err) {
      playSound('warning');
      showToast('Request failed. Try again.', 'error');
    } finally {
      setIsSubmittingDisable(false);
    }
  };

  const checkNewEmpName = (first: string, middle: string, last: string) => {
    if (!first.trim() || !last.trim()) { setNewEmpSimilarWarning(null); setNewEmpBlockError(null); return; }
    const fullName = `${first.trim()} ${middle.trim() ? middle.trim() + ' ' : ''}${last.trim()}`.trim().toUpperCase();
    // Check all employees (active and inactive)
    const exactMatch = employees.find(e => {
      const en = e.firstName && e.lastName
        ? `${e.firstName} ${e.middleName ? e.middleName + ' ' : ''}${e.lastName}`.trim().toUpperCase()
        : (e.name || '').toUpperCase();
      return en === fullName;
    });
    if (exactMatch) {
      setNewEmpBlockError(`"${fullName}" already exists in the system${exactMatch.isActive === false ? ' (suspended)' : ''}.`);
      setNewEmpSimilarWarning(null);
      return;
    }
    // Check same first+last name ignoring middle
    const sameFirstLast = employees.find(e => {
      const ef = (e.firstName || '').trim().toUpperCase();
      const el = (e.lastName || '').trim().toUpperCase();
      return ef === first.trim().toUpperCase() && el === last.trim().toUpperCase();
    });
    if (sameFirstLast) {
      setNewEmpSimilarWarning(`Similar name found: "${sameFirstLast.name}" already in system. Verify this is a different person.`);
    } else {
      setNewEmpSimilarWarning(null);
    }
    setNewEmpBlockError(null);
  };

  const handleSubmitNewEmployeeRequest = async () => {
    if (isSubmittingNewEmp || newEmpBlockError) return;
    const first = newEmpFirstName.trim().toUpperCase();
    const middle = newEmpMiddleName.trim().toUpperCase() || null;
    const last = newEmpLastName.trim().toUpperCase();
    const allowance = Number(newEmpAllowance);
    if (!first || !last || !newEmpRole) { showToast('First name, last name, and role are required.', 'error'); return; }
    if (!allowance || allowance <= 0) { showToast('Daily allowance must be greater than 0.', 'error'); return; }
    const fullName = `${first}${middle ? ' ' + middle : ''} ${last}`.trim();
    setIsSubmittingNewEmp(true);
    try {
      const { error } = await supabase.from(DB_TABLES.REQUESTS).insert({
        [DB_COLUMNS.ID]: Math.random().toString(36).substr(2, 9),
        [DB_COLUMNS.BRANCH_ID]: branch.id,
        [DB_COLUMNS.TIMESTAMP]: getTrueISOString(),
        [DB_COLUMNS.TYPE]: 'CREATE_EMPLOYEE',
        [DB_COLUMNS.STATUS]: 'PENDING',
        [DB_COLUMNS.DATA]: {
          firstName: first,
          middleName: middle,
          lastName: last,
          name: fullName,
          role: newEmpRole,
          allowance,
          branchId: branch.id,
        },
        [DB_COLUMNS.REQUESTER_ID]: operatorName,
        [DB_COLUMNS.REQUESTER_NAME]: operatorName || 'MANAGER',
      });
      if (error) throw error;
      playSound('success');
      showToast(`New staff request submitted for ${fullName}`);
      setShowNewEmpRequest(false);
      setNewEmpFirstName(''); setNewEmpMiddleName(''); setNewEmpLastName('');
      setNewEmpRole('THERAPIST'); setNewEmpAllowance('');
      setNewEmpSimilarWarning(null); setNewEmpBlockError(null);
      onRefresh?.();
    } catch (err) {
      playSound('warning');
      showToast('Request failed. Try again.', 'error');
    } finally {
      setIsSubmittingNewEmp(false);
    }
  };

  const handleConfirmRemoveReliever = async () => {
    if (!removeRelieversEmployee || isRemovingReliever) return;
    setIsRemovingReliever(true);
    try {
      const updatedAllowances = { ...(removeRelieversEmployee.branchAllowances || {}) };
      delete updatedAllowances[branch.id];

      await updateEmployee.mutateAsync({
        id: removeRelieversEmployee.id,
        [DB_COLUMNS.BRANCH_ALLOWANCES]: updatedAllowances,
      });

      // Delete all RELIEVER PAYOUT expenses for this employee on this branch
      await supabase
        .from(DB_TABLES.EXPENSES)
        .delete()
        .eq(DB_COLUMNS.BRANCH_ID, branch.id)
        .like(DB_COLUMNS.NAME, `RELIEVER PAYOUT: ${removeRelieversEmployee.name}%`);

      await addAuditLog.mutateAsync({
        [DB_COLUMNS.BRANCH_ID]: branch.id,
        [DB_COLUMNS.TIMESTAMP]: getTrueManilaISOString(),
        [DB_COLUMNS.ACTIVITY_TYPE]: 'UPDATE',
        [DB_COLUMNS.ENTITY_TYPE]: 'EMPLOYEE',
        [DB_COLUMNS.ENTITY_ID]: removeRelieversEmployee.id,
        [DB_COLUMNS.DESCRIPTION]: `Reliever ${removeRelieversEmployee.name} removed from branch staff list at ${branch.name}.`,
        [DB_COLUMNS.PERFORMER_NAME]: operatorName || 'NODE OPERATOR',
      });

      playSound('success');
      showToast(`${removeRelieversEmployee.name} removed from staff list`);
      setRemoveRelieversEmployee(null);
      onRefresh?.();
    } catch (err) {
      playSound('warning');
      showToast('Failed to remove reliever. Try again.', 'error');
    } finally {
      setIsRemovingReliever(false);
    }
  };

  const handleExportPDF = async () => {
    if (isExporting) return;
    setIsExporting(true);
    playSound('click');
    try {
      const doc = new jsPDF('l', 'mm', 'a4');
      const timestamp = new Date().toLocaleString();
      
      // Header
      doc.setFontSize(20);
      doc.setTextColor(15, 23, 42);
      doc.text(`STAFF DIRECTORY - ${branch.name.replace('BRANCH - ', '')}`, 14, 22);
      
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated on: ${timestamp}`, 14, 30);
      
      const tableData = branchStaff.map(emp => [
        emp.name.toUpperCase(),
        getEmployeeRole(emp, branch.id).toUpperCase(),
        emp.isActive ? 'ACTIVE' : 'SUSPENDED',
        `P${(emp.branchAllowances?.[branch.id]?.allowance || emp.allowance || 0).toLocaleString()}`
      ]);

      autoTable(doc, {
        startY: 40,
        head: [['Personnel Name', 'Designation', 'Status', 'Daily Allowance']],
        body: tableData,
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        styles: { fontSize: 9, cellPadding: 4 }
      });

      doc.save(`Staff_Directory_${branch.name.replace(/\s+/g, '_')}.pdf`);
      showToast('Personnel Directory Exported (PDF)');
      playSound('success');
    } catch (err) {
      console.error('Export Failed:', err);
      showToast('Export Fault', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCSV = () => {
    if (isExporting || branchStaff.length === 0) return;
    setIsExporting(true);
    playSound('click');
    try {
      const rows = branchStaff.map(emp => ({
        'FIRST NAME': (emp.firstName || '').toUpperCase(),
        'MIDDLE NAME': (emp.middleName || '').toUpperCase(),
        'LAST NAME': (emp.lastName || '').toUpperCase(),
        'FULL NAME': emp.name.toUpperCase(),
        'DESIGNATION': getEmployeeRole(emp, branch.id).toUpperCase(),
        'STATUS': emp.isActive ? 'ACTIVE' : 'SUSPENDED',
        'DAILY ALLOWANCE': getEmployeeAllowance(emp, branch.id),
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Staff Directory');
      XLSX.writeFile(wb, `Staff_Directory_${branch.name.replace(/\s+/g, '_')}.xlsx`);
      showToast('Personnel Directory Exported (Excel)');
      playSound('success');
    } catch (err) {
      console.error('Export Failed:', err);
      showToast('Export Fault', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const toggleRole = (role: string) => {
    if (isSyncing) return;
    playSound('click');
    const selectedRoles = (editingEmployee?.role || '').split(',').filter(Boolean);
    let nextRoles;
    if (selectedRoles.includes(role)) {
      nextRoles = selectedRoles.filter(r => r !== role);
    } else {
      nextRoles = [...selectedRoles, role];
    }
    setEditingEmployee(prev => ({ ...prev, role: nextRoles.join(',') }));
  };

  const handleOpenTimeModal = (emp: Employee) => {
    if (!emp.isActive) {
        playSound('warning');
        showToast('Staff membership is suspended.', 'error');
        return;
    }
    if (emp.onLeave) {
        playSound('warning');
        showToast(`${emp.name} is currently on leave and cannot time in.`, 'error');
        return;
    }
    if (isClosedMode) {
      playSound('warning');
      setShowBranchClosedModal(true);
      return;
    }
    playSound('click');
    setSelectedEmpForTime(emp);
    setIsTimeModalOpen(true);
  };

  const getShiftState = (empId: string): 'NOT_STARTED' | 'ONGOING' | 'COMPLETED' => {
    const todayRecords = (attendance || []).filter(a => a.employeeId === empId && a.date === todayStr);
    if (todayRecords.length === 0) return 'NOT_STARTED';
    
    // If any record is ongoing, the overall state is ongoing
    const hasOngoing = todayRecords.some(a => a.clockIn && !a.clockOut);
    if (hasOngoing) return 'ONGOING';
    
    // If all records are completed, the state is completed
    return 'COMPLETED';
  };

  const handleTimeAction = async () => {
    if (!selectedEmpForTime || isSyncing || isClosedMode) return;
    
    setIsSyncing(true);
    if (onSyncStatusChange) onSyncStatusChange(true);
    
    const state = getShiftState(selectedEmpForTime.id);
    const timestamp = getTrueManilaISOString();

    try {
      if (state === 'NOT_STARTED' || state === 'COMPLETED') {
        // Block clock-in if the employee is already on duty at a different branch today.
        // Managers (at any branch) are exempt — they may legitimately work across branches.
        const isManager = (selectedEmpForTime.role || '').toUpperCase().includes('MANAGER');
        if (!isManager) {
          const ongoingElsewhere = (attendance || []).find(a =>
            a.employeeId === selectedEmpForTime.id &&
            a.date === todayStr &&
            a.clockIn && !a.clockOut &&
            a.branchId !== branch.id
          );
          if (ongoingElsewhere) {
            const otherBranch = branches.find(b => b.id === ongoingElsewhere.branchId);
            const otherName = otherBranch?.name?.replace(/BRANCH\s*-\s*/i, '') ?? 'another branch';
            showToast(`${selectedEmpForTime.name} is currently on duty at ${otherName}. Clock them out there first.`);
            setIsTimeModalOpen(false);
            setIsSyncing(false);
            if (onSyncStatusChange) onSyncStatusChange(false);
            return;
          }
        }

        // Check if the most recent record for today was a half-day record
        const todayRecords = (attendance || []).filter(a => a.employeeId === selectedEmpForTime.id && a.date === todayStr);
        const latestRecord = todayRecords.sort((a, b) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime())[0];

        if (latestRecord && latestRecord.isHalfDay) {
          // Resume from half day - update existing record
          await updateAttendance.mutateAsync({
            id: latestRecord.id,
            [DB_COLUMNS.CLOCK_OUT]: null,
            [DB_COLUMNS.IS_HALF_DAY]: false,
            [DB_COLUMNS.BRANCH_ID]: branch.id,
            [DB_COLUMNS.EMPLOYEE_ID]: selectedEmpForTime.id,
            [DB_COLUMNS.DATE]: todayStr
          });
          showToast(`${selectedEmpForTime.name} resumed duty from half-day.`);
        } else {
          // Create new record
          const attendanceId = Math.random().toString(36).substr(2, 9);
          await addAttendance.mutateAsync({
            [DB_COLUMNS.ID]: attendanceId,
            [DB_COLUMNS.BRANCH_ID]: branch.id,
            [DB_COLUMNS.EMPLOYEE_ID]: selectedEmpForTime.id,
            [DB_COLUMNS.STAFF_NAME]: selectedEmpForTime.name,
            [DB_COLUMNS.DATE]: todayStr,
            [DB_COLUMNS.CLOCK_IN]: timestamp,
            [DB_COLUMNS.STATUS]: 'REGULAR'
          });
          showToast(`${selectedEmpForTime.name} is now ON DUTY`);
        }
      } 
      else if (state === 'ONGOING') {
        // Find the ongoing record to clock out
        const ongoingRec = (attendance || []).find(a => 
          a.employeeId === selectedEmpForTime.id && 
          a.date === todayStr && 
          a.clockIn && !a.clockOut
        );
        
        if (ongoingRec) {
          const MIN_SHIFT_MINUTES = 1;
          const clockInTime = new Date(ongoingRec.clockIn).getTime();
          const nowTime = new Date(timestamp).getTime();
          const elapsedMinutes = (nowTime - clockInTime) / 60000;

          if (elapsedMinutes < MIN_SHIFT_MINUTES) {
            const secsLeft = Math.ceil((MIN_SHIFT_MINUTES * 60) - (elapsedMinutes * 60));
            showToast(`Cannot clock out yet — minimum 1 minute after clock-in is required. Please wait ${secsLeft}s.`);
            playSound('warning');
            setIsSyncing(false);
            if (onSyncStatusChange) onSyncStatusChange(false);
            return;
          }

          await updateAttendance.mutateAsync({
            id: ongoingRec.id,
            [DB_COLUMNS.CLOCK_OUT]: timestamp,
            [DB_COLUMNS.BRANCH_ID]: branch.id,
            [DB_COLUMNS.EMPLOYEE_ID]: selectedEmpForTime.id,
            [DB_COLUMNS.DATE]: todayStr
          });
          showToast(`${selectedEmpForTime.name} has clocked out.`);
        }
      }

      await addAuditLog.mutateAsync({
        [DB_COLUMNS.BRANCH_ID]: branch.id,
        [DB_COLUMNS.TIMESTAMP]: getTrueManilaISOString(),
        [DB_COLUMNS.ACTIVITY_TYPE]: 'UPDATE',
        [DB_COLUMNS.ENTITY_TYPE]: 'ATTENDANCE',
        [DB_COLUMNS.ENTITY_ID]: selectedEmpForTime.id,
        [DB_COLUMNS.DESCRIPTION]: (() => {
          if (state === 'ONGOING') return `Clock-out protocol finalized for ${selectedEmpForTime.name}`;
          
          const todayRecords = (attendance || []).filter(a => a.employeeId === selectedEmpForTime.id && a.date === todayStr);
          const latestRecord = todayRecords.sort((a, b) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime())[0];
          
          if (state === 'COMPLETED' && latestRecord?.isHalfDay) {
            return `Resumed duty from half-day for ${selectedEmpForTime.name}`;
          }
          return `Clock-in protocol finalized for ${selectedEmpForTime.name}`;
        })(),
        [DB_COLUMNS.PERFORMER_NAME]: operatorName || 'NODE OPERATOR'
      });

      playSound('success');
      setIsTimeModalOpen(false);

      // If the employee being clocked in/out is a reliever, sync their payout
      // expense immediately so the SALES tab KPI reflects it without needing a sale first.
      const clockCfg = selectedEmpForTime.branchAllowances?.[branch.id];
      const clockExcluded = typeof clockCfg === 'object' && clockCfg !== null ? (clockCfg.excludeFromReliever || false) : false;
      const isReliever = selectedEmpForTime.branchId !== branch.id && !clockExcluded;
      if (isReliever) {
        syncRelieverPayouts(branch, todayStr, employees)
          .then(() => { if (onRefresh) onRefresh(); })
          .catch(console.error);
      } else {
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      showToast('Time Registry Fault', 'error');
    } finally {
      setIsSyncing(false);
      if (onSyncStatusChange) onSyncStatusChange(false);
    }
  };

  const handleFaceTimeIn = async (emp: Employee) => {
    if (!emp.isActive || emp.onLeave || isSyncing || isClosedMode) return;
    const state = getShiftState(emp.id);
    if (state !== 'NOT_STARTED' && state !== 'COMPLETED') return;

    setIsSyncing(true);
    if (onSyncStatusChange) onSyncStatusChange(true);
    const timestamp = getTrueManilaISOString();

    try {
      const isManager = (emp.role || '').toUpperCase().includes('MANAGER');
      if (!isManager) {
        const ongoingElsewhere = (attendance || []).find(a =>
          a.employeeId === emp.id && a.date === todayStr && a.clockIn && !a.clockOut && a.branchId !== branch.id
        );
        if (ongoingElsewhere) {
          const otherBranch = branches.find(b => b.id === ongoingElsewhere.branchId);
          const otherName = otherBranch?.name?.replace(/BRANCH\s*-\s*/i, '') ?? 'another branch';
          showToast(`${emp.name} is currently on duty at ${otherName}. Clock them out there first.`);
          return;
        }
      }

      const todayRecords = (attendance || []).filter(a => a.employeeId === emp.id && a.date === todayStr);
      const latestRecord = todayRecords.sort((a, b) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime())[0];

      if (latestRecord && latestRecord.isHalfDay) {
        await updateAttendance.mutateAsync({
          id: latestRecord.id,
          [DB_COLUMNS.CLOCK_OUT]: null,
          [DB_COLUMNS.IS_HALF_DAY]: false,
          [DB_COLUMNS.BRANCH_ID]: branch.id,
          [DB_COLUMNS.EMPLOYEE_ID]: emp.id,
          [DB_COLUMNS.DATE]: todayStr
        });
        showToast(`${emp.name} resumed duty from half-day.`);
      } else {
        const attendanceId = Math.random().toString(36).substr(2, 9);
        await addAttendance.mutateAsync({
          [DB_COLUMNS.ID]: attendanceId,
          [DB_COLUMNS.BRANCH_ID]: branch.id,
          [DB_COLUMNS.EMPLOYEE_ID]: emp.id,
          [DB_COLUMNS.STAFF_NAME]: emp.name,
          [DB_COLUMNS.DATE]: todayStr,
          [DB_COLUMNS.CLOCK_IN]: timestamp,
          [DB_COLUMNS.STATUS]: 'REGULAR'
        });
        showToast(`${emp.name} is now ON DUTY`);
      }

      await addAuditLog.mutateAsync({
        [DB_COLUMNS.BRANCH_ID]: branch.id,
        [DB_COLUMNS.TIMESTAMP]: getTrueManilaISOString(),
        [DB_COLUMNS.ACTIVITY_TYPE]: 'UPDATE',
        [DB_COLUMNS.ENTITY_TYPE]: 'ATTENDANCE',
        [DB_COLUMNS.ENTITY_ID]: emp.id,
        [DB_COLUMNS.DESCRIPTION]: `Face recognition clock-in for ${emp.name}`,
        [DB_COLUMNS.PERFORMER_NAME]: operatorName || 'NODE OPERATOR'
      });

      playSound('success');

      const clockCfg = emp.branchAllowances?.[branch.id];
      const clockExcluded = typeof clockCfg === 'object' && clockCfg !== null ? (clockCfg.excludeFromReliever || false) : false;
      const isReliever = emp.branchId !== branch.id && !clockExcluded;
      if (isReliever) {
        syncRelieverPayouts(branch, todayStr, employees)
          .then(() => { if (onRefresh) onRefresh(); })
          .catch(console.error);
      } else {
        if (onRefresh) onRefresh();
      }
    } catch {
      showToast('Time Registry Fault', 'error');
    } finally {
      setIsSyncing(false);
      if (onSyncStatusChange) onSyncStatusChange(false);
    }
  };

  const handleSaveEmployee = async () => {
    if (!editingEmployee || isSyncing) return;
    setIsSyncing(true);
    if (onSyncStatusChange) onSyncStatusChange(true);
    setUploadProgress(10);

    try {
      const firstName = editingEmployee.firstName?.trim().toUpperCase();
      const middleName = editingEmployee.middleName?.trim().toUpperCase() || null;
      const lastName = editingEmployee.lastName?.trim().toUpperCase();
      const cleanName = `${firstName} ${middleName ? middleName + ' ' : ''}${lastName}`.trim().toUpperCase();
      
      // 0. DUPLICATION CHECK (Network-Wide — only for new staff, not edits)
      if (!editingEmployee.id) {
        const matchInBranch = employees.some(e => {
          if (!e.isActive) return false;
          if (e.branchId !== branch.id) return false;
          const existingFullName = e.firstName && e.lastName
            ? `${e.firstName} ${e.middleName ? e.middleName + ' ' : ''}${e.lastName}`.trim().toUpperCase()
            : (e.name || '').toUpperCase();
          return existingFullName === cleanName;
        });

        if (matchInBranch) {
          playSound('warning');
          showToast('DUPLICATE IDENTITY: Staff already registered in this branch.', 'error');
          setIsSyncing(false);
          if (onSyncStatusChange) onSyncStatusChange(false);
          return;
        }

        const matchInOtherBranch = employees.find(e => {
          if (!e.isActive) return false;
          if (e.branchId === branch.id) return false;
          const existingFullName = e.firstName && e.lastName
            ? `${e.firstName} ${e.middleName ? e.middleName + ' ' : ''}${e.lastName}`.trim().toUpperCase()
            : (e.name || '').toUpperCase();
          return existingFullName === cleanName;
        });

        if (matchInOtherBranch) {
          playSound('warning');
          showToast('STAFF EXISTS IN NETWORK: Use "Enroll Reliever" to assign them here.', 'error');
          setIsSyncing(false);
          if (onSyncStatusChange) onSyncStatusChange(false);
          return;
        }
      }

      let profileUrl = editingEmployee.profile || '';

      if (profileFile) {
        // 0.5. SIZE CHECK (Limit to 5MB before compression to prevent browser crash)
        if (profileFile.size > 5 * 1024 * 1024) {
          playSound('warning');
          showToast('FILE TOO LARGE: Profile image must be under 5MB.', 'error');
          setIsSyncing(false);
          if (onSyncStatusChange) onSyncStatusChange(false);
          return;
        }

        setUploadProgress(30);
        if (editingEmployee.profile) await deleteFileByUrl(editingEmployee.profile, 'profiles');
        const compressed = await compressImage(profileFile, { maxWidth: 400, maxHeight: 400, quality: 0.5 });
        setUploadProgress(60);
        const path = `${branch.id}/profiles/${Date.now()}_local.jpg`;
        const { error: uploadErr } = await supabase.storage.from('profiles').upload(path, compressed, { contentType: 'image/jpeg', upsert: true });
        if (uploadErr) throw uploadErr;
        profileUrl = supabase.storage.from('profiles').getPublicUrl(path).data.publicUrl;
      }

      const id = editingEmployee.id || Math.random().toString(36).substr(2, 9);
      
      // Sanitize roles: Remove RELIEVER from home branch context
      const homeBranchId = editingEmployee.branchId || branch.id;
      const sanitizedBranchAllowances = { ...(editingEmployee.branchAllowances || {}) };
      
      // Strip RELIEVER from home branch allowance override if it exists
      if (sanitizedBranchAllowances[homeBranchId]) {
        const allowance = sanitizedBranchAllowances[homeBranchId];
        if (typeof allowance === 'object' && allowance !== null && allowance.role) {
          const roles = allowance.role.split(',').filter(r => r.trim().toUpperCase() !== 'RELIEVER');
          sanitizedBranchAllowances[homeBranchId] = { ...allowance, role: roles.join(',') };
        }
      }
      
      // Strip RELIEVER from base role (which represents home branch default)
      const sanitizedBaseRole = (editingEmployee.role || '').split(',').filter(r => r.trim().toUpperCase() !== 'RELIEVER').join(',');

      const payload = {
        [DB_COLUMNS.NAME]: cleanName,
        [DB_COLUMNS.FIRST_NAME]: firstName,
        [DB_COLUMNS.MIDDLE_NAME]: middleName,
        [DB_COLUMNS.LAST_NAME]: lastName,
        [DB_COLUMNS.ROLE]: sanitizedBaseRole,
        // Fallback allowance for legacy code
        [DB_COLUMNS.ALLOWANCE]: (() => {
          const allowance = sanitizedBranchAllowances[branch.id];
          if (typeof allowance === 'object' && allowance !== null) return allowance.allowance;
          return allowance ?? editingEmployee.allowance ?? 0;
        })(),
        [DB_COLUMNS.BRANCH_ALLOWANCES]: sanitizedBranchAllowances,
        [DB_COLUMNS.BRANCH_ID]: editingEmployee.branchId || branch.id,
        [DB_COLUMNS.IS_ACTIVE]: editingEmployee.isActive !== false,
        [DB_COLUMNS.PROFILE]: profileUrl || null,
      };

      if (editingEmployee.id) {
        await updateEmployee.mutateAsync({ id: editingEmployee.id, ...payload });
      } else {
        await addEmployee.mutateAsync({ [DB_COLUMNS.ID]: id, ...payload });
      }

      // NAME CHANGE CASCADE
      const nameChanged = originalName && originalName !== cleanName;
      if (nameChanged) {
          // 1. Branch Sync (Manager/Temp Manager slots)
          const branchSyncPromises = branches
            .filter(b => b.manager?.toUpperCase() === originalName || b.tempManager?.toUpperCase() === originalName)
            .map(b => {
              const branchUpdates: any = {};
              if (b.manager?.toUpperCase() === originalName) branchUpdates[DB_COLUMNS.MANAGER] = cleanName;
              if (b.tempManager?.toUpperCase() === originalName) branchUpdates[DB_COLUMNS.TEMP_MANAGER] = cleanName;
              return supabase.from(DB_TABLES.BRANCHES).update(branchUpdates).eq(DB_COLUMNS.ID, b.id);
            });

          // 2. Data Cascade (Historical records)
          const dataCascadePromises = [
              supabase.from(DB_TABLES.TRANSACTIONS).update({ [DB_COLUMNS.THERAPIST_NAME]: cleanName }).eq(DB_COLUMNS.THERAPIST_NAME, originalName),
              supabase.from(DB_TABLES.TRANSACTIONS).update({ [DB_COLUMNS.BONESETTER_NAME]: cleanName }).eq(DB_COLUMNS.BONESETTER_NAME, originalName),
              supabase.from(DB_TABLES.ATTENDANCE).update({ [DB_COLUMNS.STAFF_NAME]: cleanName }).eq(DB_COLUMNS.EMPLOYEE_ID, id),
              supabase.from(DB_TABLES.AUDIT_LOGS).update({ [DB_COLUMNS.PERFORMER_NAME]: cleanName }).eq(DB_COLUMNS.PERFORMER_NAME, originalName)
          ];
          
          // Run all updates concurrently
          await Promise.all([...branchSyncPromises, ...dataCascadePromises]);
      }

      await addAuditLog.mutateAsync({
        [DB_COLUMNS.BRANCH_ID]: branch.id,
        [DB_COLUMNS.TIMESTAMP]: getTrueManilaISOString(),
        [DB_COLUMNS.ACTIVITY_TYPE]: editingEmployee.id ? 'UPDATE' : 'CREATE',
        [DB_COLUMNS.ENTITY_TYPE]: 'EMPLOYEE',
        [DB_COLUMNS.ENTITY_ID]: id,
        [DB_COLUMNS.DESCRIPTION]: `${editingEmployee.id ? 'Updated' : 'Registered'} employee identity: ${cleanName}`,
        [DB_COLUMNS.PERFORMER_NAME]: operatorName || 'NODE OPERATOR'
      });

      setUploadProgress(100);
      playSound('success');
      showToast('Registry Synchronized');
      setIsModalOpen(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      showToast('Registry Fault', 'error');
    } finally {
      setIsSyncing(false);
      setUploadProgress(0);
      if (onSyncStatusChange) onSyncStatusChange(false);
    }
  };

  return (
    <>
      {toast && createPortal(
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-2xl shadow-lg animate-in slide-in-from-bottom-4 duration-300 font-semibold text-sm bg-white border border-slate-200 flex items-center gap-3 min-w-[220px] max-w-xs">
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${toast.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'}`}></div>
          <span className={toast.type === 'error' ? 'text-rose-700' : 'text-slate-800'}>{toast.message}</span>
        </div>,
        document.body
      )}
    <div className="space-y-4">

      <StaffModals 
        isTimeModalOpen={isTimeModalOpen}
        isModalOpen={isModalOpen}
        isPullMode={isPullMode}
        showBranchClosedModal={showBranchClosedModal}
        selectedEmpForTime={selectedEmpForTime}
        editingEmployee={editingEmployee as any}
        recoveryEmployee={recoveryEmployee}
        branches={branches}
        isSyncing={isSyncing}
        uploadProgress={uploadProgress}
        profileFile={profileFile}
        fileInputRef={fileInputRef}
        getShiftState={getShiftState}
        clockOutLocked={clockOutLocked}
        onTimeAction={handleTimeAction}
        onSaveEmployee={handleSaveEmployee}
        onCloseModals={() => { setIsModalOpen(false); setIsTimeModalOpen(false); setShowBranchClosedModal(false); setIsPullMode(false); }}
        onCloseRecovery={() => setRecoveryEmployee(null)}
        onRefresh={() => onRefresh?.()}
        onSyncStatusChange={onSyncStatusChange}
        setEditingEmployee={setEditingEmployee as any}
        setProfileFile={setProfileFile}
        toggleRole={toggleRole}
        allEmployees={employees}
        branchId={branch.id}
        isManagerView={isManagerView}
      />

      {/* HEADER SECTION */}
      <StaffHeader
        branchName={branch.name.replace(/BRANCH - /g, '')}
        searchTerm={searchTerm}
        onSearchChange={val => { setSearchTerm(val); }}
        onPullReliever={handleOpenPull}
        onRequestNewEmployee={isDelegate ? undefined : () => { setShowNewEmpRequest(true); playSound('click'); }}
        filterRoles={filterRoles as any}
        onFilterRolesChange={roles => { setFilterRoles(roles as any); }}
        filterActiveOnly={filterActiveOnly}
        onFilterActiveOnlyChange={val => { setFilterActiveOnly(val); }}
        totalShowing={branchStaff.length}
        onExportPDF={handleExportPDF}
        onExportCSV={handleExportCSV}
        isExporting={isExporting}
      />

      {isSetupRequired && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-4 animate-in slide-in-from-top-4">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5 text-amber-600" strokeWidth={2} />
          </div>
          <div>
            <p className="text-sm font-bold text-amber-900 leading-snug">Personnel setup required</p>
            <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">No therapists or specialists are registered for this branch. Add staff before starting POS operations.</p>
          </div>
        </div>
      )}

      {/* Reliever hint — shown when there are guest/reliever staff visible */}
      {branchStaff.some(e => e.branchId !== branch.id) && (
        <div className="flex items-start gap-3 px-4 py-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800 rounded-2xl">
          <svg className="w-4 h-4 shrink-0 mt-0.5 text-indigo-400 dark:text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-indigo-700 dark:text-indigo-200 leading-relaxed">
            <span className="font-bold">Reliever staff</span> are from another branch. To permanently transfer them, use the remove button on their row — do not request to disable them.
          </p>
        </div>
      )}

      {/* Section header with count badge */}
      <div className="flex items-center gap-3 px-1">
        <h2 className="text-sm font-bold text-slate-800">Team Members</h2>
        <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold tabular-nums">
          {branchStaff.length}
        </span>
        <div className="flex-1 h-px bg-slate-100" />
      </div>

      {/* Staff list */}
      {branchStaff.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {branchStaff.map((emp, idx) => {
            const currentRole = getEmployeeRole(emp, branch.id);
            const branchCfg = emp.branchAllowances?.[branch.id];
            const excludeFromReliever = typeof branchCfg === 'object' && branchCfg !== null ? (branchCfg.excludeFromReliever || false) : false;
            const isMainManager = branch.manager?.toUpperCase() === (emp.name || '').toUpperCase();
            const isTempManager = branch.tempManager?.toUpperCase() === (emp.name || '').toUpperCase();
            // A staff from another branch is a reliever unless they ARE this branch's main/temp manager
            const isReliever = emp.branchId !== branch.id && !isMainManager && !isTempManager && !excludeFromReliever;

            return (
              <React.Fragment key={emp.id}>
                <StaffCard
                  emp={emp}
                  branchId={branch.id}
                  isReliever={isReliever}
                  isMainManager={isMainManager}
                  isTempManager={isTempManager}
                  shiftState={getShiftState(emp.id)}
                  isClosedMode={isClosedMode}
                  onEdit={handleOpenEdit}
                  onTimeAction={handleOpenTimeModal}
                  onReset={isDelegate ? undefined : handleOpenReset}
                  onPromote={isReliever && !isDelegate ? handlePromoteToRegular : undefined}
                  onReturnFromLeave={!isDelegate && emp.isActive && emp.branchId === branch.id && emp.onLeave ? () => handleReturnFromLeave(emp) : undefined}
                  onRequestLeave={!isDelegate && emp.isActive && !isReliever && !emp.onLeave ? () => openLeaveModal(emp) : undefined}
                  onRequestDisable={!isDelegate && emp.isActive && !isMainManager && !isTempManager && !isReliever && !emp.onLeave ? () => openDisableModal(emp) : undefined}
                  onRemoveReliever={
                    !isDelegate && isReliever && !isMainManager && !isTempManager && getShiftState(emp.id) === 'NOT_STARTED'
                      ? () => setRemoveRelieversEmployee(emp)
                      : undefined
                  }
                  onFaceTimeIn={!isClosedMode && branch.faceIdEnabled !== false && getShiftState(emp.id) === 'NOT_STARTED' ? () => { setFaceTimeInTarget(emp); setShowFaceTimeIn(true); } : undefined}
                />
              </React.Fragment>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 py-16 flex flex-col items-center justify-center gap-4 text-center px-6">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center">
            <Users className="w-8 h-8 text-slate-300" strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500">No team members found</p>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-[220px] mx-auto">
              {searchTerm || filterRoles.length > 0
                ? 'Try adjusting your search or filters.'
                : 'Add staff using the button above to get started.'}
            </p>
          </div>
        </div>
      )}

      {isManagerView && !isDelegate && onNavigateToComplaints && (
        <button
          onClick={() => { playSound('click'); onNavigateToComplaints(); }}
          className="w-full flex items-center gap-4 px-4 py-4 bg-white border border-slate-200 rounded-2xl hover:border-rose-200 hover:bg-rose-50/30 active:scale-[0.99] transition-all group min-h-[56px]"
        >
          <div className="w-9 h-9 rounded-xl bg-slate-50 group-hover:bg-rose-100 flex items-center justify-center shrink-0 transition-colors">
            <svg className="w-4 h-4 text-slate-400 group-hover:text-rose-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6H11.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
            </svg>
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm font-semibold text-slate-700 group-hover:text-rose-700 transition-colors">Complaints</p>
            <p className="text-xs text-slate-400">File or review employee incident reports</p>
          </div>
          <svg className="w-4 h-4 text-slate-300 group-hover:text-rose-400 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>

{/* FACE TIME-IN MODAL */}
    {showFaceTimeIn && (
      <FaceTimeInModal
        employees={employees.filter(e => e.isActive)}
        branchId={branch.id}
        targetEmployee={faceTimeInTarget ?? undefined}
        onMatch={(emp) => { handleFaceTimeIn(emp); }}
        onClose={() => { setShowFaceTimeIn(false); setFaceTimeInTarget(null); }}
        onManualOverride={faceTimeInTarget ? () => {
          setShowFaceTimeIn(false);
          handleOpenTimeModal(faceTimeInTarget);
          setFaceTimeInTarget(null);
        } : undefined}
      />
    )}

    {/* REMOVE RELIEVER CONFIRMATION MODAL */}
    {removeRelieversEmployee && (
      <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setRemoveRelieversEmployee(null)} />
        <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md p-6 animate-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
          <div className="flex items-start gap-4 mb-5">
            <div className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-black text-slate-900 uppercase tracking-widest leading-none mb-1">Remove Reliever</p>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Removes from this branch's staff list only</p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 mb-5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Reliever</span>
              <span className="text-xs font-black text-slate-900 uppercase">{removeRelieversEmployee.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Home Branch</span>
              <span className="text-xs font-black text-slate-700 uppercase">
                {branches.find(b => b.id === removeRelieversEmployee.branchId)?.name?.replace('BRANCH - ', '') || 'Unknown'}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed mb-5">
            This removes <span className="font-black text-slate-700">{removeRelieversEmployee.name}</span> from this branch's authorized staff list. Their home branch record and payroll are not affected. You can re-enroll them later via "Enroll Reliever".
          </p>

          <div className="flex gap-3">
            <button
              disabled={isRemovingReliever}
              onClick={() => setRemoveRelieversEmployee(null)}
              className="flex-1 h-10 rounded-xl border border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              disabled={isRemovingReliever}
              onClick={handleConfirmRemoveReliever}
              className="flex-1 h-10 rounded-xl bg-rose-600 text-xs font-semibold uppercase tracking-wide text-white hover:bg-rose-700 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isRemovingReliever
                ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                : 'Remove from Branch'
              }
            </button>
          </div>
        </div>
      </div>
    )}

    {/* LEAVE / ON-HOLD REQUEST MODAL */}
    {leaveEmployee && (
      <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={closeLeaveModal} />
        <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md p-6 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

          <div className="flex items-start gap-4 mb-5">
            <div className="w-11 h-11 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-black text-slate-900 uppercase tracking-widest leading-none mb-1">Place on Leave</p>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{leaveEmployee?.name}</p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 mb-5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Employee</span>
              <span className="text-xs font-black text-slate-900 uppercase">{leaveEmployee.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Branch</span>
              <span className="text-xs font-black text-slate-700 uppercase">{branch.name.replace('BRANCH - ', '')}</span>
            </div>
          </div>

          {/* Subtype: Leave or Suspended */}
          <div className="mb-4">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3 block">Reason for Hold <span className="text-rose-500">*</span></label>
          </div>

          {/* Leave type picker */}
          {(
            <div className="mb-4 animate-in fade-in slide-in-from-top-1 duration-200">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3 block">Leave Type <span className="text-rose-500">*</span></label>
              <div className="grid grid-cols-2 gap-2">
                {(['VACATION', 'SICK', 'MATERNITY', 'PATERNITY', 'EMERGENCY'] as const).map(type => {
                  const lMeta: Record<string, { label: string; dot: string }> = {
                    VACATION:  { label: 'Vacation',  dot: 'bg-blue-500' },
                    SICK:      { label: 'Sick',      dot: 'bg-rose-500' },
                    MATERNITY: { label: 'Maternity', dot: 'bg-pink-500' },
                    PATERNITY: { label: 'Paternity', dot: 'bg-indigo-500' },
                    EMERGENCY: { label: 'Emergency', dot: 'bg-amber-500' },
                  };
                  const m = lMeta[type];
                  const isSelected = leaveType === type;
                  return (
                    <button
                      key={type}
                      onClick={() => { setLeaveType(type); setLeaveStartDate(''); setLeaveEndDate(''); }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${isSelected ? 'border-purple-400 bg-purple-50' : 'border-slate-100 hover:border-slate-200'}`}
                    >
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isSelected ? m.dot : 'bg-slate-200'}`} />
                      <span className="text-xs font-black text-slate-900 uppercase tracking-tight">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dates */}
          {leaveType && (() => {
            const noDates = ['SICK', 'EMERGENCY'].includes(leaveType);
            if (noDates) return null;
            const endRequired = ['VACATION', 'MATERNITY', 'PATERNITY'].includes(leaveType);
            return (
              <div className="grid grid-cols-2 gap-3 mb-4 animate-in fade-in slide-in-from-top-1 duration-200">
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5 block">Start Date <span className="text-rose-500">*</span></label>
                  <input type="date" value={leaveStartDate} onChange={e => setLeaveStartDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-xs font-semibold text-slate-700 outline-none transition-all focus:border-purple-400 bg-slate-50" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5 block">
                    End Date {endRequired ? <span className="text-rose-500">*</span> : <span className="font-bold normal-case opacity-60">(optional)</span>}
                  </label>
                  <input type="date" value={leaveEndDate} onChange={e => setLeaveEndDate(e.target.value)} min={leaveStartDate} className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-xs font-semibold text-slate-700 outline-none transition-all focus:border-purple-400 bg-slate-50" />
                </div>
              </div>
            );
          })()}

          {/* Notes */}
          <div className="mb-5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5 block">Notes <span className="font-bold normal-case opacity-60">(optional)</span></label>
            <textarea value={leaveNotes} onChange={e => setLeaveNotes(e.target.value)} rows={2} placeholder="Additional context for the superadmin..." className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-xs font-semibold text-slate-700 outline-none focus:border-slate-400 resize-none bg-slate-50" />
          </div>

          <div className="flex gap-3">
            <button disabled={isSubmittingLeave} onClick={closeLeaveModal} className="flex-1 h-10 rounded-xl border border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50">Cancel</button>
            <button
              disabled={
                isSubmittingLeave || !leaveType ||
                (() => {
                  const noDates = ['SICK', 'EMERGENCY'].includes(leaveType);
                  if (noDates) return false;
                  if (!leaveStartDate) return true;
                  const needsEnd = ['VACATION', 'MATERNITY', 'PATERNITY'].includes(leaveType);
                  return needsEnd && !leaveEndDate;
                })()
              }
              onClick={handleSubmitLeaveRequest}
              className="flex-1 h-10 rounded-xl bg-purple-600 text-xs font-semibold uppercase tracking-wide text-white hover:bg-purple-700 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isSubmittingLeave ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> : 'Confirm Leave'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* DISABLE EMPLOYEE REQUEST MODAL */}
    {disableEmployee && (
      <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={closeDisableModal} />
        <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md p-6 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

          <div className="flex items-start gap-4 mb-5">
            <div className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-black text-slate-900 uppercase tracking-widest leading-none mb-1">Disable Employee</p>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Permanent — Superadmin approval required</p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 mb-5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Employee</span>
              <span className="text-xs font-black text-slate-900 uppercase">{disableEmployee.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Branch</span>
              <span className="text-xs font-black text-slate-700 uppercase">{branch.name.replace('BRANCH - ', '')}</span>
            </div>
          </div>

          <div className="mb-4 space-y-3">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide block">Reason <span className="text-rose-500">*</span></label>
            {(['RESIGNED', 'TERMINATED'] as const).map(opt => {
              const dMeta = {
                RESIGNED:   { label: 'Resigned',   desc: 'Employee voluntarily left',         dot: 'bg-slate-700' },
                TERMINATED: { label: 'Terminated', desc: 'Dismissed due to misconduct/cause', dot: 'bg-rose-600' },
              };
              const m = dMeta[opt];
              const isSelected = disableReason === opt;
              return (
                <label key={opt} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${isSelected ? 'border-slate-800 bg-slate-50' : 'border-slate-100 hover:border-slate-200'}`} onClick={() => setDisableReason(opt)}>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'border-slate-900' : 'border-slate-300'}`}>
                    {isSelected && <div className="w-2 h-2 rounded-full bg-slate-900" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{m.label}</p>
                    <p className="text-xs text-slate-400 font-semibold">{m.desc}</p>
                  </div>
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${m.dot}`} />
                </label>
              );
            })}

            {disableReason === 'TERMINATED' && (
              <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                <label className="text-xs font-black text-rose-500 uppercase tracking-widest mb-1.5 block">Complaint Number <span className="text-rose-500">*</span></label>
                <input type="text" value={complaintRef} onChange={e => setComplaintRef(e.target.value.toUpperCase())} placeholder="e.g. COMP-ABC123" className="w-full px-4 py-3 rounded-xl border-2 border-rose-200 bg-rose-50 text-xs font-black text-slate-900 uppercase tracking-widest outline-none focus:border-rose-400 placeholder:font-semibold placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400" />
                <p className="text-xs font-bold text-slate-400 mt-1">Enter the complaint number from the Complaints section.</p>
              </div>
            )}
          </div>

          <div className="mb-5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5 block">Notes <span className="font-bold normal-case opacity-60">(optional)</span></label>
            <textarea value={disableNotes} onChange={e => setDisableNotes(e.target.value)} rows={2} placeholder="Additional context for the superadmin..." className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-xs font-semibold text-slate-700 outline-none focus:border-slate-400 resize-none bg-slate-50" />
          </div>

          <div className="flex gap-3">
            <button disabled={isSubmittingDisable} onClick={closeDisableModal} className="flex-1 h-10 rounded-xl border border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50">Cancel</button>
            <button
              disabled={isSubmittingDisable || !disableReason || (disableReason === 'TERMINATED' && !complaintRef.trim())}
              onClick={handleSubmitDisableRequest}
              className="flex-1 h-10 rounded-xl bg-rose-600 text-xs font-semibold uppercase tracking-wide text-white hover:bg-rose-700 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isSubmittingDisable ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> : 'Submit Request'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* RETURN FROM LEAVE CONFIRMATION */}
    {returnEmployee && (
      <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setReturnEmployee(null)} />
        <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm p-6 animate-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-4 mb-5">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-black text-slate-900 uppercase tracking-widest leading-none mb-1">Return from Leave</p>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{returnEmployee.name}</p>
            </div>
          </div>
          <p className="text-xs text-slate-600 mb-6 leading-relaxed">
            Confirm that <span className="font-black text-slate-900">{returnEmployee.name}</span> is back and ready to resume work. This will clear their leave status immediately.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setReturnEmployee(null)} className="flex-1 h-10 rounded-xl border border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:bg-slate-50 transition-all">Cancel</button>
            <button onClick={confirmReturnFromLeave} className="flex-1 h-10 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-xs font-semibold uppercase tracking-wide text-white active:scale-95 transition-all">Confirm Return</button>
          </div>
        </div>
      </div>
    )}

    {/* NEW EMPLOYEE CREATION REQUEST MODAL */}
    {showNewEmpRequest && createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => { setShowNewEmpRequest(false); setNewEmpFirstName(''); setNewEmpMiddleName(''); setNewEmpLastName(''); setNewEmpRole('THERAPIST'); setNewEmpAllowance(''); setNewEmpSimilarWarning(null); setNewEmpBlockError(null); }}>
        <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md p-6 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-start gap-4 mb-5">
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-black text-slate-900 uppercase tracking-widest leading-none mb-1">Request New Staff</p>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Superadmin approval required</p>
            </div>
          </div>

          {/* Info banner */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3.5 flex gap-3 items-start mb-4">
            <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Requesting New Staff</p>
              <p className="text-xs text-indigo-600 mt-1 leading-relaxed">This form is for employees brand new to the network. Your request will be sent to the superadmin for review and approval before the employee is added.</p>
            </div>
          </div>

          <div className="space-y-3 mb-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1 block">First Name <span className="text-rose-500">*</span></label>
                <input
                  value={newEmpFirstName}
                  onChange={e => { setNewEmpFirstName(e.target.value); checkNewEmpName(e.target.value, newEmpMiddleName, newEmpLastName); }}
                  placeholder="e.g. JUAN"
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-xs font-semibold text-slate-700 outline-none transition-all focus:border-indigo-400 bg-slate-50 uppercase"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1 block">Last Name <span className="text-rose-500">*</span></label>
                <input
                  value={newEmpLastName}
                  onChange={e => { setNewEmpLastName(e.target.value); checkNewEmpName(newEmpFirstName, newEmpMiddleName, e.target.value); }}
                  placeholder="e.g. DELA CRUZ"
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-xs font-semibold text-slate-700 outline-none transition-all focus:border-indigo-400 bg-slate-50 uppercase"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1 block">Middle Name <span className="font-bold normal-case opacity-60">(optional)</span></label>
              <input
                value={newEmpMiddleName}
                onChange={e => { setNewEmpMiddleName(e.target.value); checkNewEmpName(newEmpFirstName, e.target.value, newEmpLastName); }}
                placeholder="e.g. SANTOS"
                className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-xs font-semibold text-slate-700 outline-none transition-all focus:border-indigo-400 bg-slate-50 uppercase"
              />
            </div>

            {newEmpBlockError && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-rose-50 border border-rose-200 rounded-xl">
                <svg className="w-4 h-4 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="text-xs font-bold text-rose-700">{newEmpBlockError}</p>
              </div>
            )}
            {!newEmpBlockError && newEmpSimilarWarning && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                <p className="text-xs font-bold text-amber-700">{newEmpSimilarWarning}</p>
              </div>
            )}
          </div>

          <div className="mb-4">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2 block">Role <span className="text-rose-500">*</span></label>
            <div className="flex flex-wrap gap-2">
              {(['THERAPIST', 'BONESETTER'] as const).map(r => {
                const selected = newEmpRole.split(',').map(s => s.trim()).includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      const current = newEmpRole.split(',').map(s => s.trim()).filter(Boolean);
                      const next = selected ? current.filter(x => x !== r) : [...current, r];
                      setNewEmpRole(next.join(','));
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wide transition-all border-2 ${
                      selected
                        ? r === 'THERAPIST'
                          ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                          : 'bg-amber-100 border-amber-300 text-amber-800'
                        : 'bg-slate-50 border-transparent text-slate-400 hover:border-slate-200'
                    }`}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
            {!newEmpRole && <p className="text-xs text-rose-500 font-bold mt-1.5 ml-1">Select at least one role.</p>}
          </div>

          <div className="mb-5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1 block">Daily Allowance (₱) <span className="text-rose-500">*</span></label>
            <input
              type="number"
              min="1"
              value={newEmpAllowance}
              onChange={e => setNewEmpAllowance(e.target.value)}
              placeholder="e.g. 350"
              className={`w-full px-3 py-2.5 rounded-xl border-2 text-xs font-semibold text-slate-700 outline-none transition-all bg-slate-50 ${newEmpAllowance && Number(newEmpAllowance) > 0 ? 'border-slate-200 focus:border-indigo-400' : 'border-rose-200 focus:border-rose-400'}`}
            />
            {(!newEmpAllowance || Number(newEmpAllowance) <= 0) && (
              <p className="text-xs text-rose-500 font-bold mt-1.5 ml-1">Allowance must be greater than 0.</p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              disabled={isSubmittingNewEmp}
              onClick={() => { setShowNewEmpRequest(false); setNewEmpFirstName(''); setNewEmpMiddleName(''); setNewEmpLastName(''); setNewEmpRole('THERAPIST'); setNewEmpAllowance(''); setNewEmpSimilarWarning(null); setNewEmpBlockError(null); }}
              className="flex-1 h-10 rounded-xl border border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              disabled={isSubmittingNewEmp || !!newEmpBlockError || !newEmpFirstName.trim() || !newEmpLastName.trim() || !newEmpRole || !newEmpAllowance || Number(newEmpAllowance) <= 0}
              onClick={handleSubmitNewEmployeeRequest}
              className="flex-1 h-10 rounded-xl bg-indigo-600 text-xs font-semibold uppercase tracking-wide text-white hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isSubmittingNewEmp
                ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                : 'Submit Request'
              }
            </button>
          </div>
        </div>
      </div>
    , document.body)}

    {/* PROMOTE TO REGULAR CONFIRMATION MODAL */}
    {confirmPromoteEmployee && (() => {
      const expectedName = confirmPromoteEmployee.name.toUpperCase().trim();
      const inputMatch = promoteConfirmInput.toUpperCase().trim() === expectedName;
      return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md p-6 animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start gap-4 mb-5">
              <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-black text-slate-900 uppercase tracking-widest leading-none mb-1">Permanent Branch Transfer</p>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">This action changes payroll classification</p>
              </div>
            </div>

            {/* What changes */}
            <div className="bg-slate-50 rounded-xl p-4 mb-5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Employee</span>
                <span className="text-xs font-black text-slate-900 uppercase">{confirmPromoteEmployee.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Previous Status</span>
                <span className="text-xs font-black text-indigo-600 uppercase bg-indigo-50 px-2 py-0.5 rounded-lg">Reliever (Expenses)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">New Status</span>
                <span className="text-xs font-black text-emerald-600 uppercase bg-emerald-50 px-2 py-0.5 rounded-lg">Regular (Payroll)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Home Branch</span>
                <span className="text-xs font-black text-slate-700 uppercase">{branch.name.replace('BRANCH - ', '')}</span>
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              This cannot be undone from this screen. To revert, a superadmin must manually update the employee record.
              Type the employee's full name to confirm.
            </p>

            {/* Name confirmation input */}
            <div className="mb-4">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5 block">
                Type <span className="text-slate-700">{confirmPromoteEmployee.name}</span> to confirm
              </label>
              <input
                type="text"
                value={promoteConfirmInput}
                onChange={e => setPromoteConfirmInput(e.target.value.toUpperCase())}
                placeholder={confirmPromoteEmployee.name}
                disabled={isPromoting}
                className={`w-full h-11 px-4 rounded-xl border-2 text-xs font-black uppercase outline-none transition-all ${
                  inputMatch
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : promoteConfirmInput.length > 0
                    ? 'border-rose-300 bg-rose-50/50 text-slate-900'
                    : 'border-slate-200 bg-slate-50 text-slate-900'
                } disabled:opacity-50`}
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                disabled={isPromoting}
                onClick={() => { setConfirmPromoteEmployee(null); setPromoteConfirmInput(''); }}
                className="flex-1 h-10 rounded-xl border border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={!inputMatch || isPromoting}
                onClick={handleConfirmPromotion}
                className="flex-1 h-10 rounded-xl bg-emerald-600 text-xs font-semibold uppercase tracking-wide text-white hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isPromoting ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                ) : 'Confirm Transfer'}
              </button>
            </div>
          </div>
        </div>
      );
    })()}
    </>
  );
};
