import React, { useMemo, useState, useCallback } from 'react';
import { Service } from '../../../../types';
import { playSound } from '../../../../lib/audio';
import { POSMode } from '../POSSection';
import { PWD_BASE_THRESHOLD, PWD_DISCOUNT_HIGH, PWD_DISCOUNT_LOW } from '../../../../lib/payroll';
import { Check, Banknote, Smartphone } from 'lucide-react';

interface POSSummaryProps {
    mode: POSMode;
    formData: any;
    setFormData: any;
    selectedServices: Service[];
    isDualProviderRequired: boolean;
    isProcessing: boolean;
    onFinalize: () => void;
    onAbort: () => void;
    primaryRole: 'THERAPIST' | 'BONESETTER';
    isPaymongoEnabled?: boolean;
}

export const POSSummary: React.FC<POSSummaryProps> = (props) => {
    const standardServices = useMemo(() => props.selectedServices.filter(s => !(s as any).isLoyalty), [props.selectedServices]);
    const loyaltyServices = useMemo(() => props.selectedServices.filter(s => (s as any).isLoyalty), [props.selectedServices]);

    const currentBasePrice = useMemo(() => standardServices.reduce((sum, s) => sum + (Number(s.price) || 0), 0), [standardServices]);

    const pwdDiscount = useMemo(() => (props.formData.is_pwd_senior && currentBasePrice > 0) ? (currentBasePrice > PWD_BASE_THRESHOLD ? PWD_DISCOUNT_HIGH : PWD_DISCOUNT_LOW) : 0, [props.formData.is_pwd_senior, currentBasePrice]);

    const maxDiscount = currentBasePrice - pwdDiscount;
    const manualDiscount = Math.max(0, Number(props.formData.discount || 0));
    const isDiscountInvalid = manualDiscount > maxDiscount && currentBasePrice > 0;
    const effectiveManualDiscount = isDiscountInvalid ? 0 : manualDiscount;
    const totalDiscount = Math.min(currentBasePrice, effectiveManualDiscount + pwdDiscount);
    const totalCalculated = Math.max(0, currentBasePrice - totalDiscount);

    const [shaking, setShaking] = useState(false);
    const triggerShake = useCallback(() => {
        setShaking(true);
        playSound('warning');
        setTimeout(() => setShaking(false), 400);
    }, []);

    const isLeadSelected = props.primaryRole === 'THERAPIST' ? props.formData.therapist_name : props.formData.bonesetter_name;
    const isSupportSelected = props.primaryRole === 'THERAPIST' ? props.formData.bonesetter_name : props.formData.therapist_name;

    const isReady = props.formData.client_name &&
        (props.formData.selected_service_ids.length > 0 || props.formData.loyalty_service_ids.length > 0) &&
        isLeadSelected &&
        (!props.isDualProviderRequired || isSupportSelected) &&
        !isDiscountInvalid;

    return (
        <div className="bg-[#0F172A] text-white p-8 rounded-[44px] shadow-2xl relative overflow-hidden h-full flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 blur-[80px] rounded-full"></div>
            <div className="space-y-8 relative z-10">
                <div className="space-y-1">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.3em]">Sales Yield</p>
                    <h4 className="text-5xl font-bold tracking-tighter text-emerald-400 tabular-nums">₱{totalCalculated.toLocaleString()}</h4>
                    <div className="flex flex-col gap-1 mt-2">
                        <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">Gross: ₱{currentBasePrice.toLocaleString()}</p>
                        {loyaltyServices.length > 0 && (
                            <p className="text-[9px] font-bold text-emerald-500/80 uppercase tracking-widest flex items-center gap-1">
                                <span className="w-1 h-1 bg-emerald-500 rounded-full"></span>
                                {loyaltyServices.length} Loyalty Reward(s) Included (Free)
                            </p>
                        )}
                    </div>
                </div>

                <div className="space-y-6 border-t border-white/5 pt-8">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">PWD / Senior</span>
                                {props.formData.is_pwd_senior && currentBasePrice > 0 && (
                                    <span className="text-[10px] font-bold text-emerald-500 animate-in fade-in slide-in-from-left-2 duration-300">
                                        − ₱{pwdDiscount.toLocaleString()} Applied
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={() => {
                                    playSound('click');
                                    const toggling_on = !props.formData.is_pwd_senior;
                                    const newPwdDiscount = toggling_on
                                        ? (currentBasePrice > PWD_BASE_THRESHOLD ? PWD_DISCOUNT_HIGH : PWD_DISCOUNT_LOW)
                                        : 0;
                                    const cappedDiscount = Math.max(0, Math.min(currentBasePrice - newPwdDiscount, Number(props.formData.discount || 0)));
                                    props.setFormData({ ...props.formData, is_pwd_senior: toggling_on, discount: cappedDiscount });
                                }}
                                className={`w-12 h-6 rounded-full transition-all relative ${props.formData.is_pwd_senior ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]' : 'bg-slate-700'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${props.formData.is_pwd_senior ? 'left-7' : 'left-1'}`}></div>
                            </button>
                        </div>
                    </div>

                    <div className="space-y-6">
                        {/* Manual Discount */}
                        <div className="space-y-2">
                            <div className="flex justify-between items-center px-1">
                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Manual Discount (₱)</label>
                                {manualDiscount > 0 && <button onClick={() => props.setFormData({...props.formData, discount: 0})} className="text-[8px] font-bold text-rose-400 uppercase tracking-widest hover:text-rose-300">Clear</button>}
                            </div>
                            <input
                                type="number"
                                min="0"
                                value={props.formData.discount || ''}
                                onChange={e => {
                                    const val = Math.max(0, Number(e.target.value));
                                    props.setFormData({...props.formData, discount: val});
                                    if (val > maxDiscount && currentBasePrice > 0) triggerShake();
                                }}
                                className={`w-full p-4 rounded-xl font-bold outline-none transition-all shadow-inner tabular-nums ${
                                    isDiscountInvalid
                                        ? `bg-rose-500/10 border-2 border-rose-500 text-rose-400 ${shaking ? 'animate-shake' : ''}`
                                        : 'bg-white/5 border border-white/10 text-white focus:border-emerald-500'
                                }`}
                                placeholder="0"
                            />
                            {isDiscountInvalid && (
                                <p className="text-[9px] font-bold text-rose-400 uppercase tracking-widest px-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                    Max discount is ₱{maxDiscount.toLocaleString()}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-3 pt-4">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">Settlement Method</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => { playSound('click'); props.setFormData({...props.formData, payment_method: 'CASH'}); }}
                                className={`py-6 rounded-3xl text-[11px] font-black uppercase tracking-widest transition-all border flex flex-col items-center justify-center gap-2 relative ${props.formData.payment_method === 'CASH' ? 'bg-slate-800 border-slate-700 text-white shadow-lg ring-2 ring-emerald-500/20' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
                            >
                                {props.formData.payment_method === 'CASH' && (
                                    <div className="absolute top-3 right-3 bg-emerald-500 rounded-full p-1 shadow-lg animate-in zoom-in duration-300">
                                        <Check className="w-3 h-3 text-white" strokeWidth={4} />
                                    </div>
                                )}
                                <Banknote className="w-6 h-6" />
                                <span>Cash</span>
                            </button>
                            <button
                                onClick={() => { playSound('click'); props.setFormData({...props.formData, payment_method: 'GCASH'}); }}
                                className={`py-6 rounded-3xl text-[11px] font-black uppercase tracking-widest transition-all border flex flex-col items-center justify-center gap-2 relative ${props.formData.payment_method === 'GCASH' ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg ring-2 ring-emerald-400/20' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
                            >
                                {props.formData.payment_method === 'GCASH' && (
                                    <div className="absolute top-3 right-3 bg-white rounded-full p-1 shadow-lg animate-in zoom-in duration-300">
                                        <Check className="w-3 h-3 text-emerald-600" strokeWidth={4} />
                                    </div>
                                )}
                                <Smartphone className="w-6 h-6" />
                                <span>GCash</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-3 mt-12">
                <button
                    disabled={!isReady || props.isProcessing}
                    onClick={() => { playSound('click'); props.onFinalize(); }}
                    className={`w-full text-white font-bold py-7 rounded-[32px] shadow-xl uppercase tracking-[0.3em] text-sm active:scale-[0.98] disabled:opacity-30 transition-all ${props.mode === 'EDITING' ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
                >
                    {props.isProcessing ? 'Saving...' : props.mode === 'EDITING' ? 'Apply Corrections' : 'Finalize Session'}
                </button>
                <button
                    onClick={props.onAbort}
                    className="w-full text-slate-500 text-[10px] font-bold uppercase tracking-widest py-2 hover:text-slate-300 transition-colors"
                >
                    {props.mode === 'EDITING' ? 'Discard Changes' : 'Reset Entry Form'}
                </button>
            </div>
        </div>
    );
};