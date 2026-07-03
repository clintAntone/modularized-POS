
import React, { useMemo, useState, useEffect, useRef } from 'react';
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
    isServicesLoading?: boolean;
    availableTherapists: Employee[];
    availableBonesetters: Employee[];
    isProcessing: boolean;
    isClosedMode: boolean;
    isPaymongoEnabled?: boolean;
    onFinalize: () => void;
    onAbort: () => void;
    clientNameHistory?: string[];
}

export const POSRegistryForm: React.FC<POSRegistryFormProps> = (props) => {
    const [activeTab, setActiveTab] = useState<'STANDARD' | 'LOYALTY'>('STANDARD');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const suggestionRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const suggestions = useMemo(() => {
        const query = props.formData.client_name.trim().toUpperCase();
        if (!query || !props.clientNameHistory?.length) return [];
        return props.clientNameHistory.filter(name => name.includes(query) && name !== query).slice(0, 6);
    }, [props.formData.client_name, props.clientNameHistory]);

    useEffect(() => {
        setHighlightedIndex(-1);
    }, [suggestions]);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (suggestionRef.current && !suggestionRef.current.contains(e.target as Node) &&
                inputRef.current && !inputRef.current.contains(e.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

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
        <div className={`grid grid-cols-1 lg:grid-cols-12 gap-6 ${props.isClosedMode ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
            <div className="lg:col-span-8 space-y-6">
                <div className="bg-white p-5 md:p-7 rounded-[22px] shadow-sm border border-slate-200 space-y-6">
                    <div className="space-y-6">
                        <div className="flex items-center justify-between ml-2">
                            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.3em]">Customer Information</h3>
                            {props.mode === 'EDITING' && <span className="bg-amber-50 text-amber-600 px-3 py-1 rounded-lg text-[8px] font-bold uppercase border border-amber-100 tracking-widest animate-pulse">Correction Active</span>}
                        </div>

                        <div className="relative">
                            <input
                                ref={inputRef}
                                value={props.formData.client_name}
                                maxLength={50}
                                onChange={e => {
                                    props.setFormData((prev: any) => ({ ...prev, client_name: e.target.value }));
                                    setShowSuggestions(true);
                                }}
                                onFocus={() => setShowSuggestions(true)}
                                onBlur={() =>
                                    props.setFormData((prev: any) => ({
                                        ...prev,
                                        client_name: prev.client_name.toUpperCase()
                                    }))
                                }
                                onKeyDown={e => {
                                    if (!showSuggestions || suggestions.length === 0) return;
                                    if (e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        setHighlightedIndex(i => Math.min(i + 1, suggestions.length - 1));
                                    } else if (e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        setHighlightedIndex(i => Math.max(i - 1, 0));
                                    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
                                        e.preventDefault();
                                        props.setFormData((prev: any) => ({ ...prev, client_name: suggestions[highlightedIndex] }));
                                        setShowSuggestions(false);
                                    } else if (e.key === 'Escape') {
                                        setShowSuggestions(false);
                                    }
                                }}
                                placeholder="CLIENT NAME"
                                className="w-full px-4 py-3 sm:px-5 sm:py-3.5 bg-slate-50 border-2 border-transparent rounded-[18px] font-bold text-sm uppercase outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner"
                            />
                            {showSuggestions && suggestions.length > 0 && (
                                <div
                                    ref={suggestionRef}
                                    className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
                                >
                                    {suggestions.map((name, i) => (
                                        <button
                                            key={name}
                                            type="button"
                                            onMouseDown={e => {
                                                e.preventDefault();
                                                props.setFormData((prev: any) => ({ ...prev, client_name: name }));
                                                setShowSuggestions(false);
                                                playSound('click');
                                            }}
                                            onMouseEnter={() => setHighlightedIndex(i)}
                                            className={`w-full text-left px-5 py-3.5 text-[11px] font-black uppercase tracking-widest transition-colors flex items-center gap-3 ${i === highlightedIndex ? 'bg-emerald-50 text-emerald-700' : 'text-slate-700 hover:bg-slate-50'}`}
                                        >
                                            <svg className="w-3.5 h-3.5 text-slate-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            {name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2">Transaction Note (Optional)</label>
                            <textarea
                                value={props.formData.note}
                                onChange={e => props.setFormData({...props.formData, note: e.target.value})}
                                placeholder="SPECIAL INSTRUCTIONS/NOTES"
                                className="w-full px-4 py-3 sm:px-5 sm:py-3.5 bg-slate-50 border-2 border-transparent rounded-[18px] font-bold text-sm uppercase outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner min-h-[80px] resize-none"
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
                                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'STANDARD' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    <Zap className={`w-3 h-3 ${activeTab === 'STANDARD' ? 'fill-emerald-600' : ''}`} />
                                    Standard
                                    {hasSelectedStandard && <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse ring-2 ring-emerald-300 ring-offset-1 ring-offset-white" />}
                                </button>
                                <button
                                    onClick={() => { setActiveTab('LOYALTY'); playSound('click'); }}
                                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'LOYALTY' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    <Gift className={`w-3 h-3 ${activeTab === 'LOYALTY' ? 'fill-white' : ''}`} />
                                    Loyalty
                                    {hasSelectedLoyalty && <div className="w-2 h-2 bg-white rounded-full animate-pulse ring-2 ring-white/40 ring-offset-1 ring-offset-emerald-600" />}
                                </button>
                            </div>
                        </div>

                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <POSServiceSelection
                                services={activeTab === 'STANDARD' ? standardServices : loyaltyServices}
                                selectedIds={activeTab === 'STANDARD' ? props.formData.selected_service_ids : props.formData.loyalty_service_ids}
                                isLoyaltyMode={activeTab === 'LOYALTY'}
                                isLoading={props.isServicesLoading}
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
