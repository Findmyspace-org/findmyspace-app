-- PR5: lifecycle hardening — booking insert guard + owner status bypass prevention.

-- 1) Bookings may only be created against active listings.
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
  ) THEN
    RAISE EXCEPTION 'bookings_require_active_space'
      USING HINT = 'Bookings can only be created for active listings.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_require_active_space ON public.bookings;
CREATE TRIGGER bookings_require_active_space
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_booking_active_space();

COMMENT ON FUNCTION public.enforce_booking_active_space() IS
  'Blocks booking inserts unless the linked space is active.';

-- 2) Prevent owners from changing spaces.status via direct client updates.
-- Service-role / server routes (auth.uid() IS NULL) are unaffected.
CREATE OR REPLACE FUNCTION public.guard_spaces_status_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT role INTO actor_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF actor_role = 'admin' THEN
    RETURN NEW;
  END IF;

  -- Owners may only toggle live listings between active and paused.
  IF OLD.owner_id = auth.uid()
     AND OLD.status IN ('active', 'paused')
     AND NEW.status IN ('active', 'paused') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'spaces_status_change_forbidden'
    USING HINT = 'Listing status must be changed through the review workflow.';
END;
$$;

DROP TRIGGER IF EXISTS guard_spaces_status_update ON public.spaces;
CREATE TRIGGER guard_spaces_status_update
  BEFORE UPDATE OF status ON public.spaces
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_spaces_status_update();

COMMENT ON FUNCTION public.guard_spaces_status_update() IS
  'Blocks owner JWT clients from setting lifecycle statuses; allows active/pause toggle only.';

-- 3) Strengthen public browse policy when RLS is enabled on spaces.
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
