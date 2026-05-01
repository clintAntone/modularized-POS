
import React, { useState, useRef, useEffect } from 'react';
import { Expense } from '../../../../types';

interface VaultActivityLogProps {
    movements: any[];
    onView: (e: Expense) => void;
    onDelete?: (id: string) => void;
}

const LONG_PRESS_MS = 600;

export const VaultActivityLog: React.FC<VaultActivityLogProps> = ({ movements, onView, onDelete }) => {
    const settlements = movements.filter(m => m.category === 'SETTLEMENT');
    const [revealedId, setRevealedId] = useState<string | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const didLongPressRef = useRef(false);

    // Dismiss revealed actions when tapping outside
    useEffect(() => {
        if (!revealedId) return;
        const dismiss = () => setRevealedId(null);
        document.addEventListener('pointerdown', dismiss, { capture: true });
        return () => document.removeEventListener('pointerdown', dismiss, { capture: true });
    }, [revealedId]);

    const startPress = (id: string) => {
        didLongPressRef.current = false;
        timerRef.current = setTimeout(() => {
            didLongPressRef.current = true;
            setRevealedId(id);
        }, LONG_PRESS_MS);
    };

    const cancelPress = () => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };

    const handleItemClick = (e: any) => {
        if (didLongPressRef.current) { didLongPressRef.current = false; return; }
        if (revealedId) { setRevealedId(null); return; }
        onView(e);
    };

    const fmtDate = (ts: string) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const fmtTime = (ts: string) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (settlements.length === 0) return <EmptyState />;

    return (
        <div className="space-y-2.5">
            {settlements.map(e => {
                const isRevealed = revealedId === e.id;
                const canDelete = e.isDeletable && !!onDelete;

                return (
                    <div
                        key={e.id}
                        onPointerDown={evt => { evt.stopPropagation(); startPress(e.id); }}
                        onPointerUp={cancelPress}
                        onPointerLeave={cancelPress}
                        onPointerCancel={cancelPress}
                        onClick={() => handleItemClick(e)}
                        className={`relative bg-white rounded-[20px] border-2 transition-all duration-200 cursor-pointer select-none overflow-hidden ${
                            isRevealed
                                ? 'border-rose-200 shadow-md shadow-rose-50'
                                : 'border-slate-100 active:scale-[0.99] hover:border-slate-200 hover:shadow-sm'
                        }`}
                    >
                        <div className="flex items-center gap-3.5 px-4 py-4">
                            {/* Category icon */}
                            <div className={`w-10 h-10 rounded-[16px] flex items-center justify-center shrink-0 transition-colors ${isRevealed ? 'bg-rose-100 text-rose-500' : 'bg-slate-50 text-slate-400'}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                                </svg>
                            </div>

                            {/* Name + date */}
                            <div className="flex-1 min-w-0">
                                <p className={`text-[13px] font-black uppercase tracking-tight truncate leading-tight transition-colors ${isRevealed ? 'text-rose-800' : 'text-slate-900'}`}>
                                    {e.name}
                                </p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                    {fmtDate(e.timestamp)}
                                    <span className="mx-1.5 opacity-40">·</span>
                                    {fmtTime(e.timestamp)}
                                </p>
                            </div>

                            {/* Amount */}
                            <p className={`text-[15px] font-black tabular-nums whitespace-nowrap transition-colors ${isRevealed ? 'text-rose-500' : 'text-rose-600'}`}>
                                ₱{Number(e.amount).toLocaleString()}
                            </p>

                            {/* Action area — only on long press */}
                            {isRevealed && canDelete ? (
                                <button
                                    onPointerDown={evt => evt.stopPropagation()}
                                    onClick={evt => { evt.stopPropagation(); onDelete!(e.id); setRevealedId(null); }}
                                    className="w-9 h-9 bg-rose-500 hover:bg-rose-600 text-white rounded-xl flex items-center justify-center shrink-0 transition-all animate-in fade-in zoom-in-95 duration-150 active:scale-90"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            ) : (
                                <svg className="w-4 h-4 text-slate-200 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" />
                                </svg>
                            )}
                        </div>

                        {/* Long-press hint strip */}
                        {isRevealed && (
                            <div className="bg-rose-50 border-t border-rose-100 px-4 py-1.5 flex items-center justify-between animate-in slide-in-from-bottom-1 duration-150">
                                {canDelete
                                    ? <p className="text-[8px] font-black text-rose-400 uppercase tracking-widest">Tap trash to delete</p>
                                    : <p className="text-[8px] font-bold text-rose-300 uppercase tracking-widest">Cannot be deleted</p>
                                }
                                <p className="text-[8px] font-bold text-rose-300 uppercase tracking-widest">Tap elsewhere to dismiss</p>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

const EmptyState = () => (
    <div className="py-16 text-center flex flex-col items-center justify-center space-y-3 opacity-40">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
            </svg>
        </div>
        <div className="space-y-1">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">No Bills Recorded</p>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Vault settlements will appear here</p>
        </div>
    </div>
);
