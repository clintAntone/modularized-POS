/**
 * MAINFRAME DATABASE CONFIGURATION
 * Centralized tracking for all snake_case column names.
 */

export const DB_TABLES = {
  BRANCHES: 'branches',
  TRANSACTIONS: 'transactions',
  EXPENSES: 'expenses',
  EMPLOYEES: 'employees',
  ATTENDANCE: 'attendance',
  SALES_REPORTS: 'sales_reports',
  AUDIT_LOGS: 'audit_logs',
  SYSTEM_CONFIG: 'system_config',
  SERVICE_CATALOGS: 'service_catalogs',
  REQUESTS: 'requests',
  BRANCH_BILLS: 'branch_bills',
  BILL_PAYMENTS: 'bill_payments',
  BILLS_CATALOG: 'bills_catalog',
  BRANCH_VAULTS: 'branch_vaults',
  REMITTANCE_ADJUSTMENTS: 'remittance_adjustments',
  REMITTANCE_SUBMISSIONS: 'remittance_submissions',
  PORTAL_USERS: 'portal_users',
  DEVICE_LOGS: 'device_logs',
  VAULT_TRANSACTIONS: 'vault_transactions',
  EMPLOYEE_COMPLAINTS: 'employee_complaints',
  SERVICE_TEMPLATES: 'service_templates',
  BRANCH_SERVICES: 'branch_services',
  TIME_SYNC_LOGS: 'time_sync_logs',
};

export const DB_COLUMNS = {
  // Common
  ID: 'id',
  BRANCH_ID: 'branch_id',
  TIMESTAMP: 'timestamp',
  CREATED_AT: 'created_at',
  UPDATED_AT: 'updated_at',
  NAME: 'name',
  VAULT_DEPOSIT: 'VAULT_DEPOSIT',

  // Branches
  PIN: 'pin',
  IS_PIN_CHANGED: 'is_pin_changed',
  IS_ENABLED: 'is_enabled',
  IS_OPEN: 'is_open',
  IS_OPEN_DATE: 'is_open_date',
  MANAGER: 'manager',
  TEMP_MANAGER: 'temp_manager',
  SERVICES: 'services',
  WEEKLY_CUTOFF: 'weekly_cutoff',
  CYCLE_START_DATE: 'cycle_start_date',
  DAILY_PROVISION_AMOUNT: 'daily_provision_amount',
  ENABLE_SHIFT_TRACKING: 'enable_shift_tracking',
  OPENING_TIME: 'opening_time',
  CLOSING_TIME: 'closing_time',
  OWNERS: 'owners',
  GROUP_LEVY: 'group_levy',
  REFRESH_SIGNAL: 'refresh_signal',
  VAULT_ENABLED: 'vault_enabled',
  CUTOFF_HISTORY: 'cutoff_history',

  // Transactions
  CLIENT_NAME: 'client_name',
  THERAPIST_NAME: 'therapist_name',
  THERAPIST_ID: 'therapist_id',
  BONESETTER_NAME: 'bonesetter_name',
  BONESETTER_ID: 'bonesetter_id',
  SERVICE_ID: 'service_id',
  SERVICE_NAME: 'service_name',
  BASE_PRICE: 'base_price',
  DISCOUNT: 'discount',
  VOUCHER_VALUE: 'voucher_value',
  PRIMARY_COMMISSION: 'primary_commission',
  SECONDARY_COMMISSION: 'secondary_commission',
  TOTAL: 'total',
  NOTE: 'note',
  PAYMENT_METHOD: 'payment_method',
  PAYMENT_STATUS: 'payment_status',
  PAYMONGO_LINK_ID: 'paymongo_link_id',

  // Expenses
  AMOUNT: 'amount',
  CATEGORY: 'category',
  RECEIPT_IMAGE: 'receipt_image',

  // Employees
  ROLE: 'role',
  ALLOWANCE: 'allowance',
  IS_ACTIVE: 'is_active',
  PROFILE: 'profile',
  USERNAME: 'username',
  LOGIN_PIN: 'login_pin',
  PIN_SALT: 'pin_salt',
  REQUEST_RESET: 'request_reset',
  RESET_APPROVED: 'reset_approved',
  OTP_HASH: 'otp_hash',
  OTP_SALT: 'otp_salt',
  OTP_EXPIRES_AT: 'otp_expires_at',
  BRANCH_ALLOWANCES: 'branch_allowances',
  FIRST_NAME: 'first_name',
  MIDDLE_NAME: 'middle_name',
  LAST_NAME: 'last_name',
  DETAILS: 'details',
  FACE_DESCRIPTORS: 'face_descriptors',

  // Employee Leave
  ON_LEAVE: 'on_leave',
  LEAVE_TYPE: 'leave_type',
  LEAVE_START_DATE: 'leave_start_date',
  LEAVE_END_DATE: 'leave_end_date',

  // Attendance & Shift
  STAFF_NAME: 'staff_name',
  EMPLOYEE_ID: 'employee_id',
  EMPLOYEE_NAME: 'employee_name',
  CLOCK_IN: 'clock_in',
  CLOCK_OUT: 'clock_out',
  CLOCK_IN_METHOD: 'clock_in_method',
  STATUS: 'status',
  DATE_STR: 'date_str',
  DATE: 'date',
  LATE_DEDUCTION: 'late_deduction',
  OT_PAY: 'ot_pay',
  CASH_ADVANCE: 'cash_advance',
  IS_HALF_DAY: 'is_half_day',
  IS_PAID_DAILY: 'is_paid_daily',
  SETTLED_UNITS: 'settled_units',

  // Service Catalogs
  BRANCH_IDS: 'branch_ids',
  CAN_BE_LOYALTY: 'can_be_loyalty',

  // Audit Logs
  ACTIVITY_TYPE: 'activity_type',
  ENTITY_TYPE: 'entity_type',
  ENTITY_ID: 'entity_id',
  DESCRIPTION: 'description',
  PERFORMER_NAME: 'performer_name',

  // Sales Reports
  REPORT_DATE: 'report_date',
  SUBMITTED_AT: 'submitted_at',
  GROSS_SALES: 'gross_sales',
  TOTAL_STAFF_PAY: 'total_staff_pay',
  TOTAL_EXPENSES: 'total_expenses',
  TOTAL_VAULT_PROVISION: 'total_vault_provision',
  NET_ROI: 'net_roi',
  SESSION_DATA: 'session_data',
  STAFF_BREAKDOWN: 'staff_breakdown',
  EXPENSE_DATA: 'expense_data',
  VAULT_DATA: 'vault_data',

  // System Config
  KEY: 'key',
  VALUE: 'value',

  // Multi-Device Guard (Virtual columns for system_config)
  CONTROLLER_ID: 'controller_id',
  CONTROLLER_HEARTBEAT: 'controller_heartbeat',
  CONTROLLER_NAME: 'controller_name',

  // Payroll
  SETTLEMENT: 'settlement',
  BRANCH: 'branch',

  // Branch Bills & Catalog
  DUE_DAY: 'due_day',
  BILL_ID: 'bill_id',
  PERIOD_COVERED: 'period_covered',
  AMOUNT_PAID: 'amount_paid',
  PAID_AT: 'paid_at',
  RECORDED_BY: 'recorded_by',
  CATALOG_ID: 'catalog_id',
  SUGGESTED_AMOUNT: 'suggested_amount',
  CREATED_BY: 'created_by',

  // Vault Transactions
  REPORT_ID: 'report_id',
  PERFORMED_BY: 'performed_by',

  // Remittance Adjustments & Submissions
  PERIOD_LABEL: 'period_label',
  SUBMITTED_BY: 'submitted_by',
  TARGET_OWNER: 'target_owner',

  // Portal Users
  DISPLAY_NAME: 'display_name',
  PERMISSIONS: 'permissions',
  IS_SUPERADMIN: 'is_superadmin',

  // Employee Complaints
  REPORT_TYPE: 'report_type',
  INCIDENT_DATE: 'incident_date',
  INCIDENT_TIME: 'incident_time',
  WITNESSES: 'witnesses',
  FILED_BY_ID: 'filed_by_id',
  FILED_BY_NAME: 'filed_by_name',
  FILED_AT: 'filed_at',
  ACTION_TAKEN: 'action_taken',
  JUDGMENT: 'judgment',
  RESOLUTION: 'resolution',
  REVIEWED_AT: 'reviewed_at',

  // Requests
  TYPE: 'type',
  DATA: 'data',
  REQUESTER_ID: 'requester_id',
  REQUESTER_NAME: 'requester_name',
  REVIEWED_BY: 'reviewed_by',
  REVIEW_NOTE: 'review_note',

  // Branch Vaults (dedicated table — one row per branch)
  VAULT_TARGET: 'target',
  VAULT_BALANCE: 'balance',
  VAULT_INITIAL_BALANCE: 'initial_balance',
  VAULT_LAST_DEPOSITED_DATE: 'last_deposited_date',
  VAULT_START_DATE: 'start_date',

  // Device Logs
  DEVICE_ID: 'device_id',
  USER_AGENT: 'user_agent',
  BROWSER: 'browser',
  BROWSER_VERSION: 'browser_version',
  OS: 'os',
  DEVICE_TYPE: 'device_type',
  SCREEN_RESOLUTION: 'screen_resolution',
  FIRST_SEEN: 'first_seen',
  LAST_SEEN: 'last_seen',
  SESSION_COUNT: 'session_count',
  DEVICE_MODEL: 'device_model',
  LOCATION: 'location',
  FINGERPRINT_ID: 'fingerprint_id',
} as const;