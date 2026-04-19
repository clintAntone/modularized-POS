
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
            <div className={`p-8 rounded-[36px] shadow-2xl relative overflow-hidden group transition-all duration-700 ${isPinChanged ? 'bg-[#0F172A]' : 'bg-amber-600'}`}>
                <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 blur-[80px] rounded-full translate-x-1/4 -translate-y-1/4"></div>

                <div className="relative z-10 flex flex-col">
                    <div className="flex justify-between items-start mb-8">
                        <div className="space-y-1">
                            <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.3em]">
                                {isPinChanged ? 'SECURED PRIVATE KEY' : 'TEMPORARY SYSTEM KEY'}
                            </p>
                            <div className={`w-1.5 h-1.5 rounded-full ${isPinChanged ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'}`}></div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                <span className={`px-4 py-1.5 rounded-xl text-[9px] font-bold uppercase tracking-widest border border-white/10 text-white whitespace-nowrap leading-none shadow-xl ${isPinChanged ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-700/40 animate-pulse'}`}>
                  {isPinChanged ? 'ENCRYPTED' : 'EXPOSED'}
                </span>
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 bg-white/5 p-4 rounded-[24px] border border-white/10 shadow-inner">
                        <div className="flex-1 overflow-hidden">
                            {isPinChanged && !showPin ? (
                                <div className="flex gap-3 items-center h-10 ml-2">
                                    {[1, 2, 3, 4, 5, 6].map((i) => (
                                        <div key={i} className="w-3 h-3 bg-white/30 rounded-full border border-white/10 shadow-inner"></div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-4xl font-bold tracking-[0.2em] text-white font-mono leading-none drop-shadow-lg truncate ml-2">
                                    {pin}
                                </p>
                            )}
                        </div>

                        {isPinChanged && (
                            <button
                                onClick={() => setShowPin(!showPin)}
                                className="text-white/60 hover:text-white transition-all p-4 rounded-2xl bg-white/10 border border-white/10 hover:bg-white/20 active:scale-95 shrink-0 shadow-lg"
                                title={showPin ? 'Hide Key' : 'Reveal Key'}
                            >
                                {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        )}
                    </div>
                </div>

                {isPinChanged && (
                    <p className="mt-8 text-[10px] font-semibold text-white/30 uppercase tracking-widest italic leading-relaxed border-t border-white/5 pt-5">
                        {showPin ? 'PROVIDE THIS SETUP PIN TO RELIEF MANAGERS.' : 'SECURITY CONTROLLED BY BRANCH MANAGER.'}
                    </p>
                )}
            </div>
        </section>
    );
};
