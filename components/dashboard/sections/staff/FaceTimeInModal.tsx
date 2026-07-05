import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Camera, CheckCircle, Loader, Lightbulb } from 'lucide-react';
import { Employee } from '../../../../types';
import { loadFaceModels, preloadFaceModels, extractDescriptors, matchFace } from '../../../../lib/face';
import { playSound } from '../../../../lib/audio';
import { ScreenBrightness } from '@capacitor-community/screen-brightness';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../../../../lib/supabase';

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

type Status = 'loading' | 'ready' | 'scanning' | 'matched' | 'no_face' | 'no_match' | 'error' | 'load_error';

export const FaceTimeInModal: React.FC<FaceTimeInModalProps> = ({ employees, branchId, targetEmployee, onMatch, onClose, onManualOverride }) => {
    const videoRef         = useRef<HTMLVideoElement>(null);
    const streamRef        = useRef<MediaStream | null>(null);
    const origBrightness   = useRef<number>(MIN_BRIGHTNESS);

    const [status, setStatus] = useState<Status>('loading');
    const [matchedEmp, setMatchedEmp] = useState<Employee | null>(null);
    const [matchConfidence, setMatchConfidence] = useState(0);
    const [statusMsg, setStatusMsg] = useState('Loading face models...');
    const [failedAttempts, setFailedAttempts] = useState(0);
    const [dlProgress, setDlProgress] = useState(0);

    // Seed from props, then immediately hydrate with a fresh DB fetch so that
    // descriptors enrolled seconds ago are available without requiring a full page refresh.
    const pool = targetEmployee ? [targetEmployee] : employees;
    const [empDescriptors, setEmpDescriptors] = useState(() =>
        pool
            .filter(e => e.faceDescriptors && e.faceDescriptors.length > 0)
            .map(e => ({ id: e.id, name: e.name, descriptors: e.faceDescriptors! }))
    );

    useEffect(() => {
        let cancelled = false;
        const ids = pool.map(e => e.id);
        if (ids.length === 0) return;
        (async () => {
            try {
                const { data } = await supabase
                    .from('employees')
                    .select('id, name, face_descriptors')
                    .in('id', ids);
                if (cancelled || !data) return;
                const fresh = data
                    .filter((r: any) => r.face_descriptors && r.face_descriptors.length > 0)
                    .map((r: any) => ({ id: r.id, name: r.name, descriptors: r.face_descriptors as number[][] }));
                if (fresh.length > 0) setEmpDescriptors(fresh);
            } catch { /* silently fall back to prop-seeded descriptors */ }
        })();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stopCamera = useCallback(() => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
    }, []);

    // Wait until the video element has received at least one real frame from the camera.
    // play() resolves as soon as playback starts, but the first pixel data may not have
    // arrived yet — scanning on a black frame always returns "no face detected".
    const waitForFirstFrame = (video: HTMLVideoElement): Promise<void> =>
        new Promise(resolve => {
            if (video.readyState >= 2 && video.videoWidth > 0) { resolve(); return; }
            const onFrame = () => {
                if (video.readyState >= 2 && video.videoWidth > 0) { resolve(); }
                else { requestAnimationFrame(onFrame); }
            };
            requestAnimationFrame(onFrame);
        });

    const startCamera = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
                // Wait for the camera to deliver its first real frame before declaring ready.
                // Without this, an immediate scan attempt hits a blank frame and reports "No face detected".
                await Promise.race([
                    waitForFirstFrame(videoRef.current),
                    new Promise<void>(r => setTimeout(r, 2000)), // safety cap
                ]);
            }
            setStatus('ready');
            setStatusMsg('Position your face in the frame');
        } catch (err: any) {
            const isDenied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
            if (isDenied) {
                // Browser may reject immediately before the user taps Allow — retry once after a short delay
                // to give the OS/browser time to propagate the granted permission.
                await new Promise(r => setTimeout(r, 1200));
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
                    });
                    streamRef.current = stream;
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                        await videoRef.current.play();
                        await Promise.race([
                            waitForFirstFrame(videoRef.current),
                            new Promise<void>(r => setTimeout(r, 2000)),
                        ]);
                    }
                    setStatus('ready');
                    setStatusMsg('Position your face in the frame');
                    return;
                } catch {}
            }
            setStatus('error');
            if (window.location.protocol !== 'https:') {
                setStatusMsg('Camera requires HTTPS. Please access this app over a secure connection.');
            } else if (isDenied) {
                setStatusMsg('Camera access denied. Go to browser settings, reset camera permissions for this site, then refresh.');
            } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
                setStatusMsg('No camera found on this device.');
            } else {
                setStatusMsg('Could not access camera. Please check your browser settings.');
            }
        }
    }, []);

    const scan = useCallback(async () => {
        if (!videoRef.current || status === 'scanning' || status === 'matched') return;
        // Second-line guard: if the video element still has no pixel data, don't scan yet
        if (videoRef.current.readyState < 2 || videoRef.current.videoWidth === 0) {
            setStatusMsg('Camera warming up — please wait');
            return;
        }
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
            // Try all detected face descriptors and take the best match
            let match = null;
            for (const descriptor of descriptors) {
                const candidate = await matchFace(descriptor, empDescriptors);
                if (candidate && (!match || candidate.distance < match.distance)) {
                    match = candidate;
                }
            }
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

    const loadModelsAndStart = useCallback(async () => {
        setStatus('loading');
        setDlProgress(0);
        const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 45_000)
        );
        try {
            await Promise.race([
                (async () => {
                    await preloadFaceModels((loaded, total) => setDlProgress(Math.round((loaded / total) * 100)));
                    await loadFaceModels();
                })(),
                timeout,
            ]);
            await startCamera();
        } catch {
            setStatus('load_error');
            setStatusMsg('Failed to load — tap Retry');
        }
    }, [startCamera]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setStatus('loading');
            setDlProgress(0);
            const timeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), 45_000)
            );
            try {
                await Promise.race([
                    (async () => {
                        await preloadFaceModels((loaded, total) => {
                            if (!cancelled) setDlProgress(Math.round((loaded / total) * 100));
                        });
                        await loadFaceModels();
                    })(),
                    timeout,
                ]);
                if (!cancelled) await startCamera();
            } catch (err) {
                if (!cancelled) {
                    const msg = err instanceof Error ? err.message : String(err);
                    setStatus('load_error');
                    setStatusMsg(`Error: ${msg}`);
                }
            }
        })();
        return () => { cancelled = true; stopCamera(); };
    }, [startCamera, stopCamera]);

    const statusColor: Record<Status, string> = {
        loading:    'text-slate-400',
        ready:      'text-slate-400',
        scanning:   'text-amber-400',
        matched:    'text-emerald-400',
        no_face:    'text-amber-400',
        no_match:   'text-rose-400',
        error:      'text-rose-400',
        load_error: 'text-rose-400',
    };

    const ringColor: Record<Status, string> = {
        loading:    'border-slate-700',
        ready:      'border-white/20',
        scanning:   'border-amber-400',
        matched:    'border-emerald-400',
        no_face:    'border-amber-400',
        no_match:   'border-rose-400',
        error:      'border-rose-400',
        load_error: 'border-rose-400',
    };

    const ovalStroke = status === 'scanning' ? '#fbbf24'
        : status === 'no_match' ? '#f87171'
        : 'white';

    const canScan = status === 'ready' || status === 'no_face' || status === 'no_match';
    const canRetryCamera = status === 'error';
    const canRetryLoad = status === 'load_error';

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/95 p-1 animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-slate-900 rounded-2xl overflow-hidden shadow-xl animate-in zoom-in-95 duration-300 flex flex-col h-[90dvh]">

                {/* Brightness tip — web only */}
                {!isNative && (
                    <div className="flex items-center gap-2 mx-6 mt-4 px-4 py-2 shrink-0 bg-amber-500/10 border border-amber-400/20 rounded-2xl">
                        <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">Turn up your screen brightness for best results</p>
                    </div>
                )}

                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-3 pb-2 shrink-0">
                    <div>
                        <h3 className="text-sm font-bold text-slate-900">Face Time-In</h3>
                        {targetEmployee && <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mt-0.5 truncate">{targetEmployee.name}</p>}
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-0.5">Look at the camera</p>
                    </div>
                    <button onClick={() => { stopCamera(); onClose(); }} className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors">
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
                                <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wide">{matchConfidence}% match</p>
                            </div>
                        )}

                        {/* Loading overlay */}
                        {status === 'loading' && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 bg-slate-900/80">
                                <Loader className="w-7 h-7 text-amber-400 animate-spin shrink-0" />
                                <p className="text-xs font-semibold text-slate-700 text-center">
                                    {dlProgress >= 100 ? 'Setting Up Models' : 'Downloading Face Models'}
                                </p>
                                <div className="w-full space-y-1">
                                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-amber-400 rounded-full transition-all duration-300"
                                            style={{ width: `${dlProgress}%` }}
                                        />
                                    </div>
                                    <p className="text-xs font-black text-amber-400 text-center tabular-nums">
                                        {dlProgress >= 100 ? 'Preparing AI engine…' : `${dlProgress}% — one-time download`}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Status */}
                <div className="px-6 pb-2 text-center shrink-0">
                    <p className={`text-xs font-semibold uppercase tracking-wide ${statusColor[status]} transition-colors`}>{statusMsg}</p>
                    {empDescriptors.length === 0 && status !== 'loading' && (
                        <p className="text-xs font-bold text-slate-600 uppercase tracking-widest mt-1">No employees have face data enrolled yet</p>
                    )}
                </div>

                {/* Scan / Retry button */}
                <div className="px-6 pb-3 shrink-0">
                    {canRetryLoad ? (
                        <button
                            onClick={loadModelsAndStart}
                            className="w-full flex items-center justify-center gap-2 bg-rose-500 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-widest transition-all active:scale-95 hover:bg-rose-600"
                        >
                            <Loader className="w-4 h-4" />
                            Retry Loading
                        </button>
                    ) : canRetryCamera ? (
                        <button
                            onClick={startCamera}
                            className="w-full flex items-center justify-center gap-2 bg-amber-500 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-widest transition-all active:scale-95 hover:bg-amber-600"
                        >
                            <Camera className="w-4 h-4" />
                            Retry Camera
                        </button>
                    ) : (
                        <button
                            onClick={scan}
                            disabled={!canScan}
                            className="w-full flex items-center justify-center gap-2 bg-white text-slate-900 font-black py-4 rounded-2xl text-xs uppercase tracking-widest transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-emerald-500 hover:text-white"
                        >
                            <Camera className="w-4 h-4" />
                            {status === 'scanning' ? 'Scanning...' : 'Scan Face'}
                        </button>
                    )}
                </div>

                {/* Manual override fallback — only shown after 3 failed attempts */}
                {onManualOverride && failedAttempts >= 3 && (
                    <div className="px-6 pb-5 text-center shrink-0">
                        <button
                            onClick={() => { stopCamera(); onClose(); onManualOverride(); }}
                            className="text-xs font-semibold text-slate-400 uppercase tracking-wide hover:text-slate-300 transition-colors"
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
