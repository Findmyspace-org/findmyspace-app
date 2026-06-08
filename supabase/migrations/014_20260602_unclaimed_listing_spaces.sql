-- Admin-first / unclaimed listing lifecycle (Option A: extend spaces.status).
-- `active` remains the internal live + bookable status.

ALTER TABLE public.spaces
  ALTER COLUMN owner_id DROP NOT NULL;

ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS created_by_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by_admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS owner_invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_for_review_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.spaces DROP CONSTRAINT IF EXISTS spaces_status_check;

ALTER TABLE public.spaces ADD CONSTRAINT spaces_status_check CHECK (
  status IN (
    'draft',
    'unclaimed',
    'owner_claimed',
    'pending_verification',
    'needs_changes',
    'approved',
    'pending',
    'active',
    'paused',
    'rejected',
    'deleted'
  )
);

CREATE INDEX IF NOT EXISTS spaces_status_public_idx
  ON public.spaces (status)
  WHERE status IN ('active', 'unclaimed');

-- When RLS is enabled on spaces, allow public browse of active + unclaimed listings.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'spaces'
      AND c.relrowsecurity
  ) THEN
    DROP POLICY IF EXISTS spaces_public_browse ON public.spaces;
    CREATE POLICY spaces_public_browse ON public.spaces
      FOR SELECT TO anon, authenticated
      USING (status IN ('active', 'unclaimed'));
  END IF;
END $$;
