import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Camera, CheckCircle, Loader, Lightbulb } from 'lucide-react';
import { Employee } from '../../../../types';
import { loadFaceModels, extractDescriptors, matchFace } from '../../../../lib/face';
import { playSound } from '../../../../lib/audio';
import { ScreenBrightness } from '@capacitor-community/screen-brightness';
import { Capacitor } from '@capacitor/core';

const MIN_BRIGHTNESS = 0.8;
const isNative = Capacitor.isNativePlatform();

async function setBrightness(value: number) {
    try { await ScreenBrightness.setBrightness({ brightness: value }); } catch { /* no-op */ }
}

async function getAndSetBrightness(): Promise<number> {
    try {
        const { brightness } = await ScreenBrightness.getBrightness();
        await ScreenBrightness.setBrightness({ brightness: Math.max(brightness, MIN_BRIGHTNESS) });
        return brightness;
    } catch {
        return MIN_BRIGHTNESS;
    }
}

interface FaceTimeInModalProps {
    employees: Employee[];
    branchId: string;
    targetEmployee?: Employee;
    onMatch: (emp: Employee) => void;
    onClose: () => void;
    onManualOverride?: () => void;
}

type Status = 'loading' | 'ready' | 'scanning' | 'matched' | 'no_face' | 'no_match' | 'error';

export const FaceTimeInModal: React.FC<FaceTimeInModalProps> = ({ employees, branchId, targetEmployee, onMatch, onClose, onManualOverride }) => {
    const videoRef         = useRef<HTMLVideoElement>(null);
    const streamRef        = useRef<MediaStream | null>(null);
    const origBrightness   = useRef<number>(MIN_BRIGHTNESS);

    const [status, setStatus] = useState<Status>('loading');
    const [matchedEmp, setMatchedEmp] = useState<Employee | null>(null);
    const [matchConfidence, setMatchConfidence] = useState(0);
    const [statusMsg, setStatusMsg] = useState('Loading face models...');
    const [failedAttempts, setFailedAttempts] = useState(0);

    const pool = targetEmployee ? [targetEmployee] : employees;
    const empDescriptors = pool
        .filter(e => e.faceDescriptors && e.faceDescriptors.length > 0)
        .map(e => ({ id: e.id, name: e.name, descriptors: e.faceDescriptors! }));

    const stopCamera = useCallback(() => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
    }, []);

    const startCamera = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }
            setStatus('ready');
            setStatusMsg('Position your face in the frame');
        } catch {
            setStatus('error');
            setStatusMsg('Camera access denied');
        }
    }, []);

    const scan = useCallback(async () => {
        if (!videoRef.current || status === 'scanning' || status === 'matched') return;
        setStatus('scanning');
        setStatusMsg('Scanning...');

        try {
            const descriptors = await extractDescriptors(videoRef.current);
            if (!descriptors || descriptors.length === 0) {
                setStatus('no_face');
                setStatusMsg('No face detected — move closer');
                setTimeout(() => { setStatus('ready'); setStatusMsg('Position your face in the frame'); }, 2000);
                return;
            }
            if (empDescriptors.length === 0) {
                setStatus('no_match');
                setStatusMsg('No enrolled employees found');
                setTimeout(() => { setStatus('ready'); setStatusMsg('Position your face in the frame'); }, 2500);
                return;
            }
            const match = matchFace(descriptors[0], empDescriptors);
            if (!match) {
                playSound('warning');
                setFailedAttempts(prev => prev + 1);
                setStatus('no_match');
                setStatusMsg('Face not recognized — try again');
                setTimeout(() => { setStatus('ready'); setStatusMsg('Position your face in the frame'); }, 2500);
                return;
            }
            const emp = employees.find(e => e.id === match.employeeId);
            if (!emp) {
                setStatus('no_match');
                setStatusMsg('Employee not found');
                setTimeout(() => { setStatus('ready'); setStatusMsg('Position your face in the frame'); }, 2500);
                return;
            }

            playSound('success');
            setMatchedEmp(emp);
            setMatchConfidence(Math.round((1 - match.distance) * 100));
            setStatus('matched');
            stopCamera();
            setTimeout(() => { onMatch(emp); onClose(); }, 1800);

        } catch {
            setFailedAttempts(prev => prev + 1);
            setStatus('error');
            setStatusMsg('Scan failed — try again');
            setTimeout(() => { setStatus('ready'); setStatusMsg('Position your face in the frame'); }, 2000);
        }
    }, [status, empDescriptors, employees, onMatch, onClose, stopCamera]);

    // Boost brightness on mount, restore on unmount
    useEffect(() => {
        getAndSetBrightness().then(orig => { origBrightness.current = orig; });
        return () => { setBrightness(origBrightness.current); };
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            await loadFaceModels();
            if (!cancelled) await startCamera();
        })();
        return () => { cancelled = true; stopCamera(); };
    }, [startCamera, stopCamera]);

    const statusColor: Record<Status, string> = {
        loading:  'text-slate-400',
        ready:    'text-slate-400',
        scanning: 'text-amber-400',
        matched:  'text-emerald-400',
        no_face:  'text-amber-400',
        no_match: 'text-rose-400',
        error:    'text-rose-400',
    };

    const ringColor: Record<Status, string> = {
        loading:  'border-slate-700',
        ready:    'border-white/20',
        scanning: 'border-amber-400',
        matched:  'border-emerald-400',
        no_face:  'border-amber-400',
        no_match: 'border-rose-400',
        error:    'border-rose-400',
    };

    const ovalStroke = status === 'scanning' ? '#fbbf24'
        : status === 'no_match' ? '#f87171'
        : 'white';

    const canScan = status === 'ready' || status === 'no_face' || status === 'no_match' || status === 'error';

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/95 p-1 animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-slate-900 rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col h-[90dvh]">

                {/* Brightness tip — web only */}
                {!isNative && (
                    <div className="flex items-center gap-2 mx-6 mt-4 px-4 py-2 shrink-0 bg-amber-500/10 border border-amber-400/20 rounded-2xl">
                        <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest">Turn up your screen brightness for best results</p>
                    </div>
                )}

                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-3 pb-2 shrink-0">
                    <div>
                        <h3 className="text-[13px] font-black text-white uppercase tracking-tight">Face Time-In</h3>
                        {targetEmployee && <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest mt-0.5 truncate">{targetEmployee.name}</p>}
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Look at the camera</p>
                    </div>
                    <button onClick={() => { stopCamera(); onClose(); }} className="w-8 h-8 bg-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Camera view — flex-[3] makes it dominate available space */}
                <div className="px-3 pb-2 flex-[3] min-h-0">
                    <div className={`relative rounded-3xl overflow-hidden border-2 ${ringColor[status]} transition-all duration-300 bg-slate-800 h-full`}>
                        <video ref={videoRef} muted playsInline className="w-full h-full object-cover scale-x-[-1]" />

                        {/* Face silhouette guide */}
                        {(status === 'ready' || status === 'scanning' || status === 'no_match' || status === 'no_face') && (
                            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                <svg viewBox="0 0 200 300" className="w-[88%] h-[92%]" fill="none">
                                    <defs>
                                        <filter id="glow">
                                            <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                                            <feMerge>
                                                <feMergeNode in="coloredBlur" />
                                                <feMergeNode in="SourceGraphic" />
                                            </feMerge>
                                        </filter>
                                    </defs>
                                    <path d="M18 130 C8 122 2 136 2 150 C2 164 8 174 18 170"
                                        stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" filter="url(#glow)" />
                                    <path d="M182 130 C192 122 198 136 198 150 C198 164 192 174 182 170"
                                        stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" filter="url(#glow)" />
                                    <path
                                        d="M100 8 C148 8 182 48 182 105 C182 158 162 200 135 214 C122 221 111 225 100 225 C89 225 78 221 65 214 C38 200 18 158 18 105 C18 48 52 8 100 8 Z"
                                        stroke={ovalStroke}
                                        strokeWidth="3" strokeDasharray="10 6" strokeLinecap="round"
                                        opacity="0.65" filter="url(#glow)"
                                    />
                                    <path d="M82 222 L82 248 Q100 256 118 248 L118 222"
                                        stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
                                    <path d="M4 290 Q40 258 82 252 Q100 258 118 252 Q160 258 196 290"
                                        stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.15" />
                                </svg>
                            </div>
                        )}

                        {/* Scanning pulse */}
                        {status === 'scanning' && (
                            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                <div className="w-32 h-32 rounded-full border-2 border-amber-400/40 animate-ping" />
                            </div>
                        )}

                        {/* Matched overlay */}
                        {status === 'matched' && matchedEmp && (
                            <div className="absolute inset-0 bg-emerald-500/20 flex flex-col items-center justify-center gap-3 animate-in fade-in duration-300 px-4">
                                <CheckCircle className="w-20 h-20 text-emerald-400" strokeWidth={1.5} />
                                <p className="text-emerald-300 font-black text-[15px] uppercase tracking-widest">Welcome,</p>
                                <p className="text-white font-black text-[28px] uppercase tracking-tight leading-none text-center">{matchedEmp.name.split(' ')[0]}</p>
                                <p className="text-emerald-400 text-[11px] font-black uppercase tracking-widest">{matchConfidence}% match</p>
                            </div>
                        )}

                        {/* Loading overlay */}
                        {status === 'loading' && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Loader className="w-8 h-8 text-slate-500 animate-spin" />
                            </div>
                        )}
                    </div>
                </div>

                {/* Status */}
                <div className="px-6 pb-2 text-center shrink-0">
                    <p className={`text-[11px] font-black uppercase tracking-widest ${statusColor[status]} transition-colors`}>{statusMsg}</p>
                    {empDescriptors.length === 0 && status !== 'loading' && (
                        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-1">No employees have face data enrolled yet</p>
                    )}
                </div>

                {/* Scan button */}
                <div className="px-6 pb-3 shrink-0">
                    <button
                        onClick={scan}
                        disabled={!canScan}
                        className="w-full flex items-center justify-center gap-2 bg-white text-slate-900 font-black py-4 rounded-2xl text-[11px] uppercase tracking-widest transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-emerald-500 hover:text-white"
                    >
                        <Camera className="w-4 h-4" />
                        {status === 'scanning' ? 'Scanning...' : 'Scan Face'}
                    </button>
                </div>

                {/* Manual override fallback — only shown after 3 failed attempts */}
                {onManualOverride && failedAttempts >= 3 && (
                    <div className="px-6 pb-5 text-center shrink-0">
                        <button
                            onClick={() => { stopCamera(); onClose(); onManualOverride(); }}
                            className="text-[9px] font-black text-slate-500 uppercase tracking-widest hover:text-slate-300 transition-colors"
                        >
                            Camera not working? Use manual time-in
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};
