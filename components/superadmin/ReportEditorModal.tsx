import React, { useState, useMemo, useEffect } from 'react';
import { SalesReport, Branch, Transaction, Expense, Employee } from '../../types';
import { UI_THEME } from '../../constants/ui_designs';
import { playSound } from '../../lib/audio';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { getTrueISOString } from '../../lib/time';
import { useBranchServiceTemplates } from '../../hooks/useNetworkData';

interface ReportEditorModalProps {
    report: SalesReport;
    branch: Branch;
    employees?: Employee[];
    onClose: () => void;
    onSave?: () => void;
}

export const ReportEditorModal: React.FC<ReportEditorModalProps> = ({ report, branch, employees = [], onClose, onSave }) => {
    const [editedReport, setEditedReport] = useState<SalesReport>({ ...report });
    const [activeTab, setActiveTab] = useState<'sessions' | 'expenses' | 'vault'>('sessions');
    const [isSaving, setIsSaving] = useState(false);
    const [presentEmployeeIds, setPresentEmployeeIds] = useState<Set<string>>(new Set());
    const { data: branchServiceTemplates = [] } = useBranchServiceTemplates(branch.id);

    useEffect(() => {
        document.body.classList.add('modal-open');
        return () => {
            document.body.classList.remove('modal-open');
        };
    }, []);

    useEffect(() => {
        const fetchAttendance = async () => {
            try {
                // Ensure we use YYYY-MM-DD format for date
                const dateStr = report.reportDate.split('T')[0];

                const { data, error } = await supabase
                    .from(DB_TABLES.ATTENDANCE)
                    .select('employee_id')
                    .eq('branch_id', branch.id)
                    .eq('date', dateStr)
                    .not('clock_in', 'is', null);

                if (error) throw error;
                if (data) {
                    setPresentEmployeeIds(new Set(data.map(a => a.employee_id)));
                }
            } catch (err) {
                console.error('Error fetching attendance:', err);
            }
        };
        fetchAttendance();
    }, [branch.id, report.reportDate]);

    const branchEmployees = useMemo(() =>
            employees.filter(emp =>
                emp.branchId === branch.id &&
                emp.isActive &&
                presentEmployeeIds.has(emp.id)
            ),
        [employees, branch.id, presentEmployeeIds]
    );

    const getSessionRequirements = (s: any) => {
        const serviceIds = (s.serviceId || '').split(',').map((id: string) => id.trim());
        const serviceNames = (s.serviceName || '').split('+').map((n: string) => n.trim().toUpperCase());

        const matchedServices = branchServiceTemplates.filter(srv =>
            serviceIds.includes(srv.id) || serviceNames.includes((srv.name || '').toUpperCase())
        );

        const rolesInSelection = new Set(matchedServices.map(srv => srv.primaryRole || 'THERAPIST'));
        const isDualRequired = matchedServices.some(srv => srv.isDualProvider) || rolesInSelection.size > 1;
        const primaryRole = matchedServices.length > 0 ? (matchedServices[0].primaryRole || 'THERAPIST') : 'THERAPIST';
        const secondaryRole = primaryRole === 'THERAPIST' ? 'BONESETTER' : 'THERAPIST';

        return { isDualRequired, primaryRole, secondaryRole };
    };

    const totals = useMemo(() => {
        const gross = editedReport.sessionData.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
        
        // 1. Calculate commission-based pay from edited sessions
        const commissionPay = editedReport.sessionData.reduce((sum, s) => {
            const comms = (Number(s.primaryCommission) || 0) + (Number(s.secondaryCommission) || 0);
            const deductions = (Number(s.deduction) || 0);
            return sum + comms - deductions;
        }, 0);

        // 2. Calculate attendance-based pay from original report (allowances, OT, late)
        // We use the original report's staffBreakdown as the source of truth for attendance components
        const attendancePay = (report.staffBreakdown || []).reduce((sum, item) => {
            const allowance = Number(item.allowance) || 0;
            const ot = Number(item.attendance?.otPay || item.attendance?.ot_pay || 0);
            const late = Number(item.attendance?.lateDeduction || item.attendance?.late_deduction || 0);
            return sum + allowance + ot - late;
        }, 0);

        const staffPay = commissionPay + attendancePay;
        const expenses = editedReport.expenseData.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        const vault = editedReport.vaultData.reduce((sum, v) => sum + (Number(v.amount) || 0), 0);
        const net = gross - staffPay - expenses - vault;

        return { gross, staffPay, expenses, vault, net };
    }, [editedReport, report.staffBreakdown]);

    const isEmployeeManager = (emp: Employee) => {
        const roles = (emp.role || '').split(',').map(r => r.trim().toUpperCase());
        const isRoleManager = roles.includes('MANAGER');
        const isDesignatedManager = branch.manager?.toUpperCase() === emp.name?.toUpperCase();
        const isTempManager = branch.tempManager?.toUpperCase() === emp.name?.toUpperCase();
        return isRoleManager || isDesignatedManager || isTempManager;
    };

    const handleSave = async () => {
        const invalidSessions = editedReport.sessionData.filter((s: any) => {
            const { isDualRequired, primaryRole, secondaryRole } = getSessionRequirements(s);
            if (!s.therapistName || s.therapistName === 'UNASSIGNED') return true;
            const primaryEmp = branchEmployees.find(e => e.name === s.therapistName);
            if (primaryEmp) {
                const roles = (primaryEmp.role || '').split(',').map(r => r.trim().toUpperCase());
                if (!roles.includes(primaryRole.toUpperCase()) && !isEmployeeManager(primaryEmp)) return true;
            }
            if (isDualRequired) {
                if (!s.bonesetterName || s.bonesetterName === 'NONE' || s.bonesetterName === '') return true;
                const secondaryEmp = branchEmployees.find(e => e.name === s.bonesetterName);
                if (secondaryEmp) {
                    const roles = (secondaryEmp.role || '').split(',').map(r => r.trim().toUpperCase());
                    if (!roles.includes(secondaryRole.toUpperCase()) && !isEmployeeManager(secondaryEmp)) return true;
                }
            } else {
                if (s.bonesetterName && s.bonesetterName !== 'NONE' && s.bonesetterName !== '') return true;
            }
            return false;
        });

        if (invalidSessions.length > 0) {
            playSound('warning');
            alert(`Validation Error: ${invalidSessions.length} session(s) have invalid provider assignments.`);
            return;
        }

        setIsSaving(true);
        try {
            const breakdownMap: Record<string, any> = {};
            (report.staffBreakdown || []).forEach(item => {
                const emp = employees.find(e => e.id === item.employeeId);
                const name = emp?.name || item.name || 'UNKNOWN';
                const { txs, ...rest } = item;
                breakdownMap[name] = { ...rest, commission: 0, count: 0 };
            });

            editedReport.sessionData.forEach((s: any) => {
                const primary = s.therapistName;
                const secondary = s.bonesetterName;
                const pComm = Number(s.primaryCommission) || 0;
                const sComm = Number(s.secondaryCommission) || 0;
                const deduction = Number(s.deduction) || 0;

                if (primary && primary !== 'UNASSIGNED') {
                    if (!breakdownMap[primary]) {
                        const emp = employees.find(e => e.name === primary);
                        breakdownMap[primary] = { employeeId: emp?.id || Math.random().toString(36).substr(2, 9), count: 0, commission: 0, allowance: 0, attendance: null };
                    }
                    breakdownMap[primary].commission += pComm - deduction;
                    breakdownMap[primary].count += 1;
                }
                if (secondary && secondary !== 'NONE' && secondary !== '') {
                    if (!breakdownMap[secondary]) {
                        const emp = employees.find(e => e.name === secondary);
                        breakdownMap[secondary] = { employeeId: emp?.id || Math.random().toString(36).substr(2, 9), count: 0, commission: 0, allowance: 0, attendance: null };
                    }
                    breakdownMap[secondary].commission += sComm;
                }
            });

            const staffBreakdown = Object.entries(breakdownMap).map(([name, data]) => ({ name, ...data }));

            const { error } = await supabase
                .from(DB_TABLES.SALES_REPORTS)
                .update({
                    gross_sales: totals.gross,
                    total_staff_pay: totals.staffPay,
                    total_expenses: totals.expenses,
                    total_vault_provision: totals.vault,
                    net_roi: totals.net,
                    session_data: editedReport.sessionData,
                    expense_data: editedReport.expenseData,
                    vault_data: editedReport.vaultData,
                    staff_breakdown: staffBreakdown,
                })
                .eq(DB_COLUMNS.ID, report.id);

            if (error) throw error;
            playSound('success');
            onSave?.();
            onClose();
        } catch (err) {
            console.error(err);
            playSound('warning');
        } finally {
            setIsSaving(false);
        }
    };

    const addSession = () => {
        const newSession = {
            id: Math.random().toString(36).substr(2, 9),
            clientName: 'MANUAL ENTRY',
            therapistName: 'UNASSIGNED',
            serviceName: 'MANUAL SERVICE',
            total: 0,
            primaryCommission: 0,
            secondaryCommission: 0,
            timestamp: getTrueISOString()
        };
        setEditedReport(prev => ({
            ...prev,
            sessionData: [newSession, ...prev.sessionData]
        }));
    };

    const deleteSession = (id: string) => {
        setEditedReport(prev => ({
            ...prev,
            sessionData: prev.sessionData.filter(s => s.id !== id)
        }));
    };

    const updateSession = (id: string, field: string, value: any) => {
        setEditedReport(prev => ({
            ...prev,
            sessionData: prev.sessionData.map(s => s.id === id ? { ...s, [field]: value } : s)
        }));
    };

    const addExpense = () => {
        const newExpense = {
            id: Math.random().toString(36).substr(2, 9),
            name: 'MANUAL EXPENSE',
            amount: 0,
            category: 'OPERATIONAL',
            timestamp: getTrueISOString()
        };
        setEditedReport(prev => ({
            ...prev,
            expenseData: [newExpense, ...prev.expenseData]
        }));
    };

    const deleteExpense = (id: string) => {
        setEditedReport(prev => ({
            ...prev,
            expenseData: prev.expenseData.filter(e => e.id !== id)
        }));
    };

    const updateExpense = (id: string, field: string, value: any) => {
        setEditedReport(prev => ({
            ...prev,
            expenseData: prev.expenseData.map(e => e.id === id ? { ...e, [field]: value } : e)
        }));
    };

    const addVault = () => {
        const newVault = {
            id: Math.random().toString(36).substr(2, 9),
            name: 'VAULT PROVISION',
            amount: 0,
            timestamp: getTrueISOString()
        };
        setEditedReport(prev => ({
            ...prev,
            vaultData: [newVault, ...prev.vaultData]
        }));
    };

    const deleteVault = (id: string) => {
        setEditedReport(prev => ({
            ...prev,
            vaultData: prev.vaultData.filter(v => v.id !== id)
        }));
    };

    const updateVault = (id: string, field: string, value: any) => {
        setEditedReport(prev => ({
            ...prev,
            vaultData: prev.vaultData.map(v => v.id === id ? { ...v, [field]: value } : v)
        }));
    };

    return (
        <div className="fixed inset-0 z-[3000] bg-slate-950/60 backdrop-blur-xl flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-5xl shadow-xl flex flex-col animate-in zoom-in duration-300 overflow-hidden max-h-[90vh] border border-slate-100 print:h-auto print:max-h-none print:shadow-none print:bg-white print:border-none">
                {/* HEADER */}
                <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white text-xl shadow-lg">📝</div>
                        <div>
                            <h4 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none">Report Correction Hub</h4>
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-1">
                                {branch.name} • {new Date(report.reportDate).toLocaleDateString(undefined, { dateStyle: 'full' })}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-900 transition-all active:scale-90">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* KPI STRIP */}
                <div className="bg-slate-50 px-8 py-4 border-b border-slate-100 grid grid-cols-2 md:grid-cols-5 gap-4 shrink-0">
                    <div className="space-y-0.5">
                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Gross Yield</p>
                        <p className="text-lg font-black text-slate-900 tabular-nums">₱{totals.gross.toLocaleString()}</p>
                    </div>
                    <div className="space-y-0.5">
                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Staff Pay</p>
                        <p className="text-lg font-black text-amber-600 tabular-nums">₱{totals.staffPay.toLocaleString()}</p>
                    </div>
                    <div className="space-y-0.5">
                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Expenses</p>
                        <p className="text-lg font-black text-rose-500 tabular-nums">₱{totals.expenses.toLocaleString()}</p>
                    </div>
                    <div className="space-y-0.5">
                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Vault</p>
                        <p className="text-lg font-black text-indigo-700 tabular-nums">₱{totals.vault.toLocaleString()}</p>
                    </div>
                    <div className="space-y-0.5">
                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Net ROI</p>
                        <p className={`text-lg font-black tabular-nums ${totals.net >= 0 ? 'text-emerald-600' : 'text-rose-700'}`}>₱{totals.net.toLocaleString()}</p>
                    </div>
                </div>

                {/* TABS */}
                <div className="flex bg-white px-8 pt-4 gap-6 shrink-0">
                    {(['sessions', 'expenses', 'vault'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => { setActiveTab(tab); playSound('click'); }}
                            className={`pb-4 text-xs font-semibold uppercase tracking-wide transition-all relative ${activeTab === tab ? 'text-slate-900' : 'text-slate-300 hover:text-slate-500'}`}
                        >
                            {tab}
                            {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-900 rounded-full animate-in slide-in-from-bottom-1"></div>}
                        </button>
                    ))}
                </div>

                {/* CONTENT */}
                <div className="flex-1 overflow-y-auto p-8 space-y-4 no-scrollbar bg-slate-50/30">
                    <div className="flex justify-between items-center mb-4 no-print">
                        <h5 className="text-xs font-medium text-slate-400 uppercase tracking-wider">Registry Entries</h5>
                        {activeTab !== 'sessions' && (
                            <button
                                onClick={() => {
                                    playSound('click');
                                    if (activeTab === 'expenses') addExpense();
                                    else addVault();
                                }}
                                className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wide hover:bg-emerald-600 transition-all flex items-center gap-2"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M12 4v16m8-8H4" /></svg>
                                Add Entry
                            </button>
                        )}
                    </div>

                    <div className="space-y-3">
                        {activeTab === 'sessions' && editedReport.sessionData.map((s: any) => {
                            const services = s.serviceName.split('+').map((srv: string) => srv.trim());
                            const { isDualRequired, primaryRole, secondaryRole } = getSessionRequirements(s);

                            return (
                                <div key={s.id} className={`bg-white p-6 rounded-3xl border transition-all ${isDualRequired && (!s.bonesetterName || s.bonesetterName === 'NONE') ? 'border-amber-200 shadow-amber-50 shadow-lg' : 'border-slate-200 shadow-sm'} space-y-4`}>
                                    <div className="flex flex-col md:flex-row justify-between gap-6">
                                        {/* CLIENT & SERVICES (READ ONLY) */}
                                        <div className="flex-1 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-xs font-black">👤</div>
                                                    <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{s.clientName}</p>
                                                </div>
                                                {isDualRequired && (
                                                    <span className="bg-indigo-50 text-indigo-600 px-2 py-1 rounded-lg text-xs font-semibold uppercase tracking-wide border border-indigo-100">Dual Required</span>
                                                )}
                                            </div>
                                            <div className="pl-11 space-y-1.5">
                                                {services.map((srv: string, idx: number) => (
                                                    <div key={idx} className="flex items-center gap-2">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                                                        <p className="text-xs font-bold text-slate-600 uppercase tracking-tight">{srv}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* ASSIGNED EMPLOYEES (EDITABLE) */}
                                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <CustomEmployeeSelect
                                                label="Primary Provider"
                                                value={s.therapistName}
                                                options={branchEmployees}
                                                roleFilter={primaryRole}
                                                managerNames={[branch.manager, branch.tempManager]}
                                                onChange={val => updateSession(s.id, 'therapistName', val || 'UNASSIGNED')}
                                            />
                                            <CustomEmployeeSelect
                                                label="Secondary Provider"
                                                value={s.bonesetterName || ''}
                                                options={branchEmployees}
                                                roleFilter={secondaryRole}
                                                managerNames={[branch.manager, branch.tempManager]}
                                                disabled={!isDualRequired}
                                                placeholder={isDualRequired ? `SELECT ${secondaryRole}` : "NOT APPLICABLE"}
                                                onChange={val => updateSession(s.id, 'bonesetterName', val)}
                                            />
                                        </div>

                                        {/* FINANCIALS (RESTRICTED) */}
                                        <div className="flex-1 grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Total Paid</label>
                                                <div className="bg-slate-100 p-2.5 rounded-xl text-xs font-black text-slate-400 tabular-nums">
                                                    ₱{Number(s.total).toLocaleString()}
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-black text-rose-500 uppercase tracking-widest">Deduction</label>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-rose-400">₱</span>
                                                    <input
                                                        type="number"
                                                        value={s.deduction || 0}
                                                        onChange={e => updateSession(s.id, 'deduction', Number(e.target.value))}
                                                        className="w-full bg-rose-50 p-2.5 rounded-xl text-xs font-bold tabular-nums outline-none focus:bg-white border border-transparent focus:border-rose-200 text-rose-600"
                                                        placeholder="0"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {activeTab === 'expenses' && editedReport.expenseData.map((e: any) => (
                            <div key={e.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                                <input
                                    value={e.name}
                                    onChange={val => updateExpense(e.id, 'name', val.target.value.toUpperCase())}
                                    className="bg-slate-50 p-2 rounded-lg text-xs font-bold uppercase outline-none focus:bg-white border border-transparent focus:border-slate-200"
                                    placeholder="Expense Name"
                                />
                                <select
                                    value={e.category}
                                    onChange={val => updateExpense(e.id, 'category', val.target.value)}
                                    className="bg-slate-50 p-2 rounded-lg text-xs font-bold uppercase outline-none focus:bg-white border border-transparent focus:border-slate-200"
                                >
                                    <option value="OPERATIONAL">OPERATIONAL</option>
                                    <option value="PROVISION">PROVISION</option>
                                </select>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-400">₱</span>
                                    <input
                                        type="number"
                                        value={e.amount}
                                        onChange={val => updateExpense(e.id, 'amount', Number(val.target.value))}
                                        className="w-full bg-slate-50 p-2 rounded-lg text-xs font-bold tabular-nums outline-none focus:bg-white border border-transparent focus:border-slate-200"
                                        placeholder="Amount"
                                    />
                                </div>
                                <div className="flex justify-end">
                                    <button onClick={() => deleteExpense(e.id)} className="p-2 text-rose-300 hover:text-rose-600 transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                </div>
                            </div>
                        ))}

                        {activeTab === 'vault' && editedReport.vaultData.map((v: any) => (
                            <div key={v.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                                <input
                                    value={v.name}
                                    onChange={val => updateVault(v.id, 'name', val.target.value.toUpperCase())}
                                    className="bg-slate-50 p-2 rounded-lg text-xs font-bold uppercase outline-none focus:bg-white border border-transparent focus:border-slate-200"
                                    placeholder="Entry Name"
                                />
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-400">₱</span>
                                    <input
                                        type="number"
                                        value={v.amount}
                                        onChange={val => updateVault(v.id, 'amount', Number(val.target.value))}
                                        className="w-full bg-slate-50 p-2 rounded-lg text-xs font-bold tabular-nums outline-none focus:bg-white border border-transparent focus:border-slate-200"
                                        placeholder="Amount"
                                    />
                                </div>
                                <div className="flex justify-end">
                                    <button onClick={() => deleteVault(v.id)} className="p-2 text-rose-300 hover:text-rose-600 transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* FOOTER */}
                <div className="p-8 bg-slate-50 border-t border-slate-100 shrink-0 flex justify-end gap-4">
                    <button
                        onClick={onClose}
                        className="px-8 py-4 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-900 transition-all"
                    >
                        Discard Changes
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className={`${UI_THEME.styles.primaryButton} ${isSaving ? 'bg-slate-300' : 'bg-slate-900 text-white hover:bg-emerald-600 shadow-xl'} disabled:opacity-50`}
                    >
                        {isSaving ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : 'Commit Corrections'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const CustomEmployeeSelect: React.FC<{
    value: string;
    onChange: (val: string) => void;
    options: Employee[];
    label: string;
    placeholder?: string;
    roleFilter?: string;
    disabled?: boolean;
    managerNames?: (string | undefined)[];
}> = ({ value, onChange, options, label, placeholder = "UNASSIGNED", roleFilter, disabled, managerNames = [] }) => {
    const [isOpen, setIsOpen] = useState(false);

    const filteredOptions = useMemo(() => {
        if (!roleFilter) return options;
        return options.filter(emp => {
            const roles = (emp.role || '').split(',').map(r => r.trim().toUpperCase());
            const isRoleManager = roles.includes('MANAGER');
            const isDesignatedManager = managerNames.some(m => m?.toUpperCase() === emp.name?.toUpperCase());
            const isManager = isRoleManager || isDesignatedManager;

            return roles.includes(roleFilter.toUpperCase()) || isManager;
        });
    }, [options, roleFilter, managerNames]);

    return (
        <div className={`relative space-y-1.5 ${disabled ? 'opacity-50 grayscale' : ''}`}>
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</label>
            <div
                onClick={() => {
                    if (disabled) return;
                    setIsOpen(!isOpen);
                    playSound('click');
                }}
                className={`w-full bg-slate-50 p-2.5 rounded-xl text-xs font-bold uppercase border border-transparent transition-all flex justify-between items-center group ${disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:border-slate-200'}`}
            >
                <span className={value && value !== 'NONE' ? "text-slate-900" : "text-slate-400"}>{value || placeholder}</span>
                {!disabled && <svg className={`w-3 h-3 transition-transform text-slate-300 group-hover:text-slate-900 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>}
            </div>

            {isOpen && !disabled && (
                <>
                    <div className="fixed inset-0 z-[4000]" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-xl z-[4001] max-h-48 overflow-y-auto p-2 space-y-1 animate-in slide-in-from-top-2 duration-200 no-scrollbar">
                        <div
                            onClick={() => { onChange(''); setIsOpen(false); playSound('click'); }}
                            className="p-2.5 rounded-xl text-xs font-bold uppercase hover:bg-slate-50 cursor-pointer text-slate-400"
                        >
                            {placeholder}
                        </div>
                        {filteredOptions.map(emp => (
                            <div
                                key={emp.id}
                                onClick={() => { onChange(emp.name); setIsOpen(false); playSound('click'); }}
                                className={`p-2.5 rounded-xl text-xs font-bold uppercase cursor-pointer transition-colors ${value === emp.name ? 'bg-slate-900 text-white' : 'hover:bg-slate-50 text-slate-600'}`}
                            >
                                {emp.name}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};
