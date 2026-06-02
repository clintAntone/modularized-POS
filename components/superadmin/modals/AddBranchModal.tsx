import React from 'react';
import { UI_THEME } from '../../../constants/ui_designs';

interface AddBranchModalProps {
  newBranchName: string;
  isSaving: boolean;
  onChangeName: (name: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export const AddBranchModal: React.FC<AddBranchModalProps> = ({
  newBranchName, isSaving, onChangeName, onSubmit, onClose,
}) => (
  <div className={UI_THEME.layout.modalWrapper}>
    <form onSubmit={onSubmit} className={`${UI_THEME.layout.modalLarge} ${UI_THEME.radius.modal} p-6 sm:p-10 space-y-4 sm:space-y-8`}>
      <div className="text-center space-y-1 sm:space-y-2">
        <h3 className={UI_THEME.text.title}>Register Branch</h3>
        <p className={UI_THEME.text.metadata}>Establish New Physical Branch</p>
      </div>
      <div className="space-y-1 sm:space-y-2">
        <label className={UI_THEME.text.label}>Branch Designation (Name)</label>
        <input
          autoFocus
          required
          value={newBranchName}
          onChange={e => onChangeName(e.target.value.toUpperCase())}
          placeholder="E.G. MANDALUYONG CENTRAL..."
          className={`${UI_THEME.styles.inputBase} ${UI_THEME.radius.input} font-black text-sm sm:text-base uppercase`}
        />
      </div>
      <div className="flex flex-col gap-3 pt-2 sm:pt-4">
        <button
          type="submit"
          disabled={isSaving || !newBranchName.trim()}
          className={`w-full bg-slate-900 text-white font-black py-4 sm:py-6 ${UI_THEME.radius.pill} ${UI_THEME.text.metadata} shadow-xl hover:bg-emerald-600 ${UI_THEME.styles.buttonBase}`}
        >
          {isSaving
            ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            : 'Register Branch'}
        </button>
        <button type="button" onClick={onClose} className={`w-full py-2 sm:py-4 text-slate-400 ${UI_THEME.text.metadata}`}>
          Cancel
        </button>
      </div>
    </form>
  </div>
);
