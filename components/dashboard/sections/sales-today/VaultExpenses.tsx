
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
  onDeleteVaultDeposit?: (id: string) => void;
  onDeleteVaultWithdrawal?: (id: string) => void; // full reversal: removes withdrawal + paired expense
  currentNetRoi?: number;
  isLegacy?: boolean;
  onOpenVaultDeposit?: () => void;
  onOpenLegacyDeposit?: () => void;
  onOpenRecordExpense?: () => void; // explicit handler so parent fully controls what opens
  vaultBalance?: number;       // current live vault balance
  vaultInitialBalance?: number; // initial balance set by admin
}

export const VaultExpenses: React.FC<VaultExpensesProps> = ({
                                                              operationalLogs,
                                                              vaultDepositLogs: vaultDepositLogsProp = [],
                                                              operationalTotal,
                                                              setIsAddExpenseModalOpen,
                                                              setViewingExpense,
                                                              isClosedMode = false,
                                                              onDeleteExpense,
                                                              onDeleteVaultDeposit,
                                                              onDeleteVaultWithdrawal,
                                                              currentNetRoi = 0,
                                                              isLegacy = false,
                                                              onOpenVaultDeposit,
                                                              onOpenLegacyDeposit,
                                                              onOpenRecordExpense,
                                                              vaultBalance,
                                                              vaultInitialBalance = 0,
                                                            }) => {
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [revealedDeleteId, setRevealedDeleteId] = useState<string | null>(null);
  const [revealedVaultDepositDeleteId, setRevealedVaultDepositDeleteId] = useState<string | null>(null);
  const [revealedWithdrawalDeleteId, setRevealedWithdrawalDeleteId] = useState<string | null>(null);
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

  // Must be declared before any early return to satisfy Rules of Hooks
  const allVaultActivity = useMemo(() => {
    return vaultDepositLogs.map((e: any) => ({ ...e, flow: 'deposit' as const }))
      .sort((a: any, b: any) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  }, [vaultDepositLogs]);

  const startLongPress = (id: string, isReliever: boolean) => {
    if (isClosedMode) return;
    longPressTimer.current = setTimeout(() => {
      setRevealedDeleteId(id);
      playSound('click');
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
            className="relative select-none"
            onTouchStart={evt => { evt.preventDefault(); startLongPress(e.id, isRelieverPayout); }}
            onTouchEnd={cancelLongPress}
            onMouseDown={() => startLongPress(e.id, isRelieverPayout)}
            onMouseUp={cancelLongPress}
            onMouseLeave={() => { cancelLongPress(); setRevealedDeleteId(null); }}
        >
          {/* Reliever payout locked tooltip */}
          {isTooltipShowing && (
            <div className="absolute inset-0 z-10 bg-amber-500/90 backdrop-blur-sm rounded-xl flex items-center justify-center gap-2 animate-in fade-in zoom-in-95 duration-150 pointer-events-none">
              <svg className="w-4 h-4 text-white opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              <p className="text-xs font-black text-white uppercase tracking-widest leading-tight text-center">
                Reliever salary cannot be removed
              </p>
            </div>
          )}
          <div
              onClick={() => { if (!isRevealed) { playSound('click'); setViewingExpense(e); } }}
              className={`px-3 py-3 rounded-xl border transition-all duration-200 cursor-pointer group active:scale-[0.98] flex items-center justify-between ${
                isRevealed
                  ? 'bg-rose-50 border-rose-300 translate-x-[-4px]'
                  : isVaultWithdrawal
                    ? 'bg-white border-slate-100 hover:border-amber-200 hover:bg-amber-50/30'
                    : 'bg-white border-slate-100 hover:border-slate-200'
              }`}
          >
            <div className="flex items-center gap-3 overflow-hidden">
              {/* Directional arrow icon */}
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200 ${
                isVaultWithdrawal
                    ? 'bg-amber-50 text-amber-500'
                    : isProvision
                      ? 'bg-emerald-50 text-emerald-500'
                      : 'bg-rose-50 text-rose-500'
              }`}>
                {isVaultWithdrawal ? (
                  /* Arrow up out of vault */
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20V4m0 0l-6 6m6-6l6 6" /></svg>
                ) : isProvision ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                ) : isRelieverPayout ? (
                  /* Arrow up — reliever payout (locked, cannot be removed) */
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20V4m0 0l-6 6m6-6l6 6" /></svg>
                ) : (
                  /* Arrow up — money leaving */
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20V4m0 0l-6 6m6-6l6 6" /></svg>
                )}
              </div>
              <div className="overflow-hidden">
                <p className={`text-xs font-bold uppercase truncate leading-none mb-1 transition-colors ${isRevealed ? 'text-rose-700' : isVaultWithdrawal ? 'text-amber-800' : 'text-slate-800'}`}>{e.name}</p>
                {/* Vault coverage breakdown — shown for OPERATIONAL expenses that used vault funds */}
                {!isVaultDeposit && !isVaultWithdrawal && !isProvision && (vaultCoverageMap[e.name] ?? 0) > 0 && (
                  vaultCoverageMap[e.name] > e.amount ? (
                    <div className="flex flex-col gap-0.5 mb-1">
                      <span className="text-xs font-bold text-amber-500 tabular-nums">₱{e.amount.toLocaleString()}</span>
                      <span className="text-xs font-bold text-slate-400 tabular-nums">+₱{(vaultCoverageMap[e.name] - e.amount).toLocaleString()} prior deficit</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="text-xs font-bold text-amber-500 tabular-nums">₱{vaultCoverageMap[e.name].toLocaleString()} Vault</span>
                    </div>
                  )
                )}
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-slate-400 tabular-nums">
                    {(() => {
                      const date = new Date(e.timestamp.replace(/(\+00:00|Z)$/, ""));
                      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                    })()}
                  </p>
                  {!isVaultDeposit && !isVaultWithdrawal && !isProvision && !e.receiptImage && (
                    <span className="text-xs text-slate-300">· No Receipt</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-3">
              <p className={`text-sm font-bold tabular-nums transition-colors ${isRevealed ? 'text-rose-600' : isVaultWithdrawal ? 'text-amber-600' : 'text-rose-600'}`}>
                −₱{(!isVaultDeposit && !isVaultWithdrawal && !isProvision && (vaultCoverageMap[e.name] ?? 0) > e.amount ? vaultCoverageMap[e.name] : e.amount).toLocaleString()}
              </p>

              {/* TABLET/DESKTOP HOVER DELETE BUTTON (md+) */}
              <button
                  onClick={(evt) => handleDeleteClick(evt, e.id)}
                  className={`hidden md:flex p-2 rounded-lg bg-rose-50 text-rose-400 hover:bg-rose-600 hover:text-white transition-all opacity-0 group-hover:opacity-100 active:scale-90`}
                  title="Delete record"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>

              {/* MOBILE LONG-PRESS REVEALED DELETE BUTTON (<md) */}
              {isRevealed && (
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
        {/* LEFT: RENT & BILLS */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest leading-none">Rent & Bills</h4>
                <p className="text-xs text-slate-400 mt-0.5">Rent & Utility Audit</p>
              </div>
            </div>
            {provisionTotal > 0 && (
              <span className="text-sm font-black text-emerald-600 tabular-nums">₱{provisionTotal.toLocaleString()}</span>
            )}
          </div>

          <div className="flex-1 flex flex-col gap-1.5 min-h-[80px]">
            {provisionLogs.length > 0 ? (
              provisionLogs.map(renderExpenseItem)
            ) : (
              <div className={`flex-1 h-[90px] w-full bg-white ${UI_THEME.radius.card} border border-dashed border-slate-200 flex flex-col items-center justify-center gap-2`}>
                <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                <p className="text-xs text-slate-400">No rent or bill deposits yet</p>
              </div>
            )}
          </div>

          <button
            onClick={onOpenLegacyDeposit}
            disabled={isClosedMode || !onOpenLegacyDeposit}
            className={`no-print w-full py-4 rounded-xl border transition-all active:scale-[0.98] flex items-center justify-center gap-2 font-bold text-sm ${isClosedMode || !onOpenLegacyDeposit ? 'border-slate-100 opacity-50 cursor-not-allowed bg-white text-slate-300' : 'bg-emerald-50 border-emerald-100 hover:bg-emerald-100 hover:border-emerald-200 text-emerald-700'}`}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Daily Deposit
          </button>
        </div>

        {/* RIGHT: EXPENSE */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest leading-none">Expenses</h4>
                <p className="text-xs text-slate-400 mt-0.5">Operational Outflows Today</p>
              </div>
            </div>
            {expensesSubtotal > 0 && (
              <span className="text-sm font-black text-rose-600 tabular-nums">−₱{expensesSubtotal.toLocaleString()}</span>
            )}
          </div>

          <div className="flex-1 flex flex-col gap-1.5 min-h-[80px]">
            {expenseLogs.length > 0 ? (
              expenseLogs.map(renderExpenseItem)
            ) : (
              <div className={`flex-1 h-[90px] w-full bg-white ${UI_THEME.radius.card} border border-dashed border-slate-200 flex flex-col items-center justify-center gap-2`}>
                <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>
                <p className="text-xs text-slate-400">No expenses recorded today</p>
              </div>
            )}
          </div>

          <button
            onClick={() => setIsAddExpenseModalOpen(true)}
            disabled={isClosedMode}
            className={`no-print w-full py-4 rounded-xl border transition-all active:scale-[0.98] flex items-center justify-center gap-2 font-bold text-sm ${isClosedMode ? 'border-slate-200 opacity-50 cursor-not-allowed bg-transparent text-slate-400' : 'border-slate-200 bg-transparent hover:bg-slate-50 text-slate-600'}`}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Record Expense
          </button>
        </div>
      </div>
    );
  }

  // ── VAULT LAYOUT (vault_enabled = true) ──────────────────────────────────
  const allEntries = (expenseLogs as Expense[])
    .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  const hasEntries = allEntries.length > 0;

  // Vault fund column shows only deposits; vault cover-from-expense amounts show as badges on the expense entry
  const hasVaultActivity = allVaultActivity.length > 0;

  return (
    <>
      {/* 2-column on desktop: Vault Fund Activity (left) | Expenses (right) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">

        {/* ── LEFT: Vault Fund Activity (deposits + withdrawals) ── */}
        <div className="flex flex-col gap-3 order-2 md:order-1 pt-4 md:pt-0">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest leading-none">Vault Fund</h4>
                <p className="text-xs text-slate-400 mt-0.5">Deposits today</p>
              </div>
            </div>
            {vaultDepositSubtotal > 0 && (
              <span className="text-sm font-black text-emerald-600 tabular-nums">+₱{vaultDepositSubtotal.toLocaleString()}</span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            {hasVaultActivity ? allVaultActivity.map((e: any) => {
              const isDeposit = e.flow === 'deposit';
              const isRevealedDep = revealedVaultDepositDeleteId === e.id;
              const isRevealedWith = revealedWithdrawalDeleteId === e.id;
              const isRevealed = isRevealedDep || isRevealedWith;
              const canDelete = isDeposit ? !!onDeleteVaultDeposit : !!onDeleteVaultWithdrawal;
              const expenseName = isDeposit ? 'Vault Deposit' : (e.name || '').replace(/^VAULT:\s*/i, '') || 'Vault Used';

              const startLP = () => {
                if (isClosedMode || !canDelete) return;
                const t = setTimeout(() => {
                  if (isDeposit) setRevealedVaultDepositDeleteId(e.id);
                  else setRevealedWithdrawalDeleteId(e.id);
                  playSound('click');
                }, 600);
                (e as any)._lp = t;
              };
              const cancelLP = () => {
                if ((e as any)._lp) { clearTimeout((e as any)._lp); (e as any)._lp = null; }
              };
              const handleDelete = (evt: React.MouseEvent) => {
                evt.stopPropagation();
                setRevealedVaultDepositDeleteId(null);
                setRevealedWithdrawalDeleteId(null);
                if (isDeposit) onDeleteVaultDeposit?.(e.id);
                else onDeleteVaultWithdrawal?.(e.id);
              };

              return (
                <div
                  key={e.id}
                  className="relative group select-none"
                  onTouchStart={() => startLP()}
                  onTouchEnd={cancelLP}
                  onMouseDown={startLP}
                  onMouseUp={cancelLP}
                  onMouseLeave={() => { cancelLP(); setRevealedVaultDepositDeleteId(null); setRevealedWithdrawalDeleteId(null); }}
                >
                  <div className={`px-3 py-3 rounded-xl border flex items-center justify-between transition-all duration-200 ${
                    isRevealed
                      ? 'bg-rose-50 border-rose-300 translate-x-[-4px]'
                      : isDeposit
                        ? 'bg-white border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/30'
                        : 'bg-white border-slate-100 hover:border-amber-200 hover:bg-amber-50/30'
                  }`}>
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                        isRevealed
                          ? 'bg-rose-50 text-rose-400'
                          : isDeposit
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-amber-50 text-amber-500'
                      }`}>
                        {isDeposit ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0-16l-6 6m6-6l6 6" /></svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20V4m0 16l-6-6m6 6l6-6" /></svg>
                        )}
                      </div>
                      <div className="overflow-hidden">
                        <p className={`text-xs font-bold uppercase truncate leading-none mb-1 transition-colors ${isRevealed ? 'text-rose-700' : isDeposit ? 'text-slate-800' : 'text-amber-900'}`}>
                          {expenseName}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${isDeposit ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                            {isDeposit ? 'Saved' : 'Used'}
                          </span>
                          <p className="text-xs text-slate-400 tabular-nums">
                            {(() => {
                              const date = new Date((e.timestamp || '').replace(/(\+00:00|Z)$/, ''));
                              return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                            })()}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <p className={`text-sm font-bold tabular-nums transition-colors ${isRevealed ? 'text-rose-600' : isDeposit ? 'text-emerald-700' : 'text-amber-600'}`}>
                        {isDeposit ? '+' : '−'}₱{Number(e.amount).toLocaleString()}
                      </p>
                      {/* DESKTOP hover delete */}
                      {canDelete && !isClosedMode && (
                        <button
                          onClick={handleDelete}
                          className="hidden md:flex p-2 rounded-lg bg-rose-50 text-rose-400 hover:bg-rose-600 hover:text-white transition-all opacity-0 group-hover:opacity-100 active:scale-90"
                          title={isDeposit ? 'Reverse deposit' : 'Reverse vault usage'}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      )}
                      {/* MOBILE long-press revealed delete */}
                      {isRevealed && canDelete && (
                        <button
                          onClick={handleDelete}
                          className="md:hidden p-2.5 rounded-lg bg-rose-600 text-white shadow-lg animate-in zoom-in duration-200"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="4"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            }) : (
              <div className={`h-[90px] w-full bg-white ${UI_THEME.radius.card} border border-dashed border-slate-200 flex flex-col items-center justify-center gap-2`}>
                <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20V4m0 0l-6 6m6-6l6 6" /></svg>
                <p className="text-xs text-slate-400">No vault deposits recorded today</p>
              </div>
            )}
          </div>

          {/* Mobile-only: Vault Deposit button below vault list */}
          <button
            onClick={onOpenVaultDeposit}
            disabled={isClosedMode || !onOpenVaultDeposit || currentNetRoi <= 0}
            className={`no-print md:hidden w-full flex items-center justify-center gap-2 py-4 px-3 rounded-xl border transition-all active:scale-[0.98] font-bold text-sm ${isClosedMode || !onOpenVaultDeposit || currentNetRoi <= 0 ? 'border-slate-200 opacity-50 cursor-not-allowed bg-transparent text-slate-400' : 'border-slate-200 bg-transparent hover:bg-slate-50 text-slate-600'}`}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0-16l-6 6m6-6l6 6" /></svg>
            Vault Deposit
          </button>
        </div>

        {/* ── RIGHT: Expenses (mobile: above vault deposits) ── */}
        <div className="flex flex-col gap-3 order-1 md:order-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest leading-none">Expenses</h4>
                <p className="text-xs text-slate-400 mt-0.5">Leaves hands today</p>
              </div>
            </div>
            {expensesSubtotal > 0 && (
              <span className="text-sm font-black text-rose-600 tabular-nums">−₱{expensesSubtotal.toLocaleString()}</span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            {hasEntries ? allEntries.map(e => renderExpenseItem(e)) : (
              <div className={`h-[90px] w-full bg-white ${UI_THEME.radius.card} border border-dashed border-slate-200 flex flex-col items-center justify-center gap-2`}>
                <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>
                <p className="text-xs text-slate-400">No expenses recorded today</p>
              </div>
            )}
          </div>

          {/* Mobile-only: Record Expense button below expense list */}
          <button
            onClick={onOpenRecordExpense ?? (() => setIsAddExpenseModalOpen(true))}
            disabled={isClosedMode}
            className={`no-print md:hidden w-full flex items-center justify-center gap-2 py-4 px-3 rounded-xl border transition-all active:scale-[0.98] font-bold text-sm ${isClosedMode ? 'border-slate-200 opacity-50 cursor-not-allowed bg-transparent text-slate-400' : 'border-slate-200 bg-transparent hover:bg-slate-50 text-slate-600'}`}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Record Expense
          </button>
        </div>

      </div>

      {/* Desktop-only: shared button row so both buttons stay aligned regardless of column height */}
      <div className="no-print hidden md:grid grid-cols-2 gap-4 w-full">
        <button
          onClick={onOpenVaultDeposit}
          disabled={isClosedMode || !onOpenVaultDeposit || currentNetRoi <= 0}
          className={`flex items-center justify-center gap-2 py-4 px-3 rounded-xl border transition-all active:scale-[0.98] font-bold text-sm ${isClosedMode || !onOpenVaultDeposit || currentNetRoi <= 0 ? 'border-slate-200 opacity-50 cursor-not-allowed bg-transparent text-slate-400' : 'border-slate-200 bg-transparent hover:bg-slate-50 text-slate-600'}`}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0-16l-6 6m6-6l6 6" /></svg>
          Vault Deposit
        </button>

        <button
          onClick={onOpenRecordExpense ?? (() => setIsAddExpenseModalOpen(true))}
          disabled={isClosedMode}
          className={`flex items-center justify-center gap-2 py-4 px-3 rounded-xl border transition-all active:scale-[0.98] font-bold text-sm ${isClosedMode ? 'border-slate-200 opacity-50 cursor-not-allowed bg-transparent text-slate-400' : 'border-slate-200 bg-transparent hover:bg-slate-50 text-slate-600'}`}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Record Expense
        </button>
      </div>

      {/* LEGACY RENT & BILLS — only shown when historical provision deposits exist */}
      {provisionLogs.length > 0 && (
        <div className="flex flex-col w-full space-y-3">
          <div className="flex justify-between items-center px-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest leading-none">Rent & Bills</h4>
                <p className="text-xs text-slate-400 mt-0.5">Daily Provision Deposits</p>
              </div>
            </div>
            <span className="text-sm font-black text-emerald-600 tabular-nums">₱{provisionTotal.toLocaleString()}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {provisionLogs.map(renderExpenseItem)}
          </div>
        </div>
      )}
    </>
  );
};
