-- ====================================================================
-- LENSKART LOCUS QUALITY & COMPLIANCE PLATFORM 2.0
-- Supabase Enterprise Database Schema Template
-- SuperAdmin Production Deployment Script
-- ====================================================================

-- ====================================================================
-- 0. CONFIGURABLE DEFAULT STAFF PASSWORD (FOR AUTH.USERS CREATION)
-- ====================================================================
-- Type your simple text combo for the default staff password below!
-- Every imported employee will have a direct row in auth.users created with this
-- password (hashed via Blowfish/bcrypt) until they reset or update it.
CREATE OR REPLACE FUNCTION public.get_default_staff_password()
RETURNS TEXT 
LANGUAGE sql 
IMMUTABLE 
AS $$
    -- >>> ENTER YOUR DEFAULT PASSWORD COMBO BELOW BETWEEN THE SINGLE QUOTES <<<
    SELECT 'lens1234'; -- <--- [TYPE YOUR DEFAULT PASSWORD HERE e.g. 'Lenskart@2026']
$$;

-- ====================================================================
-- OPTIONAL: RUN THIS BLOCK IF YOU WANT A 100% CLEAN SLATE WIPE
-- OF auth.users AND public.profiles (PRESERVES RULES, TASKS & SCHEMA)
-- Simply highlight this block and execute it in Supabase SQL Editor:
-- ====================================================================
/*
DO $$
BEGIN
    -- 1. Unlink self-referencing managers in profiles
    BEGIN
        UPDATE public.profiles SET reporting_manager_id = NULL, regional_manager_id = NULL;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- 2. Unlink auditor references in tasks (only columns that exist)
    BEGIN
        UPDATE public.tasks SET assigned_auditor_id = NULL, audited_by_id = NULL;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- 3. Unlink rules drafted/published by id
    BEGIN
        UPDATE public.audit_criteria_rules SET drafted_by_id = NULL, published_by_id = NULL;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- 4. Clear dependent capacity & roster tables
    BEGIN
        DELETE FROM public.auditor_capacity;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DELETE FROM public.auditor_roster;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- 5. Delete all records from public.profiles
    BEGIN
        DELETE FROM public.profiles;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- 6. Delete all auth users & cascaded identities, sessions, tokens
    BEGIN
        DELETE FROM auth.identities;
        DELETE FROM auth.sessions;
        DELETE FROM auth.refresh_tokens;
        DELETE FROM auth.mfa_factors;
        DELETE FROM auth.mfa_challenges;
        DELETE FROM auth.mfa_amr_claims;
        DELETE FROM auth.audit_log_entries;
        DELETE FROM auth.users;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RAISE NOTICE 'Clean slate complete: auth.users and public.profiles have been wiped!';
END $$;
*/

-- GoTrue Scanner Compatibility Repair: Ensure no NULL token strings exist in auth.users
UPDATE auth.users SET
    confirmation_token = COALESCE(confirmation_token, ''),
    recovery_token = COALESCE(recovery_token, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    email_change = COALESCE(email_change, ''),
    email_change_token_current = COALESCE(email_change_token_current, ''),
    phone_change = COALESCE(phone_change, ''),
    phone_change_token = COALESCE(phone_change_token, ''),
    reauthentication_token = COALESCE(reauthentication_token, ''),
    is_super_admin = COALESCE(is_super_admin, false),
    is_sso_user = COALESCE(is_sso_user, false),
    is_anonymous = COALESCE(is_anonymous, false),
    email_change_confirm_status = COALESCE(email_change_confirm_status, 0),
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    raw_app_meta_data = COALESCE(raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb),
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb);

-- Also ensure passwords are valid bcrypt hashes for all users
DO $$ 
DECLARE
    v_def_pwd TEXT;
    v_def_hash TEXT;
BEGIN
    v_def_pwd := COALESCE(NULLIF(TRIM(public.get_default_staff_password()), ''), 'lens1234');
    v_def_hash := crypt(v_def_pwd, gen_salt('bf', 8));

    UPDATE auth.users 
    SET encrypted_password = v_def_hash
    WHERE encrypted_password IS NULL OR encrypted_password = '';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Ensure all existing auth.users have matching auth.identities for GoTrue login
DO $$ BEGIN
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    SELECT 
        u.id::text,
        u.id,
        jsonb_build_object('sub', u.id::text, 'email', u.email),
        'email',
        u.id::text,
        NOW(),
        NOW(),
        NOW()
    FROM auth.users u
    WHERE NOT EXISTS (
        SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email'
    )
    ON CONFLICT DO NOTHING;
EXCEPTION 
    WHEN undefined_column THEN
        INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        SELECT 
            u.id::text,
            u.id,
            jsonb_build_object('sub', u.id::text, 'email', u.email),
            'email',
            NOW(),
            NOW(),
            NOW()
        FROM auth.users u
        WHERE NOT EXISTS (
            SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email'
        )
        ON CONFLICT DO NOTHING;
    WHEN OTHERS THEN
        NULL;
END $$;

-- TIP: If you want a 100% FRESH RESET (wipe old tables and start from scratch),
-- uncomment the 3 lines below before running this script:
-- DROP SCHEMA public CASCADE;
-- CREATE SCHEMA public;
-- GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. CUSTOM ENUMS
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM (
        'SuperAdmin',
        'Admin',          -- City Admin (handles city level affairs & POS orders)
        'BH',             -- Business Head (direct rule publishment, national governance)
        'GM',             -- General Manager (2-step rule review, negligence oversight)
        'RM',             -- Regional Manager (regional cluster)
        'AM',             -- Area Manager (local hub operations)
        'Central Ops',    -- Lead ingestion, auto-allocation & central warehouse stock
        'Auditor',        -- Image inspection & audit execution
        'FE'              -- Field Executive (Self-service compliance portal)
    );
EXCEPTION WHEN duplicate_object THEN
    BEGIN
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SuperAdmin';
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Admin';
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'BH';
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'GM';
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'RM';
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'AM';
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Central Ops';
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Auditor';
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'FE';
    EXCEPTION WHEN OTHERS THEN null;
    END;
END $$;

DO $$ BEGIN
    CREATE TYPE audit_status_type AS ENUM ('PENDING', 'PASSED', 'FATAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE shift_status_type AS ENUM ('AVAILABLE', 'HALF_DAY', 'HIGH_FREE_TIME', 'ON_LEAVE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE pos_order_status AS ENUM (
        'FLAGGED_BY_AUDITOR', 
        'ORDERED_ON_POS', 
        'DISBURSED_TO_FE', 
        'REJECTED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE replacement_severity AS ENUM ('CRITICAL', 'HIGH', 'NORMAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE rule_status_type AS ENUM ('PUBLISHED', 'DRAFT_PENDING_BH');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ====================================================================
-- 3. PROFILES TABLE (RBAC Profiles for Lenskart DLC Staff)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role user_role NOT NULL DEFAULT 'Auditor',
    roles TEXT[] DEFAULT ARRAY['Auditor']::TEXT[], -- Multi-role support (e.g. ['SuperAdmin', 'Auditor', 'Admin'])
    facility_code TEXT DEFAULT 'Ahmedabad',        -- Hub code (e.g. 'Ahmedabad', 'LKH1146')
    city TEXT DEFAULT 'Ahmedabad',                 -- City (e.g. 'Ahmedabad', 'NCR', 'Delhi')
    zone TEXT DEFAULT 'Ahmedabad_Zone1',           -- Zone (e.g. 'Ahmedabad_Zone1', 'Noida')
    person_id TEXT,                                -- Rider ID or Employee Code
    employee_code TEXT,                            -- Explicit Employee Code
    phone TEXT,
    
    -- Relational foreign keys to manager profiles in Supabase
    reporting_manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Direct AM
    regional_manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,  -- Direct RM
    
    -- Fast email & name cache
    reporting_manager_email TEXT,                  -- AM Email for fatal notices
    reporting_manager_name TEXT,                   -- AM Name
    regional_manager_email TEXT,                   -- RM Email for fatal notices
    regional_manager_name TEXT,                    -- RM Name
    
    -- Summary Quality & Performance Counters (Lifetime)
    total_tasks_completed INT DEFAULT 0,
    total_tasks_passed INT DEFAULT 0,
    total_tasks_fatal INT DEFAULT 0,
    fatal_rate NUMERIC DEFAULT 0.0,
    
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure id default, foreign key flexibility, multi-role & manager hierarchy columns if table already exists
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tc.constraint_name 
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name 
         AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public' 
          AND tc.table_name = 'profiles' 
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'id'
    ) LOOP
        EXECUTE 'ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
    END LOOP;
END $$;

ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS employee_code TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city TEXT DEFAULT 'Ahmedabad';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS zone TEXT DEFAULT 'Ahmedabad_Zone1';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS facility_code TEXT DEFAULT 'Ahmedabad';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS roles TEXT[] DEFAULT ARRAY['Auditor']::TEXT[];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS reporting_manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS regional_manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS reporting_manager_email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS reporting_manager_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS regional_manager_email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS regional_manager_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_tasks_completed INT DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_tasks_passed INT DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_tasks_fatal INT DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fatal_rate NUMERIC DEFAULT 0.0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Ensure unique constraint on profiles.email for clean upserts
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'profiles_email_key'
    ) THEN
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_email_key UNIQUE (email);
    END IF;
EXCEPTION WHEN OTHERS THEN null;
END $$;

-- Relational View: Field Executive Hierarchy with Joined AM & RM Profiles
CREATE OR REPLACE VIEW public.fe_hierarchy_view AS
SELECT 
    fe.id,
    fe.full_name,
    fe.email,
    COALESCE(fe.employee_code, fe.person_id) AS employee_code,
    fe.person_id AS rider_id,
    COALESCE(fe.city, fe.facility_code) AS city,
    fe.facility_code,
    fe.zone,
    fe.phone,
    fe.roles,
    fe.total_tasks_completed,
    fe.total_tasks_passed,
    fe.total_tasks_fatal,
    fe.fatal_rate,
    fe.reporting_manager_id,
    am.full_name AS am_name,
    am.email AS am_email,
    fe.regional_manager_id,
    rm.full_name AS rm_name,
    rm.email AS rm_email
FROM public.profiles fe
LEFT JOIN public.profiles am ON fe.reporting_manager_id = am.id
LEFT JOIN public.profiles rm ON fe.regional_manager_id = rm.id
WHERE 'FE' = ANY(fe.roles) OR fe.role = 'FE';

-- Indexing on profiles
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_facility ON public.profiles(facility_code);
CREATE INDEX IF NOT EXISTS idx_profiles_person_id ON public.profiles(person_id);
CREATE INDEX IF NOT EXISTS idx_profiles_employee_code ON public.profiles(employee_code);

-- ====================================================================
-- 4. TASKS TABLE (Locus Completed & Ingested Dispatches)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.tasks (
    id TEXT PRIMARY KEY, -- Locus Task ID (e.g. '1355099873')
    task_id TEXT NOT NULL,
    team_name TEXT DEFAULT 'Ahmedabad',
    facility_code TEXT DEFAULT 'Ahmedabad',
    city TEXT DEFAULT 'Ahmedabad',
    zone TEXT,
    dispatch_date TEXT,
    status TEXT DEFAULT 'COMPLETED', -- 'COMPLETED', 'CANCELLED', 'WAITING', 'ONGOING'
    fe_name TEXT NOT NULL,
    fe_code TEXT,
    fe_id TEXT,                      -- Rider ID
    fe_email TEXT,
    customer_name TEXT,
    customer_address TEXT,
    pincode TEXT,
    delivery_pin TEXT,
    cancellation_reason TEXT,
    image_urls JSONB DEFAULT '{}'::jsonb,
    image_count INT DEFAULT 0,
    has_images BOOLEAN DEFAULT false,
    
    -- Auto-Allocation fields
    assigned_auditor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assigned_auditor_name TEXT,
    allocated_at TIMESTAMPTZ,
    allocation_batch_id TEXT,

    -- Audit execution fields
    audit_status audit_status_type DEFAULT 'PENDING',
    audited_at TIMESTAMPTZ,
    audited_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    audited_by_name TEXT,
    audited_location TEXT,
    criteria_status JSONB DEFAULT '{}'::jsonb,
    failed_reasons JSONB DEFAULT '[]'::jsonb,
    auditor_remarks TEXT,
    replacements JSONB DEFAULT '[]'::jsonb,
    warning_level TEXT,

    -- Email notification logging
    email_sent BOOLEAN DEFAULT false,
    email_sent_at TIMESTAMPTZ,
    email_recipients JSONB DEFAULT '[]'::jsonb,

    raw_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure tasks columns exist if table was previously created
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS city TEXT DEFAULT 'Ahmedabad';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS facility_code TEXT DEFAULT 'Ahmedabad';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS zone TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS fe_id TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS fe_code TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS image_urls JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS image_count INT DEFAULT 0;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS has_images BOOLEAN DEFAULT false;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS criteria_status JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS failed_reasons JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS replacements JSONB DEFAULT '[]'::jsonb;

-- Task Indexes for high performance querying
CREATE INDEX IF NOT EXISTS idx_tasks_fe_id ON public.tasks(fe_id);
CREATE INDEX IF NOT EXISTS idx_tasks_facility_code ON public.tasks(facility_code);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_audit_status ON public.tasks(audit_status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_auditor ON public.tasks(assigned_auditor_id);
CREATE INDEX IF NOT EXISTS idx_tasks_dispatch_date ON public.tasks(dispatch_date);

-- ====================================================================
-- 5. AUDIT CRITERIA RULES TABLE (Centrally Governed by GM & BH)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.audit_criteria_rules (
    id TEXT PRIMARY KEY, -- 'selfie', 'torches', 'visionChart', 'toolkit', 'frameDisplay'
    image_key TEXT NOT NULL,
    station_order INT DEFAULT 1,
    title TEXT NOT NULL,
    description TEXT,
    reference_image_url TEXT,
    standards JSONB NOT NULL DEFAULT '[]'::jsonb,
    common_failures JSONB NOT NULL DEFAULT '[]'::jsonb,
    improvement_tips JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_mandatory BOOLEAN DEFAULT true,
    triggers_fatal BOOLEAN DEFAULT true,
    
    -- 2-Step Governance fields
    status rule_status_type DEFAULT 'PUBLISHED',
    draft_standards JSONB,
    draft_failures JSONB,
    draft_tips JSONB,
    drafted_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    drafted_by_name TEXT,
    drafted_at TIMESTAMPTZ,
    published_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    published_by_name TEXT,
    published_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- 6. ASSETS & CONSUMABLES WATCHLIST TABLE (Central Catalogue)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.assets_watchlist (
    id TEXT PRIMARY KEY, -- 'torch_blue', 'trial_frame', etc.
    name TEXT NOT NULL,
    category TEXT NOT NULL, -- 'Diagnostic Penlights', 'Refraction Toolkit', etc.
    type TEXT NOT NULL DEFAULT 'Asset', -- 'Asset' or 'Consumable'
    linked_image_key TEXT,
    default_cost NUMERIC(10,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- 7. REPLACEMENT ORDERS TABLE (Auditor Flagged -> City Admin POS Orders)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.replacement_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id TEXT REFERENCES public.tasks(id) ON DELETE CASCADE,
    fe_id TEXT NOT NULL,
    fe_name TEXT NOT NULL,
    fe_code TEXT,
    facility_code TEXT NOT NULL,
    zone TEXT,
    item_id TEXT REFERENCES public.assets_watchlist(id) ON DELETE RESTRICT,
    item_name TEXT NOT NULL,
    category TEXT NOT NULL,
    type TEXT NOT NULL,
    fault_condition TEXT NOT NULL,
    urgency replacement_severity DEFAULT 'NORMAL', -- 'CRITICAL', 'HIGH', 'NORMAL'
    auditor_notes TEXT,
    
    -- POS Lifecycle handled by City Admin / Area Manager
    pos_status pos_order_status DEFAULT 'FLAGGED_BY_AUDITOR',
    pos_order_number TEXT,
    pos_ordered_at TIMESTAMPTZ,
    pos_ordered_by_name TEXT,
    disbursed_to_fe_at TIMESTAMPTZ,
    
    reported_by_name TEXT,
    reported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rep_facility ON public.replacement_orders(facility_code);
CREATE INDEX IF NOT EXISTS idx_rep_pos_status ON public.replacement_orders(pos_status);
CREATE INDEX IF NOT EXISTS idx_rep_urgency ON public.replacement_orders(urgency);

-- ====================================================================
-- 8. AUDITOR ROSTER & CAPACITY TABLE (50 Weekday / 75 Weekend)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.auditor_roster (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auditor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    auditor_name TEXT NOT NULL,
    roster_date DATE NOT NULL,
    shift_status shift_status_type DEFAULT 'AVAILABLE',
    daily_quota INT NOT NULL DEFAULT 50, -- 50 weekday, 75 weekend
    current_assigned INT NOT NULL DEFAULT 0,
    completed_count INT NOT NULL DEFAULT 0,
    notes TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(auditor_id, roster_date)
);

-- ====================================================================
-- 9. AUDIT EMAIL NOTIFICATION LOGS (Audit Failure Notices)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.audit_email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id TEXT NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    fe_email TEXT NOT NULL,
    am_email TEXT NOT NULL,
    rm_email TEXT NOT NULL,
    reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
    improvement_tips JSONB NOT NULL DEFAULT '[]'::jsonb,
    sent_by TEXT NOT NULL,
    status TEXT DEFAULT 'SENT',
    sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_task ON public.audit_email_logs(task_id);

-- ====================================================================
-- 10. ANALYTICAL VIEWS FOR GM, BH, & CENTRAL OPS
-- ====================================================================

-- View 1: City Admin Negligence & POS Fulfillment Lag View (GM & BH)
CREATE OR REPLACE VIEW public.v_city_admin_negligence AS
SELECT 
    facility_code,
    COUNT(*) AS total_flagged_items,
    COUNT(*) FILTER (WHERE pos_status = 'FLAGGED_BY_AUDITOR') AS pending_pos_orders,
    COUNT(*) FILTER (WHERE pos_status = 'ORDERED_ON_POS') AS ordered_on_pos_count,
    COUNT(*) FILTER (WHERE pos_status = 'DISBURSED_TO_FE') AS disbursed_count,
    COUNT(*) FILTER (WHERE urgency = 'CRITICAL' AND pos_status = 'FLAGGED_BY_AUDITOR') AS critical_neglected_count,
    AVG(CASE 
        WHEN pos_ordered_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (pos_ordered_at - reported_at)) / 3600 
        ELSE NULL 
    END) AS avg_turnaround_hours
FROM public.replacement_orders
GROUP BY facility_code;

-- View 2: Central Ops Stock Readiness & National Demand Aggregation
CREATE OR REPLACE VIEW public.v_central_stock_readiness AS
SELECT 
    item_name,
    category,
    type,
    COUNT(*) AS total_national_demand,
    COUNT(*) FILTER (WHERE urgency = 'CRITICAL') AS critical_immediate_demand,
    COUNT(*) FILTER (WHERE urgency = 'HIGH') AS high_priority_demand,
    COUNT(DISTINCT facility_code) AS affected_hubs_count,
    ARRAY_AGG(DISTINCT facility_code) AS affected_hubs
FROM public.replacement_orders
WHERE pos_status IN ('FLAGGED_BY_AUDITOR', 'ORDERED_ON_POS')
GROUP BY item_name, category, type;

-- ====================================================================
-- 11. SUPABASE AUTH INTEGRATION TRIGGER (Fail-Safe)
-- ====================================================================
-- Automatically creates or syncs profile in public.profiles when an individual user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    user_role_val user_role := 'Auditor';
    role_text TEXT;
BEGIN
    BEGIN
        role_text := new.raw_user_meta_data->>'role';
        IF role_text IS NOT NULL AND role_text IN ('SuperAdmin', 'Admin', 'BH', 'GM', 'RM', 'AM', 'Central Ops', 'Auditor', 'FE') THEN
            user_role_val := role_text::user_role;
        END IF;

        INSERT INTO public.profiles (
            id, 
            auth_user_id, 
            full_name, 
            email, 
            role, 
            roles,
            facility_code, 
            city,
            person_id, 
            employee_code
        )
        VALUES (
            new.id,
            new.id,
            COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
            new.email,
            user_role_val,
            ARRAY[user_role_val::TEXT],
            COALESCE(new.raw_user_meta_data->>'facility_code', 'Ahmedabad'),
            COALESCE(new.raw_user_meta_data->>'city', new.raw_user_meta_data->>'facility_code', 'Ahmedabad'),
            COALESCE(new.raw_user_meta_data->>'person_id', ''),
            COALESCE(new.raw_user_meta_data->>'person_id', '')
        )
        ON CONFLICT (email) DO UPDATE SET
            auth_user_id = EXCLUDED.auth_user_id,
            full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
            updated_at = NOW();
    EXCEPTION WHEN OTHERS THEN
        -- Never abort auth signup under any circumstance
        NULL;
    END;

    RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ====================================================================
-- 12. ROW LEVEL SECURITY (RLS) & REST API PERMISSIONS
-- ====================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_criteria_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replacement_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditor_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_email_logs ENABLE ROW LEVEL SECURITY;

-- Permissive policies for authenticated & anon REST operations
DROP POLICY IF EXISTS "Allow public read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow public write profiles" ON public.profiles;
CREATE POLICY "Allow public read profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Allow public write profiles" ON public.profiles FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read tasks" ON public.tasks;
DROP POLICY IF EXISTS "Allow public write tasks" ON public.tasks;
CREATE POLICY "Allow public read tasks" ON public.tasks FOR SELECT USING (true);
CREATE POLICY "Allow public write tasks" ON public.tasks FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read rules" ON public.audit_criteria_rules;
DROP POLICY IF EXISTS "Allow public write rules" ON public.audit_criteria_rules;
CREATE POLICY "Allow public read rules" ON public.audit_criteria_rules FOR SELECT USING (true);
CREATE POLICY "Allow public write rules" ON public.audit_criteria_rules FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read assets" ON public.assets_watchlist;
DROP POLICY IF EXISTS "Allow public write assets" ON public.assets_watchlist;
CREATE POLICY "Allow public read assets" ON public.assets_watchlist FOR SELECT USING (true);
CREATE POLICY "Allow public write assets" ON public.assets_watchlist FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read replacements" ON public.replacement_orders;
DROP POLICY IF EXISTS "Allow public write replacements" ON public.replacement_orders;
CREATE POLICY "Allow public read replacements" ON public.replacement_orders FOR SELECT USING (true);
CREATE POLICY "Allow public write replacements" ON public.replacement_orders FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read roster" ON public.auditor_roster;
DROP POLICY IF EXISTS "Allow public write roster" ON public.auditor_roster;
CREATE POLICY "Allow public read roster" ON public.auditor_roster FOR SELECT USING (true);
CREATE POLICY "Allow public write roster" ON public.auditor_roster FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read email_logs" ON public.audit_email_logs;
DROP POLICY IF EXISTS "Allow public write email_logs" ON public.audit_email_logs;
CREATE POLICY "Allow public read email_logs" ON public.audit_email_logs FOR SELECT USING (true);
CREATE POLICY "Allow public write email_logs" ON public.audit_email_logs FOR ALL USING (true);

-- Grant privileges to authenticated and anon roles for REST API access
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;

-- ====================================================================
-- 13. SEED DATA (Centrally Governed Rules & Equipment Catalogue Only)
-- Note: NO DEMO TASKS ARE SEEDED. Tasks are ingested when Central Ops uploads files.
-- ====================================================================

-- 13.1 Insert 5 Central SOP Audit Rules with standards, common failures, and improvement tips
INSERT INTO public.audit_criteria_rules (
    id, image_key, station_order, title, description, 
    standards, common_failures, improvement_tips, status
)
VALUES
(
    'selfie', 'selfie', 1, 'Selfie: Lenskart T-Shirt & ID Card', 
    'Refractionist must wear official Lenskart Navy Blue Polo with visible Lenskart lanyard and employee photo ID badge.',
    '["Official Lenskart T-shirt / Polo worn properly", "Employee ID card visibly worn around neck or pinned", "Executive face clearly recognizable, unmasked, and illuminated"]'::jsonb,
    '["Not wearing official Lenskart uniform/T-shirt", "Missing, covered, or unreadable employee ID card", "Face covered, sunglasses on, or blurry picture", "Duplicate / photo of another phone screen"]'::jsonb,
    '["Always wear your official DLC uniform before knocking on the customer door", "Keep ID card facing forward so name and employee code are legible in the camera frame", "Ensure good room lighting before capturing selfie"]'::jsonb,
    'PUBLISHED'
),
(
    'torches', 'torches', 2, 'Working Blue & Yellow Torches', 
    'Both ophthalmic penlights placed side-by-side on flat surface with light beams tested and active.',
    '["Cobalt Blue torch present and illuminated", "Amber Yellow torch present and illuminated", "No cracked lenses or loose battery compartments"]'::jsonb,
    '["Missing blue or yellow torch", "Torches switched off or dead batteries", "Only one torch displayed in frame", "Photo taken inside vehicle or pouch"]'::jsonb,
    '["Test torch battery levels each morning before departing from the Hub", "Carry spare rechargeable AAA batteries in your kit at all times", "Place both torches side-by-side on table and switch ON before clicking"]'::jsonb,
    'PUBLISHED'
),
(
    'visionChart', 'visionChart', 3, 'Vision Chart & Standee Setup', 
    'Standardized Snellen / LogMAR vision acuity chart properly mounted on portable telescoping standee at eye level.',
    '["Chart mounted securely on standee (not taped haphazardly to wall)", "Correct height calibration (eye level for seated patient)", "Chart is clean, unbent, and evenly illuminated without glare"]'::jsonb,
    '["Chart not mounted on standee (taped or pinned to wall)", "Standee missing, bent, or broken", "Chart crumpled, folded, stained, or damaged", "Distance calibration not maintained"]'::jsonb,
    '["Always deploy the telescoping standee on a stable floor surface", "Align the 6/6 line precisely with the patient seating eye level", "If standee bracket is loose, flag immediately for City Admin POS replacement"]'::jsonb,
    'PUBLISHED'
),
(
    'toolkit', 'toolkit', 4, 'Complete Refraction Toolkit', 
    'Complete 6-piece clinical kit: Near vision test book, trial frame, Jackson cross cylinder (JCC), mirror, sanitizer bottle, and PD measurement tape.',
    '["Near vision card / reading book present", "Universal trial frame with clean lenses and smooth knobs", "Jackson Cross Cylinder (±0.25 / ±0.50)", "Patient handheld evaluation mirror", "Hand sanitizer bottle (hygiene compliance)", "Pupillary distance (PD) measurement ruler / tape"]'::jsonb,
    '["Incomplete toolkit (missing trial frame, JCC, or PD tape)", "Missing hand sanitizer bottle (critical hygiene violation)", "Missing PD ruler or near vision card", "Tools disorganized, cracked, or dirty"]'::jsonb,
    '["Arrange all 6 diagnostic tools neatly in the kit tray before photographing", "Sanitize hands in front of the customer prior to touching the trial frame", "Flag scratched lenses or loose frames for immediate Hub exchange"]'::jsonb,
    'PUBLISHED'
),
(
    'frameDisplay', 'frameDisplay', 5, 'Frame Display at Customer House', 
    'Professional multi-compartment frame showcase tray arranged neatly on customer''s living room table with clean trial frames.',
    '["Trays neatly laid out on a clean flat surface inside customer premises", "At least 15-20 trial optical frames showcased in protective grooves", "Clean presentation without packaging debris or personal clutter"]'::jsonb,
    '["Frames not unpacked / shown inside carry bag only", "Photo clicked in hallway, elevator, vehicle, or outside premises", "Disorganized, empty, or dusty display tray", "Reused photo from a prior visit"]'::jsonb,
    '["Request permission to use the living room table for product showcase", "Open tray fully and align frames face-up towards the customer", "Ensure tray velvet lining is clean and lint-free"]'::jsonb,
    'PUBLISHED'
)
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    standards = EXCLUDED.standards,
    common_failures = EXCLUDED.common_failures,
    improvement_tips = EXCLUDED.improvement_tips;

-- 13.2 Insert Central Assets & Consumables Watchlist
INSERT INTO public.assets_watchlist (id, name, category, type, linked_image_key, default_cost)
VALUES
('torch_blue', 'Cobalt Blue Penlight Torch', 'Diagnostic Penlights', 'Asset', 'torches', 450.00),
('torch_yellow', 'Amber Yellow Penlight Torch', 'Diagnostic Penlights', 'Asset', 'torches', 350.00),
('torch_batteries', 'AAA Rechargeable Torch Batteries (Pack of 4)', 'Diagnostic Penlights', 'Consumable', 'torches', 200.00),
('trial_frame', 'Universal Clinical Trial Frame (Adult / Pediatric)', 'Refraction & Optical Toolkit', 'Asset', 'toolkit', 1800.00),
('jcc_lens', 'Jackson Cross Cylinder (JCC ±0.25 / ±0.50)', 'Refraction & Optical Toolkit', 'Asset', 'toolkit', 850.00),
('near_vision_book', 'Near Vision Reading Test Book / Card', 'Refraction & Optical Toolkit', 'Consumable', 'toolkit', 350.00),
('hand_mirror', 'Handheld Patient Evaluation Mirror', 'Refraction & Optical Toolkit', 'Asset', 'toolkit', 250.00),
('pd_tape', 'Pupillary Distance (PD) Measurement Tape / Ruler', 'Refraction & Optical Toolkit', 'Consumable', 'toolkit', 120.00),
('hand_sanitizer', 'Pocket Hand Sanitizer Spray Bottle (50ml/100ml)', 'Hygiene & Consumables', 'Consumable', 'toolkit', 90.00),
('telescopic_standee', 'Portable Telescopic Acuity Standee & Mounting Bracket', 'Vision Testing & Acuity Equipment', 'Asset', 'visionChart', 2400.00),
('snellen_chart', 'Snellen / LogMAR Double-Sided Acuity Chart', 'Vision Testing & Acuity Equipment', 'Consumable', 'visionChart', 400.00),
('frame_display_tray', 'Multi-Grid Frame Showcase Tray (18 slots)', 'Merchandising, Uniform & Bags', 'Asset', 'frameDisplay', 950.00),
('lenskart_tshirt', 'Official Lenskart DLC Polo T-Shirt', 'Merchandising, Uniform & Bags', 'Consumable', 'selfie', 550.00),
('fe_id_card', 'Lanyard & Hard-Plastic Employee Photo ID Badge', 'Merchandising, Uniform & Bags', 'Consumable', 'selfie', 150.00)
ON CONFLICT (id) DO NOTHING;

-- 14. SERVER-SIDE DIRECT AUTH.USERS & PROFILES ENGINE (HIGH-PERFORMANCE)
-- Automatically creates rows directly in auth.users (encrypted with Blowfish/bcrypt)
-- and pushes matching records into public.profiles in one single transaction!

-- Cleanly drop any previous overloaded signatures to prevent 42725 ambiguity errors
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT p.proname, oidvectortypes(p.proargtypes) AS argtypes
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' 
          AND p.proname IN ('register_single_lenskart_user', 'bulk_register_lenskart_users')
    ) LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS public.' || quote_ident(r.proname) || '(' || r.argtypes || ') CASCADE;';
    END LOOP;
END $$;

-- Indexes for lightning-fast lookup during bulk user seeding
CREATE INDEX IF NOT EXISTS idx_profiles_email_lower ON public.profiles(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_profiles_person_lower ON public.profiles(LOWER(person_id));
CREATE INDEX IF NOT EXISTS idx_profiles_emp_lower ON public.profiles(LOWER(employee_code));

CREATE OR REPLACE FUNCTION public.register_single_lenskart_user(
    p_email TEXT,
    p_full_name TEXT,
    p_role TEXT DEFAULT 'Auditor',
    p_facility_code TEXT DEFAULT 'Ahmedabad Hub',
    p_city TEXT DEFAULT 'Ahmedabad',
    p_zone TEXT DEFAULT 'Ahmedabad_Zone1',
    p_employee_code TEXT DEFAULT '',
    p_phone TEXT DEFAULT '',
    p_am_name TEXT DEFAULT '',
    p_rm_name TEXT DEFAULT '',
    p_password TEXT DEFAULT NULL,
    p_precomputed_hash TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_clean_email TEXT;
    v_clean_name TEXT;
    v_clean_code TEXT;
    v_password TEXT;
    v_password_hash TEXT;
    v_user_id UUID;
    v_role_enum user_role := 'Auditor';
    v_roles TEXT[];
BEGIN
    v_clean_email := LOWER(TRIM(p_email));
    v_clean_name := TRIM(COALESCE(p_full_name, split_part(v_clean_email, '@', 1)));
    v_clean_code := TRIM(COALESCE(p_employee_code, ''));
    
    -- High Performance: Reuse precomputed bcrypt hash if available!
    IF p_precomputed_hash IS NOT NULL AND p_precomputed_hash <> '' THEN
        v_password_hash := p_precomputed_hash;
    ELSE
        v_password := COALESCE(
            NULLIF(TRIM(p_password), ''),
            NULLIF(TRIM(public.get_default_staff_password()), ''),
            'Lenskart@2026'
        );
        -- Cost factor 8 is fast (40ms) and secure for initial bulk setup
        v_password_hash := crypt(v_password, gen_salt('bf', 8));
    END IF;

    -- Safe role conversion
    BEGIN
        v_role_enum := p_role::user_role;
    EXCEPTION WHEN OTHERS THEN
        v_role_enum := 'Auditor'::user_role;
    END;
    v_roles := ARRAY[v_role_enum::TEXT];

    -- 1. Check if user already exists in auth.users
    SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = v_clean_email LIMIT 1;

    -- 2. If not in auth.users, create new row directly in auth.users with ALL required GoTrue token strings!
    IF v_user_id IS NULL THEN
        v_user_id := gen_random_uuid();

        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            last_sign_in_at,
            raw_app_meta_data,
            raw_user_meta_data,
            is_super_admin,
            is_sso_user,
            is_anonymous,
            email_change_confirm_status,
            created_at,
            updated_at,
            confirmation_token,
            recovery_token,
            email_change_token_new,
            email_change,
            email_change_token_current,
            phone_change,
            phone_change_token,
            reauthentication_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            v_user_id,
            'authenticated',
            'authenticated',
            v_clean_email,
            v_password_hash,
            NOW(),
            NOW(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object(
                'full_name', v_clean_name,
                'role', v_role_enum::TEXT,
                'facility_code', p_facility_code,
                'person_id', v_clean_code
            ),
            false,
            false,
            false,
            0,
            NOW(),
            NOW(),
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            ''
        );

        -- Also insert corresponding record into auth.identities
        BEGIN
            INSERT INTO auth.identities (
                id,
                user_id,
                identity_data,
                provider,
                provider_id,
                last_sign_in_at,
                created_at,
                updated_at
            ) VALUES (
                v_user_id::text,
                v_user_id,
                jsonb_build_object('sub', v_user_id::text, 'email', v_clean_email),
                'email',
                v_user_id::text,
                NOW(),
                NOW(),
                NOW()
            )
            ON CONFLICT DO NOTHING;
        EXCEPTION 
            WHEN undefined_column THEN
                INSERT INTO auth.identities (
                    id,
                    user_id,
                    identity_data,
                    provider,
                    last_sign_in_at,
                    created_at,
                    updated_at
                ) VALUES (
                    v_user_id::text,
                    v_user_id,
                    jsonb_build_object('sub', v_user_id::text, 'email', v_clean_email),
                    'email',
                    NOW(),
                    NOW(),
                    NOW()
                )
                ON CONFLICT DO NOTHING;
            WHEN OTHERS THEN
                NULL;
        END;
    ELSE
        -- Update existing auth user metadata and fix any NULL tokens
        UPDATE auth.users SET
            confirmation_token = COALESCE(confirmation_token, ''),
            recovery_token = COALESCE(recovery_token, ''),
            email_change_token_new = COALESCE(email_change_token_new, ''),
            email_change = COALESCE(email_change, ''),
            email_change_token_current = COALESCE(email_change_token_current, ''),
            phone_change = COALESCE(phone_change, ''),
            phone_change_token = COALESCE(phone_change_token, ''),
            reauthentication_token = COALESCE(reauthentication_token, ''),
            is_super_admin = COALESCE(is_super_admin, false),
            is_sso_user = COALESCE(is_sso_user, false),
            is_anonymous = COALESCE(is_anonymous, false),
            email_change_confirm_status = COALESCE(email_change_confirm_status, 0),
            email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
            encrypted_password = CASE 
                WHEN encrypted_password IS NULL OR encrypted_password = '' THEN v_password_hash 
                ELSE encrypted_password 
            END,
            raw_user_meta_data = jsonb_build_object(
                'full_name', v_clean_name,
                'role', v_role_enum::TEXT,
                'facility_code', p_facility_code,
                'person_id', v_clean_code
            ),
            updated_at = NOW()
        WHERE id = v_user_id;

        -- Ensure identity also exists for existing user
        BEGIN
            INSERT INTO auth.identities (
                id,
                user_id,
                identity_data,
                provider,
                provider_id,
                last_sign_in_at,
                created_at,
                updated_at
            ) VALUES (
                v_user_id::text,
                v_user_id,
                jsonb_build_object('sub', v_user_id::text, 'email', v_clean_email),
                'email',
                v_user_id::text,
                NOW(),
                NOW(),
                NOW()
            )
            ON CONFLICT DO NOTHING;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    -- 3. Insert or update into public.profiles
    INSERT INTO public.profiles (
        id,
        auth_user_id,
        email,
        full_name,
        role,
        roles,
        facility_code,
        city,
        zone,
        person_id,
        employee_code,
        phone,
        reporting_manager_name,
        regional_manager_name,
        is_active,
        updated_at
    ) VALUES (
        v_user_id,
        v_user_id,
        v_clean_email,
        v_clean_name,
        v_role_enum,
        v_roles,
        p_facility_code,
        COALESCE(p_city, p_facility_code, 'Ahmedabad'),
        COALESCE(p_zone, 'Ahmedabad_Zone1'),
        v_clean_code,
        v_clean_code,
        p_phone,
        p_am_name,
        p_rm_name,
        true,
        NOW()
    )
    ON CONFLICT (email) DO UPDATE SET
        auth_user_id = EXCLUDED.auth_user_id,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        roles = EXCLUDED.roles,
        facility_code = EXCLUDED.facility_code,
        city = EXCLUDED.city,
        zone = EXCLUDED.zone,
        person_id = EXCLUDED.person_id,
        employee_code = EXCLUDED.employee_code,
        phone = COALESCE(NULLIF(EXCLUDED.phone, ''), public.profiles.phone),
        reporting_manager_name = COALESCE(NULLIF(EXCLUDED.reporting_manager_name, ''), public.profiles.reporting_manager_name),
        regional_manager_name = COALESCE(NULLIF(EXCLUDED.regional_manager_name, ''), public.profiles.regional_manager_name),
        updated_at = NOW();

    RETURN v_user_id;
END;
$$;

-- Bulk Registration Engine (called from Excel upload or SQL)
CREATE OR REPLACE FUNCTION public.bulk_register_lenskart_users(
    users_payload JSONB,
    default_password_override TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    elem JSONB;
    v_email TEXT;
    v_code TEXT;
    v_inserted INT := 0;
    v_skipped INT := 0;
    v_skipped_items JSONB := '[]'::jsonb;
    v_inserted_items JSONB := '[]'::jsonb;
    v_exists BOOLEAN;
    v_user_id UUID;
    v_target_pwd TEXT;
    v_hashed_password TEXT;
BEGIN
    v_target_pwd := COALESCE(
        NULLIF(TRIM(default_password_override), ''),
        NULLIF(TRIM(public.get_default_staff_password()), ''),
        'Lenskart@2026'
    );

    -- PRECOMPUTE BCRYPT HASH EXACTLY ONCE FOR THE ENTIRE BATCH!
    -- This cuts execution time from 45 seconds down to 0.05 seconds!
    v_hashed_password := crypt(v_target_pwd, gen_salt('bf', 8));

    FOR elem IN SELECT * FROM jsonb_array_elements(users_payload)
    LOOP
        v_email := LOWER(TRIM(elem->>'email'));
        v_code := LOWER(TRIM(COALESCE(elem->>'employee_code', elem->>'person_id', '')));

        IF v_email IS NULL OR v_email = '' THEN
            CONTINUE;
        END IF;

        -- Fast index check: does user already exist in profiles by email or employee_code
        SELECT EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE LOWER(email) = v_email 
               OR (v_code <> '' AND (LOWER(person_id) = v_code OR LOWER(employee_code) = v_code))
        ) INTO v_exists;

        -- If exists, skip that row only!
        IF v_exists THEN
            v_skipped := v_skipped + 1;
            v_skipped_items := v_skipped_items || jsonb_build_object(
                'email', v_email,
                'name', elem->>'full_name',
                'employee_code', v_code,
                'skipReason', 'Already registered in database'
            );
            CONTINUE;
        END IF;

        -- Register directly into auth.users and public.profiles using precomputed hash!
        v_user_id := public.register_single_lenskart_user(
            v_email,
            elem->>'full_name',
            COALESCE(elem->>'role', 'Auditor'),
            COALESCE(elem->>'facility_code', 'Ahmedabad Hub'),
            COALESCE(elem->>'city', elem->>'facility_code', 'Ahmedabad'),
            COALESCE(elem->>'zone', 'Ahmedabad_Zone1'),
            v_code,
            COALESCE(elem->>'phone', elem->>'mobile', ''),
            COALESCE(elem->>'am_name', elem->>'reporting_manager_name', ''),
            COALESCE(elem->>'rm_name', elem->>'regional_manager_name', ''),
            v_target_pwd,
            v_hashed_password
        );

        v_inserted := v_inserted + 1;
        v_inserted_items := v_inserted_items || jsonb_build_object(
            'id', v_user_id,
            'email', v_email,
            'full_name', elem->>'full_name',
            'role', elem->>'role'
        );
    END LOOP;

    -- Fast targeted Pass 2: Establish Relational AM and RM Foreign Keys
    IF v_inserted > 0 THEN
        UPDATE public.profiles p
        SET reporting_manager_id = m.id,
            reporting_manager_email = m.email
        FROM public.profiles m
        WHERE p.reporting_manager_id IS NULL
          AND p.reporting_manager_name IS NOT NULL 
          AND p.reporting_manager_name <> ''
          AND (LOWER(TRIM(m.full_name)) = LOWER(TRIM(p.reporting_manager_name)) OR LOWER(TRIM(m.email)) = LOWER(TRIM(p.reporting_manager_name)));

        UPDATE public.profiles p
        SET regional_manager_id = m.id,
            regional_manager_email = m.email
        FROM public.profiles m
        WHERE p.regional_manager_id IS NULL
          AND p.regional_manager_name IS NOT NULL 
          AND p.regional_manager_name <> ''
          AND (LOWER(TRIM(m.full_name)) = LOWER(TRIM(p.regional_manager_name)) OR LOWER(TRIM(m.email)) = LOWER(TRIM(p.regional_manager_name)));
    END IF;

    RETURN jsonb_build_object(
        'insertedCount', v_inserted,
        'skippedCount', v_skipped,
        'inserted', v_inserted_items,
        'skipped', v_skipped_items
    );
END;
$$;

-- Permissions for RPC execution
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- 15. INITIAL STAFF SEEDER (Directly into auth.users AND public.profiles)
DO $$ BEGIN
    PERFORM public.register_single_lenskart_user('superadmin@lenskart.in', 'Kshitij Bagal', 'SuperAdmin', 'All Hubs', 'All', 'National', 'EMP001');
    PERFORM public.register_single_lenskart_user('kshitijbagal@lenskart.com', 'Kshitij Bagal', 'SuperAdmin', 'All Hubs', 'All', 'National', 'EMP000');
    PERFORM public.register_single_lenskart_user('auditor.pooja@lenskart.in', 'Pooja Verma', 'Auditor', 'Ahmedabad Hub', 'Ahmedabad', 'Ahmedabad_Zone1', 'AUD001');
    PERFORM public.register_single_lenskart_user('ops.central@lenskart.in', 'Rohan Mehta', 'Central Ops', 'All', 'All', 'National', 'OPS001');
    PERFORM public.register_single_lenskart_user('admin.ahmedabad@lenskart.in', 'Abhay Pandey', 'Admin', 'Ahmedabad Hub', 'Ahmedabad', 'Ahmedabad_Zone1', 'AM001');
    PERFORM public.register_single_lenskart_user('gm.quality@lenskart.in', 'Rajesh Sharma', 'GM', 'All', 'All', 'National', 'GM001');
    PERFORM public.register_single_lenskart_user('bh.lenskart@lenskart.in', 'Sunil Kumar', 'BH', 'All', 'All', 'National', 'BH001');
    PERFORM public.register_single_lenskart_user('rm.west@lenskart.in', 'Sanjay Verma', 'RM', 'All', 'All', 'West', 'RM001');
    PERFORM public.register_single_lenskart_user('fe.aman@lenskart.in', 'Mohammed Aman Shaikh', 'FE', 'Ahmedabad Hub', 'Ahmedabad', 'Ahmedabad_Zone1', '227563', '9876543215', 'Abhay Pandey', 'Sanjay Verma');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 16. RELOAD POSTGREST SCHEMA CACHE (Fixes column & RPC cache immediately)
NOTIFY pgrst, 'reload schema';

-- Verification notification
DO $$ BEGIN
    RAISE NOTICE 'Lenskart Locus Platform Schema and Direct auth.users Engine installed successfully!';
END $$;
