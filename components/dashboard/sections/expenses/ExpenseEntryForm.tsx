
import React, { useRef, useState } from 'react';
import { Check, X, Camera, Upload } from 'lucide-react';

interface ExpenseEntryFormProps {
  formData: { name: string, amount: number, category: string };
  setFormData: (data: any) => void;
  file: File | null;
  setFile: (file: File | null) => void;
  isUploading: boolean;
  uploadProgress: number;
  isEditing: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  isClosedMode: boolean;
  existingImage?: string;
  fixedCategory?: string;
}

const COMMON_EXPENSES = [
  'WATER BILL',
  'ELECTRICITY',
  'INTERNET / WIFI',
  'LAUNDRY',
  'CLEANING SUPPLIES',
  'REPAIR & MAINTENANCE',
  'TRANSPORTATION',
  'MEALS / ALLOWANCE',
  'OFFICE SUPPLIES',
  'MARKETING / BOOSTING'
];

export const ExpenseEntryForm: React.FC<ExpenseEntryFormProps> = ({
                                                                    formData,
                                                                    setFormData,
                                                                    file,
                                                                    setFile,
                                                                    isUploading,
                                                                    uploadProgress,
                                                                    isEditing,
                                                                    onSubmit,
                                                                    onCancel,
                                                                    isClosedMode,
                                                                    existingImage,
                                                                    fixedCategory
                                                                  }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const isFormValid = formData.name.trim() !== '' && formData.amount > 0;

  return (
      <div className={`space-y-4 sm:space-y-6 ${isClosedMode ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
        {/* TERMINAL SHELL */}
        <div className="bg-slate-900 rounded-2xl sm:rounded-3xl p-[4px] sm:p-[6px] shadow-xl border border-slate-800">
          <form
              onSubmit={onSubmit}
              className="bg-white p-5 sm:p-10 rounded-2xl sm:rounded-[30px] space-y-6 sm:space-y-10"
          >

            {/* ===================== */}
            {/* 0. CATEGORY SELECTOR */}
            {/* ===================== */}
            {!fixedCategory && (
              <div className="flex p-1.5 bg-slate-100 rounded-[22px] gap-1">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, category: 'OPERATIONAL', name: formData.name === 'RENT & BILLS PROVISION' ? '' : formData.name })}
                  className={`flex-1 py-3 rounded-[18px] text-xs font-semibold uppercase tracking-wide transition-all ${formData.category === 'OPERATIONAL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Daily Expense
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, category: 'PROVISION', name: formData.name === '' ? 'RENT & BILLS PROVISION' : formData.name })}
                  className={`flex-1 py-3 rounded-[18px] text-xs font-semibold uppercase tracking-wide transition-all ${formData.category === 'PROVISION' ? 'bg-rose-600 text-white shadow-lg shadow-rose-200' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Rent & Bills Deposit
                </button>
              </div>
            )}

            {/* ===================== */}
            {/* 1. AMOUNT (PRIMARY) */}
            {/* ===================== */}
            <div className="space-y-2 sm:space-y-3">
              <label className="block text-xs sm:text-xs font-black text-slate-400 uppercase tracking-[0.28em] ml-2">
                1. {formData.category === 'PROVISION' ? 'Deposit' : 'Expense'} Value
              </label>

              <div className="relative group">
              <span
                  aria-hidden
                  className={`absolute left-5 sm:left-6 top-1/2 -translate-y-1/2 text-2xl sm:text-4xl font-black transition-colors ${fixedCategory === 'PROVISION' ? 'text-slate-400' : 'text-slate-200 group-focus-within:text-rose-500'}`}
              >
                ₱
              </span>

                <input
                    required
                    type="number"
                    inputMode="decimal"
                    autoFocus={fixedCategory !== 'PROVISION'}
                    readOnly={fixedCategory === 'PROVISION'}
                    value={formData.amount || ''}
                    onChange={e =>
                        setFormData({ ...formData, amount: Number(e.target.value) })
                    }
                    className={`w-full p-4 pl-12 sm:p-7 sm:pl-16 rounded-xl sm:rounded-[26px] font-black text-3xl sm:text-5xl outline-none transition-all shadow-inner tabular-nums ${fixedCategory === 'PROVISION' ? 'bg-slate-100 text-slate-500 border-transparent cursor-not-allowed' : 'bg-slate-50 border-2 border-transparent focus:border-rose-500 focus:bg-white'}`}
                    placeholder="0"
                    aria-label="Disbursement amount"
                />
              </div>
            </div>

            {/* ===================== */}
            {/* 2. PURPOSE */}
            {/* ===================== */}
            {fixedCategory !== 'PROVISION' && (
              <div className="space-y-2 sm:space-y-3">
                <label className="block text-xs sm:text-xs font-black text-slate-400 uppercase tracking-[0.28em] ml-2">
                  2. Expense Label / Purpose
                </label>

                <div className="relative group">
                  <input
                      required
                      value={formData.name}
                      onChange={e =>
                          setFormData({ ...formData, name: e.target.value.toUpperCase() })
                      }
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      className="w-full p-4 sm:p-5 bg-slate-50 border-2 border-transparent rounded-[18px] sm:rounded-[22px] font-black text-sm sm:text-base uppercase outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner placeholder:text-slate-300"
                      placeholder="E.G. WATER BILL, LAUNDRY"
                      aria-label="Expense purpose"
                  />
                  
                  {showSuggestions && (
                    <div className="absolute z-50 left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {COMMON_EXPENSES.map(item => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, name: item });
                              setShowSuggestions(false);
                            }}
                            className="px-4 py-3 text-left rounded-xl hover:bg-slate-50 transition-colors group flex items-center justify-between"
                          >
                            <span className="text-xs font-black text-slate-600 uppercase tracking-wider group-hover:text-emerald-600">{item}</span>
                            <Check className="w-3 h-3 text-slate-200 group-hover:text-emerald-400" strokeWidth={3} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ===================== */}
            {/* 3. RECEIPT */}
            {/* ===================== */}
            {fixedCategory !== 'PROVISION' && (
              <div className="space-y-2 sm:space-y-3">
                <div className="flex justify-between items-center ml-2">
                  <label className="text-xs sm:text-xs font-black text-slate-400 uppercase tracking-[0.28em]">
                    3. Receipt Evidence <span className="text-xs sm:text-xs opacity-50 font-bold">(Optional)</span>
                  </label>

                  {(file || existingImage) && (
                      <span className="text-xs sm:text-xs font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                    Proof Attached
                  </span>
                  )}
                </div>

                {file || existingImage ? (
                    <div className="w-full p-4 sm:p-6 rounded-2xl sm:rounded-[30px] border-2 border-emerald-500 bg-emerald-50 flex items-center justify-between gap-4 animate-in fade-in zoom-in-95 duration-300">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-white shadow-lg border border-slate-200">
                          <img
                              src={file ? URL.createObjectURL(file) : existingImage}
                              className="w-full h-full object-cover"
                              alt="Receipt preview"
                          />
                        </div>

                        <div className="text-left">
                          <p className="text-xs sm:text-xs font-black uppercase text-emerald-900">
                            Evidence Indexed
                          </p>
                          <p className="text-xs sm:text-xs font-bold text-emerald-600/60 uppercase tracking-widest">
                            Ready for synchronization
                          </p>
                        </div>
                      </div>

                       <button
                          type="button"
                          onClick={() => {
                            setFile(null);
                            if (fileRef.current) fileRef.current.value = '';
                          }}
                          className="p-3 text-rose-500 hover:bg-rose-100 rounded-full transition-colors"
                          title="Remove image"
                      >
                        <X className="w-5 h-5" strokeWidth={2.5} />
                      </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                      <button
                          type="button"
                          onClick={() => {
                            if (fileRef.current) {
                              fileRef.current.setAttribute('capture', 'environment');
                              fileRef.current.click();
                            }
                          }}
                          className="flex flex-col items-center justify-center gap-3 py-6 sm:py-10 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl sm:rounded-[30px] hover:border-emerald-400 hover:bg-emerald-50/30 transition-all group"
                      >
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-2xl flex items-center justify-center shadow-md border border-slate-100 text-slate-400 group-hover:text-emerald-500 transition-colors">
                          <Camera className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2.5} />
                        </div>
                        <span className="text-xs sm:text-xs font-semibold uppercase tracking-wide text-slate-500 group-hover:text-emerald-700">
                      Take Photo
                    </span>
                      </button>

                      <button
                          type="button"
                          onClick={() => {
                            if (fileRef.current) {
                              fileRef.current.removeAttribute('capture');
                              fileRef.current.click();
                            }
                          }}
                          className="flex flex-col items-center justify-center gap-3 py-6 sm:py-10 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl sm:rounded-[30px] hover:border-indigo-400 hover:bg-indigo-50/30 transition-all group"
                      >
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-2xl flex items-center justify-center shadow-md border border-slate-100 text-slate-400 group-hover:text-indigo-500 transition-colors">
                          <Upload className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2.5} />
                        </div>
                        <span className="text-xs sm:text-xs font-semibold uppercase tracking-wide text-slate-500 group-hover:text-indigo-700">
                      Upload Image
                    </span>
                      </button>
                    </div>
                )}

                <input
                    type="file"
                    ref={fileRef}
                    className="hidden"
                    accept="image/*"
                    onChange={e => setFile(e.target.files?.[0] || null)}
                />
              </div>
            )}

            {/* ===================== */}
            {/* ACTIONS */}
            {/* ===================== */}
            <div className="pt-2 sm:pt-4 space-y-3 sm:space-y-4">
              <button
                  type="submit"
                  disabled={isUploading || !isFormValid}
                  className={`w-full font-black py-5 sm:py-7 rounded-[22px] sm:rounded-2xl uppercase tracking-[0.32em] text-xs sm:text-xs shadow-xl transition-all flex items-center justify-center gap-3
                ${
                      isFormValid
                          ? 'bg-slate-900 text-white hover:bg-emerald-600 active:scale-[0.98]'
                          : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                  }`}
              >
                {isUploading ? (
                    <>
                      <div className="w-3 h-3 sm:w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>Syncing {uploadProgress}%</span>
                    </>
                ) : (
                    <span>{isEditing ? 'Commit Changes' : (fixedCategory === 'PROVISION' ? 'Log Daily Provision' : `Authorize Expense`)}</span>
                )}
              </button>

              {isEditing && (
                  <button
                      type="button"
                      onClick={onCancel}
                      className="w-full py-2 text-xs sm:text-xs font-semibold uppercase tracking-wide text-rose-400 hover:text-rose-600 transition-colors"
                  >
                    Discard Entry
                  </button>
              )}
            </div>
          </form>
        </div>

        {/* FOOTNOTE */}
        <div className="flex items-center gap-2 sm:gap-3 px-5 sm:px-6 py-3 sm:py-4 bg-emerald-50/40 rounded-[22px] sm:rounded-[26px] border border-emerald-100">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-xs sm:text-xs font-black text-emerald-800 uppercase tracking-wide">
            All recorded outflows are immutable after daily finalization.
          </p>
        </div>
      </div>
  );
};
