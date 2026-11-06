
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Branch } from '../../../../types';
import { DB_TABLES, DB_COLUMNS } from '../../../../constants/db_schema';
import { supabase } from '../../../../lib/supabase';
import { playSound } from '../../../../lib/audio';
import { getTrueDate } from '../../../../lib/time';
import { logAudit } from '../../../../lib/audit';

interface XmasBonusModalProps {
    branch: Branch;
    todayStr: string;
    currentNetRoi: number;
    onClose: () => void;
    onRefresh?: () => void;
    performerName?: string;
}

export const XmasBonusModal: React.FC<XmasBonusModalProps> = ({
    branch, todayStr, currentNetRoi, onClose, onRefresh, performerName,
}) => {
    const [amount, setAmount] = useState<number>(0);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    const roiAfter = currentNetRoi - amount;
    const roiAlreadyNegative = currentNetRoi <= 0;
    const wouldGoNegative = amount > 0 && roiAfter < 0;
    const canSave = amount > 0 && !roiAlreadyNegative && !wouldGoNegative && !isSaving;

    const handleSave = async () => {
        if (!canSave) return;
        setIsSaving(true);
        setError('');

        const now = getTrueDate();
        const timePart = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Manila',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        }).format(now);
        const timestamp = `${todayStr}T${timePart}.000+08:00`;
        const expenseId = Math.random().toString(36).substr(2, 9);

        try {
            const { error: dbError } = await supabase.from(DB_TABLES.EXPENSES).insert({
                [DB_COLUMNS.ID]: expenseId,
                [DB_COLUMNS.BRANCH_ID]: branch.id,
                [DB_COLUMNS.TIMESTAMP]: timestamp,
                [DB_COLUMNS.NAME]: 'XMAS BONUS PROVISION',
                [DB_COLUMNS.AMOUNT]: amount,
                [DB_COLUMNS.CATEGORY]: 'OPERATIONAL',
            });
            if (dbError) throw dbError;

            await logAudit({
                branchId: branch.id,
                activityType: 'CREATE_EXPENSE',
                entityType: 'expense',
                entityId: expenseId,
                description: `Xmas bonus provision: ₱${amount.toLocaleString()}`,
                amount,
                performerName: performerName || 'MANAGER',
            });

            playSound('success');
            onRefresh?.();
            onClose();
        } catch (e: any) {
            setError('Failed to save. Please try again.');
            console.error(e);
        } finally {
            setIsSaving(false);
        }
    };

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl w-full max-w-xs overflow-hidden animate-in zoom-in-95 duration-150">

                {/* Header */}
                <div className="px-6 pt-6 pb-5 border-b border-slate-700/60">
                    <h3 className="text-white font-black text-sm uppercase tracking-tight">Xmas Bonus</h3>
                    <p className="text-slate-400 text-xs mt-0.5">Provision entry for Christmas bonus</p>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-4">

                    {roiAlreadyNegative ? (
                        <div className="bg-slate-800 border border-slate-600 rounded-2xl px-4 py-4 text-center space-y-1">
                            <p className="text-sm font-black text-slate-200">ROI is Negative</p>
                            <p className="text-xs text-slate-400 leading-relaxed">Today's ROI is already at ₱{currentNetRoi.toLocaleString()}. Bonus provision cannot be recorded.</p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Amount (₱)</label>
                                    <span className="text-xs text-slate-500 font-medium">
                                        Max: <span className="font-bold text-slate-300">₱{currentNetRoi.toLocaleString()}</span>
                                    </span>
                                </div>
                                <input
                                    type="number"
                                    min={0}
                                    max={currentNetRoi}
                                    autoFocus
                                    value={amount || ''}
                                    onChange={e => setAmount(Number(e.target.value))}
                                    onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                                    placeholder="0"
                                    className={`w-full px-4 py-3.5 bg-slate-800 border-2 rounded-2xl font-black text-xl text-white outline-none transition-all tabular-nums ${wouldGoNegative ? 'border-rose-500 focus:border-rose-400' : 'border-slate-600 focus:border-slate-400'}`}
                                />
                                {wouldGoNegative && (
                                    <p className="text-xs text-rose-400 font-semibold">
                                        This would put ROI at ₱{roiAfter.toLocaleString()} — reduce the amount.
                                    </p>
                                )}
                            </div>

                            <div className="bg-slate-800 rounded-2xl px-4 py-3 border border-slate-600">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Label</p>
                                <p className="text-sm font-black text-slate-200 mt-0.5">XMAS BONUS PROVISION</p>
                            </div>
                        </>
                    )}

                    {error && (
                        <p className="text-xs text-rose-400 font-semibold text-center">{error}</p>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 pb-6 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 text-slate-400 font-bold text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-800 transition-all"
                    >
                        Cancel
                    </button>
                    {!roiAlreadyNegative && (
                        <button
                            onClick={handleSave}
                            disabled={!canSave}
                            className="flex-1 py-3 bg-white text-slate-900 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-100 transition-all disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-2"
                        >
                            {isSaving ? (
                                <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-slate-900 rounded-full animate-spin" />
                            ) : 'Save'}
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};
