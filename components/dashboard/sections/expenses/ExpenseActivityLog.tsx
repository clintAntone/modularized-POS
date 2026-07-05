import React from 'react';
import { Expense } from '../../../../types';
import { Repeat, Camera, FileText, Trash2, ChevronRight, Inbox } from 'lucide-react';

interface ExpenseActivityLogProps {
  expenses: Expense[];
  onEdit: (e: Expense) => void;
  onDelete: (id: string) => void;
  editingId?: string;
  isClosedMode: boolean;
}

export const ExpenseActivityLog: React.FC<ExpenseActivityLogProps> = ({
  expenses, onEdit, onDelete, editingId, isClosedMode
}) => {
  return (
    <div className="space-y-4">
      {/* MOBILE VIEW: CARDS */}
      <div className="sm:hidden space-y-3">
        {expenses.length > 0 ? expenses.map(e => (
          <div 
            key={e.id} 
            onClick={() => {
              if (e.category === 'PROVISION') return;
              if (e.name.startsWith('RELIEVER PAYOUT:')) return;
              onEdit(e);
            }}
            className={`bg-white p-5 rounded-2xl border transition-all duration-300 flex items-center justify-between shadow-sm relative overflow-hidden ${e.category === 'PROVISION' || e.name.startsWith('RELIEVER PAYOUT:') ? 'border-slate-100 cursor-default opacity-80' : 'cursor-pointer group active:scale-[0.98] border-slate-100 hover:border-slate-300 hover:shadow-md'} ${editingId === e.id ? 'border-emerald-500 ring-4 ring-emerald-500/5 shadow-xl' : ''}`}
          >
            {editingId === e.id && (
              <div className="absolute top-0 left-0 h-full w-1.5 bg-emerald-500"></div>
            )}
            
            <div className="flex items-center gap-4 overflow-hidden pr-4">
              <div className={`w-12 h-12 rounded-[18px] flex items-center justify-center text-xl shadow-inner shrink-0 transition-all ${editingId === e.id ? 'bg-emerald-600 text-white' : (e.category === 'PROVISION' ? 'bg-indigo-50 text-indigo-300' : 'bg-slate-50 text-slate-300 group-hover:bg-slate-900 group-hover:text-white')}`}>
                {e.category === 'PROVISION' ? (
                  <Repeat className="w-5 h-5" strokeWidth={2.5} />
                ) : e.receiptImage ? (
                  <Camera className="w-5 h-5" strokeWidth={2.5} />
                ) : (
                  <FileText className="w-5 h-5" strokeWidth={2.5} />
                )}
              </div>
              <div className="overflow-hidden">
                <p className={`text-sm font-black uppercase truncate mb-1 transition-colors ${editingId === e.id ? 'text-emerald-800' : 'text-slate-900'}`}>{e.name}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wide tabular-nums">
                    {new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                  <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded border leading-none ${
                    e.category === 'PROVISION' 
                    ? 'text-indigo-600 bg-indigo-50 border-indigo-100' 
                    : 'text-rose-500 bg-rose-50 border-rose-100'
                  }`}>
                    {e.category === 'PROVISION' ? 'Vault' : 'OpEx'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 ml-4">
              <p className={`text-xl font-black tracking-tighter tabular-nums ${editingId === e.id ? 'text-emerald-700' : 'text-slate-900'}`}>₱{Number(e.amount).toLocaleString()}</p>
            </div>
          </div>
        )) : (
          <EmptyState />
        )}
      </div>

      {/* DESKTOP VIEW: TABLE */}
      <div className="hidden sm:block overflow-hidden bg-white border border-slate-100 rounded-2xl shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-100">
              <th className="px-6 py-4 text-xs font-medium text-slate-400 uppercase tracking-wide">Time</th>
              <th className="px-6 py-4 text-xs font-medium text-slate-400 uppercase tracking-wide">Description</th>
              <th className="px-6 py-4 text-xs font-medium text-slate-400 uppercase tracking-wide">Type</th>
              <th className="px-6 py-4 text-xs font-medium text-slate-400 uppercase tracking-wide text-right">Amount</th>
              <th className="px-6 py-4 text-xs font-medium text-slate-400 uppercase tracking-wide text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {expenses.length > 0 ? expenses.map(e => (
              <tr 
                key={e.id} 
                onClick={() => {
                  if (e.category === 'PROVISION') return;
                  if (e.name.startsWith('RELIEVER PAYOUT:')) return;
                  onEdit(e);
                }}
                className={`transition-colors ${e.category === 'PROVISION' || e.name.startsWith('RELIEVER PAYOUT:') ? 'cursor-default opacity-80' : 'hover:bg-slate-50/80 cursor-pointer group'} ${editingId === e.id ? 'bg-emerald-50/30' : ''}`}
              >
                <td className="px-6 py-4">
                  <p className="text-xs font-bold text-slate-900 tabular-nums">
                    {new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${e.category === 'PROVISION' ? 'bg-indigo-50 text-indigo-400' : (e.receiptImage ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-50 text-slate-300')}`}>
                      {e.category === 'PROVISION' ? (
                        <Repeat className="w-4 h-4" strokeWidth={2.5} />
                      ) : e.receiptImage ? (
                        <Camera className="w-4 h-4" strokeWidth={2.5} />
                      ) : (
                        <FileText className="w-4 h-4" strokeWidth={2.5} />
                      )}
                    </div>
                    <p className="text-xs font-black text-slate-900 uppercase tracking-tight truncate max-w-[150px]">{e.name}</p>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded border leading-none ${
                    e.category === 'PROVISION' 
                    ? 'text-indigo-600 bg-indigo-50 border-indigo-100' 
                    : 'text-rose-500 bg-rose-50 border-rose-100'
                  }`}>
                    {e.category === 'PROVISION' ? 'Vault' : 'OpEx'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <p className="text-sm font-black text-slate-900 tabular-nums">
                    ₱{Number(e.amount).toLocaleString()}
                  </p>
                </td>
                <td className="px-6 py-4 text-right">
                  {!e.name.startsWith('RELIEVER PAYOUT:') && (
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={(evt) => { evt.stopPropagation(); onDelete(e.id); }}
                        disabled={isClosedMode}
                        className="p-2 bg-rose-50 text-rose-300 rounded-xl hover:bg-rose-500 hover:text-white transition-all active:scale-95 disabled:opacity-0 border border-rose-100"
                      >
                        <Trash2 className="w-3 h-3" strokeWidth={3} />
                      </button>
                      {e.category !== 'PROVISION' && (
                        <div className="p-2 text-slate-200 group-hover:text-slate-400 transition-all">
                          <ChevronRight className="w-4 h-4" strokeWidth={3} />
                        </div>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={5} className="py-20 text-center">
                  <EmptyState />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const EmptyState = () => (
  <div className="py-12 text-center flex flex-col items-center justify-center space-y-4 opacity-40">
    <Inbox className="w-12 h-12 text-slate-300" strokeWidth={1.5} />
    <div className="space-y-1">
      <p className="text-xs font-black text-slate-500 uppercase tracking-wide">Historical Registry Silent</p>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">No expense outflows indexed for this session</p>
    </div>
  </div>
);
