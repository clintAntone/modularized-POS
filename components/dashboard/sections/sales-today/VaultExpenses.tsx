
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Expense } from '../../../../types';
import { playSound } from '../../../../lib/audio';

import { UI_THEME } from '../../../../constants/ui_designs';

interface VaultExpensesProps {
  operationalLogs: Expense[];
  vaultDepositLogs?: any[]; // from sales_reports.vault_data, category VAULT_DEPOSIT
  operationalTotal: number;
  setIsAddExpenseModalOpen: (open: boolean) => void;
  setViewingExpense: (expense: Expense | null) => void;
  isClosedMode?: boolean;
  onDeleteExpense: (id: string) => void;
  currentNetRoi?: number;
  isLegacy?: boolean;
  onOpenVaultDeposit?: () => void;
  onOpenLegacyDeposit?: () => void;
  onOpenRecordExpense?: () => void; // explicit handler so parent fully controls what opens
}

export const VaultExpenses: React.FC<VaultExpensesProps> = ({
                                                              operationalLogs,
                                                              vaultDepositLogs: vaultDepositLogsProp = [],
                                                              operationalTotal,
                                                              setIsAddExpenseModalOpen,
                                                              setViewingExpense,
                                                              isClosedMode = false,
                                                              onDeleteExpense,
                                                              currentNetRoi = 0,
                                                              isLegacy = false,
                                                              onOpenVaultDeposit,
                                                              onOpenLegacyDeposit,
                                                              onOpenRecordExpense,
                                                            }) => {
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [revealedDeleteId, setRevealedDeleteId] = useState<string | null>(null);
  const [relieverTooltipId, setRelieverTooltipId] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss reliever tooltip after 2s
  useEffect(() => {
    if (relieverTooltipId) {
      tooltipTimer.current = setTimeout(() => setRelieverTooltipId(null), 2000);
    }
    return () => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current); };
  }, [relieverTooltipId]);

  // Split by category: operational, vault deposits (from report), vault withdrawals, legacy provision
  const { expenseLogs, vaultDepositLogs, vaultWithdrawalLogs, provisionLogs, expensesSubtotal, vaultDepositSubtotal, vaultWithdrawalSubtotal, provisionTotal, vaultCoverageMap } = useMemo(() => {
    const expenseLogs = operationalLogs.filter(e => e.category === 'OPERATIONAL');
    const vaultDepositLogs = vaultDepositLogsProp; // sourced from sales_reports.vault_data
    const vaultWithdrawalLogs = operationalLogs.filter(e => e.category === 'VAULT_WITHDRAWAL');
    const provisionLogs = operationalLogs.filter(e => e.category === 'PROVISION');
    const expensesSubtotal = expenseLogs.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const vaultDepositSubtotal = vaultDepositLogs.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
    const vaultWithdrawalSubtotal = vaultWithdrawalLogs.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const provisionTotal = provisionLogs.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    // Map expense name → vault amount covered (e.g. "VAULT: ELECTRICITY" → covers "ELECTRICITY")
    const vaultCoverageMap: Record<string, number> = {};
    vaultWithdrawalLogs.forEach(v => {
      if (v.name.startsWith('VAULT: ')) {
        const expName = v.name.slice(7);
        vaultCoverageMap[expName] = (vaultCoverageMap[expName] ?? 0) + Number(v.amount);
      }
    });
    return { expenseLogs, vaultDepositLogs, vaultWithdrawalLogs, provisionLogs, expensesSubtotal, vaultDepositSubtotal, vaultWithdrawalSubtotal, provisionTotal, vaultCoverageMap };
  }, [operationalLogs, vaultDepositLogsProp]);

  const startLongPress = (id: string, isReliever: boolean) => {
    if (isClosedMode) return;
    longPressTimer.current = setTimeout(() => {
      if (isReliever) {
        setRelieverTooltipId(id);
        playSound('warning');
      } else {
        setRevealedDeleteId(id);
        playSound('click');
      }
      longPressTimer.current = null;
    }, 600);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleDeleteClick = (evt: React.MouseEvent, id: string) => {
    evt.stopPropagation();
    setRevealedDeleteId(null);
    onDeleteExpense(id);
  };

  const renderExpenseItem = (e: Expense) => {
    const isRevealed = revealedDeleteId === e.id;
    const isProvision = e.category === 'PROVISION';
    const isVaultDeposit = e.category === 'VAULT_DEPOSIT';
    const isVaultWithdrawal = e.category === 'VAULT_WITHDRAWAL';
    const isRelieverPayout = e.name.startsWith('RELIEVER PAYOUT:');

    const isTooltipShowing = relieverTooltipId === e.id;

    return (
        <div
            key={e.id}
            className="relative"
            onTouchStart={() => startLongPress(e.id, isRelieverPayout)}
            onTouchEnd={cancelLongPress}
            onMouseDown={() => startLongPress(e.id, isRelieverPayout)}
            onMouseUp={cancelLongPress}
            onMouseLeave={() => { cancelLongPress(); setRevealedDeleteId(null); }}
        >
          {/* Reliever payout locked tooltip */}
          {isTooltipShowing && (
            <div className="absolute inset-0 z-10 bg-amber-500/90 backdrop-blur-sm rounded-[22px] flex items-center justify-center gap-2 animate-in fade-in zoom-in-95 duration-150 pointer-events-none">
              <span className="text-base opacity-40">🔒</span>
              <p className="text-[10px] font-black text-white uppercase tracking-widest leading-tight text-center">
                Reliever salary cannot be removed
              </p>
            </div>
          )}
          <div
              onClick={() => { if (!isRevealed) { playSound('click'); setViewingExpense(e); } }}
              className={`p-4 rounded-[22px] border transition-all duration-300 cursor-pointer group active:scale-[0.98] flex items-center justify-between shadow-sm ${
                isRevealed
                  ? 'bg-white border-rose-500 translate-x-[-4px]'
                  : isVaultWithdrawal
                    ? 'bg-amber-50/60 border-amber-100 hover:border-amber-300'
                    : 'bg-white border-slate-100 hover:border-slate-300'
              }`}
          >
            <div className="flex items-center gap-3 overflow-hidden">
              {/* Directional arrow icon */}
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-inner border transition-all duration-300 ${
                isVaultWithdrawal
                    ? 'bg-amber-100 border-amber-200 text-amber-600'
                    : isProvision
                      ? 'bg-indigo-50 border-indigo-100 text-indigo-400'
                      : 'bg-rose-50 border-rose-100 text-rose-400'
              }`}>
                {isVaultWithdrawal ? (
                  /* Arrow up out of vault */
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20V4m0 0l-6 6m6-6l6 6" /></svg>
                ) : isProvision ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                ) : isRelieverPayout ? (
                  /* Arrow up — reliever payout (locked, cannot be removed) */
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20V4m0 0l-6 6m6-6l6 6" /></svg>
                ) : (
                  /* Arrow up — money leaving */
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20V4m0 0l-6 6m6-6l6 6" /></svg>
                )}
              </div>
              <div className="overflow-hidden">
                <p className={`text-[12px] font-bold uppercase truncate leading-none mb-1.5 transition-colors ${isRevealed ? 'text-rose-600' : isVaultWithdrawal ? 'text-amber-800' : 'text-slate-900'}`}>{e.name}</p>
                {/* Vault coverage breakdown — shown for OPERATIONAL expenses that used vault funds */}
                {!isVaultDeposit && !isVaultWithdrawal && !isProvision && (vaultCoverageMap[e.name] ?? 0) > 0 && (
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-[7px] font-black text-slate-500 tabular-nums">₱{(e.amount - vaultCoverageMap[e.name]).toLocaleString()} ROI</span>
                    <span className="text-[7px] text-slate-300">·</span>
                    <span className="text-[7px] font-black text-amber-500 tabular-nums">₱{vaultCoverageMap[e.name].toLocaleString()} Vault</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-widest leading-none tabular-nums">
                    {(() => {
                      const date = new Date(e.timestamp.replace(/(\+00:00|Z)$/, ""));
                      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                    })()}
                  </p>
                  {!isVaultDeposit && !isVaultWithdrawal && !isProvision && !e.receiptImage && (
                    <span className="text-[7px] font-black text-slate-300 uppercase tracking-widest">· No Receipt</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-3">
              <p className={`text-sm font-bold tabular-nums transition-colors ${isRevealed ? 'text-rose-600' : isVaultWithdrawal ? 'text-amber-700' : 'text-slate-900'}`}>
                −₱{e.amount.toLocaleString()}
              </p>

              {/* TABLET/DESKTOP HOVER DELETE BUTTON (md+) */}
              {!isRelieverPayout && (
                <button
                    onClick={(evt) => handleDeleteClick(evt, e.id)}
                    className={`hidden md:flex p-2 rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-600 hover:text-white transition-all opacity-0 group-hover:opacity-100 active:scale-90`}
                    title="Delete record"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              )}

              {/* MOBILE LONG-PRESS REVEALED DELETE BUTTON (<md) */}
              {isRevealed && !isRelieverPayout && (
                  <button
                      onClick={(evt) => handleDeleteClick(evt, e.id)}
                      className="md:hidden p-2.5 rounded-lg bg-rose-600 text-white shadow-lg animate-in zoom-in duration-200"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="4"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
              )}
            </div>
          </div>
        </div>
    );
  };

  // ── LEGACY LAYOUT (vault_enabled = false) ───────────────────────────────
  if (isLegacy) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
        {/* LEFT: RENT & BILLS */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_6px_#818cf8]"></div>
              <div>
                <h4 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest leading-none">Rent & Bills</h4>
                <p className="text-[7px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5">Rent & Utility Audit</p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-indigo-500 tabular-nums">₱{provisionTotal.toLocaleString()}</span>
          </div>

          <div className="flex-1 flex flex-col gap-2 min-h-[80px]">
            {provisionLogs.length > 0 ? (
              provisionLogs.map(renderExpenseItem)
            ) : (
              <div className={`flex-1 h-[80px] w-full text-center bg-slate-50/20 ${UI_THEME.radius.card} border-2 border-dashed border-slate-100 flex flex-col items-center justify-center gap-2 opacity-30`}>
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">R&B Pool</p>
              </div>
            )}
          </div>

          <button
            onClick={onOpenLegacyDeposit}
            disabled={isClosedMode || !onOpenLegacyDeposit}
            className={`no-print w-full ${UI_THEME.radius.card} p-4 flex items-center justify-center gap-3 border-2 border-dashed transition-all group active:scale-[0.98] ${isClosedMode || !onOpenLegacyDeposit ? 'border-slate-100 opacity-50 cursor-not-allowed bg-white' : 'bg-white border-indigo-100 hover:border-indigo-400 hover:bg-indigo-50/30'}`}
          >
            <div className={`w-7 h-7 rounded-xl flex items-center justify-center transition-all shadow-inner text-sm shrink-0 ${isClosedMode ? 'bg-slate-50 text-slate-200' : 'bg-indigo-50 text-indigo-300 group-hover:bg-indigo-600 group-hover:text-white'}`}>+</div>
            <p className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${isClosedMode ? 'text-slate-300' : 'text-slate-400 group-hover:text-indigo-700'}`}>Daily Deposit</p>
          </button>
        </div>

        {/* RIGHT: EXPENSE */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_6px_#f43f5e] animate-pulse"></div>
              <div>
                <h4 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest leading-none">Expense</h4>
                <p className="text-[7px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5">Operational Outflows Today</p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-rose-600 tabular-nums">₱{expensesSubtotal.toLocaleString()}</span>
          </div>

          <div className="flex-1 flex flex-col gap-2 min-h-[80px]">
            {expenseLogs.length > 0 ? (
              expenseLogs.map(renderExpenseItem)
            ) : (
              <div className={`flex-1 h-[80px] w-full text-center bg-slate-50/20 ${UI_THEME.radius.card} border-2 border-dashed border-slate-100 flex flex-col items-center justify-center gap-2 opacity-30`}>
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Daily Expenses</p>
              </div>
            )}
          </div>

          <button
            onClick={() => setIsAddExpenseModalOpen(true)}
            disabled={isClosedMode}
            className={`no-print w-full ${UI_THEME.radius.card} p-4 flex items-center justify-center gap-3 border-2 border-dashed transition-all group active:scale-[0.98] ${isClosedMode ? 'border-slate-100 opacity-50 cursor-not-allowed bg-white' : 'bg-white border-slate-200 hover:border-rose-500 hover:bg-rose-50/10'}`}
          >
            <div className={`w-7 h-7 rounded-xl flex items-center justify-center transition-all shadow-inner text-sm shrink-0 ${isClosedMode ? 'bg-slate-50 text-slate-200' : 'bg-slate-50 text-slate-300 group-hover:bg-rose-600 group-hover:text-white'}`}>+</div>
            <p className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${isClosedMode ? 'text-slate-300' : 'text-slate-400 group-hover:text-rose-700'}`}>Record Expense</p>
          </button>
        </div>
      </div>
    );
  }

  // ── VAULT LAYOUT (vault_enabled = true) ──────────────────────────────────
  const allEntries = (expenseLogs as Expense[])
    .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  const hasEntries = allEntries.length > 0;
  const sortedVaultDeposits = [...vaultDepositLogs].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

  return (
    <>
      {/* 2-column on desktop: Vault Deposits (left) | Expenses (right) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">

        {/* ── LEFT: Vault Deposits (mobile: below expenses) ── */}
        <div className="flex flex-col gap-3 order-2 md:order-1 pt-4 md:pt-0">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_6px_#818cf8]"></div>
              <div>
                <h4 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest leading-none">Vault Deposits</h4>
                <p className="text-[7px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5">Saved to vault fund today</p>
              </div>
            </div>
            {vaultDepositSubtotal > 0 && (
              <span className="text-[10px] font-bold text-indigo-500 tabular-nums">−₱{vaultDepositSubtotal.toLocaleString()}</span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {sortedVaultDeposits.length > 0 ? sortedVaultDeposits.map((e: any) => (
              <div key={e.id} className="p-4 rounded-[22px] border border-indigo-100 bg-indigo-50/40 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-inner border bg-indigo-100 border-indigo-200 text-indigo-500">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 20V4m0 0l-6 6m6-6l6 6" />
                    </svg>
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-[12px] font-bold uppercase truncate leading-none mb-1.5 text-indigo-900">Vault Deposit</p>
                    <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-widest leading-none tabular-nums">
                      {(() => {
                        const date = new Date(e.timestamp.replace(/(\+00:00|Z)$/, ''));
                        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                      })()}
                    </p>
                  </div>
                </div>
                <p className="text-sm font-bold tabular-nums text-indigo-700 shrink-0 ml-3">
                  −₱{Number(e.amount).toLocaleString()}
                </p>
              </div>
            )) : (
              <div className={`h-[100px] w-full text-center bg-slate-50/20 ${UI_THEME.radius.card} border-2 border-dashed border-slate-100 flex flex-col items-center justify-center gap-2 grayscale opacity-10`}>
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20V4m0 0l-6 6m6-6l6 6" /></svg>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">No deposits today</p>
              </div>
            )}
          </div>

          <button
            onClick={onOpenVaultDeposit}
            disabled={isClosedMode || !onOpenVaultDeposit}
            className={`no-print w-full flex items-center justify-center gap-1.5 py-5 px-3 rounded-2xl border border-dashed transition-all active:bg-indigo-100 ${isClosedMode || !onOpenVaultDeposit ? 'border-slate-100 opacity-50 cursor-not-allowed bg-white' : 'border-indigo-200 bg-white hover:border-indigo-400 hover:bg-indigo-50'}`}
          >
            <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20V4m0 0l-6 6m6-6l6 6" /></svg>
            <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest whitespace-nowrap">Vault Deposit</span>
          </button>
        </div>

        {/* ── RIGHT: Expenses (mobile: above vault deposits) ── */}
        <div className="flex flex-col gap-3 order-1 md:order-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_6px_#f43f5e] animate-pulse"></div>
              <div>
                <h4 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest leading-none">Expenses</h4>
                <p className="text-[7px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5">Leaves hands today</p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-rose-600 tabular-nums">−₱{expensesSubtotal.toLocaleString()}</span>
          </div>

          <div className="flex flex-col gap-2">
            {hasEntries ? allEntries.map(e => renderExpenseItem(e)) : (
              <div className={`h-[100px] w-full text-center bg-slate-50/20 ${UI_THEME.radius.card} border-2 border-dashed border-slate-100 flex flex-col items-center justify-center gap-2 grayscale opacity-10`}>
                <div className="text-2xl">🧾</div>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">No expenses today</p>
              </div>
            )}
          </div>

          <button
            onClick={onOpenRecordExpense ?? (() => setIsAddExpenseModalOpen(true))}
            disabled={isClosedMode}
            className={`no-print w-full flex items-center justify-center gap-1.5 py-5 px-3 rounded-2xl border border-dashed transition-all active:bg-rose-100 ${isClosedMode ? 'border-slate-100 opacity-50 cursor-not-allowed bg-white' : 'border-slate-200 bg-white hover:border-rose-400 hover:bg-rose-50'}`}
          >
            <svg className="w-4 h-4 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            <span className="text-[9px] font-bold text-rose-400 uppercase tracking-widest whitespace-nowrap">Record Expense</span>
          </button>
        </div>

      </div>

      {/* LEGACY RENT & BILLS — only shown when historical provision deposits exist */}
      {provisionLogs.length > 0 && (
        <div className="flex flex-col w-full space-y-4">
          <div className="flex justify-between items-center px-4 h-10">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_8px_#818cf8]"></div>
              <div>
                <h4 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest leading-none">Rent & Bills</h4>
                <p className="text-[7px] font-semibold text-slate-400 uppercase tracking-widest mt-1">Daily Provision Deposits</p>
              </div>
            </div>
            <div className="bg-white px-3 py-1.5 rounded-xl border border-indigo-100 shadow-sm">
              <span className="text-[11px] font-bold text-indigo-500 tabular-nums">₱{provisionTotal.toLocaleString()}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {provisionLogs.map(renderExpenseItem)}
          </div>
        </div>
      )}
    </>
  );
};
