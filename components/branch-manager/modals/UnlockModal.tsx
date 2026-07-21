import React from 'react';
import { Lock } from 'lucide-react';
import { UI_THEME } from '../../../constants/ui_designs';
import { playSound } from '../../../lib/audio';

interface UnlockModalProps {
  unlockPin: string;
  unlockError: string;
  onChangePin: (pin: string) => void;
  onUnlock: () => void;
  onCancel: () => void;
}

export const UnlockModal: React.FC<UnlockModalProps> = ({
  unlockPin, unlockError, onChangePin, onUnlock, onCancel,
}) => (
  <div className={UI_THEME.layout.modalWrapper}>
    <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-8 text-center border border-slate-100 shadow-xl animate-in zoom-in-95`}>
      <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
        <Lock className="w-8 h-8" strokeWidth={3} />
      </div>
      <h4 className="text-xl font-bold text-slate-900 mb-2 uppercase tracking-tight">Unlock Manager Access</h4>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide leading-relaxed mb-6">
        Enter your Manager PIN to restore full access.
      </p>
      <div className="space-y-4">
        <input
          type="password"
          value={unlockPin}
          onChange={e => { onChangePin(e.target.value); }}
          placeholder="ENTER PIN"
          className={`w-full h-16 bg-slate-50 border ${unlockError ? 'border-rose-500' : 'border-slate-200'} rounded-2xl text-center text-2xl font-black tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all`}
          autoFocus
          onKeyDown={e => e.key === 'Enter' && onUnlock()}
        />
        {unlockError && <p className="text-xs font-black text-rose-500 uppercase tracking-widest">{unlockError}</p>}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onUnlock}
            className="bg-slate-900 text-white font-bold py-4 rounded-xl text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all"
          >
            Unlock
          </button>
          <button
            onClick={onCancel}
            className="bg-slate-100 text-slate-500 font-bold py-4 rounded-xl text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
);
