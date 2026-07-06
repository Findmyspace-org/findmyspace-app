-- Venue Scout website import staging.
-- Keeps crawled/extracted data separate from live properties/spaces until admin conversion.

CREATE TABLE IF NOT EXISTS public.venue_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url text NOT NULL,
  normalized_domain text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'crawling', 'extracted', 'needs_review', 'converted', 'failed', 'archived')),
  crawl_depth integer NOT NULL DEFAULT 2 CHECK (crawl_depth >= 0 AND crawl_depth <= 5),
  max_pages integer NOT NULL DEFAULT 20 CHECK (max_pages >= 1 AND max_pages <= 50),
  include_images boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  error_message text,
  extraction_summary text,
  confidence_score numeric,
  converted_at timestamptz,
  converted_property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.venue_import_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.venue_import_jobs(id) ON DELETE CASCADE,
  url text NOT NULL,
  title text,
  status_code integer,
  content_hash text,
  extracted_text text,
  page_type text NOT NULL DEFAULT 'unknown'
    CHECK (page_type IN ('home', 'venue', 'space', 'gallery', 'pricing', 'contact', 'terms', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, url)
);

CREATE TABLE IF NOT EXISTS public.venue_import_property_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.venue_import_jobs(id) ON DELETE CASCADE,
  name text,
  description text,
  address text,
  suburb text,
  city text,
  province text,
  postal_code text,
  country text DEFAULT 'South Africa',
  latitude numeric,
  longitude numeric,
  website_url text,
  source_urls text[] NOT NULL DEFAULT ARRAY[]::text[],
  confidence_score numeric,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.venue_import_space_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.venue_import_jobs(id) ON DELETE CASCADE,
  property_candidate_id uuid REFERENCES public.venue_import_property_candidates(id) ON DELETE SET NULL,
  name text,
  description text,
  space_type text,
  min_group_size integer,
  max_group_size integer,
  price_amount numeric,
  price_unit text,
  booking_unit text,
  deposit_amount numeric,
  amenities text[] NOT NULL DEFAULT ARRAY[]::text[],
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  booking_requirements text,
  terms_notes text,
  source_urls text[] NOT NULL DEFAULT ARRAY[]::text[],
  confidence_score numeric,
  missing_fields text[] NOT NULL DEFAULT ARRAY[]::text[],
  selected_for_creation boolean NOT NULL DEFAULT true,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.venue_import_image_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.venue_import_jobs(id) ON DELETE CASCADE,
  candidate_type text NOT NULL CHECK (candidate_type IN ('property', 'space')),
  candidate_id uuid,
  image_url text NOT NULL,
  alt_text text,
  source_url text,
  width integer,
  height integer,
  selected boolean NOT NULL DEFAULT false,
  confidence_score numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS venue_import_jobs_status_created_idx
  ON public.venue_import_jobs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS venue_import_pages_job_idx
  ON public.venue_import_pages (job_id);
CREATE INDEX IF NOT EXISTS venue_import_property_candidates_job_idx
  ON public.venue_import_property_candidates (job_id);
CREATE INDEX IF NOT EXISTS venue_import_space_candidates_job_idx
  ON public.venue_import_space_candidates (job_id);
CREATE INDEX IF NOT EXISTS venue_import_image_candidates_job_idx
  ON public.venue_import_image_candidates (job_id);

ALTER TABLE public.venue_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_import_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_import_property_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_import_space_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_import_image_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venue_import_jobs_admin_all ON public.venue_import_jobs;
CREATE POLICY venue_import_jobs_admin_all ON public.venue_import_jobs
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')));

DROP POLICY IF EXISTS venue_import_pages_admin_all ON public.venue_import_pages;
CREATE POLICY venue_import_pages_admin_all ON public.venue_import_pages
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')));

DROP POLICY IF EXISTS venue_import_property_candidates_admin_all ON public.venue_import_property_candidates;
CREATE POLICY venue_import_property_candidates_admin_all ON public.venue_import_property_candidates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')));

DROP POLICY IF EXISTS venue_import_space_candidates_admin_all ON public.venue_import_space_candidates;
CREATE POLICY venue_import_space_candidates_admin_all ON public.venue_import_space_candidates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')));

DROP POLICY IF EXISTS venue_import_image_candidates_admin_all ON public.venue_import_image_candidates;
CREATE POLICY venue_import_image_candidates_admin_all ON public.venue_import_image_candidates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_import_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_import_pages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_import_property_candidates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_import_space_candidates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_import_image_candidates TO authenticated;

GRANT ALL ON public.venue_import_jobs TO service_role;
GRANT ALL ON public.venue_import_pages TO service_role;
GRANT ALL ON public.venue_import_property_candidates TO service_role;
GRANT ALL ON public.venue_import_space_candidates TO service_role;
GRANT ALL ON public.venue_import_image_candidates TO service_role;
