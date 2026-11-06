import { SalesReport, Branch } from '@/types';

// Normalizes any date value from Supabase into a plain 'YYYY-MM-DD' string.
// Handles ISO timestamps ('2026-04-10T16:00:00+08:00'), non-padded months ('2026-4-10'), etc.
export function normalizeDateStr(raw: string | null | undefined): string {
    if (!raw) return '';
    const s = raw.split('T')[0];
    const parts = s.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return s;
    const [y, mo, d] = parts;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Always pass timeZone when calling with a "now" date to avoid device timezone drift.
// For historical Date objects already parsed from Manila-date strings, omitting timeZone is safe.
export function toDateStr(d: Date, timeZone?: string): string {
    if (timeZone) {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(d);
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function parseDate(dateStr: string): Date {
    if (!dateStr) return new Date(NaN);
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
}

export function getISOWeek(date: Date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function getWeekRange(date: Date, branch: Branch) {
    const dateNorm = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    // Look up the active cutoff for this date from history (sorted by effectiveFrom ascending).
    // Fall back to branch.weeklyCutoff if no history or date is before all entries.
    const history = branch.cutoffHistory || [];
    let activeCutoff = Number(branch.weeklyCutoff ?? 0);
    let activeEffectiveFrom: string | null = branch.cycleStartDate || null;
    let nextEraStart: Date | null = null;

    for (const entry of history) {
        const eff = parseDate(entry.effectiveFrom);
        if (eff <= dateNorm) {
            activeCutoff = entry.cutoff;
            activeEffectiveFrom = entry.effectiveFrom;
        } else if (nextEraStart === null || eff < nextEraStart) {
            // Track the nearest future era so we can cap this period's end date.
            nextEraStart = new Date(eff.getFullYear(), eff.getMonth(), eff.getDate());
        }
    }

    const startDay = (activeCutoff + 1) % 7;

    // cycleStart: the effectiveFrom of the matching history entry (clips the first week of each era)
    const anchorStr = activeEffectiveFrom || `${new Date().getFullYear()}-01-01`;
    const [y, m, day] = anchorStr.split('-').map(Number);
    const cycleStart = new Date(y, m - 1, day);
    cycleStart.setHours(0, 0, 0, 0);

    // 1. Find the "Natural" week start
    const naturalStart = new Date(dateNorm);
    const currentDay = naturalStart.getDay();
    const diff = (currentDay - startDay + 7) % 7;
    naturalStart.setDate(naturalStart.getDate() - diff);

    const naturalEnd = new Date(naturalStart);
    naturalEnd.setDate(naturalStart.getDate() + 6);
    naturalEnd.setHours(23, 59, 59, 999);

    // 2. If cycleStart falls mid-week, compute the "extended first era period":
    //    merge the partial tail + next full week into one period.
    //    e.g. cycleStart = Oct 31 (Sat), Sunday cutoff → first period = Oct 31–Nov 8
    //    instead of Oct 31–Nov 1 (stub) + Nov 2–Nov 8 (separate).
    const cycleStartDiff = (cycleStart.getDay() - startDay + 7) % 7;
    let extendedFirstPeriodEnd: Date | null = null;
    if (cycleStartDiff > 0) {
        // End of the natural week that contains cycleStart
        const cycleNaturalEnd = new Date(cycleStart);
        cycleNaturalEnd.setDate(cycleStart.getDate() - cycleStartDiff + 6);
        // Extended end = that Sunday + 7 more days
        extendedFirstPeriodEnd = new Date(cycleNaturalEnd);
        extendedFirstPeriodEnd.setDate(cycleNaturalEnd.getDate() + 7);
        extendedFirstPeriodEnd.setHours(23, 59, 59, 999);
    }

    let weekStart = naturalStart;
    let weekEnd = new Date(naturalEnd);

    if (extendedFirstPeriodEnd && dateNorm >= cycleStart && dateNorm <= extendedFirstPeriodEnd) {
        // Date falls within the extended first era period — snap both ends.
        weekStart = new Date(cycleStart);
        weekEnd = new Date(extendedFirstPeriodEnd);
    }

    // 3. Cap weekEnd to the day before the next era starts when it lands within this period.
    //    Prevents the last period of an era from sharing its end date with the first day of
    //    the new era (e.g. "Oct 25 — Oct 31" and "Oct 31 — Nov 6" both showing Oct 31).
    if (nextEraStart !== null && nextEraStart > weekStart && nextEraStart <= weekEnd) {
        weekEnd = new Date(nextEraStart);
        weekEnd.setDate(weekEnd.getDate() - 1);
        weekEnd.setHours(23, 59, 59, 999);
    }

    // 4. Calculate weekIndex (Nth occurrence of startDay in the month)
    let weekIndex = 0;
    let temp = new Date(naturalStart.getFullYear(), naturalStart.getMonth(), 1);
    while (temp <= naturalStart) {
        if (temp.getDay() === startDay) {
            weekIndex++;
        }
        temp.setDate(temp.getDate() + 1);
    }

    return {
        weekIndex,
        weekStart,
        weekEnd,
        label: `${weekStart.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})} — ${weekEnd.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}`
    };
}

export function getReportMonth(date: Date) {
    return {
        month: date.getMonth() + 1,
        year: date.getFullYear()
    };
}
