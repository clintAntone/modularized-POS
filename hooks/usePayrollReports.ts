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
            // 180-day lookback covers 6 months of weekly cycles. Ordered by date DESC
            // so the report_date index is used efficiently, and limited to 500 rows
            // (a single branch submitting daily = ~180 rows in 180 days, well within limit).
            const lookbackDate = new Date();
            lookbackDate.setDate(lookbackDate.getDate() - 180);
            const lookbackYmd = lookbackDate.toISOString().slice(0, 10);

            const { data, error } = await supabase
                .from(DB_TABLES.SALES_REPORTS)
                .select(`${DB_COLUMNS.ID},${DB_COLUMNS.BRANCH_ID},${DB_COLUMNS.REPORT_DATE},${DB_COLUMNS.STAFF_BREAKDOWN}`)
                .eq(DB_COLUMNS.BRANCH_ID, branchId)
                .gte(DB_COLUMNS.REPORT_DATE, lookbackYmd)
                .order(DB_COLUMNS.REPORT_DATE, { ascending: false })
                .limit(500);
            if (error) throw error;
            const map: Record<string, any[]> = {};
            for (const row of data ?? []) {
                const raw = row[DB_COLUMNS.STAFF_BREAKDOWN];
                map[normalizeDateStr(row[DB_COLUMNS.REPORT_DATE])] = Array.isArray(raw)
                    ? raw
                    : typeof raw === 'string'
                    ? JSON.parse(raw)
                    : [];
            }
            return map;
        },
        enabled: !!branchId,
        staleTime: 5 * 60 * 1000,
    });

    return { staffBreakdownMap: data ?? {}, isLoading, error };
}
