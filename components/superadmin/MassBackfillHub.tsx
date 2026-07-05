import React, { useState, useRef, useEffect } from 'react';
import { Branch, Employee, SalesReport } from '../../types';
import { supabase } from '../../lib/supabase';
import { playSound } from '../../lib/audio';
import { UI_THEME } from '../../constants/ui_designs';
import { toDateStr } from '@/src/utils/reportUtils';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';

import { getInitials, getEmployeeAllowance } from '../../lib/payroll';
import { getTrueDate, getTrueManilaISOString, getManilaTodayStr } from '../../lib/time';

interface MassBackfillHubProps {
    branches: Branch[];
    employees: Employee[];
    salesReports: SalesReport[];
    onRefresh?: () => void;
    isReadOnly?: boolean;
}

export const MassBackfillHub: React.FC<MassBackfillHubProps> = ({ branches, employees, salesReports, onRefresh, isReadOnly }) => {
    const [selectedBranchId, setSelectedBranchId] = useState('');
    const [selectedDate, setSelectedDate] = useState(getManilaTodayStr());
    const [grossSales, setGrossSales] = useState<number>(0);
    const [totalExpenses, setTotalExpenses] = useState<number>(0);
    const [totalSalary, setTotalSalary] = useState<number>(0);
    const [rentAndBills, setRentAndBills] = useState<number>(0);
    const [employeeEntries, setEmployeeEntries] = useState<any[]>([]);
    const [expenseData, setExpenseData] = useState<any[]>([]);
    const [vaultData, setVaultData] = useState<any[]>([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isAddPersonnelOpen, setIsAddPersonnelOpen] = useState(false);
    const [personnelSearch, setPersonnelSearch] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const personnelDropdownRef = useRef<HTMLDivElement>(null);

    const [isProcessing, setIsProcessing] = useState(false);
    const [status, setStatus] = useState('');
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    const [newExpenseName, setNewExpenseName] = useState('');
    const [newExpenseAmount, setNewExpenseAmount] = useState('');
    const [newVaultDepositAmount, setNewVaultDepositAmount] = useState('');

    // Vault start dates per branch (fetched once on mount)
    const [branchVaultStartDates, setBranchVaultStartDates] = useState<Record<string, string | null>>({});

    // Handle click outside for custom dropdowns
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
            if (personnelDropdownRef.current && !personnelDropdownRef.current.contains(event.target as Node)) {
                setIsAddPersonnelOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch vault start dates for all branches once on mount
    useEffect(() => {
        if (!supabase) return;
        supabase.from(DB_TABLES.BRANCH_VAULTS)
            .select(`${DB_COLUMNS.BRANCH_ID}, ${DB_COLUMNS.VAULT_START_DATE}`)
            .then(({ data }) => {
                if (!data) return;
                const map: Record<string, string | null> = {};
                data.forEach((r: any) => { map[r[DB_COLUMNS.BRANCH_ID]] = r[DB_COLUMNS.VAULT_START_DATE] ?? null; });
                setBranchVaultStartDates(map);
            });
    }, []);

    const lastLoadedRef = useRef<{ branchId: string; date: string } | null>(null);

    // Update form when branch or date changes
    useEffect(() => {
        if (selectedBranchId && selectedDate) {
            const isNewSelection = !lastLoadedRef.current || 
                                  lastLoadedRef.current.branchId !== selectedBranchId || 
                                  lastLoadedRef.current.date !== selectedDate;

            if (!isNewSelection) return;

            const dateCompact = selectedDate.replace(/-/g, '');
            const standardId  = `${selectedBranchId}_${dateCompact}`;
            const backfillId  = `${selectedBranchId}_${dateCompact}_BACKFILL_INCOMPLETE`;

            // Prefer loading from the backfill record if it exists; fall back to standard
            const existingBackfill = salesReports.find(r => r.id === backfillId);
            const standardReport   = salesReports.find(r => r.id === standardId);
            const existingReport   = existingBackfill ?? standardReport;

            const branchEmployees = employees.filter(e => e.branchId === selectedBranchId && e.isActive);

            const branch = branches.find(b => b.id === selectedBranchId);
            const vaultStartDate = branchVaultStartDates[selectedBranchId] ?? null;
            const reportIsLegacy = !(branch?.vaultEnabled) || !vaultStartDate || selectedDate < vaultStartDate;

            if (existingReport) {
                setGrossSales(existingReport.grossSales);
                setTotalExpenses(existingReport.totalExpenses);
                setTotalSalary(existingReport.totalStaffPay);
                setRentAndBills(existingReport.totalVaultProvision);

                // Vault deposits always live in vault_data (both legacy PROVISION and modern VAULT_DEPOSIT)
                setVaultData(existingReport.vaultData || []);

                const branchEmpIds = new Set(branchEmployees.map((e: any) => e.id));

                // All staff in breakdown restore to employeeEntries with isReliever flag preserved
                const reportEntries = existingReport.staffBreakdown
                    .map((s: any) => ({
                        employeeId: s.employeeId,
                        name: s.staffName || employees.find(e => e.id === s.employeeId)?.name || 'UNKNOWN',
                        commission: s.commission || 0,
                        otPay: s.attendance?.otPay || 0,
                        cashAdvance: s.attendance?.cashAdvance || 0,
                        lateDeduction: s.attendance?.lateDeduction || 0,
                        allowance: s.allowance || 0,
                        isHalfDay: !!s.isHalfDay,
                        isReliever: !!(s.isReliever || !branchEmpIds.has(s.employeeId)),
                    }));

                setExpenseData(existingReport.expenseData || []);

                // Automatically add active branch employees who are NOT in the report
                const missingEmployees = branchEmployees
                    .filter(be => !reportEntries.find(re => re.employeeId === be.id))
                    .map(be => ({
                        employeeId: be.id,
                        name: be.name,
                        commission: 0,
                        otPay: 0,
                        cashAdvance: 0,
                        lateDeduction: 0,
                        allowance: be.allowance || 0,
                        isHalfDay: false
                    }));

                setEmployeeEntries([...reportEntries, ...missingEmployees]);
                setStatus(existingBackfill ? 'Existing Backfill Record Loaded for Modification' : 'Existing Ledger Loaded for Modification');
            } else {
                // Reset to defaults for new entry
                setGrossSales(0);
                setTotalExpenses(0);
                setTotalSalary(0);
                setRentAndBills(0);
                setExpenseData([]);
                setVaultData([]);
                
                setEmployeeEntries(branchEmployees.map(e => ({
                    employeeId: e.id,
                    name: e.name,
                    commission: 0,
                    otPay: 0,
                    cashAdvance: 0,
                    lateDeduction: 0,
                    allowance: e.allowance || 0,
                    isHalfDay: false
                })));
                setStatus('');
            }
            lastLoadedRef.current = { branchId: selectedBranchId, date: selectedDate };
        } else {
            setEmployeeEntries([]);
            setGrossSales(0);
            setTotalExpenses(0);
            setRentAndBills(0);
            setExpenseData([]);
            setVaultData([]);
            setStatus('');
            lastLoadedRef.current = null;
        }
    }, [selectedBranchId, selectedDate, salesReports, employees, branchVaultStartDates]);

    // Relievers are excluded from payroll totals — their pay goes to expenses
    const totalEmployeeNetPay = employeeEntries
        .filter(e => !e.isReliever)
        .reduce((sum, e) =>
            sum + Number(e.commission) + Number(e.otPay) + Number(e.allowance) - Number(e.cashAdvance) - Number(e.lateDeduction), 0
        );

    const derivedRelieverPay = employeeEntries
        .filter(e => e.isReliever)
        .reduce((sum, e) =>
            sum + Number(e.commission) + Number(e.otPay) + Number(e.allowance) - Number(e.cashAdvance) - Number(e.lateDeduction), 0
        );

    const totalStaffPay = Number(totalSalary);

    const derivedExpenses = expenseData.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) + derivedRelieverPay;
    const derivedVault = vaultData.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const netRoi = Number(grossSales) - derivedExpenses - totalStaffPay - derivedVault;

    const isSalaryMismatch = Math.abs(totalSalary - totalEmployeeNetPay) > 0.01;

    const handleSyncSalary = () => {
        setTotalSalary(totalEmployeeNetPay);
        playSound('success');
    };

    const handleUpdateEmployee = (id: string, field: string, value: number) => {
        setEmployeeEntries(prev => prev.map(e => e.employeeId === id ? { ...e, [field]: value } : e));
    };

    const handleToggleHalfDay = (empId: string) => {
        const emp = employees.find(e => e.id === empId);
        if (!emp) return;
        const baseAllowance = getEmployeeAllowance(emp, selectedBranchId);
        setEmployeeEntries(prev => prev.map(e => {
            if (e.employeeId !== empId) return e;
            const next = !e.isHalfDay;
            return { ...e, isHalfDay: next, allowance: next ? baseAllowance / 2 : baseAllowance };
        }));
    };

    const handleAddEmployee = (emp: Employee) => {
        if (employeeEntries.find(e => e.employeeId === emp.id)) return;

        const isReliever = emp.branchId !== selectedBranchId;

        setEmployeeEntries(prev => [...prev, {
            employeeId: emp.id,
            name: emp.name,
            commission: 0,
            otPay: 0,
            cashAdvance: 0,
            lateDeduction: 0,
            allowance: getEmployeeAllowance(emp, selectedBranchId),
            isHalfDay: false,
            isReliever,
        }]);
        setIsAddPersonnelOpen(false);
        setPersonnelSearch('');
        playSound('click');
    };

    const handleRemoveEmployee = (id: string) => {
        setEmployeeEntries(prev => prev.filter(e => e.employeeId !== id));
        playSound('click');
    };

    const addExpenseItem = () => {
        if (!newExpenseName.trim() || !newExpenseAmount) return;
        setExpenseData(prev => [...prev, {
            id: `EXP-BF-${Date.now()}`,
            name: newExpenseName.trim().toUpperCase(),
            amount: Number(newExpenseAmount),
            category: 'OPERATIONAL',
            timestamp: `${selectedDate}T12:00:00Z`
        }]);
        setNewExpenseName('');
        setNewExpenseAmount('');
        playSound('click');
    };

    const removeExpenseItem = (idx: number) => {
        setExpenseData(prev => prev.filter((_, i) => i !== idx));
        playSound('click');
    };

    const selectedBranch = branches.find(b => b.id === selectedBranchId);
    const selectedVaultStartDate = selectedBranchId ? (branchVaultStartDates[selectedBranchId] ?? null) : null;
    const isLegacy = !(selectedBranch?.vaultEnabled) || !selectedVaultStartDate || selectedDate < selectedVaultStartDate;

    const addProvisionItem = () => {
        const amount = Number(selectedBranch?.dailyProvisionAmount) || 0;
        if (!amount) return;
        setVaultData(prev => [...prev, {
            id: `VLT-BF-${Date.now()}`,
            name: 'DAILY R&B PROVISION',
            amount,
            category: 'PROVISION',
            timestamp: `${selectedDate}T12:00:00Z`
        }]);
        playSound('click');
    };

    const addVaultDepositItem = () => {
        const amount = Number(newVaultDepositAmount);
        if (!amount || amount <= 0) return;
        setVaultData(prev => [...prev, {
            id: `VDP-BF-${Date.now()}`,
            name: 'VAULT DEPOSIT',
            amount,
            category: 'VAULT_DEPOSIT',
            timestamp: `${selectedDate}T12:00:00Z`
        }]);
        setNewVaultDepositAmount('');
        playSound('click');
    };

    const removeProvisionItem = (idx: number) => {
        setVaultData(prev => prev.filter((_, i) => i !== idx));
        playSound('click');
    };

    const handleBackfill = async () => {
        if (!selectedBranchId || !selectedDate) return;

        setIsProcessing(true);
        setStatus('Syncing with Cloud Registry...');

        try {
            const branch = branches.find(b => b.id === selectedBranchId);
            if (!branch) throw new Error('Branch not found');

            // Reliever entries go into both staffBreakdown (isReliever:true) AND expenseData
            const relieverExpenseEntries = employeeEntries
                .filter(e => e.isReliever)
                .map(e => {
                    const pay = Math.max(0,
                        Number(e.commission) + Number(e.otPay) + Number(e.allowance) - Number(e.cashAdvance) - Number(e.lateDeduction)
                    );
                    return {
                        id: `reliever_${e.employeeId}`,
                        branchId: branch.id,
                        name: `RELIEVER PAYOUT: ${e.name.toUpperCase()}`,
                        amount: pay,
                        category: 'OPERATIONAL',
                        timestamp: `${selectedDate}T12:00:00.000Z`,
                    };
                });

            // Merge with manual expenses (avoid duplicates by name)
            const relieverNames = new Set(relieverExpenseEntries.map(e => e.name.toUpperCase()));
            const manualExpenses = expenseData.filter((e: any) => !relieverNames.has((e.name || '').toUpperCase()));
            const finalExpenseData = [...relieverExpenseEntries, ...manualExpenses];

            const staffBreakdown = employeeEntries.map(e => ({
                employeeId: e.employeeId,
                staffName: e.name,
                count: 0,
                commission: Number(e.commission),
                allowance: Number(e.allowance),
                isHalfDay: !!e.isHalfDay,
                isReliever: !!e.isReliever,
                attendance: {
                    id: `ATT-BACKFILL-${Math.random().toString(36).substr(2, 9)}`,
                    date: selectedDate,
                    staffName: e.name,
                    employeeId: e.employeeId,
                    branchId: branch.id,
                    status: 'REGULAR',
                    clockIn: `${selectedDate}T08:00:00Z`,
                    clockOut: `${selectedDate}T17:00:00Z`,
                    otPay: Number(e.otPay),
                    lateDeduction: Number(e.lateDeduction),
                    cashAdvance: Number(e.cashAdvance),
                    createdAt: getTrueManilaISOString()
                }
            }));

            const dateCompact = selectedDate.replace(/-/g, '');
            const standardId  = `${branch.id}_${dateCompact}`;
            const backfillId  = `${branch.id}_${dateCompact}_BACKFILL_INCOMPLETE`;

            // Match by exact ID — not by branchId+date — so we never confuse the two records
            const standardReport  = salesReports.find(r => r.id === standardId);
            const existingBackfill = salesReports.find(r => r.id === backfillId);

            const hasExistingSessions = !!(standardReport?.sessionData?.length);

            // Priority: if a backfill record already exists → always update it (not standard)
            //           if the standard record has live sessions → create/update backfill
            //           otherwise → use standard ID (new or update)
            const isBackfillMode = !!(existingBackfill || hasExistingSessions);
            const reportId = isBackfillMode ? backfillId : standardId;

            // Source report for preserving existing expense/vault arrays
            const sourceReport = existingBackfill ?? (isBackfillMode ? null : standardReport);

            const sortDate = isBackfillMode
                ? 'BACKFILL RECORDS - Re:INCOMPLETE REPORT'
                : (sourceReport?.sortDate || selectedDate);

            const reportData = {
                id: reportId,
                branch_id: branch.id,
                report_date: selectedDate,
                gross_sales: Number(grossSales),
                total_staff_pay: totalStaffPay,
                total_expenses: finalExpenseData.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0),
                total_vault_provision: derivedVault,
                net_roi: Number(grossSales) - finalExpenseData.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0) - totalStaffPay - derivedVault,
                // Never touch the standard report's live sessions; backfill records carry no sessions
                session_data: isBackfillMode ? [] : (sourceReport?.sessionData || []),
                staff_breakdown: staffBreakdown,
                expense_data: finalExpenseData,
                // vault_data holds both PROVISION (legacy) and VAULT_DEPOSIT (modern) entries
                vault_data: vaultData,
                submitted_at: getTrueManilaISOString(),
                sort_date: sortDate
            };

            const { error } = await supabase.from('sales_reports').upsert(reportData, { onConflict: 'id' });
            if (error) throw error;

            // ── Recompute branch_vaults.balance from scratch ─────────────────
            // Only applies to non-legacy vault branches.
            const vaultStartDate = branchVaultStartDates[branch.id] ?? null;
            const reportIsLegacy = !(branch?.vaultEnabled) || !vaultStartDate || selectedDate < vaultStartDate;
            if (!reportIsLegacy && branch.vaultEnabled) {
                // Fetch: initial_balance, all report total_vault_provision (covers daily + backfill
                // deposits which don't create vault_transaction records), and all vault_transactions
                // that adjust the balance outside of daily deposits (withdrawals + admin deposits).
                const [vaultRowRes, allReportsRes, vaultTxRes] = await Promise.all([
                    supabase
                        .from(DB_TABLES.BRANCH_VAULTS)
                        .select(`${DB_COLUMNS.VAULT_INITIAL_BALANCE}`)
                        .eq(DB_COLUMNS.BRANCH_ID, branch.id)
                        .maybeSingle(),
                    supabase
                        .from(DB_TABLES.SALES_REPORTS)
                        .select('total_vault_provision')
                        .eq('branch_id', branch.id)
                        .gte('report_date', vaultStartDate),
                    supabase
                        .from(DB_TABLES.VAULT_TRANSACTIONS)
                        .select(`${DB_COLUMNS.AMOUNT}, ${DB_COLUMNS.TYPE}`)
                        .eq(DB_COLUMNS.BRANCH_ID, branch.id)
                        .in(DB_COLUMNS.TYPE, ['WITHDRAWAL', 'VAULT_WITHDRAWAL', 'ADMIN_DEPOSIT'])
                        .gte(DB_COLUMNS.TIMESTAMP, `${vaultStartDate}T00:00:00+08:00`),
                ]);

                if (vaultRowRes.data && !allReportsRes.error && !vaultTxRes.error) {
                    const initialBalance = Number(vaultRowRes.data[DB_COLUMNS.VAULT_INITIAL_BALANCE] ?? 0);
                    // total_vault_provision covers all deposit activity (daily + backfill)
                    const totalDeposits = (allReportsRes.data || []).reduce(
                        (s: number, r: any) => s + (Number(r.total_vault_provision) || 0), 0
                    );
                    // Withdrawals reduce the balance; admin deposits add to it (not in report totals)
                    const txAdjustment = (vaultTxRes.data || []).reduce((s: number, t: any) => {
                        const amt = Number(t[DB_COLUMNS.AMOUNT] || 0);
                        return t[DB_COLUMNS.TYPE] === 'ADMIN_DEPOSIT' ? s + amt : s - amt;
                    }, 0);
                    const newBalance = Math.max(0, initialBalance + totalDeposits + txAdjustment);
                    const { error: vaultErr } = await supabase
                        .from(DB_TABLES.BRANCH_VAULTS)
                        .update({ [DB_COLUMNS.VAULT_BALANCE]: newBalance })
                        .eq(DB_COLUMNS.BRANCH_ID, branch.id);
                    if (vaultErr) throw vaultErr;
                }

                // Upsert vault_transaction DEPOSIT records for backfill deposits so they
                // appear in VaultFundHub deposit history. Balance is derived from
                // total_vault_provision (reports), so this won't double-count.
                const vaultDepositItems = vaultData.filter((e: any) => e.category === 'VAULT_DEPOSIT');
                if (vaultDepositItems.length > 0) {
                    const txRows = vaultDepositItems.map((d: any) => ({
                        [DB_COLUMNS.ID]: d.id,
                        [DB_COLUMNS.BRANCH_ID]: branch.id,
                        [DB_COLUMNS.TYPE]: 'DEPOSIT',
                        [DB_COLUMNS.AMOUNT]: d.amount,
                        [DB_COLUMNS.NAME]: d.name ?? 'VAULT DEPOSIT',
                        [DB_COLUMNS.TIMESTAMP]: d.timestamp,
                        [DB_COLUMNS.PERFORMED_BY]: null,
                    }));
                    const { error: txErr } = await supabase
                        .from(DB_TABLES.VAULT_TRANSACTIONS)
                        .upsert(txRows, { onConflict: 'id' });
                    if (txErr) throw txErr;
                }
            }

            setStatus('Historical Ledger Synchronized Successfully');
            playSound('success');
            setShowConfirmModal(false);
            setShowSuccessModal(true);
            if (onRefresh) onRefresh();
        } catch (err: any) {
            setStatus(`Sync Aborted: ${err.message}`);
            playSound('warning');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6 md:space-y-10 pb-32 px-4 md:px-8">
            {/* Header Section */}
            <div className={`bg-white p-4 md:px-8 md:py-6 ${UI_THEME.radius.card} border border-slate-200 shadow-sm no-print flex flex-col md:flex-row md:items-center justify-between gap-6 mt-6 md:mt-10`}>
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white border border-slate-200 rounded-2xl flex items-center justify-center shadow-xl shrink-0">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className={UI_THEME.text.title}>Historical Backfill</h1>
                            <div className="flex items-center gap-1.5 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                                <span className="text-xs font-black text-emerald-800 uppercase tracking-widest">Manual</span>
                            </div>
                        </div>
                        <p className={UI_THEME.text.metadata}>Manual Entry for Past Operational Cycles</p>
                    </div>
                </div>

                {/* Cycle Configuration - Inline for Desktop */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-100 shadow-inner">
                    <div className="relative min-w-[200px]" ref={dropdownRef}>
                        <button
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className={`w-full h-12 flex items-center justify-between px-4 bg-white rounded-xl border transition-all duration-300 ${isDropdownOpen ? 'border-emerald-500 ring-2 ring-emerald-500/10' : 'border-slate-100 hover:border-slate-200'}`}
                        >
                            <span className="font-bold text-slate-900 text-xs uppercase tracking-widest truncate">
                                {selectedBranch ? selectedBranch.name : 'SELECT BRANCH...'}
                            </span>
                            <svg className={`w-3 h-3 text-slate-400 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180 text-emerald-500' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                        </button>

                        {isDropdownOpen && (
                            <div className="absolute top-[calc(100%+6px)] left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-xl z-[100] p-1.5 animate-in zoom-in-95 duration-200">
                                <div className="px-1 pb-1">
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="Search branch..."
                                        value={personnelSearch}
                                        onChange={e => setPersonnelSearch(e.target.value)}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium uppercase tracking-wide outline-none focus:border-emerald-400 transition-all"
                                        onClick={e => e.stopPropagation()}
                                    />
                                </div>
                                <div className="max-h-[260px] overflow-y-auto no-scrollbar">
                                    {branches
                                        .filter(b => !personnelSearch || b.name.toUpperCase().includes(personnelSearch.toUpperCase()))
                                        .map(b => (
                                        <button
                                            key={b.id}
                                            onClick={() => { setSelectedBranchId(b.id); setIsDropdownOpen(false); setPersonnelSearch(''); playSound('click'); }}
                                            className={`w-full text-left px-4 py-3 rounded-xl text-xs font-semibold uppercase tracking-wide transition-all mb-1 ${selectedBranchId === b.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}
                                        >
                                            {b.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="relative group min-w-[160px]">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-focus-within:text-emerald-500 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                                <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2-0 002-2V7a2 2-0 00-2-2H5a2 2-0 00-2-2V12a2 2-0 002 2z"/>
                            </svg>
                        </div>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => { setSelectedDate(e.target.value); playSound('click'); }}
                            className="w-full h-12 pl-11 pr-4 bg-white border border-slate-100 rounded-xl font-bold text-xs uppercase tracking-widest focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all appearance-none cursor-pointer"
                        />
                    </div>
                </div>
            </div>

            {/* Main Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
                {/* Gross Sales */}
                <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-100 shadow-sm space-y-4 hover:border-emerald-200 transition-all duration-200 group relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 blur-3xl rounded-full -mr-12 -mt-12"></div>
                    <div className="flex items-center justify-between relative z-10">
                        <label className={UI_THEME.text.label}>Gross Sales</label>
                        <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 shadow-inner">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8c-1.657 0-3 1.343-3 3s1.343 3 3 3 3-1.343 3-3-1.343-3-3-3zM12 8V7m0 1v1m0 0v1m0 0v1m0-5V5m0 2v1m0 0v1m0 0v1m0 0v1" /></svg>
                        </div>
                    </div>
                    <div className="relative z-10 flex items-baseline gap-1">
                        <span className="text-emerald-500 font-black text-xl">₱</span>
                        <input
                            type="text"
                            inputMode="numeric"
                            value={grossSales}
                            onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9.]/g, '');
                                setGrossSales(val === '' ? 0 : Number(val));
                            }}
                            onFocus={(e) => e.target.value === '0' && setGrossSales('' as any)}
                            className="w-full bg-transparent border-none p-0 text-xl md:text-2xl font-black text-slate-900 focus:ring-0 transition-all placeholder:text-slate-200 tracking-tighter"
                            placeholder="0"
                        />
                    </div>
                    <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden relative z-10">
                        <div className="h-full bg-emerald-500 w-0 group-hover:w-full transition-all duration-1000"></div>
                    </div>
                </div>

                {/* Total Salary */}
                <div className={`bg-white p-6 md:p-8 rounded-2xl border shadow-sm space-y-4 transition-all duration-200 group relative overflow-hidden ${isSalaryMismatch ? 'border-rose-100 hover:border-rose-300' : 'border-slate-100 hover:border-rose-200'}`}>
                    <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 blur-3xl rounded-full -mr-12 -mt-12"></div>
                    <div className="flex items-center justify-between relative z-10">
                        <label className={UI_THEME.text.label}>Total Salary</label>
                        {isSalaryMismatch ? (
                            <div className="flex items-center gap-2 px-3 py-1 bg-rose-50 rounded-full animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                <span className="text-xs font-black text-rose-600 uppercase tracking-widest">Mismatch</span>
                            </div>
                        ) : (
                            <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600 shadow-inner">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                            </div>
                        )}
                    </div>
                    <div className="relative z-10 flex items-baseline gap-1 group/salary">
                        <span className={`font-black text-xl ${isSalaryMismatch ? 'text-rose-500' : 'text-slate-400'}`}>₱</span>
                        <input
                            type="text"
                            inputMode="numeric"
                            value={totalSalary}
                            onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9.]/g, '');
                                setTotalSalary(val === '' ? 0 : Number(val));
                            }}
                            onFocus={(e) => e.target.value === '0' && setTotalSalary('' as any)}
                            className={`w-full bg-transparent border-none p-0 text-xl md:text-2xl font-black focus:ring-0 transition-all placeholder:text-slate-200 tracking-tighter ${isSalaryMismatch ? 'text-rose-600' : 'text-slate-900'}`}
                            placeholder="0"
                        />
                        
                        {isSalaryMismatch && (
                            <div className="absolute bottom-full right-0 mb-4 w-72 p-5 bg-slate-900 text-white text-xs font-medium uppercase tracking-wide rounded-3xl opacity-0 group-hover/salary:opacity-100 transition-all z-50 pointer-events-none shadow-xl border border-slate-200 ring-4 ring-rose-500/10 scale-95 group-hover/salary:scale-100 origin-bottom-right">
                                <p className="text-rose-400 mb-3 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                                    Payroll Discrepancy
                                </p>
                                <p className="text-slate-300 normal-case font-medium leading-relaxed">
                                    The sum of individual net pays (₱{totalEmployeeNetPay.toLocaleString()}) does not match your entered total (₱{totalSalary.toLocaleString()}).
                                </p>
                                <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between items-center">
                                    <span className="text-slate-400">Difference:</span>
                                    <span className="text-rose-400 text-sm font-black">₱{Math.abs(totalSalary - totalEmployeeNetPay).toLocaleString()}</span>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden relative z-10">
                        <div className={`h-full transition-all duration-1000 ${isSalaryMismatch ? 'bg-rose-500 w-full' : 'bg-rose-500 w-0 group-hover:w-full'}`}></div>
                        {isSalaryMismatch && (
                            <button
                                onClick={handleSyncSalary}
                                disabled={isReadOnly}
                                className="absolute right-0 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-700 bg-rose-600 px-3 py-1 rounded-full shadow-lg hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-30"
                            >
                                Auto-Sync
                            </button>
                        )}
                    </div>
                </div>

                {/* Net ROI - Enhanced */}
                <div className={`p-6 md:p-8 rounded-2xl border shadow-xl flex flex-col justify-between space-y-4 transition-all duration-200 group relative overflow-hidden ${netRoi >= 0 ? 'bg-slate-900 border-slate-800' : 'bg-rose-900 border-rose-800'}`}>
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-50"></div>
                    <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-white/5 blur-3xl rounded-full"></div>
                    
                    <div className="relative z-10 flex items-center justify-between">
                        <div className="space-y-1">
                            <label className="text-xs font-black text-white/40 uppercase tracking-wider">Net Return on Investment</label>
                            <p className="text-xs font-bold text-white/20 uppercase tracking-widest">Calculated across all operational streams</p>
                        </div>
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${netRoi >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                        </div>
                    </div>
                    
                    <div className="relative z-10 flex items-center gap-4">
                        <div className="flex-1">
                            <p className={`text-5xl md:text-7xl font-black tabular-nums tracking-tighter ${netRoi >= 0 ? 'text-white' : 'text-rose-100'}`}>
                                <span className="text-2xl md:text-3xl opacity-40 mr-1">₱</span>
                                {netRoi.toLocaleString()}
                            </p>
                        </div>
                        <div className="hidden sm:block text-right">
                            <div className={`px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wide ${netRoi >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                {netRoi >= 0 ? 'Profitable Cycle' : 'Deficit Cycle'}
                            </div>
                        </div>
                    </div>
                    
                    <div className="relative z-10 h-2 w-full bg-white/5 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-1000 w-full ${netRoi >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                    </div>
                </div>
            </div>

            {/* Operational Expenses — itemized */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Operational Expenses</span>
                    <div className="h-px flex-1 bg-slate-100"></div>
                    {derivedExpenses > 0 && (
                        <span className="text-xs font-black text-rose-500 tabular-nums">−₱{derivedExpenses.toLocaleString()}</span>
                    )}
                </div>

                {(expenseData.length > 0 || employeeEntries.some(e => e.isReliever)) && (
                    <div className="mb-3 space-y-1.5">
                        {/* Reliever entries — derived live from payroll table, read-only here */}
                        {employeeEntries.filter(e => e.isReliever).map(e => {
                            const pay = Number(e.commission) + Number(e.otPay) + Number(e.allowance) - Number(e.cashAdvance) - Number(e.lateDeduction);
                            return (
                                <div key={`reliever_${e.employeeId}`} className="flex items-center gap-2 rounded-xl px-3 py-2 border bg-violet-50 border-violet-100">
                                    <span className="text-xs font-black text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded uppercase tracking-widest shrink-0">Reliever</span>
                                    <span className="flex-1 text-xs font-bold text-violet-700 uppercase truncate">RELIEVER PAYOUT: {e.name.toUpperCase()}</span>
                                    <span className="text-xs font-black text-rose-500 tabular-nums shrink-0">₱{Math.max(0, pay).toLocaleString()}</span>
                                    <span className="text-xs font-bold text-violet-400 shrink-0 italic">auto</span>
                                </div>
                            );
                        })}
                        {/* Manual expense entries */}
                        {expenseData.map((item, idx) => (
                            <div key={item.id || idx} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                                <span className="flex-1 text-xs font-bold text-slate-700 uppercase truncate">{item.name}</span>
                                <span className="text-xs font-black text-rose-500 tabular-nums shrink-0">₱{Number(item.amount).toLocaleString()}</span>
                                {!isReadOnly && (
                                <button
                                    type="button"
                                    onClick={() => removeExpenseItem(idx)}
                                    className="w-5 h-5 rounded-full bg-rose-50 text-rose-400 hover:bg-rose-100 hover:text-rose-600 flex items-center justify-center text-xs font-black transition-colors shrink-0"
                                >×</button>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2">
                    <input
                        type="text"
                        placeholder="Expense name..."
                        value={newExpenseName}
                        onChange={e => setNewExpenseName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExpenseItem(); } }}
                        className="w-full sm:flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 placeholder:text-slate-300 focus:ring-2 focus:ring-rose-400 focus:outline-none transition-all"
                    />
                    <div className="flex gap-2">
                        <div className="relative flex-1 sm:w-28 sm:flex-none">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black">₱</span>
                            <input
                                type="number"
                                placeholder="0"
                                value={newExpenseAmount}
                                onChange={e => setNewExpenseAmount(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExpenseItem(); } }}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-6 pr-3 py-2.5 text-xs font-black text-slate-900 placeholder:text-slate-300 focus:ring-2 focus:ring-rose-400 focus:outline-none transition-all"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={addExpenseItem}
                            disabled={isReadOnly || !newExpenseName.trim() || !newExpenseAmount}
                            className="px-3 py-2.5 bg-rose-500 text-white rounded-xl text-xs font-black hover:bg-rose-600 active:scale-95 transition-all disabled:opacity-30 shrink-0"
                        >Add</button>
                    </div>
                </div>
                {expenseData.length === 0 && (
                    <p className="text-xs font-bold text-slate-300 uppercase tracking-widest mt-2 ml-1">No expenses added yet</p>
                )}
            </div>

            {/* Rent & Bills Deposit (legacy) / Vault Deposit (vault-era) — itemized */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                        {isLegacy ? 'Rent & Bills Deposit' : 'Vault Deposit'}
                    </span>
                    <div className="h-px flex-1 bg-slate-100"></div>
                    {derivedVault > 0 && (
                        <span className={`text-xs font-black tabular-nums ${isLegacy ? 'text-indigo-600' : 'text-emerald-600'}`}>
                            ₱{derivedVault.toLocaleString()}
                        </span>
                    )}
                </div>

                {vaultData.length > 0 && (
                    <div className="mb-3 space-y-1.5">
                        {vaultData.map((item, idx) => (
                            <div key={item.id || idx} className={`flex items-center gap-2 rounded-xl px-3 py-2 border ${isLegacy ? 'bg-indigo-50 border-indigo-100' : 'bg-emerald-50 border-emerald-100'}`}>
                                <span className={`flex-1 text-xs font-bold uppercase truncate ${isLegacy ? 'text-indigo-700' : 'text-emerald-700'}`}>{item.name}</span>
                                <span className={`text-xs font-black tabular-nums shrink-0 ${isLegacy ? 'text-indigo-700' : 'text-emerald-700'}`}>₱{Number(item.amount).toLocaleString()}</span>
                                <button
                                    type="button"
                                    onClick={() => removeProvisionItem(idx)}
                                    className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-black transition-colors shrink-0 ${isLegacy ? 'bg-indigo-100 text-indigo-400 hover:bg-indigo-200 hover:text-indigo-600' : 'bg-emerald-100 text-emerald-400 hover:bg-emerald-200 hover:text-emerald-600'}`}
                                >×</button>
                            </div>
                        ))}
                    </div>
                )}

                {isLegacy ? (
                    <>
                        <button
                            type="button"
                            onClick={addProvisionItem}
                            disabled={!(Number(selectedBranch?.dailyProvisionAmount) > 0)}
                            className="flex items-center gap-2.5 px-4 py-2.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl hover:bg-indigo-100 active:scale-95 transition-all disabled:opacity-40"
                        >
                            <span className="text-xs font-semibold uppercase tracking-wide">+ Add Deposit</span>
                            {Number(selectedBranch?.dailyProvisionAmount) > 0 && (
                                <span className="px-2 py-0.5 bg-indigo-600 text-white rounded-lg text-xs font-black tabular-nums">
                                    ₱{Number(selectedBranch?.dailyProvisionAmount).toLocaleString()}
                                </span>
                            )}
                        </button>
                        {!(Number(selectedBranch?.dailyProvisionAmount) > 0) && (
                            <p className="text-xs font-bold text-slate-300 uppercase tracking-widest mt-2 ml-1">No deposit amount configured for this branch</p>
                        )}
                    </>
                ) : (
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black">₱</span>
                            <input
                                type="number"
                                placeholder="0"
                                value={newVaultDepositAmount}
                                onChange={e => setNewVaultDepositAmount(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVaultDepositItem(); } }}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-6 pr-3 py-2.5 text-xs font-black text-slate-900 placeholder:text-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={addVaultDepositItem}
                            disabled={isReadOnly || !newVaultDepositAmount || Number(newVaultDepositAmount) <= 0}
                            className="px-3 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-30 shrink-0"
                        >Add</button>
                    </div>
                )}
            </div>

                {selectedBranchId && (
                    <div className="space-y-6 md:space-y-10">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="space-y-1">
                                <h3 className={UI_THEME.text.section}>Personnel Payroll Breakdown</h3>
                                <p className={UI_THEME.text.metadata}>Individual compensation for this cycle</p>
                            </div>
                            
                            <div className="relative w-full md:w-[400px]" ref={personnelDropdownRef}>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="SEARCH & ADD PERSONNEL BY NAME..."
                                        value={personnelSearch}
                                        onChange={(e) => { setPersonnelSearch(e.target.value.toUpperCase()); setIsAddPersonnelOpen(true); }}
                                        onFocus={() => setIsAddPersonnelOpen(true)}
                                        className="w-full h-16 pl-14 pr-6 bg-white border-2 border-slate-100 rounded-2xl text-xs font-semibold uppercase tracking-wide focus:border-emerald-500 focus:ring-8 focus:ring-emerald-500/5 outline-none transition-all placeholder:text-slate-300 shadow-sm"
                                    />
                                </div>

                                {isAddPersonnelOpen && (
                                    <div className="absolute top-[calc(100%+12px)] left-0 right-0 bg-white border border-slate-100 rounded-2xl shadow-xl z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                        <div className="p-4 border-b border-slate-50 bg-slate-50/50">
                                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-2">Available Personnel</p>
                                        </div>
                                        <div className="max-h-[400px] overflow-y-auto no-scrollbar p-2">
                                            {employees
                                                .filter(emp => emp.isActive && !employeeEntries.find(e => e.employeeId === emp.id))
                                                .filter(emp => emp.name.toUpperCase().includes(personnelSearch))
                                                .map(emp => (
                                                <button
                                                    key={emp.id}
                                                    onClick={() => { if (!isReadOnly) { handleAddEmployee(emp); setPersonnelSearch(''); setIsAddPersonnelOpen(false); } }}
                                                    className="w-full p-4 flex items-center justify-between hover:bg-emerald-50 rounded-xl transition-all group"
                                                >
                                                    <div className="flex items-center gap-4 min-w-0">
                                                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-xs font-black text-slate-500 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors shrink-0">
                                                            {getInitials(emp.name)}
                                                        </div>
                                                        <div className="text-left min-w-0">
                                                            <p className="text-xs font-black text-slate-900 uppercase tracking-widest truncate">{emp.name}</p>
                                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">
                                                                {branches.find(b => b.id === emp.branchId)?.name || 'Unknown Branch'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                                                    </div>
                                                </button>
                                            ))}
                                            {employees.filter(emp => !employeeEntries.find(e => e.employeeId === emp.id)).length === 0 && (
                                                <div className="py-12 text-center">
                                                    <p className="text-xs font-black text-slate-300 uppercase tracking-widest">No more employees available</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Desktop Table View */}
                        <div className="hidden md:block overflow-hidden bg-white border border-slate-200 rounded-2xl shadow-sm">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50 border-b border-slate-100">
                                        <th className="pl-8 pr-4 py-5 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Personnel</th>
                                        <th className="px-4 py-5 text-center text-xs font-medium text-slate-400 uppercase tracking-wide">Commission</th>
                                        <th className="px-4 py-5 text-center text-xs font-medium text-slate-400 uppercase tracking-wide">OT Pay</th>
                                        <th className="px-4 py-5 text-center text-xs font-medium text-slate-400 uppercase tracking-wide">Cash Adv</th>
                                        <th className="px-4 py-5 text-center text-xs font-medium text-slate-400 uppercase tracking-wide">Deduction</th>
                                        <th className="px-4 py-5 text-center text-xs font-medium text-slate-400 uppercase tracking-wide">Allowance</th>
                                        <th className="px-4 py-5 text-center text-xs font-black text-amber-500 uppercase tracking-widest">½ Day</th>
                                        <th className="px-4 py-5 text-right text-xs font-medium text-slate-400 uppercase tracking-wide w-40">Net Pay</th>
                                        <th className="pl-4 pr-8 py-5 text-right w-20"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {employeeEntries.map((emp) => {
                                        const netPay = Number(emp.commission) + Number(emp.otPay) + Number(emp.allowance) - Number(emp.cashAdvance) - Number(emp.lateDeduction);
                                        return (
                                            <tr key={emp.employeeId} className={`group transition-colors ${emp.isReliever ? 'bg-violet-50/40 hover:bg-violet-50/60' : emp.isHalfDay ? 'bg-amber-50/50 hover:bg-amber-50' : 'hover:bg-slate-50/50'}`}>
                                                <td className="pl-8 pr-4 py-6">
                                                    <div className="space-y-1">
                                                        <p className="text-xs font-black text-slate-900 uppercase tracking-widest">{emp.name}</p>
                                                        <div className="flex items-center gap-2">
                                                            {emp.isReliever && (
                                                                <span className="px-2 py-0.5 bg-violet-100 text-violet-600 rounded text-xs font-black uppercase tracking-tighter">Reliever · pay → expenses</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-6">
                                                    <div className="flex justify-center">
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            value={emp.commission}
                                                            onChange={(e) => {
                                                                const val = e.target.value.replace(/[^0-9.]/g, '');
                                                                handleUpdateEmployee(emp.employeeId, 'commission', val === '' ? 0 : Number(val));
                                                            }}
                                                            className="w-24 h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs font-black text-center focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all"
                                                            placeholder="0"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-6">
                                                    <div className="flex justify-center">
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            value={emp.otPay}
                                                            onChange={(e) => {
                                                                const val = e.target.value.replace(/[^0-9.]/g, '');
                                                                handleUpdateEmployee(emp.employeeId, 'otPay', val === '' ? 0 : Number(val));
                                                            }}
                                                            className="w-24 h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs font-black text-center focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all"
                                                            placeholder="0"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-6">
                                                    <div className="flex justify-center">
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            value={emp.cashAdvance}
                                                            onChange={(e) => {
                                                                const val = e.target.value.replace(/[^0-9.]/g, '');
                                                                handleUpdateEmployee(emp.employeeId, 'cashAdvance', val === '' ? 0 : Number(val));
                                                            }}
                                                            className="w-24 h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs font-black text-center focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 outline-none transition-all"
                                                            placeholder="0"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-6">
                                                    <div className="flex justify-center">
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            value={emp.lateDeduction}
                                                            onChange={(e) => {
                                                                const val = e.target.value.replace(/[^0-9.]/g, '');
                                                                handleUpdateEmployee(emp.employeeId, 'lateDeduction', val === '' ? 0 : Number(val));
                                                            }}
                                                            className="w-24 h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs font-black text-center focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 outline-none transition-all"
                                                            placeholder="0"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-6">
                                                    <div className="flex justify-center">
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            value={emp.allowance}
                                                            onChange={(e) => {
                                                                const val = e.target.value.replace(/[^0-9.]/g, '');
                                                                handleUpdateEmployee(emp.employeeId, 'allowance', val === '' ? 0 : Number(val));
                                                            }}
                                                            className="w-24 h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs font-black text-center focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                                                            placeholder="0"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-6 text-center">
                                                    <button
                                                        onClick={() => !isReadOnly && handleToggleHalfDay(emp.employeeId)}
                                                        title={emp.isHalfDay ? 'Half-day (click to remove)' : 'Mark as half-day'}
                                                        disabled={isReadOnly}
                                                        className={`w-9 h-9 rounded-xl flex items-center justify-center mx-auto transition-all active:scale-90 disabled:opacity-30 ${
                                                            emp.isHalfDay
                                                                ? 'bg-amber-500 text-white shadow-sm'
                                                                : 'bg-slate-100 text-slate-300 hover:bg-amber-100 hover:text-amber-500'
                                                        }`}
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                                            <circle cx="12" cy="12" r="10"/>
                                                            <path d="M12 2a10 10 0 0 1 0 20V2z" fill="currentColor" stroke="none"/>
                                                        </svg>
                                                    </button>
                                                </td>
                                                <td className="px-4 py-6 text-right">
                                                    <p className="text-xs font-black text-slate-900 tabular-nums tracking-tight">₱{netPay.toLocaleString()}</p>
                                                </td>
                                                <td className="pl-4 pr-8 py-6 text-right">
                                                    {!isReadOnly && (
                                                      <button
                                                        onClick={() => handleRemoveEmployee(emp.employeeId)}
                                                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all opacity-0 group-hover:opacity-100"
                                                      >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                      </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {employeeEntries.length === 0 && (
                                        <tr>
                                            <td colSpan={9} className="py-20 text-center">
                                                <div className="flex flex-col items-center gap-3 opacity-20">
                                                    <svg className="w-12 h-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                                    <p className="text-xs font-semibold uppercase tracking-wide">No personnel added yet</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Card View */}
                        <div className="md:hidden space-y-4">
                            {employeeEntries.map((emp) => {
                                const netPay = Number(emp.commission) + Number(emp.otPay) + Number(emp.allowance) - Number(emp.cashAdvance) - Number(emp.lateDeduction);
                                return (
                                    <div key={emp.employeeId} className={`border rounded-2xl p-5 space-y-5 shadow-sm ${emp.isReliever ? 'bg-violet-50 border-violet-200' : emp.isHalfDay ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
                                        <div className="flex items-center justify-between">
                                            <div className="space-y-0.5">
                                                <p className="text-xs font-black text-slate-900 uppercase tracking-widest">{emp.name}</p>
                                                {emp.isReliever && (
                                                    <span className="text-xs font-black text-violet-600 bg-violet-100 px-2 py-0.5 rounded uppercase tracking-widest">Reliever · pay → expenses</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {!isReadOnly && (
                                                <button
                                                    onClick={() => handleToggleHalfDay(emp.employeeId)}
                                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide transition-all active:scale-95 ${
                                                        emp.isHalfDay
                                                            ? 'bg-amber-500 text-white'
                                                            : 'bg-slate-100 text-slate-400 hover:bg-amber-100 hover:text-amber-600'
                                                    }`}
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20V2z" fill="currentColor" stroke="none"/></svg>
                                                    ½ Day
                                                </button>
                                                )}
                                                {!isReadOnly && (
                                                <button
                                                    onClick={() => handleRemoveEmployee(emp.employeeId)}
                                                    className="w-8 h-8 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center transition-all active:scale-90"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">Commission</label>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-300">₱</span>
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        value={emp.commission}
                                                        onChange={(e) => {
                                                            const val = e.target.value.replace(/[^0-9.]/g, '');
                                                            handleUpdateEmployee(emp.employeeId, 'commission', val === '' ? 0 : Number(val));
                                                        }}
                                                        className="w-full h-11 pl-7 pr-3 bg-slate-50/50 border border-slate-100 rounded-xl text-xs font-black focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">OT Pay</label>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-300">₱</span>
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        value={emp.otPay}
                                                        onChange={(e) => {
                                                            const val = e.target.value.replace(/[^0-9.]/g, '');
                                                            handleUpdateEmployee(emp.employeeId, 'otPay', val === '' ? 0 : Number(val));
                                                        }}
                                                        className="w-full h-11 pl-7 pr-3 bg-slate-50/50 border border-slate-100 rounded-xl text-xs font-black focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">Cash Adv</label>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-300">₱</span>
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        value={emp.cashAdvance}
                                                        onChange={(e) => {
                                                            const val = e.target.value.replace(/[^0-9.]/g, '');
                                                            handleUpdateEmployee(emp.employeeId, 'cashAdvance', val === '' ? 0 : Number(val));
                                                        }}
                                                        className="w-full h-11 pl-7 pr-3 bg-slate-50/50 border border-slate-100 rounded-xl text-xs font-black focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 outline-none transition-all"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">Deduction</label>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-300">₱</span>
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        value={emp.lateDeduction}
                                                        onChange={(e) => {
                                                            const val = e.target.value.replace(/[^0-9.]/g, '');
                                                            handleUpdateEmployee(emp.employeeId, 'lateDeduction', val === '' ? 0 : Number(val));
                                                        }}
                                                        className="w-full h-11 pl-7 pr-3 bg-slate-50/50 border border-slate-100 rounded-xl text-xs font-black focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 outline-none transition-all"
                                                    />
                                                </div>
                                            </div>
                                            <div className="col-span-2 space-y-1.5">
                                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">Allowance</label>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-300">₱</span>
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        value={emp.allowance}
                                                        onChange={(e) => {
                                                            const val = e.target.value.replace(/[^0-9.]/g, '');
                                                            handleUpdateEmployee(emp.employeeId, 'allowance', val === '' ? 0 : Number(val));
                                                        }}
                                                        className="w-full h-11 pl-7 pr-3 bg-slate-50/50 border border-slate-100 rounded-xl text-xs font-black focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Net Pay</p>
                                            <p className="text-sm font-black text-emerald-600 tabular-nums tracking-tight">₱{netPay.toLocaleString()}</p>
                                        </div>
                                    </div>
                                );
                            })}
                            {employeeEntries.length === 0 && (
                                <div className="py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">No personnel added yet</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="pt-10 space-y-8">
                    {status && (
                        <div className={`p-6 rounded-2xl flex items-center gap-4 animate-in fade-in slide-in-from-top-2 border ${status.includes('Aborted') ? 'bg-rose-50 border-rose-100 text-rose-800' : 'bg-emerald-50 border-emerald-100 text-emerald-800'}`}>
                            <div className={`w-3 h-3 rounded-full animate-pulse ${status.includes('Aborted') ? 'bg-rose-500' : 'bg-emerald-500'}`}></div>
                            <p className="text-xs font-semibold uppercase tracking-wide">{status}</p>
                        </div>
                    )}

                    <button
                        onClick={() => setShowConfirmModal(true)}
                        disabled={isReadOnly || isProcessing || !selectedBranchId || !selectedDate}
                        className={`group relative w-full h-20 md:h-24 rounded-2xl font-black uppercase tracking-wide text-xs md:text-sm shadow-xl transition-all active:scale-[0.98] overflow-hidden ${isReadOnly || isProcessing || !selectedBranchId || !selectedDate ? 'bg-slate-100 text-slate-300' : 'bg-slate-950 text-white hover:bg-emerald-600'}`}
                    >
                        <div className="relative z-10 flex items-center justify-center gap-4">
                            {isProcessing ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                    <span>PROCESSING SYNC...</span>
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                                    <span>AUTHORIZE SYNC</span>
                                </>
                            )}
                        </div>
                        {!isProcessing && selectedBranchId && selectedDate && (
                            <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-teal-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                        )}
                    </button>
                </div>

                {/* Confirmation Modal */}
            {showConfirmModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-xl border border-white/20 animate-in zoom-in-95 duration-300">
                        <div className="p-8 text-center space-y-6">
                            <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto text-amber-500 shadow-inner">
                                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Confirm Backfill Sync</h3>
                                <p className="text-xs font-medium text-slate-500 leading-relaxed px-4">
                                    You are about to synchronize historical data for <span className="font-bold text-slate-900">{selectedBranch?.name}</span> on <span className="font-bold text-slate-900">{selectedDate}</span>. This will overwrite any existing records for this cycle.
                                </p>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3 pt-4">
                                <button
                                    onClick={() => setShowConfirmModal(false)}
                                    className="py-4 rounded-2xl text-xs font-semibold uppercase tracking-wide text-slate-400 hover:bg-slate-50 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleBackfill}
                                    disabled={isProcessing}
                                    className="py-4 rounded-2xl text-xs font-semibold uppercase tracking-wide bg-slate-900 text-white hover:bg-emerald-600 shadow-lg shadow-slate-200 transition-all active:scale-95 flex items-center justify-center gap-2"
                                >
                                    {isProcessing ? (
                                        <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                    ) : (
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                    )}
                                    {isProcessing ? 'Processing...' : 'Confirm Sync'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Success Modal */}
            {showSuccessModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-xl border border-white/20 animate-in zoom-in-95 duration-300">
                        <div className="p-8 text-center space-y-6">
                            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-500 shadow-inner">
                                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Sync Completed</h3>
                                <p className="text-xs font-medium text-slate-500 leading-relaxed px-4">
                                    Historical ledger for <span className="font-bold text-slate-900">{selectedBranch?.name}</span> has been successfully synchronized with the cloud registry.
                                </p>
                            </div>
                            
                            <div className="pt-4">
                                <button
                                    onClick={() => setShowSuccessModal(false)}
                                    className="w-full py-4 rounded-2xl text-xs font-semibold uppercase tracking-wide bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all active:scale-95"
                                >
                                    Dismiss
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
