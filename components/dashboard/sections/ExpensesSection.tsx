
import React, { useState, useEffect, useMemo } from 'react';
import { Branch, Expense } from '../../../types';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';
import { supabase } from '../../../lib/supabase';
import { playSound } from '../../../lib/audio';
import { compressImage } from '../../../lib/image';
import { deleteFileByUrl } from '../../../lib/storage';
import { UI_THEME } from '../../../constants/ui_designs';
import { useAddExpense, useUpdateExpense, useDeleteExpense } from '../../../hooks/useNetworkData';
import { logAudit } from '../../../lib/audit';
import { getTrueDate, getTrueISOString, getTrueManilaISOString, toManilaDateStr } from '../../../lib/time';
import { Plus, Trash2 } from 'lucide-react';

const OFFLINE_QUEUE_KEY = 'hilot_core_pending_sync_v1';

// Modular Components
import { ExpenseStats } from './expenses/ExpenseStats';
import { ExpenseEntryForm } from './expenses/ExpenseEntryForm';
import { ExpenseActivityLog } from './expenses/ExpenseActivityLog';

interface ExpensesSectionProps {
  user?: any;
  branch: Branch;
  expenses: Expense[];
  isClosedMode?: boolean;
  onRefresh?: () => void;
  onSyncStatusChange?: (isSyncing: boolean) => void;
  fixedCategory?: 'OPERATIONAL' | 'PROVISION';
  externalSearchTerm?: string;
}

interface Toast {
  message: string;
  type: 'success' | 'error';
}

export const ExpensesSection: React.FC<ExpensesSectionProps> = ({ user, branch, expenses, isClosedMode = false, onRefresh, onSyncStatusChange, fixedCategory, externalSearchTerm = '' }) => {
  const defaultAmount = fixedCategory === 'PROVISION' ? (branch.dailyProvisionAmount || 0) : 0;
  const defaultName = fixedCategory === 'PROVISION' ? 'DAILY R&B PROVISION' : '';
  
  const [formData, setFormData] = useState({ id: '', name: defaultName, amount: defaultAmount, category: fixedCategory || 'OPERATIONAL' });
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);

  const addExpense = useAddExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  
  const [localSearchTerm, setLocalSearchTerm] = useState('');
  const searchTerm = externalSearchTerm || localSearchTerm;
  
  const todayStr = useMemo(() => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(getTrueDate()), []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  };

  const dailyExpenses = useMemo(() => {
    let filtered = expenses.filter(e => {
      if (e.branchId !== branch.id) return false;
      const isCorrectCategory = fixedCategory ? e.category === fixedCategory : (e.category === 'OPERATIONAL' || e.category === 'PROVISION');
      return toManilaDateStr(e.timestamp) === todayStr && isCorrectCategory;
    });

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(e => e.name.toLowerCase().includes(term));
    }

    return filtered.sort((a,b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  }, [expenses, branch.id, todayStr, searchTerm, fixedCategory]);

  const totalDailyBurn = useMemo(() => dailyExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0), [dailyExpenses]);

  const handleSaveExpense = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!formData.name || !formData.amount || isUploading || isClosedMode) return;
    
    setIsUploading(true);
    if (onSyncStatusChange) onSyncStatusChange(true);
    setUploadProgress(10);

    const manilaTimestamp = getTrueManilaISOString();

    let receiptUrl = editingExpense?.receiptImage || '';
    const timestamp = editingExpense?.timestamp || manilaTimestamp;
    const performer = user?.username || branch.manager || 'BRANCH MANAGER';

    try {
      if (file && fixedCategory !== 'PROVISION') {
        // 0.5. SIZE CHECK (Limit to 5MB before compression)
        if (file.size > 5 * 1024 * 1024) {
          throw new Error('FILE TOO LARGE: Receipt image must be under 5MB.');
        }

        setUploadProgress(30);
        if (editingExpense?.receiptImage) {
          await deleteFileByUrl(editingExpense.receiptImage, 'receipts');
        }

        const compressedBlob = await compressImage(file, { maxWidth: 800, maxHeight: 800, quality: 0.5 });
        setUploadProgress(50);
        const filePath = `${branch.id}/${todayStr}/${Date.now()}_receipt.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(filePath, compressedBlob, { contentType: 'image/jpeg' });
        
        if (uploadError) throw uploadError;
        
        const { data } = supabase.storage.from('receipts').getPublicUrl(filePath);
        receiptUrl = data.publicUrl;
        setUploadProgress(70);
      }

      const cleanName = formData.name.trim().toUpperCase();
      const cleanAmount = Number(formData.amount);

      const dbPayload: any = {
        [DB_COLUMNS.BRANCH_ID]: branch.id,
        [DB_COLUMNS.TIMESTAMP]: timestamp,
        [DB_COLUMNS.NAME]: cleanName,
        [DB_COLUMNS.AMOUNT]: cleanAmount,
        [DB_COLUMNS.CATEGORY]: formData.category,
        [DB_COLUMNS.RECEIPT_IMAGE]: receiptUrl || null
      };

      let auditDesc = `New expense: ${cleanName} (₱${cleanAmount}) [${formData.category}]`;
      
      let expenseId = editingExpense?.id || Math.random().toString(36).substr(2, 9);

      if (editingExpense) {
        const changes = [];
        if (editingExpense.name !== cleanName) changes.push(`Name: ${editingExpense.name} → ${cleanName}`);
        if (editingExpense.amount !== cleanAmount) changes.push(`Value: ₱${editingExpense.amount} → ₱${cleanAmount}`);
        if (editingExpense.category !== formData.category) changes.push(`Category: ${editingExpense.category} → ${formData.category}`);
        auditDesc = `Modified expense ${expenseId}: ${changes.length > 0 ? changes.join(', ') : 'Updated Proof'}`;
        
        await updateExpense.mutateAsync({ id: editingExpense.id, ...dbPayload });
        showToast('Archive Synchronized');
      } else {
        await addExpense.mutateAsync({ [DB_COLUMNS.ID]: expenseId, ...dbPayload });
        showToast(formData.category === 'PROVISION' ? 'Vault Provision Logged' : 'Disbursement Logged');
      }

      await logAudit({
        branchId: branch.id,
        activityType: editingExpense ? 'UPDATE' : 'CREATE',
        entityType: 'EXPENSE',
        entityId: expenseId,
        description: auditDesc,
        amount: cleanAmount,
        performerName: performer
      });

      setUploadProgress(100);
      playSound(formData.category === 'PROVISION' ? 'deposit' : 'success');
      resetForm();
      onRefresh?.();
    } catch (err: any) {
      const isNetworkErr = err?.message?.toLowerCase().includes('fetch') || err?.message?.toLowerCase().includes('network') || !navigator.onLine;
      // Can't queue if a receipt file was attached — upload requires connectivity
      if (isNetworkErr && !file && !editingExpense) {
        try {
          const cleanName = formData.name.trim().toUpperCase();
          const cleanAmount = Number(formData.amount);
          const expenseId = Math.random().toString(36).substr(2, 9);
          const queuePayload = { [DB_COLUMNS.ID]: expenseId, [DB_COLUMNS.BRANCH_ID]: branch.id, [DB_COLUMNS.TIMESTAMP]: getTrueManilaISOString(), [DB_COLUMNS.NAME]: cleanName, [DB_COLUMNS.AMOUNT]: cleanAmount, [DB_COLUMNS.CATEGORY]: formData.category, [DB_COLUMNS.RECEIPT_IMAGE]: null };
          const auditPayload = { [DB_COLUMNS.BRANCH_ID]: branch.id, [DB_COLUMNS.TIMESTAMP]: getTrueManilaISOString(), [DB_COLUMNS.ACTIVITY_TYPE]: 'CREATE', [DB_COLUMNS.ENTITY_TYPE]: 'EXPENSE', [DB_COLUMNS.ENTITY_ID]: expenseId, [DB_COLUMNS.DESCRIPTION]: `New expense (queued): ${cleanName} ₱${cleanAmount} [${formData.category}]`, [DB_COLUMNS.PERFORMER_NAME]: user?.username || branch.manager || 'BRANCH MANAGER' };
          const existingQueue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
          existingQueue.push({ table: DB_TABLES.EXPENSES, data: queuePayload, audit: auditPayload });
          localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(existingQueue));
          playSound('success');
          showToast('Disbursement queued — will sync on reconnect');
          resetForm();
          onRefresh?.();
        } catch {
          showToast('System Relay Error', 'error');
          playSound('warning');
        }
      } else if (isNetworkErr && file) {
        showToast('No connection — remove the receipt photo to log offline', 'error');
        playSound('warning');
      } else {
        showToast(err.message || 'System Relay Error', 'error');
        playSound('warning');
      }
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (onSyncStatusChange) onSyncStatusChange(false);
    }
  };

  const resetForm = () => {
    setFormData({ id: '', name: defaultName, amount: defaultAmount, category: fixedCategory || 'OPERATIONAL' });
    setFile(null);
    setEditingExpense(null);
  };

  const handleEdit = (expense: Expense) => {
    if (expense.name.startsWith('RELIEVER PAYOUT:')) {
      showToast('Reliever Payouts are automated', 'error');
      return;
    }
    if (editingExpense?.id === expense.id) {
      resetForm();
      return;
    }
    playSound('click');
    setEditingExpense(expense);
    setFormData({
      id: expense.id,
      name: expense.name,
      amount: expense.amount,
      category: expense.category
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteTrigger = (id: string) => {
    const target = dailyExpenses.find(e => e.id === id);
    if (target) {
      if (target.name.startsWith('RELIEVER PAYOUT:')) {
        showToast('Reliever Payouts are protected', 'error');
        return;
      }
      playSound('delete');
      setExpenseToDelete(target);
    }
  };

  const handleFinalDelete = async () => {
    if (!expenseToDelete || isUploading || isClosedMode) return;
    const target = expenseToDelete;

    setIsUploading(true);
    if (onSyncStatusChange) onSyncStatusChange(true);
    try {
      if (target.receiptImage) {
        await deleteFileByUrl(target.receiptImage, 'receipts');
      }

      await deleteExpense.mutateAsync({ id: target.id, branchId: branch.id });

      await logAudit({
        branchId: branch.id,
        activityType: 'DELETE',
        entityType: 'EXPENSE',
        entityId: target.id,
        description: `Scrubbed expense: ${target.name} (₱${target.amount})`,
        amount: target.amount,
        performerName: user?.username || branch.manager || 'SYSTEM'
      });

      showToast('Log Entry Scrubbed');
      setExpenseToDelete(null);
      if (editingExpense?.id === target.id) resetForm();
      onRefresh?.();
    } catch (err) {
      showToast('Scrub Protocol Failed', 'error');
    } finally {
      setIsUploading(false);
      if (onSyncStatusChange) onSyncStatusChange(false);
    }
  };

  const hasDailyProvision = useMemo(() => {
    return dailyExpenses.some(e => e.category === 'PROVISION');
  }, [dailyExpenses]);

  return (
    <div className="w-full mx-auto pb-20 px-2 sm:px-6">
      {toast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[400] px-6 py-3 rounded-full shadow-xl animate-in slide-in-from-top-6 duration-300 font-black text-xs uppercase tracking-wide bg-slate-900 text-white border border-white/10 flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${toast.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'} animate-pulse`}></div>
          {toast.message}
        </div>
      )}

      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* LEFT COLUMN: ENTRY FORM */}
          <div className="md:col-span-5 space-y-8">
            {fixedCategory === 'PROVISION' ? (
              <div className="bg-slate-900 rounded-3xl p-1 shadow-xl border border-slate-800">
                <div className="bg-white p-8 sm:p-10 rounded-[30px] space-y-8 text-center">
                  <div className="space-y-2">
                    <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide">Vault Provision</h3>
                    <p className="text-4xl font-black text-slate-900">₱{(branch.dailyProvisionAmount || 0).toLocaleString()}</p>
                    <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 inline-block px-3 py-1 rounded-full border border-emerald-100">Daily R&B Provision</p>
                  </div>

                  <button
                    onClick={handleSaveExpense}
                    disabled={isUploading || isClosedMode}
                    className="w-full bg-slate-900 text-white font-black py-6 rounded-2xl uppercase tracking-wide text-xs shadow-xl hover:bg-emerald-600 active:scale-95 transition-all flex items-center justify-center gap-3"
                  >
                    {isUploading ? (
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Plus className="w-5 h-5" strokeWidth={2.5} />
                        <span>Log Daily Provision</span>
                      </>
                    )}
                  </button>
                  
                  <p className="text-xs font-bold text-slate-300 uppercase tracking-widest leading-relaxed">
                    Provision amount is pre-configured in branch settings.
                  </p>
                </div>
              </div>
            ) : (
              <ExpenseEntryForm 
                formData={formData}
                setFormData={setFormData}
                file={file}
                setFile={setFile}
                isUploading={isUploading}
                uploadProgress={uploadProgress}
                isEditing={!!editingExpense}
                onSubmit={handleSaveExpense}
                onCancel={resetForm}
                isClosedMode={isClosedMode}
                existingImage={editingExpense?.receiptImage}
                fixedCategory={fixedCategory}
              />
            )}

            {/* Quick Summary of Today */}
            <div className={`bg-slate-50 border border-slate-200 ${UI_THEME.radius.card} p-6 flex items-center justify-between`}>
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Today's Total Expense Burn</p>
                <p className="text-2xl font-black text-slate-900">₱{totalDailyBurn.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Entries</p>
                <p className="text-2xl font-black text-slate-900">{dailyExpenses.length}</p>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: ACTIVITY LOG / TABLE */}
          <div className="md:col-span-7 space-y-4">
            <div className="flex items-center justify-between px-4">
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider">Session Activity</h3>
              <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">{dailyExpenses.length} Outflows</span>
            </div>
            <ExpenseActivityLog 
              expenses={dailyExpenses}
              onEdit={handleEdit}
              onDelete={handleDeleteTrigger}
              editingId={editingExpense?.id}
              isClosedMode={isClosedMode}
            />
          </div>
        </div>
      </div>

      {expenseToDelete && (
        <div className={UI_THEME.layout.modalWrapper}>
          <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-10 text-center border border-slate-100`}>
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
              <Trash2 className="w-8 h-8" strokeWidth={3} />
            </div>
            <h4 className="text-2xl font-bold text-slate-900 mb-2 uppercase tracking-tighter">Scrub Entry?</h4>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide leading-relaxed">
              This will permanently remove the record for <span className="text-slate-900">{expenseToDelete.name}</span>.
            </p>
            <div className="flex flex-col gap-3 mt-10">
              <button
                onClick={handleFinalDelete}
                disabled={isUploading}
                className="w-full bg-rose-600 text-white font-black py-5 rounded-2xl text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                {isUploading ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : 'Confirm Scrub'}
              </button>
              <button onClick={() => setExpenseToDelete(null)} className="w-full text-slate-400 font-bold py-4 rounded-xl text-xs uppercase tracking-widest">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
