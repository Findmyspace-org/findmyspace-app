-- Phase 1: Space Advisor referral attribution (no automatic access to user data)

CREATE TABLE IF NOT EXISTS public.space_advisors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  display_name text NOT NULL,
  advisor_code text NOT NULL,
  email text,
  phone text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT space_advisors_advisor_code_unique UNIQUE (advisor_code),
  CONSTRAINT space_advisors_advisor_code_format CHECK (
    advisor_code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
  )
);

CREATE INDEX IF NOT EXISTS space_advisors_status_idx ON public.space_advisors (status);

COMMENT ON TABLE public.space_advisors IS
  'Space Advisor program; referral codes and links. Does not grant login or data access.';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS advisor_id uuid REFERENCES public.space_advisors (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS advisor_code text,
  ADD COLUMN IF NOT EXISTS advisor_source text,
  ADD COLUMN IF NOT EXISTS advisor_assigned_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_advisor_source_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_advisor_source_check CHECK (
        advisor_source IS NULL
        OR advisor_source IN ('link', 'qr', 'manual', 'admin', 'profile')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS profiles_advisor_id_idx ON public.profiles (advisor_id);

ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS advisor_id uuid REFERENCES public.space_advisors (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS advisor_code text,
  ADD COLUMN IF NOT EXISTS advisor_source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'spaces_advisor_source_check'
  ) THEN
    ALTER TABLE public.spaces
      ADD CONSTRAINT spaces_advisor_source_check CHECK (
        advisor_source IS NULL
        OR advisor_source IN ('link', 'qr', 'manual', 'admin', 'profile')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS spaces_advisor_id_idx ON public.spaces (advisor_id);

ALTER TABLE public.space_advisors ENABLE ROW LEVEL SECURITY;
