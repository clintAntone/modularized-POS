import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../constants/db_schema';
import { normalizeDateStr } from '../src/utils/reportUtils';

/**
 * Lazy-loads staff_breakdown for a specific branch's sales reports.
 * Only called once the Payroll tab mounts — the component mounting is the lazy trigger.
 * Returns a map of reportDate → staffBreakdown[] for O(1) lookup.
 */
export function usePayrollReports(branchId: string | undefined) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['payroll-reports', branchId],
        queryFn: async () => {
            if (!branchId) return {};
            const { data, error } = await supabase
                .from(DB_TABLES.SALES_REPORTS)
                .select(`${DB_COLUMNS.ID},${DB_COLUMNS.BRANCH_ID},${DB_COLUMNS.REPORT_DATE},${DB_COLUMNS.STAFF_BREAKDOWN}`)
                .eq(DB_COLUMNS.BRANCH_ID, branchId);
            if (error) throw error;
            const map: Record<string, any[]> = {};
            for (const row of data ?? []) {
                map[normalizeDateStr(row[DB_COLUMNS.REPORT_DATE])] = row[DB_COLUMNS.STAFF_BREAKDOWN] ?? [];
            }
            return map;
        },
        enabled: !!branchId,
        staleTime: 5 * 60 * 1000, // 5 min — payroll data doesn't change often
    });

    return { staffBreakdownMap: data ?? {}, isLoading, error };
}
