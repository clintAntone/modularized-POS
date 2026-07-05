import React from 'react';
import { Zap } from 'lucide-react';
import { UI_THEME } from '../../../constants/ui_designs';

interface ToggleConfirmModalProps {
  isOpen: boolean;
  isOpening: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ToggleConfirmModal: React.FC<ToggleConfirmModalProps> = ({
  isOpen, isOpening, onConfirm, onCancel,
}) => (
  <div className={UI_THEME.layout.modalWrapper}>
    <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-10 text-center border border-slate-100`}>
      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner ${isOpen ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-500'}`}>
        <Zap className="w-8 h-8" strokeWidth={3} />
      </div>
      <h4 className="text-2xl font-bold text-slate-900 mb-2 uppercase tracking-tighter">
        {isOpen ? 'Close Branch?' : 'Open Branch?'}
      </h4>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide leading-relaxed">
        {isOpen
          ? 'Disabling POS operations for this node. Ensure all staff have clocked out to avoid system auto-logout.'
          : 'Enabling POS operations and shift tracking.'}
      </p>
      <div className="flex flex-col gap-3 mt-10">
        <button
          onClick={onConfirm}
          disabled={isOpening}
          className={`w-full text-white font-bold py-5 rounded-2xl text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3 ${isOpen ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
        >
          {isOpening
            ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            : isOpen ? 'Confirm Closure' : 'Confirm Open'}
        </button>
        <button onClick={onCancel} className="w-full text-slate-400 font-bold py-4 rounded-xl text-xs uppercase tracking-widest">
          Cancel
        </button>
      </div>
    </div>
  </div>
);
