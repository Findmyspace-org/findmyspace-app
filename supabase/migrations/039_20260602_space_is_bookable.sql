-- Explicit admin-controlled bookability flag (separate from public visibility mode).

ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS is_bookable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.spaces.is_bookable IS
  'When true, the space accepts bookings (requires active status, live mode, and pricing).';

-- Backfill from existing live bookable listings.
UPDATE public.spaces
SET is_bookable = true
WHERE status = 'active'
  AND public_listing_mode = 'live'
  AND is_bookable = false;
