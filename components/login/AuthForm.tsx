
import React from 'react';
import { Employee } from '../../types';

interface AuthFormProps {
  username: string;
  setUsername: (val: string) => void;
  pin: string;
  setPin: (val: string) => void;
  confirmPin?: string;
  setConfirmPin?: (val: string) => void;
  isReliefMode: boolean;
  reliefStep?: 'pin' | 'setup';
  isSetupMode: boolean;
  isSetupAccountMode: boolean;
  isAdmin: boolean;
  tempManagerIdentity?: Employee | null;
  reliefEmployee?: Employee | null;
  isAuthenticating: boolean;
  lockoutUntil: number | null;
}

export const AuthForm: React.FC<AuthFormProps> = ({
  username, setUsername, pin, setPin, confirmPin, setConfirmPin, isReliefMode, reliefStep, isSetupMode, isSetupAccountMode, isAdmin, tempManagerIdentity, reliefEmployee, isAuthenticating, lockoutUntil
}) => {
  const showUsername = (!isSetupMode && !isAdmin) && (!isReliefMode || (reliefStep !== 'pin'));
  const usernameLabel = isSetupAccountMode ? 'Full Name (As Registered)' : 'Identity Username';
  const usernamePlaceholder = isSetupAccountMode ? "ENTER YOUR FULL NAME" : "USERNAME";
  
  const pinLabel = isSetupMode || isSetupAccountMode || (isReliefMode && reliefStep === 'pin') ? 'Branch Setup PIN' : (isReliefMode && reliefStep === 'setup') ? 'New Security PIN' : 'Security PIN';

  return (
    <div className="space-y-4">
      {/* RELIEF INFO */}
      {isReliefMode && (reliefEmployee || tempManagerIdentity) && (
        <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-lg">👤</div>
          <div className="text-left">
            <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest leading-none">Relief Manager</p>
            <p className="text-sm font-bold text-indigo-900 uppercase tracking-tight mt-1">{(reliefEmployee || tempManagerIdentity)?.name}</p>
          </div>
        </div>
      )}

      {/* USERNAME FIELD */}
      {showUsername && (
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1">
            {usernameLabel}
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(isSetupAccountMode ? e.target.value : e.target.value.toLowerCase())}
            placeholder={usernamePlaceholder}
            className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 text-xs rounded-xl font-bold uppercase outline-none focus:border-slate-400 focus:bg-white transition-all text-center tracking-widest text-slate-800"
            disabled={isAuthenticating}
            autoFocus
          />
          {isReliefMode && reliefStep === 'setup' && (
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center mt-2">Only letters, numbers, and underscores allowed. No spaces.</p>
          )}
        </div>
      )}

      {/* PIN FIELD */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1">
          {pinLabel}
        </label>
        <input
          type="password"
          maxLength={6}
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="w-full px-4 py-3.5 text-center text-2xl font-black tracking-[0.5em] pl-[0.5em] bg-slate-50 border border-slate-200 rounded-xl focus:border-slate-400 focus:bg-white outline-none transition-all"
          autoComplete="off"
          disabled={isAuthenticating || !!lockoutUntil}
          placeholder="••••••"
        />
      </div>

      {/* CONFIRM PIN FIELD (Relief Setup) */}
      {isReliefMode && reliefStep === 'setup' && setConfirmPin && (
        <div className="space-y-1.5 animate-in slide-in-from-top-2">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest ml-1">
            Confirm New Security PIN
          </label>
          <input 
            type="password" 
            maxLength={6} 
            inputMode="numeric" 
            value={confirmPin} 
            onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))} 
            className="w-full px-4 py-3.5 text-center text-2xl font-black tracking-[0.5em] pl-[0.5em] bg-slate-50 border border-slate-200 rounded-xl focus:border-slate-400 focus:bg-white outline-none transition-all"
            autoComplete="off"
            disabled={isAuthenticating || !!lockoutUntil}
            placeholder="••••••"
          />
        </div>
      )}
    </div>
  );
};
