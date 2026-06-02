import React, { useMemo } from 'react';
import { Service } from '../../../../types';
import { playSound } from '../../../../lib/audio';
import { Package } from 'lucide-react';

interface POSServiceSelectionProps {
    services: Service[];
    selectedIds: string[];
    onToggle: (id: string) => void;
    isLoyaltyMode?: boolean;
}

export const POSServiceSelection: React.FC<POSServiceSelectionProps> = ({ services, selectedIds, onToggle, isLoyaltyMode = false }) => {

    // Group services by catalogId
    const groupedServices = useMemo(() => {
        const groups: Record<string, { name: string; services: Service[] }> = {};
        
        // If in loyalty mode, only show services from catalogs that allow loyalty
        const filteredServices = isLoyaltyMode 
            ? services.filter(s => s.canBeLoyalty === true)
            : services;

        filteredServices.forEach(service => {
            const catId = service.catalogId || 'uncategorized';
            const catName = service.catalogName || 'Uncategorized';
            if (!groups[catId]) groups[catId] = { name: catName, services: [] };
            groups[catId].services.push(service);
        });
        return Object.entries(groups); // [ [catId, {name, services}], ... ]
    }, [services, isLoyaltyMode]);

    return (
        <div className="space-y-6">
            {services.length > 0 ? (
                <div className="space-y-8">
                    {groupedServices.map(([catId, group]) => (
                        <div key={catId} className="space-y-3">
                            {/* Catalog Header */}
                            <div className="flex items-center gap-3 px-2">
                                <div className="h-px flex-1 bg-slate-200" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                                    {group.name}
                                </span>
                                <div className="h-px flex-1 bg-slate-200" />
                            </div>

                            {/* Services Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {group.services.map(s => {
                                    const isSelected = selectedIds.includes(s.id);
                                    return (
                                        <button
                                            key={s.id}
                                            onClick={() => {
                                                playSound('click');
                                                onToggle(s.id);
                                            }}
                                            className={`p-5 rounded-[28px] border-2 text-left transition-all duration-300 relative group overflow-hidden ${
                                                isSelected
                                                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-xl shadow-emerald-100 scale-[1.02]'
                                                    : 'bg-white border-slate-100 hover:border-emerald-200'
                                            }`}
                                        >
                                            <div className="flex flex-col h-full justify-between gap-1 relative z-10">
                                                <div className="flex justify-between items-start gap-2">
                                                    <p className={`font-black text-[13px] sm:text-[15px] uppercase leading-tight tracking-tight underline underline-offset-2 decoration-1 ${
                                                        isSelected ? 'text-white decoration-white/30' : 'text-slate-900 decoration-slate-300 group-hover:text-emerald-700 group-hover:decoration-emerald-300'
                                                    }`}>{s.name}</p>
                                                    {isLoyaltyMode && !isSelected && (
                                                        <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-lg text-[7px] font-black uppercase tracking-widest border border-emerald-100">Reward</span>
                                                    )}
                                                </div>

                                                <div className="flex items-center justify-between mt-2">
                                                    <span className={`text-[9px] font-bold uppercase tracking-widest ${
                                                        isSelected ? 'text-white/60' : 'text-slate-400'
                                                    }`}>{s.duration} MINS</span>

                                                    <span className={`text-sm font-bold tabular-nums ${
                                                        isSelected ? 'text-white' : isLoyaltyMode ? 'text-emerald-600' : 'text-slate-600'
                                                    }`}>
                                                        {isLoyaltyMode ? 'FREE' : `₱${s.price}`}
                                                    </span>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="py-16 px-8 text-center bg-slate-50 rounded-[36px] border-2 border-dashed border-slate-200">
                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm">
                        <Package className="w-8 h-8 text-slate-300" />
                    </div>
                    <p className="text-[12px] font-bold text-slate-900 uppercase tracking-widest leading-none mb-3">
                        No Services Found
                    </p>
                    <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest max-w-[280px] mx-auto leading-relaxed">
                        This node has no catalog subscription attached. Please contact the <span className="text-emerald-600">Network Administrator</span> to synchronize service units.
                    </p>
                </div>
            )}
        </div>
    );
};
