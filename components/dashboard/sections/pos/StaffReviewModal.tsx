import React, { useMemo } from 'react';
import { Service } from '../../../../types';
import { UI_THEME } from '../../../../constants/ui_designs';
import { playSound } from '../../../../lib/audio';
import { POSMode } from '../POSSection';
import { PWD_BASE_THRESHOLD, PWD_DISCOUNT_HIGH, PWD_DISCOUNT_LOW } from '../../../../lib/payroll';
import { ArrowRight } from 'lucide-react';

interface StaffReviewModalProps {
    mode: POSMode;
    formData: any;
    activeServices: Service[];
    isProcessing: boolean;
    onClose: () => void;
    onProceed: () => void;
}

export const StaffReviewModal: React.FC<StaffReviewModalProps> = ({ mode, formData, activeServices, isProcessing, onClose, onProceed }) => {
    const standardServices = activeServices.filter(s => formData.selected_service_ids.includes(s.id));
    const loyaltyServices = activeServices.filter(s => formData.loyalty_service_ids.includes(s.id));

    const allSelectedServices = [
        ...standardServices.map(s => ({ ...s, isLoyalty: false })),
        ...loyaltyServices.map(s => ({ ...s, isLoyalty: true })),
    ];

    const rolesInSelection = new Set(allSelectedServices.map(s => s.primaryRole || 'THERAPIST'));
    const isDualProviderRequired = allSelectedServices.some(s => s.isDualProvider) || rolesInSelection.size > 1;

    const currentBasePrice = useMemo(
        () => standardServices.reduce((sum, s) => sum + (Number(s.price) || 0), 0),
        [standardServices]
    );

    const pwdDiscount = (formData.is_pwd_senior && currentBasePrice > 0)
        ? (currentBasePrice > PWD_BASE_THRESHOLD ? PWD_DISCOUNT_HIGH : PWD_DISCOUNT_LOW)
        : 0;
    const totalDiscount = Math.min(currentBasePrice, Math.max(0, formData.discount || 0) + pwdDiscount);
    const totalCalculated = Math.max(0, currentBasePrice - totalDiscount);

    const calculateCommission = (services: Service[], discount: number, role: 'THERAPIST' | 'BONESETTER'): number => {
        const basePrice = services.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
        return services.reduce((sum, s) => {
            const sPrice = Number(s.price) || 0;
            const sDiscount = basePrice > 0 ? (discount * sPrice) / basePrice : 0;
            const finalSPrice = Math.max(0, sPrice - sDiscount);
            const sPrimaryRole = s.primaryRole || 'THERAPIST';
            if (sPrimaryRole === role) {
                return sum + (s.commissionType === 'fixed'
                    ? Number(s.commissionValue || 0)
                    : (finalSPrice * Number(s.commissionValue || 0)) / 100);
            } else if (s.isDualProvider) {
                const sSecondaryRole = sPrimaryRole === 'THERAPIST' ? 'BONESETTER' : 'THERAPIST';
                if (sSecondaryRole === role) {
                    return sum + (s.secondaryCommissionType === 'fixed'
                        ? Number(s.secondaryCommissionValue || 0)
                        : (finalSPrice * Number(s.secondaryCommissionValue || 0)) / 100);
                }
            }
            return sum;
        }, 0);
    };

    const therapistComm = calculateCommission(standardServices, totalDiscount, 'THERAPIST')
        + calculateCommission(loyaltyServices, 0, 'THERAPIST');
    const bonesetterComm = calculateCommission(standardServices, totalDiscount, 'BONESETTER')
        + calculateCommission(loyaltyServices, 0, 'BONESETTER');

    const primaryRole = allSelectedServices.length > 0 ? (allSelectedServices[0].primaryRole || 'THERAPIST') : 'THERAPIST';
    const leadName = primaryRole === 'THERAPIST' ? formData.therapist_name : formData.bonesetter_name;
    const supportName = primaryRole === 'THERAPIST' ? formData.bonesetter_name : formData.therapist_name;
    const leadComm = primaryRole === 'THERAPIST' ? therapistComm : bonesetterComm;
    const supportComm = primaryRole === 'THERAPIST' ? bonesetterComm : therapistComm;
    const leadRoleLabel = primaryRole === 'BONESETTER' ? 'Bonesetter' : 'Therapist';
    const supportRoleLabel = primaryRole === 'BONESETTER' ? 'Therapist' : 'Bonesetter';

    return (
        <div className={UI_THEME.layout.modalWrapper}>
            <div className={`${UI_THEME.layout.modalLarge} ${UI_THEME.radius.modal} p-5 md:p-8 flex flex-col overflow-hidden max-h-[95vh]`}>

                {/* Header */}
                <div className="space-y-1 text-center shrink-0 mb-4">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Step 1 of 2</p>
                    <h3 className="text-2xl md:text-3xl font-bold text-slate-900 uppercase tracking-tighter leading-none">
                        {mode === 'EDITING' ? 'Modify Registry' : 'Staff Review'}
                    </h3>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                        Review commission before handing to client
                    </p>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 px-1">

                    {/* Client */}
                    <div className="bg-slate-900 rounded-2xl p-4 text-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-white/5 blur-2xl rounded-full" />
                        <div className="relative z-10">
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Client</p>
                            <h4 className="text-lg font-bold uppercase tracking-tight truncate">{formData.client_name || 'Walk-in'}</h4>
                        </div>
                    </div>

                    {/* Services */}
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">Services</p>
                        <div className="bg-slate-50 rounded-2xl p-3 space-y-2">
                            {allSelectedServices.map((s, idx) => (
                                <div key={`${s.id}-${idx}`} className="flex justify-between items-center p-2.5 rounded-xl bg-white border border-slate-100 shadow-sm">
                                    <div className="min-w-0 pr-4">
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold text-slate-900 uppercase text-xs truncate">{s.name}</p>
                                            {(s as any).isLoyalty && (
                                                <span className="bg-emerald-100 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide shrink-0">Loyalty</span>
                                            )}
                                        </div>
                                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{s.duration} mins</p>
                                    </div>
                                    <p className={`font-bold text-xs tabular-nums shrink-0 ${(s as any).isLoyalty ? 'text-emerald-500' : 'text-slate-700'}`}>
                                        {(s as any).isLoyalty ? 'FREE' : `₱${s.price.toLocaleString()}`}
                                    </p>
                                </div>
                            ))}
                            {totalDiscount > 0 && (
                                <div className="flex justify-between items-center px-3 py-0.5">
                                    <span className="text-xs font-bold text-rose-500 uppercase tracking-widest">Discount</span>
                                    <span className="font-bold text-rose-600 text-xs tabular-nums">−₱{totalDiscount.toLocaleString()}</span>
                                </div>
                            )}
                            <div className="h-px bg-slate-200 mx-2 my-1" />
                            <div className="flex justify-between items-center px-3 py-1">
                                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Total</span>
                                <span className="text-xl font-bold text-slate-900 tracking-tighter">₱{totalCalculated.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center px-3 pb-1">
                                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Payment</span>
                                <span className={`text-xs font-bold uppercase tracking-widest ${formData.payment_method === 'GCASH' ? 'text-blue-600' : 'text-slate-700'}`}>
                                    {formData.payment_method === 'CASH' ? '💵 Cash' : '📱 GCash'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Commission */}
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide ml-1">Your Commission</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl space-y-1">
                                <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">{leadRoleLabel}</p>
                                <p className="font-bold text-slate-900 uppercase text-xs truncate">{leadName}</p>
                                <p className="text-2xl font-black text-emerald-700 tracking-tighter leading-none pt-1">
                                    ₱{leadComm.toLocaleString()}
                                </p>
                            </div>
                            {isDualProviderRequired && (
                                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl space-y-1">
                                    <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest">{supportRoleLabel}</p>
                                    <p className="font-bold text-slate-900 uppercase text-xs truncate">{supportName}</p>
                                    <p className="text-2xl font-black text-indigo-700 tracking-tighter leading-none pt-1">
                                        ₱{supportComm.toLocaleString()}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex flex-row gap-3 mt-6 shrink-0">
                    <button
                        onClick={() => { playSound('click'); onClose(); }}
                        disabled={isProcessing}
                        className="flex-1 text-slate-500 font-bold py-4 rounded-2xl border border-slate-200 uppercase tracking-widest text-xs hover:bg-slate-50 transition-all"
                    >
                        Back
                    </button>
                    <button
                        onClick={() => { playSound('click'); onProceed(); }}
                        disabled={isProcessing}
                        className="flex-[2] bg-slate-900 text-white font-bold py-4 rounded-2xl uppercase tracking-widest text-xs shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                        Hand to Client
                        <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );
};
