-- ====================================================================
-- SUPABASE MIGRATION: DEDICATED IMAGE FINGERPRINT & FORENSICS LEDGER
-- Table: public.task_image_fingerprints
-- Purpose: Persistent storage for SHA-256 byte hashes, 64-bit & 256-bit dHash,
--          luminance analysis (blank/black detection), and camera EXIF metadata.
-- ====================================================================

-- 1. Create table
CREATE TABLE IF NOT EXISTS public.task_image_fingerprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL,
  station_id TEXT NOT NULL, -- 'selfie', 'torches', 'visionChart', 'toolkit', 'frameDisplay'
  slot_label TEXT,
  fe_code TEXT,
  fe_name TEXT,
  facility_code TEXT,
  dispatch_date DATE,
  image_url TEXT NOT NULL,
  sha256_hash VARCHAR(64) NOT NULL,
  dhash_hex VARCHAR(16) NOT NULL,
  dhash256_hex VARCHAR(64),
  mean_luma SMALLINT,
  std_dev NUMERIC(6, 2),
  dark_ratio NUMERIC(5, 2),
  is_blank_black BOOLEAN DEFAULT FALSE,
  blank_reason TEXT,
  exif_time TEXT,
  exif_model TEXT,
  file_size_bytes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_task_station_fingerprint UNIQUE (task_id, station_id)
);

-- 2. Performance Indexes for instant weekly forensics and deduplication
CREATE INDEX IF NOT EXISTS idx_tif_sha256 ON public.task_image_fingerprints(sha256_hash);
CREATE INDEX IF NOT EXISTS idx_tif_dhash ON public.task_image_fingerprints(dhash_hex);
CREATE INDEX IF NOT EXISTS idx_tif_task_id ON public.task_image_fingerprints(task_id);
CREATE INDEX IF NOT EXISTS idx_tif_station ON public.task_image_fingerprints(station_id);
CREATE INDEX IF NOT EXISTS idx_tif_fe_code ON public.task_image_fingerprints(fe_code);
CREATE INDEX IF NOT EXISTS idx_tif_dispatch_date ON public.task_image_fingerprints(dispatch_date);
CREATE INDEX IF NOT EXISTS idx_tif_blank ON public.task_image_fingerprints(is_blank_black);
CREATE INDEX IF NOT EXISTS idx_tif_facility ON public.task_image_fingerprints(facility_code);

-- 3. Row-Level Security (RLS) Policies
ALTER TABLE public.task_image_fingerprints ENABLE ROW LEVEL SECURITY;

-- Allow read access for authenticated and anonymous web client users
DROP POLICY IF EXISTS "Allow public read access to fingerprints" ON public.task_image_fingerprints;
CREATE POLICY "Allow public read access to fingerprints"
  ON public.task_image_fingerprints
  FOR SELECT
  USING (true);

-- Allow full write/upsert access for batch harvesters and application auditors
DROP POLICY IF EXISTS "Allow write access to fingerprints" ON public.task_image_fingerprints;
CREATE POLICY "Allow write access to fingerprints"
  ON public.task_image_fingerprints
  FOR ALL
  USING (true)
  WITH CHECK (true);
