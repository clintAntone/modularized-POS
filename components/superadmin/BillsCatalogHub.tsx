import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Branch, BranchBill, BillPayment, BillStatus, BillsCatalogItem } from '../../types';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { supabase } from '../../lib/supabase';
import { playSound } from '../../lib/audio';
import { UI_THEME } from '../../constants/ui_designs';
import {
  Plus, Edit2, Trash2, X, ChevronDown, ChevronRight,
  BookOpen, Layers, Check, AlertTriangle
} from 'lucide-react';

interface BillsCatalogHubProps {
  branches: Branch[];
  isReadOnly?: boolean;
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

const STATUS_CONFIG: Record<BillStatus, { label: string; bg: string; text: string; dot: string }> = {
  PAID:      { label: 'PAID',      bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  OVERDUE:   { label: 'OVERDUE',   bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-500' },
  DUE_SOON:  { label: 'DUE SOON',  bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  UPCOMING:  { label: 'UPCOMING',  bg: 'bg-slate-100',  text: 'text-slate-500',   dot: 'bg-slate-400' },
  AS_NEEDED: { label: 'AS NEEDED', bg: 'bg-indigo-50',  text: 'text-indigo-700',  dot: 'bg-indigo-400' },
};

type HubTab = 'catalog' | 'branches';

function getManilaDateParts() {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = fmt.formatToParts(new Date());
  const year = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  const day = parseInt(parts.find(p => p.type === 'day')!.value, 10);
  return { year, month, day, period: `${year}-${month}` };
}

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function formatPeriod(period: string) {
  const [y, m] = period.split('-');
  return `${MONTHS[parseInt(m, 10) - 1].label} ${y}`;
}

// ── Catalog form state ────────────────────────────────────
type CatalogForm = {
  name: string;
  category: 'MONTHLY' | 'AS_NEEDED';
  suggestedAmount: string;
  dueDay: string;
  notes: string;
};
const emptyCatalogForm: CatalogForm = { name: '', category: 'MONTHLY', suggestedAmount: '', dueDay: '', notes: '' };

// ── Bill form state (branch-specific) ────────────────────
type BillForm = {
  name: string;
  category: 'MONTHLY' | 'AS_NEEDED';
  amount: string;
  dueDay: string;
  notes: string;
};
const emptyBillForm: BillForm = { name: '', category: 'MONTHLY', amount: '', dueDay: '', notes: '' };

// ── Main component ────────────────────────────────────────
export const BillsCatalogHub: React.FC<BillsCatalogHubProps> = ({ branches, isReadOnly }) => {
  const { period: currentPeriod, day: manilaDay, year: manilaYear, month: manilaMonth } = getManilaDateParts();

  const [activeTab, setActiveTab] = useState<HubTab>('catalog');
  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod);
  const [toast, setToast] = useState<Toast | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Catalog tab state
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [editingCatalog, setEditingCatalog] = useState<BillsCatalogItem | null>(null);
  const [catalogForm, setCatalogForm] = useState<CatalogForm>(emptyCatalogForm);
  const [archivingCatalog, setArchivingCatalog] = useState<BillsCatalogItem | null>(null);
  const [assigningCatalog, setAssigningCatalog] = useState<BillsCatalogItem | null>(null);
  const [assignBranches, setAssignBranches] = useState<Set<string>>(new Set());

  // Branches tab state
  const [collapsedBranches, setCollapsedBranches] = useState<Set<string>>(new Set());
  const [addBillTarget, setAddBillTarget] = useState<string>('');
  const [addBillMode, setAddBillMode] = useState<'choice' | 'catalog' | 'custom' | null>(null);
  const [editingBill, setEditingBill] = useState<BranchBill | null>(null);
  const [billForm, setBillForm] = useState<BillForm>(emptyBillForm);
  const [deletingBill, setDeletingBill] = useState<BranchBill | null>(null);
  const [catalogPickBranchId, setCatalogPickBranchId] = useState<string>('');
  const [pickedCatalogItems, setPickedCatalogItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  };

  // ── Queries ──────────────────────────────────────────────
  const { data: catalog = [], isLoading: catalogLoading, refetch: refetchCatalog } = useQuery<BillsCatalogItem[]>({
    queryKey: [DB_TABLES.BILLS_CATALOG],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(DB_TABLES.BILLS_CATALOG)
        .select('*')
        .order(DB_COLUMNS.CREATED_AT, { ascending: true });
      if (error) throw error;
      return data.map(r => ({
        id: r.id, name: r.name,
        category: r.category as 'MONTHLY' | 'AS_NEEDED',
        dueDay: r.due_day ?? undefined,
        suggestedAmount: Number(r.suggested_amount || 0),
        notes: r.notes ?? undefined,
        isActive: r.is_active,
        createdBy: r.created_by ?? undefined,
        createdAt: r.created_at
      }));
    }
  });

  const { data: allBills = [], refetch: refetchBills } = useQuery<BranchBill[]>({
    queryKey: [DB_TABLES.BRANCH_BILLS],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(DB_TABLES.BRANCH_BILLS)
        .select('*')
        .eq(DB_COLUMNS.IS_ACTIVE, true)
        .order(DB_COLUMNS.CREATED_AT, { ascending: true });
      if (error) throw error;
      return data.map(r => ({
        id: r.id, branchId: r.branch_id,
        catalogId: r.catalog_id ?? undefined,
        name: r.name,
        category: r.category as 'MONTHLY' | 'AS_NEEDED',
        amount: Number(r.amount || 0), dueDay: r.due_day ?? undefined,
        isActive: r.is_active, notes: r.notes ?? undefined, createdAt: r.created_at
      }));
    }
  });

  const { data: allPayments = [], refetch: refetchPayments } = useQuery<BillPayment[]>({
    queryKey: [DB_TABLES.BILL_PAYMENTS],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(DB_TABLES.BILL_PAYMENTS)
        .select('*')
        .order(DB_COLUMNS.PAID_AT, { ascending: false })
        .limit(2000);
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

  // ── Bill status ───────────────────────────────────────────
  const getBillStatus = (bill: BranchBill, period: string): BillStatus => {
    const isPaid = allPayments.some(p => p.billId === bill.id && p.periodCovered === period);
    if (isPaid) return 'PAID';
    if (bill.category === 'AS_NEEDED') return 'AS_NEEDED';
    if (!bill.dueDay) return 'UPCOMING';
    const [pYear, pMonth] = period.split('-').map(Number);
    const todayYear = parseInt(manilaYear, 10);
    const todayMonth = parseInt(manilaMonth, 10);
    if (pYear < todayYear || (pYear === todayYear && pMonth < todayMonth)) return 'OVERDUE';
    if (pYear > todayYear || (pYear === todayYear && pMonth > todayMonth)) return 'UPCOMING';
    const daysLeft = bill.dueDay - manilaDay;
    if (daysLeft < 0) return 'OVERDUE';
    if (daysLeft <= 5) return 'DUE_SOON';
    return 'UPCOMING';
  };

  // ── Period options ────────────────────────────────────────
  const periodOptions = useMemo(() => {
    const opts: string[] = [];
    const now = new Date();
    for (let i = -9; i <= 2; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return opts.sort((a, b) => b.localeCompare(a));
  }, []);

  // ── Per-branch summaries ──────────────────────────────────
  const billsByBranch = useMemo(() => {
    return branches.map(branch => {
      const bills = allBills.filter(b => b.branchId === branch.id);
      const billsWithStatus = bills.map(b => ({ bill: b, status: getBillStatus(b, selectedPeriod) }));
      const paid = billsWithStatus.filter(b => b.status === 'PAID').length;
      const overdue = billsWithStatus.filter(b => b.status === 'OVERDUE').length;
      const dueSoon = billsWithStatus.filter(b => b.status === 'DUE_SOON').length;
      return { branch, billsWithStatus, paid, overdue, dueSoon };
    });
  }, [branches, allBills, allPayments, selectedPeriod, manilaDay, manilaMonth, manilaYear]);

  // ── Network summary ───────────────────────────────────────
  const summary = useMemo(() => {
    const activeBills = allBills.length;
    const periodPayments = allPayments.filter(p => p.periodCovered === selectedPeriod);
    const paidBillIds = new Set(periodPayments.map(p => p.billId));
    const paidCount = allBills.filter(b => b.category === 'MONTHLY' && paidBillIds.has(b.id)).length;
    const overdueCount = billsByBranch.reduce((s, g) => s + g.overdue, 0);
    const totalPaidAmount = periodPayments.reduce((s, p) => s + p.amountPaid, 0);
    return { activeBills, paidCount, overdueCount, totalPaidAmount };
  }, [allBills, allPayments, billsByBranch, selectedPeriod]);

  // ── Catalog: how many branches have each item assigned ───
  const catalogAssignCount = useMemo(() => {
    const map: Record<string, number> = {};
    allBills.forEach(b => {
      if (b.catalogId) map[b.catalogId] = (map[b.catalogId] || 0) + 1;
    });
    return map;
  }, [allBills]);

  // ─────────────────────────────────────────────────────────
  // CATALOG HANDLERS
  // ─────────────────────────────────────────────────────────
  const handleSaveCatalog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catalogForm.name.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const payload = {
        name: catalogForm.name.trim().toUpperCase(),
        category: catalogForm.category,
        suggested_amount: parseFloat(catalogForm.suggestedAmount) || 0,
        due_day: catalogForm.category === 'MONTHLY' && catalogForm.dueDay ? parseInt(catalogForm.dueDay) : null,
        notes: catalogForm.notes.trim() || null,
        is_active: true,
      };

      if (editingCatalog) {
        const { error } = await supabase.from(DB_TABLES.BILLS_CATALOG).update(payload).eq(DB_COLUMNS.ID, editingCatalog.id);
        if (error) throw error;
        showToast('Template updated');
      } else {
        const { error } = await supabase.from(DB_TABLES.BILLS_CATALOG).insert(payload);
        if (error) throw error;
        showToast('Template created');
      }
      playSound('success');
      setShowCatalogModal(false);
      setEditingCatalog(null);
      setCatalogForm(emptyCatalogForm);
      refetchCatalog();
    } catch (err: any) {
      showToast(err.message || 'Failed to save template', 'error');
      playSound('warning');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchiveCatalog = async () => {
    if (!archivingCatalog || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from(DB_TABLES.BILLS_CATALOG)
        .update({ [DB_COLUMNS.IS_ACTIVE]: false })
        .eq(DB_COLUMNS.ID, archivingCatalog.id);
      if (error) throw error;
      playSound('success');
      showToast('Template archived');
      setArchivingCatalog(null);
      refetchCatalog();
    } catch (err: any) {
      showToast(err.message || 'Failed to archive', 'error');
      playSound('warning');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAssignTobranches = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningCatalog || assignBranches.size === 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      // Skip branches that already have this catalog item assigned
      const alreadyAssigned = new Set(
        allBills.filter(b => b.catalogId === assigningCatalog.id).map(b => b.branchId)
      );
      const toAssign = (Array.from(assignBranches) as string[]).filter(id => !alreadyAssigned.has(id));

      if (toAssign.length === 0) {
        showToast('All selected branches already have this bill', 'error');
        return;
      }

      const rows = toAssign.map(branchId => ({
        branch_id: branchId,
        catalog_id: assigningCatalog.id,
        name: assigningCatalog.name,
        category: assigningCatalog.category,
        amount: assigningCatalog.suggestedAmount,
        due_day: assigningCatalog.dueDay ?? null,
        notes: assigningCatalog.notes ?? null,
        is_active: true,
      }));

      const { error } = await supabase.from(DB_TABLES.BRANCH_BILLS).insert(rows);
      if (error) throw error;

      playSound('success');
      showToast(`Assigned to ${toAssign.length} branch${toAssign.length !== 1 ? 'es' : ''}`);
      setAssigningCatalog(null);
      setAssignBranches(new Set());
      refetchBills();
    } catch (err: any) {
      showToast(err.message || 'Failed to assign', 'error');
      playSound('warning');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────
  // BRANCH BILLS HANDLERS
  // ─────────────────────────────────────────────────────────
  const handleOpenAddBill = (branchId: string) => {
    playSound('click');
    setAddBillTarget(branchId);
    setEditingBill(null);
    setBillForm(emptyBillForm);
    setAddBillMode('choice');
  };

  const handleOpenEditBill = (bill: BranchBill) => {
    playSound('click');
    setEditingBill(bill);
    setAddBillTarget(bill.branchId);
    setBillForm({
      name: bill.name, category: bill.category,
      amount: bill.amount > 0 ? bill.amount.toString() : '',
      dueDay: bill.dueDay?.toString() || '', notes: bill.notes || ''
    });
    setAddBillMode('custom');
  };

  const handleSaveBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billForm.name.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const payload: any = {
        branch_id: addBillTarget,
        name: billForm.name.trim().toUpperCase(),
        category: billForm.category,
        amount: parseFloat(billForm.amount) || 0,
        due_day: billForm.category === 'MONTHLY' && billForm.dueDay ? parseInt(billForm.dueDay) : null,
        notes: billForm.notes.trim() || null,
      };

      if (editingBill) {
        const { error } = await supabase.from(DB_TABLES.BRANCH_BILLS).update(payload).eq(DB_COLUMNS.ID, editingBill.id);
        if (error) throw error;
        showToast('Bill updated');
      } else {
        const { error } = await supabase.from(DB_TABLES.BRANCH_BILLS).insert({ ...payload, is_active: true });
        if (error) throw error;
        showToast('Bill added');
      }
      playSound('success');
      setAddBillMode(null);
      setEditingBill(null);
      refetchBills();
    } catch (err: any) {
      showToast(err.message || 'Failed to save bill', 'error');
      playSound('warning');
    } finally {
      setIsSubmitting(false);
    }
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
      showToast(err.message || 'Failed to remove', 'error');
      playSound('warning');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAssignFromCatalog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pickedCatalogItems.size === 0 || !catalogPickBranchId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const alreadyAssigned = new Set(
        allBills.filter(b => b.branchId === catalogPickBranchId && b.catalogId).map(b => b.catalogId!)
      );
      const toAssign = (Array.from(pickedCatalogItems) as string[]).filter(id => !alreadyAssigned.has(id));

      if (toAssign.length === 0) {
        showToast('All selected items already assigned to this branch', 'error');
        return;
      }

      const rows = toAssign.map(catalogId => {
        const item = catalog.find(c => c.id === catalogId)!;
        return {
          branch_id: catalogPickBranchId,
          catalog_id: catalogId,
          name: item.name,
          category: item.category,
          amount: item.suggestedAmount,
          due_day: item.dueDay ?? null,
          notes: item.notes ?? null,
          is_active: true,
        };
      });

      const { error } = await supabase.from(DB_TABLES.BRANCH_BILLS).insert(rows);
      if (error) throw error;

      playSound('success');
      showToast(`${rows.length} bill${rows.length !== 1 ? 's' : ''} assigned`);
      setAddBillMode(null);
      setPickedCatalogItems(new Set());
      refetchBills();
    } catch (err: any) {
      showToast(err.message || 'Failed to assign', 'error');
      playSound('warning');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────
  // ── Render ────────────────────────────────────────────────
  const activeCatalog = catalog.filter(c => c.isActive);
  const archivedCatalog = catalog.filter(c => !c.isActive);

  if (catalogLoading) {
    return (
      <div className="space-y-4 animate-in fade-in duration-300">
        <div className="bg-white p-6 sm:p-8 rounded-[32px] border border-slate-200 shadow-sm flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-200/60 rounded-2xl animate-pulse" />
            <div className="space-y-2">
              <div className="h-4 bg-slate-200/60 rounded-lg animate-pulse w-36" />
              <div className="h-3 bg-slate-200/60 rounded-lg animate-pulse w-48" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-[24px] border border-slate-100 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-slate-50 last:border-0">
              <div className="h-3 bg-slate-200/60 rounded-lg animate-pulse w-1/3" />
              <div className="h-3 bg-slate-200/60 rounded-lg animate-pulse w-1/5" />
              <div className="h-3 bg-slate-200/60 rounded-lg animate-pulse w-1/6 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Toast */}
      {toast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[400] px-6 py-3 rounded-full shadow-2xl animate-in slide-in-from-top-6 duration-300 font-bold text-[11px] uppercase tracking-[0.1em] bg-slate-900 text-white border border-white/10 flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${toast.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'} animate-pulse`}></div>
          {toast.message}
        </div>
      )}

      {/* ── Page Header ── */}
      <div className="bg-white p-6 sm:p-8 rounded-[32px] border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl shadow-inner">🏢</div>
          <div>
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">Bills Management</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Catalog · Branch Bills</p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex w-full sm:w-auto bg-slate-100 p-1 rounded-2xl gap-1">
          {([
            { id: 'catalog' as HubTab, label: 'Catalog', icon: <BookOpen className="w-3.5 h-3.5" /> },
            { id: 'branches' as HubTab, label: 'Branches', icon: <Layers className="w-3.5 h-3.5" /> },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); playSound('click'); }}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          TAB: CATALOG
      ══════════════════════════════════════════════════════ */}
      {activeTab === 'catalog' && (
        <div className="space-y-6">
          {/* Header row */}
          <div className="flex items-center justify-between px-1">
            <div>
              <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">
                {activeCatalog.length} active template{activeCatalog.length !== 1 ? 's' : ''}
              </h4>
            </div>
            {!isReadOnly && (
              <button
                onClick={() => { playSound('click'); setEditingCatalog(null); setCatalogForm(emptyCatalogForm); setShowCatalogModal(true); }}
                className="flex items-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-lg active:scale-95"
              >
                <Plus className="w-4 h-4" />
                New Template
              </button>
            )}
          </div>

          {activeCatalog.length === 0 ? (
            <div className="bg-white rounded-[28px] border border-slate-100 p-16 text-center space-y-3">
              <div className="text-5xl opacity-20">📋</div>
              <p className="text-xs font-black text-slate-300 uppercase tracking-[0.2em]">No templates yet.</p>
              <p className="text-[10px] font-bold text-slate-400 max-w-xs mx-auto">
                Create bill templates here. Then assign them to branches — managers will set the actual price.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-[28px] border border-slate-200 shadow-sm overflow-hidden">

              {/* ── Mobile cards ── */}
              <div className="sm:hidden divide-y divide-slate-100">
                {activeCatalog.map(item => {
                  const assignedCount = catalogAssignCount[item.id] || 0;
                  return (
                    <div key={item.id} className="p-5 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-black text-slate-900 uppercase text-sm tracking-tight leading-tight">{item.name}</p>
                          {item.notes && <p className="text-[9px] font-bold text-slate-400 mt-1 normal-case">{item.notes}</p>}
                        </div>
                        <span className={`text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg shrink-0 ${item.category === 'AS_NEEDED' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                          {item.category === 'AS_NEEDED' ? 'As Needed' : 'Monthly'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 flex-wrap">
                        <div>
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Suggested</p>
                          <p className="font-black text-slate-900 tabular-nums text-sm">
                            {item.suggestedAmount > 0 ? `₱${item.suggestedAmount.toLocaleString()}` : <span className="text-slate-300">Variable</span>}
                          </p>
                        </div>
                        {item.dueDay && (
                          <div>
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Due Day</p>
                            <p className="font-black text-slate-700 text-sm">{item.dueDay}{getOrdinal(item.dueDay)}</p>
                          </div>
                        )}
                        {assignedCount > 0 && (
                          <div>
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Assigned</p>
                            <p className="font-black text-emerald-600 text-sm">{assignedCount} branch{assignedCount !== 1 ? 'es' : ''}</p>
                          </div>
                        )}
                      </div>
                      {!isReadOnly && (
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => { playSound('click'); setAssigningCatalog(item); setAssignBranches(new Set()); }}
                            className="flex-1 py-2.5 bg-indigo-50 text-indigo-600 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all"
                          >
                            Assign
                          </button>
                          <button
                            onClick={() => { playSound('click'); setEditingCatalog(item); setCatalogForm({ name: item.name, category: item.category, suggestedAmount: item.suggestedAmount > 0 ? item.suggestedAmount.toString() : '', dueDay: item.dueDay?.toString() || '', notes: item.notes || '' }); setShowCatalogModal(true); }}
                            className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 active:scale-95 transition-all"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { playSound('warning'); setArchivingCatalog(item); }}
                            className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-400 active:scale-95 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── Desktop table ── */}
              <table className="hidden sm:table w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Template Name</th>
                    <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Category</th>
                    <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Suggested Amount</th>
                    <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Due Day</th>
                    <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Assigned</th>
                    <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {activeCatalog.map(item => {
                    const assignedCount = catalogAssignCount[item.id] || 0;
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/60 transition-colors group">
                        <td className="px-8 py-4">
                          <p className="font-black text-slate-900 uppercase text-xs tracking-tight">{item.name}</p>
                          {item.notes && <p className="text-[9px] font-bold text-slate-400 mt-0.5 normal-case">{item.notes}</p>}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`text-[9px] font-black uppercase tracking-widest ${item.category === 'AS_NEEDED' ? 'text-indigo-500' : 'text-slate-500'}`}>
                            {item.category === 'AS_NEEDED' ? 'As Needed' : 'Monthly'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right font-black text-slate-900 tabular-nums text-xs">
                          {item.suggestedAmount > 0 ? `₱${item.suggestedAmount.toLocaleString()}` : <span className="text-slate-300 font-bold">Variable</span>}
                        </td>
                        <td className="px-4 py-4 text-[10px] font-bold text-slate-500">
                          {item.dueDay ? `${item.dueDay}${getOrdinal(item.dueDay)}` : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${assignedCount > 0 ? 'bg-emerald-50 text-emerald-700' : 'text-slate-300'}`}>
                            {assignedCount > 0 ? `${assignedCount} branch${assignedCount !== 1 ? 'es' : ''}` : '—'}
                          </span>
                        </td>
                        <td className="px-8 py-4 text-right">
                          {!isReadOnly && (
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => { playSound('click'); setAssigningCatalog(item); setAssignBranches(new Set()); }} className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg font-black text-[9px] uppercase tracking-widest transition-colors">Assign</button>
                              <button onClick={() => { playSound('click'); setEditingCatalog(item); setCatalogForm({ name: item.name, category: item.category, suggestedAmount: item.suggestedAmount > 0 ? item.suggestedAmount.toString() : '', dueDay: item.dueDay?.toString() || '', notes: item.notes || '' }); setShowCatalogModal(true); }} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                              <button onClick={() => { playSound('warning'); setArchivingCatalog(item); }} className="w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 flex items-center justify-center text-rose-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {archivedCatalog.length > 0 && (
                <div className="border-t border-slate-100 px-6 sm:px-8 py-4">
                  <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{archivedCatalog.length} archived template{archivedCatalog.length !== 1 ? 's' : ''} hidden</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB: BRANCHES
      ══════════════════════════════════════════════════════ */}
      {activeTab === 'branches' && (
        <div className="space-y-6">
          {/* Summary + period */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Active Bills', value: summary.activeBills, color: 'text-slate-900' },
              { label: `Paid — ${formatPeriod(selectedPeriod)}`, value: summary.paidCount, color: 'text-emerald-600' },
              { label: 'Overdue', value: summary.overdueCount, color: 'text-rose-600' },
              { label: 'Total Paid Amount', value: `₱${summary.totalPaidAmount.toLocaleString()}`, color: 'text-indigo-600' },
            ].map((card, i) => (
              <div key={i} className="bg-white border border-slate-100 rounded-[24px] p-5 shadow-sm">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">{card.label}</p>
                <p className={`text-2xl sm:text-3xl font-black tabular-nums ${card.color}`}>{card.value}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between px-1">
            <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Bills by Branch</h4>
            <select
              value={selectedPeriod}
              onChange={e => { setSelectedPeriod(e.target.value); playSound('click'); }}
              className="bg-white border border-slate-200 text-[10px] font-black text-slate-600 uppercase outline-none rounded-xl px-3 py-2 cursor-pointer shadow-sm"
            >
              {periodOptions.map(p => <option key={p} value={p}>{formatPeriod(p)}</option>)}
            </select>
          </div>

          <div className="space-y-3">
            {billsByBranch.map(({ branch, billsWithStatus, paid, overdue, dueSoon }) => {
              const isCollapsed = collapsedBranches.has(branch.id);
              const hasBills = billsWithStatus.length > 0;
              return (
                <div key={branch.id} className="bg-white rounded-[28px] border border-slate-200 shadow-sm overflow-hidden">
                  <div
                    className="flex items-center justify-between px-6 sm:px-8 py-5 cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => {
                      setCollapsedBranches(prev => {
                        const n = new Set(prev); n.has(branch.id) ? n.delete(branch.id) : n.add(branch.id); return n;
                      });
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 text-sm font-black uppercase shrink-0">
                        {branch.name.replace('BRANCH - ', '').charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-black text-slate-900 uppercase text-sm tracking-tight leading-none truncate">{branch.name.replace('BRANCH - ', '')}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                          {hasBills ? `${billsWithStatus.length} bill${billsWithStatus.length !== 1 ? 's' : ''}` : 'No bills assigned'}
                        </p>
                      </div>
                      {hasBills && (
                        <div className="hidden sm:flex gap-2 flex-wrap ml-2">
                          {paid > 0 && <span className="bg-emerald-50 text-emerald-700 text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg">{paid} paid</span>}
                          {overdue > 0 && <span className="bg-rose-50 text-rose-700 text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg">{overdue} overdue</span>}
                          {dueSoon > 0 && <span className="bg-amber-50 text-amber-700 text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg">{dueSoon} due soon</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!isReadOnly && (
                        <button
                          onClick={e => { e.stopPropagation(); handleOpenAddBill(branch.id); }}
                          className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-indigo-600 transition-all active:scale-95 shadow"
                        >
                          <Plus className="w-3 h-3" /> Add
                        </button>
                      )}
                      {hasBills && (
                        <div className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      )}
                    </div>
                  </div>

                  {!isCollapsed && hasBills && (
                    <div className="border-t border-slate-100">
                      {/* Mobile cards */}
                      <div className="sm:hidden divide-y divide-slate-50">
                        {billsWithStatus.map(({ bill, status }) => {
                          const cfg = STATUS_CONFIG[status];
                          const payment = allPayments.find(p => p.billId === bill.id && p.periodCovered === selectedPeriod);
                          return (
                            <div key={bill.id} className="px-5 py-4 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-black text-slate-900 uppercase text-sm tracking-tight">{bill.name}</p>
                                    {bill.catalogId && <span className="bg-indigo-50 text-indigo-500 text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md">CATALOG</span>}
                                  </div>
                                  {bill.notes && <p className="text-[9px] font-bold text-slate-400 mt-0.5 normal-case">{bill.notes}</p>}
                                </div>
                                <span className={`${cfg.bg} ${cfg.text} flex items-center gap-1 px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest whitespace-nowrap shrink-0`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}></span>
                                  {cfg.label}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <div>
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Amount</p>
                                    <p className="font-black text-slate-900 tabular-nums">{bill.amount > 0 ? `₱${bill.amount.toLocaleString()}` : <span className="text-slate-300">—</span>}</p>
                                  </div>
                                  {bill.dueDay && (
                                    <div>
                                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Due</p>
                                      <p className="font-black text-slate-600">{bill.dueDay}{getOrdinal(bill.dueDay)}</p>
                                    </div>
                                  )}
                                  {payment && (
                                    <div>
                                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Paid</p>
                                      <p className="font-black text-emerald-600 tabular-nums">₱{payment.amountPaid.toLocaleString()}</p>
                                    </div>
                                  )}
                                </div>
                                {!isReadOnly && (
                                <div className="flex gap-1.5">
                                  <button onClick={() => handleOpenEditBill(bill)} className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 active:scale-95 transition-all"><Edit2 className="w-4 h-4" /></button>
                                  <button onClick={() => { playSound('warning'); setDeletingBill(bill); }} className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center text-rose-400 active:scale-95 transition-all"><Trash2 className="w-4 h-4" /></button>
                                </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {/* Desktop table */}
                      <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50">
                              <th className="px-8 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Bill</th>
                              <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Amount</th>
                              <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Due</th>
                              <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                              <th className="px-8 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {billsWithStatus.map(({ bill, status }) => {
                              const cfg = STATUS_CONFIG[status];
                              const payment = allPayments.find(p => p.billId === bill.id && p.periodCovered === selectedPeriod);
                              return (
                                <tr key={bill.id} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="px-8 py-3">
                                    <div className="flex items-center gap-2">
                                      <p className="font-black text-slate-900 uppercase text-xs tracking-tight">{bill.name}</p>
                                      {bill.catalogId && <span className="bg-indigo-50 text-indigo-500 text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md shrink-0">CATALOG</span>}
                                    </div>
                                    {bill.notes && <p className="text-[9px] font-bold text-slate-400 mt-0.5 normal-case">{bill.notes}</p>}
                                  </td>
                                  <td className="px-4 py-3 text-right font-black text-slate-900 tabular-nums text-xs">{bill.amount > 0 ? `₱${bill.amount.toLocaleString()}` : <span className="text-slate-300 text-[9px]">—</span>}</td>
                                  <td className="px-4 py-3 text-[10px] font-bold text-slate-500">{bill.dueDay ? `${bill.dueDay}${getOrdinal(bill.dueDay)}` : <span className="text-slate-300">—</span>}</td>
                                  <td className="px-4 py-3 text-center">
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className={`${cfg.bg} ${cfg.text} flex items-center gap-1 px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest whitespace-nowrap`}><span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}></span>{cfg.label}</span>
                                      {payment && <span className="text-[8px] font-bold text-emerald-600">₱{payment.amountPaid.toLocaleString()}</span>}
                                    </div>
                                  </td>
                                  <td className="px-8 py-3 text-right">
                                    {!isReadOnly && (
                                      <div className="flex items-center justify-end gap-2">
                                        <button onClick={() => handleOpenEditBill(bill)} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => { playSound('warning'); setDeletingBill(bill); }} className="w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 flex items-center justify-center text-rose-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {!isCollapsed && !hasBills && (
                    <div className="px-8 py-8 border-t border-slate-100 text-center">
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">No bills assigned. Click Add to assign from catalog or create a custom bill.</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          MODALS
      ══════════════════════════════════════════════════════ */}

      {/* Catalog create/edit modal */}
      {showCatalogModal && (
        <div className={UI_THEME.layout.modalWrapper} onClick={() => { setShowCatalogModal(false); setEditingCatalog(null); }}>
          <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-8 space-y-6 animate-in zoom-in-95 duration-200`} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">{editingCatalog ? 'Edit Template' : 'New Bill Template'}</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Global catalog — assign to branches after creating</p>
              </div>
              <button onClick={() => { setShowCatalogModal(false); setEditingCatalog(null); }} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCatalog} className="space-y-4">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Bill Name</label>
                <input
                  type="text" required
                  value={catalogForm.name}
                  onChange={e => setCatalogForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. RENT, ELECTRICITY, WATER, WIFI"
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent rounded-xl font-black text-slate-800 text-[13px] uppercase outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Category</label>
                  <select
                    value={catalogForm.category}
                    onChange={e => setCatalogForm(f => ({ ...f, category: e.target.value as 'MONTHLY' | 'AS_NEEDED' }))}
                    className="w-full bg-slate-50 border-2 border-transparent rounded-xl px-3 py-3 text-[11px] font-black uppercase tracking-widest text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition-all"
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="AS_NEEDED">As Needed</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Suggested Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-slate-400 text-sm">₱</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={catalogForm.suggestedAmount}
                      onChange={e => setCatalogForm(f => ({ ...f, suggestedAmount: e.target.value }))}
                      placeholder="0 if variable"
                      className="w-full pl-7 pr-3 py-3 bg-slate-50 border-2 border-transparent rounded-xl font-black text-slate-800 text-[12px] outline-none focus:border-indigo-500 focus:bg-white transition-all"
                    />
                  </div>
                </div>
              </div>
              {catalogForm.category === 'MONTHLY' && (
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Due Day of Month</label>
                  <input
                    type="number" min="1" max="31"
                    value={catalogForm.dueDay}
                    onChange={e => setCatalogForm(f => ({ ...f, dueDay: e.target.value }))}
                    placeholder="e.g. 15 for the 15th"
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent rounded-xl font-black text-slate-800 text-[13px] outline-none focus:border-indigo-500 focus:bg-white transition-all"
                  />
                </div>
              )}
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Notes (optional)</label>
                <input
                  type="text"
                  value={catalogForm.notes}
                  onChange={e => setCatalogForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. pay via GCash, contact landlord first"
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent rounded-xl font-bold text-slate-800 text-[11px] outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>
              <div className="bg-indigo-50 rounded-2xl p-4">
                <p className="text-[9px] font-bold text-indigo-600 uppercase tracking-widest leading-relaxed">
                  💡 After saving, use the <strong>Assign</strong> button to push this template to specific branches. Branch managers will then set the actual price.
                </p>
              </div>
              <button
                type="submit"
                disabled={isSubmitting || !catalogForm.name.trim()}
                className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl text-[12px] uppercase tracking-widest shadow-lg active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-3 hover:bg-indigo-700"
              >
                {isSubmitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : editingCatalog ? 'Save Changes' : 'Create Template'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Assign catalog to branches modal */}
      {assigningCatalog && (
        <div className={UI_THEME.layout.modalWrapper} onClick={() => setAssigningCatalog(null)}>
          <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-8 space-y-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">Assign Bill</h4>
                <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mt-1">{assigningCatalog.name}</p>
              </div>
              <button onClick={() => setAssigningCatalog(null)} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Suggested amount: <strong className="text-slate-900">{assigningCatalog.suggestedAmount > 0 ? `₱${assigningCatalog.suggestedAmount.toLocaleString()}` : 'Variable'}</strong> — branch managers will set the actual price.
            </p>

            <form onSubmit={handleAssignTobranches} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Select Branches</label>
                  <button
                    type="button"
                    onClick={() => {
                      if (assignBranches.size === branches.length) setAssignBranches(new Set());
                      else setAssignBranches(new Set(branches.map(b => b.id)));
                    }}
                    className="text-[9px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-800"
                  >
                    {assignBranches.size === branches.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {branches.map(b => {
                    const alreadyAssigned = allBills.some(bill => bill.branchId === b.id && bill.catalogId === assigningCatalog.id);
                    return (
                      <label key={b.id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border-2 transition-colors ${alreadyAssigned ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed' : assignBranches.has(b.id) ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100 bg-slate-50 hover:border-slate-200'}`}>
                        <input
                          type="checkbox"
                          disabled={alreadyAssigned}
                          checked={assignBranches.has(b.id)}
                          onChange={() => {
                            setAssignBranches(prev => {
                              const n = new Set(prev); n.has(b.id) ? n.delete(b.id) : n.add(b.id); return n;
                            });
                          }}
                          className="w-4 h-4 rounded text-indigo-600 border-slate-300"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-black text-slate-700 uppercase tracking-tight">{b.name.replace('BRANCH - ', '')}</span>
                          {alreadyAssigned && <span className="ml-2 text-[8px] font-bold text-slate-400 uppercase">already assigned</span>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
              <button
                type="submit"
                disabled={isSubmitting || assignBranches.size === 0}
                className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl text-[12px] uppercase tracking-widest shadow-lg active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-3 hover:bg-indigo-700"
              >
                {isSubmitting
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  : `Assign to ${assignBranches.size} Branch${assignBranches.size !== 1 ? 'es' : ''}`
                }
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add bill to branch — choice modal */}
      {addBillMode === 'choice' && (
        <div className={UI_THEME.layout.modalWrapper} onClick={() => setAddBillMode(null)}>
          <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-8 space-y-5 animate-in zoom-in-95 duration-200`} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">Add Bill</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                  {branches.find(b => b.id === addBillTarget)?.name.replace('BRANCH - ', '') || 'Branch'}
                </p>
              </div>
              <button onClick={() => setAddBillMode(null)} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => { playSound('click'); setCatalogPickBranchId(addBillTarget); setPickedCatalogItems(new Set()); setAddBillMode('catalog'); }}
                className="p-6 rounded-2xl border-2 border-indigo-200 bg-indigo-50 text-left hover:border-indigo-400 transition-all group"
              >
                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <BookOpen className="w-5 h-5" />
                </div>
                <h5 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-1">From Catalog</h5>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">Assign one or more bills from the global catalog. Manager will set actual price.</p>
              </button>

              <button
                onClick={() => { playSound('click'); setAddBillMode('custom'); }}
                className="p-6 rounded-2xl border-2 border-slate-200 bg-slate-50 text-left hover:border-slate-400 transition-all group"
              >
                <div className="w-10 h-10 bg-slate-200 text-slate-600 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Plus className="w-5 h-5" />
                </div>
                <h5 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-1">Custom Bill</h5>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">Create a one-off bill specific to this branch, not linked to the catalog.</p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add bill from catalog — picker modal */}
      {addBillMode === 'catalog' && (
        <div className={UI_THEME.layout.modalWrapper} onClick={() => setAddBillMode(null)}>
          <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-8 space-y-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">Assign from Catalog</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                  {branches.find(b => b.id === catalogPickBranchId)?.name.replace('BRANCH - ', '') || 'Branch'}
                </p>
              </div>
              <button onClick={() => setAddBillMode(null)} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {activeCatalog.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">No templates in catalog yet.</p>
                <button
                  onClick={() => { setAddBillMode(null); setActiveTab('catalog'); setShowCatalogModal(true); }}
                  className="mt-4 text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline"
                >
                  Create a template first →
                </button>
              </div>
            ) : (
              <form onSubmit={handleAssignFromCatalog} className="space-y-4">
                <div className="space-y-2">
                  {activeCatalog.map(item => {
                    const alreadyAssigned = allBills.some(b => b.branchId === catalogPickBranchId && b.catalogId === item.id);
                    const isPicked = pickedCatalogItems.has(item.id);
                    return (
                      <label key={item.id} className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-colors cursor-pointer ${alreadyAssigned ? 'opacity-50 cursor-not-allowed border-slate-100 bg-slate-50' : isPicked ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100 bg-slate-50/60 hover:border-slate-200'}`}>
                        <input
                          type="checkbox"
                          disabled={alreadyAssigned}
                          checked={isPicked}
                          onChange={() => {
                            if (alreadyAssigned) return;
                            setPickedCatalogItems(prev => {
                              const n = new Set(prev); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n;
                            });
                          }}
                          className="w-4 h-4 rounded text-indigo-600 border-slate-300"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-black text-slate-900 uppercase text-xs tracking-tight">{item.name}</p>
                            <span className={`text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md ${item.category === 'AS_NEEDED' ? 'bg-indigo-50 text-indigo-500' : 'bg-slate-100 text-slate-500'}`}>
                              {item.category === 'AS_NEEDED' ? 'As Needed' : 'Monthly'}
                            </span>
                            {alreadyAssigned && <span className="text-[8px] font-bold text-slate-400 uppercase">already assigned</span>}
                          </div>
                          <p className="text-[9px] font-bold text-slate-400 mt-0.5">
                            {item.suggestedAmount > 0 ? `Suggested: ₱${item.suggestedAmount.toLocaleString()}` : 'Variable price'}
                            {item.dueDay ? ` · Due ${item.dueDay}${getOrdinal(item.dueDay)}` : ''}
                          </p>
                        </div>
                        {isPicked && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
                      </label>
                    );
                  })}
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting || pickedCatalogItems.size === 0}
                  className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl text-[12px] uppercase tracking-widest shadow-lg active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-3 hover:bg-indigo-700"
                >
                  {isSubmitting
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    : `Assign ${pickedCatalogItems.size} Bill${pickedCatalogItems.size !== 1 ? 's' : ''}`
                  }
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit custom bill modal */}
      {addBillMode === 'custom' && (
        <div className={UI_THEME.layout.modalWrapper} onClick={() => { setAddBillMode(null); setEditingBill(null); }}>
          <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-8 space-y-6 animate-in zoom-in-95 duration-200`} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">{editingBill ? 'Edit Bill' : 'Custom Bill'}</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                  {branches.find(b => b.id === addBillTarget)?.name.replace('BRANCH - ', '') || 'Branch'}
                  {editingBill?.catalogId && <span className="ml-2 text-indigo-500">· From Catalog</span>}
                </p>
              </div>
              <button onClick={() => { setAddBillMode(null); setEditingBill(null); }} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBill} className="space-y-4">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Bill Name</label>
                <input
                  type="text" required
                  value={billForm.name}
                  onChange={e => setBillForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. RENT, ELECTRICITY"
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
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Actual Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-slate-400 text-sm">₱</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={billForm.amount}
                      onChange={e => setBillForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="0 if variable"
                      className="w-full pl-7 pr-3 py-3 bg-slate-50 border-2 border-transparent rounded-xl font-black text-slate-800 text-[12px] outline-none focus:border-emerald-500 focus:bg-white transition-all"
                    />
                  </div>
                </div>
              </div>
              {billForm.category === 'MONTHLY' && (
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
              )}
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Notes (optional)</label>
                <input
                  type="text"
                  value={billForm.notes}
                  onChange={e => setBillForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. pay via GCash, contact landlord first"
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

      {/* Archive catalog confirm */}
      {archivingCatalog && (
        <div className={UI_THEME.layout.modalWrapper}>
          <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-10 text-center border border-slate-100 shadow-2xl`}>
            <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-6"><AlertTriangle className="w-8 h-8" /></div>
            <h4 className="text-2xl font-bold text-slate-900 mb-2 uppercase tracking-tighter">Archive Template?</h4>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
              <span className="text-slate-900">{archivingCatalog.name}</span> will be hidden from the catalog.<br />
              Existing branch bills will not be affected.
            </p>
            <div className="flex flex-col gap-3 mt-10">
              <button onClick={handleArchiveCatalog} disabled={isSubmitting} className="w-full bg-amber-500 text-white font-black py-5 rounded-2xl text-[12px] uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3">
                {isSubmitting ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : 'Archive Template'}
              </button>
              <button onClick={() => setArchivingCatalog(null)} className="w-full text-slate-400 font-bold py-4 rounded-xl text-[11px] uppercase tracking-widest">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Remove branch bill confirm */}
      {deletingBill && (
        <div className={UI_THEME.layout.modalWrapper}>
          <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-10 text-center border border-slate-100 shadow-2xl`}>
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-6"><Trash2 className="w-8 h-8" /></div>
            <h4 className="text-2xl font-bold text-slate-900 mb-2 uppercase tracking-tighter">Remove Bill?</h4>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
              Deactivate <span className="text-slate-900">{deletingBill.name}</span> for{' '}
              <span className="text-slate-900">{branches.find(b => b.id === deletingBill.branchId)?.name.replace('BRANCH - ', '')}</span>.<br />
              Payment history will be preserved.
            </p>
            <div className="flex flex-col gap-3 mt-10">
              <button onClick={handleDeactivateBill} disabled={isSubmitting} className="w-full bg-rose-600 text-white font-black py-5 rounded-2xl text-[12px] uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3">
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
