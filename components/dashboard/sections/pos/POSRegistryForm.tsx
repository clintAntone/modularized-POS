
import React, { useMemo, useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { Branch, Service, Employee } from '../../../../types';
import { POSMode } from '../POSSection';
import { POSServiceSelection } from './POSServiceSelection';
import { POSStaffSelection } from './POSStaffSelection';
import { POSSummary } from './POSSummary';
import { MedicalHistoryPanel } from './MedicalHistoryPanel';
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
    onDemandIds?: Set<string>;
}

export const POSRegistryForm: React.FC<POSRegistryFormProps> = (props) => {
    const [activeTab, setActiveTab] = useState<'STANDARD' | 'LOYALTY'>('STANDARD');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [showOtherWarning, setShowOtherWarning] = useState(false);
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
        <div className={`grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-5 ${props.isClosedMode ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
            {/* Left panel — customer info, services, staff */}
            <div className="lg:col-span-8 space-y-5">

                {/* Customer info card */}
                <div className="bg-white p-3 sm:p-5 md:p-6 rounded-2xl border border-slate-100 space-y-5">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Guest Details</h3>
                        {props.mode === 'EDITING' && (
                            <span className="bg-amber-50 text-amber-600 px-3 py-1 rounded-xl text-xs font-bold uppercase border border-amber-100 tracking-wide animate-pulse">
                                Editing
                            </span>
                        )}
                    </div>

                    {/* Client name input + suggestions */}
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
                            placeholder="Client name"
                            className="w-full min-h-[48px] px-4 py-3 bg-slate-50 border-2 border-transparent rounded-xl font-semibold text-sm uppercase outline-none focus:border-emerald-500 focus:bg-white transition-all"
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
                                        className={`w-full text-left px-4 py-3 text-sm font-medium transition-colors flex items-center gap-3 ${i === highlightedIndex ? 'bg-emerald-50 text-emerald-700' : 'text-slate-700 hover:bg-slate-50'}`}
                                    >
                                        <svg className="w-3.5 h-3.5 text-slate-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        {name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Medical history */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Health Declaration</label>
                        <MedicalHistoryPanel
                            selected={props.formData.medical_history || []}
                            onChange={selected => props.setFormData((f: any) => ({ ...f, medical_history: selected }))}
                        />
                    </div>


                    {/* Service type tab + service grid */}
                    <div className="flex flex-col gap-4 pt-1">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Services</h3>
                            <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
                                <button
                                    onClick={() => { setActiveTab('STANDARD'); playSound('click'); }}
                                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 min-h-[36px] rounded-lg text-sm font-semibold transition-all ${activeTab === 'STANDARD' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    <Zap className={`w-3.5 h-3.5 ${activeTab === 'STANDARD' ? 'text-emerald-600' : ''}`} />
                                    Standard
                                    {hasSelectedStandard && (
                                        <div className="w-2 h-2 bg-emerald-500 rounded-full ring-2 ring-emerald-200 ring-offset-1 ring-offset-white" />
                                    )}
                                </button>
                                <button
                                    onClick={() => { setActiveTab('LOYALTY'); playSound('click'); }}
                                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 min-h-[36px] rounded-lg text-sm font-semibold transition-all ${activeTab === 'LOYALTY' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    <Gift className="w-3.5 h-3.5" />
                                    Loyalty
                                    {hasSelectedLoyalty && (
                                        <div className={`w-2 h-2 rounded-full ring-offset-1 ${activeTab === 'LOYALTY' ? 'bg-white ring-2 ring-white/40 ring-offset-emerald-600' : 'bg-emerald-500 ring-2 ring-emerald-200 ring-offset-white'}`} />
                                    )}
                                </button>
                            </div>
                        </div>

                        <div className="animate-in fade-in slide-in-from-bottom-1 duration-200">
                            <POSServiceSelection
                                services={activeTab === 'STANDARD' ? standardServices : loyaltyServices}
                                selectedIds={activeTab === 'STANDARD' ? props.formData.selected_service_ids : props.formData.loyalty_service_ids}
                                isLoyaltyMode={activeTab === 'LOYALTY'}
                                isLoading={props.isServicesLoading}
                                onDemandIds={props.onDemandIds}
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

                {/* Staff selection card */}
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

            {/* Right panel — summary & finalize */}
            <div className="lg:col-span-4">
                <POSSummary
                    mode={props.mode}
                    formData={props.formData}
                    setFormData={props.setFormData}
                    selectedServices={allSelectedServices}
                    isDualProviderRequired={isDualProviderRequired}
                    isProcessing={props.isProcessing}
                    onFinalize={() => {
                        const hasBlankOther = (props.formData.medical_history as string[])
                            .some((s: string) => s.startsWith('Other: ') && s.slice(7).trim() === '');
                        if (hasBlankOther) {
                            setShowOtherWarning(true);
                            return;
                        }
                        props.onFinalize();
                    }}
                    onAbort={props.onAbort}
                    primaryRole={primaryRole}
                    isPaymongoEnabled={props.isPaymongoEnabled}
                />
            </div>

            {showOtherWarning && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-6 animate-in fade-in duration-150">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs animate-in zoom-in-95 duration-150 overflow-hidden">
                        <div className="bg-slate-900 px-6 pt-6 pb-5 flex items-center gap-3">
                            <div className="w-9 h-9 bg-amber-400/20 rounded-2xl flex items-center justify-center shrink-0">
                                <AlertTriangle className="w-4 h-4 text-amber-400" />
                            </div>
                            <h3 className="text-white font-bold text-sm uppercase tracking-tight">Required Field</h3>
                        </div>
                        <div className="px-6 py-5">
                            <p className="text-slate-600 text-sm leading-relaxed">
                                You selected <span className="font-semibold text-slate-800">"Other"</span> under Medical History. Please specify the condition before proceeding.
                            </p>
                        </div>
                        <div className="px-6 pb-6">
                            <button
                                onClick={() => setShowOtherWarning(false)}
                                className="w-full py-3.5 bg-slate-900 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-slate-700 transition-all"
                            >
                                Got it
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
