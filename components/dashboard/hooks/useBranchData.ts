import { useMemo } from 'react';
import { getManilaYear } from '../../../lib/time';
import { Branch, Transaction, Expense } from '../../../types';

export const useBranchData = (branch: Branch, transactions: Transaction[], expenses: Expense[]) => {
  const yearlyCycles = useMemo(() => {
    const cycles = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    const anchorDateString = branch.cycleStartDate || `${getManilaYear()}-01-01`;
    const [year, month, day] = anchorDateString.split('-').map(v => parseInt(v, 10));
    let iter = new Date(year, month - 1, day);
    iter.setHours(0, 0, 0, 0);

    const targetYear = now.getFullYear() + 1; // Project slightly into the future to capture current week
    let cycleId = 1;

    const toDateKey = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    };

    // Pre-filter data for the current branch to reduce search space
    const branchTxs = transactions.filter(t => t.branchId === branch.id);
    const branchExps = expenses.filter(e => e.branchId === branch.id);

    // Group data by date for O(1) lookup inside loops
    const txsByDate = new Map<string, Transaction[]>();
    branchTxs.forEach(t => {
      const date = t.timestamp.split('T')[0];
      if (!txsByDate.has(date)) txsByDate.set(date, []);
      txsByDate.get(date)!.push(t);
    });

    const expsByDate = new Map<string, Expense[]>();
    branchExps.forEach(e => {
      const date = e.timestamp.split('T')[0];
      if (!expsByDate.has(date)) expsByDate.set(date, []);
      expsByDate.get(date)!.push(e);
    });

    while (iter.getFullYear() <= targetYear && cycles.length < 100) {
      const cycleStart = new Date(iter);
      const cycleEnd = new Date(iter);
      
      const currentDay = cycleStart.getDay();
      const cutoff = Number(branch.weeklyCutoff);
      const daysToCutoff = (cutoff - currentDay + 7) % 7;
      cycleEnd.setDate(cycleStart.getDate() + daysToCutoff);
      
      const cycleDays = [];
      const diff = Math.round((cycleEnd.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      
      let cycleGross = 0;
      let cycleComm = 0;
      let cycleExp = 0;

      for(let i = 0; i < diff; i++) {
        const dayDate = new Date(cycleStart);
        dayDate.setDate(dayDate.getDate() + i);
        const dStr = toDateKey(dayDate);
        
        const dTxs = txsByDate.get(dStr) || [];
        const dExps = expsByDate.get(dStr) || [];
        
        const dGross = dTxs.reduce((s, t) => s + Number(t.total || 0), 0);
        const dComm = dTxs.reduce((s, t) => s + (Number(t.primaryCommission) || 0) + (Number(t.secondaryCommission) || 0), 0);
        const dExp = dExps.reduce((s, e) => s + Number(e.amount || 0), 0);
        
        cycleGross += dGross;
        cycleComm += dComm;
        cycleExp += dExp;

        cycleDays.push({ date: dStr, gross: dGross, comm: dComm, exp: dExp, net: dGross - dComm - dExp });
      }

      cycles.push({
        id: cycleId++,
        start: cycleStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        startDate: new Date(cycleStart),
        end: cycleEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
        endDate: new Date(cycleEnd),
        gross: cycleGross, 
        comm: cycleComm, 
        exp: cycleExp, 
        net: cycleGross - cycleComm - cycleExp,
        isFuture: cycleStart > now,
        days: cycleDays
      });
      
      iter = new Date(cycleEnd);
      iter.setDate(iter.getDate() + 1);
      
      if (cycleStart > now && cycles.length > 5) break; 
    }
    return cycles;
  }, [branch.cycleStartDate, branch.weeklyCutoff, transactions, expenses, branch.id]);

  return { yearlyCycles };
};