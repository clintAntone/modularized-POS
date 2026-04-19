
import React, { useMemo, useState, useEffect } from 'react';
import { Branch, Service, Employee } from '../../../../types';
import { POSMode } from '../POSSection';
import { POSServiceSelection } from './POSServiceSelection';
import { POSStaffSelection } from './POSStaffSelection';
import { POSSummary } from './POSSummary';
import { playSound } from '../../../../lib/audio';
import { Gift, Zap } from 'lucide-react';

interface POSRegistryFormProps {
    mode: POSMode;
    branch: Branch;
    formData: any;
    setFormData: any;
    activeServices: Service[];
    availableTherapists: Employee[];
    availableBonesetters: Employee[];
    isProcessing: boolean;
    isClosedMode: boolean;
    isPaymongoEnabled?: boolean;
    onFinalize: () => void;
    onAbort: () => void;
}

export const POSRegistryForm: React.FC<POSRegistryFormProps> = (props) => {
    const [activeTab, setActiveTab] = useState<'STANDARD' | 'LOYALTY'>('STANDARD');

    const standardServices = props.activeServices;
    const loyaltyServices = props.activeServices;

    const selectedStandardServices = props.activeServices.filter(s => props.formData.selected_service_ids.includes(s.id));
    const selectedLoyaltyServices = props.activeServices.filter(s => props.formData.loyalty_service_ids.includes(s.id));
    
    const allSelectedServices = [
        ...selectedStandardServices.map(s => ({ ...s, isLoyalty: false })),
        ...selectedLoyaltyServices.map(s => ({ ...s, isLoyalty: true }))
    ];

    const rolesInSelection = new Set(allSelectedServices.map(s => s.primaryRole || 'THERAPIST'));
    const isDualProviderRequired = allSelectedServices.some(s => s.isDualProvider) || rolesInSelection.size > 1;
    const primaryRole = allSelectedServices.length > 0 ? (allSelectedServices[0].primaryRole || 'THERAPIST') : 'THERAPIST';

    const hasSelectedLoyalty = props.formData.loyalty_service_ids.length > 0;
    const hasSelectedStandard = props.formData.selected_service_ids.length > 0;

    // Auto-switch to loyalty tab if only loyalty services are selected (e.g. during editing)
    useEffect(() => {
        if (hasSelectedLoyalty && !hasSelectedStandard) {
            setActiveTab('LOYALTY');
        }
    }, [hasSelectedLoyalty, hasSelectedStandard]);

    return (
        <div className={`grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-500 ${props.isClosedMode ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
            <div className="lg:col-span-8 space-y-6">
                <div className="bg-white p-6 md:p-10 rounded-[22px] shadow-sm border border-slate-200 space-y-8">
                    <div className="space-y-6">
                        <div className="flex items-center justify-between ml-2">
                            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.3em]">Customer Information</h3>
                            {props.mode === 'EDITING' && <span className="bg-amber-50 text-amber-600 px-3 py-1 rounded-lg text-[8px] font-bold uppercase border border-amber-100 tracking-widest animate-pulse">Correction Active</span>}
                        </div>

                        <input
                            value={props.formData.client_name}
                            onChange={e =>
                                props.setFormData((prev: any) => ({
                                    ...prev,
                                    client_name: e.target.value
                                }))
                            }
                            onBlur={() =>
                                props.setFormData((prev: any) => ({
                                    ...prev,
                                    client_name: prev.client_name.toUpperCase()
                                }))
                            }
                            placeholder="CLIENT FULL NAME..."
                            className="w-full p-6 bg-slate-50 border-2 border-transparent rounded-[24px] font-bold text-sm uppercase outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner"
                        />

                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2">Transaction Note (Optional)</label>
                            <textarea
                                value={props.formData.note}
                                onChange={e => props.setFormData({...props.formData, note: e.target.value})}
                                placeholder="ADD SPECIAL INSTRUCTIONS OR NOTES..."
                                className="w-full p-6 bg-slate-50 border-2 border-transparent rounded-[24px] font-bold text-sm uppercase outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner min-h-[100px] resize-none"
                            />
                        </div>
                    </div>

                    {/* Tab Navigation */}
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2">
                            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.3em]">Service Selection</h3>
                            <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 w-full sm:w-auto">
                                <button
                                    onClick={() => { setActiveTab('STANDARD'); playSound('click'); }}
                                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'STANDARD' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    <Zap className={`w-3 h-3 ${activeTab === 'STANDARD' ? 'fill-emerald-600' : ''}`} />
                                    Standard
                                    {hasSelectedStandard && <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />}
                                </button>
                                <button
                                    onClick={() => { setActiveTab('LOYALTY'); playSound('click'); }}
                                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'LOYALTY' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    <Gift className={`w-3 h-3 ${activeTab === 'LOYALTY' ? 'fill-white' : ''}`} />
                                    Loyalty
                                    {hasSelectedLoyalty && <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />}
                                </button>
                            </div>
                        </div>

                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <POSServiceSelection
                                services={activeTab === 'STANDARD' ? standardServices : loyaltyServices}
                                selectedIds={activeTab === 'STANDARD' ? props.formData.selected_service_ids : props.formData.loyalty_service_ids}
                                isLoyaltyMode={activeTab === 'LOYALTY'}
                                onToggle={(id: string) => {
                                    const field = activeTab === 'STANDARD' ? 'selected_service_ids' : 'loyalty_service_ids';
                                    const isSelected = props.formData[field].includes(id);
                                    props.setFormData((f: any) => ({
                                        ...f,
                                        [field]: isSelected ? f[field].filter((sid: string) => sid !== id) : [...f[field], id]
                                    }));
                                }}
                            />
                        </div>
                    </div>
                </div>

                <POSStaffSelection
                    primaryRole={primaryRole}
                    isDualProviderRequired={isDualProviderRequired}
                    availableTherapists={props.availableTherapists}
                    availableBonesetters={props.availableBonesetters}
                    selectedTherapistName={props.formData.therapist_name}
                    selectedTherapistId={props.formData.therapist_id}
                    selectedBonesetterName={props.formData.bonesetter_name}
                    selectedBonesetterId={props.formData.bonesetter_id}
                    onSelectTherapist={(name: string, id: string) => props.setFormData({...props.formData, therapist_name: name, therapist_id: id})}
                    onSelectBonesetter={(name: string, id: string) => props.setFormData({...props.formData, bonesetter_name: name, bonesetter_id: id})}
                />
            </div>

            <div className="lg:col-span-4">
                <POSSummary
                    mode={props.mode}
                    formData={props.formData}
                    setFormData={props.setFormData}
                    selectedServices={allSelectedServices}
                    isDualProviderRequired={isDualProviderRequired}
                    isProcessing={props.isProcessing}
                    onFinalize={props.onFinalize}
                    onAbort={props.onAbort}
                    primaryRole={primaryRole}
                    isPaymongoEnabled={props.isPaymongoEnabled}
                />
            </div>
        </div>
    );
};
