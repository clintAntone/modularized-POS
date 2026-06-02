import React from 'react';
import { AuthState } from '../../../types';

type User = Exclude<AuthState['user'], null>;

interface MyAccountForm {
  username: string;
  confirmUsername: string;
  pin: string;
  confirmPin: string;
}

interface MyAccountModalProps {
  user: User;
  form: MyAccountForm;
  saving: boolean;
  error: string;
  success: boolean;
  onChange: (form: MyAccountForm) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export const MyAccountModal: React.FC<MyAccountModalProps> = ({
  user, form, saving, error, success, onChange, onSubmit, onClose,
}) => (
  <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
    <div className="w-full sm:max-w-sm bg-white rounded-t-[36px] sm:rounded-[36px] shadow-2xl max-h-[92dvh] overflow-y-auto animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">

      <div className="pt-3 flex justify-center sm:hidden">
        <div className="w-10 h-1 bg-slate-200 rounded-full" />
      </div>

      <div className="relative bg-slate-900 px-6 pt-6 pb-8 overflow-hidden">
        <div className="absolute -top-8 -right-8 w-36 h-36 bg-indigo-600/20 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-6 -left-6 w-28 h-28 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center shrink-0 shadow-inner">
              <span className="text-2xl font-black text-white uppercase leading-none">
                {(user.username || '?').charAt(0)}
              </span>
            </div>
            <div>
              <p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.3em]">Portal Access</p>
              <h3 className="text-lg font-black text-white uppercase tracking-tight leading-tight mt-0.5">{user.username}</h3>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Active Session</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-400 hover:text-white transition-all shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      <form onSubmit={onSubmit} className="p-5 space-y-4">

        {/* Username section */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
              <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
            </div>
            <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Username</p>
          </div>
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">New Username</label>
            <input
              type="text"
              value={form.username}
              onChange={e => onChange({ ...form, username: e.target.value.toLowerCase() })}
              placeholder="enter new username"
              autoCapitalize="none"
              className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-slate-900 outline-none focus:border-indigo-400 focus:bg-white transition-all"
            />
          </div>
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Confirm Username</label>
            <div className="relative">
              <input
                type="text"
                value={form.confirmUsername}
                onChange={e => onChange({ ...form, confirmUsername: e.target.value.toLowerCase() })}
                placeholder="repeat username"
                autoCapitalize="none"
                className={`w-full h-11 px-4 pr-10 bg-slate-50 border rounded-2xl font-bold text-sm text-slate-900 outline-none focus:bg-white transition-all ${
                  form.confirmUsername && form.confirmUsername !== form.username
                    ? 'border-rose-300 bg-rose-50/50 focus:border-rose-400'
                    : form.confirmUsername && form.confirmUsername === form.username
                    ? 'border-emerald-300 bg-emerald-50/50 focus:border-emerald-400'
                    : 'border-slate-200 focus:border-indigo-400'
                }`}
              />
              {form.confirmUsername && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {form.confirmUsername === form.username
                    ? <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                    : <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                  }
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100" />

        {/* PIN section */}
        <div className="space-y-1">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                </svg>
              </div>
              <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Security PIN</p>
            </div>
            <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Optional</span>
          </div>
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">New PIN</label>
            <input
              type="password"
              inputMode="numeric"
              value={form.pin}
              onChange={e => onChange({ ...form, pin: e.target.value, confirmPin: '' })}
              placeholder="────────"
              maxLength={8}
              className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-slate-900 outline-none focus:border-emerald-400 focus:bg-white transition-all tracking-[0.4em] text-center"
            />
          </div>
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Confirm PIN</label>
            <div className="relative">
              <input
                type="password"
                inputMode="numeric"
                value={form.confirmPin}
                onChange={e => onChange({ ...form, confirmPin: e.target.value })}
                placeholder="────────"
                maxLength={8}
                disabled={!form.pin}
                className={`w-full h-11 px-4 pr-10 bg-slate-50 border rounded-2xl font-black text-slate-900 outline-none focus:bg-white transition-all tracking-[0.4em] text-center disabled:opacity-30 disabled:cursor-not-allowed ${
                  form.confirmPin && form.confirmPin !== form.pin
                    ? 'border-rose-300 bg-rose-50/50 focus:border-rose-400'
                    : form.confirmPin && form.confirmPin === form.pin
                    ? 'border-emerald-300 bg-emerald-50/50 focus:border-emerald-400'
                    : 'border-slate-200 focus:border-emerald-400'
                }`}
              />
              {form.confirmPin && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {form.confirmPin === form.pin
                    ? <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                    : <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                  }
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2.5 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3">
            <svg className="w-4 h-4 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest">{error}</p>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
            <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
            </svg>
            <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Credentials updated successfully.</p>
          </div>
        )}

        <button
          type="submit"
          disabled={saving || !form.username.trim()}
          className="w-full h-13 py-3.5 bg-slate-900 hover:bg-emerald-600 text-white font-black rounded-2xl text-[11px] uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-slate-900/20"
        >
          {saving
            ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            : <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
                Save Changes
              </>
          }
        </button>
      </form>
    </div>
  </div>
);
