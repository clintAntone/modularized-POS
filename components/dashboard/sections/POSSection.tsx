import React, { useState, useMemo } from 'react';
import { Branch, Transaction, Service, Employee, Attendance, AuthState } from '../../../types';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';
import { UI_THEME } from '../../../constants/ui_designs';
import { supabase } from '../../../lib/supabase';
import { playSound } from '../../../lib/audio';

// Modular Capabilities
import { POSHeader } from './pos/POSHeader';
import { POSRegistryForm } from './pos/POSRegistryForm';
import { POSCorrections } from './pos/POSCorrections';
import { POSConfirmModal } from './pos/POSConfirmModal';

import { QRCodeSVG } from 'qrcode.react';

import { paymongoService } from '@/src/services/paymongo';
import { syncRelieverPayouts } from '@/src/services/relieverPayoutService';
import { useAddTransaction, useUpdateTransaction, useDeleteTransaction, useAddAuditLog } from '../../../hooks/useNetworkData';
import { getEmployeeRole, getEmployeeAllowance } from '../../../lib/payroll';
import { getTrueDate, getTrueManilaISOString, toManilaDateStr } from '../../../lib/time';
import { CreditCard, Check, Trash2 } from 'lucide-react';

const OFFLINE_QUEUE_KEY = 'hilot_core_pending_sync_v1';

interface POSSectionProps {
    user: Exclude<AuthState['user'], null>;
    branch: Branch;
    isRelief?: boolean;
    transactions: Transaction[];
    setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
    employees: Employee[];
    attendance: Attendance[];
    todayStr?: string;
    isClosedMode?: boolean;
    isPaymongoEnabled?: boolean;
    onRefresh?: () => void;
    onSyncStatusChange?: (isSyncing: boolean) => void;
    loading?: boolean;
    hiddenStaffNames?: Set<string>;
}

export type POSMode = 'CREATE' | 'CORRECTIONS' | 'EDITING';

import { CardSkeleton } from '../../ui/Skeleton';

export const POSSection: React.FC<POSSectionProps> = ({ user, branch, isRelief = false, transactions, setTransactions, employees, attendance, todayStr: propTodayStr, isClosedMode = false, isPaymongoEnabled = false, onRefresh, onSyncStatusChange, loading = false, hiddenStaffNames }) => {
    const [mode, setMode] = useState<POSMode>('CREATE');
    const [formData, setFormData] = useState({
        id: '',
        client_name: '',
        therapist_name: '',
        therapist_id: '',
        bonesetter_name: '',
        bonesetter_id: '',
        selected_service_ids: [] as string[],
        loyalty_service_ids: [] as string[],
        discount: 0,
        is_pwd_senior: false,
        note: '',
        payment_method: 'CASH' as 'CASH' | 'GCASH'
    });
    const [isProcessing, setIsProcessing] = useState(false);
    const [paymongoLink, setPaymongoLink] = useState<{ url: string, id: string } | null>(null);
    const [isCheckingPayment, setIsCheckingPayment] = useState(false);
    const [showPaymongoSuccess, setShowPaymongoSuccess] = useState(false);
    const [successDetails, setSuccessDetails] = useState<{
        clientName: string; total: number; serviceName: string;
        paymentMethod: string; isOffline: boolean;
    } | null>(null);
    const [showConfirm, setShowConfirm] = useState(false);
    const [txToDelete, setTxToDelete] = useState<Transaction | null>(null);

    const addTransaction = useAddTransaction();
    const updateTransaction = useUpdateTransaction();
    const deleteTransaction = useDeleteTransaction();
    const addAuditLog = useAddAuditLog();

    // Auto-poll for PayMongo payment
    React.useEffect(() => {
        let pollInterval: NodeJS.Timeout;
        if (paymongoLink && !isCheckingPayment) {
            pollInterval = setInterval(() => {
                checkPaymentStatus(true); // silent check
            }, 5000);
        }
        return () => {
            if (pollInterval) clearInterval(pollInterval);
        };
    }, [paymongoLink, isCheckingPayment]);

    // React to background status updates (e.g. from Webhooks)
    React.useEffect(() => {
        if (paymongoLink) {
            const tx = transactions.find(t => t.paymongoLinkId === paymongoLink.id);
            if (tx && tx.paymentStatus === 'PAID') {
                // Payment was verified externally (webhook or other terminal)
                playSound('success');
                setShowPaymongoSuccess(true);
                setTimeout(() => {
                    setShowPaymongoSuccess(false);
                    resetForm();
                    if (onRefresh) onRefresh();
                }, 2000);
            }
        }
    }, [transactions, paymongoLink]);

    const todayStr = useMemo(() => {
        if (propTodayStr) return propTodayStr;
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Manila',
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(getTrueDate());
    }, [propTodayStr]);

    const todayTxs = useMemo(() => {
        return transactions.filter(t => t.branchId === branch.id && toManilaDateStr(t.timestamp) === todayStr)
            .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    }, [transactions, branch.id, todayStr]);

    const activeServices = useMemo(() => (branch.services || []), [branch.services]);

    const activeStaff = useMemo(() => {
        return employees.filter(e => {
            const isHomeBranch = e.branchId === branch.id;
            const isDesignatedManager = branch.manager?.toUpperCase() === e.name?.toUpperCase();
            const isTempManager = branch.tempManager?.toUpperCase() === e.name?.toUpperCase();
            const isAuthorizedByAllowance = e.branchAllowances && typeof e.branchAllowances === 'object' && branch.id in (e.branchAllowances as any);
            
            const isAuthorized = isHomeBranch || isDesignatedManager || isTempManager || isAuthorizedByAllowance;

            if (!isAuthorized || e.isActive !== true) return false;

            const targetDate = todayStr;
            const attendanceRecord = attendance.find(a => a.employeeId === e.id && a.date === targetDate);
            const isOnDuty = attendanceRecord && attendanceRecord.clockIn && !attendanceRecord.clockOut;

            return isOnDuty;
        });
    }, [employees, branch.id, branch.manager, attendance, todayStr]);

    const availableTherapists = useMemo(() =>
        activeStaff.filter(e => {
            const currentRole = getEmployeeRole(e, branch.id);
            const roles = (currentRole || '').split(',');
            return roles.includes('THERAPIST') || roles.includes('MANAGER') || roles.includes('RELIEVER');
        }).map(e => ({ ...e, currentRole: getEmployeeRole(e, branch.id) })), [activeStaff, branch.id]);

    const availableBonesetters = useMemo(() =>
        activeStaff.filter(e => {
            const currentRole = getEmployeeRole(e, branch.id);
            const roles = (currentRole || '').split(',');
            return roles.includes('BONESETTER') || roles.includes('MANAGER') || roles.includes('RELIEVER');
        }).map(e => ({ ...e, currentRole: getEmployeeRole(e, branch.id) })), [activeStaff, branch.id]);

    const resetForm = () => {
        setFormData({ 
            id: '', 
            client_name: '', 
            therapist_name: '', 
            therapist_id: '', 
            bonesetter_name: '', 
            bonesetter_id: '',
            selected_service_ids: [], 
            loyalty_service_ids: [],
            discount: 0, 
            is_pwd_senior: false, 
            note: '', 
            payment_method: 'CASH'
        });
        setShowConfirm(false);
        setIsProcessing(false);
        setPaymongoLink(null);
        setIsCheckingPayment(false);
        setMode('CREATE');
    };

    const handleStartEdit = (tx: Transaction) => {
        playSound('click');
        const rawServiceIds = tx.serviceId ? tx.serviceId.split(',') : [];
        
        const selected_service_ids: string[] = [];
        const loyalty_service_ids: string[] = [];

        rawServiceIds.forEach(item => {
            if (item.includes(':')) {
                const [id, type] = item.split(':');
                if (type === 'L') loyalty_service_ids.push(id);
                else selected_service_ids.push(id);
            } else {
                // Backward compatibility: assume standard if no suffix
                selected_service_ids.push(item);
            }
        });

        setFormData({
            id: tx.id,
            client_name: tx.clientName,
            therapist_name: tx.therapistName || '',
            therapist_id: tx.therapistId || '',
            bonesetter_name: tx.bonesetterName || '',
            bonesetter_id: tx.bonesetterId || '',
            selected_service_ids,
            loyalty_service_ids,
            discount: tx.discount || 0,
            is_pwd_senior: tx.discount >= 50 && (tx.discount === 50 || tx.discount === 100 || (tx.discount % 50 === 0)),
            note: tx.note || '',
            payment_method: tx.paymentMethod || 'CASH'
        });
        setMode('EDITING');
    };

    const handleFinalize = async () => {
        const standardServices = activeServices.filter(s => formData.selected_service_ids.includes(s.id));
        const loyaltyServices = activeServices.filter(s => formData.loyalty_service_ids.includes(s.id));
        
        const allSelectedServices = [
            ...standardServices.map(s => ({ ...s, isLoyalty: false })),
            ...loyaltyServices.map(s => ({ ...s, isLoyalty: true }))
        ];

        if (allSelectedServices.length === 0 || isProcessing || isClosedMode) return;
        setIsProcessing(true);

        const manilaTimestamp = getTrueManilaISOString();

        const timestamp = mode === 'EDITING'
            ? (todayTxs.find(t => t.id === formData.id)?.timestamp || manilaTimestamp)
            : manilaTimestamp;

        const currentBasePrice = standardServices.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
        const pwdDiscount = (formData.is_pwd_senior && currentBasePrice > 0) ? (currentBasePrice > 900 ? 100 : 50) : 0;
        const totalDiscount = Math.min(currentBasePrice, Number(formData.discount || 0) + pwdDiscount);
        const totalCalculated = Math.max(0, currentBasePrice - totalDiscount);

        const calculateTotalCommission = (services: Service[], discount: number, role: 'THERAPIST' | 'BONESETTER'): number => {
            const basePrice = services.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
            const totalPrice = basePrice;
            
            return services.reduce((sum, s) => {
                const sPrice = Number(s.price) || 0;
                
                // Proportionally distribute the discount based on sPrice
                const sDiscount = totalPrice > 0 ? (discount * sPrice) / totalPrice : 0;
                const finalSPrice = Math.max(0, sPrice - sDiscount);
                
                const sPrimaryRole = s.primaryRole || 'THERAPIST';
                if (sPrimaryRole === role) {
                    return sum + (s.commissionType === 'fixed' ? Number(s.commissionValue || 0) : (finalSPrice * Number(s.commissionValue || 0)) / 100);
                } else if (s.isDualProvider) {
                    const sSecondaryRole = sPrimaryRole === 'THERAPIST' ? 'BONESETTER' : 'THERAPIST';
                    if (sSecondaryRole === role) {
                        return sum + (s.secondaryCommissionType === 'fixed' ? Number(s.secondaryCommissionValue || 0) : (finalSPrice * Number(s.secondaryCommissionValue || 0)) / 100);
                    }
                }
                return sum;
            }, 0);
        };

        const therapistComm = calculateTotalCommission(standardServices, totalDiscount, 'THERAPIST') + 
                             calculateTotalCommission(loyaltyServices, 0, 'THERAPIST');
        
        const bonesetterComm = calculateTotalCommission(standardServices, totalDiscount, 'BONESETTER') + 
                               calculateTotalCommission(loyaltyServices, 0, 'BONESETTER');

        const id = mode === 'EDITING' ? formData.id : Math.random().toString(36).substr(2, 9);
        const serviceNamesStr = allSelectedServices.map(s => s.isLoyalty ? `${s.name} (LOYALTY)` : s.name).join(' + ');
        const clientNameUpper = formData.client_name.trim().toUpperCase();

        // Combine IDs with suffixes for DB storage
        const combinedServiceIds = [
            ...formData.selected_service_ids.map(sid => `${sid}:S`),
            ...formData.loyalty_service_ids.map(sid => `${sid}:L`)
        ].join(',');

        const dbPayload = {
            [DB_COLUMNS.ID]: id,
            [DB_COLUMNS.BRANCH_ID]: branch.id,
            [DB_COLUMNS.CLIENT_NAME]: clientNameUpper,
            [DB_COLUMNS.THERAPIST_NAME]: formData.therapist_name.trim().toUpperCase(),
            [DB_COLUMNS.THERAPIST_ID]: formData.therapist_id,
            [DB_COLUMNS.BONESETTER_NAME]: formData.bonesetter_name.trim().toUpperCase(),
            [DB_COLUMNS.BONESETTER_ID]: formData.bonesetter_id,
            [DB_COLUMNS.SERVICE_ID]: combinedServiceIds,
            [DB_COLUMNS.SERVICE_NAME]: serviceNamesStr,
            [DB_COLUMNS.BASE_PRICE]: currentBasePrice,
            [DB_COLUMNS.DISCOUNT]: totalDiscount,
            [DB_COLUMNS.PRIMARY_COMMISSION]: therapistComm,
            [DB_COLUMNS.SECONDARY_COMMISSION]: bonesetterComm,
            [DB_COLUMNS.TOTAL]: totalCalculated,
            [DB_COLUMNS.TIMESTAMP]: timestamp,
            [DB_COLUMNS.NOTE]: formData.note.trim(),
            payment_method: formData.payment_method,
            payment_status: (formData.payment_method === 'GCASH' && isPaymongoEnabled) ? 'PENDING' : 'PAID'
        };

        // PayMongo Integration
        if (formData.payment_method === 'GCASH' && isPaymongoEnabled && mode !== 'EDITING') {
            try {
                const linkData = await paymongoService.createLink({
                    amount: totalCalculated,
                    description: `HilotCenter Session: ${clientNameUpper}`,
                    remarks: `Branch: ${branch.name} | Services: ${serviceNamesStr}`
                });
                
                if (linkData.attributes?.checkout_url) {
                    setPaymongoLink({ 
                        url: linkData.attributes.checkout_url, 
                        id: linkData.id 
                    });
                    
                    // Save the pending transaction first
                    const { error: dbError } = await supabase.from(DB_TABLES.TRANSACTIONS).upsert({
                        ...dbPayload,
                        paymongo_link_id: linkData.id
                    });
                    if (dbError) throw dbError;
                    
                    setIsProcessing(false);
                    setShowConfirm(false);
                    return; // Stop here, wait for payment
                } else {
                    throw new Error("Failed to generate PayMongo link");
                }
            } catch (err) {
                console.error("PayMongo Link Error:", err);
                alert("Failed to initiate PayMongo payment. Please try again or use Cash.");
                setIsProcessing(false);
                return;
            }
        }

        let auditDescription = `New transaction recorded for client: ${clientNameUpper}. Yield: ₱${totalCalculated}. Services: ${serviceNamesStr}`;

        if (mode === 'EDITING') {
            const oldTx = transactions.find(t => t.id === id);
            if (oldTx) {
                const changes = [];
                if (oldTx.clientName !== clientNameUpper) changes.push(`Client: ${oldTx.clientName} -> ${clientNameUpper}`);
                if (oldTx.total !== totalCalculated) changes.push(`Value: ₱${oldTx.total} -> ₱${totalCalculated}`);
                auditDescription = `Authorized modification of session ID ${id.slice(-6).toUpperCase()}. Changes: ${changes.join(', ')}`;
            }
        }

        const auditPayload = {
            [DB_COLUMNS.BRANCH_ID]: branch.id,
            [DB_COLUMNS.TIMESTAMP]: getTrueManilaISOString(),
            [DB_COLUMNS.ACTIVITY_TYPE]: mode === 'EDITING' ? 'UPDATE' : 'CREATE',
            [DB_COLUMNS.ENTITY_TYPE]: 'TRANSACTION',
            [DB_COLUMNS.ENTITY_ID]: id,
            [DB_COLUMNS.DESCRIPTION]: auditDescription,
            [DB_COLUMNS.AMOUNT]: totalCalculated,
            [DB_COLUMNS.PERFORMER_NAME]: branch.manager || 'AUTHORIZED TERMINAL MANAGER'
        };

        const onFinalSuccess = (isOffline = false) => {
            playSound('success');
            setShowConfirm(false);
            setSuccessDetails({
                clientName: clientNameUpper,
                total: totalCalculated,
                serviceName: serviceNamesStr,
                paymentMethod: formData.payment_method,
                isOffline,
            });
            if (!isOffline) {
                // Fire reliever payout sync in background — don't block the form reset or data refresh.
                syncRelieverPayouts(branch, todayStr, employees, hiddenStaffNames)
                    .catch(err => console.error('[RelieverSync] Background sync failed:', err));
            }
            setTimeout(() => {
                setSuccessDetails(null);
                resetForm();
                if (onRefresh) onRefresh();
            }, 2500);
        };

        try {
            // Check connectivity before attempt
            if (!navigator.onLine) {
                throw new Error("NETWORK_OFFLINE");
            }

            // Run transaction write and audit log in parallel — they're independent
            if (mode === 'EDITING') {
                await Promise.all([
                    updateTransaction.mutateAsync(dbPayload),
                    addAuditLog.mutateAsync(auditPayload)
                ]);
            } else {
                await Promise.all([
                    addTransaction.mutateAsync(dbPayload),
                    addAuditLog.mutateAsync(auditPayload)
                ]);
            }

            // AUTOMATIC POS BONUS DETECTION
            // Refined Logic: Delegate gets bonus if manager is absent/inactive and delegate is active
            if (isRelief && user.employeeId) {
                const managerName = branch.manager?.toUpperCase();
                const managerAttendance = attendance.find(a => a.staffName?.toUpperCase() === managerName && a.date === todayStr);
                const managerTimedIn = !!(managerAttendance && managerAttendance.clockIn);
                
                const managerHandledClient = transactions.some(t => 
                    (t.therapistName?.toUpperCase() === managerName || t.bonesetterName?.toUpperCase() === managerName) &&
                    toManilaDateStr(t.timestamp) === todayStr
                );

                const myAttendance = attendance.find(a => a.employeeId === user.employeeId && a.date === todayStr);
                const delegateTimedIn = !!(myAttendance && myAttendance.clockIn);

                // Conditions: Manager not timed in AND manager has no clients AND delegate is timed in
                if (!managerTimedIn && !managerHandledClient && delegateTimedIn) {
                    if (myAttendance && !myAttendance.isPosHandled) {
                        try {
                            await supabase
                                .from(DB_TABLES.ATTENDANCE)
                                .update({ is_pos_handled: true })
                                .eq('id', myAttendance.id);
                            
                            // Also add an audit log for this automatic bonus
                            await addAuditLog.mutateAsync({
                                [DB_COLUMNS.BRANCH_ID]: branch.id,
                                [DB_COLUMNS.TIMESTAMP]: getTrueManilaISOString(),
                                [DB_COLUMNS.ACTIVITY_TYPE]: 'UPDATE',
                                [DB_COLUMNS.ENTITY_TYPE]: 'ATTENDANCE',
                                [DB_COLUMNS.ENTITY_ID]: myAttendance.id,
                                [DB_COLUMNS.DESCRIPTION]: `Automated POS Handling Bonus (+100) awarded to delegate manager: ${myAttendance.staffName} (Manager ${managerName} absent/inactive)`,
                                [DB_COLUMNS.PERFORMER_NAME]: 'SYSTEM CORE'
                            });
                        } catch (attErr) {
                            console.error("Failed to auto-award POS bonus:", attErr);
                        }
                    }
                }
            }

            onFinalSuccess();
        } catch (e: any) {
            console.warn("Mainframe unreachable. Storing session locally for relay.", e);

            // OFFLINE QUEUEING
            try {
                const existingQueue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
                existingQueue.push({ table: DB_TABLES.TRANSACTIONS, data: dbPayload, audit: auditPayload });
                localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(existingQueue));
            } catch (storageErr) {
                console.error("Local storage allocation failed:", storageErr);
            }

            // PROCEED AS SUCCESS TO KEEP WORKFLOW FLOWING
            onFinalSuccess(true);
        }
    };

    const handleDeleteTrigger = (txId: string) => {
        const targetTx = transactions.find(t => t.id === txId);
        if (targetTx) {
            playSound('warning');
            setTxToDelete(targetTx);
        }
    };

    const handleFinalDelete = async () => {
        if (!txToDelete || isProcessing || isClosedMode) return;
        const targetTx = txToDelete;

        setIsProcessing(true);
        try {
            // Run delete and audit log in parallel — audit log doesn't depend on delete result
            await Promise.all([
                deleteTransaction.mutateAsync({ id: targetTx.id, branchId: branch.id }),
                addAuditLog.mutateAsync({
                    [DB_COLUMNS.BRANCH_ID]: branch.id,
                    [DB_COLUMNS.TIMESTAMP]: getTrueManilaISOString(),
                    [DB_COLUMNS.ACTIVITY_TYPE]: 'DELETE',
                    [DB_COLUMNS.ENTITY_TYPE]: 'TRANSACTION',
                    [DB_COLUMNS.ENTITY_ID]: targetTx.id,
                    [DB_COLUMNS.DESCRIPTION]: `Authorized registry scrub of transaction for client: ${targetTx.clientName}. Recovered value: ₱${targetTx.total}`,
                    [DB_COLUMNS.AMOUNT]: targetTx.total,
                    [DB_COLUMNS.PERFORMER_NAME]: branch.manager || 'AUTHORIZED TERMINAL MANAGER'
                })
            ]);

            // Fire reliever sync in background — don't block UI feedback
            syncRelieverPayouts(branch, todayStr, employees, hiddenStaffNames)
                .catch(err => console.error('[RelieverSync] Background sync failed:', err));

            playSound('success');
            setTxToDelete(null);
            if (onRefresh) onRefresh();
        } catch (err) {
            console.error(err);
        } finally {
            setIsProcessing(false);
        }
    };

    const checkPaymentStatus = async (silent = false) => {
        if (!paymongoLink) return;
        if (!silent) setIsCheckingPayment(true);
        try {
            const data = await paymongoService.checkStatus(paymongoLink.id);
            
            if (data.attributes?.status === 'paid') {
                // Update transaction status in DB
                const { error } = await supabase
                    .from(DB_TABLES.TRANSACTIONS)
                    .update({ payment_status: 'PAID' })
                    .eq('paymongo_link_id', paymongoLink.id);
                
                if (error) throw error;
                
                await syncRelieverPayouts(branch, todayStr, employees, hiddenStaffNames);
                
                // Add Audit Log
                await supabase.from(DB_TABLES.AUDIT_LOGS).insert({
                    [DB_COLUMNS.BRANCH_ID]: branch.id,
                    [DB_COLUMNS.TIMESTAMP]: getTrueManilaISOString(),
                    [DB_COLUMNS.ACTIVITY_TYPE]: 'UPDATE',
                    [DB_COLUMNS.ENTITY_TYPE]: 'TRANSACTION',
                    [DB_COLUMNS.ENTITY_ID]: paymongoLink.id,
                    [DB_COLUMNS.DESCRIPTION]: `PayMongo Payment Paid for link ${paymongoLink.id}`,
                    [DB_COLUMNS.PERFORMER_NAME]: 'PAYMONGO_SYSTEM'
                });

                playSound('success');
                setShowPaymongoSuccess(true);
                setTimeout(() => {
                    setShowPaymongoSuccess(false);
                    resetForm();
                    if (onRefresh) onRefresh();
                }, 2000);
            } else if (!silent) {
                playSound('warning');
                alert("Payment not yet detected. Please ensure the customer has completed the transaction.");
            }
        } catch (err) {
            if (!silent) console.error("Status Check Error:", err);
        } finally {
            if (!silent) setIsCheckingPayment(false);
        }
    };

    if (loading) {
        return (
            <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 px-4">
                <div className="h-16 bg-slate-200/60 rounded-2xl animate-pulse w-full" />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <CardSkeleton />
                    <CardSkeleton />
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-4 md:space-y-6 no-print pb-10 px-2 sm:px-6">
            {/* PAYMONGO MODAL */}
            {paymongoLink && (
                <div className={UI_THEME.layout.modalWrapper}>
                    <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-8 text-center space-y-6 border border-slate-100 shadow-2xl`}>
                        <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                            <CreditCard className="w-10 h-10" strokeWidth={2.5} />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Digital Payment Gateway</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Awaiting Digital Settlement</p>
                        </div>
                        
                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                            <div className="bg-white p-4 rounded-2xl shadow-inner inline-block mx-auto border border-slate-100">
                                <QRCodeSVG value={paymongoLink.url} size={160} level="H" includeMargin={true} />
                            </div>
                            <p className="text-[11px] font-bold text-slate-600 uppercase leading-relaxed">
                                Please ask the customer to scan the QR or use the link below to pay via GCash, Maya, or Cards.
                            </p>
                            <a 
                                href={paymongoLink.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="block w-full bg-white border border-slate-200 p-4 rounded-xl text-emerald-600 font-black text-[10px] uppercase tracking-widest hover:bg-emerald-50 transition-all truncate"
                            >
                                Open Payment Link
                            </a>
                        </div>

                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-center gap-2 py-2">
                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                                <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Monitoring for payment...</span>
                            </div>
                            <button
                                onClick={() => checkPaymentStatus(false)}
                                disabled={isCheckingPayment}
                                className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl text-[12px] uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3"
                            >
                                {isCheckingPayment ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : 'Verify Payment'}
                            </button>
                            <button
                                onClick={() => setPaymongoLink(null)}
                                className="w-full text-slate-400 font-bold py-3 rounded-xl text-[10px] uppercase tracking-widest"
                            >
                                Close & Check Later
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showPaymongoSuccess && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-emerald-900/40 backdrop-blur-2xl animate-in fade-in duration-300">
                    <div className="bg-white p-10 rounded-[48px] shadow-2xl text-center space-y-6 animate-in zoom-in duration-300 border border-emerald-100 max-w-sm mx-4">
                        <div className="w-24 h-24 bg-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-2xl animate-bounce">
                            <Check className="w-12 h-12 text-white" strokeWidth={4} />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Payment Successful</h2>
                            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Digital Payment Successful</p>
                            <div className="pt-4">
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Transaction has been committed to registry.</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {successDetails && (
                <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-slate-900/60 backdrop-blur-2xl animate-in fade-in duration-300 p-4">
                    <div className="bg-white rounded-[40px] shadow-2xl text-center w-full max-w-xs animate-in zoom-in-95 duration-300 border border-slate-100 overflow-hidden">
                        {/* Color band */}
                        <div className={`${successDetails.isOffline ? 'bg-amber-500' : 'bg-emerald-600'} px-8 pt-10 pb-8 flex flex-col items-center gap-4`}>
                            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center shadow-inner">
                                <Check className="w-10 h-10 text-white" strokeWidth={4} />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">Saved!</h2>
                                <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mt-1">
                                    {successDetails.isOffline ? 'Saved Locally · Sync Pending' : 'Cloud Registry Updated'}
                                </p>
                            </div>
                        </div>
                        {/* Details */}
                        <div className="p-6 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">Client</span>
                                <span className="font-black text-slate-900 uppercase text-sm text-right truncate">{successDetails.clientName || 'WALK-IN'}</span>
                            </div>
                            <div className="flex items-start justify-between gap-3">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">Service</span>
                                <span className="font-bold text-slate-600 text-xs text-right uppercase leading-tight">{successDetails.serviceName}</span>
                            </div>
                            <div className="h-px bg-slate-100"></div>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total</span>
                                <span className={`font-black text-2xl tabular-nums ${successDetails.isOffline ? 'text-amber-600' : 'text-emerald-600'}`}>
                                    ₱{successDetails.total.toLocaleString()}
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Payment</span>
                                <span className={`text-[10px] font-black uppercase tracking-widest ${successDetails.paymentMethod === 'GCASH' ? 'text-blue-600' : 'text-slate-700'}`}>
                                    {successDetails.paymentMethod}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {txToDelete && (
                <div className={UI_THEME.layout.modalWrapper}>
                    <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-10 text-center border border-slate-100`}>
                        <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                            <Trash2 className="w-8 h-8" strokeWidth={3} />
                        </div>
                        <h4 className="text-2xl font-bold text-slate-900 mb-2 uppercase tracking-tighter">Scrub Session?</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                            AUTHORIZED DATA SCRUB: Permanently remove the session for <span className="text-slate-900">{txToDelete.clientName}</span> from terminal registry? This action is irreversible.
                        </p>
                        <div className="flex flex-col gap-4 mt-10">
                            <button
                                onClick={handleFinalDelete}
                                disabled={isProcessing}
                                className="w-full bg-rose-600 text-white font-black py-5 rounded-2xl text-[12px] uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3"
                            >
                                {isProcessing ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : 'Confirm Erasure'}
                            </button>
                            <button
                                onClick={() => setTxToDelete(null)}
                                disabled={isProcessing}
                                className="w-full text-slate-400 font-bold py-4 rounded-xl text-[12px] uppercase tracking-widest"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <POSHeader mode={mode} setMode={(m) => { setMode(m); if (m === 'CREATE') resetForm(); }} />

            {mode === 'CORRECTIONS' ? (
                <POSCorrections
                    transactions={todayTxs}
                    onEdit={handleStartEdit}
                    onDelete={handleDeleteTrigger}
                    isProcessing={isProcessing}
                    isClosedMode={isClosedMode}
                />
            ) : (
                <POSRegistryForm
                    mode={mode}
                    branch={branch}
                    formData={formData}
                    setFormData={setFormData}
                    activeServices={activeServices}
                    availableTherapists={availableTherapists}
                    availableBonesetters={availableBonesetters}
                    isProcessing={isProcessing}
                    isClosedMode={isClosedMode}
                    isPaymongoEnabled={isPaymongoEnabled}
                    onFinalize={() => setShowConfirm(true)}
                    onAbort={resetForm}
                />
            )}

            {showConfirm && (
                <POSConfirmModal
                    mode={mode}
                    formData={formData}
                    activeServices={activeServices}
                    isProcessing={isProcessing}
                    onClose={() => setShowConfirm(false)}
                    onConfirm={handleFinalize}
                />
            )}
        </div>
    );
};