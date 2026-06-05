
import React from 'react';
import { ShieldOff, ShieldCheck, LogOut, KeyRound, Trash2 } from 'lucide-react';

interface ConnectivityControlsProps {
  isEnabled: boolean;
  isManagerUnassigned: boolean;
  isSaving: boolean;
  onToggle: () => void;
  onResetPin: () => void;
  onForceLogout: () => void;
  onDelete: () => void;
  isReadOnly?: boolean;
}

export const ConnectivityControls: React.FC<ConnectivityControlsProps> = ({
  isEnabled, isManagerUnassigned, isSaving, onToggle, onResetPin, onForceLogout, onDelete, isReadOnly
}) => {
  if (isReadOnly) return null;

  return (
    <section className="space-y-3 pt-6 border-t border-slate-100">
      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.25em] ml-1">Branch Controls</h4>
      <div className="grid grid-cols-2 gap-2">
        <button
          disabled={isSaving}
          onClick={onToggle}
          className={`flex items-center justify-center gap-2 h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
            isEnabled
              ? 'bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100'
              : 'bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100'
          }`}
        >
          {isEnabled ? <ShieldOff className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          {isEnabled ? 'Suspend' : 'Restore'}
        </button>
        <button
          disabled={isSaving}
          onClick={onForceLogout}
          className="flex items-center justify-center gap-2 h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-rose-600 text-white hover:bg-rose-700 active:scale-95 transition-all"
        >
          <LogOut className="w-3.5 h-3.5" />
          Logout
        </button>
        <button
          disabled={isSaving}
          onClick={onResetPin}
          className="flex items-center justify-center gap-2 h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 active:scale-95 transition-all"
        >
          <KeyRound className="w-3.5 h-3.5" />
          Reset PIN
        </button>
        <button
          disabled={isSaving}
          onClick={onDelete}
          className="flex items-center justify-center gap-2 h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest text-rose-500 bg-rose-50 border border-rose-100 hover:bg-rose-100 active:scale-95 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </button>
      </div>
    </section>
  );
};
