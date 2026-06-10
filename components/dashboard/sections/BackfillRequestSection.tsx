
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Branch, BranchVault, Employee, Transaction, Expense, Attendance, SalesReport, VaultTransaction, Request } from '../../../types';
import { supabase } from '../../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';
import { playSound } from '../../../lib/audio';
import { getEmployeeAllowance } from '../../../lib/payroll';
import { toManilaDateStr, getTrueDate } from '../../../lib/time';

interface BackfillRequestSectionProps {
  branch: Branch;
  branchVault?: BranchVault | null;
  employees: Employee[];
  transactions: Transaction[];
  expenses: Expense[];
  attendance: Attendance[];
  salesReports: SalesReport[];
  vaultTransactions?: VaultTransaction[];
  requests?: Request[];
  onRefresh?: () => void;
}

export const BackfillRequestSection: React.FC<BackfillRequestSectionProps> = ({
  branch,
  branchVault,
  employees,
  transactions,
  expenses,
  attendance,
  salesReports,
  vaultTransactions = [],
  requests = [],
  onRefresh
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [extraStaff, setExtraStaff] = useState<Employee[]>([]);
  const [excludedStaffIds, setExcludedStaffIds] = useState<Set<string>>(new Set());
  const [personnelSearch, setPersonnelSearch] = useState('');
  const [isPersonnelOpen, setIsPersonnelOpen] = useState(false);
  const personnelDropdownRef = useRef<HTMLDivElement>(null);

  const yesterday = useMemo(() => {
    const manilaToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(getTrueDate());
    const d = new Date(manilaToday + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d);
  }, []);

  const [formData, setFormData] = useState({ date: yesterday, grossSales: '', notes: '' });
  const [expenseItems, setExpenseItems] = useState<Expense[]>([]);
  const [provisionItems, setProvisionItems] = useState<Expense[]>([]);
  const [newExpenseName, setNewExpenseName] = useState('');
  const [newExpenseAmount, setNewExpenseAmount] = useState('');
  const [staffPayroll, setStaffPayroll] = useState<Record<string, { commission: string; ot: string; late: string; allowance: string; cashAdvance: string; isHalfDay: boolean }>>({});

  const branchStaff = useMemo(() => {
    return employees.filter(e => {
      if (!e.isActive) return false;
      return e.branchId === branch.id || (e.role || '').toUpperCase().includes('MANAGER');
    });
  }, [employees, branch.id]);

  // Regular branch staff + relievers together in one list; relievers appear last
  const allStaff = useMemo(() => {
    const regular = branchStaff.filter(e => !extraStaff.some(r => r.id === e.id));
    return [...regular, ...extraStaff];
  }, [branchStaff, extraStaff]);

  const personnelResults = useMemo(() => {
    if (!personnelSearch.trim()) return [];
    const q = personnelSearch.toLowerCase();
    const existingIds = new Set(allStaff.map(e => e.id));
    return employees.filter(e => e.isActive && !existingIds.has(e.id) && e.name.toLowerCase().includes(q));
  }, [personnelSearch, employees, allStaff]);

  const handleAddStaff = (emp: Employee) => {
    setExtraStaff(prev => [...prev, emp]);
    // Initialize payroll fields — reliever pay flows to expenses automatically
    const baseAllowance = getEmployeeAllowance(emp, branch.id);
    setStaffPayroll(prev => ({
      ...prev,
      [emp.id]: { commission: '0', ot: '0', late: '0', allowance: baseAllowance.toString(), cashAdvance: '0', isHalfDay: false },
    }));
    setPersonnelSearch('');
    setIsPersonnelOpen(false);
  };

  const handleRemoveStaff = (empId: string) => {
    setExtraStaff(prev => prev.filter(e => e.id !== empId));
  };

  const depositAmount = Number(branch.dailyProvisionAmount) || 0;
  const [newVaultDepositAmount, setNewVaultDepositAmount] = useState('');

  // If vault_enabled is off, always use legacy mode regardless of start_date.
  const isLegacy = useMemo(() => {
    if (!branch.vaultEnabled) return true;
    const startDate = branchVault?.startDate ?? null;
    return !startDate || formData.date < startDate;
  }, [branch.vaultEnabled, branchVault?.startDate, formData.date]);

  useEffect(() => {
    setExcludedStaffIds(new Set());
    if (!formData.date) return;

    const existingReport = salesReports.find(r => r.branchId === branch.id && r.reportDate === formData.date);

    if (existingReport) {
      setFormData(prev => ({
        ...prev,
        grossSales: (existingReport.grossSales || 0).toString(),
        notes: existingReport.notes || prev.notes
      }));
      setExpenseItems(existingReport.expenseData || []);
      // Load vault deposits from vault_transactions (single source of truth)
      // For legacy branches, fall back to vaultData PROVISION entries
      const vaultDepositsFromTx = vaultTransactions
        .filter(t => t.branchId === branch.id && t.type === 'DEPOSIT' && toManilaDateStr(t.timestamp) === formData.date)
        .map(t => ({ id: t.id, branchId: branch.id, name: t.name ?? 'VAULT DEPOSIT', amount: t.amount, category: 'VAULT_DEPOSIT', timestamp: t.timestamp } as Expense));
      const legacyProvision = (existingReport.vaultData || []).filter((e: any) => e.category === 'PROVISION');
      setProvisionItems([...legacyProvision, ...vaultDepositsFromTx]);

      const payroll: Record<string, any> = {};
      const restoredRelievers: Employee[] = [];
      const branchStaffIds = new Set(branchStaff.map(e => e.id));

      // Detect relievers from expenseData (new format: RELIEVER PAYOUT: NAME)
      const relieverExpenseEntries = (existingReport.expenseData || []).filter((e: any) =>
        typeof e.name === 'string' && e.name.startsWith('RELIEVER PAYOUT:')
      );
      // Legacy: relievers stored as RELIEVER PAYOUT expenses (before staffBreakdown approach)
      relieverExpenseEntries.forEach((e: any) => {
        const empName = e.name.replace('RELIEVER PAYOUT: ', '').trim();
        const emp = employees.find(emp => emp.name.toUpperCase() === empName);
        if (emp && !restoredRelievers.some(r => r.id === emp.id)) {
          restoredRelievers.push(emp);
          if (!payroll[emp.id]) {
            payroll[emp.id] = { commission: '0', ot: '0', late: '0', allowance: (e.amount || 0).toString(), cashAdvance: '0', isHalfDay: false };
          }
        }
      });

      // Restore all staff from staffBreakdown — relievers get isReliever flag
      existingReport.staffBreakdown?.forEach((b: any) => {
        if (!b.employeeId) return;
        const att = b.attendance || {};
        const isActualReliever = b.isReliever || !branchStaffIds.has(b.employeeId);
        if (isActualReliever) {
          const emp = employees.find(e => e.id === b.employeeId);
          if (emp && !restoredRelievers.some(r => r.id === emp.id)) restoredRelievers.push(emp);
        }
        // Restore payroll fields for all staff (including relievers)
        payroll[b.employeeId] = {
          commission: (b.commission || 0).toString(),
          ot: (b.otPay ?? att.otPay ?? att.ot_pay ?? 0).toString(),
          late: (b.lateDeduction ?? att.lateDeduction ?? att.late_deduction ?? 0).toString(),
          allowance: (b.allowance || 0).toString(),
          cashAdvance: (b.cashAdvance ?? att.cashAdvance ?? att.cash_advance ?? 0).toString(),
          isHalfDay: !!(b.isHalfDay || att.isHalfDay || att.is_half_day)
        };
      });
      setExtraStaff(restoredRelievers);
      setStaffPayroll(payroll);
      return;
    }

    const dayTxs = transactions.filter(t => t.branchId === branch.id && toManilaDateStr(t.timestamp) === formData.date);
    const dayExps = expenses.filter(e => e.branchId === branch.id && toManilaDateStr(e.timestamp) === formData.date);
    const dayAtt = attendance.filter(a => a.branchId === branch.id && a.date === formData.date);

    const gross = dayTxs.reduce((sum, t) => sum + (Number(t.total) || 0), 0);
    setFormData(prev => ({ ...prev, grossSales: gross > 0 ? gross.toString() : '', notes: '' }));
    setExtraStaff([]);
    setExpenseItems(dayExps.filter(e => e.category === 'OPERATIONAL'));
    setProvisionItems(dayExps.filter(e => e.category === 'PROVISION'));

    const payroll: Record<string, any> = {};
    branchStaff.forEach(emp => {
      const empTxs = dayTxs.filter(t => t.therapistId === emp.id || t.bonesetterId === emp.id);
      const commission = empTxs.reduce((sum, t) => {
        if (t.therapistId === emp.id) return sum + (Number(t.primaryCommission) || 0);
        if (t.bonesetterId === emp.id) return sum + (Number(t.secondaryCommission) || 0);
        return sum;
      }, 0);
      const att = dayAtt.find(a => a.employeeId === emp.id);
      let allowance = getEmployeeAllowance(emp, branch.id);
      if (att?.isHalfDay) allowance /= 2;
      payroll[emp.id] = {
        commission: commission.toString(),
        ot: (att?.otPay || 0).toString(),
        late: (att?.lateDeduction || 0).toString(),
        allowance: allowance.toString(),
        cashAdvance: '0',
        isHalfDay: !!att?.isHalfDay
      };
    });
    setStaffPayroll(payroll);
  }, [formData.date, branch.id, transactions, expenses, attendance, salesReports, branchStaff, vaultTransactions]);

  const handlePayrollChange = (empId: string, field: string, value: string) => {
    setStaffPayroll(prev => ({
      ...prev,
      [empId]: { ...(prev[empId] || { commission: '0', ot: '0', late: '0', allowance: '0', cashAdvance: '0', isHalfDay: false }), [field]: value }
    }));
  };

  const handleHalfDayToggle = (empId: string, emp: Employee) => {
    const baseAllowance = getEmployeeAllowance(emp, branch.id);
    setStaffPayroll(prev => {
      const current = prev[empId] || { commission: '0', ot: '0', late: '0', allowance: '0', cashAdvance: '0', isHalfDay: false };
      const next = !current.isHalfDay;
      return {
        ...prev,
        [empId]: { ...current, isHalfDay: next, allowance: next ? (baseAllowance / 2).toString() : baseAllowance.toString() }
      };
    });
  };

  const addExpenseItem = () => {
    if (!newExpenseName.trim() || !newExpenseAmount) return;
    const id = Math.random().toString(36).substr(2, 9);
    setExpenseItems(prev => [...prev, {
      id, branchId: branch.id, name: newExpenseName.trim().toUpperCase(),
      amount: Number(newExpenseAmount), category: 'OPERATIONAL', timestamp: new Date().toISOString()
    } as Expense]);
    setNewExpenseName('');
    setNewExpenseAmount('');
    playSound('click');
  };

  const removeExpenseItem = (idx: number) => setExpenseItems(prev => prev.filter((_, i) => i !== idx));

  const addProvisionItem = () => {
    const id = Math.random().toString(36).substr(2, 9);
    setProvisionItems(prev => [...prev, {
      id, branchId: branch.id, name: 'DAILY R&B PROVISION',
      amount: depositAmount, category: 'PROVISION', timestamp: new Date().toISOString()
    } as Expense]);
    playSound('click');
  };

  const removeProvisionItem = (idx: number) => setProvisionItems(prev => prev.filter((_, i) => i !== idx));

  const addVaultDepositItem = () => {
    const amount = Number(newVaultDepositAmount);
    if (!amount || amount <= 0) return;
    const id = Math.random().toString(36).substr(2, 9);
    setProvisionItems(prev => [...prev, {
      id, branchId: branch.id, name: 'VAULT DEPOSIT',
      amount, category: 'VAULT_DEPOSIT', timestamp: `${formData.date}T12:00:00.000Z`
    } as Expense]);
    setNewVaultDepositAmount('');
    playSound('click');
  };

  const myRequests = useMemo(() => {
    return requests
      .filter(r => r.type === 'BACKFILL_REPORT' && r.branchId === branch.id)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);
  }, [requests, branch.id]);

  const totals = useMemo(() => {
    const gross = Number(formData.grossSales) || 0;
    const manualOps = expenseItems.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const bills = provisionItems.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    let staffPay = 0;
    let relieverPay = 0;
    Object.entries(staffPayroll).forEach(([empId, d]: [string, any]) => {
      const pay = (Number(d.commission) || 0) + (Number(d.ot) || 0) + (Number(d.allowance) || 0) - (Number(d.late) || 0);
      if (extraStaff.some(e => e.id === empId)) relieverPay += pay;
      else staffPay += pay;
    });
    const ops = manualOps + relieverPay;
    return { gross, ops, bills, staffPay, net: gross - ops - bills - staffPay };
  }, [formData.grossSales, expenseItems, provisionItems, staffPayroll, extraStaff]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const requestId = Math.random().toString(36).substr(2, 9);
      const requester = employees.find(emp => emp.branchId === branch.id);

      const requestPayload = {
        [DB_COLUMNS.ID]: requestId,
        [DB_COLUMNS.BRANCH_ID]: branch.id,
        [DB_COLUMNS.TIMESTAMP]: new Date().toISOString(),
        [DB_COLUMNS.TYPE]: 'BACKFILL_REPORT',
        [DB_COLUMNS.STATUS]: 'PENDING',
        [DB_COLUMNS.DATA]: {
          reportDate: formData.date,
          grossSales: totals.gross,
          totalExpenses: totals.ops,
          totalVaultProvision: totals.bills,
          expenseData: [
            // Reliever pay goes into both staffBreakdown (isReliever:true) AND expenseData
            ...extraStaff.map(emp => {
              const p = staffPayroll[emp.id];
              const pay = p ? Math.max(0, (Number(p.commission) || 0) + (Number(p.ot) || 0) + (Number(p.allowance) || 0) - (Number(p.late) || 0)) : 0;
              return { id: `reliever_${emp.id}`, branchId: branch.id, name: `RELIEVER PAYOUT: ${emp.name.toUpperCase()}`, amount: pay, category: 'OPERATIONAL', timestamp: new Date().toISOString() };
            }),
            ...expenseItems,
          ],
          vaultData: provisionItems.filter((e: any) => e.category === 'PROVISION'),
          vaultDeposits: provisionItems.filter((e: any) => e.category === 'VAULT_DEPOSIT'),
          staffBreakdown: Object.entries(staffPayroll)
            .map(([empId, data]: [string, any]) => {
              const emp = employees.find(e => e.id === empId);
              const isReliever = extraStaff.some(e => e.id === empId);
              return {
                employeeId: empId, name: emp?.name || 'Unknown',
                salary: 0, commission: Number(data.commission) || 0,
                allowance: Number(data.allowance) || 0, isHalfDay: !!data.isHalfDay, isReliever,
                attendance: {
                  otPay: Number(data.ot) || 0,
                  lateDeduction: Number(data.late) || 0,
                  cashAdvance: Number(data.cashAdvance) || 0,
                  isHalfDay: !!data.isHalfDay,
                }
              };
            }),
          notes: formData.notes
        },
        [DB_COLUMNS.REQUESTER_ID]: requester?.id || 'MANAGER',
        [DB_COLUMNS.REQUESTER_NAME]: requester?.name || 'Manager'
      };

      const { error } = await supabase.from(DB_TABLES.REQUESTS).insert(requestPayload);
      if (error) throw error;

      playSound('success');
      alert('Backfill request submitted for approval.');
      setFormData({ date: yesterday, grossSales: '', notes: '' });
      setExpenseItems([]);
      setProvisionItems([]);
      setStaffPayroll({});
      setExtraStaff([]);
      setExcludedStaffIds(new Set());
      onRefresh?.();
    } catch (err) {
      console.error(err);
      playSound('warning');
      alert('Submission failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto pb-20 space-y-3">

      {/* Submission History */}
      {myRequests.length > 0 && (
        <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Submission History</span>
            <div className="h-px flex-1 bg-slate-100" />
          </div>
          <div className="space-y-2">
            {myRequests.map(req => {
              const statusStyle = req.status === 'APPROVED'
                ? 'bg-emerald-100 text-emerald-700'
                : req.status === 'REJECTED'
                ? 'bg-rose-100 text-rose-600'
                : 'bg-amber-100 text-amber-700';
              const statusLabel = req.status === 'APPROVED' ? 'Approved' : req.status === 'REJECTED' ? 'Rejected' : 'Pending';
              return (
                <div key={req.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${statusStyle}`}>{statusLabel}</span>
                      <span className="text-[9px] font-bold text-slate-500">{req.data?.reportDate}</span>
                    </div>
                    {req.reviewNote && (
                      <p className="text-[10px] font-medium text-slate-600 italic mt-1">"{req.reviewNote}"</p>
                    )}
                  </div>
                  <span className="text-[8px] font-bold text-slate-400 shrink-0 tabular-nums">{new Date(req.timestamp).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm px-5 py-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center text-base shadow-inner shrink-0">📝</div>
          <div>
            <h2 className="text-[13px] font-black text-slate-900 uppercase tracking-tighter leading-none">Backfill Report</h2>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Submit historical data for approval</p>
          </div>
        </div>
        <div className="border-t border-slate-100 pt-3">
          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Target Date</label>
          <input
            type="date"
            required
            max={yesterday}
            value={formData.date}
            onChange={e => setFormData({ ...formData, date: e.target.value })}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[13px] font-black text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
          />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">

        {/* Gross Sales */}
        <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Gross Sales</span>
            <div className="h-px flex-1 bg-slate-100"></div>
            <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Revenue</span>
          </div>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black text-sm">₱</span>
            <input
              type="number"
              required
              placeholder="0"
              value={formData.grossSales}
              onChange={e => setFormData({ ...formData, grossSales: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-4 py-3 text-[15px] font-black text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all"
            />
          </div>
        </div>

        {/* Operational Expenses */}
        <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Operational Expenses</span>
            <div className="h-px flex-1 bg-slate-100"></div>
            {totals.ops > 0 && (
              <span className="text-[10px] font-black text-rose-500 tabular-nums">−₱{totals.ops.toLocaleString()}</span>
            )}
          </div>

          {/* Expense items list */}
          {(expenseItems.length > 0 || extraStaff.length > 0) && (
            <div className="mb-3 space-y-1.5">
              {/* Auto reliever entries — derived live from payroll table */}
              {extraStaff.map(emp => {
                const p = staffPayroll[emp.id];
                const pay = p ? Math.max(0, (Number(p.commission) || 0) + (Number(p.ot) || 0) + (Number(p.allowance) || 0) - (Number(p.late) || 0)) : 0;
                return (
                  <div key={`rel_${emp.id}`} className="flex items-center gap-2 rounded-xl px-3 py-2 border bg-violet-50 border-violet-100">
                    <span className="text-[7px] font-black text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded uppercase tracking-widest shrink-0">Reliever</span>
                    <span className="flex-1 text-[11px] font-bold text-violet-700 uppercase truncate">RELIEVER PAYOUT: {emp.name.toUpperCase()}</span>
                    <span className="text-[11px] font-black text-rose-500 tabular-nums shrink-0">₱{pay.toLocaleString()}</span>
                    <span className="text-[8px] font-bold text-violet-400 shrink-0 italic">auto</span>
                  </div>
                );
              })}
              {/* Manual expense entries */}
              {expenseItems.map((item, idx) => (
                <div key={item.id || idx} className="flex items-center gap-2 rounded-xl px-3 py-2 border bg-slate-50 border-slate-100">
                  <span className="flex-1 text-[11px] font-bold text-slate-700 uppercase truncate">{item.name}</span>
                  <span className="text-[11px] font-black text-rose-500 tabular-nums shrink-0">₱{Number(item.amount).toLocaleString()}</span>
                  <button
                    type="button"
                    onClick={() => removeExpenseItem(idx)}
                    className="w-5 h-5 rounded-full bg-rose-50 text-rose-400 hover:bg-rose-100 hover:text-rose-600 flex items-center justify-center text-[10px] font-black transition-colors shrink-0"
                  >×</button>
                </div>
              ))}
            </div>
          )}

          {/* Add expense row */}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder="Expense name..."
              value={newExpenseName}
              onChange={e => setNewExpenseName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExpenseItem(); } }}
              className="w-full sm:flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[11px] font-bold text-slate-900 placeholder:text-slate-300 focus:ring-2 focus:ring-rose-400 focus:outline-none transition-all"
            />
            <div className="flex gap-2">
            <div className="relative flex-1 sm:w-28 sm:flex-none">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-black">₱</span>
              <input
                type="number"
                placeholder="0"
                value={newExpenseAmount}
                onChange={e => setNewExpenseAmount(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExpenseItem(); } }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-6 pr-3 py-2.5 text-[11px] font-black text-slate-900 placeholder:text-slate-300 focus:ring-2 focus:ring-rose-400 focus:outline-none transition-all"
              />
            </div>
            <button
              type="button"
              onClick={addExpenseItem}
              disabled={!newExpenseName.trim() || !newExpenseAmount}
              className="px-3 py-2.5 bg-rose-500 text-white rounded-xl text-[11px] font-black hover:bg-rose-600 active:scale-95 transition-all disabled:opacity-30 shrink-0"
            >Add</button>
            </div>
          </div>
          {expenseItems.length === 0 && (
            <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mt-2 ml-1">No expenses added yet</p>
          )}
        </div>

        {/* Rent & Bills Deposit (legacy) / Vault Deposit (vault-era) */}
        <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              {isLegacy ? 'Rent & Bills Deposit' : 'Vault Deposit'}
            </span>
            <div className="h-px flex-1 bg-slate-100"></div>
            {totals.bills > 0 && (
              <span className={`text-[10px] font-black tabular-nums ${isLegacy ? 'text-indigo-600' : 'text-emerald-600'}`}>
                ₱{totals.bills.toLocaleString()}
              </span>
            )}
          </div>

          {provisionItems.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {provisionItems.map((item, idx) => (
                <div key={item.id || idx} className={`flex items-center gap-2 rounded-xl px-3 py-2 border ${isLegacy ? 'bg-indigo-50 border-indigo-100' : 'bg-emerald-50 border-emerald-100'}`}>
                  <span className={`flex-1 text-[11px] font-bold uppercase truncate ${isLegacy ? 'text-indigo-700' : 'text-emerald-700'}`}>{item.name}</span>
                  <span className={`text-[11px] font-black tabular-nums shrink-0 ${isLegacy ? 'text-indigo-700' : 'text-emerald-700'}`}>₱{Number(item.amount).toLocaleString()}</span>
                  <button
                    type="button"
                    onClick={() => removeProvisionItem(idx)}
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black transition-colors shrink-0 ${isLegacy ? 'bg-indigo-100 text-indigo-400 hover:bg-indigo-200 hover:text-indigo-600' : 'bg-emerald-100 text-emerald-400 hover:bg-emerald-200 hover:text-emerald-600'}`}
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
                disabled={depositAmount <= 0}
                className="flex items-center gap-2.5 px-4 py-2.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl hover:bg-indigo-100 active:scale-95 transition-all disabled:opacity-40 group"
              >
                <span className="text-[11px] font-black uppercase tracking-widest">+ Add Deposit</span>
                {depositAmount > 0 && (
                  <span className="px-2 py-0.5 bg-indigo-600 text-white rounded-lg text-[10px] font-black tabular-nums">
                    ₱{depositAmount.toLocaleString()}
                  </span>
                )}
              </button>
              {depositAmount <= 0 && (
                <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mt-2 ml-1">No deposit amount configured for this branch</p>
              )}
            </>
          ) : (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-black">₱</span>
                <input
                  type="number"
                  placeholder="0"
                  value={newVaultDepositAmount}
                  onChange={e => setNewVaultDepositAmount(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVaultDepositItem(); } }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-6 pr-3 py-2.5 text-[11px] font-black text-slate-900 placeholder:text-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all"
                />
              </div>
              <button
                type="button"
                onClick={addVaultDepositItem}
                disabled={!newVaultDepositAmount || Number(newVaultDepositAmount) <= 0}
                className="px-3 py-2.5 bg-emerald-600 text-white rounded-xl text-[11px] font-black hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-30 shrink-0"
              >Add</button>
            </div>
          )}
        </div>

        {/* Staff Payroll */}
        <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm px-5 py-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Staff Payroll</span>
            <div className="h-px flex-1 bg-slate-100"></div>
            {totals.staffPay > 0 && (
              <span className="text-[10px] font-black text-amber-600 tabular-nums">−₱{totals.staffPay.toLocaleString()}</span>
            )}
          </div>

          {/* Reliever search */}
          <div className="mb-4 relative" ref={personnelDropdownRef}>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                <input
                  type="text"
                  placeholder="Search & add reliever — pay auto-added to expenses..."
                  value={personnelSearch}
                  onChange={e => { setPersonnelSearch(e.target.value); setIsPersonnelOpen(true); }}
                  onFocus={() => setIsPersonnelOpen(true)}
                  onBlur={() => setTimeout(() => setIsPersonnelOpen(false), 150)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2.5 text-[11px] font-bold text-slate-900 placeholder:text-slate-300 focus:ring-2 focus:ring-violet-400 focus:outline-none transition-all"
                />
              </div>
            </div>
            {isPersonnelOpen && personnelResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden max-h-48 overflow-y-auto no-scrollbar">
                {personnelResults.map(emp => (
                  <button
                    key={emp.id}
                    type="button"
                    onMouseDown={() => handleAddStaff(emp)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-violet-50 transition-colors text-left"
                  >
                    <div className="w-7 h-7 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center text-[10px] font-black shrink-0">{emp.name[0]}</div>
                    <div>
                      <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight leading-none">{emp.name}</p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{emp.role} · {emp.branchId}</p>
                    </div>
                    <span className="ml-auto text-[8px] font-black text-violet-600 bg-violet-50 px-2 py-0.5 rounded-lg uppercase tracking-widest">RELIEVER</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Unified staff cards — works on all screen sizes */}
          <div className="space-y-3">
            {allStaff.filter(e => !excludedStaffIds.has(e.id)).map(emp => {
              const isReliever = extraStaff.some(e => e.id === emp.id);
              const p = staffPayroll[emp.id] || { commission: '0', ot: '0', late: '0', allowance: '0', cashAdvance: '0', isHalfDay: false };
              const total = (Number(p.commission) || 0) + (Number(p.ot) || 0) + (Number(p.allowance) || 0) - (Number(p.late) || 0);
              const isHalfDay = !!staffPayroll[emp.id]?.isHalfDay;
              return (
                <div key={emp.id} className={`rounded-2xl border overflow-hidden shadow-sm ${isReliever ? 'bg-violet-50 border-violet-200' : isHalfDay ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
                  {/* Card header */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-inherit">
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-black text-slate-900 uppercase tracking-tight leading-tight">{emp.name}</p>
                      {isReliever
                        ? <span className="text-[7px] font-black text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded uppercase tracking-widest">Reliever · pay → expenses</span>
                        : <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{emp.role}</p>
                      }
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none">Net Pay</p>
                      <p className={`text-[14px] font-black tabular-nums leading-tight ${isReliever ? 'text-violet-700' : total >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>₱{total.toLocaleString()}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => isReliever ? handleRemoveStaff(emp.id) : setExcludedStaffIds(prev => new Set([...prev, emp.id]))}
                      className="w-7 h-7 rounded-full bg-rose-50 text-rose-400 hover:bg-rose-100 hover:text-rose-600 flex items-center justify-center text-[12px] font-black transition-colors shrink-0"
                    >×</button>
                  </div>

                  {/* Fields grid: Comm. | OT | Late on top; Allow. | Advance below */}
                  <div className="p-3 space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { field: 'commission', label: 'Commission' },
                        { field: 'ot', label: 'OT Pay' },
                        { field: 'late', label: 'Late Deduct.', isDeduction: true },
                      ].map(({ field, label, isDeduction }) => (
                        <div key={field} className="space-y-1">
                          <label className={`text-[7px] font-black uppercase tracking-widest ml-0.5 ${isDeduction ? 'text-rose-400' : 'text-slate-400'}`}>{label}</label>
                          <div className="relative">
                            <span className={`absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-black ${isDeduction ? 'text-rose-400' : 'text-slate-400'}`}>₱</span>
                            <input
                              type="number" placeholder="0"
                              className={`w-full border-none rounded-lg pl-5 pr-2 py-2 text-[11px] font-black focus:ring-2 focus:outline-none ${isDeduction ? 'bg-rose-50 text-rose-600 focus:ring-rose-400' : 'bg-slate-100/60 text-slate-900 focus:ring-amber-500'}`}
                              value={staffPayroll[emp.id]?.[field as keyof typeof p] ?? ''}
                              onChange={e => handlePayrollChange(emp.id, field, e.target.value)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { field: 'allowance', label: 'Allowance' },
                        { field: 'cashAdvance', label: 'Cash Advance', isDeduction: true },
                      ].map(({ field, label, isDeduction }) => (
                        <div key={field} className="space-y-1">
                          <label className={`text-[7px] font-black uppercase tracking-widest ml-0.5 ${isDeduction ? 'text-rose-400' : 'text-slate-400'}`}>{label}</label>
                          <div className="relative">
                            <span className={`absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-black ${isDeduction ? 'text-rose-400' : 'text-slate-400'}`}>₱</span>
                            <input
                              type="number" placeholder="0"
                              className={`w-full border-none rounded-lg pl-5 pr-2 py-2 text-[11px] font-black focus:ring-2 focus:outline-none ${isDeduction ? 'bg-rose-50 text-rose-600 focus:ring-rose-400' : 'bg-slate-100/60 text-slate-900 focus:ring-amber-500'}`}
                              value={staffPayroll[emp.id]?.[field as keyof typeof p] ?? ''}
                              onChange={e => handlePayrollChange(emp.id, field, e.target.value)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ½ Day toggle */}
                  <button
                    type="button"
                    onClick={() => handleHalfDayToggle(emp.id, emp)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 border-t transition-all active:scale-[0.99] ${
                      isHalfDay
                        ? 'bg-amber-500 border-amber-400 text-white'
                        : 'bg-white/60 border-slate-100 text-slate-400 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20V2z" fill="currentColor" stroke="none"/></svg>
                      <span className="text-[9px] font-black uppercase tracking-widest">Half Day</span>
                    </div>
                    <span className={`text-[8px] font-black uppercase tracking-widest ${isHalfDay ? 'text-white/80' : 'text-slate-300'}`}>
                      {isHalfDay ? 'On — allowance halved' : 'Tap to mark'}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ROI Summary + Notes + Submit */}
        <div className="bg-slate-900 rounded-[20px] p-4 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 blur-[80px] rounded-full -mr-16 -mt-16 pointer-events-none"></div>

          {/* KPI strip — 4 items in one row */}
          <div className="grid grid-cols-4 gap-px bg-white/5 rounded-xl overflow-hidden mb-4 relative z-10">
            <div className="bg-slate-800/60 px-2.5 py-2.5">
              <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Gross</p>
              <p className="text-[12px] font-black text-white tabular-nums leading-none">₱{totals.gross.toLocaleString()}</p>
            </div>
            <div className="bg-slate-800/60 px-2.5 py-2.5">
              <p className="text-[7px] font-black text-amber-500/60 uppercase tracking-widest leading-none mb-1">Staff Pay</p>
              <p className="text-[12px] font-black text-amber-400 tabular-nums leading-none">−₱{totals.staffPay.toLocaleString()}</p>
            </div>
            <div className="bg-slate-800/60 px-2.5 py-2.5">
              <p className="text-[7px] font-black text-rose-500/60 uppercase tracking-widest leading-none mb-1">Expenses</p>
              <p className="text-[12px] font-black text-rose-400 tabular-nums leading-none">−₱{totals.ops.toLocaleString()}</p>
            </div>
            <div className="bg-slate-800/60 px-2.5 py-2.5">
              <p className="text-[7px] font-black text-indigo-400/60 uppercase tracking-widest leading-none mb-1">Deposit</p>
              <p className="text-[12px] font-black text-indigo-300 tabular-nums leading-none">₱{totals.bills.toLocaleString()}</p>
            </div>
          </div>

          {/* Projected ROI */}
          <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl mb-4 relative z-10 ${totals.net >= 0 ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-rose-500/10 border border-rose-500/20'}`}>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Projected ROI</span>
            <span className={`text-xl font-black tracking-tighter tabular-nums ${totals.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totals.net < 0 ? '−' : ''}₱{Math.abs(totals.net).toLocaleString()}
            </span>
          </div>

          <div className="space-y-3 relative z-10">
            <div className="space-y-1">
              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">Reason / Notes</label>
              <textarea
                required
                rows={2}
                placeholder="Explain why this backfill is needed..."
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[12px] font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all resize-none text-white placeholder:text-slate-600"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-emerald-600 text-white font-black py-4 rounded-xl text-[12px] uppercase tracking-[0.2em] shadow-lg hover:bg-emerald-500 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
            >
              {isSubmitting
                ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                : 'Submit for Approval'}
            </button>
          </div>
        </div>

      </form>
    </div>
  );
};
