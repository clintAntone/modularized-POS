import React, { useState, useMemo, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Branch, BranchVault, SalesReport } from '../../../types';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';
import { supabase } from '../../../lib/supabase';
import { playSound } from '../../../lib/audio';
import { UI_THEME } from '../../../constants/ui_designs';
import { Landmark, X, ArrowDownCircle, ArrowUpCircle, Calendar, CheckCircle2, AlertTriangle, Clock, Plus, Pencil, Trash2 } from 'lucide-react';

interface MonthlyBillsSectionProps {
  branch: Branch;
  branchVault?: BranchVault | null;
  salesReports?: SalesReport[];
  isClosedMode?: boolean;
  onRefresh?: () => void;
}

interface VaultTransaction {
  id: string;
  timestamp: string;
  amount: number;
  name: string;
  type: 'deposit' | 'withdrawal';
  category?: string;
  receiptUrl?: string | null;
}

type FilterType = 'all' | 'deposits' | 'withdrawals';

interface Toast {
  message: string;
  type: 'success' | 'error';
}

const toManilaDate = (ts: string): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(ts));
  } catch { return ts.slice(0, 10); }
};

const formatDate = (dateStr: string): string => {
  try {
    return new Date(dateStr + 'T00:00:00+08:00').toLocaleDateString('en-PH', {
      timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    }).toUpperCase();
  } catch { return dateStr; }
};

const formatTime = (ts: string): string => {
  try {
    return new Date(ts).toLocaleTimeString('en-PH', {
      timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true,
    });
  } catch { return ''; }
};

const formatDateTime = (ts: string): string => {
  try {
    return new Date(ts).toLocaleString('en-PH', {
      timeZone: 'Asia/Manila', month: 'short', day: 'numeric',
      year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
    });
  } catch { return ts; }
};

export const MonthlyBillsSection: React.FC<MonthlyBillsSectionProps> = ({
  branch, branchVault, salesReports = [], isClosedMode = false, onRefresh,
}) => {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<Toast | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [selectedTx, setSelectedTx] = useState<VaultTransaction | null>(null);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [revealedBillId, setRevealedBillId] = useState<string | null>(null);
  const billPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Deposit to Vault state ────────────────────────────────────────────────
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositSelectedDate, setDepositSelectedDate] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [isSubmittingDeposit, setIsSubmittingDeposit] = useState(false);
  const billDidLongPress = useRef(false);

  React.useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // Dismiss long-press revealed bill when tapping outside
  useEffect(() => {
    if (!revealedBillId) return;
    const dismiss = () => setRevealedBillId(null);
    document.addEventListener('pointerdown', dismiss, { capture: true });
    return () => document.removeEventListener('pointerdown', dismiss, { capture: true });
  }, [revealedBillId]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') =>
    setToast({ message, type });

  // ── Fetch full vault transaction history from sales_reports.vault_data ──────
  // VAULT_DEPOSIT and VAULT_FUND_DEPOSIT entries now live in sales_reports.vault_data.
  // VAULT_WITHDRAWAL entries remain in the expenses table.
  const { data: transactions = [], isLoading: txLoading, refetch } = useQuery<VaultTransaction[]>({
    queryKey: ['vault_transactions', branch.id],
    queryFn: async () => {
      // 1. Fetch vault_data entries from all sales_reports for this branch
      const { data: reports, error: reportsErr } = await supabase
        .from(DB_TABLES.SALES_REPORTS)
        .select(`${DB_COLUMNS.VAULT_DATA}, ${DB_COLUMNS.REPORT_DATE}`)
        .eq(DB_COLUMNS.BRANCH_ID, branch.id)
        .order(DB_COLUMNS.REPORT_DATE, { ascending: false })
        .limit(90); // ~3 months
      if (reportsErr) throw reportsErr;

      const depositEntries: VaultTransaction[] = (reports || []).flatMap((r: any) => {
        const vd = typeof r[DB_COLUMNS.VAULT_DATA] === 'string'
          ? JSON.parse(r[DB_COLUMNS.VAULT_DATA])
          : (r[DB_COLUMNS.VAULT_DATA] || []);
        return (vd as any[])
          .filter((e: any) => e.category === 'VAULT_DEPOSIT' || e.category === 'VAULT_FUND_DEPOSIT' || e.category === 'VAULT_REMITTANCE')
          .map((e: any) => ({
            id: e.id,
            timestamp: e.timestamp,
            amount: Number(e.amount || 0),
            name: e.name || '',
            category: e.category,
            type: 'deposit' as const,
            receiptUrl: e.receiptUrl || null,
          }));
      });

      // 2. Fetch VAULT_WITHDRAWAL entries from expenses table (they still live there)
      const { data: withdrawals, error: wErr } = await supabase
        .from(DB_TABLES.EXPENSES)
        .select(`${DB_COLUMNS.ID}, ${DB_COLUMNS.TIMESTAMP}, ${DB_COLUMNS.AMOUNT}, ${DB_COLUMNS.NAME}, ${DB_COLUMNS.RECEIPT_IMAGE}`)
        .eq(DB_COLUMNS.BRANCH_ID, branch.id)
        .eq(DB_COLUMNS.CATEGORY, 'VAULT_WITHDRAWAL')
        .order(DB_COLUMNS.TIMESTAMP, { ascending: false })
        .limit(200);
      if (wErr) throw wErr;

      const withdrawalEntries: VaultTransaction[] = (withdrawals || []).map((r: any) => ({
        id: r[DB_COLUMNS.ID],
        timestamp: r[DB_COLUMNS.TIMESTAMP],
        amount: Number(r[DB_COLUMNS.AMOUNT] || 0),
        name: r[DB_COLUMNS.NAME] || '',
        type: 'withdrawal' as const,
        receiptUrl: r[DB_COLUMNS.RECEIPT_IMAGE] || null,
      }));

      return [...depositEntries, ...withdrawalEntries]
        .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // ── Bill form state ───────────────────────────────────────────────────────
  type BillForm = { id?: string; name: string; amount: string; dueDay: string; dueNextMonth: boolean; notes: string };
  const emptyBillForm: BillForm = { name: '', amount: '', dueDay: '', dueNextMonth: false, notes: '' };
  const [billForm, setBillForm] = useState<BillForm | null>(null);
  const [isSavingBill, setIsSavingBill] = useState(false);
  const [billFormError, setBillFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeletingBill, setIsDeletingBill] = useState(false);

  // ── Fetch active MONTHLY bills ───────────────────────────────────────────
  const { data: bills = [], refetch: refetchBills } = useQuery<any[]>({
    queryKey: ['branch_bills', branch.id],
    queryFn: async () => {
      const { data } = await supabase
        .from(DB_TABLES.BRANCH_BILLS)
        .select('id, name, amount, due_day, due_next_month, notes')
        .eq(DB_COLUMNS.BRANCH_ID, branch.id)
        .eq(DB_COLUMNS.IS_ACTIVE, true)
        .eq('category', 'MONTHLY')
        .order('due_day', { ascending: true, nullsFirst: false });
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // ── Fetch payments for current + next month ───────────────────────────────
  const { data: billPayments = [], refetch: refetchBillPayments } = useQuery<{ billId: string; period: string }[]>({
    queryKey: ['bill_payments', branch.id],
    queryFn: async () => {
      const manilaFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' });
      const today = manilaFmt.format(new Date());
      const [y, m] = today.split('-');
      const nextM = parseInt(m, 10) === 12 ? 1 : parseInt(m, 10) + 1;
      const nextY = parseInt(m, 10) === 12 ? parseInt(y, 10) + 1 : parseInt(y, 10);
      const currentPeriod = `${y}-${m}`;
      const nextPeriod = `${nextY}-${String(nextM).padStart(2, '0')}`;
      const { data } = await supabase
        .from(DB_TABLES.BILL_PAYMENTS)
        .select('bill_id, period_covered')
        .eq(DB_COLUMNS.BRANCH_ID, branch.id)
        .in('period_covered', [currentPeriod, nextPeriod]);
      return (data || []).map((r: any) => ({ billId: r.bill_id, period: r.period_covered }));
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // ── Compute bill status for each bill ────────────────────────────────────
  type BillStatus = 'paid' | 'overdue' | 'due_today' | 'due_soon' | 'upcoming';
  interface BillEntry {
    id: string; name: string; amount: number; dueDay?: number;
    dueNextMonth: boolean; notes?: string;
    status: BillStatus; daysLeft: number | null; dueLabel: string;
  }

  const billsWithStatus = useMemo((): BillEntry[] => {
    const manilaFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' });
    const today = manilaFmt.format(new Date());
    const [y, m, d] = today.split('-');
    const todayYear = parseInt(y, 10);
    const todayMonth = parseInt(m, 10);
    const todayDay = parseInt(d, 10);
    const currentPeriod = `${y}-${m}`;
    const nextM = todayMonth === 12 ? 1 : todayMonth + 1;
    const nextY = todayMonth === 12 ? todayYear + 1 : todayYear;
    const nextPeriod = `${nextY}-${String(nextM).padStart(2, '0')}`;
    const paidIds = new Set(billPayments
      .filter(p => p.period === (bills.find(b => b.id === p.billId)?.due_next_month ? nextPeriod : currentPeriod))
      .map(p => p.billId));

    return bills.map(bill => {
      const dueDay: number | undefined = bill.due_day ?? undefined;
      const dueNextMonth: boolean = !!bill.due_next_month;
      const isPaid = paidIds.has(bill.id);

      let status: BillStatus = 'upcoming';
      let daysLeft: number | null = null;
      let dueLabel = 'No due date';

      if (dueDay) {
        const dueYear = dueNextMonth ? nextY : todayYear;
        const dueMonth = dueNextMonth ? nextM : todayMonth;
        const dueDate = new Date(dueYear, dueMonth - 1, dueDay);
        const todayDate = new Date(todayYear, todayMonth - 1, todayDay);
        daysLeft = Math.round((dueDate.getTime() - todayDate.getTime()) / 86400000);
        const monthName = dueDate.toLocaleString('en-PH', { month: 'short' }).toUpperCase();
        dueLabel = `${monthName} ${dueDay}`;

        if (isPaid) {
          status = 'paid';
        } else if (daysLeft < 0) {
          status = 'overdue';
        } else if (daysLeft === 0) {
          status = 'due_today';
        } else if (daysLeft <= 5) {
          status = 'due_soon';
        } else {
          status = 'upcoming';
        }
      } else if (isPaid) {
        status = 'paid';
      }

      return {
        id: bill.id, name: bill.name, amount: Number(bill.amount || 0),
        dueDay, dueNextMonth, notes: bill.notes ?? undefined,
        status, daysLeft, dueLabel,
      };
    }).sort((a, b) => {
      const order: Record<BillStatus, number> = { overdue: 0, due_today: 1, due_soon: 2, upcoming: 3, paid: 4 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return (a.daysLeft ?? 999) - (b.daysLeft ?? 999);
    });
  }, [bills, billPayments]);

  // ── Bill long-press helpers ───────────────────────────────────────────────
  const startBillPress = (id: string) => {
    billDidLongPress.current = false;
    billPressTimer.current = setTimeout(() => {
      billDidLongPress.current = true;
      setRevealedBillId(id);
      playSound('click');
    }, 600);
  };
  const cancelBillPress = () => {
    if (billPressTimer.current) { clearTimeout(billPressTimer.current); billPressTimer.current = null; }
  };

  // ── Mark paid / unpaid ───────────────────────────────────────────────────
  const handleTogglePaid = async (bill: BillEntry) => {
    if (markingPaidId) return;
    setMarkingPaidId(bill.id);
    const manilaFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' });
    const today = manilaFmt.format(new Date());
    const [y, m] = today.split('-');
    const todayMonth = parseInt(m, 10);
    const todayYear = parseInt(y, 10);
    const nextM = todayMonth === 12 ? 1 : todayMonth + 1;
    const nextY = todayMonth === 12 ? todayYear + 1 : todayYear;
    const currentPeriod = `${y}-${m}`;
    const nextPeriod = `${nextY}-${String(nextM).padStart(2, '0')}`;
    const period = bill.dueNextMonth ? nextPeriod : currentPeriod;
    try {
      if (bill.status === 'paid') {
        await supabase.from(DB_TABLES.BILL_PAYMENTS)
          .delete()
          .eq(DB_COLUMNS.BILL_ID, bill.id)
          .eq(DB_COLUMNS.BRANCH_ID, branch.id)
          .eq(DB_COLUMNS.PERIOD_COVERED, period);
      } else {
        await supabase.from(DB_TABLES.BILL_PAYMENTS).insert({
          [DB_COLUMNS.BRANCH_ID]: branch.id,
          [DB_COLUMNS.BILL_ID]: bill.id,
          [DB_COLUMNS.PERIOD_COVERED]: period,
          [DB_COLUMNS.AMOUNT_PAID]: bill.amount > 0 ? bill.amount : 0,
          [DB_COLUMNS.PAID_AT]: new Date().toISOString(),
        });
      }
      playSound('success');
      refetchBillPayments();
    } catch (err: any) {
      showToast(err.message || 'Failed to update', 'error');
      playSound('warning');
    } finally {
      setMarkingPaidId(null);
    }
  };

  // ── Bill CRUD handlers ────────────────────────────────────────────────────
  const handleSaveBill = async () => {
    if (!billForm) return;
    const name = billForm.name.trim().toUpperCase();
    if (!name) { setBillFormError('Bill name is required.'); return; }
    const amount = billForm.amount ? parseFloat(billForm.amount) : null;
    const dueDay = billForm.dueDay ? parseInt(billForm.dueDay, 10) : null;
    if (dueDay !== null && (dueDay < 1 || dueDay > 31)) { setBillFormError('Due day must be between 1 and 31.'); return; }
    setIsSavingBill(true);
    setBillFormError(null);
    try {
      const payload = {
        branch_id: branch.id, name, amount, category: 'MONTHLY',
        due_day: dueDay, due_next_month: billForm.dueNextMonth,
        notes: billForm.notes.trim() || null, is_active: true,
      };
      if (billForm.id) {
        const { error } = await supabase.from(DB_TABLES.BRANCH_BILLS).update(payload).eq('id', billForm.id);
        if (error) throw error;
        showToast('Bill updated');
      } else {
        const { error } = await supabase.from(DB_TABLES.BRANCH_BILLS).insert(payload);
        if (error) throw error;
        showToast('Bill added');
      }
      playSound('success');
      setBillForm(null);
      refetchBills();
    } catch (err: any) {
      setBillFormError(err.message || 'Failed to save bill.');
      playSound('warning');
    } finally {
      setIsSavingBill(false);
    }
  };

  const handleDeleteBill = async (id: string) => {
    setIsDeletingBill(true);
    try {
      const { error } = await supabase.from(DB_TABLES.BRANCH_BILLS).update({ is_active: false }).eq('id', id);
      if (error) throw error;
      playSound('success');
      showToast('Bill removed');
      setConfirmDeleteId(null);
      refetchBills();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete bill.', 'error');
      playSound('warning');
    } finally {
      setIsDeletingBill(false);
    }
  };

  // ── Derived stats ─────────────────────────────────────────────────────────
  const totalDeposits = transactions.filter(t => t.type === 'deposit').reduce((s, t) => s + t.amount, 0);
  const totalWithdrawals = transactions.filter(t => t.type === 'withdrawal').reduce((s, t) => s + t.amount, 0);

  // ── Current week's reports (Mon → today, Manila time) ─────────────────────
  const currentWeekReports = useMemo((): SalesReport[] => {
    const manilaToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
    const [y, m, d] = manilaToday.split('-').map(Number);
    const todayDate = new Date(y, m - 1, d);
    const dow = todayDate.getDay(); // 0=Sun
    const daysToMonday = dow === 0 ? 6 : dow - 1;
    const monday = new Date(todayDate);
    monday.setDate(todayDate.getDate() - daysToMonday);

    const weekDates = new Set<string>();
    for (const cur = new Date(monday); cur <= todayDate; cur.setDate(cur.getDate() + 1)) {
      weekDates.add(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`);
    }

    return salesReports
      .filter(r => r.branchId === branch.id && weekDates.has(r.reportDate))
      .sort((a, b) => b.reportDate.localeCompare(a.reportDate));
  }, [salesReports, branch.id]);

  // ── Vault deposit handler ─────────────────────────────────────────────────
  const handleVaultDepositFromReport = async () => {
    if (!depositSelectedDate || !branchVault) return;
    const amount = Number(depositAmount);
    if (!amount || amount <= 0) return;

    const report = currentWeekReports.find(r => r.reportDate === depositSelectedDate);
    if (!report) return;
    if (amount > report.netRoi) return;

    setIsSubmittingDeposit(true);
    try {
      const manilaTime = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).format(new Date());
      const timestamp = `${depositSelectedDate}T${manilaTime}.000+08:00`;

      const newEntry = {
        id: Math.random().toString(36).substr(2, 9),
        name: 'VAULT DEPOSIT',
        amount,
        category: 'VAULT_DEPOSIT',
        timestamp,
      };

      const reportId = `${branch.id}_${depositSelectedDate.replace(/-/g, '')}`;
      const existingVaultData: any[] = report.vaultData || [];
      const { error: reportErr } = await supabase
        .from(DB_TABLES.SALES_REPORTS)
        .update({
          [DB_COLUMNS.VAULT_DATA]: [...existingVaultData, newEntry],
          [DB_COLUMNS.TOTAL_VAULT_PROVISION]: (report.totalVaultProvision || 0) + amount,
          [DB_COLUMNS.NET_ROI]: report.netRoi - amount,
        })
        .eq(DB_COLUMNS.ID, reportId);
      if (reportErr) throw reportErr;

      const { error: vaultErr } = await supabase
        .from(DB_TABLES.BRANCH_VAULTS)
        .update({ [DB_COLUMNS.VAULT_BALANCE]: branchVault.balance + amount })
        .eq(DB_COLUMNS.BRANCH_ID, branch.id);
      if (vaultErr) throw vaultErr;

      playSound('success');
      showToast('Vault deposit recorded');
      setShowDepositModal(false);
      setDepositAmount('');
      setDepositSelectedDate(null);
      await queryClient.invalidateQueries({ queryKey: ['salesReports'] });
      await queryClient.invalidateQueries({ queryKey: ['vault_transactions', branch.id] });
      refetch();
      onRefresh?.();
    } catch (err: any) {
      showToast(err.message || 'Deposit failed', 'error');
      playSound('warning');
    } finally {
      setIsSubmittingDeposit(false);
    }
  };

  // ── Available months derived from transactions ────────────────────────────
  const availableMonths = useMemo(() => {
    const months = new Map<string, string>(); // key: "2026-04", label: "Apr 2026"
    for (const tx of transactions) {
      const date = toManilaDate(tx.timestamp);
      const key = date.slice(0, 7); // "2026-04"
      if (!months.has(key)) {
        months.set(key, new Date(date + 'T00:00:00+08:00').toLocaleDateString('en-PH', {
          timeZone: 'Asia/Manila', month: 'short', year: 'numeric',
        }).toUpperCase());
      }
    }
    return Array.from(months.entries()); // already newest-first from query order
  }, [transactions]);

  // ── Filtered + grouped by Manila date ─────────────────────────────────────
  const filtered = useMemo(() => {
    let list = transactions;
    if (selectedMonth) list = list.filter(t => toManilaDate(t.timestamp).slice(0, 7) === selectedMonth);
    if (filter === 'deposits') list = list.filter(t => t.type === 'deposit');
    else if (filter === 'withdrawals') list = list.filter(t => t.type === 'withdrawal');
    const q = historySearch.trim().toLowerCase();
    if (q) list = list.filter(t => (t.name || '').toLowerCase().includes(q));
    return list;
  }, [transactions, filter, selectedMonth, historySearch]);

  const grouped = useMemo(() => {
    const map = new Map<string, VaultTransaction[]>();
    for (const tx of filtered) {
      const d = toManilaDate(tx.timestamp);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(tx);
    }
    return Array.from(map.entries()); // already newest-first from query
  }, [filtered]);

  const depositCount = transactions.filter(t => t.type === 'deposit').length;
  const withdrawalCount = transactions.filter(t => t.type === 'withdrawal').length;

  return (
    <div className="w-full mx-auto pb-20 animate-in fade-in duration-500 space-y-6">

      {/* Toast */}
      {toast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[400] px-6 py-3 rounded-full shadow-2xl animate-in slide-in-from-top-6 duration-300 font-bold text-[11px] uppercase tracking-[0.1em] bg-slate-900 text-white border border-white/10 flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${toast.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'} animate-pulse`} />
          {toast.message}
        </div>
      )}

      {/* ── Vault Balance KPI ── */}
      <div className={`bg-slate-900 text-white p-6 sm:p-8 ${UI_THEME.radius.card} shadow-xl space-y-5`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-300 mb-2 flex items-center gap-1.5">
              <Landmark className="w-3 h-3 opacity-60" />
              Vault Fund
            </p>
            <p className={`text-3xl sm:text-5xl lg:text-6xl font-black tabular-nums tracking-tighter leading-none ${!branchVault || branchVault.balance <= 0 ? 'text-slate-500' : 'text-emerald-400'}`}>
              ₱{(branchVault?.balance ?? 0).toLocaleString()}
            </p>
            <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-2">Running Balance</p>
          </div>
          <div className="grid grid-cols-2 gap-3 shrink-0 text-right">
            <div>
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Deposited</p>
              <p className="text-sm font-black text-emerald-400 tabular-nums">₱{totalDeposits.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Withdrawn</p>
              <p className="text-sm font-black text-rose-400 tabular-nums">₱{totalWithdrawals.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Vault target progress bar — always shown */}
        {branchVault && (() => {
          const balance = branchVault.balance ?? 0;
          const target = branchVault.target ?? 0;
          const hasTarget = target > 0;
          const pct = hasTarget ? Math.min(balance / target, 1) : 0;
          const reached = hasTarget && balance >= target;
          const remaining = hasTarget ? Math.max(target - balance, 0) : 0;

          // Bills coverage overlay
          const unpaidTotal = billsWithStatus.filter(b => b.status !== 'paid').reduce((s, b) => s + b.amount, 0);
          const canCoverBills = unpaidTotal > 0 ? balance >= unpaidTotal : null;

          return (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                  {hasTarget ? 'Vault Target' : 'Vault Balance'}
                </span>
                {hasTarget ? (
                  <span className={`text-[10px] font-black uppercase tracking-widest tabular-nums ${reached ? 'text-emerald-400' : 'text-slate-300'}`}>
                    ₱{balance.toLocaleString()} / ₱{target.toLocaleString()}
                  </span>
                ) : (
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No target set</span>
                )}
              </div>
              <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${reached ? 'bg-emerald-400' : 'bg-indigo-400'}`}
                  style={{ width: hasTarget ? `${Math.round(pct * 100)}%` : '0%' }}
                />
              </div>
              {!hasTarget ? (
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Contact admin to set a vault target</p>
              ) : reached ? (
                <p className="text-[11px] font-black uppercase tracking-widest text-emerald-400">Target reached — 100% funded</p>
              ) : (
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[13px] font-black tabular-nums text-white">₱{remaining.toLocaleString()} <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">to go</span></p>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{Math.round(pct * 100)}% of target reached</p>
                </div>
              )}
              {canCoverBills && (
                <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-400">
                  Can cover all unpaid bills (₱{unpaidTotal.toLocaleString()})
                </p>
              )}
            </div>
          );
        })()}

        {/* Deposit to Vault button */}
        {!isClosedMode && (
          <button
            onClick={() => {
              setDepositSelectedDate(currentWeekReports[0]?.reportDate ?? null);
              const firstReport = currentWeekReports[0];
              if (firstReport) setDepositAmount(String(Math.max(0, firstReport.netRoi)));
              setShowDepositModal(true);
              playSound('click');
            }}
            className="w-full mt-1 py-3 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-black text-[10px] uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <ArrowDownCircle className="w-4 h-4" />
            Deposit to Vault
          </button>
        )}

      </div>

      {/* ── 2-column: Bills | Transaction History ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

      {/* ── Vault-Paid Expenses ── */}
      {(() => {
        const vaultWithdrawals = transactions.filter(t => t.type === 'withdrawal');
        const totalVaultUsed = vaultWithdrawals.reduce((s, t) => s + t.amount, 0);

        // Group by Manila date
        const byDate = new Map<string, VaultTransaction[]>();
        for (const tx of vaultWithdrawals) {
          const d = toManilaDate(tx.timestamp);
          if (!byDate.has(d)) byDate.set(d, []);
          byDate.get(d)!.push(tx);
        }
        const groupedWithdrawals = Array.from(byDate.entries());

        const stripVaultPrefix = (name: string) =>
          name.startsWith('VAULT: ') ? name.slice(7) : name;

        return (
          <div className={`bg-white ${UI_THEME.radius.card} border border-slate-100 shadow-sm overflow-hidden`}>
            {/* Header */}
            <div className="px-6 sm:px-8 py-5 border-b border-slate-100">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <ArrowUpCircle className="w-4 h-4 text-amber-500 shrink-0" />
                  <div className="min-w-0">
                    <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] truncate">Vault-Paid Expenses</h3>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 truncate">Expenses covered using vault fund</p>
                  </div>
                </div>
                {totalVaultUsed > 0 && (
                  <span className="text-[13px] font-black text-amber-600 tabular-nums whitespace-nowrap shrink-0 ml-2">
                    −₱{totalVaultUsed.toLocaleString()}
                  </span>
                )}
              </div>
            </div>

            {vaultWithdrawals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center">
                  <ArrowUpCircle className="w-5 h-5 text-slate-200" />
                </div>
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">No vault withdrawals yet</p>
                <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest text-center px-8">Expenses paid using vault funds will appear here</p>
              </div>
            ) : (
              <div className="overflow-y-auto max-h-[480px]">
                {groupedWithdrawals.map(([date, txs]) => (
                  <div key={date}>
                    {/* Date group header */}
                    <div className="px-6 sm:px-8 py-2 bg-slate-50/80 border-y border-slate-100 flex items-center justify-between">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{formatDate(date)}</p>
                      <p className="text-[9px] font-black text-amber-500 tabular-nums">
                        −₱{txs.reduce((s, t) => s + t.amount, 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {txs.map(tx => (
                        <button
                          key={tx.id}
                          onClick={() => { setSelectedTx(tx); playSound('click'); }}
                          className="w-full flex items-center gap-3.5 px-5 sm:px-6 py-4 hover:bg-slate-50/60 active:bg-slate-100 transition-colors text-left"
                        >
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-amber-50 text-amber-500">
                            <ArrowUpCircle className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-black text-slate-800 uppercase tracking-tight truncate leading-tight">
                              {stripVaultPrefix(tx.name)}
                            </p>
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{formatTime(tx.timestamp)} · Vault</p>
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
                            <p className="text-[13px] font-black tabular-nums text-amber-600">
                              −₱{tx.amount.toLocaleString()}
                            </p>
                            <svg className="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Transaction History ── */}
      <div className={`bg-white ${UI_THEME.radius.card} border border-slate-100 shadow-sm overflow-hidden`}>

        {/* Collapsible header */}
        <button
          type="button"
          onClick={() => setHistoryExpanded(v => !v)}
          className="w-full px-6 sm:px-8 py-5 flex items-center justify-between gap-3 hover:bg-slate-50/60 active:bg-slate-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">Transaction History</h3>
            {txLoading
              ? <span className="h-3 w-12 rounded bg-slate-100 animate-pulse inline-block" />
              : <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{transactions.length} records</span>
            }
          </div>
          <div className={`w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 transition-transform duration-200 ${historyExpanded ? 'rotate-180' : ''}`}>
            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </div>
        </button>

        {/* Expanded content */}
        {historyExpanded && (
          <>
            {/* Search + filters */}
            <div className="px-6 sm:px-8 pb-4 border-b border-slate-100 space-y-3">
              {/* Search bar */}
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input
                  type="text"
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  placeholder="Search transactions…"
                  className="w-full pl-8 pr-8 py-2 text-[11px] font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-slate-400 focus:bg-white transition-all placeholder:text-slate-300"
                />
                {historySearch && (
                  <button
                    type="button"
                    onClick={() => setHistorySearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full bg-slate-300 text-white hover:bg-slate-400 transition-colors"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>

              {/* Type filter chips */}
              <div className="flex gap-2 flex-wrap">
                {([
                  { key: 'all', label: 'All', count: transactions.length },
                  { key: 'deposits', label: 'Deposits', count: depositCount },
                  { key: 'withdrawals', label: 'Withdrawals', count: withdrawalCount },
                ] as { key: FilterType; label: string; count: number }[]).map(f => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                      filter === f.key
                        ? f.key === 'withdrawals'
                          ? 'bg-rose-600 text-white shadow-sm'
                          : f.key === 'deposits'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-slate-900 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {f.label}
                    <span className={`px-1.5 py-0.5 rounded-md text-[8px] font-black ${
                      filter === f.key ? 'bg-white/20 text-white' : 'bg-white text-slate-400'
                    }`}>{f.count}</span>
                  </button>
                ))}
              </div>

              {/* Month filter */}
              {availableMonths.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setSelectedMonth(null)}
                    className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                      selectedMonth === null ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    All Months
                  </button>
                  {availableMonths.map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedMonth(key === selectedMonth ? null : key)}
                      className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                        selectedMonth === key ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {txLoading ? (
              /* Skeleton rows while fetching */
              <div className="divide-y divide-slate-50">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-6 sm:px-8 py-4 animate-pulse">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 shrink-0" />
                    <div className="flex-1 space-y-2 min-w-0">
                      <div className="h-3 bg-slate-100 rounded-lg w-2/5" />
                      <div className="h-2 bg-slate-50 rounded-lg w-1/4" />
                    </div>
                    <div className="h-4 bg-slate-100 rounded-lg w-16 shrink-0" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-8 py-16 text-center space-y-3">
                <div className="text-4xl opacity-10">🏦</div>
                <p className="text-[11px] font-black text-slate-300 uppercase tracking-[0.2em]">No transactions</p>
                <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">
                  {historySearch ? `No results for "${historySearch}"` : filter !== 'all' ? `No ${filter} found` : 'Deposits and withdrawals will appear here'}
                </p>
              </div>
            ) : (
              <div className="overflow-y-auto max-h-[480px]">
                {grouped.map(([date, txs]) => (
                  <div key={date}>
                    {/* Date group header */}
                    <div className="px-6 sm:px-8 py-2.5 bg-slate-50/80 border-y border-slate-100 flex items-center justify-between">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{formatDate(date)}</p>
                      <p className="text-[9px] font-black text-slate-400 tabular-nums">
                        {txs.filter(t => t.type === 'deposit').length > 0 && (
                          <span className="text-emerald-600">+₱{txs.filter(t => t.type === 'deposit').reduce((s, t) => s + t.amount, 0).toLocaleString()}</span>
                        )}
                        {txs.filter(t => t.type === 'deposit').length > 0 && txs.filter(t => t.type === 'withdrawal').length > 0 && (
                          <span className="text-slate-300 mx-1">·</span>
                        )}
                        {txs.filter(t => t.type === 'withdrawal').length > 0 && (
                          <span className="text-rose-500">−₱{txs.filter(t => t.type === 'withdrawal').reduce((s, t) => s + t.amount, 0).toLocaleString()}</span>
                        )}
                      </p>
                    </div>

                    {/* Transactions in this date group */}
                    <div className="divide-y divide-slate-50">
                      {txs.map(tx => (
                        <button
                          key={tx.id}
                          onClick={() => { setSelectedTx(tx); playSound('click'); }}
                          className="w-full flex items-center gap-4 px-6 sm:px-8 py-4 hover:bg-slate-50/50 active:bg-slate-100 transition-colors text-left"
                        >
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tx.type === 'deposit' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'}`}>
                            {tx.type === 'deposit'
                              ? <ArrowDownCircle className="w-4 h-4" />
                              : <ArrowUpCircle className="w-4 h-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-black text-slate-800 uppercase tracking-tight truncate">{tx.name}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{formatTime(tx.timestamp)}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 min-w-[100px] justify-end">
                            <p className={`text-[13px] font-black tabular-nums text-right ${tx.type === 'deposit' ? 'text-emerald-600' : 'text-rose-500'}`}>
                              {tx.type === 'deposit' ? '+' : '−'}₱{tx.amount.toLocaleString()}
                            </p>
                            {tx.receiptUrl && (
                              <div className="w-5 h-5 rounded-md bg-indigo-50 flex items-center justify-center">
                                <svg className="w-3 h-3 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              </div>
                            )}
                            <svg className="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      </div>{/* end 2-col grid */}

      {/* ── Transaction Detail Sheet ── */}
      {selectedTx && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setSelectedTx(null)}
        >
          <div
            className="w-full sm:max-w-sm bg-white rounded-t-[32px] sm:rounded-[32px] shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle (mobile only) */}
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mt-4 sm:hidden" />

            <div className="p-6 sm:p-8 space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${selectedTx.type === 'deposit' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-500'}`}>
                    {selectedTx.type === 'deposit'
                      ? <ArrowDownCircle className="w-6 h-6" />
                      : <ArrowUpCircle className="w-6 h-6" />}
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      {selectedTx.type === 'deposit' ? 'Vault Deposit' : 'Vault Withdrawal'}
                    </p>
                    <p className="text-[15px] font-black text-slate-900 uppercase tracking-tight leading-tight">{selectedTx.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedTx(null)}
                  className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Amount */}
              <div className={`rounded-2xl p-4 flex items-center justify-between ${selectedTx.type === 'deposit' ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Amount</span>
                <span className={`text-2xl font-black tabular-nums ${selectedTx.type === 'deposit' ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {selectedTx.type === 'deposit' ? '+' : '−'}₱{selectedTx.amount.toLocaleString()}
                </span>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-2xl p-4">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Date</p>
                  <p className="text-[11px] font-black text-slate-800 uppercase">{toManilaDate(selectedTx.timestamp)}</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-4">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Time</p>
                  <p className="text-[11px] font-black text-slate-800 uppercase">{formatTime(selectedTx.timestamp)}</p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Reference ID</p>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{selectedTx.id.slice(-12).toUpperCase()}</p>
              </div>

              {/* Receipt image */}
              {selectedTx.receiptUrl && (
                <div className="space-y-2">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Receipt</p>
                  <a href={selectedTx.receiptUrl} target="_blank" rel="noopener noreferrer" className="block">
                    <img
                      src={selectedTx.receiptUrl}
                      alt="Receipt"
                      className="w-full rounded-2xl object-cover max-h-48 border border-slate-100 hover:opacity-90 transition-opacity"
                    />
                  </a>
                </div>
              )}

              <button
                onClick={() => setSelectedTx(null)}
                className="w-full py-4 rounded-2xl border-2 border-slate-200 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 active:scale-95 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Bill Form Modal (Add / Edit) ── */}
      {billForm !== null && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setBillForm(null)}
        >
          <div
            className="w-full sm:max-w-sm bg-white rounded-t-[32px] sm:rounded-[32px] shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mt-4 sm:hidden" />
            <div className="p-6 sm:p-8 space-y-5">
              {/* Header */}
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                    {billForm.id ? 'Edit Bill' : 'Add Bill'}
                  </h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Monthly recurring bill</p>
                </div>
                <button
                  onClick={() => setBillForm(null)}
                  className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Name */}
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Bill Name <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  autoFocus
                  value={billForm.name}
                  onChange={e => setBillForm(f => f && ({ ...f, name: e.target.value }))}
                  placeholder="e.g. RENT, ELECTRICITY"
                  className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-[12px] font-bold uppercase outline-none focus:border-slate-400 focus:bg-white transition-colors"
                />
              </div>

              {/* Amount */}
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Amount <span className="text-slate-300">(optional)</span></label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400">₱</span>
                  <input
                    type="number" min="0" step="1"
                    value={billForm.amount}
                    onChange={e => setBillForm(f => f && ({ ...f, amount: e.target.value }))}
                    placeholder="0"
                    className="w-full bg-slate-50 border border-slate-200 pl-8 pr-4 py-3 rounded-xl text-[13px] font-black outline-none focus:border-slate-400 focus:bg-white transition-colors tabular-nums"
                  />
                </div>
              </div>

              {/* Due Day + Due Next Month */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Due Day <span className="text-slate-300">(1–31)</span></label>
                  <input
                    type="number" min="1" max="31" step="1"
                    value={billForm.dueDay}
                    onChange={e => setBillForm(f => f && ({ ...f, dueDay: e.target.value }))}
                    placeholder="e.g. 15"
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-[13px] font-black outline-none focus:border-slate-400 focus:bg-white transition-colors tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Due Month</label>
                  <button
                    type="button"
                    onClick={() => setBillForm(f => f && ({ ...f, dueNextMonth: !f.dueNextMonth }))}
                    className={`w-full py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                      billForm.dueNextMonth
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {billForm.dueNextMonth ? 'Next Month' : 'This Month'}
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Notes <span className="text-slate-300">(optional)</span></label>
                <input
                  type="text"
                  value={billForm.notes}
                  onChange={e => setBillForm(f => f && ({ ...f, notes: e.target.value }))}
                  placeholder="Any remarks"
                  className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-[12px] font-bold outline-none focus:border-slate-400 focus:bg-white transition-colors"
                />
              </div>

              {billFormError && (
                <p className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{billFormError}</p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setBillForm(null)}
                  className="h-12 bg-white border border-slate-200 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveBill}
                  disabled={isSavingBill}
                  className="h-12 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all disabled:opacity-40"
                >
                  {isSavingBill ? 'Saving…' : billForm.id ? 'Update' : 'Add Bill'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Delete Confirm ── */}
      {confirmDeleteId !== null && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200 p-4"
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            className="w-full max-w-xs bg-white rounded-[28px] shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5 text-rose-600" />
            </div>
            <div className="text-center">
              <h4 className="text-[15px] font-black text-slate-900 uppercase tracking-tight">Remove Bill?</h4>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">This bill will be hidden from the list.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="h-12 bg-white border border-slate-200 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteBill(confirmDeleteId)}
                disabled={isDeletingBill}
                className="h-12 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all disabled:opacity-40"
              >
                {isDeletingBill ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Deposit to Vault Modal ── */}
      {showDepositModal && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200 p-4"
          onClick={() => { setShowDepositModal(false); setDepositAmount(''); setDepositSelectedDate(null); }}
        >
          <div
            className="w-full sm:max-w-sm bg-white rounded-t-[32px] sm:rounded-[32px] shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mt-4 sm:hidden" />
            <div className="p-6 sm:p-8 space-y-5">

              {/* Header */}
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">Deposit to Vault</h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{branch.name} · Select a report to deduct from</p>
                </div>
                <button
                  onClick={() => { setShowDepositModal(false); setDepositAmount(''); setDepositSelectedDate(null); }}
                  className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Current vault balance */}
              <div className="bg-slate-900 rounded-2xl px-4 py-3 flex items-center justify-between">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Current Vault Balance</p>
                <p className="text-base font-black text-emerald-400 tabular-nums">₱{(branchVault?.balance ?? 0).toLocaleString()}</p>
              </div>

              {/* Report date picker */}
              <div className="space-y-2">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-0.5">Select Report Date (This Week)</p>
                {currentWeekReports.length === 0 ? (
                  <div className="bg-slate-50 rounded-2xl p-4 text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No reports this week</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto">
                    {currentWeekReports.map(r => {
                      const isSelected = depositSelectedDate === r.reportDate;
                      const roi = r.netRoi;
                      const hasRoi = roi > 0;
                      const dateLabel = new Date(r.reportDate + 'T00:00:00+08:00').toLocaleDateString('en-PH', {
                        timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric',
                      }).toUpperCase();
                      return (
                        <button
                          key={r.reportDate}
                          type="button"
                          disabled={!hasRoi}
                          onClick={() => {
                            setDepositSelectedDate(r.reportDate);
                            setDepositAmount(String(Math.max(0, roi)));
                          }}
                          className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-left ${
                            !hasRoi
                              ? 'opacity-40 cursor-not-allowed bg-slate-50 border-transparent'
                              : isSelected
                                ? 'bg-indigo-50 border-indigo-400'
                                : 'bg-white border-slate-200 hover:border-indigo-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300'}`}>
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${isSelected ? 'text-indigo-900' : 'text-slate-700'}`}>{dateLabel}</span>
                          </div>
                          <div className="text-right">
                            <span className={`text-[11px] font-black tabular-nums ${hasRoi ? (isSelected ? 'text-indigo-600' : 'text-emerald-600') : 'text-slate-400'}`}>
                              ₱{roi.toLocaleString()}
                            </span>
                            <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">Available ROI</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Amount input — shown only when a date is selected */}
              {depositSelectedDate && (() => {
                const report = currentWeekReports.find(r => r.reportDate === depositSelectedDate);
                const maxAmount = report?.netRoi ?? 0;
                const amt = Number(depositAmount) || 0;
                const afterBalance = (branchVault?.balance ?? 0) + amt;
                const target = branchVault?.target ?? 0;
                const afterPct = target > 0 ? Math.min(100, Math.round((afterBalance / target) * 100)) : 0;
                const isOverMax = amt > maxAmount;

                return (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-0.5">Deposit Amount (₱)</label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-black text-slate-400">₱</span>
                        <input
                          type="number"
                          autoFocus
                          min="1"
                          max={maxAmount}
                          value={depositAmount}
                          onChange={e => setDepositAmount(e.target.value)}
                          className={`w-full pl-8 pr-4 py-3 rounded-xl border-2 text-[15px] font-black tabular-nums outline-none transition-all ${
                            isOverMax
                              ? 'border-rose-400 bg-rose-50 text-rose-700'
                              : 'border-slate-200 bg-slate-50 text-indigo-900 focus:border-indigo-500 focus:bg-white'
                          }`}
                        />
                      </div>
                      {isOverMax && (
                        <p className="text-[9px] font-bold text-rose-500 uppercase tracking-widest ml-0.5">Exceeds available ROI of ₱{maxAmount.toLocaleString()}</p>
                      )}
                    </div>

                    {/* After-deposit preview */}
                    {amt > 0 && !isOverMax && (
                      <div className="bg-indigo-50 rounded-2xl px-4 py-3 space-y-2">
                        <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">After Deposit</p>
                        <div className="flex items-end justify-between">
                          <p className="text-lg font-black text-indigo-700 tabular-nums leading-none">₱{afterBalance.toLocaleString()}</p>
                          {target > 0 && <p className="text-[10px] font-black text-indigo-500 tabular-nums">{afterPct}% of target</p>}
                        </div>
                        {target > 0 && (
                          <div className="w-full h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${afterPct}%` }} />
                          </div>
                        )}
                        <p className="text-[8px] font-bold text-indigo-400 uppercase tracking-widest tabular-nums">
                          ROI deducted: −₱{amt.toLocaleString()} from {new Date(depositSelectedDate + 'T00:00:00+08:00').toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' }).toUpperCase()}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Actions */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { setShowDepositModal(false); setDepositAmount(''); setDepositSelectedDate(null); }}
                  className="h-12 bg-white border border-slate-200 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleVaultDepositFromReport}
                  disabled={
                    isSubmittingDeposit ||
                    !depositSelectedDate ||
                    !depositAmount ||
                    Number(depositAmount) <= 0 ||
                    Number(depositAmount) > (currentWeekReports.find(r => r.reportDate === depositSelectedDate)?.netRoi ?? 0)
                  }
                  className="h-12 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSubmittingDeposit ? 'Saving…' : `Deposit ₱${(Number(depositAmount) || 0).toLocaleString()}`}
                </button>
              </div>

            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};
