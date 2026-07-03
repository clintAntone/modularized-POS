
import React from 'react';
import { Employee } from '../../../../types';
import { playSound } from '../../../../lib/audio';
import { DB_COLUMNS } from '../../../../constants/db_schema';
import { ShieldCheck, User, Zap, Clock, Check } from 'lucide-react';

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

const StaffIcons = {
    MANAGER: <ShieldCheck className="w-4 h-4" strokeWidth={2.5} />,
    THERAPIST: <User className="w-4 h-4" strokeWidth={2.5} />,
    BONESETTER: <Zap className="w-4 h-4" strokeWidth={2.5} />,
    RELIEVER: <Clock className="w-4 h-4" strokeWidth={2.5} />
};

export const POSStaffSelection: React.FC<POSStaffSelectionProps> = (props) => {
    const leadList = props.primaryRole === 'BONESETTER' ? props.availableBonesetters : props.availableTherapists;
    const supportList = props.primaryRole === 'BONESETTER' ? props.availableTherapists : props.availableBonesetters;
    const supportRole = props.primaryRole === 'BONESETTER' ? 'THERAPIST' : 'BONESETTER';

    const leadRoleLabel = props.primaryRole === 'BONESETTER' ? 'Bonesetter' : 'Therapist';
    const supportRoleLabel = props.primaryRole === 'BONESETTER' ? 'Therapist' : 'Bonesetter';

    return (
        <div className="bg-white p-6 md:p-10 rounded-[44px] shadow-sm border border-slate-100 space-y-8">
            <div className="flex items-center justify-between px-2 mb-2">
                <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.3em]">Authorized Providers</h3>
                {props.isDualProviderRequired && <span className="bg-indigo-50 text-indigo-600 px-2 py-1 rounded-lg text-[8px] font-bold uppercase tracking-widest border border-indigo-100 animate-pulse">Dual Provider Required</span>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                {/* Lead Column - Emerald Theme */}
                <div className="space-y-5">
                    <div className="flex items-center gap-3 ml-1">
                        <div className="w-1.5 h-6 bg-emerald-600 rounded-full"></div>
                        <label className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">{leadRoleLabel} (LEAD)</label>
                    </div>
                    <div className="flex flex-col gap-2 min-h-[100px]">
                        {leadList.length > 0 ? leadList.map(emp => {
                            const empName = emp[DB_COLUMNS.NAME];
                            const empId = emp[DB_COLUMNS.ID];
                            const isSelected = props.primaryRole === 'BONESETTER' ? props.selectedBonesetterId === empId : props.selectedTherapistId === empId;
                            
                            const currentRole = (emp as any).currentRole || '';
                            const roles = currentRole.split(',');
                            const role = roles.includes('MANAGER') ? 'MANAGER' : 
                                         roles.includes('RELIEVER') ? 'RELIEVER' : 
                                         roles.includes('BONESETTER') ? 'BONESETTER' : 'THERAPIST';

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
                                    className={`w-full py-6 px-5 rounded-2xl border-2 flex items-center justify-between transition-all duration-300 active:scale-[0.98] ${isSelected ? 'bg-emerald-700 border-emerald-700 text-white shadow-xl shadow-emerald-100 translate-x-1' : role === 'RELIEVER' ? 'bg-purple-50 border-purple-100 text-purple-600 hover:bg-purple-100 hover:border-purple-200' : 'bg-slate-50 border-transparent text-slate-400 hover:bg-slate-100 hover:border-slate-200'}`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`transition-colors ${isSelected ? 'text-emerald-300' : 'text-slate-300'}`}>
                                            {(StaffIcons as any)[role] || StaffIcons.THERAPIST}
                                        </div>
                                        <div className="flex flex-col overflow-hidden">
                                            <span className="text-[11px] font-bold uppercase tracking-[0.1em] truncate max-w-[140px]" title={empName}>{empName}</span>
                                        </div>
                                    </div>
                                    {isSelected && <Check className="w-5 h-5 text-white" strokeWidth={4} />}
                                </button>
                            );
                        }) : (
                            <div className="py-8 px-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 opacity-60">
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-tight">No {leadRoleLabel}s On-Duty/Clocked In</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Support Column - Indigo Theme */}
                {props.isDualProviderRequired ? (
                    <div className="space-y-5 animate-in slide-in-from-right duration-500">
                        <div className="flex items-center gap-3 ml-1">
                            <div className="w-1.5 h-6 bg-indigo-600 rounded-full"></div>
                            <label className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">{supportRoleLabel} (SUPPORT)</label>
                        </div>
                        <div className="flex flex-col gap-2 min-h-[100px]">
                            {supportList.length > 0 ? supportList.map(emp => {
                                const empName = emp[DB_COLUMNS.NAME];
                                const empId = emp[DB_COLUMNS.ID];
                                const isSelected = props.primaryRole === 'BONESETTER' ? props.selectedTherapistId === empId : props.selectedBonesetterId === empId;
                                
                                const currentRole = (emp as any).currentRole || '';
                                const roles = currentRole.split(',');
                                const role = roles.includes('MANAGER') ? 'MANAGER' : 
                                             roles.includes('RELIEVER') ? 'RELIEVER' : 
                                             roles.includes('BONESETTER') ? 'BONESETTER' : 'THERAPIST';

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
                                        className={`w-full py-6 px-5 rounded-2xl border-2 flex items-center justify-between transition-all duration-300 active:scale-[0.98] ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-100 -translate-x-1' : role === 'RELIEVER' ? 'bg-purple-50 border-purple-100 text-purple-600 hover:bg-purple-100 hover:border-purple-200' : 'bg-slate-50 border-transparent text-slate-400 hover:bg-indigo-50 hover:border-indigo-100 hover:text-indigo-600'}`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`transition-colors ${isSelected ? 'text-indigo-100' : 'text-slate-300'}`}>
                                                {(StaffIcons as any)[role] || StaffIcons.BONESETTER}
                                            </div>
                                            <div className="flex flex-col overflow-hidden">
                                                <span className="text-[11px] font-bold uppercase tracking-[0.1em] truncate max-w-[140px]" title={empName}>{empName}</span>
                                            </div>
                                        </div>
                                        {isSelected && <Check className="w-5 h-5 text-white" strokeWidth={4} />}
                                    </button>
                                );
                            }) : (
                                <div className="py-8 px-6 text-center bg-indigo-50/30 rounded-2xl border border-dashed border-indigo-100 opacity-60">
                                    <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest leading-tight">No Specialists On-Duty/Clocked In</p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="hidden md:flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-[40px] p-8 opacity-40 group hover:opacity-60 transition-opacity">
                        <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 mb-4 transition-all border border-slate-100 group-hover:scale-105 duration-500">
                            <Zap className="w-6 h-6" strokeWidth={2.5} />
                        </div>
                        <p className="text-[9px] font-bold uppercase tracking-[0.5em] text-center px-10 leading-relaxed text-slate-400">Specialist Support Not Required</p>
                    </div>
                )}
            </div>
        </div>
    );
};
