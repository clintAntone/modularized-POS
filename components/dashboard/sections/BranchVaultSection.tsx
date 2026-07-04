import React, { useState, useMemo, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Branch, BranchVault, SalesReport } from '../../../types';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';
import { supabase } from '../../../lib/supabase';
import { playSound } from '../../../lib/audio';
import { UI_THEME } from '../../../constants/ui_designs';
import { Landmark, X, ArrowDownCircle, ArrowUpCircle, Calendar, CheckCircle2, AlertTriangle, Clock, Plus, Pencil, Trash2, Banknote } from 'lucide-react';
import { compressImage } from '../../../lib/image';
import { getTrueISOString } from '../../../lib/time';

interface BranchVaultSectionProps {
  branch: Branch;
  branchVault?: BranchVault | null;
  salesReports?: SalesReport[];
  isClosedMode?: boolean;
  todayNetRoi?: number;
  todayStr?: string;
  performedBy?: string | null;
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
  performedBy?: string | null;
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

export const BranchVaultSection: React.FC<BranchVaultSectionProps> = ({
  branch, branchVault, salesReports = [], isClosedMode = false, todayNetRoi, todayStr, performedBy, onRefresh,
}) => {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<Toast | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [kpiExpanded, setKpiExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [billsSearch, setBillsSearch] = useState('');
  const [selectedTx, setSelectedTx] = useState<VaultTransaction | null>(null);
  const [visibleHistory, setVisibleHistory] = useState(20);
  const [visibleBills, setVisibleBills] = useState(20);
  const historyBottomRef = useRef<HTMLDivElement>(null);
  const billsBottomRef = useRef<HTMLDivElement>(null);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [revealedBillId, setRevealedBillId] = useState<string | null>(null);
  const billPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Deposit to Vault state ────────────────────────────────────────────────
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositSelectedDate, setDepositSelectedDate] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [isSubmittingDeposit, setIsSubmittingDeposit] = useState(false);
  const billDidLongPress = useRef(false);

  // ── Withdraw from Vault state ─────────────────────────────────────────────
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawConfirming, setWithdrawConfirming] = useState(false);
  const [withdrawLabel, setWithdrawLabel] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawFile, setWithdrawFile] = useState<File | null>(null);
  const [isSubmittingWithdraw, setIsSubmittingWithdraw] = useState(false);
  const [withdrawUploadProgress, setWithdrawUploadProgress] = useState(0);
  const withdrawFileInputRef = useRef<HTMLInputElement>(null);

  // ── Delete vault bill payment state ──────────────────────────────────────
  const [vaultBillToDelete, setVaultBillToDelete] = useState<{ id: string; name: string; amount: number } | null>(null);
  const [isDeletingVaultBill, setIsDeletingVaultBill] = useState(false);
  const manilaToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

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

  // Reset visible counts when filters change
  useEffect(() => { setVisibleHistory(20); }, [filter, selectedMonth, historySearch]);
  useEffect(() => { setVisibleBills(20); }, [billsSearch]);

  // Infinite scroll — vault history
  useEffect(() => {
    const el = historyBottomRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleHistory(v => v + 20);
    }, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [historyBottomRef.current]);

  // Infinite scroll — bills paid
  useEffect(() => {
    const el = billsBottomRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleBills(v => v + 20);
    }, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [billsBottomRef.current]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') =>
    setToast({ message, type });

  // ── Fetch vault transaction history from vault_transactions table ──────────
  const { data: transactions = [], isLoading: txLoading, refetch } = useQuery<VaultTransaction[]>({
    queryKey: ['vault_transactions', branch.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(DB_TABLES.VAULT_TRANSACTIONS)
        .select('*')
        .eq(DB_COLUMNS.BRANCH_ID, branch.id)
        .order(DB_COLUMNS.TIMESTAMP, { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r[DB_COLUMNS.ID],
        timestamp: r[DB_COLUMNS.TIMESTAMP],
        amount: Number(r[DB_COLUMNS.AMOUNT] || 0),
        name: r[DB_COLUMNS.NAME] || '',
        type: (['WITHDRAWAL', 'VAULT_WITHDRAWAL'].includes((r[DB_COLUMNS.TYPE] || '').toUpperCase()) ? 'withdrawal' : 'deposit') as 'deposit' | 'withdrawal',
        category: r[DB_COLUMNS.TYPE],
        receiptUrl: r[DB_COLUMNS.RECEIPT_IMAGE] || null,
        performedBy: r[DB_COLUMNS.PERFORMED_BY] || null,
      }));
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
    const billAmount = bill.amount > 0 ? bill.amount : 0;
    try {
      if (bill.status === 'paid') {
        await supabase.from(DB_TABLES.BILL_PAYMENTS)
          .delete()
          .eq(DB_COLUMNS.BILL_ID, bill.id)
          .eq(DB_COLUMNS.BRANCH_ID, branch.id)
          .eq(DB_COLUMNS.PERIOD_COVERED, period);

        // Restore vault balance when un-marking a paid bill
        if (branchVault && billAmount > 0) {
          await supabase.from(DB_TABLES.BRANCH_VAULTS)
            .update({ [DB_COLUMNS.VAULT_BALANCE]: branchVault.balance + billAmount })
            .eq(DB_COLUMNS.BRANCH_ID, branch.id);
        }
      } else {
        await supabase.from(DB_TABLES.BILL_PAYMENTS).insert({
          [DB_COLUMNS.BRANCH_ID]: branch.id,
          [DB_COLUMNS.BILL_ID]: bill.id,
          [DB_COLUMNS.PERIOD_COVERED]: period,
          [DB_COLUMNS.AMOUNT_PAID]: billAmount,
          [DB_COLUMNS.PAID_AT]: getTrueISOString(),
        });

        // Deduct from vault balance when marking a bill as paid
        if (branchVault && billAmount > 0) {
          const newBalance = Math.max(0, branchVault.balance - billAmount);
          await supabase.from(DB_TABLES.BRANCH_VAULTS)
            .update({ [DB_COLUMNS.VAULT_BALANCE]: newBalance })
            .eq(DB_COLUMNS.BRANCH_ID, branch.id);
        }
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
  const totalDeposits = transactions.filter(t => ['DEPOSIT', 'ADMIN_DEPOSIT'].includes((t.type || '').toUpperCase())).reduce((s, t) => s + t.amount, 0);
  const totalWithdrawals = transactions.filter(t => ['WITHDRAWAL', 'VAULT_WITHDRAWAL'].includes((t.type || '').toUpperCase())).reduce((s, t) => s + t.amount, 0);

  // ── Recent reports (last 7 days from today, Manila time) ──────────────────
  const currentWeekReports = useMemo((): SalesReport[] => {
    const manilaToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
    const [y, m, d] = manilaToday.split('-').map(Number);
    const todayDate = new Date(y, m - 1, d);

    const recentDates = new Set<string>();
    for (let i = 0; i < 7; i++) {
      const cur = new Date(todayDate);
      cur.setDate(todayDate.getDate() - i);
      recentDates.add(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`);
    }

    return salesReports
      .filter(r => r.branchId === branch.id && recentDates.has(r.reportDate))
      .sort((a, b) => b.reportDate.localeCompare(a.reportDate));
  }, [salesReports, branch.id]);

  // ── Vault deposit handler ─────────────────────────────────────────────────
  const handleVaultDepositFromReport = async () => {
    if (!depositSelectedDate || !branchVault) return;
    const amount = Number(depositAmount);
    if (!amount || amount <= 0) return;

    const report = currentWeekReports.find(r => r.reportDate === depositSelectedDate);

    // Find existing deposit for this date (one-deposit-per-day rule)
    const existingDeposit = transactions.find(
      t => t.type === 'deposit' && toManilaDate(t.timestamp) === depositSelectedDate,
    );
    const existingAmount = existingDeposit?.amount ?? 0;

    // ROI guard + target cap
    // When updating, existing amount is freed up, so space = target - balance + existingAmount
    const vaultTarget = branchVault.target ?? 0;
    const spaceToTarget = vaultTarget > 0
      ? Math.max(0, vaultTarget - branchVault.balance + existingAmount)
      : Infinity;

    if (depositSelectedDate === todayStr) {
      const roiMax = (todayNetRoi ?? 0) + existingAmount;
      const maxDeposit = spaceToTarget === Infinity ? roiMax : Math.min(roiMax, spaceToTarget);
      if (amount > maxDeposit) return;
    } else {
      if (!report) return;
      const roiMax = report.netRoi + existingAmount;
      const maxDeposit = spaceToTarget === Infinity ? roiMax : Math.min(roiMax, spaceToTarget);
      if (amount > maxDeposit) return;
    }

    setIsSubmittingDeposit(true);
    try {
      const manilaTime = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).format(new Date());
      const timestamp = `${depositSelectedDate}T${manilaTime}.000+08:00`;
      const reportId = `${branch.id}_${depositSelectedDate.replace(/-/g, '')}`;

      // Always fetch the live deposit and vault balance from DB — never trust local state
      // for write decisions. This prevents 409 conflicts and double-increments caused by
      // stale React state (old deposits may have random IDs that differ from local cache).
      const [{ data: liveDepositRows }, { data: liveVaultRow }] = await Promise.all([
        supabase
          .from(DB_TABLES.VAULT_TRANSACTIONS)
          .select('id, amount')
          .eq(DB_COLUMNS.BRANCH_ID, branch.id)
          .eq(DB_COLUMNS.TYPE, 'DEPOSIT')
          .gte(DB_COLUMNS.TIMESTAMP, `${depositSelectedDate}T00:00:00+08:00`)
          .lte(DB_COLUMNS.TIMESTAMP, `${depositSelectedDate}T23:59:59+08:00`)
          .limit(1),
        supabase
          .from(DB_TABLES.BRANCH_VAULTS)
          .select(DB_COLUMNS.VAULT_BALANCE)
          .eq(DB_COLUMNS.BRANCH_ID, branch.id)
          .single(),
      ]);

      const liveDeposit = liveDepositRows?.[0] ?? null;
      const liveBalance: number = liveVaultRow?.[DB_COLUMNS.VAULT_BALANCE] ?? branchVault.balance;

      if (liveDeposit) {
        // UPDATE existing deposit row (whatever ID it has — old random or new deterministic)
        const delta = amount - liveDeposit.amount;

        const { error: txErr } = await supabase
          .from(DB_TABLES.VAULT_TRANSACTIONS)
          .update({ [DB_COLUMNS.AMOUNT]: amount, [DB_COLUMNS.TIMESTAMP]: timestamp })
          .eq(DB_COLUMNS.ID, liveDeposit.id);
        if (txErr) throw txErr;

        const { error: vaultErr } = await supabase
          .from(DB_TABLES.BRANCH_VAULTS)
          .update({ [DB_COLUMNS.VAULT_BALANCE]: liveBalance + delta })
          .eq(DB_COLUMNS.BRANCH_ID, branch.id);
        if (vaultErr) throw vaultErr;

        if (report) {
          const { error: reportErr } = await supabase
            .from(DB_TABLES.SALES_REPORTS)
            .update({
              [DB_COLUMNS.TOTAL_VAULT_PROVISION]: (report.totalVaultProvision || 0) + delta,
              [DB_COLUMNS.NET_ROI]: report.netRoi - delta,
            })
            .eq(DB_COLUMNS.ID, reportId);
          if (reportErr) throw reportErr;
        }
      } else {
        // INSERT new deposit with deterministic ID
        const txId = `vault_deposit_${branch.id}_${depositSelectedDate.replace(/-/g, '')}`;

        const { error: txErr } = await supabase
          .from(DB_TABLES.VAULT_TRANSACTIONS)
          .insert({
            [DB_COLUMNS.ID]: txId,
            [DB_COLUMNS.BRANCH_ID]: branch.id,
            [DB_COLUMNS.REPORT_ID]: reportId,
            [DB_COLUMNS.TYPE]: 'DEPOSIT',
            [DB_COLUMNS.AMOUNT]: amount,
            [DB_COLUMNS.NAME]: 'VAULT DEPOSIT',
            [DB_COLUMNS.TIMESTAMP]: timestamp,
            [DB_COLUMNS.PERFORMED_BY]: null,
          });
        if (txErr) throw txErr;

        const { error: vaultErr } = await supabase
          .from(DB_TABLES.BRANCH_VAULTS)
          .update({ [DB_COLUMNS.VAULT_BALANCE]: liveBalance + amount })
          .eq(DB_COLUMNS.BRANCH_ID, branch.id);
        if (vaultErr) throw vaultErr;

        if (report) {
          const { error: reportErr } = await supabase
            .from(DB_TABLES.SALES_REPORTS)
            .update({
              [DB_COLUMNS.TOTAL_VAULT_PROVISION]: (report.totalVaultProvision || 0) + amount,
              [DB_COLUMNS.NET_ROI]: report.netRoi - amount,
            })
            .eq(DB_COLUMNS.ID, reportId);
          if (reportErr) throw reportErr;
        }
      }

      playSound('success');
      showToast(liveDeposit ? 'Vault deposit updated' : 'Vault deposit recorded');
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

  // ── Withdraw from Vault handler ───────────────────────────────────────────
  const handleVaultWithdraw = async () => {
    const label = withdrawLabel.trim().toUpperCase();
    const amount = Number(withdrawAmount);
    if (!label || !amount || amount <= 0 || !branchVault) return;
    if (amount > branchVault.balance) return;

    setIsSubmittingWithdraw(true);
    setWithdrawUploadProgress(10);
    let receiptUrl = '';

    try {
      if (withdrawFile) {
        setWithdrawUploadProgress(30);
        const compressedBlob = await compressImage(withdrawFile);
        setWithdrawUploadProgress(50);
        const filePath = `${branch.id}/vault/${Date.now()}_withdrawal.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('receipts').upload(filePath, compressedBlob, { contentType: 'image/jpeg' });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('receipts').getPublicUrl(filePath);
        receiptUrl = data.publicUrl;
      }

      setWithdrawUploadProgress(70);

      // Re-fetch live balance to avoid stale prop writing a wrong value
      const { data: liveVaultData } = await supabase
        .from(DB_TABLES.BRANCH_VAULTS)
        .select(DB_COLUMNS.VAULT_BALANCE)
        .eq(DB_COLUMNS.BRANCH_ID, branch.id)
        .single();
      const liveBalance: number = liveVaultData?.[DB_COLUMNS.VAULT_BALANCE] ?? branchVault.balance;

      const manilaDate = toManilaDate(getTrueISOString());
      const timePart = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).format(new Date());
      const timestamp = `${manilaDate}T${timePart}.000+08:00`;
      const txId = Math.random().toString(36).substr(2, 9);

      const { error: txErr } = await supabase.from(DB_TABLES.VAULT_TRANSACTIONS).insert({
        [DB_COLUMNS.ID]: txId,
        [DB_COLUMNS.BRANCH_ID]: branch.id,
        [DB_COLUMNS.TYPE]: 'WITHDRAWAL',
        [DB_COLUMNS.AMOUNT]: amount,
        [DB_COLUMNS.NAME]: label,
        [DB_COLUMNS.TIMESTAMP]: timestamp,
        [DB_COLUMNS.RECEIPT_IMAGE]: receiptUrl || null,
        [DB_COLUMNS.PERFORMED_BY]: performedBy ?? null,
      });
      if (txErr) throw txErr;

      setWithdrawUploadProgress(90);
      const newBalance = Math.max(0, liveBalance - amount);
      const { error: vaultErr } = await supabase.from(DB_TABLES.BRANCH_VAULTS)
        .update({ [DB_COLUMNS.VAULT_BALANCE]: newBalance })
        .eq(DB_COLUMNS.BRANCH_ID, branch.id);
      if (vaultErr) throw vaultErr;

      setWithdrawUploadProgress(100);
      playSound('success');
      showToast('Bill payment recorded');
      setShowWithdrawModal(false);
      setWithdrawConfirming(false);
      setWithdrawLabel('');
      setWithdrawAmount('');
      setWithdrawFile(null);
      await queryClient.invalidateQueries({ queryKey: ['vault_transactions', branch.id] });
      refetch();
      onRefresh?.();
    } catch (err: any) {
      showToast(err.message || 'Withdrawal failed', 'error');
      playSound('warning');
    } finally {
      setIsSubmittingWithdraw(false);
      setWithdrawUploadProgress(0);
    }
  };

  // ── Delete today's bill payment ───────────────────────────────────────────
  const handleDeleteVaultBill = async () => {
    if (!vaultBillToDelete || isDeletingVaultBill || !branchVault) return;
    setIsDeletingVaultBill(true);
    try {
      // Re-fetch live balance to prevent stale state
      const { data: liveVaultData } = await supabase
        .from(DB_TABLES.BRANCH_VAULTS)
        .select(DB_COLUMNS.VAULT_BALANCE)
        .eq(DB_COLUMNS.BRANCH_ID, branch.id)
        .single();
      const liveBalance: number = liveVaultData?.[DB_COLUMNS.VAULT_BALANCE] ?? branchVault.balance;
      const refundAmount = vaultBillToDelete.amount;

      // Delete the vault_transaction record
      const { error: txErr } = await supabase
        .from(DB_TABLES.VAULT_TRANSACTIONS)
        .delete()
        .eq(DB_COLUMNS.ID, vaultBillToDelete.id);
      if (txErr) throw txErr;

      // Restore vault balance (capped at target to avoid exceeding it)
      const target = branchVault.target ?? 0;
      const newBalance = target > 0
        ? Math.min(liveBalance + refundAmount, target)
        : liveBalance + refundAmount;
      await supabase
        .from(DB_TABLES.BRANCH_VAULTS)
        .update({ [DB_COLUMNS.VAULT_BALANCE]: newBalance })
        .eq(DB_COLUMNS.BRANCH_ID, branch.id);

      playSound('success');
      showToast('Bill payment reversed');
      setVaultBillToDelete(null);
      await queryClient.invalidateQueries({ queryKey: ['vault_transactions', branch.id] });
      refetch();
      onRefresh?.();
    } catch (err: any) {
      showToast(err.message || 'Reversal failed', 'error');
      playSound('warning');
    } finally {
      setIsDeletingVaultBill(false);
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
    if (q) list = list.filter(t =>
      (t.name || '').toLowerCase().includes(q) ||
      (t.performedBy || '').toLowerCase().includes(q) ||
      t.amount.toLocaleString().includes(q) ||
      String(t.amount).includes(q)
    );
    return list;
  }, [transactions, filter, selectedMonth, historySearch]);

  const grouped = useMemo(() => {
    const map = new Map<string, VaultTransaction[]>();
    for (const tx of filtered.slice(0, visibleHistory)) {
      const d = toManilaDate(tx.timestamp);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(tx);
    }
    return Array.from(map.entries()); // already newest-first from query
  }, [filtered, visibleHistory]);

  const depositCount = transactions.filter(t => t.type === 'deposit').length;
  const withdrawalCount = transactions.filter(t => t.type === 'withdrawal').length;

  return (
    <div className="w-full mx-auto pb-4 space-y-6">

      {/* Toast */}
      {toast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[400] px-6 py-3 rounded-full shadow-2xl animate-in slide-in-from-top-6 duration-300 font-bold text-[11px] uppercase tracking-[0.1em] bg-slate-900 text-white border border-white/10 flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${toast.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'} animate-pulse`} />
          {toast.message}
        </div>
      )}

      {/* Vault disabled notice */}
      {!branch.vaultEnabled && (
        <div className="flex items-center gap-3 px-5 py-3.5 bg-amber-50 border border-amber-200 rounded-2xl">
          <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <p className="text-[11px] font-black text-amber-800 uppercase tracking-widest leading-none">Vault Disabled</p>
            <p className="text-[9px] font-bold text-amber-600 mt-0.5">This vault is archived. Balance and history are read-only.</p>
          </div>
        </div>
      )}

      {/* ── Vault Balance KPI ── */}
      <div className={`bg-slate-900 text-white p-6 sm:p-8 ${UI_THEME.radius.card} shadow-xl space-y-5`}>
        <div className="space-y-4">
          {/* Balance hero */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-300 mb-2 flex items-center gap-1.5">
                <Landmark className="w-3 h-3 opacity-60" />
                Vault Fund
              </p>
              <p className={`text-3xl sm:text-5xl lg:text-6xl font-black tabular-nums tracking-tighter leading-none ${!branchVault || branchVault.balance <= 0 ? 'text-slate-500' : 'text-emerald-400'}`}>
                ₱{(branchVault?.balance ?? 0).toLocaleString()}
              </p>
              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-2">Running Balance</p>
            </div>
          </div>
          {/* Deposited / Withdrawn / Starting — tap to expand */}
          <button
            className="w-full text-left flex items-center justify-between"
            onClick={() => setKpiExpanded(v => !v)}
          >
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Overview</span>
            <svg className={`w-3 h-3 text-slate-500 transition-transform duration-200 ${kpiExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>
          {kpiExpanded && (
            <div className={`grid gap-2 ${(branchVault?.initialBalance ?? 0) > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <div className="bg-white/5 rounded-2xl px-3 py-2.5">
                <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Deposited</p>
                <p className="text-sm font-black text-emerald-400 tabular-nums">+₱{totalDeposits.toLocaleString()}</p>
              </div>
              <div className="bg-white/5 rounded-2xl px-3 py-2.5">
                <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Withdrawn</p>
                <p className="text-sm font-black text-rose-400 tabular-nums">−₱{totalWithdrawals.toLocaleString()}</p>
              </div>
              {(branchVault?.initialBalance ?? 0) > 0 && (
                <div className="bg-white/5 rounded-2xl px-3 py-2.5">
                  <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Starting</p>
                  <p className="text-sm font-black text-slate-300 tabular-nums">₱{(branchVault!.initialBalance).toLocaleString()}</p>
                </div>
              )}
            </div>
          )}
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

        {/* Deposit + Withdraw buttons */}
        {!isClosedMode && branch.vaultEnabled && (
          <div className="flex gap-2 mt-1">
            <button
              onClick={() => {
                setWithdrawLabel('');
                setWithdrawAmount('');
                setWithdrawFile(null);
                setShowWithdrawModal(true);
                playSound('click');
              }}
              disabled={!branchVault || branchVault.balance <= 0}
              className="flex-1 py-3 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 font-black text-[10px] uppercase tracking-widest transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <ArrowDownCircle className="w-4 h-4" />
              Withdraw
            </button>
            <button
              onClick={() => {
                const firstReport = currentWeekReports[0];
                const firstDate = firstReport?.reportDate ?? null;
                setDepositSelectedDate(firstDate);
                if (firstDate) {
                  const existing = transactions.find(
                    t => t.type === 'deposit' && toManilaDate(t.timestamp) === firstDate,
                  );
                  setDepositAmount(existing ? String(existing.amount) : String(Math.max(0, firstReport?.netRoi ?? 0)));
                }
                setShowDepositModal(true);
                playSound('click');
              }}
              className="flex-1 py-3 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-black text-[10px] uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <ArrowUpCircle className="w-4 h-4" />
              Deposit
            </button>
          </div>
        )}

      </div>

      {/* ── 2-column: Bills | Vault History ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

      {/* ── Vault-Paid Expenses ── */}
      {(() => {
        const bq = billsSearch.trim().toLowerCase();
        const allVaultWithdrawals = transactions.filter(t => t.type === 'withdrawal').filter(t =>
          !bq ||
          (t.name || '').toLowerCase().includes(bq) ||
          (t.performedBy || '').toLowerCase().includes(bq) ||
          t.amount.toLocaleString().includes(bq) ||
          String(t.amount).includes(bq)
        );
        const totalVaultUsed = allVaultWithdrawals.reduce((s, t) => s + t.amount, 0);

        // Group visible slice by Manila date
        const byDate = new Map<string, VaultTransaction[]>();
        for (const tx of allVaultWithdrawals.slice(0, visibleBills)) {
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
            <div className="px-6 sm:px-8 pt-6 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                  <Banknote className="w-5 h-5 text-amber-500" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-black text-slate-800 leading-none tracking-tight">Bills Paid</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1 truncate">
                    Vault Outflows{totalVaultUsed > 0 && <span className="text-amber-500 ml-1.5 tabular-nums">· ₱{totalVaultUsed.toLocaleString()}</span>}
                  </p>
                </div>
              </div>
            </div>

            {/* Search bar */}
            <div className="px-4 sm:px-8 pb-3 pt-1 border-b border-slate-100">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input
                  type="text"
                  value={billsSearch}
                  onChange={e => setBillsSearch(e.target.value)}
                  placeholder="SEARCH NAME, AMOUNT...."
                  className="w-full pl-8 pr-8 py-2 text-[11px] font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-slate-400 focus:bg-white transition-all placeholder:text-slate-300"
                />
                {billsSearch && (
                  <button
                    type="button"
                    onClick={() => setBillsSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full bg-slate-300 text-white hover:bg-slate-400 transition-colors"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
            </div>

            {txLoading ? (
              <div className="divide-y divide-slate-50 border-t border-slate-100">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                    <div className="w-10 h-10 rounded-2xl bg-amber-100/60 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-slate-100 rounded-lg w-2/5" />
                      <div className="h-2 bg-slate-50 rounded-lg w-1/4" />
                    </div>
                    <div className="h-4 w-14 bg-amber-100/60 rounded-lg shrink-0" />
                  </div>
                ))}
              </div>
            ) : allVaultWithdrawals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 gap-3 border-t border-slate-50">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center">
                  <Banknote className="w-5 h-5 text-slate-200" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">{billsSearch ? 'No results' : 'No vault payments yet'}</p>
                  <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest px-8">{billsSearch ? `No matches for "${billsSearch}"` : 'Bills & expenses paid from vault will appear here'}</p>
                </div>
              </div>
            ) : (
              <div className="overflow-y-auto max-h-[480px] border-t border-slate-100">
                {groupedWithdrawals.map(([date, txs]) => (
                  <div key={date}>
                    {/* Date group header */}
                    <div className="px-4 sm:px-8 py-2 flex items-center gap-3">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">{formatDate(date)}</p>
                      <div className="flex-1 h-px bg-slate-100" />
                    </div>
                    {/* Transaction rows */}
                    <div className="px-3 sm:px-5 pb-2 space-y-1.5">
                      {txs.map(tx => {
                        const isToday = toManilaDate(tx.timestamp) === manilaToday;
                        return (
                          <div key={tx.id} className="flex items-center gap-2">
                            <button
                              onClick={() => { setSelectedTx(tx); playSound('click'); }}
                              className="flex-1 flex items-center gap-3 px-3 py-3 rounded-2xl bg-amber-50/60 hover:bg-amber-50 active:scale-[0.98] transition-all text-left min-w-0"
                            >
                              <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 bg-amber-100 text-amber-600">
                                <Banknote className="w-4.5 h-4.5" style={{ width: '1.1rem', height: '1.1rem' }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-black text-slate-800 uppercase tracking-tight truncate">{stripVaultPrefix(tx.name)}</p>
                                <p className="text-[9px] font-bold text-slate-400 tabular-nums mt-0.5">{formatTime(tx.timestamp)}</p>
                                {tx.performedBy && (
                                  <p className="text-[9px] font-semibold text-slate-400 truncate mt-0.5"><span className="font-black uppercase tracking-widest text-[8px]">By:</span> {tx.performedBy}</p>
                                )}
                              </div>
                              <div className="shrink-0 flex items-center gap-1.5">
                                <p className="text-[15px] font-black tabular-nums text-amber-600">
                                  −₱{tx.amount.toLocaleString()}
                                </p>
                                <svg className="w-3.5 h-3.5 text-slate-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                              </div>
                            </button>
                            {isToday && !isClosedMode && !tx.name.startsWith('VAULT: ') && (
                              <button
                                onClick={() => { setVaultBillToDelete({ id: tx.id, name: stripVaultPrefix(tx.name), amount: tx.amount }); playSound('warning'); }}
                                className="w-9 h-9 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-400 hover:text-rose-600 flex items-center justify-center shrink-0 transition-all active:scale-95"
                                title="Reverse payment"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {/* Infinite scroll sentinel */}
                {visibleBills < allVaultWithdrawals.length && (
                  <div ref={billsBottomRef} className="px-4 py-4 space-y-2">
                    {[1,2,3].map(i => (
                      <div key={i} className="flex items-center gap-3 px-3 py-3 rounded-2xl bg-amber-50/40 animate-pulse">
                        <div className="w-10 h-10 rounded-2xl bg-amber-100 shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 bg-amber-100 rounded-lg w-2/5" />
                          <div className="h-2 bg-amber-50 rounded-lg w-1/4" />
                        </div>
                        <div className="h-4 w-14 bg-amber-100 rounded-lg shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
                {visibleBills >= allVaultWithdrawals.length && allVaultWithdrawals.length > 0 && (
                  <p className="text-center text-[9px] font-black text-slate-300 uppercase tracking-widest py-4">
                    {allVaultWithdrawals.length} record{allVaultWithdrawals.length !== 1 ? 's' : ''} total
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Vault History ── */}
      <div className={`bg-white ${UI_THEME.radius.card} border border-slate-100 shadow-sm overflow-hidden`}>

        {/* Collapsible header */}
        <button
          type="button"
          onClick={() => setHistoryExpanded(v => !v)}
          className="w-full px-6 sm:px-8 py-5 flex items-center justify-between gap-3 hover:bg-slate-50/60 active:bg-slate-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">Vault History</h3>
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
            <div className="border-b border-slate-100 space-y-2 pb-3">
              {/* Search bar */}
              <div className="relative px-4 sm:px-8 pt-3">
                <svg className="absolute left-7 sm:left-11 top-1/2 mt-1.5 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input
                  type="text"
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  placeholder="SEARCH NAME, AMOUNT...."
                  className="w-full pl-8 pr-8 py-2 text-[11px] font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-slate-400 focus:bg-white transition-all placeholder:text-slate-300"
                />
                {historySearch && (
                  <button
                    type="button"
                    onClick={() => setHistorySearch('')}
                    className="absolute right-7 sm:right-11 top-1/2 mt-1.5 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full bg-slate-300 text-white hover:bg-slate-400 transition-colors"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>

              {/* Type + month filters — single scrollable row */}
              <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 sm:px-8 pb-0.5">
                {([
                  { key: 'all', label: 'All', count: transactions.length },
                  { key: 'deposits', label: 'Deposits', count: depositCount },
                  { key: 'withdrawals', label: 'Withdrawals', count: withdrawalCount },
                ] as { key: FilterType; label: string; count: number }[]).map(f => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shrink-0 ${
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
                {availableMonths.length > 1 && (
                  <>
                    <div className="w-px bg-slate-200 shrink-0 self-stretch my-1" />
                    <button
                      onClick={() => setSelectedMonth(null)}
                      className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shrink-0 ${
                        selectedMonth === null ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      All Months
                    </button>
                    {availableMonths.map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setSelectedMonth(key === selectedMonth ? null : key)}
                        className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shrink-0 ${
                          selectedMonth === key ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </>
                )}
              </div>
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
                  {historySearch && <><br /><span className="text-[8px]">Try searching by name or amount (e.g. 2,200 or 2200)</span></>}
                </p>
              </div>
            ) : (
              <div className="overflow-y-auto max-h-[480px]">
                {grouped.map(([date, txs]) => (
                  <div key={date}>
                    {/* Date group header */}
                    <div className="px-4 sm:px-8 py-2 flex items-center gap-3">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">{formatDate(date)}</p>
                      <div className="flex-1 h-px bg-slate-100" />
                    </div>

                    {/* Transactions in this date group */}
                    <div className="px-3 sm:px-5 pb-2 space-y-1.5">
                      {txs.map(tx => {
                        const isAdmin = (tx.type ?? '').toUpperCase() === 'ADMIN_DEPOSIT';
                        const isWithdrawal = tx.type === 'withdrawal';
                        return (
                          <button
                            key={tx.id}
                            onClick={() => { setSelectedTx(tx); playSound('click'); }}
                            className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl transition-all active:scale-[0.98] text-left ${
                              isWithdrawal ? 'bg-rose-50/60 hover:bg-rose-50' : isAdmin ? 'bg-violet-50/60 hover:bg-violet-50' : 'bg-emerald-50/40 hover:bg-emerald-50/70'
                            }`}
                          >
                            {/* Icon */}
                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                              isWithdrawal ? 'bg-rose-100 text-rose-500' : isAdmin ? 'bg-violet-100 text-violet-600' : 'bg-emerald-100 text-emerald-600'
                            }`}>
                              {isWithdrawal
                                ? <ArrowUpCircle className="w-4.5 h-4.5" />
                                : <ArrowDownCircle className="w-4.5 h-4.5" />}
                            </div>

                            {/* Label + meta */}
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-black text-slate-800 uppercase tracking-tight truncate">{tx.name}</p>
                              <p className="text-[9px] font-bold text-slate-400 tabular-nums mt-0.5">{formatTime(tx.timestamp)}</p>
                              {tx.performedBy && (
                                <p className="text-[9px] font-semibold text-slate-400 truncate mt-0.5"><span className="font-black uppercase tracking-widest text-[8px]">By:</span> {tx.performedBy}</p>
                              )}
                            </div>

                            {/* Amount + chevron */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <p className={`text-[15px] font-black tabular-nums ${isWithdrawal ? 'text-rose-600' : isAdmin ? 'text-violet-600' : 'text-emerald-700'}`}>
                                {isWithdrawal ? '−' : '+'}₱{tx.amount.toLocaleString()}
                              </p>
                              <svg className="w-3.5 h-3.5 text-slate-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {/* Infinite scroll sentinel */}
                {visibleHistory < filtered.length && (
                  <div ref={historyBottomRef} className="px-4 py-4 space-y-2">
                    {[1,2,3].map(i => (
                      <div key={i} className="flex items-center gap-3 px-3 py-3 rounded-2xl bg-slate-50 animate-pulse">
                        <div className="w-10 h-10 rounded-2xl bg-slate-200 shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 bg-slate-200 rounded-lg w-2/5" />
                          <div className="h-2 bg-slate-100 rounded-lg w-1/4" />
                        </div>
                        <div className="h-4 w-16 bg-slate-200 rounded-lg shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
                {visibleHistory >= filtered.length && filtered.length > 0 && (
                  <p className="text-center text-[9px] font-black text-slate-300 uppercase tracking-widest py-4">
                    {filtered.length} record{filtered.length !== 1 ? 's' : ''} total
                  </p>
                )}
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
            className="w-full sm:max-w-sm bg-white rounded-t-[32px] sm:rounded-[32px] shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 max-h-[90dvh] sm:max-h-[85dvh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle (mobile only) */}
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mt-4 sm:hidden shrink-0" />

            <div className="p-6 sm:p-8 space-y-5 overflow-y-auto">
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
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-0.5">Select Report Date (Last 7 Days)</p>
                {currentWeekReports.length === 0 ? (
                  <div className="bg-slate-50 rounded-2xl p-4 text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No reports in the last 7 days</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto">
                    {currentWeekReports.map(r => {
                      const isSelected = depositSelectedDate === r.reportDate;
                      const existingForDate = transactions.find(
                        t => t.type === 'deposit' && toManilaDate(t.timestamp) === r.reportDate,
                      );
                      const roi = r.netRoi;
                      const existingAmt = existingForDate?.amount ?? 0;
                      // Cap by space remaining to vault target
                      const vTarget = branchVault?.target ?? 0;
                      const space = vTarget > 0
                        ? Math.max(0, vTarget - (branchVault?.balance ?? 0) + existingAmt)
                        : Infinity;
                      const roiAvailable = existingForDate ? roi + existingAmt : roi;
                      const availableRoi = space === Infinity ? roiAvailable : Math.min(roiAvailable, space);
                      const hasRoi = availableRoi > 0;
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
                            // Pre-fill with existing deposit amount if updating, else full ROI (target cap enforced at validation)
                            setDepositAmount(existingForDate ? String(existingForDate.amount) : String(Math.max(0, roiAvailable)));
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
                            <div>
                              <span className={`text-[10px] font-black uppercase tracking-widest ${isSelected ? 'text-indigo-900' : 'text-slate-700'}`}>{dateLabel}</span>
                              {existingForDate && (
                                <p className="text-[7px] font-bold text-amber-500 uppercase tracking-widest">Deposited ₱{existingForDate.amount.toLocaleString()} · Tap to update</p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={`text-[11px] font-black tabular-nums ${hasRoi ? (isSelected ? 'text-indigo-600' : 'text-emerald-600') : 'text-slate-400'}`}>
                              ₱{roiAvailable.toLocaleString()}
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
                const isToday = depositSelectedDate === todayStr;
                const report = currentWeekReports.find(r => r.reportDate === depositSelectedDate);
                const existingDeposit = transactions.find(
                  t => t.type === 'deposit' && toManilaDate(t.timestamp) === depositSelectedDate,
                );
                const existingAmount = existingDeposit?.amount ?? 0;
                // Max = min(ROI, space remaining to target)
                const baseMax = isToday ? (todayNetRoi ?? 0) : (report?.netRoi ?? 0);
                const roiMax = baseMax + existingAmount;
                const target = branchVault?.target ?? 0;
                const spaceToTarget = target > 0
                  ? Math.max(0, target - (branchVault?.balance ?? 0) + existingAmount)
                  : Infinity;
                const maxAmount = spaceToTarget === Infinity ? roiMax : Math.min(roiMax, spaceToTarget);
                const isTargetCapped = target > 0 && spaceToTarget < roiMax;
                const amt = Number(depositAmount) || 0;
                // Balance preview: delta from existing deposit (or full amount if new)
                const balanceDelta = existingDeposit ? amt - existingDeposit.amount : amt;
                const afterBalance = (branchVault?.balance ?? 0) + balanceDelta;
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
                        <p className="text-[9px] font-bold text-rose-500 uppercase tracking-widest ml-0.5">
                          {isTargetCapped
                            ? `Vault target reached — max deposit is ₱${maxAmount.toLocaleString()}`
                            : `Exceeds available ROI of ₱${maxAmount.toLocaleString()}`}
                        </p>
                      )}
                    </div>

                    {/* After-deposit preview */}
                    {amt > 0 && !isOverMax && (
                      <div className="bg-indigo-50 rounded-2xl px-4 py-3 space-y-2">
                        <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">{existingDeposit ? 'After Update' : 'After Deposit'}</p>
                        <div className="flex items-end justify-between">
                          <p className="text-lg font-black text-indigo-700 tabular-nums leading-none">₱{afterBalance.toLocaleString()}</p>
                          {target > 0 && <p className="text-[10px] font-black text-indigo-500 tabular-nums">{afterPct}% of target</p>}
                        </div>
                        {target > 0 && (
                          <div className="w-full h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${afterPct}%` }} />
                          </div>
                        )}
                        {existingDeposit ? (
                          <p className="text-[8px] font-bold text-indigo-400 uppercase tracking-widest tabular-nums">
                            Replaces ₱{existingDeposit.amount.toLocaleString()} deposit · {balanceDelta >= 0 ? '+' : ''}₱{balanceDelta.toLocaleString()} net change
                          </p>
                        ) : (
                          <p className="text-[8px] font-bold text-indigo-400 uppercase tracking-widest tabular-nums">
                            ROI deducted: −₱{amt.toLocaleString()} from {new Date(depositSelectedDate + 'T00:00:00+08:00').toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' }).toUpperCase()}
                          </p>
                        )}
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
                  disabled={(() => {
                    if (isSubmittingDeposit || !depositSelectedDate || !depositAmount || Number(depositAmount) <= 0) return true;
                    const amt = Number(depositAmount);
                    const existingAmt = transactions.find(
                      t => t.type === 'deposit' && toManilaDate(t.timestamp) === depositSelectedDate,
                    )?.amount ?? 0;
                    const baseMax = depositSelectedDate === todayStr
                      ? (todayNetRoi ?? 0)
                      : (currentWeekReports.find(r => r.reportDate === depositSelectedDate)?.netRoi ?? 0);
                    const roiMax = baseMax + existingAmt;
                    const vTarget = branchVault?.target ?? 0;
                    const space = vTarget > 0 ? Math.max(0, vTarget - (branchVault?.balance ?? 0) + existingAmt) : Infinity;
                    const cappedMax = space === Infinity ? roiMax : Math.min(roiMax, space);
                    return amt > cappedMax;
                  })()}
                  className="h-12 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSubmittingDeposit
                    ? 'Saving…'
                    : transactions.find(t => t.type === 'deposit' && toManilaDate(t.timestamp) === depositSelectedDate)
                      ? `Update ₱${(Number(depositAmount) || 0).toLocaleString()}`
                      : `Deposit ₱${(Number(depositAmount) || 0).toLocaleString()}`}
                </button>
              </div>

            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Withdraw from Vault Modal ── */}
      {showWithdrawModal && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200 p-4"
          onClick={() => { setShowWithdrawModal(false); setWithdrawLabel(''); setWithdrawAmount(''); setWithdrawFile(null); }}
        >
          <div
            className="w-full max-w-sm bg-white rounded-[32px] shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[92svh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="overflow-y-auto flex-1 p-6 space-y-5">

              {/* Header */}
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">Pay Bill from Vault</h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{branch.name} · Deduct from vault balance</p>
                </div>
                <button
                  onClick={() => { setShowWithdrawModal(false); setWithdrawLabel(''); setWithdrawAmount(''); setWithdrawFile(null); }}
                  className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Current vault balance */}
              <div className="bg-slate-900 rounded-2xl px-4 py-3 flex items-center justify-between">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Available Balance</p>
                <p className="text-base font-black text-emerald-400 tabular-nums">₱{(branchVault?.balance ?? 0).toLocaleString()}</p>
              </div>

              {/* Label */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-0.5">
                  Purpose / Label <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  value={withdrawLabel}
                  onChange={e => setWithdrawLabel(e.target.value)}
                  placeholder="e.g. RENT, ELECTRICITY, SUPPLIES"
                  className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-[12px] font-bold uppercase outline-none focus:border-amber-400 focus:bg-white transition-colors placeholder:normal-case placeholder:font-normal"
                />
              </div>

              {/* Amount */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-0.5">
                  Amount <span className="text-rose-500">*</span>
                </label>
                {(() => {
                  const maxBal = branchVault?.balance ?? 0;
                  const amt = Number(withdrawAmount) || 0;
                  const isOverMax = amt > maxBal;
                  const afterBalance = Math.max(0, maxBal - amt);
                  return (
                    <div className="space-y-2">
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-black text-slate-400">₱</span>
                        <input
                          type="number"
                          min="1"
                          max={maxBal}
                          value={withdrawAmount}
                          onChange={e => setWithdrawAmount(e.target.value)}
                          className={`w-full pl-8 pr-4 py-3 rounded-xl border-2 text-[15px] font-black tabular-nums outline-none transition-all ${
                            isOverMax
                              ? 'border-rose-400 bg-rose-50 text-rose-700'
                              : 'border-slate-200 bg-slate-50 text-amber-900 focus:border-amber-400 focus:bg-white'
                          }`}
                        />
                      </div>
                      {isOverMax && (
                        <p className="text-[9px] font-bold text-rose-500 uppercase tracking-widest ml-0.5">Exceeds vault balance of ₱{maxBal.toLocaleString()}</p>
                      )}
                      {amt > 0 && !isOverMax && (
                        <div className="bg-amber-50 rounded-2xl px-4 py-3 flex items-center justify-between">
                          <p className="text-[8px] font-black text-amber-400 uppercase tracking-widest">Vault after withdrawal</p>
                          <p className="text-base font-black text-amber-700 tabular-nums">₱{afterBalance.toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Receipt (required) */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-0.5">Receipt <span className="text-rose-500">*</span></label>
                <input
                  ref={withdrawFileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => setWithdrawFile(e.target.files?.[0] ?? null)}
                />
                {withdrawFile ? (
                  <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      <p className="text-[10px] font-bold text-amber-700 truncate">{withdrawFile.name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setWithdrawFile(null); if (withdrawFileInputRef.current) withdrawFileInputRef.current.value = ''; }}
                      className="w-6 h-6 rounded-lg bg-rose-100 text-rose-500 hover:bg-rose-200 flex items-center justify-center shrink-0 ml-2 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => withdrawFileInputRef.current?.click()}
                    className="w-full py-4 rounded-xl border-2 border-dashed border-rose-200 bg-rose-50/30 text-[10px] font-bold text-rose-400 uppercase tracking-widest hover:border-rose-400 hover:bg-rose-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    Tap to attach receipt
                  </button>
                )}
              </div>

              {/* Upload progress bar */}
              {isSubmittingWithdraw && withdrawUploadProgress > 0 && withdrawUploadProgress < 100 && (
                <div className="space-y-1.5">
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all duration-300"
                      style={{ width: `${withdrawUploadProgress}%` }}
                    />
                  </div>
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest text-center">
                    Uploading receipt…
                  </p>
                </div>
              )}

              {/* Actions */}
              {withdrawConfirming ? (
                /* ── Confirmation step ── */
                <div className="space-y-3">
                  <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl overflow-hidden">
                    <div className="px-4 py-2.5 bg-amber-100/60 border-b border-amber-200">
                      <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Confirm Payment</p>
                    </div>
                    <div className="divide-y divide-amber-100">
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Bill</span>
                        <span className="text-[11px] font-black text-slate-700 uppercase">{withdrawLabel}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Amount</span>
                        <span className="text-[13px] font-black text-amber-600 tabular-nums">−₱{(Number(withdrawAmount) || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/60">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Vault After</span>
                        <span className="text-[11px] font-black text-slate-600 tabular-nums">₱{Math.max(0, (branchVault?.balance ?? 0) - (Number(withdrawAmount) || 0)).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setWithdrawConfirming(false)}
                      className="h-12 bg-white border border-slate-200 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleVaultWithdraw}
                      disabled={isSubmittingWithdraw}
                      className="h-12 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      {isSubmittingWithdraw
                        ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</>
                        : 'Confirm Payment'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => { setShowWithdrawModal(false); setWithdrawConfirming(false); setWithdrawLabel(''); setWithdrawAmount(''); setWithdrawFile(null); }}
                    className="h-12 bg-white border border-slate-200 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const isValid = withdrawLabel.trim() && withdrawAmount && Number(withdrawAmount) > 0 && withdrawFile && Number(withdrawAmount) <= (branchVault?.balance ?? 0);
                      if (isValid) setWithdrawConfirming(true);
                    }}
                    disabled={(() => {
                      if (!withdrawLabel.trim() || !withdrawAmount || Number(withdrawAmount) <= 0) return true;
                      if (!withdrawFile) return true;
                      return Number(withdrawAmount) > (branchVault?.balance ?? 0);
                    })()}
                    className="h-12 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Review Payment
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Delete Bill Confirmation Modal ── */}
      {vaultBillToDelete && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200 p-4" onClick={() => !isDeletingVaultBill && setVaultBillToDelete(null)}>
          <div className="w-full max-w-sm bg-white rounded-[32px] shadow-2xl p-8 animate-in zoom-in-95 duration-200 text-center" onClick={e => e.stopPropagation()}>
            <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center mx-auto mb-5">
              <Trash2 className="w-6 h-6 text-rose-400" />
            </div>
            <h4 className="text-[18px] font-black text-slate-900 uppercase tracking-tight mb-1">Reverse Payment?</h4>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-5">This will restore the amount to your vault fund</p>
            <div className="bg-slate-50 rounded-2xl divide-y divide-slate-100 mb-6 text-left">
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Bill</span>
                <span className="text-[11px] font-black text-slate-700 uppercase">{vaultBillToDelete.name}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Refund</span>
                <span className="text-[13px] font-black text-emerald-600 tabular-nums">+₱{vaultBillToDelete.amount.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Vault After</span>
                <span className="text-[11px] font-black text-slate-600 tabular-nums">₱{((branchVault?.balance ?? 0) + vaultBillToDelete.amount).toLocaleString()}</span>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleDeleteVaultBill}
                disabled={isDeletingVaultBill}
                className="w-full py-4 rounded-2xl bg-rose-500 text-white font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {isDeletingVaultBill ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Reversing…</> : 'Yes, Reverse Payment'}
              </button>
              <button
                onClick={() => setVaultBillToDelete(null)}
                disabled={isDeletingVaultBill}
                className="w-full py-3 rounded-2xl text-slate-400 font-black text-[11px] uppercase tracking-widest hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};
