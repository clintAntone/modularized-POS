import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../constants/db_schema';

/**
 * Lazy-loads staff_breakdown for ALL sales reports (superadmin use).
 * Triggered by the component mounting (ReportAuditHub).
 * Returns a map of reportId → staffBreakdown[] for O(1) merging.
 */
export function useReportStaffBreakdown() {
    const { data, isLoading } = useQuery({
        queryKey: ['reportStaffBreakdown'],
        queryFn: async () => {
            const PAGE_SIZE = 1000;
            const lookbackDate = new Date();
            lookbackDate.setDate(lookbackDate.getDate() - 60);
            const lookbackYmd = lookbackDate.toISOString().slice(0, 10);

            let allRows: any[] = [];
            let from = 0;
            while (true) {
                const { data, error } = await supabase
                    .from(DB_TABLES.SALES_REPORTS)
                    .select(`${DB_COLUMNS.ID},${DB_COLUMNS.STAFF_BREAKDOWN}`)
                    .gte(DB_COLUMNS.REPORT_DATE, lookbackYmd)
                    .range(from, from + PAGE_SIZE - 1);
                if (error) throw error;
                if (data && data.length > 0) allRows.push(...data);
                if (!data || data.length < PAGE_SIZE) break;
                from += PAGE_SIZE;
            }

            const map: Record<string, any[]> = {};
            for (const row of allRows) {
                const raw = row[DB_COLUMNS.STAFF_BREAKDOWN];
                map[row[DB_COLUMNS.ID]] = Array.isArray(raw)
                    ? raw
                    : typeof raw === 'string'
                    ? JSON.parse(raw)
                    : [];
            }
            return map;
        },
        staleTime: 2 * 60 * 1000,
    });

    return { staffBreakdownMap: data ?? {}, isLoading };
}
