import React from 'react';
import { Transaction } from '../../../../types';
import { X, Clock, Tag, Banknote, TrendingUp, PenLine, User, Stethoscope, FileText } from 'lucide-react';

interface SessionDetailModalProps {
    transaction: Transaction;
    signatureUrl: string | null;
    isLoadingSignature: boolean;
    onClose: () => void;
}

export const SessionDetailModal: React.FC<SessionDetailModalProps> = ({
    transaction: t,
    signatureUrl,
    isLoadingSignature,
    onClose,
}) => {
    const time = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Manila',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    }).format(new Date(t.timestamp));

    const deduction = t.discount + (t.voucherValue || 0);
    const staffPay = (t.primaryCommission || 0) + (t.secondaryCommission || 0);
    const branchRoi = t.total - staffPay;

    return (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm sm:max-w-md flex flex-col max-h-[92dvh] overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="bg-slate-900 px-6 pt-6 pb-5 shrink-0 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center shrink-0">
                            <User className="w-5 h-5 text-white" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Session Record</p>
                            <h3 className="text-white font-black text-base uppercase tracking-tight leading-none truncate">{t.clientName || 'WALK-IN'}</h3>
                            <p className="text-slate-400 text-xs font-medium mt-0.5">{time}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors shrink-0"
                    >
                        <X className="w-4 h-4 text-white" />
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto no-scrollbar divide-y divide-slate-100">

                    {/* Service + payment */}
                    <div className="px-5 py-4 space-y-3">
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Service</p>
                            <p className="text-sm font-black text-slate-900 uppercase leading-tight">{t.serviceName}</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-widest ${t.paymentMethod === 'CASH' ? 'bg-slate-100 text-slate-600' : 'bg-indigo-50 text-indigo-600'}`}>
                                {t.paymentMethod === 'CASH' ? '💵 Cash' : '📱 GCash'}
                            </span>
                            {t.paymentStatus === 'PENDING' && (
                                <span className="text-[10px] font-black bg-rose-50 text-rose-500 px-2.5 py-1 rounded-lg uppercase tracking-widest">Unpaid</span>
                            )}
                        </div>
                    </div>

                    {/* Staff */}
                    <div className="px-5 py-4 space-y-3">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Staff</p>
                        <div className="flex items-start gap-4">
                            {t.therapistName && (
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1 mb-0.5">
                                        <Stethoscope className="w-3 h-3 text-slate-300" />
                                        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Therapist</p>
                                    </div>
                                    <p className="text-xs font-black text-slate-700 uppercase truncate">{t.therapistName}</p>
                                </div>
                            )}
                            {t.bonesetterName && (
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1 mb-0.5">
                                        <Stethoscope className="w-3 h-3 text-slate-300" />
                                        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Bonesetter</p>
                                    </div>
                                    <p className="text-xs font-black text-slate-700 uppercase truncate">{t.bonesetterName}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Financial breakdown */}
                    <div className="px-5 py-4">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Financials</p>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-slate-50 rounded-2xl p-3">
                                <div className="flex items-center gap-1 mb-1">
                                    <Clock className="w-3 h-3 text-slate-300" />
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Base</p>
                                </div>
                                <p className="text-sm font-black text-slate-900 tabular-nums">₱{t.basePrice.toLocaleString()}</p>
                            </div>
                            <div className="bg-slate-50 rounded-2xl p-3">
                                <div className="flex items-center gap-1 mb-1">
                                    <Tag className="w-3 h-3 text-slate-300" />
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Deducted</p>
                                </div>
                                <p className={`text-sm font-black tabular-nums ${deduction > 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                                    {deduction > 0 ? `-₱${deduction.toLocaleString()}` : '—'}
                                </p>
                            </div>
                            <div className="bg-slate-50 rounded-2xl p-3">
                                <div className="flex items-center gap-1 mb-1">
                                    <Banknote className="w-3 h-3 text-slate-300" />
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Staff Pay</p>
                                </div>
                                <p className={`text-sm font-black tabular-nums ${staffPay > 0 ? 'text-indigo-500' : 'text-slate-400'}`}>
                                    {staffPay > 0 ? `-₱${staffPay.toLocaleString()}` : '—'}
                                </p>
                            </div>
                            <div className="bg-emerald-50 rounded-2xl p-3">
                                <div className="flex items-center gap-1 mb-1">
                                    <TrendingUp className="w-3 h-3 text-emerald-500" />
                                    <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">ROI</p>
                                </div>
                                <p className="text-sm font-black text-emerald-700 tabular-nums">₱{branchRoi.toLocaleString()}</p>
                            </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between bg-slate-900 rounded-2xl px-4 py-3">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Paid</p>
                            <p className="text-lg font-black text-white tabular-nums tracking-tighter">₱{t.total.toLocaleString()}</p>
                        </div>
                    </div>

                    {/* Note */}
                    {t.note && (
                        <div className="px-5 py-4">
                            <div className="flex items-center gap-1.5 mb-2">
                                <FileText className="w-3 h-3 text-slate-400" />
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Notes / Medical History</p>
                            </div>
                            <p className="text-xs text-slate-500 italic leading-relaxed bg-slate-50 rounded-2xl px-3 py-2.5 border border-slate-100">"{t.note}"</p>
                        </div>
                    )}

                    {/* Signature */}
                    <div className="px-5 py-4">
                        <div className="flex items-center gap-1.5 mb-3">
                            <PenLine className="w-3.5 h-3.5 text-slate-400" />
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client Signature</p>
                        </div>
                        <div className="border-2 border-slate-100 rounded-2xl overflow-hidden bg-slate-50 min-h-[140px] flex items-center justify-center">
                            {isLoadingSignature ? (
                                <div className="flex flex-col items-center gap-2 py-8">
                                    <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin" />
                                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Loading…</p>
                                </div>
                            ) : signatureUrl ? (
                                <img
                                    src={signatureUrl}
                                    alt="Client signature"
                                    className="w-full object-contain max-h-52"
                                    crossOrigin="anonymous"
                                />
                            ) : (
                                <div className="flex flex-col items-center gap-2 py-8">
                                    <PenLine className="w-6 h-6 text-slate-200" />
                                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">No signature on file</p>
                                </div>
                            )}
                        </div>
                        {signatureUrl && (
                            <div className="flex items-center gap-2 px-1 mt-2">
                                <div className="flex-1 border-t border-dashed border-slate-200" />
                                <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Client Signature</span>
                                <div className="flex-1 border-t border-dashed border-slate-200" />
                            </div>
                        )}
                    </div>

                    {/* Session ID */}
                    <div className="px-5 py-4">
                        <p className="text-[9px] font-bold text-slate-200 uppercase tracking-widest">Session ID: {t.id.slice(-8).toUpperCase()}</p>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 pb-5 pt-3 shrink-0 border-t border-slate-100">
                    <button
                        onClick={onClose}
                        className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-slate-700 transition-all"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
