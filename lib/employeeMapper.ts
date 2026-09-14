import { Employee } from '../types';
import { DB_COLUMNS } from '../constants/db_schema';
import { getTrueDate } from './time';

export function mapDbEmployee(db: any): Employee {
    let branchAllowances = {};
    try {
        branchAllowances = typeof db[DB_COLUMNS.BRANCH_ALLOWANCES] === 'string'
            ? JSON.parse(db[DB_COLUMNS.BRANCH_ALLOWANCES])
            : (db[DB_COLUMNS.BRANCH_ALLOWANCES] || {});
        if (typeof branchAllowances !== 'object' || branchAllowances === null) branchAllowances = {};
    } catch {
        console.warn('branchAllowances invalid for employee', db[DB_COLUMNS.ID], '— defaulting to {}');
        branchAllowances = {};
    }

    const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(getTrueDate());
    const dbOnLeave = db[DB_COLUMNS.ON_LEAVE] === true;
    const endDate: string | null = db[DB_COLUMNS.LEAVE_END_DATE] ?? null;
    const onLeave = dbOnLeave && (!endDate || endDate >= today);

    return {
        id: db[DB_COLUMNS.ID],
        branchId: db[DB_COLUMNS.BRANCH_ID],
        name: db[DB_COLUMNS.NAME],
        firstName: db[DB_COLUMNS.FIRST_NAME],
        middleName: db[DB_COLUMNS.MIDDLE_NAME],
        lastName: db[DB_COLUMNS.LAST_NAME],
        username: db[DB_COLUMNS.USERNAME],
        hasPinSet: Boolean(db[DB_COLUMNS.LOGIN_PIN]),
        requestReset: Boolean(db[DB_COLUMNS.REQUEST_RESET]),
        role: db[DB_COLUMNS.ROLE],
        allowance: Number(db[DB_COLUMNS.ALLOWANCE] || 0),
        isActive: db[DB_COLUMNS.IS_ACTIVE] !== false,
        profile: db[DB_COLUMNS.PROFILE],
        branchAllowances,
        details: db[DB_COLUMNS.DETAILS] || null,
        faceDescriptors: db[DB_COLUMNS.FACE_DESCRIPTORS] || undefined,
        timestamp: db[DB_COLUMNS.TIMESTAMP] || db[DB_COLUMNS.CREATED_AT],
        onLeave,
        leaveType: db[DB_COLUMNS.LEAVE_TYPE] ?? undefined,
        leaveStartDate: db[DB_COLUMNS.LEAVE_START_DATE] ?? undefined,
        leaveEndDate: endDate ?? undefined,
    };
}
