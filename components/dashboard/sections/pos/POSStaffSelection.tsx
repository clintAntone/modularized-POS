
import React from 'react';
import { Employee } from '../../../../types';
import { playSound } from '../../../../lib/audio';
import { DB_COLUMNS } from '../../../../constants/db_schema';
import { Zap, Check } from 'lucide-react';

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
        <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-100 space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Authorized Providers</h3>
                {props.isDualProviderRequired && (
                    <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-xl text-xs font-bold uppercase tracking-wide border border-indigo-100">
                        Dual Provider
                    </span>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Lead Column - Emerald Theme */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-5 bg-emerald-500 rounded-full"></div>
                        <label className="text-xs font-bold text-emerald-600 uppercase tracking-widest">{leadRoleLabel} — Lead</label>
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
                                            ? 'bg-emerald-50 border-emerald-500'
                                            : role === 'RELIEVER'
                                                ? 'bg-purple-50 border-purple-100 hover:border-purple-300'
                                                : 'bg-slate-50 border-slate-100 hover:border-emerald-200 hover:bg-white'
                                    }`}
                                >
                                    {/* Avatar circle */}
                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ring-2 ${
                                        isSelected
                                            ? 'bg-emerald-500 text-white ring-emerald-300 ring-offset-1'
                                            : role === 'RELIEVER'
                                                ? 'bg-purple-100 text-purple-600 ring-purple-200 ring-offset-1'
                                                : 'bg-slate-200 text-slate-500 ring-transparent'
                                    }`}>
                                        {initials}
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                        <span className={`text-sm font-semibold truncate block ${
                                            isSelected ? 'text-emerald-700' : role === 'RELIEVER' ? 'text-purple-700' : 'text-slate-700'
                                        }`} title={empName}>{empName}</span>
                                        {role === 'RELIEVER' && (
                                            <span className="text-xs text-purple-500 font-medium">Reliever</span>
                                        )}
                                    </div>
                                    {isSelected && (
                                        <div className="shrink-0 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                                            <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                                        </div>
                                    )}
                                </button>
                            );
                        }) : (
                            <div className="py-8 px-4 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                <p className="text-xs text-slate-400 font-medium">No {leadRoleLabel}s on duty</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Support Column - Indigo Theme */}
                {props.isDualProviderRequired ? (
                    <div className="space-y-3 animate-in slide-in-from-right duration-300">
                        <div className="flex items-center gap-2">
                            <div className="w-1 h-5 bg-indigo-500 rounded-full"></div>
                            <label className="text-xs font-bold text-indigo-600 uppercase tracking-widest">{supportRoleLabel} — Support</label>
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
                                                ? 'bg-indigo-50 border-indigo-500'
                                                : role === 'RELIEVER'
                                                    ? 'bg-purple-50 border-purple-100 hover:border-purple-300'
                                                    : 'bg-slate-50 border-slate-100 hover:border-indigo-200 hover:bg-white'
                                        }`}
                                    >
                                        {/* Avatar circle */}
                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ring-2 ${
                                            isSelected
                                                ? 'bg-indigo-500 text-white ring-indigo-300 ring-offset-1'
                                                : role === 'RELIEVER'
                                                    ? 'bg-purple-100 text-purple-600 ring-purple-200 ring-offset-1'
                                                    : 'bg-slate-200 text-slate-500 ring-transparent'
                                        }`}>
                                            {initials}
                                        </div>
                                        <div className="flex-1 overflow-hidden">
                                            <span className={`text-sm font-semibold truncate block ${
                                                isSelected ? 'text-indigo-700' : role === 'RELIEVER' ? 'text-purple-700' : 'text-slate-700'
                                            }`} title={empName}>{empName}</span>
                                            {role === 'RELIEVER' && (
                                                <span className="text-xs text-purple-500 font-medium">Reliever</span>
                                            )}
                                        </div>
                                        {isSelected && (
                                            <div className="shrink-0 w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center">
                                                <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                                            </div>
                                        )}
                                    </button>
                                );
                            }) : (
                                <div className="py-8 px-4 text-center bg-indigo-50/40 rounded-xl border border-dashed border-indigo-100">
                                    <p className="text-xs text-indigo-400 font-medium">No {supportRoleLabel}s on duty</p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="hidden md:flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-100 p-8 bg-slate-50/50">
                        <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-slate-300 mb-3 border border-slate-100">
                            <Zap className="w-5 h-5" strokeWidth={2} />
                        </div>
                        <p className="text-xs text-slate-400 text-center leading-relaxed">Support provider<br/>not required</p>
                    </div>
                )}
            </div>
        </div>
    );
};
