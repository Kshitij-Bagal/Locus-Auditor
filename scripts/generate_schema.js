import fs from 'fs';
import { RAW_SAMPLE_DATA } from '../src/data/sampleData.js';
import { transformRawRow } from '../src/utils/excelParser.js';

const tasks = RAW_SAMPLE_DATA.map((row, idx) => transformRawRow(row, idx));

const taskSqlInserts = tasks.map(t => {
  const imagesJson = JSON.stringify(t.images).replace(/'/g, "''");
  const criteriaJson = JSON.stringify(t.criteriaStatus).replace(/'/g, "''");
  const failedReasonsJson = JSON.stringify(t.failedReasons).replace(/'/g, "''");
  const replacementsJson = JSON.stringify(t.replacements || []).replace(/'/g, "''");
  const custAddress = (t.customerAddress || '').replace(/'/g, "''");
  const custName = (t.customerName || '').replace(/'/g, "''");
  const feName = (t.feName || '').replace(/'/g, "''");
  const reason = (t.reason || '').replace(/'/g, "''");

  return `('${t.id}', '${t.taskId}', '${t.teamName}', '${t.facilityCode}', '${t.zone}', '${t.date}', '${t.status}', '${feName}', '${t.feCode}', '${t.feId}', '${t.feEmail}', '${custName}', '${custAddress}', '${t.pincode}', '${t.pin}', '${reason}', '${imagesJson}'::jsonb, ${t.imageCount}, ${t.hasImages}, '${t.auditStatus}', '${criteriaJson}'::jsonb, '${failedReasonsJson}'::jsonb, '${replacementsJson}'::jsonb)`;
}).join(',\n');

const fullSql = `-- ====================================================================
-- LENSKART LOCUS QUALITY & COMPLIANCE PLATFORM 2.0
-- Supabase Complete PostgreSQL Database Schema & Seed Data
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
EXCEPTION WHEN duplicate_object THEN null; END $$;

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
    CREATE TYPE rule_status_type AS ENUM ('PUBLISHED', 'DRAFT_PENDING_BH');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ====================================================================
-- 3. PROFILES TABLE (RBAC Users & FE Credentials)
-- ====================================================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role user_role NOT NULL DEFAULT 'Auditor',
    facility_code TEXT DEFAULT 'Ahmedabad', -- For City Admins & FEs
    person_id TEXT,                         -- Rider ID for FEs or Employee Code
    phone TEXT,
    zone TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- 4. TASKS TABLE (Locus Completed & Ingested Dispatches)
-- ====================================================================
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, -- Task ID (e.g. '1355099873')
    task_id TEXT NOT NULL,
    team_name TEXT DEFAULT 'Ahmedabad',
    facility_code TEXT DEFAULT 'Ahmedabad',
    zone TEXT,
    dispatch_date TEXT,
    status TEXT DEFAULT 'COMPLETED', -- 'COMPLETED', 'CANCELLED', 'WAITING', 'ONGOING'
    fe_name TEXT NOT NULL,
    fe_code TEXT,
    fe_id TEXT,                      -- Person ID / Rider ID
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
    assigned_auditor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    assigned_auditor_name TEXT,
    allocated_at TIMESTAMPTZ,
    allocation_batch_id TEXT,

    -- Audit execution fields
    audit_status audit_status_type DEFAULT 'PENDING',
    audited_at TIMESTAMPTZ,
    audited_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    audited_by_name TEXT,
    audited_location TEXT,
    failed_reasons JSONB DEFAULT '[]'::jsonb,
    auditor_remarks TEXT,
    warning_level TEXT,
    email_sent BOOLEAN DEFAULT false,
    email_sent_at TIMESTAMPTZ,
    criteria_status JSONB DEFAULT '{}'::jsonb,
    replacements JSONB DEFAULT '[]'::jsonb,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexing for fast search and filtering
CREATE INDEX IF NOT EXISTS idx_tasks_fe_id ON tasks(fe_id);
CREATE INDEX IF NOT EXISTS idx_tasks_facility_code ON tasks(facility_code);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_audit_status ON tasks(audit_status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_auditor ON tasks(assigned_auditor_id);

-- ====================================================================
-- 5. AUDIT CRITERIA RULES TABLE (Centrally Governed by GM & BH)
-- ====================================================================
CREATE TABLE IF NOT EXISTS audit_criteria_rules (
    id TEXT PRIMARY KEY, -- 'selfie', 'torches', 'visionChart', 'toolkit', 'frameDisplay'
    image_key TEXT NOT NULL,
    station_order INT DEFAULT 1,
    title TEXT NOT NULL,
    description TEXT,
    reference_image_url TEXT,
    standards JSONB NOT NULL DEFAULT '[]'::jsonb,
    common_failures JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_mandatory BOOLEAN DEFAULT true,
    triggers_fatal BOOLEAN DEFAULT true,
    
    -- 2-Step Governance fields
    status rule_status_type DEFAULT 'PUBLISHED',
    draft_standards JSONB,
    draft_failures JSONB,
    drafted_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    drafted_by_name TEXT,
    drafted_at TIMESTAMPTZ,
    published_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    published_by_name TEXT,
    published_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- 6. ASSETS & CONSUMABLES WATCHLIST TABLE (Central Catalogue)
-- ====================================================================
CREATE TABLE IF NOT EXISTS assets_watchlist (
    id TEXT PRIMARY KEY, -- 'torch_blue', 'trial_frame', etc.
    name TEXT NOT NULL,
    category TEXT NOT NULL, -- 'Diagnostic Penlights', 'Refraction & Optical Toolkit', etc.
    type TEXT NOT NULL DEFAULT 'Asset', -- 'Asset' or 'Consumable'
    linked_image_key TEXT,
    default_cost NUMERIC(10,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT true,
    updated_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- 7. REPLACEMENT ORDERS TABLE (Flagged by Auditor -> Ordered on POS by City Admin)
-- ====================================================================
CREATE TABLE IF NOT EXISTS replacement_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    fe_id TEXT NOT NULL,
    fe_name TEXT NOT NULL,
    fe_code TEXT,
    facility_code TEXT NOT NULL,
    zone TEXT,
    item_id TEXT REFERENCES assets_watchlist(id) ON DELETE RESTRICT,
    item_name TEXT NOT NULL,
    category TEXT NOT NULL,
    type TEXT NOT NULL,
    fault_condition TEXT NOT NULL,
    urgency TEXT NOT NULL DEFAULT 'NORMAL', -- 'IMMEDIATE', 'HIGH', 'NORMAL'
    auditor_notes TEXT,
    
    -- POS Lifecycle handled by City Admin / AM
    pos_status pos_order_status DEFAULT 'FLAGGED_BY_AUDITOR',
    pos_order_number TEXT,
    pos_ordered_at TIMESTAMPTZ,
    pos_ordered_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    pos_ordered_by_name TEXT,
    disbursed_to_fe_at TIMESTAMPTZ,
    
    reported_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reported_by_name TEXT,
    reported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_replacement_orders_facility ON replacement_orders(facility_code);
CREATE INDEX IF NOT EXISTS idx_replacement_orders_pos_status ON replacement_orders(pos_status);
CREATE INDEX IF NOT EXISTS idx_replacement_orders_urgency ON replacement_orders(urgency);

-- ====================================================================
-- 8. AUDITOR ROSTER & CAPACITY TABLE (50 Weekday / 75 Weekend)
-- ====================================================================
CREATE TABLE IF NOT EXISTS auditor_roster (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auditor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
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
-- 9. ANALYTICAL VIEWS FOR GM, BH, & CENTRAL OPS
-- ====================================================================

-- View 1: City Admin Negligence & POS Fulfillment Lag View (GM & BH)
CREATE OR REPLACE VIEW v_city_admin_negligence AS
SELECT 
    facility_code,
    COUNT(*) AS total_flagged_items,
    COUNT(*) FILTER (WHERE pos_status = 'FLAGGED_BY_AUDITOR') AS pending_pos_orders,
    COUNT(*) FILTER (WHERE pos_status = 'ORDERED_ON_POS') AS ordered_on_pos_count,
    COUNT(*) FILTER (WHERE pos_status = 'DISBURSED_TO_FE') AS disbursed_count,
    COUNT(*) FILTER (WHERE urgency = 'IMMEDIATE' AND pos_status = 'FLAGGED_BY_AUDITOR') AS critical_neglected_count,
    AVG(CASE 
        WHEN pos_ordered_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (pos_ordered_at - reported_at)) / 3600 
        ELSE NULL 
    END) AS avg_turnaround_hours
FROM replacement_orders
GROUP BY facility_code;

-- View 2: Central Ops Stock Readiness & National SKU Demand Aggregation
CREATE OR REPLACE VIEW v_central_stock_readiness AS
SELECT 
    item_name,
    category,
    type,
    COUNT(*) AS total_national_demand,
    COUNT(*) FILTER (WHERE urgency = 'IMMEDIATE') AS immediate_24h_demand,
    COUNT(*) FILTER (WHERE urgency = 'HIGH') AS high_priority_demand,
    COUNT(DISTINCT facility_code) AS affected_hubs_count,
    ARRAY_AGG(DISTINCT facility_code) AS affected_hubs
FROM replacement_orders
WHERE pos_status IN ('FLAGGED_BY_AUDITOR', 'ORDERED_ON_POS')
GROUP BY item_name, category, type;

-- ====================================================================
-- 10. REALTIME REPLICATION ENABLEMENT
-- ====================================================================
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
EXCEPTION WHEN others THEN null; END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE audit_criteria_rules;
EXCEPTION WHEN others THEN null; END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE replacement_orders;
EXCEPTION WHEN others THEN null; END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE auditor_roster;
EXCEPTION WHEN others THEN null; END $$;

-- ====================================================================
-- 11. ROW LEVEL SECURITY (RLS) & PUBLIC API ACCESS POLICIES
-- ====================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_criteria_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE replacement_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditor_roster ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to prevent duplicates
DROP POLICY IF EXISTS "Allow public read profiles" ON profiles;
DROP POLICY IF EXISTS "Allow public insert profiles" ON profiles;
DROP POLICY IF EXISTS "Allow public update profiles" ON profiles;

DROP POLICY IF EXISTS "Allow public read tasks" ON tasks;
DROP POLICY IF EXISTS "Allow public insert tasks" ON tasks;
DROP POLICY IF EXISTS "Allow public update tasks" ON tasks;
DROP POLICY IF EXISTS "Allow public delete tasks" ON tasks;

DROP POLICY IF EXISTS "Allow public read rules" ON audit_criteria_rules;
DROP POLICY IF EXISTS "Allow public insert rules" ON audit_criteria_rules;
DROP POLICY IF EXISTS "Allow public update rules" ON audit_criteria_rules;

DROP POLICY IF EXISTS "Allow public read assets" ON assets_watchlist;
DROP POLICY IF EXISTS "Allow public insert assets" ON assets_watchlist;
DROP POLICY IF EXISTS "Allow public update assets" ON assets_watchlist;

DROP POLICY IF EXISTS "Allow public read replacements" ON replacement_orders;
DROP POLICY IF EXISTS "Allow public insert replacements" ON replacement_orders;
DROP POLICY IF EXISTS "Allow public update replacements" ON replacement_orders;

DROP POLICY IF EXISTS "Allow public read roster" ON auditor_roster;
DROP POLICY IF EXISTS "Allow public insert roster" ON auditor_roster;
DROP POLICY IF EXISTS "Allow public update roster" ON auditor_roster;

-- Create Permissive Policies for Web Client
CREATE POLICY "Allow public read profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Allow public insert profiles" ON profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update profiles" ON profiles FOR UPDATE USING (true);

CREATE POLICY "Allow public read tasks" ON tasks FOR SELECT USING (true);
CREATE POLICY "Allow public insert tasks" ON tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update tasks" ON tasks FOR UPDATE USING (true);
CREATE POLICY "Allow public delete tasks" ON tasks FOR DELETE USING (true);

CREATE POLICY "Allow public read rules" ON audit_criteria_rules FOR SELECT USING (true);
CREATE POLICY "Allow public insert rules" ON audit_criteria_rules FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update rules" ON audit_criteria_rules FOR UPDATE USING (true);

CREATE POLICY "Allow public read assets" ON assets_watchlist FOR SELECT USING (true);
CREATE POLICY "Allow public insert assets" ON assets_watchlist FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update assets" ON assets_watchlist FOR UPDATE USING (true);

CREATE POLICY "Allow public read replacements" ON replacement_orders FOR SELECT USING (true);
CREATE POLICY "Allow public insert replacements" ON replacement_orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update replacements" ON replacement_orders FOR UPDATE USING (true);

CREATE POLICY "Allow public read roster" ON auditor_roster FOR SELECT USING (true);
CREATE POLICY "Allow public insert roster" ON auditor_roster FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update roster" ON auditor_roster FOR UPDATE USING (true);

-- Grant schema privileges
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;

-- ====================================================================
-- 12. INITIAL SEED DATA
-- ====================================================================

-- 12.1 Insert Central SOP Audit Rules
INSERT INTO audit_criteria_rules (id, image_key, station_order, title, description, standards, common_failures, status)
VALUES
('selfie', 'selfie', 1, 'Selfie: Lenskart T-Shirt & ID Card', 
 'Executive wearing official Lenskart Navy Blue Polo with visible Lenskart lanyard and employee photo ID badge.',
 '["Official Lenskart T-shirt / Polo worn properly", "Employee ID card visibly worn around neck or pinned", "Executive face clearly recognizable and unmasked"]'::jsonb,
 '["Not wearing Lenskart uniform/T-shirt", "Missing or unreadable ID card", "Face covered or blurry picture", "Duplicate / photo of another photo"]'::jsonb,
 'PUBLISHED'),
('torches', 'torches', 2, 'Working Blue & Yellow Torches', 
 'Both ophthalmic penlights placed side-by-side with light beams active and tested.',
 '["Cobalt Blue torch present and illuminated", "Amber Yellow torch present and illuminated", "No cracked lenses or damaged battery compartments"]'::jsonb,
 '["Missing blue or yellow torch", "Torches switched off / dead batteries", "Only one torch shown", "Picture taken inside vehicle or pouch"]'::jsonb,
 'PUBLISHED'),
('visionChart', 'visionChart', 3, 'Vision Chart & Standee Setup', 
 'Standardized Snellen / LogMAR vision acuity chart properly mounted on portable telescoping standee at eye level.',
 '["Chart mounted on standee (not taped haphazardly to wall)", "Correct height calibration (eye level for seated patient)", "Chart is clean, unbent, and evenly illuminated"]'::jsonb,
 '["Chart not mounted on standee (taped to wall)", "Standee missing or broken", "Chart crumpled, folded, or damaged", "Distance calibration not maintained"]'::jsonb,
 'PUBLISHED'),
('toolkit', 'toolkit', 4, 'Complete Refraction Toolkit', 
 'Complete 6-piece clinical kit: Near vision test book, trial frame, Jackson cross cylinder (JCC), mirror, sanitizer bottle, and PD measurement tape.',
 '["Near vision card / reading book present", "Universal trial frame with clean lenses", "Jackson Cross Cylinder (±0.25 / ±0.50)", "Patient handheld mirror", "Hand sanitizer bottle (hygiene compliance)", "Pupillary distance (PD) measurement ruler / tape"]'::jsonb,
 '["Incomplete toolkit (missing trial frame or JCC)", "Missing hand sanitizer (hygiene violation)", "Missing PD ruler or near vision book", "Tools disorganized or in damaged condition"]'::jsonb,
 'PUBLISHED'),
('frameDisplay', 'frameDisplay', 5, 'Frame Display at Customer House', 
 'Professional multi-compartment frame showcase tray arranged neatly on customer''s living room table with clean sample frames.',
 '["Trays neatly laid out on a clean flat surface inside customer premises", "At least 15-20 trial optical frames showcased in protective grooves", "Clean presentation without packaging debris or personal clutter"]'::jsonb,
 '["Frames not unpacked / shown in carry bag only", "Photo clicked in hallway, elevator, or vehicle", "Disorganized or empty display tray", "Reused photo from prior visit"]'::jsonb,
 'PUBLISHED')
ON CONFLICT (id) DO NOTHING;

-- 12.2 Insert Central Assets & Consumables Watchlist
INSERT INTO assets_watchlist (id, name, category, type, linked_image_key, default_cost)
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

-- 12.3 Seed Multi-Role User Profiles
INSERT INTO profiles (id, full_name, email, role, facility_code, person_id)
VALUES
('00000000-0000-0000-0000-000000000001', 'Kshitij Bagal', 'superadmin@lenskart.in', 'SuperAdmin', 'All', 'EMP001'),
('00000000-0000-0000-0000-000000000002', 'Sunil Kumar (Business Head)', 'bh.lenskart@lenskart.in', 'BH', 'All', 'EMP002'),
('00000000-0000-0000-0000-000000000003', 'Rajesh Sharma (General Manager)', 'gm.quality@lenskart.in', 'GM', 'All', 'EMP003'),
('00000000-0000-0000-0000-000000000004', 'Abhay Pandey (City Admin)', 'admin.ahmedabad@lenskart.in', 'Admin', 'Ahmedabad', 'EMP004'),
('00000000-0000-0000-0000-000000000005', 'Rohan Mehta (Central Ops)', 'ops.central@lenskart.in', 'Central Ops', 'All', 'EMP005'),
('00000000-0000-0000-0000-000000000006', 'Pooja Verma (Auditor)', 'auditor.pooja@lenskart.in', 'Auditor', 'Ahmedabad', 'AUD001'),
('00000000-0000-0000-0000-000000000007', 'Vikas Patel (Auditor)', 'auditor.vikas@lenskart.in', 'Auditor', 'Mumbai', 'AUD002'),
('00000000-0000-0000-0000-000000000008', 'Mohammed Aman Shaikh', 'fe.aman@lenskart.in', 'FE', 'Ahmedabad', '227563'),
('00000000-0000-0000-0000-000000000009', 'Rai Balvant Bimlesh', 'fe.balvant@lenskart.in', 'FE', 'Ahmedabad', '213812')
ON CONFLICT (email) DO NOTHING;

-- 12.4 Seed Initial Roster for Pooja Verma and Vikas Patel
INSERT INTO auditor_roster (auditor_id, auditor_name, roster_date, shift_status, daily_quota, current_assigned, completed_count)
VALUES
('00000000-0000-0000-0000-000000000006', 'Pooja Verma (Auditor)', CURRENT_DATE, 'AVAILABLE', 50, 0, 0),
('00000000-0000-0000-0000-000000000007', 'Vikas Patel (Auditor)', CURRENT_DATE, 'AVAILABLE', 50, 0, 0)
ON CONFLICT (auditor_id, roster_date) DO NOTHING;

-- 12.5 Seed Initial 17 Locus Tasks from Ahmedabad
INSERT INTO tasks (
    id, task_id, team_name, facility_code, zone, dispatch_date, status, 
    fe_name, fe_code, fe_id, fe_email, customer_name, customer_address, 
    pincode, delivery_pin, cancellation_reason, image_urls, image_count, 
    has_images, audit_status, criteria_status, failed_reasons, replacements
)
VALUES
${taskSqlInserts}
ON CONFLICT (id) DO NOTHING;

-- Success verification message
DO $$ BEGIN
    RAISE NOTICE 'Lenskart Locus Quality & Compliance schema installed successfully with all tables, views, and seed data!';
END $$;
`;

fs.writeFileSync('./supabase_schema.sql', fullSql, 'utf8');
console.log('Successfully generated supabase_schema.sql with ' + tasks.length + ' tasks seed!');
