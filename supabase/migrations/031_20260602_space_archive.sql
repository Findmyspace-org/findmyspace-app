-- Soft archive metadata + public browse hardening for archived spaces.

ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archive_restore_status text,
  ADD COLUMN IF NOT EXISTS archive_restore_public_listing_mode text;

CREATE INDEX IF NOT EXISTS spaces_archived_at_idx
  ON public.spaces (archived_at DESC)
  WHERE status = 'deleted';

COMMENT ON COLUMN public.spaces.archived_at IS
  'When the space was soft-archived (status = deleted).';
COMMENT ON COLUMN public.spaces.archive_restore_status IS
  'Workflow status snapshot taken at archive time (audit/restore reference only).';
COMMENT ON COLUMN public.spaces.archive_restore_public_listing_mode IS
  'public_listing_mode snapshot taken at archive time.';

-- Sync public_listing_mode on archive and pause; block JWT mode changes.
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

-- Public browse: enquiry/live modes only, never archived rows.
DROP POLICY IF EXISTS spaces_public_browse ON public.spaces;
CREATE POLICY spaces_public_browse ON public.spaces
  FOR SELECT TO anon, authenticated
  USING (
    public_listing_mode IN ('enquiry', 'live')
    AND status <> 'deleted'
  );

COMMENT ON POLICY spaces_public_browse ON public.spaces IS
  'Public marketplace browse: enquiry + live modes, excluding archived spaces.';
