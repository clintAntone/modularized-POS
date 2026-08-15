
import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Branch, BranchVault } from '../../../../types';
import { DB_TABLES, DB_COLUMNS } from '../../../../constants/db_schema';
import { supabase } from '../../../../lib/supabase';
import { playSound } from '../../../../lib/audio';
import { compressImage } from '../../../../lib/image';
import { getTrueDate } from '../../../../lib/time';
import { logAudit } from '../../../../lib/audit';

type ModalMode = 'expense' | 'deposit' | 'legacy_deposit';

interface QuickExpenseModalProps {
  branch: Branch;
  todayStr: string;
  onClose: () => void;
  onRefresh?: () => void;
  performerName?: string;
  branchVault?: BranchVault | null;
  defaultIsVaultDeposit?: boolean;
  defaultIsLegacyDeposit?: boolean;
  currentNetRoi?: number;
  todayVaultDeposit?: number;
  onDeposit?: (amount: number) => Promise<void>;
  hideDepositTab?: boolean;
  reportId?: string;
}

export const QuickExpenseModal: React.FC<QuickExpenseModalProps> = ({
  branch, todayStr, onClose, onRefresh, performerName, branchVault,
  defaultIsVaultDeposit = false, defaultIsLegacyDeposit = false, currentNetRoi, todayVaultDeposit = 0, onDeposit,
  hideDepositTab = false, reportId,
}) => {
  const initialMode: ModalMode = defaultIsLegacyDeposit ? 'legacy_deposit' : defaultIsVaultDeposit ? 'deposit' : 'expense';
  const [mode, setMode] = useState<ModalMode>(initialMode);

  // Expense state
  const [expenseName, setExpenseName] = useState('');
  const [expenseAmount, setExpenseAmount] = useState<number>(0);
  const [expenseFile, setExpenseFile] = useState<File | null>(null);
  const [withdrawFromVault, setWithdrawFromVault] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Deposit state
  const [depositAmount, setDepositAmount] = useState<number>(0);
  const [depositAll, setDepositAll] = useState(true);

  const [showSuggestions, setShowSuggestions] = useState(false);
  const labelInputRef = useRef<HTMLInputElement>(null);

  const SUGGESTIONS = ['Electricity', 'Water', 'Rent', 'Food', 'Laundry', 'Transport', 'Meryenda'];
  const filteredSuggestions = expenseName.trim()
    ? SUGGESTIONS.filter(s => s.toLowerCase().includes(expenseName.toLowerCase()) && s.toLowerCase() !== expenseName.toLowerCase())
    : [];

  // Lock body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showSuggestions) return;
    const handler = (e: MouseEvent) => {
      if (labelInputRef.current && !labelInputRef.current.closest('.suggestion-wrapper')?.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSuggestions]);

  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const netRoi = currentNetRoi ?? 0;
  const vaultBal = branchVault?.balance ?? 0;
  const vaultTarget = branchVault?.target ?? 0;
  const hasVault = !!(branchVault && branch.vaultEnabled);

  // Deposit mode derived
  const maxDeposit = Math.max(0, netRoi);
  const afterDepositBalance = vaultBal + (depositAmount || 0);

  const canSaveExpense = !!(expenseName.trim() && expenseAmount > 0 && (!withdrawFromVault || expenseFile));

  // Cover from vault — vault covers the expense AND any existing ROI deficit (e.g. payroll shortfall).
  // roiShortfall = how much the vault needs to withdraw so that net ROI hits 0 after this expense.
  const roiShortfall = hasVault && expenseAmount > 0 ? Math.max(0, expenseAmount - netRoi) : 0;
  const vaultCoverAmount = Math.min(roiShortfall, vaultBal);
  const canCoverFromVault = hasVault && roiShortfall > 0 && vaultBal > 0;

  // Reset vault cover when no longer applicable
  useEffect(() => {
    if (!canCoverFromVault) setWithdrawFromVault(false);
  }, [canCoverFromVault]);
  const effectiveDepositAmount = depositAll ? maxDeposit : depositAmount;
  const canSaveDeposit = effectiveDepositAmount > 0 && effectiveDepositAmount <= maxDeposit;
  const canSaveLegacyDeposit = depositAmount > 0;

  // Reset deposit state when entering deposit mode
  useEffect(() => {
    if (mode === 'deposit') { setDepositAll(true); setDepositAmount(0); }
    if (mode === 'legacy_deposit' && maxDeposit > 0) setDepositAmount(maxDeposit);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchMode = (m: ModalMode) => {
    setMode(m);
    setErrorMessage('');
  };

  const handleSaveExpense = async () => {
    const name = expenseName.trim();
    if (!name || !expenseAmount || isSaving) return;
    setIsSaving(true);
    setErrorMessage('');
    setUploadProgress(10);
    let receiptUrl = '';

    const now = getTrueDate();
    const timePart = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Manila',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(now);
    const timestamp = `${todayStr}T${timePart}.000+08:00`;
    const expenseId = Math.random().toString(36).substr(2, 9);

    try {
      if (expenseFile) {
        setUploadProgress(30);
        const compressedBlob = await compressImage(expenseFile);
        setUploadProgress(50);
        const filePath = `${branch.id}/${todayStr}/${Date.now()}_quick.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('receipts').upload(filePath, compressedBlob, { contentType: 'image/jpeg' });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('receipts').getPublicUrl(filePath);
        receiptUrl = data.publicUrl;
      }

      const { error: dbError } = await supabase.from(DB_TABLES.EXPENSES).insert({
        [DB_COLUMNS.ID]: expenseId,
        [DB_COLUMNS.BRANCH_ID]: branch.id,
        [DB_COLUMNS.TIMESTAMP]: timestamp,
        [DB_COLUMNS.NAME]: name.toUpperCase(),
        [DB_COLUMNS.AMOUNT]: expenseAmount,
        [DB_COLUMNS.CATEGORY]: 'OPERATIONAL',
        [DB_COLUMNS.RECEIPT_IMAGE]: receiptUrl || null,
      });
      if (dbError) throw dbError;

      // Cover shortfall from vault if opted in
      if (withdrawFromVault && vaultCoverAmount > 0 && branchVault) {
        // 1. Fetch live balance at save time — props may be stale if the modal was open for a while
        const { data: liveVaultData } = await supabase
          .from(DB_TABLES.BRANCH_VAULTS)
          .select(DB_COLUMNS.VAULT_BALANCE)
          .eq(DB_COLUMNS.BRANCH_ID, branch.id)
          .single();
        const liveVaultBalance = liveVaultData?.[DB_COLUMNS.VAULT_BALANCE] ?? branchVault.balance;

        // Cap the withdrawal against the live balance — never withdraw more than what's actually there
        const safeWithdrawAmount = Math.min(vaultCoverAmount, liveVaultBalance);
        if (safeWithdrawAmount > 0) {
          const vaultWithdrawId = Math.random().toString(36).substr(2, 9);
          const vaultEntryName = `VAULT: ${name.toUpperCase()}`;
          const newVaultBalance = Math.max(0, liveVaultBalance - safeWithdrawAmount);

          // 2. Deduct vault balance FIRST — if this fails, rollback the OPERATIONAL expense
          const { error: vaultErr } = await supabase.from(DB_TABLES.BRANCH_VAULTS)
            .update({ [DB_COLUMNS.VAULT_BALANCE]: newVaultBalance })
            .eq(DB_COLUMNS.BRANCH_ID, branch.id);
          if (vaultErr) {
            await supabase.from(DB_TABLES.EXPENSES).delete().eq(DB_COLUMNS.ID, expenseId);
            throw vaultErr;
          }

          // 3. Record in expenses table (used for ROI add-back calculation)
          const { error: vwErr } = await supabase.from(DB_TABLES.EXPENSES).insert({
            [DB_COLUMNS.ID]: vaultWithdrawId,
            [DB_COLUMNS.BRANCH_ID]: branch.id,
            [DB_COLUMNS.TIMESTAMP]: timestamp,
            [DB_COLUMNS.NAME]: vaultEntryName,
            [DB_COLUMNS.AMOUNT]: safeWithdrawAmount,
            [DB_COLUMNS.CATEGORY]: 'VAULT_WITHDRAWAL',
          });
          if (vwErr) {
            // Rollback vault balance
            await supabase.from(DB_TABLES.BRANCH_VAULTS)
              .update({ [DB_COLUMNS.VAULT_BALANCE]: liveVaultBalance })
              .eq(DB_COLUMNS.BRANCH_ID, branch.id);
            throw vwErr;
          }

          // 4. Record in vault_transactions — linked to today's sales report
          const { error: vtErr } = await supabase.from(DB_TABLES.VAULT_TRANSACTIONS).insert({
            [DB_COLUMNS.ID]: vaultWithdrawId,
            [DB_COLUMNS.BRANCH_ID]: branch.id,
            [DB_COLUMNS.TYPE]: 'WITHDRAWAL',
            [DB_COLUMNS.AMOUNT]: safeWithdrawAmount,
            [DB_COLUMNS.NAME]: vaultEntryName,
            [DB_COLUMNS.TIMESTAMP]: timestamp,
            [DB_COLUMNS.RECEIPT_IMAGE]: receiptUrl || null,
            [DB_COLUMNS.REPORT_ID]: reportId ?? `${branch.id}_${todayStr.replace(/-/g, '')}`,
          });
          if (vtErr) {
            // Rollback vault balance and expense record
            await supabase.from(DB_TABLES.BRANCH_VAULTS)
              .update({ [DB_COLUMNS.VAULT_BALANCE]: liveVaultBalance })
              .eq(DB_COLUMNS.BRANCH_ID, branch.id);
            await supabase.from(DB_TABLES.EXPENSES)
              .delete()
              .eq(DB_COLUMNS.ID, vaultWithdrawId);
            throw vtErr;
          }
        }
      }

      await logAudit({
        branchId: branch.id,
        activityType: 'CREATE',
        entityType: 'EXPENSE',
        entityId: expenseId,
        description: `Quick Expense Log: ${name.toUpperCase()} (₱${expenseAmount}) recorded at ${branch.name}.${withdrawFromVault && vaultCoverAmount > 0 ? ` ₱${vaultCoverAmount.toLocaleString()} covered from vault.` : ''}`,
        amount: expenseAmount,
        performerName: performerName || branch.manager || 'AUTHORIZED MANAGER',
      });

      playSound('success');
      onRefresh?.();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Registry Sync Fault');
      playSound('warning');
    } finally {
      setIsSaving(false);
      setUploadProgress(0);
    }
  };

  const handleSaveDeposit = async () => {
    if (!canSaveDeposit || isSaving) return;
    setIsSaving(true);
    setErrorMessage('');
    try {
      if (onDeposit) {
        await onDeposit(effectiveDepositAmount);
      }
      playSound('success');
      onRefresh?.();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Deposit failed');
      playSound('warning');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveLegacyDeposit = async () => {
    if (!canSaveLegacyDeposit || isSaving) return;
    setIsSaving(true);
    setErrorMessage('');
    try {
      const now = getTrueDate();
      const timePart = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Manila',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      }).format(now);
      const timestamp = `${todayStr}T${timePart}.000+08:00`;
      const { error } = await supabase.from(DB_TABLES.EXPENSES).insert({
        [DB_COLUMNS.ID]: Math.random().toString(36).substr(2, 9),
        [DB_COLUMNS.BRANCH_ID]: branch.id,
        [DB_COLUMNS.TIMESTAMP]: timestamp,
        [DB_COLUMNS.NAME]: 'RENT & BILLS DEPOSIT',
        [DB_COLUMNS.AMOUNT]: depositAmount,
        [DB_COLUMNS.CATEGORY]: 'PROVISION',
      });
      if (error) throw error;
      await logAudit({
        branchId: branch.id,
        activityType: 'CREATE',
        entityType: 'EXPENSE',
        description: `R&B Deposit: ₱${depositAmount} recorded at ${branch.name}.`,
        amount: depositAmount,
        performerName: performerName || branch.manager || 'AUTHORIZED MANAGER',
      });
      playSound('success');
      onRefresh?.();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Deposit failed');
      playSound('warning');
    } finally {
      setIsSaving(false);
    }
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] no-print">
      <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md" onClick={onClose} />

      {/* Centered on all screen sizes */}
      <div className="relative h-full flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-sm">
          <div className="relative bg-white rounded-2xl sm:rounded-3xl w-full shadow-xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">

            {/* Header */}
            <div className="px-5 sm:px-6 pt-5 pb-4 rounded-t-[28px] sm:rounded-t-[40px] shrink-0">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${
                    mode === 'deposit' ? 'bg-emerald-100' : mode === 'legacy_deposit' ? 'bg-indigo-100' : 'bg-rose-100'
                  }`}>
                    {mode === 'expense' && (
                      <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-6-6h12" />
                      </svg>
                    )}
                    {mode === 'deposit' && (
                      <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0 0l-6-6m6 6l6-6" />
                      </svg>
                    )}
                    {mode === 'legacy_deposit' && (
                      <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <h4 className="text-[15px] font-black uppercase tracking-tight text-slate-900 leading-none">
                      {mode === 'expense' ? 'Record Expense' : mode === 'legacy_deposit' ? 'R&B Deposit' : 'Deposit to Vault'}
                    </h4>
                    {mode === 'deposit' && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Balance</span>
                        <span className="text-xs font-black text-emerald-600 tabular-nums">₱{vaultBal.toLocaleString()}</span>
                        {vaultTarget > 0 && (
                          <>
                            <span className="text-slate-200">·</span>
                            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Target</span>
                            <span className="text-xs font-black text-slate-500 tabular-nums">₱{vaultTarget.toLocaleString()}</span>
                          </>
                        )}
                      </div>
                    )}
                    {mode === 'legacy_deposit' && (
                      <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mt-0.5">Rent & Bills Provision</p>
                    )}
                    {mode === 'expense' && (
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-0.5">{branch.name}</p>
                    )}
                  </div>
                </div>
                <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Mode toggle — only shown when vault is enabled and deposit tab not hidden */}
              {hasVault && !hideDepositTab && (
                <div className="flex gap-1.5 p-1 bg-white/60 rounded-xl border border-slate-100">
                  <button
                    onClick={() => switchMode('expense')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide transition-all ${
                      mode === 'expense'
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
                    </svg>
                    Expense
                  </button>
                  <button
                    onClick={() => switchMode('deposit')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide transition-all ${
                      mode === 'deposit'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m0 0l-6-6m6 6l6-6" />
                    </svg>
                    Deposit
                  </button>
                </div>
              )}
            </div>

            {/* Body */}
            <div className="px-5 sm:px-6 pb-5 pt-4 space-y-3 border-t border-slate-100 overflow-y-auto no-scrollbar flex-1">
              {errorMessage && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-center text-xs font-bold text-rose-600 uppercase tracking-widest animate-in slide-in-from-top-2">
                  {errorMessage}
                </div>
              )}

              {/* ── EXPENSE MODE ── */}
              {mode === 'expense' && (
                <>
                  {/* Label Input */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">What's the expense?</label>
                    <div className="relative suggestion-wrapper">
                      <input
                        ref={labelInputRef}
                        value={expenseName}
                        onChange={e => { setExpenseName(e.target.value); setShowSuggestions(true); }}
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-semibold text-sm uppercase outline-none transition-all focus:border-rose-500 focus:ring-1 focus:ring-rose-500/20 placeholder:font-semibold placeholder:normal-case placeholder:text-slate-300"
                        placeholder="e.g. Rent, Electricity, Food..."
                        autoFocus
                        autoComplete="off"
                      />
                      {showSuggestions && filteredSuggestions.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-10 overflow-hidden">
                          {filteredSuggestions.map((s, i) => (
                            <button
                              key={s}
                              type="button"
                              onMouseDown={e => { e.preventDefault(); setExpenseName(s); setShowSuggestions(false); }}
                              className={`w-full text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors hover:bg-rose-50 hover:text-rose-700 ${
                                i < filteredSuggestions.length - 1 ? 'border-b border-slate-100' : ''
                              } text-slate-600`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">Amount</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] font-black text-slate-300 pointer-events-none select-none">₱</span>
                      <input
                        type="number"
                        value={expenseAmount || ''}
                        onChange={e => setExpenseAmount(Number(e.target.value))}
                        className="w-full pl-9 pr-4 py-3.5 bg-white border border-slate-200 rounded-xl font-semibold text-[22px] tabular-nums outline-none transition-all focus:border-rose-500 focus:ring-1 focus:ring-rose-500/20 placeholder:text-slate-300 placeholder:font-bold placeholder:text-lg"
                        placeholder="0"
                        min="0"
                      />
                    </div>
                  </div>

                  {/* Vault deposit conflict warning — this expense will push ROI negative */}
                  {expenseAmount > 0 && todayVaultDeposit > 0 && expenseAmount > netRoi && (
                    <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3">
                      <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      <div className="space-y-0.5">
                        <p className="text-xs font-black text-amber-700 uppercase tracking-widest leading-none">Negative ROI Warning</p>
                        <p className="text-xs font-medium text-amber-600 leading-relaxed">
                          A vault deposit of <span className="font-black">₱{todayVaultDeposit.toLocaleString()}</span> was already made today. Adding this expense will result in a negative ROI of <span className="font-black text-rose-600">−₱{(expenseAmount - netRoi).toLocaleString()}</span>.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Large expense warning — vault can't fully cover this expense */}
                  {expenseAmount > 0 && roiShortfall > 0 && expenseAmount > vaultBal && vaultBal > 0 && (
                    <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-rose-100/60 border-b border-rose-200">
                        <svg className="w-3.5 h-3.5 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                        <p className="text-xs font-black text-rose-600 uppercase tracking-widest">Partial Vault Coverage</p>
                      </div>
                      <div className="px-4 py-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Vault Can Cover</span>
                          <span className="text-xs font-black text-amber-500 tabular-nums">₱{vaultBal.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between border-t border-rose-200 pt-2">
                          <span className="text-xs font-bold text-rose-500 uppercase tracking-widest">Remaining from ROI</span>
                          <span className="text-xs font-black text-rose-600 tabular-nums">₱{(expenseAmount - vaultBal).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Cover from vault */}
                  {canCoverFromVault && expenseAmount > 0 && (
                    <button
                      type="button"
                      onClick={() => setWithdrawFromVault(v => !v)}
                      className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all text-left ${
                        withdrawFromVault
                          ? 'bg-amber-50 border-amber-300'
                          : 'bg-slate-50 border-transparent hover:border-amber-200'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                        withdrawFromVault ? 'bg-amber-500 border-amber-500' : 'border-slate-300'
                      }`}>
                        {withdrawFromVault && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold uppercase tracking-wide ${withdrawFromVault ? 'text-amber-900' : 'text-slate-600'}`}>
                          Cover ₱{vaultCoverAmount.toLocaleString()} from vault
                        </p>
                        <p className={`text-xs font-medium uppercase tracking-wide mt-0.5 tabular-nums ${withdrawFromVault ? 'text-amber-500' : 'text-slate-400'}`}>
                          Expense ₱{expenseAmount.toLocaleString()}{roiShortfall > expenseAmount ? ` + ₱${(roiShortfall - expenseAmount).toLocaleString()} prior deficit` : ''} · vault ₱{vaultBal.toLocaleString()}
                        </p>
                      </div>
                    </button>
                  )}

                  {/* Receipt */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">
                      Receipt{' '}
                      {withdrawFromVault
                        ? <span className="text-rose-500">*</span>
                        : <span className="opacity-50 font-bold normal-case">(optional)</span>
                      }
                    </label>
                    {expenseFile ? (
                      <div className="w-full px-4 py-3 rounded-xl border-2 border-emerald-400 bg-emerald-50 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-lg overflow-hidden bg-white shadow border border-slate-200 shrink-0">
                            <img src={URL.createObjectURL(expenseFile)} className="w-full h-full object-cover" alt="Receipt" />
                          </div>
                          <div>
                            <p className="text-xs font-black uppercase text-emerald-900">Receipt attached</p>
                            <p className="text-xs font-bold text-emerald-600/60 uppercase tracking-widest">Ready to upload</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setExpenseFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                          className="p-1.5 text-rose-400 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button"
                          onClick={() => { if (fileInputRef.current) { fileInputRef.current.setAttribute('capture', 'environment'); fileInputRef.current.click(); } }}
                          className="flex flex-col items-center justify-center gap-1.5 py-4 border-2 border-slate-100 rounded-2xl transition-all group bg-slate-50 hover:border-rose-300 hover:bg-rose-50 active:scale-95">
                          <div className="w-8 h-8 rounded-xl bg-white shadow-sm border border-slate-100 flex items-center justify-center group-hover:border-rose-200 transition-colors">
                            <svg className="w-4 h-4 text-slate-400 group-hover:text-rose-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </div>
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 group-hover:text-rose-500 transition-colors">Take Photo</span>
                        </button>
                        <button type="button"
                          onClick={() => { if (fileInputRef.current) { fileInputRef.current.removeAttribute('capture'); fileInputRef.current.click(); } }}
                          className="flex flex-col items-center justify-center gap-1.5 py-4 border-2 border-slate-100 rounded-2xl transition-all group bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50 active:scale-95">
                          <div className="w-8 h-8 rounded-xl bg-white shadow-sm border border-slate-100 flex items-center justify-center group-hover:border-indigo-200 transition-colors">
                            <svg className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                          </div>
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 group-hover:text-indigo-500 transition-colors">Upload</span>
                        </button>
                      </div>
                    )}
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => setExpenseFile(e.target.files?.[0] || null)} />
                  </div>

                  <button
                    onClick={handleSaveExpense}
                    disabled={!canSaveExpense || isSaving}
                    className="w-full text-white font-black py-4 rounded-2xl bg-rose-500 hover:bg-rose-600 uppercase tracking-widest text-xs shadow-lg shadow-rose-200 active:scale-95 disabled:opacity-30 disabled:shadow-none transition-all flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {uploadProgress ? `Uploading ${uploadProgress}%` : 'Saving...'}
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        Log Expense
                      </>
                    )}
                  </button>
                </>
              )}

              {/* ── LEGACY R&B DEPOSIT MODE ── */}
              {mode === 'legacy_deposit' && (
                <>
                  {maxDeposit > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const willCheck = depositAmount !== maxDeposit;
                        setDepositAmount(willCheck ? maxDeposit : 0);
                        playSound('click');
                      }}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                        depositAmount === maxDeposit
                          ? 'bg-indigo-50 border-indigo-300'
                          : 'bg-slate-50 border-transparent hover:border-indigo-200'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                        depositAmount === maxDeposit ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300'
                      }`}>
                        {depositAmount === maxDeposit && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold uppercase tracking-wide ${depositAmount === maxDeposit ? 'text-indigo-900' : 'text-slate-600'}`}>
                          Deposit all from net ROI
                        </p>
                        <p className={`text-xs font-medium uppercase tracking-wide mt-0.5 ${depositAmount === maxDeposit ? 'text-indigo-500' : 'text-slate-400'}`}>
                          ₱{maxDeposit.toLocaleString()} available
                        </p>
                      </div>
                    </button>
                  )}

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">Amount (₱)</label>
                    <input
                      type="number"
                      value={depositAmount || ''}
                      onChange={e => setDepositAmount(Number(e.target.value))}
                      className="w-full p-5 bg-white border border-slate-200 rounded-xl font-semibold text-xl outline-none transition-all shadow-inner focus:border-indigo-400 focus:bg-white"
                      placeholder="0"
                      min="0"
                      autoFocus={mode === 'legacy_deposit'}
                    />
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={onClose}
                      className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50 active:scale-95 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveLegacyDeposit}
                      disabled={!canSaveLegacyDeposit || isSaving}
                      className="flex-1 py-3 rounded-xl bg-indigo-600 text-white text-xs font-semibold uppercase tracking-wide shadow-lg disabled:opacity-30 hover:bg-indigo-700 active:scale-95 transition-all"
                    >
                      {isSaving ? 'Saving...' : `Deposit ₱${(depositAmount || 0).toLocaleString()}`}
                    </button>
                  </div>
                </>
              )}

              {/* ── DEPOSIT MODE ── */}
              {mode === 'deposit' && (
                <>
                  {/* Remit-all checkbox — default checked */}
                  <button
                    type="button"
                    onClick={() => { setDepositAll(v => !v); setDepositAmount(0); playSound('click'); }}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                      depositAll ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-transparent hover:border-emerald-200'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                      depositAll ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'
                    }`}>
                      {depositAll && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold uppercase tracking-wide ${depositAll ? 'text-emerald-900' : 'text-slate-600'}`}>
                        Remit full net ROI
                      </p>
                      <p className={`text-xs font-medium uppercase tracking-wide mt-0.5 tabular-nums ${depositAll ? 'text-emerald-600' : 'text-slate-400'}`}>
                        ₱{maxDeposit.toLocaleString()} available
                      </p>
                    </div>
                  </button>

                  {/* Custom amount — only when not remitting all */}
                  {!depositAll && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">Custom Amount (₱)</label>
                      <input
                        type="number"
                        value={depositAmount || ''}
                        onChange={e => setDepositAmount(Number(e.target.value))}
                        className="w-full p-5 bg-white border border-slate-200 rounded-xl font-semibold text-xl outline-none transition-all shadow-inner focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20"
                        placeholder="0"
                        min="0"
                        max={maxDeposit}
                        autoFocus
                      />
                      {depositAmount > maxDeposit && maxDeposit > 0 && (
                        <p className="text-xs font-bold text-rose-500 uppercase tracking-widest ml-1">
                          Exceeds net ROI of ₱{maxDeposit.toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}

                  {effectiveDepositAmount > 0 && (
                    <div className="bg-emerald-50 rounded-2xl px-4 py-3 flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">After deposit</span>
                      <span className="text-sm font-black text-emerald-900 tabular-nums">₱{(vaultBal + effectiveDepositAmount).toLocaleString()}</span>
                    </div>
                  )}

                  {/* Irreversible warning */}
                  {effectiveDepositAmount > 0 && (
                    <div className="flex items-start gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl">
                      <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <p className="text-xs font-bold text-amber-800 leading-snug">
                        Vault deposits <span className="font-black">cannot be reversed</span>. Confirm the amount before proceeding.
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={onClose}
                      className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50 active:scale-95 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveDeposit}
                      disabled={!canSaveDeposit || isSaving}
                      className="flex-1 py-3 rounded-xl bg-emerald-600 text-white text-xs font-semibold uppercase tracking-wide shadow-lg disabled:opacity-30 hover:bg-emerald-700 active:scale-95 transition-all"
                    >
                      {isSaving ? 'Saving...' : `Confirm ₱${effectiveDepositAmount.toLocaleString()}`}
                    </button>
                  </div>
                </>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>,
    document.body
  );

};
