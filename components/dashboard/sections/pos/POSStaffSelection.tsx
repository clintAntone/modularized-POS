
import React from 'react';
import { Employee } from '../../../../types';
import { playSound } from '../../../../lib/audio';
import { DB_COLUMNS } from '../../../../constants/db_schema';
import { Check } from 'lucide-react';

interface POSStaffSelectionProps {
    primaryRole: string;
    isDualProviderRequired: boolean;
    availableTherapists: Employee[];
    availableBonesetters: Employee[];
    selectedTherapistName: string;
    selectedTherapistId: string;
    selectedBonesetterName: string;
    selectedBonesetterId: string;
    onSelectTherapist: (name: string, id: string) => void;
    onSelectBonesetter: (name: string, id: string) => void;
}

export const POSStaffSelection: React.FC<POSStaffSelectionProps> = (props) => {
    const leadList = props.primaryRole === 'BONESETTER' ? props.availableBonesetters : props.availableTherapists;
    const supportList = props.primaryRole === 'BONESETTER' ? props.availableTherapists : props.availableBonesetters;

    const leadRoleLabel = props.primaryRole === 'BONESETTER' ? 'Bonesetter' : 'Therapist';
    const supportRoleLabel = props.primaryRole === 'BONESETTER' ? 'Therapist' : 'Bonesetter';

    return (
        <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Authorized Providers</h3>
                {props.isDualProviderRequired && (
                    <span className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 dark:text-indigo-400 px-3 py-1 rounded-xl text-xs font-bold uppercase tracking-wide border border-indigo-100 dark:border-indigo-700/40">
                        Dual Provider
                    </span>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                {/* Lead Column */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-5 bg-emerald-400 dark:bg-emerald-600 rounded-full"></div>
                        <label className="text-xs font-bold text-emerald-600 dark:text-emerald-500 uppercase tracking-widest">{leadRoleLabel} — Lead</label>
                    </div>
                    <div className="flex flex-col gap-2">
                        {leadList.length > 0 ? leadList.map(emp => {
                            const empName = emp[DB_COLUMNS.NAME];
                            const empId = emp[DB_COLUMNS.ID];
                            const isSelected = props.primaryRole === 'BONESETTER' ? props.selectedBonesetterId === empId : props.selectedTherapistId === empId;

                            const currentRole = (emp as any).currentRole || '';
                            const roles = currentRole.split(',');
                            const role = roles.includes('MANAGER') ? 'MANAGER' :
                                         roles.includes('RELIEVER') ? 'RELIEVER' :
                                         roles.includes('BONESETTER') ? 'BONESETTER' : 'THERAPIST';

                            const initials = empName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

                            return (
                                <button
                                    key={empId}
                                    onClick={() => {
                                        playSound('click');
                                        if (props.primaryRole === 'BONESETTER') {
                                            props.onSelectBonesetter(isSelected ? '' : empName, isSelected ? '' : empId);
                                        } else {
                                            props.onSelectTherapist(isSelected ? '' : empName, isSelected ? '' : empId);
                                        }
                                    }}
                                    className={`w-full min-h-[56px] px-4 py-3 rounded-xl border-2 flex items-center gap-3 transition-all duration-200 active:scale-[0.98] text-left ${
                                        isSelected
                                            ? 'bg-emerald-50 border-emerald-300 dark:bg-emerald-900/20 dark:border-emerald-700/60'
                                            : role === 'RELIEVER'
                                                ? 'bg-purple-50 border-purple-100 hover:border-purple-300 dark:bg-slate-700/40 dark:border-slate-600 dark:hover:border-slate-500'
                                                : 'bg-slate-50 border-slate-100 hover:border-slate-300 hover:bg-white dark:bg-slate-700/30 dark:border-slate-700 dark:hover:border-slate-500 dark:hover:bg-slate-700/60'
                                    }`}
                                >
                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ring-2 ${
                                        isSelected
                                            ? 'bg-emerald-500/80 text-white ring-emerald-400/30 ring-offset-1 dark:bg-emerald-700/70 dark:ring-emerald-600/30'
                                            : role === 'RELIEVER'
                                                ? 'bg-purple-100 text-purple-600 ring-purple-200 ring-offset-1 dark:bg-purple-900/40 dark:text-purple-300 dark:ring-purple-700/40'
                                                : 'bg-slate-200 text-slate-500 ring-transparent dark:bg-slate-600 dark:text-slate-300'
                                    }`}>
                                        {initials}
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                        <span className={`text-sm font-semibold truncate block ${
                                            isSelected
                                                ? 'text-emerald-800 dark:text-emerald-300'
                                                : role === 'RELIEVER'
                                                    ? 'text-purple-700 dark:text-purple-300'
                                                    : 'text-slate-700 dark:text-slate-300'
                                        }`} title={empName}>{empName}</span>
                                        {role === 'RELIEVER' && (
                                            <span className="text-xs text-purple-500 dark:text-purple-400 font-medium">Reliever</span>
                                        )}
                                    </div>
                                    {isSelected && (
                                        <div className="shrink-0 w-6 h-6 rounded-full bg-emerald-500/70 dark:bg-emerald-700/70 flex items-center justify-center">
                                            <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                                        </div>
                                    )}
                                </button>
                            );
                        }) : (
                            <div className="py-8 px-4 text-center bg-slate-50 dark:bg-slate-700/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-600">
                                <p className="text-xs text-slate-400 dark:text-slate-300 font-medium">No {leadRoleLabel}s on duty</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Support Column */}
                {props.isDualProviderRequired ? (
                    <div className="space-y-3 animate-in slide-in-from-right duration-300">
                        <div className="flex items-center gap-2">
                            <div className="w-1 h-5 bg-indigo-400 dark:bg-indigo-600 rounded-full"></div>
                            <label className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">{supportRoleLabel} — Support</label>
                        </div>
                        <div className="flex flex-col gap-2">
                            {supportList.length > 0 ? supportList.map(emp => {
                                const empName = emp[DB_COLUMNS.NAME];
                                const empId = emp[DB_COLUMNS.ID];
                                const isSelected = props.primaryRole === 'BONESETTER' ? props.selectedTherapistId === empId : props.selectedBonesetterId === empId;

                                const currentRole = (emp as any).currentRole || '';
                                const roles = currentRole.split(',');
                                const role = roles.includes('MANAGER') ? 'MANAGER' :
                                             roles.includes('RELIEVER') ? 'RELIEVER' :
                                             roles.includes('BONESETTER') ? 'BONESETTER' : 'THERAPIST';

                                const initials = empName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

                                return (
                                    <button
                                        key={empId}
                                        onClick={() => {
                                            playSound('click');
                                            if (props.primaryRole === 'BONESETTER') {
                                                props.onSelectTherapist(isSelected ? '' : empName, isSelected ? '' : empId);
                                            } else {
                                                props.onSelectBonesetter(isSelected ? '' : empName, isSelected ? '' : empId);
                                            }
                                        }}
                                        className={`w-full min-h-[56px] px-4 py-3 rounded-xl border-2 flex items-center gap-3 transition-all duration-200 active:scale-[0.98] text-left ${
                                            isSelected
                                                ? 'bg-indigo-50 border-indigo-300 dark:bg-indigo-900/20 dark:border-indigo-700/60'
                                                : role === 'RELIEVER'
                                                    ? 'bg-purple-50 border-purple-100 hover:border-purple-300 dark:bg-slate-700/40 dark:border-slate-600 dark:hover:border-slate-500'
                                                    : 'bg-slate-50 border-slate-100 hover:border-slate-300 hover:bg-white dark:bg-slate-700/30 dark:border-slate-700 dark:hover:border-slate-500 dark:hover:bg-slate-700/60'
                                        }`}
                                    >
                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ring-2 ${
                                            isSelected
                                                ? 'bg-indigo-500/80 text-white ring-indigo-400/30 ring-offset-1 dark:bg-indigo-700/70 dark:ring-indigo-600/30'
                                                : role === 'RELIEVER'
                                                    ? 'bg-purple-100 text-purple-600 ring-purple-200 ring-offset-1 dark:bg-purple-900/40 dark:text-purple-300 dark:ring-purple-700/40'
                                                    : 'bg-slate-200 text-slate-500 ring-transparent dark:bg-slate-600 dark:text-slate-300'
                                        }`}>
                                            {initials}
                                        </div>
                                        <div className="flex-1 overflow-hidden">
                                            <span className={`text-sm font-semibold truncate block ${
                                                isSelected
                                                    ? 'text-indigo-800 dark:text-indigo-300'
                                                    : role === 'RELIEVER'
                                                        ? 'text-purple-700 dark:text-purple-300'
                                                        : 'text-slate-700 dark:text-slate-300'
                                            }`} title={empName}>{empName}</span>
                                            {role === 'RELIEVER' && (
                                                <span className="text-xs text-purple-500 dark:text-purple-400 font-medium">Reliever</span>
                                            )}
                                        </div>
                                        {isSelected && (
                                            <div className="shrink-0 w-6 h-6 rounded-full bg-indigo-500/70 dark:bg-indigo-700/70 flex items-center justify-center">
                                                <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                                            </div>
                                        )}
                                    </button>
                                );
                            }) : (
                                <div className="py-8 px-4 text-center bg-slate-50 dark:bg-slate-700/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-600">
                                    <p className="text-xs text-slate-400 dark:text-slate-300 font-medium">No {supportRoleLabel}s on duty</p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="hidden md:flex flex-col h-full gap-3">
                        <div className="h-5 shrink-0" />
                        <div className="flex-1 flex items-center justify-center px-4 text-center bg-slate-50 dark:bg-slate-700/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-600 min-h-[56px]">
                            <p className="text-xs text-slate-400 dark:text-slate-300 font-medium">Support provider not required</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
