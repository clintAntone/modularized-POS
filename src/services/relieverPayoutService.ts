
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { Branch, Employee } from '../../types';
import { getEmployeeAllowance } from '../../lib/payroll';
import { getTrueISOString, getTrueManilaISOString } from '../../lib/time';

/**
 * Synchronizes reliever payouts to the expenses table.
 * This ensures that relievers (staff from other branches) have their total pay 
 * (commission + allowance + OT - late) reflected as an operational expense.
 */
export const syncRelieverPayouts = async (branch: Branch, todayStr: string, employees: Employee[], hiddenStaffNames?: Set<string>) => {
    if (!navigator.onLine) return;


    try {
        // 1. Fetch latest transactions AND attendance to ensure we have the most up-to-date data
        const [{ data: latestTxs, error: txError }, { data: latestAtt, error: attError }] = await Promise.all([
            supabase
                .from(DB_TABLES.TRANSACTIONS)
                .select('*')
                .eq(DB_COLUMNS.BRANCH_ID, branch.id)
                .gte(DB_COLUMNS.TIMESTAMP, `${todayStr}T00:00:00+08:00`)
                .lte(DB_COLUMNS.TIMESTAMP, `${todayStr}T23:59:59+08:00`),
            supabase
                .from(DB_TABLES.ATTENDANCE)
                .select('*')
                .eq(DB_COLUMNS.BRANCH_ID, branch.id)
                .eq(DB_COLUMNS.DATE, todayStr)
        ]);

        if (txError) throw txError;
        if (attError) throw attError;


        const relieverData: Record<string, { commission: number, allowance: number, ot: number, late: number }> = {};
        
        // 1. Seed from Attendance (to handle relievers with no transactions yet but have allowance/adjustments)
        (latestAtt || []).forEach(att => {
            const empId = att.employee_id || att.employeeId;
            const emp = employees.find(e => e.id === empId);
            if (emp && emp.branchId !== branch.id) {
                const cfg = emp.branchAllowances?.[branch.id];
                const excluded = typeof cfg === 'object' && cfg !== null ? (cfg.excludeFromReliever || false) : false;
                const isMainManager = branch.manager?.toUpperCase() === emp.name?.trim().toUpperCase();
                const isTempManager = branch.tempManager?.toUpperCase() === emp.name?.trim().toUpperCase();
                if (!isMainManager && !isTempManager && !excluded) {
                    const name = emp.name?.trim().toUpperCase();
                    if (name && !hiddenStaffNames?.has(name)) {
                        // If a home-branch employee with this name exists, they are regular staff — not a reliever.
                        const homeBranchMatch = employees.find(e => e.name?.trim().toUpperCase() === name && e.branchId === branch.id);
                        if (homeBranchMatch) return;
                        let allowance = getEmployeeAllowance(emp, branch.id);
                        if (att.is_half_day === true) allowance /= 2;
                        relieverData[name] = {
                            commission: 0,
                            allowance,
                            ot: Number(att.ot_pay || att.otPay || 0),
                            late: Number(att.late_deduction || att.lateDeduction || 0)
                        };
                    }
                }
            }
        });

        // 2. Add Commissions from Transactions (ID-based matching)
        (latestTxs || []).forEach(t => {
            const therapistId = t.therapist_id || t.therapistId;
            const bonesetterId = t.bonesetter_id || t.bonesetterId;

            if (therapistId) {
                const emp = employees.find(e => e.id === therapistId);
                if (emp && emp.branchId !== branch.id) {
                    const name = emp.name?.trim().toUpperCase();
                    if (!name || hiddenStaffNames?.has(name)) return;
                    const cfg = emp.branchAllowances?.[branch.id];
                    const excluded = typeof cfg === 'object' && cfg !== null ? (cfg.excludeFromReliever || false) : false;
                    const isMainManager = branch.manager?.toUpperCase() === emp.name?.trim().toUpperCase();
                    const isTempManager = branch.tempManager?.toUpperCase() === emp.name?.trim().toUpperCase();
                    if (!isMainManager && !isTempManager && !excluded) {
                        if (!relieverData[name]) {
                            relieverData[name] = { commission: 0, allowance: getEmployeeAllowance(emp, branch.id), ot: 0, late: 0 };
                        }
                        relieverData[name].commission += (Number(t.primary_commission || t.primaryCommission) || 0);
                    }
                }
            }

            if (bonesetterId) {
                const emp = employees.find(e => e.id === bonesetterId);
                if (emp && emp.branchId !== branch.id) {
                    const name = emp.name?.trim().toUpperCase();
                    if (!name || hiddenStaffNames?.has(name)) return;
                    const cfg = emp.branchAllowances?.[branch.id];
                    const excluded = typeof cfg === 'object' && cfg !== null ? (cfg.excludeFromReliever || false) : false;
                    const isMainManager = branch.manager?.toUpperCase() === emp.name?.trim().toUpperCase();
                    const isTempManager = branch.tempManager?.toUpperCase() === emp.name?.trim().toUpperCase();
                    if (!isMainManager && !isTempManager && !excluded) {
                        if (!relieverData[name]) {
                            relieverData[name] = { commission: 0, allowance: getEmployeeAllowance(emp, branch.id), ot: 0, late: 0 };
                        }
                        relieverData[name].commission += (Number(t.secondary_commission || t.secondaryCommission) || 0);
                    }
                }
            }
        });


        const { data: existingExps, error: exError } = await supabase
            .from(DB_TABLES.EXPENSES)
            .select('*')
            .eq(DB_COLUMNS.BRANCH_ID, branch.id)
            .eq(DB_COLUMNS.CATEGORY, 'OPERATIONAL')
            .ilike(DB_COLUMNS.NAME, 'RELIEVER PAYOUT:%')
            .gte(DB_COLUMNS.TIMESTAMP, `${todayStr}T00:00:00+08:00`)
            .lte(DB_COLUMNS.TIMESTAMP, `${todayStr}T23:59:59+08:00`);

        if (exError) throw exError;

        const syncPromises = [];
        
        // 3. Sync to Expenses
        const relieverExpNames = new Set(Object.keys(relieverData).map(name => `RELIEVER PAYOUT: ${name}`));
        
        // Handle deletions (if a reliever is no longer active and had an expense)
        const staleExps = (existingExps || []).filter(e => e.name.startsWith('RELIEVER PAYOUT:') && !relieverExpNames.has(e.name));
        for (const stale of staleExps) {
            syncPromises.push(supabase.from(DB_TABLES.EXPENSES).delete().eq(DB_COLUMNS.ID, stale.id));
        }

        for (const [name, data] of Object.entries(relieverData)) {
            const amount = data.commission + data.allowance + data.ot - data.late;
            const expName = `RELIEVER PAYOUT: ${name}`;
            const existing = existingExps?.find(e => e.name === expName);

            if (amount <= 0) {
                if (existing) {
                    syncPromises.push(supabase.from(DB_TABLES.EXPENSES).delete().eq(DB_COLUMNS.ID, existing.id));
                }
                continue;
            }

            if (existing) {
                if (Math.abs(existing.amount - amount) > 0.01) {
                    syncPromises.push(
                        supabase
                            .from(DB_TABLES.EXPENSES)
                            .update({ [DB_COLUMNS.AMOUNT]: amount })
                            .eq(DB_COLUMNS.ID, existing.id)
                    );
                }
            } else {
                const timestamp = getTrueManilaISOString();
                syncPromises.push(
                    supabase
                        .from(DB_TABLES.EXPENSES)
                        .insert({
                            [DB_COLUMNS.ID]: `reliever_${branch.id}_${name}_${todayStr.replace(/-/g, '')}`,
                            [DB_COLUMNS.BRANCH_ID]: branch.id,
                            [DB_COLUMNS.TIMESTAMP]: timestamp,
                            [DB_COLUMNS.NAME]: expName,
                            [DB_COLUMNS.AMOUNT]: amount,
                            [DB_COLUMNS.CATEGORY]: 'OPERATIONAL'
                        })
                );
            }
        }
        if (syncPromises.length > 0) {
            await Promise.all(syncPromises);
        } else {
        }
    } catch (err) {
        console.error('[RelieverSync] Error:', err);
    }
};
