import React, { useState, useEffect, useMemo, useRef } from 'react';
import { toManilaDateStr } from '../../lib/time';
import { Branch, Service, Employee, Transaction, SalesReport, Attendance } from '../../types';
import { UI_THEME } from '../../constants/ui_designs';
import { playSound } from '../../lib/audio';
import { useBranchServiceTemplates } from '../../hooks/useNetworkData';

// Modular Imports
import { OperationsRegistry } from './branch-editor/OperationsRegistry';
import { OperatingHours } from './branch-editor/OperatingHours';
import { EncryptionKeys } from './branch-editor/EncryptionKeys';
import { LifecycleParameters } from './branch-editor/LifecycleParameters';
import { ServiceCatalogMatrix } from './branch-editor/ServiceCatalogMatrix';
import { ConnectivityControls } from './branch-editor/ConnectivityControls';
import { OwnerShares } from './branch-editor/OwnerShares';

interface ConfirmState {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'success' | 'warning';
    confirmText?: string;
    showCancel?: boolean;
}

interface BranchEditorProps {
    branch: Branch;
    employees: Employee[];
    masterServices: Service[];
    transactions: Transaction[];
    salesReports: SalesReport[];
    attendance: Attendance[];
    onSave: (updated: Branch) => Promise<void>;
    onToggle: (id: string, currentlyEnabled: boolean) => void;
    onToggleFaceId?: () => void;
    isFaceIdDisabled?: boolean;
    onResetPin: (branch: Branch) => Promise<string>;
    onForceLogout: (id: string) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onClose: () => void;
    isSaving: boolean;
    isReadOnly?: boolean;
    setConfirmState: (state: ConfirmState | ((prev: ConfirmState) => ConfirmState)) => void;
}

interface Toast {
    message: string;
    type: 'success' | 'error';
}

export const BranchEditor: React.FC<BranchEditorProps> = ({
                                                              branch, employees, masterServices, onSave, onToggle, onToggleFaceId, isFaceIdDisabled, onResetPin, onForceLogout, onDelete, onClose, isSaving, isReadOnly, setConfirmState,
                                                              transactions, salesReports, attendance
                                                          }) => {
    const [localBranch, setLocalBranch] = useState<Branch>(branch);
    const [localFaceIdDisabled, setLocalFaceIdDisabled] = useState(isFaceIdDisabled ?? false);
    const [toast, setToast] = useState<Toast | null>(null);
    const sidebarRef = useRef<HTMLDivElement>(null);

    const { data: branchTemplates } = useBranchServiceTemplates(branch.id);
    const catalogServices = useMemo<Service[]>(() => {
        if (branchTemplates && branchTemplates.length > 0) return branchTemplates as Service[];
        if (masterServices.length > 0) return masterServices;
        return localBranch.services || [];
    }, [branchTemplates, masterServices, localBranch.services]);

    const todayStr = useMemo(() => new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date()), []);

    const isOperationalToday = useMemo(() => {
        const hasTxs = transactions.some(t => t.branchId === branch.id && toManilaDateStr(t.timestamp) === todayStr);
        const hasAtt = attendance.some(a => a.branchId === branch.id && a.date === todayStr);
        const hasReport = salesReports.some(r => r.branchId === branch.id && r.reportDate === todayStr);
        return hasTxs || hasAtt || hasReport;
    }, [branch.id, transactions, attendance, salesReports, todayStr]);

    const potentialManagers = useMemo(() => {
        const branchSpecific = employees.filter(e => e.branchId === branch.id && e.isActive !== false);
        const networkManagers = employees.filter(e => e.role.split(',').includes('MANAGER') && e.isActive !== false);

        const combined = [...branchSpecific, ...networkManagers];
        const uniqueMap = new Map();
        combined.forEach(emp => {
            if (!uniqueMap.has(emp.name)) {
                uniqueMap.set(emp.name, emp);
            }
        });
        return Array.from(uniqueMap.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [employees, branch.id]);

    // FIX: Only re-sync local state if the user has switched to a DIFFERENT branch.
    // This prevents background global refreshes (which return the current DB state)
    // from clobbering the user's active, unsaved modifications.
    useEffect(() => {
        setLocalBranch(branch);
    }, [branch.id]);

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
    };

    const isDirty = useMemo(() => {
        // faceIdEnabled is a derived/ephemeral field merged at runtime — exclude from dirty check
        const { faceIdEnabled: _a, ...localCmp } = localBranch as any;
        const { faceIdEnabled: _b, ...branchCmp } = branch as any;
        return JSON.stringify(localCmp) !== JSON.stringify(branchCmp);
    }, [localBranch, branch]);

    const handleManualClose = () => {
        if (isDirty) {
            playSound('warning');
            setConfirmState({
                isOpen: true,
                title: 'Discard Changes?',
                message: `You have modified branch parameters for ${branch.name}. Exiting now will lose all unsynchronized updates.`,
                variant: 'danger',
                onConfirm: () => {
                    setConfirmState(p => ({ ...p, isOpen: false }));
                    onClose();
                }
            });
        } else {
            onClose();
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
            handleManualClose();
        }
    };

    const handleUpdateLocal = (updates: Partial<Branch>) => {
        // ENFORCEMENT: Block time updates if operational
        if (isOperationalToday) {
            const timeUpdated = (updates.openingTime && updates.openingTime !== branch.openingTime) ||
                (updates.closingTime && updates.closingTime !== branch.closingTime);
            if (timeUpdated) {
                playSound('warning');
                showToast(`Branch Active: Time window is immutable for today.`, 'error');
                return;
            }
        }
        setLocalBranch(prev => ({ ...prev, ...updates }));
    };

    const handleSaveTrigger = () => {
        if (!isDirty) return;
        if (localBranch.isOpen && (!localBranch.manager || localBranch.manager.trim() === '')) {
            showToast(`Manager required to open Branch.`, 'error');
            playSound('warning');
            return;
        }

        playSound('click');
        setConfirmState({
            isOpen: true,
            title: 'Synchronize Branch?',
            message: `Commit all configuration updates to ${branch.name}? This will broadcast changes to the network immediately.`,
            variant: 'success',
            onConfirm: async () => {
                try {
                    setConfirmState(p => ({ ...p, isOpen: false }));
                    const payload = {
                        ...localBranch,
                        // FIX: Allow 0 as a valid number, only fallback to 800 if null/undefined
                        dailyProvisionAmount: (localBranch.dailyProvisionAmount !== undefined && localBranch.dailyProvisionAmount !== null)
                            ? Number(localBranch.dailyProvisionAmount)
                            : 800,
                        enableShiftTracking: false // Forced off globally while upcoming
                    };
                    await onSave(payload);
                    // Reset localBranch to exactly what was saved so isDirty becomes false
                    // and closing the editor no longer triggers the discard popup.
                    const { cutoffEffectiveDate, ...savedBranch } = payload;
                    setLocalBranch(savedBranch as typeof localBranch);
                    showToast('Configuration Synced');
                } catch (e) {
                    showToast('Sync Failed', 'error');
                }
            }
        });
    };

    const isManagerUnassigned = !localBranch.manager || localBranch.manager.trim() === '';

    return (
        <div
            className="fixed inset-0 z-[2000] bg-slate-950/80 backdrop-blur-sm flex items-end justify-center sm:items-center lg:justify-end animate-in fade-in duration-300"
            onClick={handleBackdropClick}
        >
            {toast && (
                <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[2500] px-6 py-3 rounded-full shadow-2xl animate-in slide-in-from-top-4 duration-300 font-bold text-[11px] uppercase tracking-widest bg-slate-900 text-white border border-white/10 flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${toast.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'} animate-pulse`}></div>
                    {toast.message}
                </div>
            )}

            <div
                ref={sidebarRef}
                className="bg-white w-full max-w-lg flex flex-col shadow-2xl relative
                  max-h-[92dvh] rounded-t-[28px] rounded-b-none sm:rounded-[28px] lg:rounded-none lg:h-full lg:max-h-full lg:max-w-xl lg:border-l lg:border-slate-100
                  animate-in slide-in-from-bottom-4 lg:slide-in-from-right lg:slide-in-from-bottom-0 duration-300 lg:duration-500"
            >
                <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white z-[160] shadow-sm rounded-t-[28px] sm:rounded-t-[28px] lg:rounded-t-none">
                    <div className="flex items-center gap-4">
                        <div className="w-11 h-11 bg-slate-900 rounded-2xl flex items-center justify-center text-xl shadow-lg">🏢</div>
                        <div className="min-w-0">
                            <h2 className="text-[15px] sm:text-lg font-bold text-slate-900 uppercase tracking-tighter leading-none truncate max-w-[150px] sm:max-w-[250px]">
                                {localBranch.name || 'New Branch'}
                            </h2>
                            <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-widest mt-1">Branch Calibration</p>
                        </div>
                    </div>

                    <button
                        onClick={handleManualClose}
                        className="group flex items-center gap-2 p-3 bg-slate-50 hover:bg-rose-600 rounded-2xl text-slate-400 hover:text-white transition-all active:scale-90 border border-slate-100 shadow-inner"
                    >
                        <span className="hidden sm:inline text-[9px] font-bold uppercase tracking-widest ml-1">Close Editor</span>
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-10 no-scrollbar pb-40">
                    <section className="space-y-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center text-sm">📝</div>
                            <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest">Branch Identity</h4>
                        </div>
                        <div className="bg-slate-50 p-6 rounded-[32px] border border-slate-100 space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Official Name</label>
                                <input
                                    type="text"
                                    value={localBranch.name}
                                    onChange={(e) => handleUpdateLocal({ name: e.target.value.toUpperCase() })}
                                    className="w-full bg-white border border-slate-200 px-5 py-4 rounded-2xl text-lg font-bold text-slate-900 uppercase tracking-tighter focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all outline-none"
                                    placeholder="Enter Branch Name"
                                />
                            </div>
                        </div>
                    </section>

                    <OperationsRegistry
                        branchId={branch.id}
                        isOpen={localBranch.isOpen}
                        manager={localBranch.manager || ''}
                        tempManager={localBranch.tempManager || ''}
                        potentialManagers={potentialManagers}
                        isSaving={isSaving}
                        onUpdate={handleUpdateLocal}
                    />

                    <OperatingHours
                        openingTime={localBranch.openingTime || '09:00'}
                        closingTime={localBranch.closingTime || '22:00'}
                        isSaving={isSaving}
                        isOperationalToday={isOperationalToday}
                        onUpdate={handleUpdateLocal}
                    />

                    <EncryptionKeys
                        isPinChanged={branch.isPinChanged}
                        pin={branch.pin}
                    />

                    <LifecycleParameters
                        weeklyCutoff={localBranch.weeklyCutoff}
                        originalCutoff={branch.weeklyCutoff}
                        cycleStartDate={localBranch.cycleStartDate || ''}
                        dailyProvisionAmount={localBranch.dailyProvisionAmount ?? 0}
                        isSaving={isSaving}
                        branch={localBranch}
                        onUpdate={handleUpdateLocal}
                    />

                    <OwnerShares
                        owners={localBranch.owners || []}
                        groupLevy={localBranch.groupLevy}
                        isSaving={isSaving}
                        onUpdate={handleUpdateLocal}
                    />

                    <ServiceCatalogMatrix
                        services={catalogServices}
                    />

                    {onToggleFaceId && (
                      <div className="bg-white rounded-2xl border border-slate-100 p-5 flex items-center justify-between gap-4">
                        <div>
                          <p className="text-[11px] font-black text-slate-800 uppercase tracking-widest">Face ID Recognition</p>
                          <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                            {localFaceIdDisabled ? 'Disabled — staff will use manual time-in' : 'Enabled — staff with enrolled faces use face scan'}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            playSound('warning');
                            setConfirmState({
                              isOpen: true,
                              title: localFaceIdDisabled ? 'Enable Face ID?' : 'Disable Face ID?',
                              message: localFaceIdDisabled
                                ? `Face ID recognition will be re-enabled for ${branch.name}. Staff with enrolled faces will use face scan for time-in.`
                                : `Face ID recognition will be disabled for ${branch.name}. All staff will revert to manual time-in until re-enabled.`,
                              variant: localFaceIdDisabled ? 'success' : 'warning',
                              onConfirm: () => {
                                setLocalFaceIdDisabled(d => !d); // optimistic flip
                                onToggleFaceId();
                                setConfirmState(p => ({ ...p, isOpen: false }));
                              }
                            });
                          }}
                          className={`relative shrink-0 w-12 h-6 rounded-full transition-colors duration-200 ${localFaceIdDisabled ? 'bg-slate-200' : 'bg-emerald-500'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${localFaceIdDisabled ? 'translate-x-0' : 'translate-x-6'}`} />
                        </button>
                      </div>
                    )}

                    <ConnectivityControls
                        isEnabled={localBranch.isEnabled}
                        isManagerUnassigned={isManagerUnassigned}
                        isSaving={isSaving}
                        isReadOnly={isReadOnly}
                        onToggle={() => {
                            playSound('warning');
                            const currentlyEnabled = localBranch.isEnabled;
                            setConfirmState({
                                isOpen: true,
                                title: currentlyEnabled ? `Deactivate Branch?` : `Activate Branch?`,
                                message: currentlyEnabled
                                    ? `${branch.name} will be marked as inactive. It will no longer appear in active operations but existing data is preserved.`
                                    : `${branch.name} will be marked as active and resume normal operations.`,
                                variant: currentlyEnabled ? 'warning' : 'success',
                                onConfirm: () => {
                                    onToggle(branch.id, currentlyEnabled);
                                    setLocalBranch(prev => ({ ...prev, isEnabled: !currentlyEnabled }));
                                    showToast(`Branch ${currentlyEnabled ? 'set to Inactive' : 'set to Active'}`);
                                    setConfirmState(p => ({ ...p, isOpen: false }));
                                }
                            });
                        }}
                        onForceLogout={() => {
                            playSound('warning');
                            setConfirmState({
                                isOpen: true,
                                title: 'FORCE LOGOUT ALL?',
                                message: `This will immediately terminate all active sessions for ${branch.name}. Users will be redirected to the login screen.`,
                                variant: 'danger',
                                onConfirm: async () => {
                                    try {
                                        await onForceLogout(branch.id);
                                        showToast('Logout Signal Broadcasted');
                                        setConfirmState(p => ({ ...p, isOpen: false }));
                                    } catch (e) {
                                        showToast('Broadcast Failed', 'error');
                                    }
                                }
                            });
                        }}
                        onResetPin={() => {
                            playSound('warning');
                            setConfirmState({
                                isOpen: true,
                                title: 'Reset Credentials?',
                                message: `A new random access code will be generated for ${branch.name}. Current manager credentials will be invalidated.`,
                                variant: 'warning',
                                onConfirm: async () => {
                                    try {
                                        const nPin = await onResetPin(branch);
                                        setLocalBranch(prev => ({ ...prev, pin: nPin, isPinChanged: false }));
                                        showToast(`PIN Reset to ${nPin}`);
                                        setConfirmState(p => ({ ...p, isOpen: false }));
                                    } catch (e) {
                                        showToast('Reset Failed', 'error');
                                    }
                                }
                            });
                        }}
                        onDelete={() => {
                            playSound('warning');
                            setConfirmState({
                                isOpen: true,
                                title: `ERASE BRANCH?`,
                                message: `Warning: This will erase ${branch.name} and ALL its history permanently. This action is irreversible.`,
                                variant: 'danger',
                                onConfirm: async () => {
                                    try {
                                        await onDelete(branch.id);
                                        showToast(`Branch Erased`);
                                        setConfirmState(p => ({ ...p, isOpen: false }));
                                        onClose();
                                    } catch (e: any) {
                                        if (e.code === '23503') {
                                            setConfirmState({
                                                isOpen: true,
                                                title: 'DELETION BLOCKED',
                                                message: `Cannot erase ${branch.name}. This branch still has active personnel or historical records linked to it. You must reassign or remove all Staff before decommissioning this branch.`,
                                                variant: 'danger',
                                                confirmText: 'Acknowledge Error',
                                                showCancel: false,
                                                onConfirm: () => setConfirmState(p => ({ ...p, isOpen: false }))
                                            });
                                        } else {
                                            setConfirmState(p => ({ ...p, isOpen: false }));
                                            showToast('Deletion failed. Please try again.', 'error');
                                        }
                                    }
                                }
                            });
                        }}
                    />
                </div>

                {!isReadOnly && (
                  <div className="p-5 sm:p-6 bg-white border-t shadow-[0_-25px_60px_rgba(0,0,0,0.08)] relative z-[170] lg:rounded-b-none">
                    <button
                        onClick={handleSaveTrigger}
                        disabled={isSaving || !isDirty}
                        className={`w-full ${UI_THEME.styles.primaryButton} ${isSaving || !isDirty ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-slate-950 text-white hover:bg-emerald-600 shadow-emerald-200'} ${isDirty ? 'ring-4 ring-emerald-500/20' : ''}`}
                    >
                        {isSaving ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                        {isSaving ? 'Syncing...' : isDirty ? 'Save Changes' : 'Saved'}
                    </button>
                  </div>
                )}
            </div>
        </div>
    );
};