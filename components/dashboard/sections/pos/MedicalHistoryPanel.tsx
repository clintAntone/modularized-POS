import React, { useState, useRef } from 'react';
import { ClipboardList, ChevronDown, ChevronUp } from 'lucide-react';

const MEDICAL_CONDITIONS = [
    'Hypertension / High Blood Pressure',
    'Heart Condition',
    'Diabetes',
    'Pregnancy',
    'Recent Surgery (within 6 months)',
    'Osteoporosis / Bone Disorder',
    'Blood Disorder / Taking Blood Thinners',
    'Asthma / Respiratory Condition',
    'Arthritis / Joint Pain',
    'Back or Neck Injury',
    'Allergy to Oils or Lotions',
];

interface MedicalHistoryPanelProps {
    selected: string[];
    onChange: (selected: string[]) => void;
}

const OTHER_PREFIX = 'Other: ';

export const MedicalHistoryPanel: React.FC<MedicalHistoryPanelProps> = ({ selected, onChange }) => {
    const [open, setOpen] = useState(true);
    const otherInputRef = useRef<HTMLInputElement>(null);
    const [otherText, setOtherText] = useState(() => {
        const existing = selected.find(s => s.startsWith(OTHER_PREFIX));
        return existing ? existing.slice(OTHER_PREFIX.length) : '';
    });

    const toggle = (condition: string) => {
        if (selected.includes(condition)) {
            onChange(selected.filter(c => c !== condition));
        } else {
            onChange([...selected, condition]);
        }
    };

    const otherChecked = selected.some(s => s.startsWith(OTHER_PREFIX));

    const toggleOther = () => {
        if (otherChecked) {
            onChange(selected.filter(s => !s.startsWith(OTHER_PREFIX)));
        } else {
            onChange([...selected, `${OTHER_PREFIX}${otherText.trim()}`]);
            setTimeout(() => otherInputRef.current?.focus(), 0);
        }
    };

    const handleOtherTextChange = (val: string) => {
        setOtherText(val);
        if (otherChecked) {
            onChange([
                ...selected.filter(s => !s.startsWith(OTHER_PREFIX)),
                `${OTHER_PREFIX}${val.trim()}`,
            ]);
        }
    };

    const hasFlags = selected.length > 0;

    return (
        <div className="space-y-2">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                    open
                        ? 'border-slate-400 bg-slate-100 text-slate-700'
                        : 'border-transparent bg-slate-50 text-slate-500 hover:border-slate-200 hover:bg-slate-100'
                }`}
            >
                <div className="flex items-center gap-2.5 min-w-0">
                    <ClipboardList className="w-4 h-4 shrink-0" />
                    <span className="text-xs font-bold uppercase tracking-widest">Medical History</span>
                    {hasFlags && (
                        <span className="bg-slate-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0">
                            {selected.length}
                        </span>
                    )}
                </div>
                {open
                    ? <ChevronUp className="w-4 h-4 shrink-0" />
                    : <ChevronDown className="w-4 h-4 shrink-0" />
                }
            </button>

            {open && (
                <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest leading-relaxed">
                            Check all that apply — manager or client may tick the boxes
                        </p>
                    </div>
                    <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
                        {MEDICAL_CONDITIONS.map(condition => {
                            const checked = selected.includes(condition);
                            return (
                                <label
                                    key={condition}
                                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors select-none ${
                                        checked ? 'bg-slate-50' : 'hover:bg-slate-50'
                                    }`}
                                >
                                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                                        checked ? 'bg-slate-700 border-slate-700' : 'border-slate-300'
                                    }`}>
                                        {checked && (
                                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggle(condition)}
                                        className="sr-only"
                                    />
                                    <span className={`text-xs font-medium leading-snug ${checked ? 'text-slate-800' : 'text-slate-600'}`}>
                                        {condition}
                                    </span>
                                </label>
                            );
                        })}

                        {/* Other */}
                        <div className={`flex items-center gap-3 px-4 py-3 transition-colors ${otherChecked ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                            <button
                                type="button"
                                onClick={toggleOther}
                                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                                    otherChecked ? 'bg-slate-700 border-slate-700' : 'border-slate-300'
                                }`}
                            >
                                {otherChecked && (
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </button>
                            <input
                                ref={otherInputRef}
                                type="text"
                                placeholder="Other — please specify"
                                value={otherText}
                                onFocus={() => { if (!otherChecked) toggleOther(); }}
                                onChange={e => handleOtherTextChange(e.target.value)}

                                className="flex-1 text-xs font-medium text-slate-700 placeholder:text-slate-400 bg-transparent outline-none"
                            />
                        </div>
                    </div>
                    {hasFlags && (
                        <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                {selected.length} condition{selected.length > 1 ? 's' : ''} flagged
                            </p>
                            <button
                                type="button"
                                onClick={() => onChange([])}
                                className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
                            >
                                Clear All
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
