import React, { useState, useRef } from 'react';
import { Upload, Trash2, CheckCircle, AlertCircle, Loader, ScanFace } from 'lucide-react';
import { extractDescriptorFromFile } from '../../../../lib/face';
import { playSound } from '../../../../lib/audio';

interface FaceEnrollmentProps {
    currentDescriptors: number[][] | undefined;
    onSave: (descriptors: number[][], files: File[]) => void;
    isSaving?: boolean;
}

interface PhotoEntry {
    file: File;
    preview: string;
    descriptor: number[] | null;
    status: 'pending' | 'processing' | 'ok' | 'error';
    error?: string;
}

export const FaceEnrollment: React.FC<FaceEnrollmentProps> = ({ currentDescriptors, onSave, isSaving }) => {
    const [photos, setPhotos] = useState<PhotoEntry[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const hasEnrolled = currentDescriptors && currentDescriptors.length > 0;

    const handleFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        const newEntries: PhotoEntry[] = Array.from(files).slice(0, 5 - photos.length).map(file => ({
            file,
            preview: URL.createObjectURL(file),
            descriptor: null,
            status: 'pending',
        }));
        setPhotos(prev => [...prev, ...newEntries]);

        setIsProcessing(true);
        for (const entry of newEntries) {
            setPhotos(prev => prev.map(p => p.preview === entry.preview ? { ...p, status: 'processing' } : p));
            try {
                const descriptor = await extractDescriptorFromFile(entry.file);
                if (!descriptor) {
                    setPhotos(prev => prev.map(p => p.preview === entry.preview ? { ...p, status: 'error', error: 'No face detected' } : p));
                } else {
                    setPhotos(prev => prev.map(p => p.preview === entry.preview ? { ...p, descriptor: Array.from(descriptor), status: 'ok' } : p));
                }
            } catch {
                setPhotos(prev => prev.map(p => p.preview === entry.preview ? { ...p, status: 'error', error: 'Processing failed' } : p));
            }
        }
        setIsProcessing(false);
    };

    const removePhoto = (preview: string) => {
        setPhotos(prev => prev.filter(p => p.preview !== preview));
    };

    const handleSave = () => {
        const valid = photos.filter(p => p.status === 'ok' && p.descriptor);
        if (valid.length === 0) return;
        playSound('click');
        onSave(valid.map(p => p.descriptor!), valid.map(p => p.file));
    };

    const validCount = photos.filter(p => p.status === 'ok').length;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ScanFace className="w-4 h-4 text-emerald-600" />
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Face ID Enrollment</label>
                </div>
                {hasEnrolled && (
                    <span className="flex items-center gap-1 text-[8px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg uppercase tracking-widest">
                        <CheckCircle className="w-2.5 h-2.5" />
                        {currentDescriptors!.length} photo{currentDescriptors!.length !== 1 ? 's' : ''} enrolled
                    </span>
                )}
            </div>

            {photos.length > 0 && (
                <div className="grid grid-cols-5 gap-2">
                    {photos.map(p => (
                        <div key={p.preview} className="relative aspect-square rounded-xl overflow-hidden border-2 border-slate-100 group">
                            <img src={p.preview} alt="" className="w-full h-full object-cover" />
                            {/* Status overlay */}
                            <div className={`absolute inset-0 flex items-center justify-center transition-all ${
                                p.status === 'processing' ? 'bg-black/40' :
                                p.status === 'ok' ? 'bg-emerald-500/20' :
                                p.status === 'error' ? 'bg-rose-500/30' : ''
                            }`}>
                                {p.status === 'processing' && <Loader className="w-4 h-4 text-white animate-spin" />}
                                {p.status === 'ok' && <CheckCircle className="w-4 h-4 text-emerald-400" />}
                                {p.status === 'error' && <AlertCircle className="w-4 h-4 text-rose-400" />}
                            </div>
                            {/* Remove button */}
                            <button
                                onClick={() => removePhoto(p.preview)}
                                className="absolute top-0.5 right-0.5 w-5 h-5 bg-slate-900/70 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <Trash2 className="w-2.5 h-2.5 text-white" />
                            </button>
                            {p.status === 'error' && p.error && (
                                <div className="absolute bottom-0 inset-x-0 bg-rose-500/80 px-1 py-0.5">
                                    <p className="text-[6px] font-bold text-white text-center truncate">{p.error}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <div className="flex gap-2">
                {photos.length < 5 && (
                    <>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={e => handleFiles(e.target.files)}
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isProcessing}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[9px] font-black text-slate-500 uppercase tracking-widest hover:bg-slate-100 transition-all disabled:opacity-50"
                        >
                            <Upload className="w-3.5 h-3.5" />
                            Upload Photos ({photos.length}/5)
                        </button>
                    </>
                )}
                {validCount > 0 && (
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving || isProcessing}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-500 transition-all disabled:opacity-50 shrink-0"
                    >
                        {isSaving ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                        Save {validCount} Photo{validCount !== 1 ? 's' : ''}
                    </button>
                )}
            </div>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Upload up to 5 clear front-facing photos. Each photo is processed locally — no data leaves your device.</p>
        </div>
    );
};
