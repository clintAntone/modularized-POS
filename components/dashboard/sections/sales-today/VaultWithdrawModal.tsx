import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { playSound } from '../../../../lib/audio';

interface VaultWithdrawModalProps {
  onClose: () => void;
  onWithdraw: (amount: number, reason: string) => Promise<void>;
  vaultBalance: number;
  vaultLabel?: string;
}

export const VaultWithdrawModal: React.FC<VaultWithdrawModalProps> = ({
  onClose, onWithdraw, vaultBalance, vaultLabel = 'Vault Fund',
}) => {
  const [amount, setAmount] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const afterBalance = Math.max(0, vaultBalance - (amount || 0));
  const canSave = amount > 0 && amount <= vaultBalance && reason.trim().length > 0;

  const handleWithdraw = async () => {
    if (!canSave || isSaving) return;
    setIsSaving(true);
    setErrorMessage('');
    try {
      await onWithdraw(amount, reason.trim());
      playSound('success');
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Withdrawal failed');
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
            <div className="px-8 pt-8 pb-6 rounded-t-[40px] bg-amber-50/70">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600 shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 20V4m0 0l-6 6m6-6l6 6" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xl font-black uppercase tracking-tight text-slate-900">Withdraw from Vault</h4>
                    <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mt-0.5">{vaultLabel}</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-700 transition-all">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Available</span>
                <span className="text-xs font-black text-amber-700 tabular-nums">₱{vaultBalance.toLocaleString()}</span>
              </div>
            </div>

            {/* Body */}
            <div className="px-8 pb-8 pt-6 space-y-4 border-t border-slate-100">
              {errorMessage && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-center text-xs font-bold text-rose-600 uppercase tracking-widest animate-in slide-in-from-top-2">
                  {errorMessage}
                </div>
              )}

              {/* Reason */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Reason</label>
                <input
                  type="text"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full p-4 bg-slate-50 border-2 border-transparent rounded-2xl font-bold text-sm uppercase outline-none transition-all shadow-inner focus:border-amber-400 focus:bg-white"
                  placeholder="E.G. EMERGENCY SUPPLIES..."
                  autoFocus
                />
              </div>

              {/* Amount */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between ml-1">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Amount (₱)</label>
                  <span className="text-xs font-bold text-slate-400 uppercase">Max: ₱{vaultBalance.toLocaleString()}</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    value={amount || ''}
                    onChange={e => setAmount(Number(e.target.value))}
                    className="w-full p-4 pr-20 bg-slate-50 border-2 border-transparent rounded-2xl font-black text-lg outline-none transition-all shadow-inner focus:border-amber-400 focus:bg-white"
                    placeholder="0"
                    min="0"
                    max={vaultBalance}
                  />
                  <button
                    type="button"
                    onClick={() => { setAmount(vaultBalance); playSound('click'); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-amber-500 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-amber-600 transition-all active:scale-95"
                  >
                    All
                  </button>
                </div>
                {amount > vaultBalance && (
                  <p className="text-xs font-bold text-rose-500 uppercase tracking-widest ml-1">
                    Exceeds vault balance of ₱{vaultBalance.toLocaleString()}
                  </p>
                )}
              </div>

              {/* After-withdrawal preview */}
              {amount > 0 && amount <= vaultBalance && (
                <div className="bg-amber-50 rounded-2xl px-4 py-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Vault after withdrawal</span>
                  <span className="text-sm font-black text-amber-900 tabular-nums">₱{afterBalance.toLocaleString()}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 py-4 rounded-2xl border-2 border-slate-200 text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleWithdraw}
                  disabled={!canSave || isSaving}
                  className="flex-1 py-4 rounded-2xl bg-amber-500 text-white text-xs font-black uppercase tracking-widest shadow-lg disabled:opacity-30 hover:bg-amber-600 active:scale-95 transition-all"
                >
                  {isSaving ? 'Saving...' : `Withdraw ₱${(amount || 0).toLocaleString()}`}
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
