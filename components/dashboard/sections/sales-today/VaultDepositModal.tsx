
import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { playSound } from '../../../../lib/audio';

interface VaultDepositModalProps {
  onClose: () => void;
  onDeposit: (amount: number) => Promise<void>;
  currentNetRoi: number;
  vaultBalance: number;

}

export const VaultDepositModal: React.FC<VaultDepositModalProps> = ({
  onClose, onDeposit, currentNetRoi, vaultBalance,
}) => {
  const maxDeposit = Math.max(0, currentNetRoi);
  const [depositAll, setDepositAll] = useState(true);
  const [customAmount, setCustomAmount] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const amount = depositAll ? maxDeposit : customAmount;
  const afterBalance = vaultBalance + amount;
  const canSave = amount > 0 && amount <= maxDeposit;

  const handleDeposit = async () => {
    if (!canSave || isSaving) return;
    setIsSaving(true);
    setErrorMessage('');
    try {
      await onDeposit(amount);
      playSound('success');
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

      <div className="relative h-full overflow-y-auto">
        <div className="min-h-full flex items-center justify-center p-4 py-8">

          <div className="relative bg-white rounded-[40px] w-full max-w-md shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">

            {/* Header */}
            <div className="px-8 pt-8 pb-6 rounded-t-[40px] bg-emerald-50/70">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0 0l-6-6m6 6l6-6" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xl font-black uppercase tracking-tight text-slate-900">Deposit to Vault</h4>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-700 transition-all">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Current vault balance chip */}
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Current Balance</span>
                <span className="text-[11px] font-black text-emerald-700 tabular-nums">₱{vaultBalance.toLocaleString()}</span>
              </div>
            </div>

            {/* Body */}
            <div className="px-8 pb-8 pt-6 space-y-5 border-t border-slate-100">
              {errorMessage && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-center text-[10px] font-bold text-rose-600 uppercase tracking-widest animate-in slide-in-from-top-2">
                  {errorMessage}
                </div>
              )}

              {/* Deposit-all checkbox (default on) */}
              <button
                type="button"
                onClick={() => { setDepositAll(v => !v); playSound('click'); }}
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
                    Deposit full net ROI
                  </p>
                  <p className={`text-[9px] font-bold uppercase tracking-widest mt-0.5 tabular-nums ${depositAll ? 'text-emerald-600' : 'text-slate-400'}`}>
                    ₱{maxDeposit.toLocaleString()} available
                  </p>
                </div>
              </button>

              {/* Custom amount input — only when not depositing all */}
              {!depositAll && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Custom Amount (₱)</label>
                  <input
                    type="number"
                    value={customAmount || ''}
                    onChange={e => setCustomAmount(Number(e.target.value))}
                    className="w-full p-4 bg-slate-50 border-2 border-transparent rounded-2xl font-black text-lg outline-none transition-all shadow-inner focus:border-emerald-400 focus:bg-white"
                    placeholder="0"
                    min="0"
                    max={maxDeposit}
                    autoFocus
                  />
                  {customAmount > maxDeposit && maxDeposit > 0 && (
                    <p className="text-[9px] font-bold text-rose-500 uppercase tracking-widest ml-1">
                      Exceeds today's net ROI of ₱{maxDeposit.toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              {/* After-deposit preview */}
              {amount > 0 && (
                <div className="bg-emerald-50 rounded-2xl px-4 py-3 flex items-center justify-between">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">After deposit</span>
                  <span className="text-[13px] font-black text-emerald-900 tabular-nums">₱{afterBalance.toLocaleString()}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 py-4 rounded-2xl border-2 border-slate-200 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeposit}
                  disabled={!canSave || isSaving}
                  className="flex-1 py-4 rounded-2xl bg-emerald-600 text-white text-[11px] font-black uppercase tracking-widest shadow-lg disabled:opacity-30 hover:bg-emerald-700 active:scale-95 transition-all"
                >
                  {isSaving ? 'Saving...' : `Deposit ₱${(amount || 0).toLocaleString()}`}
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
