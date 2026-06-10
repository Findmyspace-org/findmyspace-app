-- RLS for properties and property owner invites. Extend spaces SELECT for property owners.

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_owner_invites ENABLE ROW LEVEL SECURITY;

-- Properties: owners see their venues; admins manage all.
DROP POLICY IF EXISTS properties_owner_select ON public.properties;
CREATE POLICY properties_owner_select ON public.properties
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS properties_admin_all ON public.properties;
CREATE POLICY properties_admin_all ON public.properties
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Property invites: admin only (public accept uses service role).
DROP POLICY IF EXISTS property_owner_invites_admin_all ON public.property_owner_invites;
CREATE POLICY property_owner_invites_admin_all ON public.property_owner_invites
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Property owners can see child spaces even before per-space owner_id is set (edge cases).
DROP POLICY IF EXISTS spaces_property_owner_select ON public.spaces;
CREATE POLICY spaces_property_owner_select ON public.spaces
  FOR SELECT TO authenticated
  USING (
    property_id IS NOT NULL
    AND property_id IN (
      SELECT id FROM public.properties WHERE owner_id = auth.uid()
    )
  );

GRANT SELECT ON public.properties TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.properties TO authenticated;
GRANT ALL ON public.properties TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.property_owner_invites TO authenticated;
GRANT ALL ON public.property_owner_invites TO service_role;

COMMENT ON POLICY spaces_property_owner_select ON public.spaces IS
  'Property owners can view all spaces linked to their venue. Does not affect public browse.';
