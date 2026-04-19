import { SalesReport, Branch } from '@/types';

export function toDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function parseDate(dateStr: string): Date {
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
    const cutoff = Number(branch.weeklyCutoff ?? 0);
    const startDay = (cutoff + 1) % 7;

    const anchorStr = branch.cycleStartDate || `${new Date().getFullYear()}-01-01`;
    const [y, m, day] = anchorStr.split('-').map(Number);
    const cycleStart = new Date(y, m - 1, day);
    cycleStart.setHours(0, 0, 0, 0);

    // 1. Find the "Natural" week start (the Monday, or whatever startDay is)
    const naturalStart = new Date(date);
    naturalStart.setHours(0, 0, 0, 0);
    const currentDay = naturalStart.getDay();
    const diff = (currentDay - startDay + 7) % 7;
    naturalStart.setDate(naturalStart.getDate() - diff);

    const naturalEnd = new Date(naturalStart);
    naturalEnd.setDate(naturalStart.getDate() + 6);
    naturalEnd.setHours(23, 59, 59, 999);

    // 2. Adjust for cycleStart
    // Only clip if the cycle starts DURING this week AND the date we are checking is >= cycleStart.
    // If the date is before cycleStart, we keep the natural start so it doesn't get grouped into the first cycle week.
    let weekStart = naturalStart;
    if (cycleStart > naturalStart && cycleStart <= naturalEnd && date >= cycleStart) {
        weekStart = new Date(cycleStart);
    }
    const weekEnd = naturalEnd;

    // 3. Calculate weekIndex (Nth occurrence of startDay in the month of naturalStart)
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
        label: `${weekStart.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})} — ${weekEnd.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}`
    };
}

export function getReportMonth(date: Date) {
    return {
        month: date.getMonth() + 1,
        year: date.getFullYear()
    };
}
