import { supabase } from './supabase';
import { DB_TABLES, DB_COLUMNS } from '../constants/db_schema';
import { getTrueISOString } from './time';

export const logAudit = async (payload: {
  branchId?: string | null;
  activityType: string;
  entityType: string;
  entityId?: string | null;
  description: string;
  amount?: number;
  performerName: string;
}) => {
  try {
    const { error } = await supabase.from(DB_TABLES.AUDIT_LOGS).insert({
      [DB_COLUMNS.BRANCH_ID]: payload.branchId || null,
      [DB_COLUMNS.TIMESTAMP]: getTrueISOString(),
      [DB_COLUMNS.ACTIVITY_TYPE]: payload.activityType,
      [DB_COLUMNS.ENTITY_TYPE]: payload.entityType,
      [DB_COLUMNS.ENTITY_ID]: payload.entityId || null,
      [DB_COLUMNS.DESCRIPTION]: payload.description,
      [DB_COLUMNS.AMOUNT]: payload.amount || 0,
      [DB_COLUMNS.PERFORMER_NAME]: payload.performerName
    });
    if (error) console.error('Audit Log Error:', error);
  } catch (err) {
    console.error('Audit Log Exception:', err);
  }
};

/**
 * Broadcasts a GLOBAL force-logout signal across the entire network.
 * Updates refresh_signal on every branch AND sets force_logout_registry['GLOBAL'].
 * The watcher in App.tsx detects this and terminates all active sessions.
 * Call this from "Force Logout All" admin actions.
 */
export const invalidateGlobalSessions = async (): Promise<void> => {
  const now = Date.now();
  const { data: allBranches, error: fetchErr } = await supabase.from(DB_TABLES.BRANCHES).select('id');
  if (fetchErr) throw fetchErr;
  if (allBranches?.length) {
    const { error } = await supabase
      .from(DB_TABLES.BRANCHES)
      .update({ [DB_COLUMNS.REFRESH_SIGNAL]: now })
      .in(DB_COLUMNS.ID, allBranches.map((b: any) => b.id));
    if (error) throw error;
  }
  const { data } = await supabase
    .from(DB_TABLES.SYSTEM_CONFIG)
    .select('value')
    .eq(DB_COLUMNS.KEY, 'force_logout_registry')
    .maybeSingle();
  let registry: Record<string, number> = {};
  if (data?.value) { try { registry = JSON.parse(data.value); } catch {} }
  registry['GLOBAL'] = now;
  await supabase.from(DB_TABLES.SYSTEM_CONFIG).upsert(
    { [DB_COLUMNS.KEY]: 'force_logout_registry', [DB_COLUMNS.VALUE]: JSON.stringify(registry) },
    { onConflict: DB_COLUMNS.KEY }
  );
};

/**
 * Writes a force-logout timestamp for one or more branches into system_config.
 * Any active session whose sessionStart is older than this timestamp will be
 * automatically kicked out by the watcher in App.tsx.
 * Call this whenever a manager's credentials (PIN or username) are changed.
 */
export const invalidateBranchSessions = async (branchIds: string[]): Promise<void> => {
  if (!branchIds.length) return;
  try {
    const { data } = await supabase
      .from(DB_TABLES.SYSTEM_CONFIG)
      .select('value')
      .eq(DB_COLUMNS.KEY, 'force_logout_registry')
      .maybeSingle();
    let registry: Record<string, number> = {};
    if (data?.value) { try { registry = JSON.parse(data.value); } catch {} }
    const now = Date.now();
    branchIds.forEach(id => { registry[id] = now; });
    await supabase.from(DB_TABLES.SYSTEM_CONFIG).upsert(
      { [DB_COLUMNS.KEY]: 'force_logout_registry', [DB_COLUMNS.VALUE]: JSON.stringify(registry) },
      { onConflict: DB_COLUMNS.KEY }
    );
  } catch (err) {
    console.error('invalidateBranchSessions error:', err);
  }
};
