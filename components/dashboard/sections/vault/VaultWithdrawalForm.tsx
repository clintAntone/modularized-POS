
import React, { useRef, useState } from 'react';

interface VaultWithdrawalFormProps {
  formData: { name: string, amount: number };
  setFormData: (data: any) => void;
  file: File | null;
  setFile: (file: File | null) => void;
  isUploading: boolean;
  uploadProgress: number;
  onSubmit: (e: React.FormEvent) => void;
  isClosedMode: boolean;
  balance: number;
}

const COMMON_BILLS = ['RENT PAYMENT', 'ELECTRICITY', 'WATER', 'INTERNET', 'WIFI', 'BOOSTING'];

export const VaultWithdrawalForm: React.FC<VaultWithdrawalFormProps> = ({
  formData, setFormData, file, setFile, isUploading, uploadProgress, onSubmit, isClosedMode, balance
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const isOverBalance = formData.amount > balance;
  const canSubmit = formData.name.trim() !== '' && formData.amount > 0 && !isOverBalance && file !== null;

  return (
      <div className={`space-y-4 ${isClosedMode ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
        <div className="bg-slate-900 rounded-2xl p-1 shadow-xl border border-slate-800">
          <form onSubmit={onSubmit} className="bg-white p-6 sm:p-8 rounded-2xl space-y-6">

            {/* 1. AMOUNT */}
            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">1. Settlement Amount</label>
                {isOverBalance && <span className="text-xs font-bold text-rose-500 uppercase tracking-widest animate-pulse">⚠️ Insufficient Vault Balance</span>}
              </div>
              <div className="relative group">
                <span className={`absolute left-5 top-1/2 -translate-y-1/2 text-xl font-bold transition-colors ${isOverBalance ? 'text-rose-500' : 'text-slate-200 group-focus-within:text-rose-600'}`}>₱</span>
                <input
                    required
                    type="number"
                    inputMode="decimal"
                    value={formData.amount || ''}
                    onChange={e => setFormData({...formData, amount: Number(e.target.value)})}
                    className={`w-full p-4 pl-12 bg-slate-50 border-2 rounded-xl font-bold text-2xl outline-none transition-all shadow-inner tabular-nums ${isOverBalance ? 'border-rose-200 text-rose-700 bg-rose-50' : 'border-transparent focus:border-rose-500 focus:bg-white'}`}
                    placeholder="0"
                />
              </div>
            </div>

            {/* 2. RECIPIENT / PURPOSE */}
            <div className="space-y-3">
              <div className="flex justify-between items-center ml-1">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">2. Bill Category / Payee</label>
              </div>

              <div className="relative group">
                <input
                    required
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value.toUpperCase()})}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    className="w-full p-4 bg-slate-50 border-2 border-transparent rounded-[18px] font-bold text-sm uppercase outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner placeholder:text-slate-200"
                    placeholder="SPECIFY PAYEE OR REASON..."
                />
                {formData.name && (
                  <button 
                    type="button"
                    onClick={() => setFormData({...formData, name: ''})}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-slate-300 hover:text-rose-500 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}

                {/* Suggestions Dropdown */}
                {showSuggestions && (
                  <div className="absolute z-10 left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-2 grid grid-cols-2 gap-1">
                      {COMMON_BILLS.map(bill => (
                        <button
                          key={bill}
                          type="button"
                          onClick={() => {
                            setFormData({...formData, name: bill});
                            setShowSuggestions(false);
                          }}
                          className="px-4 py-3 text-left rounded-xl hover:bg-slate-50 transition-colors group"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider group-hover:text-emerald-600">{bill}</span>
                            <svg className="w-3 h-3 text-slate-200 group-hover:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 3. VERIFICATION */}
            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">3. Receipt Evidence <span className="text-rose-500 font-black">(Required)</span></label>
                {file && (
                    <span className="text-[6px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                  Proof Attached
                </span>
                )}
              </div>

              {file ? (
                  <div className="w-full p-3 rounded-2xl border-2 border-emerald-500 bg-emerald-50 flex items-center justify-between gap-3 animate-in fade-in zoom-in-95 duration-300">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-white shadow-xl border-2 border-white rotate-2 transition-transform hover:rotate-0">
                        <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" alt="Receipt" />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-bold uppercase tracking-tight text-emerald-900">Evidence Indexed</p>
                        <p className="text-xs font-semibold text-emerald-600/60 uppercase tracking-widest">Ready for authorization</p>
                      </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                          setFile(null);
                          if (fileRef.current) fileRef.current.value = '';
                        }}
                        className="p-2 text-rose-500 hover:bg-rose-100 rounded-full transition-colors"
                        title="Remove image"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
              ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={() => {
                          if (fileRef.current) {
                            fileRef.current.setAttribute('capture', 'environment');
                            fileRef.current.click();
                          }
                        }}
                        className="flex flex-col items-center justify-center gap-2 py-4 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl hover:border-emerald-400 hover:bg-emerald-50/30 transition-all group"
                    >
                      <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center shadow-md border border-slate-100 text-slate-400 group-hover:text-emerald-500 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812-1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <circle cx="12" cy="13" r="3" />
                        </svg>
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 group-hover:text-emerald-700">Take Photo</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                          if (fileRef.current) {
                            fileRef.current.removeAttribute('capture');
                            fileRef.current.click();
                          }
                        }}
                        className="flex flex-col items-center justify-center gap-2 py-4 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl hover:border-indigo-400 hover:bg-indigo-50/30 transition-all group"
                    >
                      <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center shadow-md border border-slate-100 text-slate-400 group-hover:text-indigo-500 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 group-hover:text-indigo-700">Upload Image</span>
                    </button>
                  </div>
              )}
              <input type="file" ref={fileRef} className="hidden" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} />
            </div>

            <div className="pt-2">
              <button
                  type="submit"
                  disabled={isUploading || !canSubmit}
                  className={`w-full font-bold py-5 rounded-xl uppercase tracking-wide text-xs shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-3 ${canSubmit ? 'bg-slate-900 text-white hover:bg-rose-600' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
              >
                {isUploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                      <span>Syncing {uploadProgress}%</span>
                    </>
                ) : (
                    <span>Authorize Settlement</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
  );
};
