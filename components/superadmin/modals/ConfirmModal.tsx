import React from 'react';
import { UI_THEME } from '../../../constants/ui_designs';

export interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  variant?: 'danger' | 'success' | 'warning';
  confirmText?: string;
  showCancel?: boolean;
}

interface ConfirmModalProps {
  state: ConfirmState;
  onClose: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({ state, onClose }) => {
  if (!state.isOpen) return null;

  return (
    <div className={UI_THEME.layout.modalWrapper}>
      <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-6 sm:p-10 text-center border border-slate-100`}>
        <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-3xl flex items-center justify-center mx-auto mb-4 sm:mb-8 shadow-xl ${
          state.variant === 'danger' ? 'bg-rose-50 text-rose-500'
          : state.variant === 'warning' ? 'bg-amber-50 text-amber-600'
          : 'bg-emerald-50 text-emerald-600'
        }`}>
          <svg className="w-8 h-8 sm:w-10 sm:h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className={UI_THEME.text.title}>{state.title}</h3>
        <p className={`${UI_THEME.text.metadata} leading-relaxed mb-6 sm:mb-10`}>{state.message}</p>
        <div className="flex flex-col gap-3">
          <button
            onClick={state.onConfirm}
            className={`w-full py-4 sm:py-6 ${UI_THEME.radius.pill} ${UI_THEME.text.metadata} shadow-xl ${UI_THEME.styles.buttonBase} ${
              state.variant === 'danger' ? 'bg-rose-600 hover:bg-rose-500 text-white' : 'bg-slate-900 hover:bg-emerald-600 text-white'
            }`}
          >
            {state.confirmText || 'Confirm Authorization'}
          </button>
          {state.showCancel !== false && (
            <button onClick={onClose} className={`w-full py-2 sm:py-4 text-slate-400 ${UI_THEME.text.metadata}`}>
              Cancel / Go Back
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
