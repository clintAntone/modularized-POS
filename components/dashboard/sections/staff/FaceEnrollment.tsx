import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, CheckCircle, Loader, ScanFace, RotateCcw, AlertCircle } from 'lucide-react';
import { extractDescriptorFromFile, loadFaceModels, preloadFaceModels } from '../../../../lib/face';
import { playSound } from '../../../../lib/audio';

const STEPS = [
    { id: 'close', label: 'Close Up',   instruction: 'Move closer — face fills the frame',  hint: 'Fine detail capture' },
    { id: 'far',   label: 'Step Back',  instruction: 'Back up a little — shoulders visible', hint: 'Full head shape' },
] as const;

type StepId = typeof STEPS[number]['id'];
type Phase = 'intro' | 'capture' | 'review';

interface CapturedShot {
    stepId: StepId;
    file: File;
    preview: string;
    descriptor: number[] | null;
    status: 'processing' | 'ok' | 'error';
    error?: string;
}

interface FaceEnrollmentProps {
    currentDescriptors: number[][] | undefined;
    onSave: (descriptors: number[][], files: File[]) => void;
    isSaving?: boolean;
}

function EnrollSilhouette({ stepId, stroke }: { stepId: StepId; stroke: string }) {
    const f = "url(#eg)";
    const defs = (
        <defs>
            <filter id="eg">
                <feGaussianBlur stdDeviation="2.5" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
        </defs>
    );
    const oval = (s: string, transform?: string) => (
        <path
            d="M100 8 C148 8 182 48 182 105 C182 158 162 200 135 214 C122 221 111 225 100 225 C89 225 78 221 65 214 C38 200 18 158 18 105 C18 48 52 8 100 8 Z"
            stroke={s} strokeWidth="3" strokeDasharray="10 6" strokeLinecap="round"
            opacity="0.65" filter={f} transform={transform}
        />
    );
    const earL  = <path d="M18 130 C8 122 2 136 2 150 C2 164 8 174 18 170"   stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" filter={f} />;
    const earR  = <path d="M182 130 C192 122 198 136 198 150 C198 164 192 174 182 170" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" filter={f} />;
    const neck  = <path d="M82 222 L82 248 Q100 256 118 248 L118 222" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.3" />;
    const shldr = <path d="M4 290 Q40 258 82 252 Q100 258 118 252 Q160 258 196 290" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.15" />;

    if (stepId === 'close') {
        // Zoomed in — large face fills the frame
        return (
            <svg viewBox="28 10 144 228" className="w-[88%] h-[90%]" fill="none">
                {defs}{earL}{earR}{oval(stroke)}{neck}
            </svg>
        );
    }

    if (stepId === 'far') {
        // Zoomed out — small face, full shoulders visible
        return (
            <svg viewBox="-30 -25 260 365" className="w-[88%] h-[92%]" fill="none">
                {defs}{earL}{earR}{oval(stroke)}{neck}{shldr}
            </svg>
        );
    }

    // fallback
    return null;
}

async function captureFromVideo(video: HTMLVideoElement): Promise<File> {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (!blob) { reject(new Error('Capture failed')); return; }
            resolve(new File([blob], `face-${Date.now()}.jpg`, { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.92);
    });
}

export const FaceEnrollment: React.FC<FaceEnrollmentProps> = ({ currentDescriptors, onSave, isSaving }) => {
    const [phase, setPhase]               = useState<Phase>('intro');
    const [stepIdx, setStepIdx]           = useState(0);
    const [shots, setShots]               = useState<CapturedShot[]>([]);
    const [capturing, setCapturing]       = useState(false);
    const [cameraReady, setCameraReady]   = useState(false);
    const [cameraError, setCameraError]   = useState('');
    const [loading, setLoading]           = useState(false);
    const [dlProgress, setDlProgress]     = useState(0); // 0-100

    const videoRef      = useRef<HTMLVideoElement>(null);
    const streamRef     = useRef<MediaStream | null>(null);
    const fromRetakeRef = useRef(false); // true when we entered capture via retakeSingle

    const hasEnrolled  = currentDescriptors && currentDescriptors.length > 0;
    const currentStep  = STEPS[stepIdx] ?? STEPS[0]; // guard against out-of-bounds during transition
    const currentShot  = shots.find(s => s.stepId === currentStep?.id);
    const validCount   = shots.filter(s => s.status === 'ok').length;

    const stopCamera = useCallback(() => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setCameraReady(false);
    }, []);

    const startCamera = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }
            setCameraReady(true);
        } catch {
            setCameraError('Camera access denied. Please allow camera access and try again.');
        }
    }, []);

    const handleStart = useCallback(async () => {
        setPhase('capture');
        setStepIdx(0);
        setShots([]);
        setCameraError('');
        setLoading(true);
        setDlProgress(0);
        const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 45_000)
        );
        try {
            await Promise.race([
                (async () => {
                    await preloadFaceModels((loaded, total) => {
                        setDlProgress(Math.round((loaded / total) * 100));
                    });
                    await loadFaceModels();
                })(),
                timeout,
            ]);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setCameraError(`Failed to load face models: ${msg}`);
            setLoading(false);
            return;
        }
        setLoading(false);
        await startCamera();
    }, [startCamera]);

    const handleCapture = useCallback(async () => {
        if (!videoRef.current || capturing) return;
        setCapturing(true);
        playSound('click');

        const stepId = currentStep.id;
        try {
            const file    = await captureFromVideo(videoRef.current);
            const preview = URL.createObjectURL(file);
            const shot: CapturedShot = { stepId, file, preview, descriptor: null, status: 'processing' };

            setShots(prev => [...prev.filter(s => s.stepId !== stepId), shot]);

            const descriptor = await extractDescriptorFromFile(file);
            if (!descriptor) {
                setShots(prev => prev.map(s => s.stepId === stepId ? { ...s, status: 'error', error: 'No face detected — try again' } : s));
            } else {
                playSound('success');
                setShots(prev => prev.map(s => s.stepId === stepId ? { ...s, descriptor: Array.from(descriptor), status: 'ok' as const } : s));
                // setTimeout is outside setState to avoid double-fire in React Strict Mode
                setTimeout(() => {
                    if (fromRetakeRef.current) {
                        // came from retakeSingle — go straight back to review
                        fromRetakeRef.current = false;
                        stopCamera();
                        setPhase('review');
                    } else if (stepIdx < STEPS.length - 1) {
                        setStepIdx(i => i + 1);
                    } else {
                        stopCamera();
                        setPhase('review');
                    }
                }, 900);
            }
        } catch {
            setShots(prev => prev.map(s => s.stepId === stepId ? { ...s, status: 'error', error: 'Capture failed — try again' } : s));
        }

        setCapturing(false);
    }, [capturing, currentStep, stepIdx, stopCamera]);

    const retakeShot = useCallback(() => {
        setShots(prev => prev.filter(s => s.stepId !== currentStep.id));
    }, [currentStep]);

    const retakeSingle = useCallback(async (stepId: StepId) => {
        const idx = STEPS.findIndex(s => s.id === stepId);
        fromRetakeRef.current = true;
        setShots(prev => prev.filter(s => s.stepId !== stepId));
        setStepIdx(idx);
        setPhase('capture');
        setCameraError('');
        await startCamera();
    }, [startCamera]);

    const handleSave = useCallback(() => {
        const valid = shots.filter(s => s.status === 'ok' && s.descriptor);
        if (valid.length === 0) return;
        onSave(valid.map(s => s.descriptor!), valid.map(s => s.file));
    }, [shots, onSave]);

    const resetAll = useCallback(() => {
        stopCamera();
        fromRetakeRef.current = false;
        setPhase('intro');
        setStepIdx(0);
        setShots([]);
        setCapturing(false);
        setCameraReady(false);
        setCameraError('');
        setLoading(false);
    }, [stopCamera]);

    useEffect(() => () => { stopCamera(); }, [stopCamera]);

    /* ── INTRO ─────────────────────────────────────────────────── */
    if (phase === 'intro') {
        return (
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <ScanFace className="w-4 h-4 text-emerald-600" />
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Face ID Enrollment</label>
                    {hasEnrolled && (
                        <span className="ml-auto flex items-center gap-1 text-[8px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg uppercase tracking-widest">
                            <CheckCircle className="w-2.5 h-2.5" />
                            {currentDescriptors!.length} shots enrolled
                        </span>
                    )}
                </div>

                {/* Checklist */}
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 space-y-2">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Before you start</p>
                    {[
                        { icon: '🕶️', text: 'Remove sunglasses or tinted lenses' },
                        { icon: '🧢', text: 'Remove cap, hat, or hood' },
                        { icon: '💡', text: 'Stand in good, even lighting' },
                        { icon: '📷', text: 'Keep the camera steady — no blur' },
                    ].map(g => (
                        <div key={g.text} className="flex items-center gap-2.5">
                            <span className="text-base leading-none">{g.icon}</span>
                            <p className="text-[9px] font-bold text-slate-600">{g.text}</p>
                        </div>
                    ))}
                </div>

                {/* Steps preview */}
                <div className="flex gap-1.5">
                    {STEPS.map(s => (
                        <div key={s.id} className="flex-1 bg-slate-100 rounded-xl py-2 px-1 text-center">
                            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-tight">{s.label}</p>
                        </div>
                    ))}
                </div>

                <button
                    type="button"
                    onClick={handleStart}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 transition-all active:scale-95"
                >
                    <Camera className="w-4 h-4" />
                    {hasEnrolled ? 'Re-enroll Face ID' : 'Start Enrollment'}
                </button>
            </div>
        );
    }

    /* ── CAPTURE ───────────────────────────────────────────────── */
    if (phase === 'capture') {
        const isProcessing = capturing || currentShot?.status === 'processing';
        const isOk         = currentShot?.status === 'ok';
        const isError      = currentShot?.status === 'error';
        const canCapture   = cameraReady && !isProcessing && !isOk;

        return (
            <div className="space-y-2">
                {/* Progress bar */}
                <div className="flex gap-1.5">
                    {STEPS.map((s, i) => {
                        const shot = shots.find(sh => sh.stepId === s.id);
                        return (
                            <div
                                key={s.id}
                                className={`flex-1 h-1 rounded-full transition-all duration-300 ${
                                    shot?.status === 'ok' ? 'bg-emerald-500' :
                                    i === stepIdx        ? 'bg-amber-400' : 'bg-slate-200'
                                }`}
                            />
                        );
                    })}
                </div>

                {/* Step label */}
                <div className="text-center">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Step {stepIdx + 1} of {STEPS.length}</p>
                    <p className="text-[13px] font-black text-slate-900 uppercase tracking-tight leading-tight">{currentStep.label}</p>
                    <p className="text-[9px] font-bold text-slate-500 mt-0.5">{currentStep.instruction}</p>
                </div>

                {/* Camera */}
                <div className="relative rounded-2xl overflow-hidden bg-slate-800 aspect-[4/3]">
                    <video ref={videoRef} muted playsInline className="w-full h-full object-cover scale-x-[-1]" />

                    {/* Loading models */}
                    {loading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/90 px-6">
                            <Loader className="w-7 h-7 text-amber-400 animate-spin shrink-0" />
                            <div className="text-center space-y-1">
                                <p className="text-[11px] font-black text-white uppercase tracking-widest">
                                    {dlProgress >= 100 ? 'Setting Up Models' : 'Downloading Face Models'}
                                </p>
                                <p className="text-[9px] font-bold text-slate-400">
                                    {dlProgress >= 100 ? 'Preparing AI engine, please wait…' : 'One-time download (~7MB)'}
                                </p>
                            </div>
                            {/* Progress bar */}
                            <div className="w-full max-w-[180px] space-y-1">
                                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-300 ${dlProgress >= 100 ? 'bg-amber-400 animate-pulse w-full' : 'bg-amber-400'}`}
                                        style={{ width: dlProgress >= 100 ? '100%' : `${dlProgress}%` }}
                                    />
                                </div>
                                <p className="text-[9px] font-black text-amber-400 text-center tabular-nums">
                                    {dlProgress >= 100 ? 'Almost ready…' : `${dlProgress}% downloaded`}
                                </p>
                            </div>
                            <p className="text-[8px] text-slate-500 font-bold tracking-widest uppercase text-center">
                                Next time will be instant
                            </p>
                        </div>
                    )}

                    {/* Camera error */}
                    {cameraError && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 bg-slate-900/90">
                            <AlertCircle className="w-6 h-6 text-rose-400" />
                            <p className="text-[9px] font-bold text-rose-400 text-center">{cameraError}</p>
                        </div>
                    )}

                    {/* Face silhouette guide — shape changes per step */}
                    {!isOk && !isError && cameraReady && (
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                            <EnrollSilhouette stepId={currentStep.id} stroke={isProcessing ? '#fbbf24' : 'white'} />
                        </div>
                    )}

                    {/* Processing flash */}
                    {isProcessing && <div className="absolute inset-0 bg-white/20" />}

                    {/* Success overlay */}
                    {isOk && (
                        <div className="absolute inset-0 bg-emerald-500/25 flex items-center justify-center animate-in fade-in duration-200">
                            <CheckCircle className="w-14 h-14 text-emerald-400" strokeWidth={1.5} />
                        </div>
                    )}

                    {/* Error overlay */}
                    {isError && (
                        <div className="absolute inset-0 bg-rose-500/25 flex flex-col items-center justify-center gap-1.5">
                            <AlertCircle className="w-10 h-10 text-rose-400" strokeWidth={1.5} />
                            <p className="text-[9px] font-bold text-rose-300">{currentShot?.error}</p>
                        </div>
                    )}
                </div>

                {/* Shot thumbnails */}
                <div className="flex gap-1.5">
                    {STEPS.map(s => {
                        const shot = shots.find(sh => sh.stepId === s.id);
                        return (
                            <div key={s.id} className="flex-1 space-y-1">
                                <div className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                                    shot?.status === 'ok'    ? 'border-emerald-400' :
                                    shot?.status === 'error' ? 'border-rose-400' :
                                    s.id === currentStep.id  ? 'border-amber-400' : 'border-dashed border-slate-200'
                                }`}>
                                    {shot
                                        ? <img src={shot.preview} className="w-full h-full object-cover scale-x-[-1]" alt="" />
                                        : <div className="w-full h-full bg-slate-100" />
                                    }
                                </div>
                                <p className="text-[6px] font-black text-slate-400 uppercase tracking-widest text-center truncate">{s.label}</p>
                            </div>
                        );
                    })}
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                    {isError && (
                        <button
                            type="button"
                            onClick={retakeShot}
                            className="flex items-center gap-1.5 px-3 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Retake
                        </button>
                    )}
                    {!isOk && (
                        <button
                            type="button"
                            onClick={handleCapture}
                            disabled={!canCapture}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all active:scale-95 disabled:opacity-40"
                        >
                            {isProcessing
                                ? <><Loader className="w-4 h-4 animate-spin" /> Processing...</>
                                : <><Camera className="w-4 h-4" /> Capture</>}
                        </button>
                    )}
                    {isOk && (
                        <div className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-50 rounded-xl text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                            <CheckCircle className="w-4 h-4" />
                            {stepIdx < STEPS.length - 1 ? 'Next shot coming...' : 'All done — reviewing...'}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    /* ── REVIEW ────────────────────────────────────────────────── */
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <ScanFace className="w-4 h-4 text-emerald-600" />
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Review Captures</label>
                <span className="ml-auto text-[9px] font-black text-emerald-600 uppercase tracking-widest">{validCount}/{STEPS.length} valid</span>
            </div>

            <div className="grid grid-cols-4 gap-2">
                {STEPS.map(s => {
                    const shot = shots.find(sh => sh.stepId === s.id);
                    return (
                        <div key={s.id} className="space-y-1">
                            <div className={`relative aspect-square rounded-xl overflow-hidden border-2 group ${
                                shot?.status === 'ok' ? 'border-emerald-400' : 'border-rose-300'
                            }`}>
                                {shot && <img src={shot.preview} className="w-full h-full object-cover scale-x-[-1]" alt="" />}
                                <div className="absolute top-0.5 right-0.5">
                                    {shot?.status === 'ok'
                                        ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 drop-shadow" />
                                        : <AlertCircle className="w-3.5 h-3.5 text-rose-400 drop-shadow" />}
                                </div>
                                {/* Retake overlay */}
                                <button
                                    type="button"
                                    onClick={() => retakeSingle(s.id)}
                                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-0.5 transition-opacity"
                                >
                                    <RotateCcw className="w-4 h-4 text-white" />
                                    <span className="text-[7px] font-black text-white uppercase tracking-widest">Retake</span>
                                </button>
                            </div>
                            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest text-center">{s.label}</p>
                        </div>
                    );
                })}
            </div>

            {validCount < STEPS.length && (
                <p className="text-[8px] font-bold text-amber-500 uppercase tracking-widest text-center">
                    {STEPS.length - validCount} shot{STEPS.length - validCount !== 1 ? 's' : ''} failed — you can still save the valid ones
                </p>
            )}

            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={resetAll}
                    className="flex items-center gap-1.5 px-3 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Redo All
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving || validCount === 0}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 transition-all active:scale-95 disabled:opacity-40"
                >
                    {isSaving
                        ? <><Loader className="w-4 h-4 animate-spin" /> Saving...</>
                        : <><CheckCircle className="w-4 h-4" /> Save {validCount} Shot{validCount !== 1 ? 's' : ''}</>}
                </button>
            </div>
        </div>
    );
};
