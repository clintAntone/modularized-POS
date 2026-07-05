import React from 'react';
import { Store, Power, ArrowRight } from 'lucide-react';
import { UI_THEME } from '../../../constants/ui_designs';

interface StatusEnforcerModalProps {
  branchCleanName: string;
  isOpening: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}

export const StatusEnforcerModal: React.FC<StatusEnforcerModalProps> = ({
  branchCleanName, isOpening, onOpen, onDismiss,
}) => (
  <div className={UI_THEME.layout.modalWrapper}>
    <div className={`${UI_THEME.layout.modalLarge} ${UI_THEME.radius.modal} overflow-hidden border border-slate-200 shadow-2xl`}>

      {/* Top accent strip */}
      <div className="h-1.5 w-full bg-gradient-to-r from-slate-300 via-slate-400 to-slate-300" />

      <div className="p-8 sm:p-10 text-center space-y-7">

        {/* Status badge */}
        <div className="flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          <span className="text-xs font-black text-rose-500 uppercase tracking-[0.25em]">Branch Offline</span>
        </div>

        {/* Icon */}
        <div className="w-20 h-20 bg-slate-900 rounded-[28px] flex items-center justify-center mx-auto shadow-lg shadow-slate-900/20">
          <Store className="w-9 h-9 text-white" strokeWidth={2} />
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight uppercase leading-tight break-words">
            {branchCleanName}
          </h3>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">
            Has not been opened today
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 pt-1">
          <button
            onClick={onOpen}
            disabled={isOpening}
            className="w-full flex items-center justify-center gap-3 text-white font-black py-5 px-4 rounded-2xl text-xs uppercase tracking-[0.2em] bg-slate-900 hover:bg-slate-700 active:scale-[0.98] transition-all shadow-lg shadow-slate-900/20 disabled:opacity-50"
          >
            {isOpening ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Initializing…
              </>
            ) : (
              <>
                <Power className="w-4 h-4" strokeWidth={2.5} />
                Initialize Daily Opening
                <ArrowRight className="w-4 h-4 ml-auto" strokeWidth={2.5} />
              </>
            )}
          </button>

          <button
            onClick={onDismiss}
            className="w-full text-slate-400 hover:text-slate-600 font-bold py-3 text-xs uppercase tracking-widest transition-colors"
          >
            Proceed without opening
          </button>
        </div>

      </div>
    </div>
  </div>
);
