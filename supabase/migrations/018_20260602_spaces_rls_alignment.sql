-- PR6: spaces RLS in-repo + block admin JWT status bypass (service-role APIs only).

-- Tighten status guard: no authenticated role (including admin) may set lifecycle status.
-- Owners may still toggle active <-> paused on their own live listings.
CREATE OR REPLACE FUNCTION public.guard_spaces_status_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.owner_id = auth.uid()
     AND OLD.status IN ('active', 'paused')
     AND NEW.status IN ('active', 'paused') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'spaces_status_change_forbidden'
    USING HINT = 'Listing status must be changed through server review APIs.';
END;
$$;

ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;

-- Public browse (anon + authenticated)
DROP POLICY IF EXISTS spaces_public_browse ON public.spaces;
CREATE POLICY spaces_public_browse ON public.spaces
  FOR SELECT TO anon, authenticated
  USING (status IN ('active', 'unclaimed'));

-- Owners read their listings (any status)
DROP POLICY IF EXISTS spaces_owner_select ON public.spaces;
CREATE POLICY spaces_owner_select ON public.spaces
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

-- Admins read all listings (admin UI lists; mutations go through service-role APIs)
DROP POLICY IF EXISTS spaces_admin_select ON public.spaces;
CREATE POLICY spaces_admin_select ON public.spaces
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Owners create listings assigned to themselves
DROP POLICY IF EXISTS spaces_owner_insert ON public.spaces;
CREATE POLICY spaces_owner_insert ON public.spaces
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- Owners update own listing content (status changes blocked by trigger)
DROP POLICY IF EXISTS spaces_owner_update ON public.spaces;
CREATE POLICY spaces_owner_update ON public.spaces
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

COMMENT ON POLICY spaces_public_browse ON public.spaces IS
  'Public marketplace browse: active + unclaimed only.';
COMMENT ON POLICY spaces_owner_select ON public.spaces IS
  'Owners can view all their listings including setup/review statuses.';
COMMENT ON POLICY spaces_admin_select ON public.spaces IS
  'Admins can browse listings; status mutations use service-role API routes.';
