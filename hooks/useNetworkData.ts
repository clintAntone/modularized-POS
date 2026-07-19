import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../constants/db_schema';
import { getTrueDate, getTrueISOString } from '../lib/time';
import { Branch, Transaction, Expense, Employee, SalesReport, AuditLog, Attendance, UserRole, AuthState } from '../types';

// Mappers
const mapDbBranch = (db: any): Branch => ({
    id: db[DB_COLUMNS.ID],
    name: db[DB_COLUMNS.NAME],
    pin: db[DB_COLUMNS.PIN],
    isPinChanged: Boolean(db[DB_COLUMNS.IS_PIN_CHANGED]),
    isEnabled: Boolean(db[DB_COLUMNS.IS_ENABLED]),
    isOpen: Boolean(db[DB_COLUMNS.IS_OPEN]),
    isOpenDate: db[DB_COLUMNS.IS_OPEN_DATE] ?? '',
    manager: db[DB_COLUMNS.MANAGER] || '',
    tempManager: db[DB_COLUMNS.TEMP_MANAGER] || '',
    services: typeof db[DB_COLUMNS.SERVICES] === 'string' ? JSON.parse(db[DB_COLUMNS.SERVICES]) : (db[DB_COLUMNS.SERVICES] || []),
    weeklyCutoff: Number(db[DB_COLUMNS.WEEKLY_CUTOFF] ?? 0),
    cycleStartDate: db[DB_COLUMNS.CYCLE_START_DATE] ?? '',
    dailyProvisionAmount: Number(db[DB_COLUMNS.DAILY_PROVISION_AMOUNT] ?? 800),
    enableShiftTracking: Boolean(db[DB_COLUMNS.ENABLE_SHIFT_TRACKING]),
    openingTime: db[DB_COLUMNS.OPENING_TIME] ?? '09:00',
    closingTime: db[DB_COLUMNS.CLOSING_TIME] ?? '22:00',
    shift2OpeningTime: db[DB_COLUMNS.SHIFT2_OPENING_TIME] || undefined,
    owners: typeof db[DB_COLUMNS.OWNERS] === 'string'
      ? JSON.parse(db[DB_COLUMNS.OWNERS])
      : (db[DB_COLUMNS.OWNERS] || []),
    groupLevy: (() => {
        const raw = db[DB_COLUMNS.GROUP_LEVY];
        if (!raw) return null;
        try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
    })(),
    refreshSignal: db[DB_COLUMNS.REFRESH_SIGNAL] ? Number(db[DB_COLUMNS.REFRESH_SIGNAL]) : null,
    vaultEnabled: Boolean(db[DB_COLUMNS.VAULT_ENABLED]),
});

const mapDbEmployee = (db: any): Employee => ({
    id: db[DB_COLUMNS.ID],
    branchId: db[DB_COLUMNS.BRANCH_ID],
    name: db[DB_COLUMNS.NAME],
    firstName: db[DB_COLUMNS.FIRST_NAME],
    middleName: db[DB_COLUMNS.MIDDLE_NAME],
    lastName: db[DB_COLUMNS.LAST_NAME],
    username: db[DB_COLUMNS.USERNAME],
    hasPinSet: Boolean(db[DB_COLUMNS.LOGIN_PIN]),
    requestReset: Boolean(db[DB_COLUMNS.REQUEST_RESET]),
    role: db[DB_COLUMNS.ROLE],
    allowance: Number(db[DB_COLUMNS.ALLOWANCE] || 0),
    isActive: db[DB_COLUMNS.IS_ACTIVE] !== false,
    profile: db[DB_COLUMNS.PROFILE],
    branchAllowances: typeof db[DB_COLUMNS.BRANCH_ALLOWANCES] === 'string' ? JSON.parse(db[DB_COLUMNS.BRANCH_ALLOWANCES]) : (db[DB_COLUMNS.BRANCH_ALLOWANCES] || {}),
    timestamp: db[DB_COLUMNS.TIMESTAMP] || db[DB_COLUMNS.CREATED_AT],
    ...(() => {
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(getTrueDate());
        const dbOnLeave = db[DB_COLUMNS.ON_LEAVE] === true;
        const endDate: string | null = db[DB_COLUMNS.LEAVE_END_DATE] ?? null;
        const onLeave = dbOnLeave && (!endDate || endDate >= today);
        return { onLeave, leaveType: db[DB_COLUMNS.LEAVE_TYPE] ?? undefined, leaveStartDate: db[DB_COLUMNS.LEAVE_START_DATE] ?? undefined, leaveEndDate: endDate ?? undefined };
    })(),
});

const BRANCH_COLS = [
    DB_COLUMNS.ID, DB_COLUMNS.NAME, DB_COLUMNS.PIN, DB_COLUMNS.IS_PIN_CHANGED,
    DB_COLUMNS.IS_ENABLED, DB_COLUMNS.IS_OPEN, DB_COLUMNS.IS_OPEN_DATE,
    DB_COLUMNS.MANAGER, DB_COLUMNS.TEMP_MANAGER, DB_COLUMNS.SERVICES,
    DB_COLUMNS.WEEKLY_CUTOFF, DB_COLUMNS.CYCLE_START_DATE, DB_COLUMNS.DAILY_PROVISION_AMOUNT,
    DB_COLUMNS.ENABLE_SHIFT_TRACKING, DB_COLUMNS.OPENING_TIME, DB_COLUMNS.CLOSING_TIME,
    DB_COLUMNS.OWNERS, DB_COLUMNS.GROUP_LEVY, DB_COLUMNS.REFRESH_SIGNAL, DB_COLUMNS.VAULT_ENABLED,
].join(',');

// face_descriptors intentionally excluded — large blob not needed for any list view
const EMPLOYEE_COLS = [
    DB_COLUMNS.ID, DB_COLUMNS.BRANCH_ID, DB_COLUMNS.NAME, DB_COLUMNS.FIRST_NAME,
    DB_COLUMNS.MIDDLE_NAME, DB_COLUMNS.LAST_NAME, DB_COLUMNS.USERNAME, DB_COLUMNS.LOGIN_PIN,
    DB_COLUMNS.REQUEST_RESET, DB_COLUMNS.ROLE, DB_COLUMNS.ALLOWANCE, DB_COLUMNS.IS_ACTIVE,
    DB_COLUMNS.PROFILE, DB_COLUMNS.BRANCH_ALLOWANCES, DB_COLUMNS.TIMESTAMP, DB_COLUMNS.CREATED_AT,
    DB_COLUMNS.ON_LEAVE, DB_COLUMNS.LEAVE_TYPE, DB_COLUMNS.LEAVE_START_DATE, DB_COLUMNS.LEAVE_END_DATE,
].join(',');

const TRANSACTION_COLS = [
    DB_COLUMNS.ID, DB_COLUMNS.BRANCH_ID, DB_COLUMNS.TIMESTAMP, DB_COLUMNS.CLIENT_NAME,
    DB_COLUMNS.THERAPIST_NAME, DB_COLUMNS.THERAPIST_ID, DB_COLUMNS.BONESETTER_NAME, DB_COLUMNS.BONESETTER_ID,
    DB_COLUMNS.SERVICE_ID, DB_COLUMNS.SERVICE_NAME, DB_COLUMNS.BASE_PRICE, DB_COLUMNS.DISCOUNT,
    DB_COLUMNS.VOUCHER_VALUE, DB_COLUMNS.PRIMARY_COMMISSION, DB_COLUMNS.SECONDARY_COMMISSION,
    DB_COLUMNS.TOTAL, DB_COLUMNS.PAYMENT_METHOD, DB_COLUMNS.PAYMENT_STATUS,
    DB_COLUMNS.PAYMONGO_LINK_ID, DB_COLUMNS.NOTE,
].join(',');

const SALES_REPORT_COLS = [
    DB_COLUMNS.ID, DB_COLUMNS.BRANCH_ID, DB_COLUMNS.REPORT_DATE, DB_COLUMNS.SUBMITTED_AT,
    DB_COLUMNS.GROSS_SALES, DB_COLUMNS.TOTAL_STAFF_PAY, DB_COLUMNS.TOTAL_EXPENSES,
    DB_COLUMNS.TOTAL_VAULT_PROVISION, DB_COLUMNS.NET_ROI,
    DB_COLUMNS.SESSION_DATA, DB_COLUMNS.STAFF_BREAKDOWN, DB_COLUMNS.EXPENSE_DATA, DB_COLUMNS.VAULT_DATA,
    DB_COLUMNS.BACKFILLED,
].join(',');

const SERVICE_CATALOG_COLS = [
    DB_COLUMNS.ID, DB_COLUMNS.NAME, DB_COLUMNS.SERVICES, DB_COLUMNS.BRANCH_IDS, DB_COLUMNS.CAN_BE_LOYALTY,
].join(',');

// Queries
export const useBranches = () => {
    return useQuery({
        queryKey: ['branches'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from(DB_TABLES.BRANCHES)
                .select(BRANCH_COLS)
                .order(DB_COLUMNS.NAME, { ascending: true });
            if (error) throw error;
            return data.map(mapDbBranch);
        }
    });
};

export const useEmployees = (branchId?: string) => {
    return useQuery({
        queryKey: ['employees', branchId],
        queryFn: async () => {
            let query = supabase.from(DB_TABLES.EMPLOYEES).select(EMPLOYEE_COLS).order(DB_COLUMNS.NAME, { ascending: true });
            if (branchId) query = query.eq(DB_COLUMNS.BRANCH_ID, branchId);
            const { data, error } = await query;
            if (error) throw error;
            return data.map(mapDbEmployee);
        }
    });
};

export const useTransactions = (branchId?: string) => {
    return useQuery({
        queryKey: ['transactions', branchId],
        queryFn: async () => {
            const lookbackDate = getTrueDate();
            lookbackDate.setDate(lookbackDate.getDate() - 90);
            const lookbackIso = lookbackDate.toISOString();

            let query = supabase.from(DB_TABLES.TRANSACTIONS)
                .select(TRANSACTION_COLS)
                .order(DB_COLUMNS.TIMESTAMP, { ascending: false })
                .gte(DB_COLUMNS.TIMESTAMP, lookbackIso)
                .limit(2000);
            
            if (branchId) query = query.eq(DB_COLUMNS.BRANCH_ID, branchId);
            
            const { data, error } = await query;
            if (error) throw error;
            
            return data.map(t => ({
                id: t[DB_COLUMNS.ID], branchId: t[DB_COLUMNS.BRANCH_ID], timestamp: t[DB_COLUMNS.TIMESTAMP],
                clientName: t[DB_COLUMNS.CLIENT_NAME], therapistName: t[DB_COLUMNS.THERAPIST_NAME], bonesetterName: t[DB_COLUMNS.BONESETTER_NAME],
                serviceId: t[DB_COLUMNS.SERVICE_ID], serviceName: t[DB_COLUMNS.SERVICE_NAME], basePrice: Number(t[DB_COLUMNS.BASE_PRICE] || 0),
                discount: Number(t[DB_COLUMNS.DISCOUNT] || 0), voucherValue: Number(t[DB_COLUMNS.VOUCHER_VALUE] || 0),
                primaryCommission: Number(t[DB_COLUMNS.PRIMARY_COMMISSION] || 0), secondaryCommission: Number(t[DB_COLUMNS.SECONDARY_COMMISSION] || 0),
                total: Number(t[DB_COLUMNS.TOTAL] || 0),
                paymentMethod: t[DB_COLUMNS.PAYMENT_METHOD],
                paymentStatus: t[DB_COLUMNS.PAYMENT_STATUS],
                paymongoLinkId: t[DB_COLUMNS.PAYMONGO_LINK_ID],
                note: t[DB_COLUMNS.NOTE]
            }));
        }
    });
};

export const useBranchServiceTemplates = (branchId: string) => {
    return useQuery({
        queryKey: ['branch_service_templates', branchId],
        queryFn: async () => {
            // Fetch branch assignments, template definitions, and PRIO config in parallel
            const [{ data: bsData, error: bsError }, { data: tAllData, error: tAllError }, { data: cfgData }] = await Promise.all([
                supabase.from(DB_TABLES.BRANCH_SERVICES).select('template_id, price').eq(DB_COLUMNS.BRANCH_ID, branchId),
                supabase.from(DB_TABLES.SERVICE_TEMPLATES).select('*'),
                supabase.from(DB_TABLES.SYSTEM_CONFIG).select('value').eq('key', 'prio_service_catalogs').maybeSingle(),
            ]);
            if (bsError) throw bsError;
            if (tAllError) throw tAllError;
            if (!bsData || bsData.length === 0) return [];

            const assignedIds = new Set(bsData.map((r: any) => r.template_id));
            const priceMap: Record<string, number | null> = {};
            bsData.forEach((r: any) => { priceMap[r.template_id] = r.price; });

            let prioCatalogs: string[] = [];
            try { prioCatalogs = cfgData?.value ? JSON.parse(cfgData.value) : []; } catch { /* ignore */ }

            const allAssigned = (tAllData || []).filter((t: any) => assignedIds.has(t.id));

            // If any assigned service belongs to a PRIO catalog, show only PRIO catalog services
            const hasPrioAssigned = prioCatalogs.length > 0 && allAssigned.some((t: any) => t.catalog_name && prioCatalogs.includes(t.catalog_name));
            const visible = hasPrioAssigned
                ? allAssigned.filter((t: any) => t.catalog_name && prioCatalogs.includes(t.catalog_name))
                : allAssigned;

            return visible.map((t: any) => ({
                id: t.id,
                name: t.name,
                price: priceMap[t.id] != null ? priceMap[t.id] : t.default_price,
                duration: t.duration,
                primaryRole: t.primary_role || undefined,
                secondaryRole: t.secondary_role || undefined,
                commissionType: t.commission_type,
                commissionValue: t.commission_value,
                isDualProvider: t.is_dual_provider,
                secondaryCommissionType: t.secondary_commission_type || undefined,
                secondaryCommissionValue: t.secondary_commission_value,
                catalogId: t.catalog_name || 'uncategorized',
                catalogName: t.catalog_name || undefined,
                canBeLoyalty: t.can_be_loyalty,
            }));
        },
        enabled: !!branchId,
        staleTime: 5 * 60 * 1000,
    });
};

export const useServiceCatalogs = () => {
    return useQuery({
        queryKey: ['service_catalogs'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from(DB_TABLES.SERVICE_CATALOGS)
                .select(SERVICE_CATALOG_COLS)
                .order(DB_COLUMNS.NAME, { ascending: true });
            if (error) throw error;
            return data.map(d => ({
                id: d[DB_COLUMNS.ID],
                name: d[DB_COLUMNS.NAME],
                services: d[DB_COLUMNS.SERVICES] || [],
                branchIds: d[DB_COLUMNS.BRANCH_IDS] || [],
                can_be_loyalty: d[DB_COLUMNS.CAN_BE_LOYALTY] || false
            }));
        }
    });
};

export const useSalesReports = (branchId?: string) => {
    return useQuery({
        queryKey: ['salesReports', branchId],
        queryFn: async () => {
            const lookbackDate = getTrueDate();
            lookbackDate.setDate(lookbackDate.getDate() - 90);
            const lookbackYmd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(lookbackDate);

            let query = supabase.from(DB_TABLES.SALES_REPORTS)
                .select(SALES_REPORT_COLS)
                .order(DB_COLUMNS.REPORT_DATE, { ascending: false })
                .gte(DB_COLUMNS.REPORT_DATE, lookbackYmd)
                .limit(2000);
            
            if (branchId) query = query.eq(DB_COLUMNS.BRANCH_ID, branchId);
            
            const { data, error } = await query;
            if (error) throw error;
            
            return data.map(r => ({
                id: r[DB_COLUMNS.ID], branchId: r[DB_COLUMNS.BRANCH_ID], reportDate: r[DB_COLUMNS.REPORT_DATE], submittedAt: r[DB_COLUMNS.SUBMITTED_AT],
                grossSales: Number(r[DB_COLUMNS.GROSS_SALES] ?? 0), totalStaffPay: Number(r[DB_COLUMNS.TOTAL_STAFF_PAY] ?? 0),
                totalExpenses: Number(r[DB_COLUMNS.TOTAL_EXPENSES] ?? 0), totalVaultProvision: Number(r[DB_COLUMNS.TOTAL_VAULT_PROVISION] ?? 0),
                netRoi: Number(r[DB_COLUMNS.NET_ROI] ?? 0),
                backfilled: r[DB_COLUMNS.BACKFILLED] === true,
                sessionData: typeof r[DB_COLUMNS.SESSION_DATA] === 'string' ? JSON.parse(r[DB_COLUMNS.SESSION_DATA]) : (r[DB_COLUMNS.SESSION_DATA] || []),
                staffBreakdown: typeof r[DB_COLUMNS.STAFF_BREAKDOWN] === 'string' ? JSON.parse(r[DB_COLUMNS.STAFF_BREAKDOWN]) : (r[DB_COLUMNS.STAFF_BREAKDOWN] || []),
                expenseData: typeof r[DB_COLUMNS.EXPENSE_DATA] === 'string' ? JSON.parse(r[DB_COLUMNS.EXPENSE_DATA]) : (r[DB_COLUMNS.EXPENSE_DATA] || []),
                vaultData: typeof r[DB_COLUMNS.VAULT_DATA] === 'string' ? JSON.parse(r[DB_COLUMNS.VAULT_DATA]) : (r[DB_COLUMNS.VAULT_DATA] || [])
            }));
        }
    });
};

// Mutations
export const useAddTransaction = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (newTx: any) => {
            const { data, error } = await supabase.from(DB_TABLES.TRANSACTIONS).insert(newTx).select().single();
            if (error) throw error;
            return data;
        },
        onMutate: async (newTx) => {
            await queryClient.cancelQueries({ queryKey: ['transactions', newTx.branch_id] });
            const previousTransactions = queryClient.getQueryData(['transactions', newTx.branch_id]);
            queryClient.setQueryData(['transactions', newTx.branch_id], (old: any) => {
                const optimisticTx = {
                    ...newTx,
                    id: 'temp-' + Date.now(),
                    timestamp: getTrueISOString(),
                    total: Number(newTx.total || 0),
                    clientName: newTx.client_name,
                    serviceName: newTx.service_name,
                    basePrice: Number(newTx.base_price || 0),
                    discount: Number(newTx.discount || 0),
                };
                return [optimisticTx, ...(old || [])];
            });
            return { previousTransactions };
        },
        onError: (err, newTx, context: any) => {
            queryClient.setQueryData(['transactions', newTx.branch_id], context.previousTransactions);
        },
        onSettled: (data, error, variables) => {
            queryClient.invalidateQueries({ queryKey: ['transactions', variables.branch_id] });
        },
    });
};

export const useUpdateTransaction = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (tx: any) => {
            const { data, error } = await supabase.from(DB_TABLES.TRANSACTIONS).upsert(tx).select(TRANSACTION_COLS).single();
            if (error) throw error;
            return data;
        },
        onMutate: async (tx) => {
            const key = ['transactions', tx.branch_id];
            await queryClient.cancelQueries({ queryKey: key });
            const previous = queryClient.getQueryData(key);
            queryClient.setQueryData(key, (old: any[]) =>
                (old || []).map(t => t.id === tx.id ? { ...t, ...tx } : t)
            );
            return { previous, branchId: tx.branch_id };
        },
        onError: (_err, _tx, context: any) => {
            queryClient.setQueryData(['transactions', context.branchId], context.previous);
        },
        onSettled: (_data, _err, tx) => {
            queryClient.invalidateQueries({ queryKey: ['transactions', tx.branch_id] });
        },
    });
};

export const useDeleteTransaction = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, branchId }: { id: string, branchId: string }) => {
            const { error } = await supabase.from(DB_TABLES.TRANSACTIONS).delete().eq(DB_COLUMNS.ID, id);
            if (error) throw error;
            return { id, branchId };
        },
        onMutate: async ({ id, branchId }) => {
            const key = ['transactions', branchId];
            await queryClient.cancelQueries({ queryKey: key });
            const previous = queryClient.getQueryData(key);
            queryClient.setQueryData(key, (old: any[]) => (old || []).filter(t => t.id !== id));
            return { previous, branchId };
        },
        onError: (_err, _vars, context: any) => {
            queryClient.setQueryData(['transactions', context.branchId], context.previous);
        },
        onSettled: (_data, _err, { branchId }) => {
            queryClient.invalidateQueries({ queryKey: ['transactions', branchId] });
        },
    });
};

export const useAddExpense = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (expense: any) => {
            const { data, error } = await supabase.from(DB_TABLES.EXPENSES).insert(expense).select().single();
            if (error) throw error;
            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['expenses', data.branch_id] });
        }
    });
};

export const useDeleteExpense = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, branchId }: { id: string, branchId: string }) => {
            const { error } = await supabase.from(DB_TABLES.EXPENSES).delete().eq(DB_COLUMNS.ID, id);
            if (error) throw error;
            return { id, branchId };
        },
        onMutate: async ({ id, branchId }) => {
            const key = ['expenses', branchId];
            await queryClient.cancelQueries({ queryKey: key });
            const previous = queryClient.getQueryData(key);
            queryClient.setQueryData(key, (old: any[]) => (old || []).filter(e => e.id !== id));
            return { previous, branchId };
        },
        onError: (_err, _vars, context: any) => {
            queryClient.setQueryData(['expenses', context.branchId], context.previous);
        },
        onSettled: (_data, _err, { branchId }) => {
            queryClient.invalidateQueries({ queryKey: ['expenses', branchId] });
        },
    });
};

export const useUpdateExpense = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (expense: any) => {
            const { data, error } = await supabase.from(DB_TABLES.EXPENSES).update(expense).eq(DB_COLUMNS.ID, expense.id).select().single();
            if (error) throw error;
            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['expenses', data.branch_id] });
        }
    });
};

export const useAddAuditLog = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (log: any) => {
            const { data, error } = await supabase.from(DB_TABLES.AUDIT_LOGS).insert(log).select().single();
            if (error) throw error;
            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['auditLogs', data.branch_id] });
        }
    });
};

export const useUpdateAttendance = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (attendance: any) => {
            const { id, ...updates } = attendance;
            const { data, error } = await supabase.from(DB_TABLES.ATTENDANCE).update(updates).eq(DB_COLUMNS.ID, id).select().single();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            // Invalidate all attendance queries (branch-scoped and global) so both
            // manager and superadmin dashboards reflect the change immediately.
            queryClient.invalidateQueries({ queryKey: ['attendance'] });
        }
    });
};

export const useAddEmployee = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (employee: any) => {
            const { data, error } = await supabase.from(DB_TABLES.EMPLOYEES).insert(employee).select().single();
            if (error) throw error;

            // If the new employee is a manager, update the branches table as well
            if (data && data[DB_COLUMNS.ROLE] === UserRole.BRANCH_MANAGER && data[DB_COLUMNS.NAME]) {
                const branchId = data[DB_COLUMNS.BRANCH_ID];
                if (branchId) {
                    await supabase
                        .from(DB_TABLES.BRANCHES)
                        .update({ [DB_COLUMNS.MANAGER]: data[DB_COLUMNS.NAME] })
                        .eq(DB_COLUMNS.ID, branchId);
                }
            }

            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['employees'] });
            queryClient.invalidateQueries({ queryKey: ['branches'] });
        }
    });
};

export const useUpdateEmployee = () => {
    const queryClient = useQueryClient();
    return useMutation({
        onMutate: async (employee) => {
            await queryClient.cancelQueries({ queryKey: ['employees'] });
            const previous = queryClient.getQueryData(['employees']);
            queryClient.setQueryData(['employees'], (old: any[]) =>
                (old || []).map(e => e.id === employee.id ? { ...e, ...employee } : e)
            );
            return { previous };
        },
        onError: (_err, _emp, context: any) => {
            queryClient.setQueryData(['employees'], context.previous);
        },
        mutationFn: async (employee: any) => {
            const { id, ...updates } = employee;
            
            // Fetch current employee state to compare role/branch
            const { data: currentEmployee } = await supabase
                .from(DB_TABLES.EMPLOYEES)
                .select(`${DB_COLUMNS.ROLE},${DB_COLUMNS.BRANCH_ID},${DB_COLUMNS.NAME}`)
                .eq(DB_COLUMNS.ID, id)
                .single();

            const { data, error } = await supabase.from(DB_TABLES.EMPLOYEES).update(updates).eq(DB_COLUMNS.ID, id).select().single();
            if (error) throw error;

            // Handle Branch Manager sync
            if (data) {
                const oldRole = currentEmployee?.[DB_COLUMNS.ROLE];
                const newRole = data[DB_COLUMNS.ROLE];
                const oldBranchId = currentEmployee?.[DB_COLUMNS.BRANCH_ID];
                const newBranchId = data[DB_COLUMNS.BRANCH_ID];
                const newName = data[DB_COLUMNS.NAME];

                // Case 1: Employee is now a manager (wasn't before, or name/branch changed)
                if (newRole === UserRole.BRANCH_MANAGER) {
                    if (newBranchId) {
                        await supabase
                            .from(DB_TABLES.BRANCHES)
                            .update({ [DB_COLUMNS.MANAGER]: newName })
                            .eq(DB_COLUMNS.ID, newBranchId);
                    }
                    
                    // If branch changed, clear the old branch's manager field
                    if (oldBranchId && oldBranchId !== newBranchId && oldRole === UserRole.BRANCH_MANAGER) {
                        await supabase
                            .from(DB_TABLES.BRANCHES)
                            .update({ [DB_COLUMNS.MANAGER]: '' })
                            .eq(DB_COLUMNS.ID, oldBranchId);
                    }
                } 
                // Case 2: Employee was a manager but is no longer
                else if (oldRole === UserRole.BRANCH_MANAGER && newRole !== UserRole.BRANCH_MANAGER) {
                    if (oldBranchId) {
                        await supabase
                            .from(DB_TABLES.BRANCHES)
                            .update({ [DB_COLUMNS.MANAGER]: '' })
                            .eq(DB_COLUMNS.ID, oldBranchId);
                    }
                }
            }

            return data;
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['employees'] });
            queryClient.invalidateQueries({ queryKey: ['branches'] });
        }
    });
};

export const useDeleteEmployee = () => {
    const queryClient = useQueryClient();
    return useMutation({
        onMutate: async (id: string) => {
            await queryClient.cancelQueries({ queryKey: ['employees'] });
            const previous = queryClient.getQueryData(['employees']);
            queryClient.setQueryData(['employees'], (old: any[]) => (old || []).filter(e => e.id !== id));
            return { previous };
        },
        onError: (_err, _id, context: any) => {
            queryClient.setQueryData(['employees'], context.previous);
        },
        mutationFn: async (id: string) => {
            // Fetch employee to check role and branch before deletion
            const { data: employee } = await supabase
                .from(DB_TABLES.EMPLOYEES)
                .select(`${DB_COLUMNS.ROLE},${DB_COLUMNS.BRANCH_ID}`)
                .eq(DB_COLUMNS.ID, id)
                .single();

            // Nullify employee_id in related tables to avoid foreign key constraint errors
            // We do this because the live database might not have ON DELETE CASCADE configured
            const tablesToNullify = [
                { table: DB_TABLES.ATTENDANCE, column: DB_COLUMNS.EMPLOYEE_ID },
                { table: DB_TABLES.TRANSACTIONS, column: DB_COLUMNS.THERAPIST_ID },
                { table: DB_TABLES.TRANSACTIONS, column: DB_COLUMNS.BONESETTER_ID },
            ];

            for (const item of tablesToNullify) {
                try {
                    await supabase
                        .from(item.table)
                        .update({ [item.column]: null })
                        .eq(item.column, id);
                } catch (e) {
                    console.warn(`[useDeleteEmployee] Could not nullify ${item.column} in ${item.table}:`, e);
                }
            }

            // If the employee was a manager, clear the branches table manager field
            if (employee && employee[DB_COLUMNS.ROLE] === UserRole.BRANCH_MANAGER) {
                const branchId = employee[DB_COLUMNS.BRANCH_ID];
                if (branchId) {
                    await supabase
                        .from(DB_TABLES.BRANCHES)
                        .update({ [DB_COLUMNS.MANAGER]: '' })
                        .eq(DB_COLUMNS.ID, branchId);
                }
            }

            const { error } = await supabase.from(DB_TABLES.EMPLOYEES).delete().eq(DB_COLUMNS.ID, id);
            if (error) throw error;
            return id;
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['employees'] });
            queryClient.invalidateQueries({ queryKey: ['branches'] });
        }
    });
};

export const useAddAttendance = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (attendance: any) => {
            const { data, error } = await supabase.from(DB_TABLES.ATTENDANCE).insert(attendance).select().single();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['attendance'] });
        }
    });
};

export const useUpdateBranch = () => {
    const queryClient = useQueryClient();
    return useMutation({
        onMutate: async (branch) => {
            await queryClient.cancelQueries({ queryKey: ['branches'] });
            const previous = queryClient.getQueryData(['branches']);
            queryClient.setQueryData(['branches'], (old: any[]) =>
                (old || []).map(b => b.id === branch.id ? { ...b, ...branch } : b)
            );
            return { previous };
        },
        onError: (_err, _branch, context: any) => {
            queryClient.setQueryData(['branches'], context.previous);
        },
        mutationFn: async (branch: any) => {
            const { id, ...updates } = branch;
            const { data, error } = await supabase.from(DB_TABLES.BRANCHES).update(updates).eq(DB_COLUMNS.ID, id).select(BRANCH_COLS).single();
            if (error) {
                console.error('[useUpdateBranch] Error updating branch:', error);
                throw error;
            }
            return data;
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['branches'] });
        }
    });
};

export const useDeleteBranch = () => {
    const queryClient = useQueryClient();
    return useMutation({
        onMutate: async (id: string) => {
            await queryClient.cancelQueries({ queryKey: ['branches'] });
            const previous = queryClient.getQueryData(['branches']);
            queryClient.setQueryData(['branches'], (old: any[]) => (old || []).filter(b => b.id !== id));
            return { previous };
        },
        onError: (_err, _id, context: any) => {
            queryClient.setQueryData(['branches'], context.previous);
        },
        mutationFn: async (id: string) => {
            // Nullify branch_id in related tables to avoid foreign key constraint errors
            // We do this because the live database might not have ON DELETE CASCADE configured
            const tablesToNullify = [
                DB_TABLES.AUDIT_LOGS,
                DB_TABLES.TRANSACTIONS,
                DB_TABLES.EXPENSES,
                DB_TABLES.ATTENDANCE,
                DB_TABLES.SALES_REPORTS,
            ];

            for (const table of tablesToNullify) {
                try {
                    // First attempt to nullify branch_id to preserve history if possible
                    const { error: updateError } = await supabase
                        .from(table)
                        .update({ [DB_COLUMNS.BRANCH_ID]: null })
                        .eq(DB_COLUMNS.BRANCH_ID, id);
                    
                    // If nullification fails (e.g. NOT NULL constraint), we delete the records
                    // to allow branch decommissioning, as per user request.
                    if (updateError) {
                        console.warn(`[useDeleteBranch] Could not nullify branch_id in ${table}, deleting records to unblock:`, updateError);
                        await supabase.from(table).delete().eq(DB_COLUMNS.BRANCH_ID, id);
                    }
                } catch (e) {
                    console.warn(`[useDeleteBranch] Failed to handle ${table}:`, e);
                }
            }

            // Handle Service Catalogs (array of IDs)
            try {
                const { data: catalogs } = await supabase.from(DB_TABLES.SERVICE_CATALOGS).select('*');
                if (catalogs) {
                    for (const cat of catalogs) {
                        const branchIds = cat[DB_COLUMNS.BRANCH_IDS] || [];
                        if (branchIds.includes(id)) {
                            const updatedIds = branchIds.filter((bid: string) => bid !== id);
                            await supabase.from(DB_TABLES.SERVICE_CATALOGS)
                                .update({ [DB_COLUMNS.BRANCH_IDS]: updatedIds })
                                .eq(DB_COLUMNS.ID, cat.id);
                        }
                    }
                }
            } catch (e) {
                console.warn('[useDeleteBranch] Failed to update service catalogs:', e);
            }

            const { error } = await supabase.from(DB_TABLES.BRANCHES).delete().eq(DB_COLUMNS.ID, id);
            if (error) throw error;
            return id;
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['branches'] });
            queryClient.invalidateQueries({ queryKey: ['service_catalogs'] });
        }
    });
};

export const useAddBranch = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (branch: any) => {
            const { data, error } = await supabase.from(DB_TABLES.BRANCHES).insert(branch).select().single();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['branches'] });
        }
    });
};
