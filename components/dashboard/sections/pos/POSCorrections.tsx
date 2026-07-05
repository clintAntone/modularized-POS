
import React from 'react';
import { Transaction } from '../../../../types';
import { Trash2, FolderOpen, TrendingUp, Tag, Banknote, Clock, Edit3 } from 'lucide-react';

interface POSCorrectionsProps {
    transactions: Transaction[];
    onEdit: (tx: Transaction) => void;
    onDelete: (id: string) => void;
    isProcessing: boolean;
    isClosedMode: boolean;
}

export const POSCorrections: React.FC<POSCorrectionsProps> = ({ transactions, onEdit, onDelete, isProcessing, isClosedMode }) => {
    return (
        <div className="space-y-5 flex flex-col">

            {/* ── Header ── */}
            <div className="flex items-center justify-between gap-3 px-1 shrink-0">
                <div>
                    <h3 className="text-[15px] font-black text-slate-900 uppercase tracking-tight leading-none">Recent Sessions</h3>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-1">Select a record to modify</p>
                </div>
                <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-2xl shrink-0">
                    <span className="text-sm font-black text-emerald-700 tabular-nums leading-none">{transactions.length}</span>
                    <span className="text-xs font-black text-emerald-600 uppercase tracking-widest leading-none">Today</span>
                </div>
            </div>

            {/* ── List ── */}
            <div className="flex-1 min-h-0">
                {transactions.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {transactions.map((t) => {
                            const deduction = t.discount + (t.voucherValue || 0);
                            const staffPay = (t.primaryCommission || 0) + (t.secondaryCommission || 0);
                            const branchRoi = t.total - staffPay;
                            const time = new Intl.DateTimeFormat('en-GB', {
                                timeZone: 'Asia/Manila',
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: true
                            }).format(new Date(t.timestamp));

                            return (
                                <div key={t.id} className="bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden">

                                    {/* Top accent */}
                                    <div className="h-0.5 bg-gradient-to-r from-slate-200 via-emerald-400 to-slate-200" />

                                    {/* ── Main info ── */}
                                    <div className="p-5 space-y-4">

                                        {/* Time + payment badge row */}
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5 text-slate-400">
                                                <Clock className="w-3 h-3" />
                                                <span className="text-xs font-semibold uppercase tracking-wide">{time}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                {t.paymentStatus === 'PENDING' && (
                                                    <span className="text-xs font-black bg-rose-50 text-rose-500 px-2 py-0.5 rounded-lg uppercase tracking-widest animate-pulse">Unpaid</span>
                                                )}
                                                <span className={`text-xs font-black px-2.5 py-1 rounded-lg uppercase tracking-widest ${t.paymentMethod === 'CASH' ? 'bg-slate-100 text-slate-600' : 'bg-indigo-50 text-indigo-600'}`}>
                                                    {t.paymentMethod === 'CASH' ? 'Cash' : 'GCash'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Client + amount */}
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <h4 className="font-black text-slate-900 text-[17px] uppercase tracking-tight leading-none truncate" title={t.clientName}>{t.clientName}</h4>
                                                <p className="text-xs font-semibold text-slate-400 uppercase truncate mt-1.5 leading-tight" title={t.serviceName}>{t.serviceName}</p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="font-black text-slate-900 text-[22px] tabular-nums tracking-tighter leading-none">₱{t.total.toLocaleString()}</p>
                                                {deduction > 0 && (
                                                    <p className="text-xs font-bold text-slate-300 line-through tabular-nums mt-0.5">₱{t.basePrice.toLocaleString()}</p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Staff row */}
                                        <div className="flex items-center gap-4 pt-3 border-t border-slate-50">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-black text-slate-300 uppercase tracking-widest">Therapist</p>
                                                <p className="text-xs font-black text-slate-700 uppercase truncate mt-0.5" title={t.therapistName || undefined}>{t.therapistName || '—'}</p>
                                            </div>
                                            {t.bonesetterName && (
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-black text-slate-300 uppercase tracking-widest">Bonesetter</p>
                                                    <p className="text-xs font-black text-slate-700 uppercase truncate mt-0.5" title={t.bonesetterName}>{t.bonesetterName}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* ── Financial strip ── */}
                                    <div className="grid grid-cols-3 border-t border-slate-100 dark:border-slate-700">
                                        <div className="py-3 px-2 text-center border-r border-slate-100 dark:border-slate-700">
                                            <div className="flex items-center justify-center gap-1 mb-1.5">
                                                <Tag className="w-2.5 h-2.5 text-slate-400" />
                                                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Deducted</p>
                                            </div>
                                            <p className={`text-sm font-black tabular-nums leading-none ${deduction > 0 ? 'text-rose-500' : 'text-slate-400 dark:text-slate-600'}`}>
                                                {deduction > 0 ? `-₱${deduction.toLocaleString()}` : '—'}
                                            </p>
                                        </div>
                                        <div className="py-3 px-2 text-center border-r border-slate-100 dark:border-slate-700">
                                            <div className="flex items-center justify-center gap-1 mb-1.5">
                                                <Banknote className="w-2.5 h-2.5 text-slate-400" />
                                                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Staff Pay</p>
                                            </div>
                                            <p className={`text-sm font-black tabular-nums leading-none ${staffPay > 0 ? 'text-indigo-500' : 'text-slate-400 dark:text-slate-600'}`}>
                                                {staffPay > 0 ? `-₱${staffPay.toLocaleString()}` : '—'}
                                            </p>
                                        </div>
                                        <div className="py-3 px-2 text-center bg-emerald-50/50 dark:bg-emerald-900/20">
                                            <div className="flex items-center justify-center gap-1 mb-1.5">
                                                <TrendingUp className="w-2.5 h-2.5 text-emerald-500" />
                                                <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">ROI</p>
                                            </div>
                                            <p className="text-sm font-black text-emerald-700 dark:text-emerald-400 tabular-nums leading-none">₱{branchRoi.toLocaleString()}</p>
                                        </div>
                                    </div>

                                    {/* ── Note & Actions ── */}
                                    <div className="p-4 space-y-3 mt-auto">
                                        {t.note && (
                                            <div className="bg-slate-50 px-3 py-2.5 rounded-2xl border border-slate-100">
                                                <p className="text-xs font-black text-slate-300 uppercase tracking-widest mb-1">Note</p>
                                                <p className="text-xs text-slate-500 italic line-clamp-2 leading-relaxed">"{t.note}"</p>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => onEdit(t)}
                                                className="flex-1 flex items-center justify-center gap-2 bg-slate-900 hover:bg-emerald-600 text-white font-black py-3 rounded-2xl text-xs uppercase tracking-widest transition-all active:scale-95"
                                            >
                                                <Edit3 className="w-3.5 h-3.5" />
                                                Edit Record
                                            </button>
                                            <button
                                                onClick={() => onDelete(t.id)}
                                                disabled={isProcessing || isClosedMode}
                                                className="p-3 bg-rose-50 text-rose-400 rounded-2xl hover:bg-rose-500 hover:text-white transition-all active:scale-95 disabled:opacity-30 border border-rose-100 hover:border-rose-500"
                                            >
                                                <Trash2 className="w-4 h-4" strokeWidth={2} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="py-24 text-center bg-white rounded-3xl border-2 border-dashed border-slate-100 flex flex-col items-center gap-4">
                        <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center">
                            <FolderOpen className="w-8 h-8 text-slate-300" strokeWidth={1.5} />
                        </div>
                        <div>
                            <p className="text-xs font-black text-slate-300 uppercase tracking-widest">No Sessions Today</p>
                            <p className="text-xs font-bold text-slate-200 uppercase tracking-widest mt-1">Records will appear here once sessions are logged</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
