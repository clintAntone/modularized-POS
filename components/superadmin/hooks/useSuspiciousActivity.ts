import { useState, useMemo, useCallback } from 'react';
import { AuditLog, Branch } from '../../../types';

interface FlagItem {
  id: string;
  title: string;
  detail: string;
  branchName: string;
  latestTimestamp: string;
}

export function useSuspiciousActivity(scopedAuditLogs: AuditLog[], branches: Branch[]) {
  const [dismissedFlagIds, setDismissedFlagIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('dismissed_security_flags') || '[]')); }
    catch { return new Set(); }
  });

  const recentHighFlags = useMemo<FlagItem[]>(() => {
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    const recentLogs = scopedAuditLogs.filter(l => new Date(l.timestamp).getTime() >= cutoff);
    const branchName = (id: string) => branches.find(b => b.id === id)?.name || 'UNKNOWN';
    const flags: FlagItem[] = [];

    // Tx edited 5+ times
    const txUpdates: Record<string, AuditLog[]> = {};
    recentLogs
      .filter(l => l.entityType === 'TRANSACTION' && l.activityType === 'UPDATE' && l.entityId)
      .forEach(l => { (txUpdates[l.entityId] = txUpdates[l.entityId] || []).push(l); });
    Object.entries(txUpdates).forEach(([entityId, logs]) => {
      if (logs.length >= 5)
        flags.push({
          id: `tx-edit-${entityId}`,
          title: 'Transaction edited repeatedly',
          detail: `Sale record edited ${logs.length}× — ${[...new Set(logs.map(l => l.performerName || 'SYSTEM'))].join(', ')}`,
          branchName: branchName(logs[0].branchId),
          latestTimestamp: logs[0].timestamp,
        });
    });

    // High-value deletion ₱2000+
    recentLogs
      .filter(l => l.activityType === 'DELETE' && (l.amount || 0) >= 2000)
      .forEach(l => flags.push({
        id: `hv-del-${l.id}`,
        title: 'High-value record deleted',
        detail: `₱${(l.amount || 0).toLocaleString()} entry removed — ${l.description}`,
        branchName: branchName(l.branchId),
        latestTimestamp: l.timestamp,
      }));

    // 6+ deletions from same branch
    const delByBranch: Record<string, AuditLog[]> = {};
    recentLogs
      .filter(l => l.activityType === 'DELETE')
      .forEach(l => { const k = l.branchId || '__central__'; (delByBranch[k] = delByBranch[k] || []).push(l); });
    Object.entries(delByBranch).forEach(([bId, logs]) => {
      if (logs.length >= 6)
        flags.push({
          id: `mass-del-${bId}`,
          title: 'Mass deletion detected',
          detail: `${logs.length} records deleted — ${[...new Set(logs.map(l => l.entityType))].join(', ')}`,
          branchName: bId === '__central__' ? 'CENTRAL' : branchName(bId),
          latestTimestamp: logs[0].timestamp,
        });
    });

    return flags.filter(f => !dismissedFlagIds.has(f.id));
  }, [scopedAuditLogs, branches, dismissedFlagIds]);

  const dismissFlag = useCallback((id: string) => {
    setDismissedFlagIds(prev => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem('dismissed_security_flags', JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  const dismissAllFlags = useCallback(() => {
    const ids = recentHighFlags.map(f => f.id);
    setDismissedFlagIds(prev => {
      const next = new Set([...prev, ...ids]);
      try { localStorage.setItem('dismissed_security_flags', JSON.stringify([...next])); } catch {}
      return next;
    });
  }, [recentHighFlags]);

  return { recentHighFlags, dismissFlag, dismissAllFlags };
}
