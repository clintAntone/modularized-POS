
import React from 'react';
import { Transaction } from '../../../../types';
import { Trash2, FolderOpen, TrendingUp, Tag, Banknote } from 'lucide-react';

interface POSCorrectionsProps {
    transactions: Transaction[];
    onEdit: (tx: Transaction) => void;
    onDelete: (id: string) => void;
    isProcessing: boolean;
    isClosedMode: boolean;
}

export const POSCorrections: React.FC<POSCorrectionsProps> = ({ transactions, onEdit, onDelete, isProcessing, isClosedMode }) => {
    return (
        <div className="space-y-4 animate-in fade-in duration-500 flex flex-col">
            <div className="flex justify-between items-end px-4 shrink-0">
                <div className="space-y-1">
                    <h3 className="text-2xl font-bold text-slate-900 uppercase tracking-tighter">Recent Sessions</h3>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Select record for modification</p>
                </div>
                <span className="text-[10px] font-bold bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl border border-emerald-100 shadow-sm uppercase tracking-widest">{transactions.length} Total Today</span>
            </div>

            <div className="flex-1 min-h-0">
                {transactions.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-1">
                        {transactions.map((t) => {
                            const deduction = t.discount + (t.voucherValue || 0);
                            const staffPay = (t.primaryCommission || 0) + (t.secondaryCommission || 0);
                            const branchRoi = t.total - staffPay;

                            return (
                                <div key={t.id} className="bg-white rounded-[32px] border border-slate-100 shadow-sm hover:shadow-xl transition-all group flex flex-col justify-between h-full overflow-hidden">

                                    {/* ── Header ── */}
                                    <div className="p-6 pb-4 space-y-3">
                                        <div className="flex justify-between items-start gap-3">
                                            <div className="min-w-0">
                                                <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mb-0.5">
                                                    {new Intl.DateTimeFormat('en-GB', {
                                                        timeZone: 'Asia/Manila',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                        hour12: true
                                                    }).format(new Date(t.timestamp))}
                                                </p>
                                                <h4 className="font-black text-slate-900 uppercase text-base truncate leading-tight">{t.clientName}</h4>
                                                <p className="text-[9px] font-semibold text-slate-400 uppercase truncate mt-0.5 leading-tight">{t.serviceName}</p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Client Paid</p>
                                                <p className="font-black text-slate-900 text-2xl tabular-nums tracking-tighter leading-none">₱{t.total.toLocaleString()}</p>
                                                {deduction > 0 && (
                                                    <p className="text-[9px] font-bold text-slate-300 line-through tabular-nums mt-0.5">₱{t.basePrice.toLocaleString()}</p>
                                                )}
                                            </div>
                                        </div>

                                        {/* ── Staff & Payment ── */}
                                        <div className="flex items-center gap-3 pt-1 border-t border-slate-50">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">Therapist</p>
                                                <p className="text-[10px] font-bold text-slate-900 uppercase truncate">{t.therapistName || '—'}</p>
                                            </div>
                                            {t.bonesetterName && (
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">Bonesetter</p>
                                                    <p className="text-[10px] font-bold text-slate-900 uppercase truncate">{t.bonesetterName}</p>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-1 shrink-0">
                                                <span className={`text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest ${t.paymentMethod === 'CASH' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                                                    {t.paymentMethod === 'CASH' ? 'Cash' : 'GCash'}
                                                </span>
                                                {t.paymentStatus === 'PENDING' && (
                                                    <span className="text-[8px] font-black bg-rose-50 text-rose-500 px-2 py-0.5 rounded-md uppercase tracking-widest animate-pulse">Unpaid</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── Financial Breakdown Strip ── */}
                                    <div className="grid grid-cols-3 divide-x divide-slate-100 bg-slate-50 border-y border-slate-100">
                                        <div className="p-3 text-center">
                                            <div className="flex items-center justify-center gap-1 mb-1">
                                                <Tag className="w-2.5 h-2.5 text-rose-400" />
                                                <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Deducted</p>
                                            </div>
                                            <p className={`text-sm font-black tabular-nums ${deduction > 0 ? 'text-rose-600' : 'text-slate-300'}`}>
                                                {deduction > 0 ? `-₱${deduction.toLocaleString()}` : '—'}
                                            </p>
                                        </div>
                                        <div className="p-3 text-center">
                                            <div className="flex items-center justify-center gap-1 mb-1">
                                                <Banknote className="w-2.5 h-2.5 text-indigo-400" />
                                                <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Staff Pay</p>
                                            </div>
                                            <p className={`text-sm font-black tabular-nums ${staffPay > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>
                                                {staffPay > 0 ? `-₱${staffPay.toLocaleString()}` : '—'}
                                            </p>
                                        </div>
                                        <div className="p-3 text-center bg-emerald-50/60">
                                            <div className="flex items-center justify-center gap-1 mb-1">
                                                <TrendingUp className="w-2.5 h-2.5 text-emerald-500" />
                                                <p className="text-[7px] font-black text-emerald-600 uppercase tracking-widest">Branch ROI</p>
                                            </div>
                                            <p className="text-sm font-black text-emerald-700 tabular-nums">₱{branchRoi.toLocaleString()}</p>
                                        </div>
                                    </div>

                                    {/* ── Note & Actions ── */}
                                    <div className="p-6 pt-4 space-y-4">
                                        {t.note && (
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1">Note</p>
                                                <p className="text-[10px] text-slate-600 italic line-clamp-2 leading-relaxed">"{t.note}"</p>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => onEdit(t)} className="flex-1 bg-slate-900 text-white font-bold py-3.5 rounded-xl text-[10px] uppercase tracking-widest shadow-md hover:bg-emerald-600 transition-all active:scale-95">Edit Record</button>
                                            <button onClick={() => onDelete(t.id)} disabled={isProcessing || isClosedMode} className="p-3.5 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all active:scale-95 disabled:opacity-30">
                                                <Trash2 className="w-4 h-4" strokeWidth={2.5} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="py-24 text-center bg-white rounded-[44px] border-2 border-dashed border-slate-100 opacity-30 flex flex-col items-center gap-4">
                        <FolderOpen className="w-16 h-16 text-slate-300" strokeWidth={1} />
                        <p className="text-[11px] font-bold uppercase tracking-widest">No Sessions Indexed Today</p>
                    </div>
                )}
            </div>
        </div>
    );
};
