
import React from 'react';

interface ConnectivityControlsProps {
  isEnabled: boolean;
  isManagerUnassigned: boolean;
  isSaving: boolean;
  onToggle: () => void;
  onResetPin: () => void;
  onForceLogout: () => void;
  onDelete: () => void;
}

export const ConnectivityControls: React.FC<ConnectivityControlsProps> = ({
  isEnabled, isManagerUnassigned, isSaving, onToggle, onResetPin, onForceLogout, onDelete
}) => {
  return (
    <section className="space-y-4 pt-6 border-t border-slate-100 animate-in fade-in duration-700">
      <h4 className="text-[10px] font-bold text-rose-400 uppercase tracking-[0.25em] ml-1">Master Access Connectivity</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
         <button 
           disabled={isSaving || (!isEnabled && isManagerUnassigned)}
           onClick={onToggle} 
           className={`w-full py-5 rounded-2xl text-[10px] font-bold uppercase tracking-widest border-2 transition-all shadow-sm active:scale-95 ${isEnabled ? 'border-amber-100 text-amber-600 bg-amber-50/50 hover:bg-amber-100' : 'border-emerald-100 text-emerald-600 bg-emerald-50/50 hover:bg-emerald-100'} ${(!isEnabled && isManagerUnassigned) ? 'opacity-40 grayscale cursor-not-allowed border-dashed' : ''}`}
         >
           {isEnabled ? '🔒 SUSPEND ACCESS' : '🔓 RESTORE ACCESS'}
         </button>
         <button 
           disabled={isSaving}
           onClick={onForceLogout} 
           className="w-full py-5 rounded-2xl text-[10px] font-bold uppercase tracking-widest bg-rose-600 text-white border border-rose-700 hover:bg-rose-700 active:scale-95 transition-all shadow-lg"
         >
           📡 FORCE LOGOUT ALL
         </button>
         <button 
           disabled={isSaving}
           onClick={onResetPin} 
           className="w-full py-5 rounded-2xl text-[10px] font-bold uppercase tracking-widest bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 active:scale-95 transition-all shadow-sm"
         >
           🔄 RESET PIN
         </button>
         <button 
           disabled={isSaving}
           onClick={onDelete} 
           className="w-full py-5 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-rose-600 bg-rose-50 border border-rose-100 hover:bg-rose-100 active:scale-95 transition-all shadow-sm"
         >
           🗑️ DELETE
         </button>
      </div>
    </section>
  );
};
