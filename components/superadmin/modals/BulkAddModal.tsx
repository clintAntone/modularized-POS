import React from 'react';
import { UI_THEME } from '../../../constants/ui_designs';

interface BulkAddModalProps {
  bulkInput: string;
  isSaving: boolean;
  onChangeInput: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export const BulkAddModal: React.FC<BulkAddModalProps> = ({
  bulkInput, isSaving, onChangeInput, onSubmit, onClose,
}) => (
  <div className={UI_THEME.layout.modalWrapper}>
    <form onSubmit={onSubmit} className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-6 sm:p-10 space-y-6 sm:space-y-8 border border-slate-100`}>
      <div className="space-y-2">
        <h3 className={UI_THEME.text.title}>Bulk Branch Registry</h3>
        <p className={UI_THEME.text.metadata}>Enter branch names (one per line)</p>
      </div>
      <div className="space-y-1 sm:space-y-2">
        <label className={UI_THEME.text.label}>Branch List</label>
        <textarea
          autoFocus
          required
          value={bulkInput}
          onChange={e => onChangeInput(e.target.value)}
          placeholder="E.G.&#10;MANDALUYONG CENTRAL&#10;PASIG MAIN&#10;MAKATI SOUTH..."
          rows={8}
          className={`${UI_THEME.styles.inputBase} ${UI_THEME.radius.input} font-bold text-sm sm:text-base uppercase resize-none`}
        />
      </div>
      <div className="flex flex-col gap-3 pt-2 sm:pt-4">
        <button
          type="submit"
          disabled={isSaving || !bulkInput.trim()}
          className={`w-full bg-slate-900 text-white font-black py-4 sm:py-6 ${UI_THEME.radius.pill} ${UI_THEME.text.metadata} shadow-xl hover:bg-emerald-600 ${UI_THEME.styles.buttonBase}`}
        >
          {isSaving
            ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            : 'Register Branches'}
        </button>
        <button type="button" onClick={onClose} className={`w-full py-2 sm:py-4 text-slate-400 ${UI_THEME.text.metadata}`}>
          Cancel
        </button>
      </div>
    </form>
  </div>
);
