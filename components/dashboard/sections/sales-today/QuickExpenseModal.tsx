
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
  onDeposit?: (amount: number) => Promise<void>;
  hideDepositTab?: boolean;
}

export const QuickExpenseModal: React.FC<QuickExpenseModalProps> = ({
  branch, todayStr, onClose, onRefresh, performerName, branchVault,
  defaultIsVaultDeposit = false, defaultIsLegacyDeposit = false, currentNetRoi, onDeposit,
  hideDepositTab = false,
}) => {
  const initialMode: ModalMode = defaultIsLegacyDeposit ? 'legacy_deposit' : defaultIsVaultDeposit ? 'deposit' : 'expense';
  const [mode, setMode] = useState<ModalMode>(initialMode);

  // Expense state
  const [expenseName, setExpenseName] = useState('');
  const [expenseAmount, setExpenseAmount] = useState<number>(0);
  const [withdrawFromVault, setWithdrawFromVault] = useState(false);
  const [expenseFile, setExpenseFile] = useState<File | null>(null);
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

  // Expense mode derived
  const vaultShortfall = expenseAmount > 0 ? Math.max(0, expenseAmount - Math.max(0, netRoi)) : 0;
  const canWithdrawFromVault = vaultShortfall > 0 && vaultBal > 0;
  const vaultWithdrawAmount = canWithdrawFromVault ? Math.min(vaultShortfall, vaultBal) : 0;

  const receiptRequired = withdrawFromVault && vaultWithdrawAmount > 0;
  const canSaveExpense = !!(expenseName.trim() && expenseAmount > 0 && (!receiptRequired || expenseFile));
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

      if (withdrawFromVault && branchVault && vaultWithdrawAmount > 0) {
        const newBalance = Math.max(0, vaultBal - vaultWithdrawAmount);
        await supabase.from(DB_TABLES.BRANCH_VAULTS)
          .update({ [DB_COLUMNS.VAULT_BALANCE]: newBalance })
          .eq(DB_COLUMNS.BRANCH_ID, branch.id);
        await supabase.from(DB_TABLES.EXPENSES).insert({
          [DB_COLUMNS.ID]: Math.random().toString(36).substr(2, 9),
          [DB_COLUMNS.BRANCH_ID]: branch.id,
          [DB_COLUMNS.TIMESTAMP]: timestamp,
          [DB_COLUMNS.NAME]: `VAULT: ${name.toUpperCase()}`,
          [DB_COLUMNS.AMOUNT]: vaultWithdrawAmount,
          [DB_COLUMNS.CATEGORY]: 'VAULT_WITHDRAWAL',
        });
      }

      await logAudit({
        branchId: branch.id,
        activityType: 'CREATE',
        entityType: 'EXPENSE',
        entityId: expenseId,
        description: `Quick Expense Log: ${name.toUpperCase()} (₱${expenseAmount}) recorded at ${branch.name}.${withdrawFromVault ? ` ₱${vaultWithdrawAmount} covered from vault.` : ''}`,
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
          <div className="relative bg-white rounded-[28px] sm:rounded-[40px] w-full shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">

            {/* Header */}
            <div className={`px-5 sm:px-6 pt-5 pb-4 rounded-t-[28px] sm:rounded-t-[40px] transition-colors shrink-0 ${mode === 'deposit' ? 'bg-emerald-50/70' : mode === 'legacy_deposit' ? 'bg-indigo-50/70' : 'bg-slate-50/50'}`}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="text-xl font-black uppercase tracking-tight text-slate-900">
                    {mode === 'expense' ? 'Quick Expense Log' : mode === 'legacy_deposit' ? 'R&B Deposit' : 'Deposit to Vault'}
                  </h4>
                  {mode === 'deposit' && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Current Balance</span>
                      <span className="text-[11px] font-black text-emerald-700 tabular-nums">₱{vaultBal.toLocaleString()}</span>
                      {vaultTarget > 0 && (
                        <>
                          <span className="text-slate-200">·</span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Target</span>
                          <span className="text-[11px] font-black text-slate-500 tabular-nums">₱{vaultTarget.toLocaleString()}</span>
                        </>
                      )}
                    </div>
                  )}
                  {mode === 'legacy_deposit' && (
                    <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mt-1">Daily Rent & Bills Provision</p>
                  )}
                </div>
                <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-700 transition-all">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Mode toggle — only shown when vault is enabled and deposit tab not hidden */}
              {hasVault && !hideDepositTab && (
                <div className="flex gap-1.5 p-1 bg-white/60 rounded-xl border border-slate-100">
                  <button
                    onClick={() => switchMode('expense')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
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
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
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
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-center text-[10px] font-bold text-rose-600 uppercase tracking-widest animate-in slide-in-from-top-2">
                  {errorMessage}
                </div>
              )}

              {/* ── EXPENSE MODE ── */}
              {mode === 'expense' && (
                <>
                  {/* Label Input */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Label</label>
                    <div className="relative suggestion-wrapper">
                      <input
                        ref={labelInputRef}
                        value={expenseName}
                        onChange={e => { setExpenseName(e.target.value); setShowSuggestions(true); }}
                        className="w-full p-2.5 bg-slate-50 border-2 border-transparent rounded-xl font-bold text-sm uppercase outline-none transition-all shadow-inner focus:border-rose-400 focus:bg-white"
                        placeholder="E.G. RENT, GAS..."
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
                              className={`w-full text-left px-4 py-2.5 text-[11px] font-black uppercase tracking-widest transition-colors hover:bg-rose-50 hover:text-rose-700 ${
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
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Amount (₱)</label>
                    <input
                      type="number"
                      value={expenseAmount || ''}
                      onChange={e => { setExpenseAmount(Number(e.target.value)); setWithdrawFromVault(false); }}
                      className="w-full p-2.5 bg-slate-50 border-2 border-transparent rounded-xl font-black text-lg outline-none transition-all shadow-inner focus:border-rose-400 focus:bg-white"
                      placeholder="0"
                      min="0"
                    />
                  </div>

                  {/* Vault shortfall offer */}
                  {canWithdrawFromVault && (
                    <button
                      type="button"
                      onClick={() => setWithdrawFromVault(v => !v)}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                        withdrawFromVault
                          ? 'bg-amber-50 border-amber-300'
                          : 'bg-slate-50 border-transparent hover:border-amber-200'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${withdrawFromVault ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[11px] font-black uppercase tracking-widest ${withdrawFromVault ? 'text-amber-900' : 'text-slate-600'}`}>
                          Cover ₱{vaultWithdrawAmount.toLocaleString()} shortfall from Vault
                        </p>
                        <p className={`text-[9px] font-bold uppercase tracking-widest mt-0.5 ${withdrawFromVault ? 'text-amber-600' : 'text-slate-400'}`}>
                          Expense exceeds net ROI · Vault: ₱{vaultBal.toLocaleString()} available
                        </p>
                      </div>
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${withdrawFromVault ? 'bg-amber-500 border-amber-500' : 'border-slate-300'}`}>
                        {withdrawFromVault && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </button>
                  )}

                  {/* Receipt */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                      Receipt{' '}
                      {receiptRequired
                        ? <span className="text-rose-500 font-black normal-case">(required for vault coverage)</span>
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
                            <p className="text-[10px] font-black uppercase text-emerald-900">Receipt attached</p>
                            <p className="text-[8px] font-bold text-emerald-600/60 uppercase tracking-widest">Ready to upload</p>
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
                          className={`flex items-center justify-center gap-2 py-3 border-2 border-dashed rounded-xl transition-all group ${receiptRequired ? 'bg-rose-50/40 border-rose-300 hover:border-rose-500' : 'bg-slate-50 border-slate-100 hover:border-rose-400 hover:bg-rose-50/30'}`}>
                          <span className="text-base group-hover:scale-110 transition-transform">📷</span>
                          <span className={`text-[8px] font-black uppercase tracking-widest ${receiptRequired ? 'text-rose-400' : 'text-slate-400 group-hover:text-rose-600'}`}>Take Photo</span>
                        </button>
                        <button type="button"
                          onClick={() => { if (fileInputRef.current) { fileInputRef.current.removeAttribute('capture'); fileInputRef.current.click(); } }}
                          className={`flex items-center justify-center gap-2 py-3 border-2 border-dashed rounded-xl transition-all group ${receiptRequired ? 'bg-rose-50/40 border-rose-300 hover:border-rose-500' : 'bg-slate-50 border-slate-100 hover:border-indigo-400 hover:bg-indigo-50/30'}`}>
                          <span className="text-base group-hover:scale-110 transition-transform">📁</span>
                          <span className={`text-[8px] font-black uppercase tracking-widest ${receiptRequired ? 'text-rose-400' : 'text-slate-400 group-hover:text-indigo-600'}`}>Upload</span>
                        </button>
                      </div>
                    )}
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => setExpenseFile(e.target.files?.[0] || null)} />
                  </div>

                  <button
                    onClick={handleSaveExpense}
                    disabled={!canSaveExpense || isSaving}
                    className="w-full text-white font-black py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 uppercase tracking-widest text-[11px] shadow-lg active:scale-95 disabled:opacity-30 transition-all"
                  >
                    {isSaving
                      ? `Saving${uploadProgress ? ` (${uploadProgress}%)` : ''}...`
                      : withdrawFromVault
                        ? `Log + Withdraw ₱${vaultWithdrawAmount.toLocaleString()} from Vault`
                        : 'Log Expense'}
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
                        <p className={`text-[11px] font-black uppercase tracking-widest ${depositAmount === maxDeposit ? 'text-indigo-900' : 'text-slate-600'}`}>
                          Deposit all from net ROI
                        </p>
                        <p className={`text-[9px] font-bold uppercase tracking-widest mt-0.5 ${depositAmount === maxDeposit ? 'text-indigo-500' : 'text-slate-400'}`}>
                          ₱{maxDeposit.toLocaleString()} available
                        </p>
                      </div>
                    </button>
                  )}

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Amount (₱)</label>
                    <input
                      type="number"
                      value={depositAmount || ''}
                      onChange={e => setDepositAmount(Number(e.target.value))}
                      className="w-full p-5 bg-slate-50 border-2 border-transparent rounded-2xl font-black text-xl outline-none transition-all shadow-inner focus:border-indigo-400 focus:bg-white"
                      placeholder="0"
                      min="0"
                      autoFocus={mode === 'legacy_deposit'}
                    />
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={onClose}
                      className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 active:scale-95 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveLegacyDeposit}
                      disabled={!canSaveLegacyDeposit || isSaving}
                      className="flex-1 py-3 rounded-xl bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest shadow-lg disabled:opacity-30 hover:bg-indigo-700 active:scale-95 transition-all"
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
                      <p className={`text-[11px] font-black uppercase tracking-widest ${depositAll ? 'text-emerald-900' : 'text-slate-600'}`}>
                        Remit full net ROI
                      </p>
                      <p className={`text-[9px] font-bold uppercase tracking-widest mt-0.5 tabular-nums ${depositAll ? 'text-emerald-600' : 'text-slate-400'}`}>
                        ₱{maxDeposit.toLocaleString()} available
                      </p>
                    </div>
                  </button>

                  {/* Custom amount — only when not remitting all */}
                  {!depositAll && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Custom Amount (₱)</label>
                      <input
                        type="number"
                        value={depositAmount || ''}
                        onChange={e => setDepositAmount(Number(e.target.value))}
                        className="w-full p-5 bg-slate-50 border-2 border-transparent rounded-2xl font-black text-xl outline-none transition-all shadow-inner focus:border-emerald-400 focus:bg-white"
                        placeholder="0"
                        min="0"
                        max={maxDeposit}
                        autoFocus
                      />
                      {depositAmount > maxDeposit && maxDeposit > 0 && (
                        <p className="text-[9px] font-bold text-rose-500 uppercase tracking-widest ml-1">
                          Exceeds net ROI of ₱{maxDeposit.toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}

                  {effectiveDepositAmount > 0 && (
                    <div className="bg-emerald-50 rounded-2xl px-4 py-3 flex items-center justify-between">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">After deposit</span>
                      <span className="text-[13px] font-black text-emerald-900 tabular-nums">₱{(vaultBal + effectiveDepositAmount).toLocaleString()}</span>
                    </div>
                  )}

                  {/* Irreversible warning */}
                  {effectiveDepositAmount > 0 && (
                    <div className="flex items-start gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl">
                      <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <p className="text-[10px] font-bold text-amber-800 leading-snug">
                        Vault deposits <span className="font-black">cannot be reversed</span>. Confirm the amount before proceeding.
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={onClose}
                      className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 active:scale-95 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveDeposit}
                      disabled={!canSaveDeposit || isSaving}
                      className="flex-1 py-3 rounded-xl bg-emerald-600 text-white text-[11px] font-black uppercase tracking-widest shadow-lg disabled:opacity-30 hover:bg-emerald-700 active:scale-95 transition-all"
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
