
import React from 'react';
import { Expense } from '../../../../types';

interface VaultActivityLogProps {
    movements: any[]; // Using any to access local isDeletable flag
    onView: (e: Expense) => void;
    onDelete?: (id: string) => void;
}

export const VaultActivityLog: React.FC<VaultActivityLogProps> = ({ movements, onView, onDelete }) => {
    // Filter to only show settlements as requested for "Monthly Bills" focus
    const settlements = movements.filter(m => m.category === 'SETTLEMENT');

    return (
        <div className="space-y-4">
            {/* MOBILE VIEW: CARDS */}
            <div className="sm:hidden space-y-2">
                {settlements.length > 0 ? settlements.map(e => {
                    const isDeletable = e.isDeletable;
                    return (
                        <div
                            key={e.id}
                            onClick={() => onView(e)}
                            className={`bg-white p-4 rounded-[24px] border transition-all duration-300 flex flex-col items-start justify-between shadow-sm cursor-pointer active:scale-[0.98] relative overflow-hidden ${isDeletable ? 'border-indigo-100 hover:border-emerald-500' : 'border-slate-100 hover:border-slate-300'} hover:shadow-md gap-3`}
                        >
                            <div className="flex items-center gap-3 w-full">
                                <div className="w-10 h-10 rounded-[16px] flex items-center justify-center text-lg shadow-inner shrink-0 bg-rose-50 text-rose-500">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2-2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[12px] font-bold uppercase truncate mb-0.5 text-slate-900">{e.name}</p>
                                    <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest tabular-nums">
                                        {new Date(e.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} • {new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                </div>
                                <p className="text-lg font-bold tracking-tighter tabular-nums text-rose-600">
                                    ₱{Number(e.amount).toLocaleString()}
                                </p>
                            </div>
                        </div>
                    );
                }) : (
                    <EmptyState />
                )}
            </div>

            {/* DESKTOP VIEW: TABLE */}
            <div className="hidden sm:block overflow-hidden bg-white border border-slate-100 rounded-[32px] shadow-sm">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-100">
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Bill / Payee</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Amount</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {settlements.length > 0 ? settlements.map(e => (
                            <tr 
                                key={e.id} 
                                onClick={() => onView(e)}
                                className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                            >
                                <td className="px-6 py-4">
                                    <p className="text-[11px] font-bold text-slate-900">
                                        {new Date(e.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </p>
                                    <p className="text-[9px] font-medium text-slate-400 uppercase tracking-tighter">
                                        {new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2-2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                        </div>
                                        <p className="text-[12px] font-black text-slate-900 uppercase tracking-tight">{e.name}</p>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <p className="text-sm font-black text-rose-600 tabular-nums">
                                        ₱{Number(e.amount).toLocaleString()}
                                    </p>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        {e.isDeletable && onDelete && (
                                            <button
                                                onClick={(evt) => { evt.stopPropagation(); onDelete(e.id); }}
                                                className="p-2 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-600 hover:text-white transition-all active:scale-95 border border-rose-100"
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        )}
                                        <div className="p-2 text-slate-200 group-hover:text-slate-400 transition-all">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={4} className="py-20 text-center">
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
        <div className="text-5xl">🧾</div>
        <div className="space-y-1">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">No Settlements Indexed</p>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Historical vault activity is silent</p>
        </div>
    </div>
);
