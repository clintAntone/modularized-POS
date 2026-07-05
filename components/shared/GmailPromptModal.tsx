
import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { DB_TABLES } from '../../constants/db_schema';
import { playSound } from '../../lib/audio';
import { Employee } from '../../types';

interface GmailPromptModalProps {
  employee: Employee;
  required?: boolean;
  onSaved: (gmail: string) => void;
  onSkip: () => void;
}

export const GmailPromptModal: React.FC<GmailPromptModalProps> = ({ employee, required = false, onSaved, onSkip }) => {
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleSave = async () => {
    if (!isValidEmail || saving) return;
    setSaving(true);
    setError('');
    try {
      const { error: dbErr } = await supabase
        .from(DB_TABLES.EMPLOYEES)
        .update({ details: { ...(employee.details || {}), gmail: email.trim().toLowerCase() } })
        .eq('id', employee.id);
      if (dbErr) throw dbErr;
      playSound('success');
      onSaved(email.trim().toLowerCase());
    } catch {
      setError('Failed to save. Try again.');
      playSound('warning');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-xl flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-[36px] w-full max-w-sm shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        <div className="p-8 space-y-6">
          {/* Icon */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight leading-none">
                {required ? 'Email Required' : 'Add Your Email'}
              </h3>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-0.5">For account recovery</p>
            </div>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            {required
              ? 'Managers are required to register a Gmail for PIN self-recovery and security verification.'
              : 'Register your Gmail so you can reset your PIN yourself without waiting for an admin.'}
          </p>

          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Gmail Address</label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="yourname@gmail.com"
              autoFocus
              className={`w-full p-4 bg-slate-50 border-2 rounded-xl font-semibold text-sm outline-none transition-all shadow-inner ${
                email && !isValidEmail ? 'border-rose-300 bg-rose-50' :
                isValidEmail ? 'border-emerald-400 bg-emerald-50' :
                'border-transparent focus:border-emerald-500 focus:bg-white'
              }`}
            />
            {error && <p className="text-xs font-black text-rose-600 uppercase tracking-widest ml-1">{error}</p>}
          </div>

          <div className="space-y-2">
            <button
              onClick={handleSave}
              disabled={!isValidEmail || saving}
              className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-xs shadow-lg hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-30 flex items-center justify-center gap-2"
            >
              {saving
                ? <><div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Saving...</>
                : 'Save Email'}
            </button>
            {!required && (
              <button
                onClick={onSkip}
                className="w-full text-xs font-black text-slate-400 uppercase tracking-widest py-3 active:text-slate-600 transition-colors"
              >
                Skip for now
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
