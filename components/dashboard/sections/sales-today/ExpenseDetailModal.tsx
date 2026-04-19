
import React from 'react';
import { Expense } from '../../../../types';

interface ExpenseDetailModalProps {
  expense: Expense;
  onClose: () => void;
}

export const ExpenseDetailModal: React.FC<ExpenseDetailModalProps> = ({ expense, onClose }) => {
  return (
    <div className="fixed inset-0 z-[2000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-[44px] w-full max-w-xl shadow-2xl flex flex-col animate-in zoom-in duration-300 overflow-hidden max-h-[90vh]">
        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white shadow-lg ${expense.category === 'PROVISION' ? 'bg-indigo-600' : 'bg-slate-900'}`}>
              {expense.category === 'PROVISION' ? '↓' : '🧾'}
            </div>
            <h4 className="text-xl font-bold text-slate-900 uppercase tracking-tight">Registry Audit</h4>
          </div>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-900 transition-all">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-10 space-y-8 no-scrollbar">
          <div className="bg-slate-50 p-8 rounded-[36px] border border-slate-100 text-center">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Description</p>
            <p className="text-2xl font-bold text-slate-900 uppercase tracking-tighter mb-6">{expense.name}</p>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Amount</p>
            <p className="text-3xl font-bold text-slate-900 tracking-tighter">₱{Number(expense.amount).toLocaleString()}</p>
          </div>
          <div className="aspect-[4/3] rounded-[40px] bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
            {expense.receiptImage ? (
              <img src={expense.receiptImage} className="w-full h-full object-contain" alt="Receipt" />
            ) : (
              <div className="text-center opacity-20 grayscale">
                <div className="text-5xl mb-3">📷</div>
                <p className="text-[11px] font-bold uppercase tracking-widest">No Image Captured</p>
              </div>
            )}
          </div>
        </div>
        <div className="p-8 bg-slate-50 border-t">
          <button onClick={onClose} className="w-full bg-slate-900 text-white font-bold py-5 rounded-2xl uppercase tracking-widest text-[12px] shadow-lg active:scale-95 transition-all">Close Entry</button>
        </div>
      </div>
    </div>
  );
};
