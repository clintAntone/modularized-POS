
import React from 'react';
import { playSound } from '../../../../lib/audio';
import { POSMode } from '../POSSection';

interface POSHeaderProps {
    mode: POSMode;
    setMode: (mode: POSMode) => void;
}

export const POSHeader: React.FC<POSHeaderProps> = ({ mode, setMode }) => {
    return (
        <div className="flex justify-center mb-4">
            <div className="bg-slate-100 p-1.5 rounded-[22px] flex items-center shadow-inner border border-slate-200/50 w-full max-w-sm">
                <button 
                    onClick={() => { setMode('CREATE'); playSound('click'); }}
                    className={`flex-1 py-3 px-4 rounded-[18px] text-[10px] font-bold uppercase tracking-widest transition-all duration-300 ${mode !== 'CORRECTIONS' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    Registry
                </button>
                <button 
                    onClick={() => { setMode('CORRECTIONS'); playSound('click'); }}
                    className={`flex-1 py-3 px-4 rounded-[18px] text-[10px] font-bold uppercase tracking-widest transition-all duration-300 ${mode === 'CORRECTIONS' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    Corrections
                </button>
            </div>
        </div>
    );
};
