
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Expense } from '../../../../types';

interface ExpenseDetailModalProps {
  expense: Expense;
  onClose: () => void;
}

export const ExpenseDetailModal: React.FC<ExpenseDetailModalProps> = ({ expense, onClose }) => {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const isProvision = expense.category === 'PROVISION';
  const hasReceipt = !!expense.receiptImage;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md shadow-2xl flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in duration-300 overflow-hidden rounded-t-[32px] sm:rounded-[32px] max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle (mobile only) */}
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mt-3 sm:hidden shrink-0" />

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-lg shrink-0 ${isProvision ? 'bg-indigo-600' : 'bg-slate-900'}`}>
              {isProvision ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20V4m0 0l-6 6m6-6l6 6" /></svg>
              )}
            </div>
            <h4 className="text-base font-bold text-slate-900 uppercase tracking-tight">Registry Audit</h4>
          </div>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-900 transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 no-scrollbar">
          <div className="bg-slate-50 p-5 rounded-[24px] border border-slate-100 text-center">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Description</p>
            <p className="text-lg font-bold text-slate-900 uppercase tracking-tighter mb-4 leading-tight">{expense.name}</p>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Amount</p>
            <p className="text-2xl font-bold text-slate-900 tracking-tighter">₱{Number(expense.amount).toLocaleString()}</p>
          </div>

          {hasReceipt ? (
            <div className="rounded-[24px] bg-slate-100 border border-slate-200 overflow-hidden">
              <img src={expense.receiptImage!} className="w-full object-contain max-h-64" alt="Receipt" />
            </div>
          ) : (
            <div className="py-8 rounded-[24px] bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 opacity-40">
              <div className="text-3xl">📷</div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">No Receipt Captured</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t shrink-0">
          <button onClick={onClose} className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl uppercase tracking-widest text-[11px] shadow-lg active:scale-95 transition-all">Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
};
