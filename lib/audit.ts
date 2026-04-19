import { supabase } from './supabase';
import { DB_TABLES, DB_COLUMNS } from '../constants/db_schema';

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
      [DB_COLUMNS.TIMESTAMP]: new Date().toISOString(),
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
