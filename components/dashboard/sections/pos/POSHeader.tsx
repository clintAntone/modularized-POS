
import React from 'react';
import { playSound } from '../../../../lib/audio';
import { POSMode } from '../POSSection';

interface POSHeaderProps {
    mode: POSMode;
    setMode: (mode: POSMode) => void;
}

export const POSHeader: React.FC<POSHeaderProps> = ({ mode, setMode }) => {
    return (
        <div className="flex justify-center mb-6">
            <div className="bg-slate-100 p-1 rounded-2xl flex items-center w-full max-w-xs">
                <button
                    onClick={() => { setMode('CREATE'); playSound('click'); }}
                    className={`flex-1 min-h-[44px] py-2.5 px-5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                        mode !== 'CORRECTIONS'
                            ? 'bg-white text-slate-800 shadow-sm'
                            : 'text-slate-400 hover:text-slate-600'
                    }`}
                >
                    Registry
                </button>
                <button
                    onClick={() => { setMode('CORRECTIONS'); playSound('click'); }}
                    className={`flex-1 min-h-[44px] py-2.5 px-5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                        mode === 'CORRECTIONS'
                            ? 'bg-white text-slate-800 shadow-sm'
                            : 'text-slate-400 hover:text-slate-600'
                    }`}
                >
                    Corrections
                </button>
            </div>
        </div>
    );
};
