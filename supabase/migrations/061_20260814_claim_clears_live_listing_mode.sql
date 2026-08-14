-- Live listings cannot leave status = active without first leaving live mode.
-- Claiming (owner_claimed) used to update status only, which violated
-- spaces_live_mode_requires_active. Clear live mode whenever status is not active.

CREATE OR REPLACE FUNCTION public.guard_spaces_public_listing_mode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('paused', 'deleted') THEN
      NEW.public_listing_mode := 'off';
    ELSIF NEW.status = 'active' AND OLD.status = 'paused' THEN
      NEW.public_listing_mode := 'live';
    END IF;
  END IF;

  IF NEW.public_listing_mode = 'live' AND NEW.status IS DISTINCT FROM 'active' THEN
    NEW.public_listing_mode := 'off';
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

COMMENT ON FUNCTION public.guard_spaces_public_listing_mode() IS
  'Syncs public_listing_mode on pause/resume/archive/claim; blocks JWT mode changes; live mode requires active status.';
