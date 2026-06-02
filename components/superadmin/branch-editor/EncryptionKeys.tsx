
import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface EncryptionKeysProps {
    isPinChanged: boolean;
    pin: string;
}

export const EncryptionKeys: React.FC<EncryptionKeysProps> = ({ isPinChanged, pin }) => {
    const [showPin, setShowPin] = useState(false);

    return (
        <section className="space-y-5 animate-in slide-in-from-bottom-3 duration-500">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.25em] ml-1">Terminal Encryption Keys</h4>
            <div className={`p-6 rounded-[28px] shadow-lg relative overflow-hidden transition-all duration-700 ${isPinChanged ? 'bg-[#0F172A]' : 'bg-amber-600'}`}>
                <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 blur-[80px] rounded-full translate-x-1/4 -translate-y-1/4"></div>

                <div className="relative z-10">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full ${isPinChanged ? 'bg-emerald-400 animate-pulse' : 'bg-white/40'}`}></div>
                            <p className="text-[9px] font-bold text-white/50 uppercase tracking-[0.2em]">
                                {isPinChanged ? 'Secured' : 'Temporary Key'}
                            </p>
                        </div>
                        <span className={`px-3 py-1 rounded-lg text-[8px] font-bold uppercase tracking-widest border border-white/10 ${isPinChanged ? 'text-emerald-400' : 'text-white animate-pulse'}`}>
                            {isPinChanged ? 'Encrypted' : 'Exposed'}
                        </span>
                    </div>

                    <div className="flex items-center gap-3 bg-white/5 p-4 rounded-2xl border border-white/10">
                        <div className="flex-1 overflow-hidden">
                            {isPinChanged && !showPin ? (
                                <div className="flex gap-2 items-center h-8 ml-1">
                                    {[1, 2, 3, 4, 5, 6].map((i) => (
                                        <div key={i} className="w-2.5 h-2.5 bg-white/30 rounded-full"></div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-2xl font-bold tracking-[0.2em] text-white font-mono leading-none ml-1">
                                    {pin || '------'}
                                </p>
                            )}
                        </div>
                        {isPinChanged && (
                            <button
                                onClick={() => setShowPin(v => !v)}
                                className="shrink-0 w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors active:scale-90"
                            >
                                {showPin ? <EyeOff className="w-4 h-4 text-white/60" /> : <Eye className="w-4 h-4 text-white/60" />}
                            </button>
                        )}
                    </div>

                    <p className="mt-4 text-[9px] font-semibold text-white/25 uppercase tracking-widest leading-relaxed">
                        {isPinChanged
                            ? (showPin ? 'Emergency access — hide when done.' : 'Controlled by branch manager.')
                            : 'Distribute this setup PIN to the branch manager.'}
                    </p>
                </div>
            </div>
        </section>
    );
};
