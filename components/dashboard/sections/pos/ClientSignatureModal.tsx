import React, { useRef, useState, useEffect } from 'react';
import { PenLine, RotateCcw, Check } from 'lucide-react';

interface ClientSignatureModalProps {
    clientName: string;
    isProcessing: boolean;
    onConfirm: () => void;
    onBack: () => void;
}

export const ClientSignatureModal: React.FC<ClientSignatureModalProps> = ({ clientName, isProcessing, onConfirm, onBack }) => {
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
        e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;
        setIsDrawing(true);
        setHasSigned(true);
        lastPos.current = getPos(e, canvas);
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
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
        <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="bg-slate-900 px-6 pt-6 pb-5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center">
                            <PenLine className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-white font-bold text-base uppercase tracking-tight leading-none">Client Signature</h3>
                            <p className="text-slate-400 text-xs font-medium mt-0.5 truncate max-w-[200px]">
                                {clientName || 'Walk-in Client'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Signature pad */}
                <div className="px-5 pt-5 pb-3 space-y-3">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest text-center">
                        Please sign inside the box to confirm the session
                    </p>
                    <div className="relative border-2 border-slate-200 rounded-2xl overflow-hidden bg-white touch-none select-none">
                        <canvas
                            ref={canvasRef}
                            width={500}
                            height={200}
                            className="w-full h-44 cursor-crosshair block"
                            onMouseDown={startDraw}
                            onMouseMove={draw}
                            onMouseUp={stopDraw}
                            onMouseLeave={stopDraw}
                            onTouchStart={startDraw}
                            onTouchMove={draw}
                            onTouchEnd={stopDraw}
                        />
                        {!hasSigned && (
                            <div className="absolute inset-0 flex items-end justify-center pb-3 pointer-events-none">
                                <p className="text-slate-200 text-sm font-medium">Sign here</p>
                            </div>
                        )}
                    </div>
                    {/* Signature line label */}
                    <div className="flex items-center gap-2 px-1">
                        <div className="flex-1 border-t border-dashed border-slate-200" />
                        <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Client Signature</span>
                        <div className="flex-1 border-t border-dashed border-slate-200" />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 pb-5 space-y-2">
                    <button
                        type="button"
                        onClick={clearCanvas}
                        disabled={!hasSigned}
                        className="w-full flex items-center justify-center gap-2 py-2 text-slate-400 hover:text-slate-600 text-xs font-semibold uppercase tracking-widest transition-colors disabled:opacity-30"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Clear
                    </button>
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
                                : <Check className="w-4 h-4" />
                            }
                            {isProcessing ? 'Syncing...' : 'Confirm & Record'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
