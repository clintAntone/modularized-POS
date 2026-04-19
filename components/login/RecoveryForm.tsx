
import React from 'react';

interface RecoveryFormProps {
  recoveryUsername: string;
  setRecoveryUsername: (val: string) => void;
  onReset: () => void;
  onCancel: () => void;
  isAuthenticating: boolean;
  successMsg: string;
}

export const RecoveryForm: React.FC<RecoveryFormProps> = ({
  recoveryUsername, setRecoveryUsername, onReset, onCancel, isAuthenticating, successMsg
}) => {
  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-2 duration-300">
      {successMsg ? (
        <div className="p-8 bg-emerald-50 rounded-[28px] border-2 border-emerald-100 text-center space-y-4 animate-in zoom-in">
          <div className="w-12 h-12 bg-emerald-600 rounded-full flex items-center justify-center text-white mx-auto shadow-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="4"><path d="M5 13l4 4L19 7"/></svg>
          </div>
          <p className="text-sm font-bold text-emerald-800 uppercase tracking-tight">{successMsg}</p>
          <p className="text-[9px] font-semibold text-emerald-600 uppercase tracking-widest">Administrator notified via secure cloud relay.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-emerald-600 uppercase tracking-widest ml-1">Identity Username</label>
            <input 
              type="text" 
              value={recoveryUsername} 
              onChange={(e) => setRecoveryUsername(e.target.value.toLowerCase())} 
              placeholder="YOUR USERNAME" 
              className="w-full p-4 bg-slate-50 border-2 border-transparent text-[11px] rounded-xl font-bold uppercase outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner text-center tracking-widest" 
            />
            <button 
              onClick={onReset} 
              disabled={isAuthenticating || !recoveryUsername.trim()} 
              className="w-full bg-emerald-600 text-white font-bold py-4 rounded-xl uppercase tracking-widest text-[10px] shadow-lg hover:bg-emerald-500 active:scale-95 transition-all mt-4 disabled:opacity-30 flex items-center justify-center gap-3"
            >
              {isAuthenticating ? <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : null}
              Signal Admin for Reset
            </button>
          </div>
          <button onClick={onCancel} className="w-full text-[9px] font-semibold text-slate-400 uppercase tracking-widest py-2">Cancel</button>
        </div>
      )}
    </div>
  );
};
