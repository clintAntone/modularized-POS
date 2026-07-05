import React, { useMemo } from 'react';
import { Service } from '../../../../types';
import { playSound } from '../../../../lib/audio';
import { Package } from 'lucide-react';
import { formatPeso } from '../../../../lib/time';

interface POSServiceSelectionProps {
    services: Service[];
    selectedIds: string[];
    onToggle: (id: string) => void;
    isLoyaltyMode?: boolean;
    isLoading?: boolean;
}

export const POSServiceSelection: React.FC<POSServiceSelectionProps> = ({ services, selectedIds, onToggle, isLoyaltyMode = false, isLoading = false }) => {

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
        return Object.entries(groups).sort((a, b) => b[1].name.localeCompare(a[1].name));
    }, [services, isLoyaltyMode]);

    if (isLoading) {
        return (
            <div className="space-y-8 animate-pulse">
                {[1, 2].map(g => (
                    <div key={g} className="space-y-4">
                        <div className="flex items-center gap-3 px-1">
                            <div className="h-px flex-1 bg-slate-200" />
                            <div className="h-3 w-28 bg-slate-200 rounded-full" />
                            <div className="h-px flex-1 bg-slate-200" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="p-5 rounded-2xl border border-slate-100 bg-white space-y-4 min-h-[80px]">
                                    <div className="h-4 bg-slate-100 rounded-lg w-3/4" />
                                    <div className="flex items-center justify-between">
                                        <div className="h-3 bg-slate-100 rounded-full w-16" />
                                        <div className="h-5 bg-slate-100 rounded-lg w-20" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {services.length > 0 ? (
                <div className="space-y-8">
                    {groupedServices.map(([catId, group]) => (
                        <div key={catId} className="space-y-3">
                            {/* Catalog Header */}
                            <div className="flex items-center gap-3 px-1">
                                <div className="h-px flex-1 bg-slate-200" />
                                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 px-1">
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
                                            className={`min-h-[72px] p-5 rounded-2xl border-2 text-left transition-all duration-200 active:scale-[0.98] ${
                                                isSelected
                                                    ? 'bg-emerald-50 border-emerald-500 shadow-sm'
                                                    : 'bg-white border-slate-100 hover:border-emerald-200 hover:bg-slate-50'
                                            }`}
                                        >
                                            <div className="flex flex-col h-full justify-between gap-3">
                                                <div className="flex justify-between items-start gap-2">
                                                    <p className={`font-semibold text-sm leading-snug ${
                                                        isSelected ? 'text-emerald-700' : 'text-slate-800'
                                                    }`}>{s.name}</p>
                                                    {isLoyaltyMode && (
                                                        <span className={`shrink-0 px-2 py-0.5 rounded-lg text-xs font-bold uppercase tracking-wide border ${
                                                            isSelected
                                                                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                                                : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                                        }`}>Reward</span>
                                                    )}
                                                </div>

                                                <div className="flex items-center justify-between">
                                                    <span className={`text-xs font-medium uppercase tracking-widest ${
                                                        isSelected ? 'text-emerald-500' : 'text-slate-400'
                                                    }`}>{s.duration} min</span>

                                                    <span className={`text-lg font-bold tabular-nums ${
                                                        isSelected ? 'text-emerald-600' : isLoyaltyMode ? 'text-emerald-600' : 'text-slate-700'
                                                    }`}>
                                                        {isLoyaltyMode ? 'FREE' : formatPeso(s.price)}
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
                <div className="py-16 px-8 text-center bg-white rounded-2xl border-2 border-dashed border-slate-200">
                    <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-slate-100">
                        <Package className="w-7 h-7 text-slate-300" />
                    </div>
                    <p className="text-sm font-semibold text-slate-700 mb-2">
                        No Services Found
                    </p>
                    <p className="text-xs text-slate-400 max-w-[260px] mx-auto leading-relaxed">
                        This branch has no catalog subscription attached. Contact the{' '}
                        <span className="text-emerald-600 font-semibold">Network Administrator</span>{' '}
                        to sync service units.
                    </p>
                </div>
            )}
        </div>
    );
};
