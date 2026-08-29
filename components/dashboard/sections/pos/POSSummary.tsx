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

    const discountInputClass = isDiscountInvalid
        ? ('bg-rose-50 dark:bg-rose-500/10 border-2 border-rose-400 dark:border-rose-500 text-rose-500 dark:text-rose-400' + (shaking ? ' animate-shake' : ''))
        : 'bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/8 text-slate-800 dark:text-white focus:border-emerald-400 dark:focus:border-emerald-500/60';

    const isReady = props.formData.client_name &&
        (props.formData.selected_service_ids.length > 0 || props.formData.loyalty_service_ids.length > 0) &&
        isLeadSelected &&
        (!props.isDualProviderRequired || isSupportSelected) &&
        !isDiscountInvalid;

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-transparent text-slate-800 dark:text-white p-6 rounded-2xl shadow-sm dark:shadow-lg relative overflow-hidden">
            {/* Subtle ambient glow (dark only) */}
            <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/8 blur-[60px] rounded-full pointer-events-none dark:block hidden"></div>

            <div className="space-y-6 relative z-10">
                {/* Price display */}
                <div className="space-y-1 pt-1">
                    <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-widest">Total</p>
                    <h4 className="text-4xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums">₱{totalCalculated.toLocaleString()}</h4>
                    <div className="flex flex-col gap-0.5 mt-1">
                        <p className="text-xs text-slate-400 dark:text-slate-500">Gross ₱{currentBasePrice.toLocaleString()}</p>
                        {loyaltyServices.length > 0 && (
                            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-500 flex items-center gap-1.5 animate-in fade-in duration-300">
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0"></span>
                                {loyaltyServices.length} Loyalty Reward{loyaltyServices.length > 1 ? 's' : ''} (Free)
                            </p>
                        )}
                    </div>
                </div>

                <div className="space-y-5 border-t border-slate-100 dark:border-white/5 pt-5">
                    {/* PWD / Senior toggle */}
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">PWD / Senior</span>
                            {props.formData.is_pwd_senior && currentBasePrice > 0 && (
                                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 animate-in fade-in slide-in-from-left-2 duration-300">
                                    − ₱{pwdDiscount.toLocaleString()} off
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
                            className={`w-11 h-6 rounded-full transition-all duration-200 relative shrink-0 ${props.formData.is_pwd_senior ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                        >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-200 shadow-sm ${props.formData.is_pwd_senior ? 'left-6' : 'left-1'}`}></div>
                        </button>
                    </div>

                    {/* Manual Discount */}
                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                            <label className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-widest">Discount (₱)</label>
                            {manualDiscount > 0 && (
                                <button
                                    onClick={() => props.setFormData({...props.formData, discount: 0})}
                                    className="text-xs font-semibold text-rose-500 hover:text-rose-400 transition-colors"
                                >
                                    Clear
                                </button>
                            )}
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
                            className={`w-full px-3 py-2 rounded-lg font-semibold text-sm outline-none transition-all tabular-nums ${discountInputClass}`}
                            placeholder="0"
                        />
                        {isDiscountInvalid && (
                            <p className="text-xs font-medium text-rose-500 dark:text-rose-400 px-1 animate-in fade-in duration-200">
                                Max discount is ₱{maxDiscount.toLocaleString()}
                            </p>
                        )}
                    </div>

                    {/* Payment Method */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-widest">Payment</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => { playSound('click'); props.setFormData({...props.formData, payment_method: 'CASH'}); }}
                                className={`min-h-[64px] rounded-xl text-sm font-semibold transition-all duration-200 border flex flex-col items-center justify-center gap-1.5 relative active:scale-[0.97] ${
                                    props.formData.payment_method === 'CASH'
                                        ? 'bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white ring-2 ring-emerald-500/30'
                                        : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/8 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/8'
                                }`}
                            >
                                {props.formData.payment_method === 'CASH' && (
                                    <div className="absolute top-2 right-2 bg-emerald-500 rounded-full p-0.5 animate-in zoom-in duration-200">
                                        <Check className="w-2.5 h-2.5 text-white" strokeWidth={4} />
                                    </div>
                                )}
                                <Banknote className="w-5 h-5" />
                                <span>Cash</span>
                            </button>
                            <button
                                onClick={() => { playSound('click'); props.setFormData({...props.formData, payment_method: 'GCASH'}); }}
                                className={`min-h-[64px] rounded-xl text-sm font-semibold transition-all duration-200 border flex flex-col items-center justify-center gap-1.5 relative active:scale-[0.97] ${
                                    props.formData.payment_method === 'GCASH'
                                        ? 'bg-emerald-600 border-emerald-500 text-white ring-2 ring-emerald-400/30'
                                        : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/8 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/8'
                                }`}
                            >
                                {props.formData.payment_method === 'GCASH' && (
                                    <div className="absolute top-2 right-2 bg-white rounded-full p-0.5 animate-in zoom-in duration-200">
                                        <Check className="w-2.5 h-2.5 text-emerald-600" strokeWidth={4} />
                                    </div>
                                )}
                                <Smartphone className="w-5 h-5" />
                                <span>GCash</span>
                            </button>
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-white/8">
                        <button
                            disabled={!isReady || props.isProcessing}
                            onClick={() => { playSound('click'); props.onFinalize(); }}
                            className={`w-full min-h-[52px] text-white font-semibold py-3.5 rounded-xl shadow-lg text-sm active:scale-[0.98] disabled:opacity-30 transition-all duration-200 ${
                                props.mode === 'EDITING' ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'
                            }`}
                        >
                            {props.isProcessing ? 'Saving...' : props.mode === 'EDITING' ? 'Apply Corrections' : 'Finalize Session'}
                        </button>
                        <button
                            onClick={props.onAbort}
                            className="w-full text-slate-400 dark:text-slate-500 text-xs font-medium py-2 hover:text-slate-600 dark:hover:text-slate-400 transition-colors"
                        >
                            {props.mode === 'EDITING' ? 'Discard Changes' : 'Reset Form'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
