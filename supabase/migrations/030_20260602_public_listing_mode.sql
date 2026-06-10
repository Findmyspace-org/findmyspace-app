-- Separate public visibility (enquiry/live) from workflow status.

ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS public_listing_mode text NOT NULL DEFAULT 'off';

ALTER TABLE public.spaces DROP CONSTRAINT IF EXISTS spaces_public_listing_mode_check;
ALTER TABLE public.spaces ADD CONSTRAINT spaces_public_listing_mode_check
  CHECK (public_listing_mode IN ('off', 'enquiry', 'live'));

-- Backfill from current status-derived behaviour
UPDATE public.spaces SET public_listing_mode = 'enquiry' WHERE status = 'unclaimed';
UPDATE public.spaces SET public_listing_mode = 'live' WHERE status = 'active';

ALTER TABLE public.spaces DROP CONSTRAINT IF EXISTS spaces_live_mode_requires_active;
ALTER TABLE public.spaces ADD CONSTRAINT spaces_live_mode_requires_active
  CHECK (public_listing_mode <> 'live' OR status = 'active');

DROP INDEX IF EXISTS spaces_status_public_idx;
CREATE INDEX IF NOT EXISTS spaces_public_listing_mode_idx
  ON public.spaces (public_listing_mode)
  WHERE public_listing_mode IN ('enquiry', 'live');

-- Bookings require active + live mode
CREATE OR REPLACE FUNCTION public.enforce_booking_active_space()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.spaces s
    WHERE s.id = NEW.space_id
      AND s.status = 'active'
      AND s.public_listing_mode = 'live'
  ) THEN
    RAISE EXCEPTION 'bookings_require_active_space'
      USING HINT = 'Bookings can only be created for live bookable listings.';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_booking_active_space() IS
  'Blocks booking inserts unless the linked space is active and public_listing_mode = live.';

-- Sync mode on owner pause/resume; block direct mode changes by authenticated users
CREATE OR REPLACE FUNCTION public.guard_spaces_public_listing_mode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'paused' THEN
      NEW.public_listing_mode := 'off';
    ELSIF NEW.status = 'active' AND OLD.status = 'paused' THEN
      NEW.public_listing_mode := 'live';
    END IF;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.public_listing_mode IS NOT DISTINCT FROM OLD.public_listing_mode THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND OLD.owner_id = auth.uid()
     AND OLD.status IN ('active', 'paused')
     AND NEW.status IN ('active', 'paused') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'spaces_public_listing_mode_change_forbidden'
    USING HINT = 'Public listing mode must be changed through admin APIs.';
END;
$$;

DROP TRIGGER IF EXISTS guard_spaces_public_listing_mode ON public.spaces;
CREATE TRIGGER guard_spaces_public_listing_mode
  BEFORE UPDATE OF status, public_listing_mode ON public.spaces
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_spaces_public_listing_mode();

COMMENT ON FUNCTION public.guard_spaces_public_listing_mode() IS
  'Syncs public_listing_mode on owner pause/resume; blocks JWT mode changes.';

-- Public browse by listing mode
DROP POLICY IF EXISTS spaces_public_browse ON public.spaces;
CREATE POLICY spaces_public_browse ON public.spaces
  FOR SELECT TO anon, authenticated
  USING (public_listing_mode IN ('enquiry', 'live'));

COMMENT ON POLICY spaces_public_browse ON public.spaces IS
  'Public marketplace browse: enquiry + live modes only.';

-- Enquiries allowed for enquiry-mode listings
DROP POLICY IF EXISTS listing_enquiries_insert ON public.listing_enquiries;
CREATE POLICY listing_enquiries_insert ON public.listing_enquiries
  FOR INSERT TO authenticated
  WITH CHECK (
    requester_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.spaces s
      WHERE s.id = listing_id AND s.public_listing_mode = 'enquiry'
    )
  );
