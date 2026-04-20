
import React, { useState, useMemo, useEffect } from 'react';
import { Branch, Employee, Transaction, Expense, Attendance, SalesReport } from '../../../types';
import { supabase } from '../../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';
import { playSound } from '../../../lib/audio';
import { getEmployeeAllowance } from '../../../lib/payroll';
import { toManilaDateStr } from '../../../lib/time';

interface BackfillRequestSectionProps {
  branch: Branch;
  employees: Employee[];
  transactions: Transaction[];
  expenses: Expense[];
  attendance: Attendance[];
  salesReports: SalesReport[];
  onRefresh?: () => void;
}

export const BackfillRequestSection: React.FC<BackfillRequestSectionProps> = ({
  branch,
  employees,
  transactions,
  expenses,
  attendance,
  salesReports,
  onRefresh
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }, []);

  const [formData, setFormData] = useState({ date: yesterday, grossSales: '', notes: '' });
  const [expenseItems, setExpenseItems] = useState<Expense[]>([]);
  const [provisionItems, setProvisionItems] = useState<Expense[]>([]);
  const [newExpenseName, setNewExpenseName] = useState('');
  const [newExpenseAmount, setNewExpenseAmount] = useState('');
  const [staffPayroll, setStaffPayroll] = useState<Record<string, { salary: string; commission: string; ot: string; late: string; allowance: string; cashAdvance: string; isHalfDay: boolean }>>({});

  const branchStaff = useMemo(() => {
    return employees.filter(e => {
      if (!e.isActive) return false;
      return e.branchId === branch.id || (e.role || '').toUpperCase().includes('MANAGER');
    });
  }, [employees, branch.id]);

  const depositAmount = Number(branch.dailyProvisionAmount) || 0;

  useEffect(() => {
    if (!formData.date) return;

    const existingReport = salesReports.find(r => r.branchId === branch.id && r.reportDate === formData.date);

    if (existingReport) {
      setFormData(prev => ({
        ...prev,
        grossSales: (existingReport.grossSales || 0).toString(),
        notes: existingReport.notes || prev.notes
      }));
      setExpenseItems(existingReport.expenseData || []);
      setProvisionItems(existingReport.vaultData || []);

      const payroll: Record<string, any> = {};
      existingReport.staffBreakdown?.forEach((b: any) => {
        payroll[b.employeeId] = {
          salary: (b.salary || 0).toString(),
          commission: (b.commission || 0).toString(),
          ot: (b.otPay || 0).toString(),
          late: (b.lateDeduction || 0).toString(),
          allowance: (b.allowance || 0).toString(),
          cashAdvance: (b.cashAdvance || 0).toString(),
          isHalfDay: !!b.isHalfDay
        };
      });
      setStaffPayroll(payroll);
      return;
    }

    const dayTxs = transactions.filter(t => t.branchId === branch.id && toManilaDateStr(t.timestamp) === formData.date);
    const dayExps = expenses.filter(e => e.branchId === branch.id && toManilaDateStr(e.timestamp) === formData.date);
    const dayAtt = attendance.filter(a => a.branchId === branch.id && a.date === formData.date);

    const gross = dayTxs.reduce((sum, t) => sum + (Number(t.total) || 0), 0);
    setFormData(prev => ({ ...prev, grossSales: gross > 0 ? gross.toString() : '', notes: '' }));
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
        salary: (emp.salary || 0).toString(),
        commission: commission.toString(),
        ot: (att?.otPay || 0).toString(),
        late: (att?.lateDeduction || 0).toString(),
        allowance: allowance.toString(),
        cashAdvance: '0',
        isHalfDay: !!att?.isHalfDay
      };
    });
    setStaffPayroll(payroll);
  }, [formData.date, branch.id, transactions, expenses, attendance, salesReports, branchStaff]);

  const handlePayrollChange = (empId: string, field: string, value: string) => {
    setStaffPayroll(prev => ({
      ...prev,
      [empId]: { ...(prev[empId] || { salary: '0', commission: '0', ot: '0', late: '0', allowance: '0', cashAdvance: '0', isHalfDay: false }), [field]: value }
    }));
  };

  const handleHalfDayToggle = (empId: string, emp: Employee) => {
    const baseAllowance = getEmployeeAllowance(emp, branch.id);
    setStaffPayroll(prev => {
      const current = prev[empId] || { salary: '0', commission: '0', ot: '0', late: '0', allowance: '0', cashAdvance: '0', isHalfDay: false };
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

  const totals = useMemo(() => {
    const gross = Number(formData.grossSales) || 0;
    const ops = expenseItems.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const bills = provisionItems.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const staffPay = Object.values(staffPayroll).reduce((sum: number, d: any) => {
      return sum + (Number(d.salary) || 0) + (Number(d.commission) || 0) + (Number(d.ot) || 0) + (Number(d.allowance) || 0) - (Number(d.late) || 0);
    }, 0);
    return { gross, ops, bills, staffPay, net: gross - ops - bills - staffPay };
  }, [formData.grossSales, expenseItems, provisionItems, staffPayroll]);

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
          expenseData: expenseItems,
          vaultData: provisionItems,
          staffBreakdown: Object.entries(staffPayroll).map(([empId, data]: [string, any]) => {
            const emp = employees.find(e => e.id === empId);
            return {
              employeeId: empId, name: emp?.name || 'Unknown',
              salary: Number(data.salary) || 0, commission: Number(data.commission) || 0,
              otPay: Number(data.ot) || 0, lateDeduction: Number(data.late) || 0,
              allowance: Number(data.allowance) || 0, cashAdvance: Number(data.cashAdvance) || 0,
              isHalfDay: !!data.isHalfDay
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
      setFormData({ date: new Date().toISOString().split('T')[0], grossSales: '', notes: '' });
      setExpenseItems([]);
      setProvisionItems([]);
      setStaffPayroll({});
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
    <div className="max-w-3xl mx-auto pb-20 space-y-3 animate-in fade-in duration-500">

      {/* Header */}
      <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm px-5 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center text-base shadow-inner shrink-0">📝</div>
          <div>
            <h2 className="text-[13px] font-black text-slate-900 uppercase tracking-tighter leading-none">Backfill Report</h2>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Submit historical data for approval</p>
          </div>
        </div>
        <div className="shrink-0">
          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Target Date</label>
          <input
            type="date"
            required
            max={yesterday}
            value={formData.date}
            onChange={e => setFormData({ ...formData, date: e.target.value })}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-[12px] font-black text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
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
          {expenseItems.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {expenseItems.map((item, idx) => (
                <div key={item.id || idx} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
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

        {/* Rent & Bills Deposit */}
        <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Rent & Bills Deposit</span>
            <div className="h-px flex-1 bg-slate-100"></div>
            {totals.bills > 0 && (
              <span className="text-[10px] font-black text-indigo-600 tabular-nums">₱{totals.bills.toLocaleString()}</span>
            )}
          </div>

          {/* Provision items list */}
          {provisionItems.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {provisionItems.map((item, idx) => (
                <div key={item.id || idx} className="flex items-center gap-2 bg-indigo-50 rounded-xl px-3 py-2 border border-indigo-100">
                  <span className="flex-1 text-[11px] font-bold text-indigo-700 uppercase truncate">{item.name}</span>
                  <span className="text-[11px] font-black text-indigo-700 tabular-nums shrink-0">₱{Number(item.amount).toLocaleString()}</span>
                  <button
                    type="button"
                    onClick={() => removeProvisionItem(idx)}
                    className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-400 hover:bg-indigo-200 hover:text-indigo-600 flex items-center justify-center text-[10px] font-black transition-colors shrink-0"
                  >×</button>
                </div>
              ))}
            </div>
          )}

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

          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden rounded-xl border border-slate-100">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-[8px] font-black text-slate-400 uppercase tracking-widest">Employee</th>
                  <th className="px-3 py-3 text-[8px] font-black text-slate-400 uppercase tracking-widest">Salary</th>
                  <th className="px-3 py-3 text-[8px] font-black text-slate-400 uppercase tracking-widest">Comm.</th>
                  <th className="px-3 py-3 text-[8px] font-black text-slate-400 uppercase tracking-widest">OT</th>
                  <th className="px-3 py-3 text-[8px] font-black text-slate-400 uppercase tracking-widest">Late</th>
                  <th className="px-3 py-3 text-[8px] font-black text-slate-400 uppercase tracking-widest">Allow.</th>
                  <th className="px-3 py-3 text-[8px] font-black text-rose-400 uppercase tracking-widest">Adv.</th>
                  <th className="px-3 py-3 text-[8px] font-black text-amber-500 uppercase tracking-widest text-center">½ Day</th>
                  <th className="px-4 py-3 text-[8px] font-black text-slate-400 uppercase tracking-widest text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {branchStaff.map(emp => {
                  const p = staffPayroll[emp.id] || { salary: '0', commission: '0', ot: '0', late: '0', allowance: '0', cashAdvance: '0' };
                  const total = (Number(p.salary) || 0) + (Number(p.commission) || 0) + (Number(p.ot) || 0) + (Number(p.allowance) || 0) - (Number(p.late) || 0);
                  return (
                    <tr key={emp.id} className={`hover:bg-slate-50/50 transition-colors ${staffPayroll[emp.id]?.isHalfDay ? 'bg-amber-50/40' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight leading-none">{emp.name}</p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{emp.role}</p>
                      </td>
                      {(['salary', 'commission', 'ot', 'late', 'allowance'] as const).map(field => (
                        <td key={field} className="px-2 py-2">
                          <input
                            type="number" placeholder="0"
                            className="w-[72px] bg-slate-100/60 border-none rounded-lg px-2.5 py-1.5 text-[11px] font-black focus:ring-2 focus:ring-amber-500 focus:outline-none"
                            value={staffPayroll[emp.id]?.[field] || ''}
                            onChange={e => handlePayrollChange(emp.id, field, e.target.value)}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-2">
                        <input
                          type="number" placeholder="0"
                          className="w-[72px] bg-rose-50 border-none rounded-lg px-2.5 py-1.5 text-[11px] font-black text-rose-600 focus:ring-2 focus:ring-rose-400 focus:outline-none"
                          value={staffPayroll[emp.id]?.cashAdvance || ''}
                          onChange={e => handlePayrollChange(emp.id, 'cashAdvance', e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleHalfDayToggle(emp.id, emp)}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center mx-auto transition-all active:scale-90 ${
                            staffPayroll[emp.id]?.isHalfDay
                              ? 'bg-amber-500 text-white shadow-sm'
                              : 'bg-slate-100 text-slate-300 hover:bg-amber-100 hover:text-amber-500'
                          }`}
                          title={staffPayroll[emp.id]?.isHalfDay ? 'Half-day (click to remove)' : 'Mark as half-day'}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 2a10 10 0 0 1 0 20V2z" fill="currentColor" stroke="none"/>
                          </svg>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-[11px] font-black text-slate-900 tabular-nums">₱{total.toLocaleString()}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {branchStaff.map(emp => {
              const p = staffPayroll[emp.id] || { salary: '0', commission: '0', ot: '0', late: '0', allowance: '0', cashAdvance: '0' };
              const total = (Number(p.salary) || 0) + (Number(p.commission) || 0) + (Number(p.ot) || 0) + (Number(p.allowance) || 0) - (Number(p.late) || 0);
              return (
                <div key={emp.id} className={`rounded-xl border overflow-hidden ${staffPayroll[emp.id]?.isHalfDay ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-inherit">
                    <div>
                      <p className="text-[12px] font-black text-slate-900 uppercase tracking-tight leading-none">{emp.name}</p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{emp.role}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleHalfDayToggle(emp.id, emp)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 ${
                          staffPayroll[emp.id]?.isHalfDay
                            ? 'bg-amber-500 text-white'
                            : 'bg-slate-200 text-slate-400 hover:bg-amber-100 hover:text-amber-600'
                        }`}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20V2z" fill="currentColor" stroke="none"/></svg>
                        ½ Day
                      </button>
                      <div className="text-right">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Total</p>
                        <p className="text-[13px] font-black text-emerald-600 tabular-nums">₱{total.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 p-3">
                    {[
                      { field: 'salary', label: 'Salary' },
                      { field: 'commission', label: 'Commission' },
                      { field: 'ot', label: 'Overtime' },
                      { field: 'late', label: 'Late' },
                      { field: 'allowance', label: 'Allowance' },
                    ].map(({ field, label }) => (
                      <div key={field} className="space-y-1">
                        <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label>
                        <input
                          type="number" placeholder="0"
                          className="w-full bg-white border-none rounded-lg px-2.5 py-2 text-[11px] font-black focus:ring-2 focus:ring-amber-500 focus:outline-none shadow-sm"
                          value={staffPayroll[emp.id]?.[field as keyof typeof p] || ''}
                          onChange={e => handlePayrollChange(emp.id, field, e.target.value)}
                        />
                      </div>
                    ))}
                    <div className="space-y-1">
                      <label className="text-[7px] font-black text-rose-400 uppercase tracking-widest ml-1">Advance</label>
                      <input
                        type="number" placeholder="0"
                        className="w-full bg-rose-50 border-none rounded-lg px-2.5 py-2 text-[11px] font-black text-rose-600 focus:ring-2 focus:ring-rose-400 focus:outline-none shadow-sm"
                        value={staffPayroll[emp.id]?.cashAdvance || ''}
                        onChange={e => handlePayrollChange(emp.id, 'cashAdvance', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ROI Summary + Notes + Submit */}
        <div className="bg-slate-900 rounded-[20px] p-5 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 blur-[80px] rounded-full -mr-16 -mt-16 pointer-events-none"></div>

          {/* ROI breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 relative z-10">
            <div>
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Gross</p>
              <p className="text-[13px] font-black text-white tabular-nums">₱{totals.gross.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[8px] font-black text-amber-500/70 uppercase tracking-widest mb-1">Payroll</p>
              <p className="text-[13px] font-black text-amber-400 tabular-nums">−₱{totals.staffPay.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[8px] font-black text-rose-500/70 uppercase tracking-widest mb-1">Expenses</p>
              <p className="text-[13px] font-black text-rose-400 tabular-nums">−₱{totals.ops.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[8px] font-black text-indigo-400/70 uppercase tracking-widest mb-1">Deposit</p>
              <p className="text-[13px] font-black text-indigo-300 tabular-nums">₱{totals.bills.toLocaleString()}</p>
            </div>
          </div>

          <div className="flex items-baseline gap-2 mb-5 relative z-10">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Projected ROI</span>
            <span className={`text-3xl font-black tracking-tighter tabular-nums ${totals.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
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
