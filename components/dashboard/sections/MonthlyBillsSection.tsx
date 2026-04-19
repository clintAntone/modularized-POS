import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Branch, Expense, SalesReport, BranchBill, BillPayment, BillStatus, VaultCarryover } from '../../../types';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';
import { supabase } from '../../../lib/supabase';
import { playSound } from '../../../lib/audio';
import { compressImage } from '../../../lib/image';
import { UI_THEME } from '../../../constants/ui_designs';
import { Plus, AlertTriangle, CheckCircle, Clock, Calendar, Trash2, Edit2, X, ChevronRight } from 'lucide-react';

interface MonthlyBillsSectionProps {
  user?: any;
  branch: Branch;
  expenses: Expense[];
  salesReports: SalesReport[];
  isClosedMode?: boolean;
  onRefresh?: () => void;
}

interface Toast {
  message: string;
  type: 'success' | 'error';
}

const MONTHS = [
  { val: '01', label: 'January' }, { val: '02', label: 'February' }, { val: '03', label: 'March' },
  { val: '04', label: 'April' }, { val: '05', label: 'May' }, { val: '06', label: 'June' },
  { val: '07', label: 'July' }, { val: '08', label: 'August' }, { val: '09', label: 'September' },
  { val: '10', label: 'October' }, { val: '11', label: 'November' }, { val: '12', label: 'December' }
];

function getManilaDateParts() {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = fmt.formatToParts(new Date());
  const year = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  const day = parseInt(parts.find(p => p.type === 'day')!.value, 10);
  return { year, month, day, period: `${year}-${month}` };
}

const STATUS_CONFIG: Record<BillStatus, { label: string; bg: string; text: string; dot: string }> = {
  PAID:     { label: 'PAID',      bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  OVERDUE:  { label: 'OVERDUE',   bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-500' },
  DUE_SOON: { label: 'DUE SOON',  bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  UPCOMING: { label: 'UPCOMING',  bg: 'bg-slate-100',  text: 'text-slate-500',   dot: 'bg-slate-400' },
  AS_NEEDED: { label: 'AS NEEDED', bg: 'bg-indigo-50', text: 'text-indigo-700',  dot: 'bg-indigo-400' },
};

export const MonthlyBillsSection: React.FC<MonthlyBillsSectionProps> = ({
  user, branch, expenses, salesReports, isClosedMode = false, onRefresh
}) => {
  const queryClient = useQueryClient();
  const { period: currentPeriod, day: manilaDay, year: manilaYear, month: manilaMonth } = getManilaDateParts();

  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod);
  const [payingBill, setPayingBill] = useState<BranchBill | null>(null);
  const [editingBill, setEditingBill] = useState<BranchBill | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [deletingBill, setDeletingBill] = useState<BranchBill | null>(null);

  const [payForm, setPayForm] = useState({ amountPaid: '', notes: '', periodCovered: currentPeriod });
  const [payFile, setPayFile] = useState<File | null>(null);

  const [billForm, setBillForm] = useState({
    name: '', category: 'MONTHLY' as 'MONTHLY' | 'AS_NEEDED', amount: '', dueDay: '', dueNextMonth: false, notes: ''
  });

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => setToast({ message, type });

  // ── Queries ──────────────────────────────────────────────
  const { data: branchBills = [], refetch: refetchBills } = useQuery<BranchBill[]>({
    queryKey: [DB_TABLES.BRANCH_BILLS, branch.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(DB_TABLES.BRANCH_BILLS)
        .select('*')
        .eq(DB_COLUMNS.BRANCH_ID, branch.id)
        .eq(DB_COLUMNS.IS_ACTIVE, true)
        .order(DB_COLUMNS.CREATED_AT, { ascending: true });
      if (error) throw error;
      return data.map(r => ({
        id: r.id, branchId: r.branch_id,
        catalogId: r.catalog_id ?? undefined,
        name: r.name,
        category: r.category as 'MONTHLY' | 'AS_NEEDED',
        amount: Number(r.amount || 0), dueDay: r.due_day ?? undefined,
        dueNextMonth: r.due_next_month ?? false,
        isActive: r.is_active, notes: r.notes ?? undefined, createdAt: r.created_at
      }));
    }
  });

  const { data: vaultCarryover = [] } = useQuery<VaultCarryover[]>({
    queryKey: [DB_TABLES.VAULT_CARRYOVER, branch.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(DB_TABLES.VAULT_CARRYOVER)
        .select('*')
        .eq(DB_COLUMNS.BRANCH_ID, branch.id)
        .order(DB_COLUMNS.EFFECTIVE_DATE, { ascending: false });
      if (error) throw error;
      return data.map(r => ({
        id: r.id, branchId: r.branch_id, amount: Number(r.amount || 0),
        effectiveDate: r.effective_date, notes: r.notes ?? undefined,
        recordedBy: r.recorded_by ?? undefined, createdAt: r.created_at
      }));
    }
  });

  const { data: billPayments = [], refetch: refetchPayments } = useQuery<BillPayment[]>({
    queryKey: [DB_TABLES.BILL_PAYMENTS, branch.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(DB_TABLES.BILL_PAYMENTS)
        .select('*')
        .eq(DB_COLUMNS.BRANCH_ID, branch.id)
        .order(DB_COLUMNS.PAID_AT, { ascending: false })
        .limit(500);
      if (error) throw error;
      return data.map(r => ({
        id: r.id, branchId: r.branch_id, billId: r.bill_id,
        periodCovered: r.period_covered, amountPaid: Number(r.amount_paid || 0),
        paidAt: r.paid_at, notes: r.notes ?? undefined,
        receiptImage: r.receipt_image ?? undefined, recordedBy: r.recorded_by ?? undefined,
        createdAt: r.created_at
      }));
    }
  });

  // ── Vault balance ─────────────────────────────────────────
  const { vaultBalance, carryoverTotal, baseVaultMovement } = useMemo(() => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

    const historicalItems = salesReports
      .filter(r => r.branchId === branch.id && r.reportDate !== today)
      .flatMap(r => r.vaultData || []);

    const liveItems = expenses.filter(e =>
      e.branchId === branch.id &&
      e.timestamp.startsWith(today) &&
      (e.category === 'PROVISION' || e.category === 'SETTLEMENT')
    );

    const movementMap = new Map<string, any>();
    [...liveItems, ...historicalItems].forEach(item => {
      if (!movementMap.has(item.id)) movementMap.set(item.id, item);
    });

    const baseVaultMovement = Array.from(movementMap.values()).reduce((acc, e) => {
      if (e.category === 'PROVISION') return acc + Number(e.amount || 0);
      if (e.category === 'SETTLEMENT') return acc - Number(e.amount || 0);
      return acc;
    }, 0);

    const carryoverTotal = vaultCarryover.reduce((s, c) => s + c.amount, 0);
    const totalPaid = billPayments.reduce((sum, p) => sum + p.amountPaid, 0);

    return {
      vaultBalance: carryoverTotal + baseVaultMovement - totalPaid,
      carryoverTotal,
      baseVaultMovement,
    };
  }, [expenses, salesReports, billPayments, vaultCarryover, branch.id]);

  // ── Bill status ───────────────────────────────────────────
  const getBillStatus = (bill: BranchBill, period: string): BillStatus => {
    const isPaid = billPayments.some(p => p.billId === bill.id && p.periodCovered === period);
    if (isPaid) return 'PAID';
    if (bill.category === 'AS_NEEDED') return 'AS_NEEDED';
    if (!bill.dueDay) return 'UPCOMING';

    const [pYear, pMonth] = period.split('-').map(Number);
    const todayYear = parseInt(manilaYear, 10);
    const todayMonth = parseInt(manilaMonth, 10);

    // Compute the actual due date — either within the period month, or the 1st of the next month
    let dueYear = pYear;
    let dueMonth = pMonth;
    if (bill.dueNextMonth) {
      if (pMonth === 12) { dueYear = pYear + 1; dueMonth = 1; }
      else { dueMonth = pMonth + 1; }
    }

    // Period is in the past (relative to the due month)
    if (dueYear < todayYear || (dueYear === todayYear && dueMonth < todayMonth)) return 'OVERDUE';
    // Period is in the future (relative to the due month)
    if (dueYear > todayYear || (dueYear === todayYear && dueMonth > todayMonth)) return 'UPCOMING';

    // Due month is the current month — compare day
    const daysLeft = bill.dueDay - manilaDay;
    if (daysLeft < 0) return 'OVERDUE';
    if (daysLeft <= 5) return 'DUE_SOON';
    return 'UPCOMING';
  };

  const billsWithStatus = useMemo(() =>
    branchBills.map(bill => ({ bill, status: getBillStatus(bill, selectedPeriod) })),
    [branchBills, billPayments, selectedPeriod, manilaDay, manilaMonth, manilaYear]
  );

  const currentPayments = useMemo(() =>
    billPayments.filter(p => p.periodCovered === selectedPeriod),
    [billPayments, selectedPeriod]
  );

  const totalPaidThisPeriod = currentPayments.reduce((s, p) => s + p.amountPaid, 0);

  // ── Period options ────────────────────────────────────────
  const periodOptions = useMemo(() => {
    const opts: string[] = [];
    const now = new Date();
    for (let i = -6; i <= 2; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const y = d.getFullYear().toString();
      const m = (d.getMonth() + 1).toString().padStart(2, '0');
      opts.push(`${y}-${m}`);
    }
    return opts.sort((a, b) => b.localeCompare(a));
  }, []);

  const formatPeriod = (period: string) => {
    const [y, m] = period.split('-');
    return `${MONTHS[parseInt(m, 10) - 1].label} ${y}`;
  };

  // ── Handlers ──────────────────────────────────────────────
  const handleOpenPay = (bill: BranchBill) => {
    playSound('click');
    setPayForm({ amountPaid: bill.amount > 0 ? bill.amount.toString() : '', notes: '', periodCovered: selectedPeriod });
    setPayFile(null);
    setPayingBill(bill);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingBill || isSubmitting || isClosedMode) return;
    const amt = parseFloat(payForm.amountPaid);
    if (!amt || amt <= 0) { playSound('warning'); showToast('Enter a valid amount', 'error'); return; }

    setIsSubmitting(true);
    try {
      let receiptUrl: string | undefined;
      if (payFile) {
        const compressed = await compressImage(payFile);
        const path = `${branch.id}/bills/${Date.now()}_${payingBill.id}.jpg`;
        const { error: uploadErr } = await supabase.storage.from('receipts').upload(path, compressed, { contentType: 'image/jpeg' });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path);
        receiptUrl = urlData.publicUrl;
      }

      const { error } = await supabase.from(DB_TABLES.BILL_PAYMENTS).insert({
        branch_id: branch.id,
        bill_id: payingBill.id,
        period_covered: payForm.periodCovered,
        amount_paid: amt,
        notes: payForm.notes.trim() || null,
        receipt_image: receiptUrl || null,
        recorded_by: user?.username || branch.manager || 'BRANCH MANAGER',
      });
      if (error) throw error;

      playSound('success');
      showToast(`Payment recorded for ${payingBill.name}`);
      setPayingBill(null);
      refetchPayments();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to record payment', 'error');
      playSound('warning');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billForm.name.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const payload: any = {
        branch_id: branch.id,
        name: billForm.name.trim().toUpperCase(),
        category: billForm.category,
        amount: parseFloat(billForm.amount) || 0,
        due_day: billForm.category === 'MONTHLY' && billForm.dueDay ? parseInt(billForm.dueDay) : null,
        due_next_month: billForm.category === 'MONTHLY' ? billForm.dueNextMonth : false,
        notes: billForm.notes.trim() || null,
      };

      if (editingBill) {
        const { error } = await supabase.from(DB_TABLES.BRANCH_BILLS).update(payload).eq(DB_COLUMNS.ID, editingBill.id);
        if (error) throw error;
        showToast('Bill updated');
      } else {
        const { error } = await supabase.from(DB_TABLES.BRANCH_BILLS).insert(payload);
        if (error) throw error;
        showToast('Bill added');
      }

      playSound('success');
      setShowAddModal(false);
      setEditingBill(null);
      setBillForm({ name: '', category: 'MONTHLY', amount: '', dueDay: '', dueNextMonth: false, notes: '' });
      refetchBills();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to save bill', 'error');
      playSound('warning');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = (bill: BranchBill) => {
    playSound('click');
    setBillForm({
      name: bill.name,
      category: bill.category,
      amount: bill.amount > 0 ? bill.amount.toString() : '',
      dueDay: bill.dueDay?.toString() || '',
      dueNextMonth: bill.dueNextMonth ?? false,
      notes: bill.notes || ''
    });
    setEditingBill(bill);
  };

  const handleDeactivateBill = async () => {
    if (!deletingBill || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from(DB_TABLES.BRANCH_BILLS)
        .update({ [DB_COLUMNS.IS_ACTIVE]: false })
        .eq(DB_COLUMNS.ID, deletingBill.id);
      if (error) throw error;
      playSound('success');
      showToast('Bill removed');
      setDeletingBill(null);
      refetchBills();
    } catch (err: any) {
      showToast(err.message || 'Failed to remove bill', 'error');
      playSound('warning');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getBillPayment = (billId: string, period: string) =>
    billPayments.find(p => p.billId === billId && p.periodCovered === period);

  // ── Render ────────────────────────────────────────────────
  const selectedPeriodLabel = formatPeriod(selectedPeriod);

  return (
    <div className="w-full mx-auto pb-20 animate-in fade-in duration-500 space-y-8">

      {/* Toast */}
      {toast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[400] px-6 py-3 rounded-full shadow-2xl animate-in slide-in-from-top-6 duration-300 font-bold text-[11px] uppercase tracking-[0.1em] bg-slate-900 text-white border border-white/10 flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${toast.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'} animate-pulse`}></div>
          {toast.message}
        </div>
      )}

      {/* ── Header ── */}
      <div className={`bg-white p-6 sm:p-8 ${UI_THEME.radius.card} shadow-sm border border-slate-100 flex items-center justify-between gap-4`}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center text-2xl shadow-xl shrink-0">🏢</div>
          <div>
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tighter leading-none">{branch.name.replace('BRANCH - ', '')}</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] mt-0.5">Monthly Bills Tracker</p>
          </div>
        </div>
        <button
          onClick={() => { playSound('click'); setShowAddModal(true); setBillForm({ name: '', category: 'MONTHLY', amount: '', dueDay: '', dueNextMonth: false, notes: '' }); setEditingBill(null); }}
          className="flex items-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Add Bill</span>
        </button>
      </div>

      {/* ── Vault Balance + Period Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={`bg-slate-900 text-white p-6 sm:p-8 ${UI_THEME.radius.card} shadow-xl col-span-1 sm:col-span-2`}>
          <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-400 mb-1">Running Vault Balance</p>
          <p className={`text-4xl sm:text-5xl font-black tabular-nums tracking-tighter leading-none mb-3 ${vaultBalance < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            ₱{vaultBalance.toLocaleString()}
          </p>
          <div className="flex flex-wrap gap-4 text-[9px] font-bold text-slate-500 uppercase tracking-widest">
            {carryoverTotal > 0 && (
              <span className="text-indigo-400">+₱{carryoverTotal.toLocaleString()} carryover</span>
            )}
            <span>+₱{baseVaultMovement.toLocaleString()} provisions</span>
            <span>−₱{billPayments.reduce((s, p) => s + p.amountPaid, 0).toLocaleString()} bills paid</span>
          </div>
        </div>

        <div className={`bg-white border border-slate-100 p-6 ${UI_THEME.radius.card} shadow-sm space-y-4`}>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.3em]">This Period</p>
          <div>
            <p className="text-2xl font-black text-slate-900 tabular-nums">₱{totalPaidThisPeriod.toLocaleString()}</p>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">{currentPayments.length} payment{currentPayments.length !== 1 ? 's' : ''} recorded</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {(['PAID', 'OVERDUE', 'DUE_SOON'] as BillStatus[]).map(s => {
              const count = billsWithStatus.filter(b => b.status === s).length;
              if (!count) return null;
              const cfg = STATUS_CONFIG[s];
              return (
                <span key={s} className={`${cfg.bg} ${cfg.text} text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg`}>
                  {count} {cfg.label}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Period Selector ── */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">
          Bills — {selectedPeriodLabel}
        </h3>
        <select
          value={selectedPeriod}
          onChange={e => { setSelectedPeriod(e.target.value); playSound('click'); }}
          className="bg-white border border-slate-200 text-[10px] font-black text-slate-600 uppercase outline-none rounded-xl px-3 py-2 cursor-pointer shadow-sm"
        >
          {periodOptions.map(p => (
            <option key={p} value={p}>{formatPeriod(p)}</option>
          ))}
        </select>
      </div>

      {/* ── Bills Grid ── */}
      {branchBills.length === 0 ? (
        <div className={`bg-white p-16 ${UI_THEME.radius.card} border border-slate-100 text-center space-y-4`}>
          <div className="text-5xl opacity-20">🧾</div>
          <p className="text-xs font-black text-slate-300 uppercase tracking-[0.2em]">No bills defined yet.</p>
          <button
            onClick={() => { playSound('click'); setShowAddModal(true); setBillForm({ name: '', category: 'MONTHLY', amount: '', dueDay: '', dueNextMonth: false, notes: '' }); setEditingBill(null); }}
            className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg active:scale-95"
          >
            <Plus className="w-4 h-4" /> Define First Bill
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {billsWithStatus.map(({ bill, status }) => {
            const cfg = STATUS_CONFIG[status];
            const payment = getBillPayment(bill.id, selectedPeriod);
            return (
              <div key={bill.id} className={`bg-white border-2 ${status === 'OVERDUE' ? 'border-rose-200' : status === 'DUE_SOON' ? 'border-amber-200' : 'border-slate-100'} ${UI_THEME.radius.card} p-6 shadow-sm flex flex-col gap-4 relative group`}>
                {/* Actions */}
                <div className="absolute top-4 right-4 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleOpenEdit(bill)} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => { playSound('warning'); setDeletingBill(bill); }} className="w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 flex items-center justify-center text-rose-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div>
                  <div className="flex items-center gap-2 pr-16">
                    <p className="font-black text-slate-900 uppercase tracking-tight text-sm leading-tight">{bill.name}</p>
                    {bill.catalogId && (
                      <span className="bg-indigo-50 text-indigo-500 text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md shrink-0">CATALOG</span>
                    )}
                  </div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                    {bill.category === 'AS_NEEDED'
                      ? 'As Needed'
                      : bill.dueDay
                        ? bill.dueNextMonth
                          ? `Due ${bill.dueDay}${getOrdinal(bill.dueDay)} of next month`
                          : `Due on ${bill.dueDay}${getOrdinal(bill.dueDay)} of month`
                        : 'No fixed due date'}
                  </p>
                </div>

                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Expected</p>
                    <p className="text-xl font-black text-slate-900 tabular-nums">
                      {bill.amount > 0 ? `₱${bill.amount.toLocaleString()}` : 'TBD'}
                    </p>
                  </div>
                  <span className={`${cfg.bg} ${cfg.text} flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}></span>
                    {cfg.label}
                  </span>
                </div>

                {payment ? (
                  <div className="bg-emerald-50 rounded-2xl p-3 space-y-1">
                    <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Paid ₱{payment.amountPaid.toLocaleString()}</p>
                    <p className="text-[8px] font-bold text-emerald-500 uppercase tracking-widest">
                      {new Date(payment.paidAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })}
                      {payment.recordedBy ? ` · ${payment.recordedBy}` : ''}
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={() => handleOpenPay(bill)}
                    disabled={isClosedMode}
                    className="w-full py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow"
                  >
                    Record Payment
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Payment History ── */}
      <div className={`bg-white ${UI_THEME.radius.card} border border-slate-100 shadow-sm overflow-hidden`}>
        <div
          className="flex items-center justify-between px-6 sm:px-8 py-5 cursor-pointer hover:bg-slate-50 transition-colors"
          onClick={() => { setShowHistory(h => !h); playSound('click'); }}
        >
          <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">Payment History</h3>
          <div className="flex items-center gap-3">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{billPayments.length} records</span>
            <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showHistory ? 'rotate-90' : ''}`} />
          </div>
        </div>

        {showHistory && (
          billPayments.length === 0 ? (
            <div className="px-8 py-10 text-center">
              <p className="text-[11px] font-black text-slate-300 uppercase tracking-[0.2em]">No payments recorded yet.</p>
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-slate-50">
                {billPayments.map(payment => {
                  const bill = branchBills.find(b => b.id === payment.billId);
                  return (
                    <div key={payment.id} className="px-5 py-4 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-black text-slate-900 uppercase text-sm tracking-tight">{bill?.name || '—'}</p>
                        <p className="font-black text-emerald-600 tabular-nums text-sm shrink-0">₱{payment.amountPaid.toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="bg-indigo-50 text-indigo-600 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md">{formatPeriod(payment.periodCovered)}</span>
                        <span className="text-[9px] font-bold text-slate-400">
                          {new Date(payment.paidAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        {payment.recordedBy && <span className="text-[9px] font-bold text-slate-400">· {payment.recordedBy}</span>}
                      </div>
                      {payment.notes && <p className="text-[9px] font-bold text-slate-400 normal-case">{payment.notes}</p>}
                    </div>
                  );
                })}
              </div>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-y border-slate-100">
                      <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Bill</th>
                      <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Period</th>
                      <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Amount Paid</th>
                      <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                      <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {billPayments.map(payment => {
                      const bill = branchBills.find(b => b.id === payment.billId);
                      return (
                        <tr key={payment.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-8 py-4">
                            <p className="font-bold text-slate-900 uppercase text-xs tracking-tight">{bill?.name || '—'}</p>
                            {payment.recordedBy && <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mt-0.5">{payment.recordedBy}</p>}
                          </td>
                          <td className="px-4 py-4"><span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{formatPeriod(payment.periodCovered)}</span></td>
                          <td className="px-4 py-4 text-right font-black text-emerald-600 tabular-nums text-xs">₱{payment.amountPaid.toLocaleString()}</td>
                          <td className="px-4 py-4 text-[10px] font-bold text-slate-500 whitespace-nowrap">{new Date(payment.paidAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })}</td>
                          <td className="px-8 py-4 text-[10px] font-bold text-slate-400 max-w-xs truncate">{payment.notes || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}
      </div>

      {/* ── Pay Bill Modal ── */}
      {payingBill && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-md no-print animate-in fade-in duration-200" onClick={() => setPayingBill(null)}>
          <div className="w-full sm:max-w-md bg-white rounded-t-[32px] sm:rounded-[32px] p-6 sm:p-8 space-y-5 max-h-[92dvh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto sm:hidden" />
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">{payingBill.name}</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Record Payment</p>
              </div>
              <button onClick={() => setPayingBill(null)} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Period Covered</label>
                <select
                  value={payForm.periodCovered}
                  onChange={e => setPayForm(f => ({ ...f, periodCovered: e.target.value }))}
                  className="w-full bg-slate-50 border-2 border-transparent rounded-xl px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-800 outline-none focus:border-emerald-500 focus:bg-white transition-all"
                >
                  {periodOptions.map(p => <option key={p} value={p}>{formatPeriod(p)}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Amount Paid</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400 text-sm">₱</span>
                  <input
                    type="number" min="1" step="0.01"
                    value={payForm.amountPaid}
                    onChange={e => setPayForm(f => ({ ...f, amountPaid: e.target.value }))}
                    placeholder={payingBill.amount > 0 ? payingBill.amount.toString() : '0'}
                    className="w-full pl-8 pr-4 py-3 bg-slate-50 border-2 border-transparent rounded-xl font-black text-slate-800 text-[13px] outline-none focus:border-emerald-500 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Notes (optional)</label>
                <input
                  type="text"
                  value={payForm.notes}
                  onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. BDO online transfer"
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent rounded-xl font-bold text-slate-800 text-[11px] outline-none focus:border-emerald-500 focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Receipt / Proof (optional)</label>
                <label className="w-full border-2 border-dashed border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-emerald-400 transition-colors">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {payFile ? payFile.name : 'Tap to attach image'}
                  </span>
                  <input type="file" accept="image/*" className="hidden" onChange={e => setPayFile(e.target.files?.[0] || null)} />
                </label>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || isClosedMode}
                className="w-full bg-emerald-600 text-white font-black py-4 rounded-2xl text-[12px] uppercase tracking-widest shadow-lg active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-3"
              >
                {isSubmitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'Confirm Payment'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Add/Edit Bill Modal ── */}
      {(showAddModal || editingBill) && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-md no-print animate-in fade-in duration-200" onClick={() => { setShowAddModal(false); setEditingBill(null); }}>
          <div className="w-full sm:max-w-md bg-white rounded-t-[32px] sm:rounded-[32px] p-6 sm:p-8 space-y-5 max-h-[92dvh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto sm:hidden" />
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">{editingBill ? 'Edit Bill' : 'Define New Bill'}</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Bill Definition for {branch.name.replace('BRANCH - ', '')}</p>
              </div>
              <button onClick={() => { setShowAddModal(false); setEditingBill(null); }} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBill} className="space-y-4">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Bill Name</label>
                <input
                  type="text"
                  value={billForm.name}
                  onChange={e => setBillForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. RENT, ELECTRICITY, WATER"
                  required
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent rounded-xl font-black text-slate-800 text-[13px] uppercase outline-none focus:border-emerald-500 focus:bg-white transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Category</label>
                  <select
                    value={billForm.category}
                    onChange={e => setBillForm(f => ({ ...f, category: e.target.value as 'MONTHLY' | 'AS_NEEDED' }))}
                    className="w-full bg-slate-50 border-2 border-transparent rounded-xl px-3 py-3 text-[11px] font-black uppercase tracking-widest text-slate-800 outline-none focus:border-emerald-500 focus:bg-white transition-all"
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="AS_NEEDED">As Needed</option>
                  </select>
                </div>

                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Expected Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-slate-400 text-sm">₱</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={billForm.amount}
                      onChange={e => setBillForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="0 if TBD"
                      className="w-full pl-7 pr-3 py-3 bg-slate-50 border-2 border-transparent rounded-xl font-black text-slate-800 text-[12px] outline-none focus:border-emerald-500 focus:bg-white transition-all"
                    />
                  </div>
                </div>
              </div>

              {billForm.category === 'MONTHLY' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Due Day of Month</label>
                    <input
                      type="number" min="1" max="31"
                      value={billForm.dueDay}
                      onChange={e => setBillForm(f => ({ ...f, dueDay: e.target.value }))}
                      placeholder="e.g. 15 for the 15th"
                      className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent rounded-xl font-black text-slate-800 text-[13px] outline-none focus:border-emerald-500 focus:bg-white transition-all"
                    />
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={billForm.dueNextMonth}
                      onChange={e => setBillForm(f => ({ ...f, dueNextMonth: e.target.checked }))}
                      className="w-4 h-4 rounded accent-emerald-600"
                    />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Due on {billForm.dueDay || 'N'}th of the <span className="text-slate-900">next</span> month
                    </span>
                  </label>
                  {billForm.dueNextMonth && (
                    <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest leading-relaxed">
                      e.g. April bill is due on May {billForm.dueDay || '?'}. April will show UPCOMING until then.
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Notes (optional)</label>
                <input
                  type="text"
                  value={billForm.notes}
                  onChange={e => setBillForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. paid via GCash, call landlord first"
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent rounded-xl font-bold text-slate-800 text-[11px] outline-none focus:border-emerald-500 focus:bg-white transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !billForm.name.trim()}
                className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl text-[12px] uppercase tracking-widest shadow-lg active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-3 hover:bg-emerald-600"
              >
                {isSubmitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : editingBill ? 'Save Changes' : 'Add Bill'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deletingBill && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md no-print animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-[32px] p-8 text-center border border-slate-100 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
              <Trash2 className="w-8 h-8" />
            </div>
            <h4 className="text-2xl font-bold text-slate-900 mb-2 uppercase tracking-tighter">Remove Bill?</h4>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
              This will deactivate <span className="text-slate-900">{deletingBill.name}</span>.<br />Payment history will be preserved.
            </p>
            <div className="flex flex-col gap-3 mt-10">
              <button
                onClick={handleDeactivateBill}
                disabled={isSubmitting}
                className="w-full bg-rose-600 text-white font-black py-5 rounded-2xl text-[12px] uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                {isSubmitting ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : 'Remove Bill'}
              </button>
              <button onClick={() => setDeletingBill(null)} className="w-full text-slate-400 font-bold py-4 rounded-xl text-[11px] uppercase tracking-widest">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
