import React, { useRef, useState, useEffect } from 'react';
import { PenLine, RotateCcw, ShieldCheck } from 'lucide-react';

interface ClientApprovalModalProps {
    clientName: string;
    serviceName: string;
    total: number;
    paymentMethod: string;
    isProcessing: boolean;
    onConfirm: () => void;
    onBack: () => void;
}

export const ClientApprovalModal: React.FC<ClientApprovalModalProps> = ({
    clientName,
    serviceName,
    total,
    paymentMethod,
    isProcessing,
    onConfirm,
    onBack,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasSigned, setHasSigned] = useState(false);
    const lastPos = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }, []);

    const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        if ('touches' in e) {
            return {
                x: (e.touches[0].clientX - rect.left) * scaleX,
                y: (e.touches[0].clientY - rect.top) * scaleY,
            };
        }
        return {
            x: ((e as React.MouseEvent).clientX - rect.left) * scaleX,
            y: ((e as React.MouseEvent).clientY - rect.top) * scaleY,
        };
    };

    const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        setIsDrawing(true);
        setHasSigned(true);
        lastPos.current = getPos(e, canvas);
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx || !lastPos.current) return;
        const pos = getPos(e, canvas);
        ctx.beginPath();
        ctx.moveTo(lastPos.current.x, lastPos.current.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        lastPos.current = pos;
    };

    const stopDraw = () => {
        setIsDrawing(false);
        lastPos.current = null;
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        setHasSigned(false);
    };

    return (
        <div className="fixed inset-0 z-[9980] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm flex flex-col max-h-[95dvh] overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="bg-slate-900 px-6 pt-6 pb-5 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center shrink-0">
                            <ShieldCheck className="w-5 h-5 text-white" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Step 2 of 2</p>
                            <h3 className="text-white font-bold text-base uppercase tracking-tight leading-none">Client Approval</h3>
                            {clientName ? (
                                <p className="text-slate-400 text-xs font-medium mt-0.5 truncate">{clientName}</p>
                            ) : null}
                        </div>
                    </div>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto no-scrollbar">

                    {/* Transaction summary */}
                    <div className="px-5 pt-5 pb-3 space-y-3">
                        <div className="bg-slate-50 rounded-2xl p-4 space-y-2 border border-slate-100">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">You are about to pay for</p>
                            <p className="font-bold text-slate-900 text-sm uppercase leading-snug">{serviceName}</p>
                            <div className="h-px bg-slate-200" />
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Total</span>
                                <span className="text-2xl font-black text-slate-900 tracking-tighter">₱{total.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Payment</span>
                                <span className={`text-xs font-bold uppercase tracking-widest ${paymentMethod === 'GCASH' ? 'text-blue-600' : 'text-slate-700'}`}>
                                    {paymentMethod === 'CASH' ? '💵 Cash' : '📱 GCash'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Signature */}
                    <div className="px-5 pb-3 space-y-2">
                        <div className="flex items-center gap-2">
                            <PenLine className="w-3.5 h-3.5 text-slate-400" />
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client Signature</p>
                        </div>
                        {/* touch-none is on the canvas itself so only drawing area blocks scroll, not the surrounding wrapper */}
                        <div className="relative border-2 border-slate-200 rounded-2xl overflow-hidden bg-white select-none">
                            <canvas
                                ref={canvasRef}
                                width={500}
                                height={300}
                                className="w-full h-56 cursor-crosshair block touch-none"
                                onMouseDown={startDraw}
                                onMouseMove={draw}
                                onMouseUp={stopDraw}
                                onMouseLeave={stopDraw}
                                onTouchStart={startDraw}
                                onTouchMove={draw}
                                onTouchEnd={stopDraw}
                            />
                            {!hasSigned && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <p className="text-slate-200 text-sm font-medium">Sign here</p>
                                </div>
                            )}
                            {/* Clear button overlaid on canvas so users never need to scroll past it */}
                            {hasSigned && (
                                <button
                                    type="button"
                                    onClick={clearCanvas}
                                    className="absolute top-2 right-2 flex items-center gap-1 px-2.5 py-1.5 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-xl text-slate-500 hover:text-slate-700 text-[10px] font-bold uppercase tracking-widest shadow-sm transition-colors"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                    Clear
                                </button>
                            )}
                        </div>
                        <div className="flex items-center gap-2 px-1">
                            <div className="flex-1 border-t border-dashed border-slate-200" />
                            <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Client Signature</span>
                            <div className="flex-1 border-t border-dashed border-slate-200" />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 pb-5 pt-2 space-y-2 shrink-0 border-t border-slate-100">
                    <div className="flex gap-2">
                        <button
                            onClick={onBack}
                            disabled={isProcessing}
                            className="flex-1 py-4 border border-slate-200 rounded-2xl text-slate-500 font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all"
                        >
                            Back
                        </button>
                        <button
                            onClick={onConfirm}
                            disabled={!hasSigned || isProcessing}
                            className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isProcessing
                                ? <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                : <ShieldCheck className="w-4 h-4" />
                            }
                            {isProcessing ? 'Saving...' : 'I Agree & Sign'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
