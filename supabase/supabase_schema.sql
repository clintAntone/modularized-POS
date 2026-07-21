
-- HILOT CENTER CORE - DATABASE RECONSTRUCTION SCRIPT v5.8
-- Convention: snake_case | Compatibility: Supabase PostgreSQL

-- 0. CLEAN SLATE
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.sales_reports CASCADE;
DROP TABLE IF EXISTS public.shift_logs CASCADE;
DROP TABLE IF EXISTS public.attendance CASCADE;
DROP TABLE IF EXISTS public.attendance_logs CASCADE;
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.employees CASCADE;
DROP TABLE IF EXISTS public.service_catalogs CASCADE;
DROP TABLE IF EXISTS public.branches CASCADE;
DROP TABLE IF EXISTS public.system_config CASCADE;
DROP TABLE IF EXISTS public.payroll CASCADE;

-- 1. BRANCHES
CREATE TABLE public.branches (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    pin TEXT NOT NULL DEFAULT '123456',
    is_pin_changed BOOLEAN DEFAULT FALSE,
    is_enabled BOOLEAN DEFAULT TRUE,
    is_open BOOLEAN DEFAULT FALSE,
    is_open_date TEXT, 
    manager TEXT,
    services JSONB DEFAULT '[]',
    weekly_cutoff TEXT DEFAULT '0',
    cycle_start_date TEXT,
    daily_provision_amount NUMERIC DEFAULT 800,
    enable_shift_tracking BOOLEAN DEFAULT FALSE,
    opening_time TEXT DEFAULT '09:00',
    closing_time TEXT DEFAULT '22:00',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. SERVICE CATALOGS
CREATE TABLE public.service_catalogs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    services JSONB DEFAULT '[]',
    branch_ids JSONB DEFAULT '[]',
    can_be_loyalty BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. EMPLOYEES
CREATE TABLE public.employees (
    id TEXT PRIMARY KEY,
    branch_id TEXT REFERENCES public.branches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL, 
    allowance NUMERIC DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    profile TEXT,
    username TEXT UNIQUE, 
    login_pin TEXT,      
    pin_salt TEXT,      
    request_reset BOOLEAN DEFAULT FALSE,
    reset_approved BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TRANSACTIONS
CREATE TABLE public.transactions (
    id TEXT PRIMARY KEY,
    branch_id TEXT REFERENCES public.branches(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    client_name TEXT NOT NULL,
    therapist_name TEXT,
    bonesetter_name TEXT,
    service_id TEXT,
    service_name TEXT,
    base_price NUMERIC DEFAULT 0,
    discount NUMERIC DEFAULT 0,
    voucher_value NUMERIC DEFAULT 0,
    primary_commission NUMERIC DEFAULT 0,
    secondary_commission NUMERIC DEFAULT 0,
    total NUMERIC DEFAULT 0,
    payment_method TEXT DEFAULT 'CASH',
    payment_status TEXT DEFAULT 'PAID',
    paymongo_link_id TEXT
);

-- 5. EXPENSES
CREATE TABLE public.expenses (
    id TEXT PRIMARY KEY,
    branch_id TEXT REFERENCES public.branches(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    name TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    category TEXT NOT NULL, 
    receipt_image TEXT
);

-- 6. ATTENDANCE
CREATE TABLE public.attendance (
    id TEXT PRIMARY KEY,
    branch_id TEXT REFERENCES public.branches(id) ON DELETE CASCADE,
    employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE,
    staff_name TEXT NOT NULL,
    date TEXT NOT NULL,
    clock_in TIMESTAMPTZ,
    clock_out TIMESTAMPTZ,
    status TEXT, 
    late_deduction NUMERIC DEFAULT 0,
    ot_pay NUMERIC DEFAULT 0,
    cash_advance NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. SHIFT LOGS
CREATE TABLE public.shift_logs (
    id TEXT PRIMARY KEY,
    branch_id TEXT REFERENCES public.branches(id) ON DELETE CASCADE,
    employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE,
    employee_name TEXT NOT NULL,
    clock_in TIMESTAMPTZ NOT NULL,
    clock_out TIMESTAMPTZ,
    date_str TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. SALES REPORTS
CREATE TABLE public.sales_reports (
    id TEXT PRIMARY KEY,
    branch_id TEXT REFERENCES public.branches(id) ON DELETE CASCADE,
    report_date TEXT NOT NULL,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    gross_sales NUMERIC DEFAULT 0,
    total_staff_pay NUMERIC DEFAULT 0,
    total_expenses NUMERIC DEFAULT 0,
    total_vault_provision NUMERIC DEFAULT 0,
    net_roi NUMERIC DEFAULT 0,
    session_data JSONB DEFAULT '[]',
    staff_breakdown JSONB DEFAULT '[]',
    expense_data JSONB DEFAULT '[]',
    vault_data JSONB DEFAULT '[]'
);

-- 9. AUDIT LOGS
CREATE TABLE public.audit_logs (
    id BIGSERIAL PRIMARY KEY,
    branch_id TEXT REFERENCES public.branches(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    activity_type TEXT NOT NULL, 
    entity_type TEXT NOT NULL, 
    entity_id TEXT,
    description TEXT,
    amount NUMERIC,
    performer_name TEXT
);

-- 10. SYSTEM CONFIG
CREATE TABLE public.system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. PAYROLL SETTLEMENTS
CREATE TABLE public.payroll (
    id BIGSERIAL PRIMARY KEY,
    branch_id TEXT REFERENCES public.branches(id) ON DELETE CASCADE,
    settlement TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    total_payout NUMERIC DEFAULT 0,
    staff_summary JSONB DEFAULT '[]',
    daily_records JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(branch_id, settlement)
);

-- 12. ATTENDANCE LOGS (Legacy Placeholder)
CREATE TABLE public.attendance_logs (
    id TEXT PRIMARY KEY,
    branch_id TEXT REFERENCES public.branches(id) ON DELETE CASCADE,
    staff_name TEXT NOT NULL,
    status TEXT,
    amount NUMERIC DEFAULT 0,
    cash_advance NUMERIC DEFAULT 0,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 13. REQUESTS
CREATE TABLE public.requests (
    id TEXT PRIMARY KEY,
    branch_id TEXT REFERENCES public.branches(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    data JSONB DEFAULT '{}',
    requester_id TEXT,
    requester_name TEXT,
    reviewed_by TEXT,
    review_note TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ENABLE ROW LEVEL SECURITY
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_catalogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;

-- CREATE UNIVERSAL POLICIES
CREATE POLICY "Enable all for all" ON public.branches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON public.transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON public.expenses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON public.employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON public.attendance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON public.shift_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON public.sales_reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON public.system_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON public.payroll FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON public.service_catalogs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON public.attendance_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON public.requests FOR ALL USING (true) WITH CHECK (true);

-- STORAGE INFRASTRUCTURE
-- Ensure buckets exist
INSERT INTO storage.buckets (id, name, public) VALUES ('profiles', 'profiles', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('face-photos', 'face-photos', false) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Allow all on face-photos" ON storage.objects FOR ALL USING (bucket_id = 'face-photos') WITH CHECK (bucket_id = 'face-photos');

-- STORAGE POLICIES (Fixes 403 Unauthorized Errors)
CREATE POLICY "Allow all on profiles" ON storage.objects FOR ALL USING (bucket_id = 'profiles') WITH CHECK (bucket_id = 'profiles');
CREATE POLICY "Allow all on receipts" ON storage.objects FOR ALL USING (bucket_id = 'receipts') WITH CHECK (bucket_id = 'receipts');

-- INITIAL CONFIGURATION
INSERT INTO public.system_config (key, value) VALUES ('master_admin_pin', '000000') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.system_config (key, value) VALUES ('paymongo_enabled', 'false') ON CONFLICT (key) DO NOTHING;
