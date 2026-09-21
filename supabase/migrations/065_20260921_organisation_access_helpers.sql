-- Organisation access resolution helpers.
-- Does not replace owner_id, claims, or invites.
-- Does not rewrite user_is_platform_admin() or user_can_manage_space_listing().
-- No organisation / access rows. No spaces/bookings RLS rewrite.
--
-- SECURITY DEFINER search_path is pg_catalog, public to block search_path
-- shadowing. Application tables are schema-qualified. auth.uid() is
-- schema-qualified (auth is not on search_path).

-- Harden 064 helper search_path / EXECUTE only. Predicate unchanged.
CREATE OR REPLACE FUNCTION public.user_is_active_org_admin(p_organisation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organisation_access a
    WHERE a.organisation_id = p_organisation_id
      AND a.user_id = auth.uid()
      AND a.role = 'org_admin'
      AND a.status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.user_is_active_org_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_is_active_org_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.user_is_active_org_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_active_org_admin(uuid) TO service_role;

-- Active Global Admin for the NEW organisation-access model.
-- Legacy user_is_platform_admin() is unchanged (still ignores admin_access_disabled).
CREATE OR REPLACE FUNCTION public.user_is_active_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'super_admin')
      AND COALESCE(p.admin_access_disabled, false) = false
  );
$$;

CREATE OR REPLACE FUNCTION public.user_is_active_property_manager(p_property_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_property_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.organisation_access a
      WHERE a.property_id = p_property_id
        AND a.user_id = auth.uid()
        AND a.role = 'property_manager'
        AND a.status = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION public.user_is_active_space_manager(p_space_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_space_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.organisation_access a
      WHERE a.space_id = p_space_id
        AND a.user_id = auth.uid()
        AND a.role = 'space_manager'
        AND a.status = 'active'
    );
$$;

-- Canonical host-side space management for the new model.
-- Includes active platform admin, org admin, property manager, space manager,
-- and legacy space/property owners. Does not infer Org Admin from owner_id.
CREATE OR REPLACE FUNCTION public.user_can_manage_space(p_space_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.spaces s
    LEFT JOIN public.properties p ON p.id = s.property_id
    WHERE s.id = p_space_id
      AND (
        public.user_is_active_platform_admin()
        OR s.owner_id = auth.uid()
        OR p.owner_id = auth.uid()
        OR (
          p.organisation_id IS NOT NULL
          AND public.user_is_active_org_admin(p.organisation_id)
        )
        OR public.user_is_active_property_manager(s.property_id)
        OR public.user_is_active_space_manager(s.id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_manage_booking(p_booking_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.id = p_booking_id
      AND public.user_can_manage_space(b.space_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_view_booking_commercial(p_booking_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.user_can_manage_booking(p_booking_id);
$$;

CREATE OR REPLACE FUNCTION public.user_can_manage_org_finance(p_organisation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_organisation_id IS NOT NULL
    AND (
      public.user_is_active_platform_admin()
      OR public.user_is_active_org_admin(p_organisation_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.user_can_manage_org_people(p_organisation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.user_can_manage_org_finance(p_organisation_id);
$$;

REVOKE ALL ON FUNCTION public.user_is_active_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_is_active_platform_admin() FROM anon;
REVOKE ALL ON FUNCTION public.user_is_active_property_manager(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_is_active_property_manager(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.user_is_active_space_manager(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_is_active_space_manager(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.user_can_manage_space(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_manage_space(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.user_can_manage_booking(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_manage_booking(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.user_can_view_booking_commercial(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_view_booking_commercial(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.user_can_manage_org_finance(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_manage_org_finance(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.user_can_manage_org_people(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_manage_org_people(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.user_is_active_platform_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_is_active_property_manager(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_is_active_space_manager(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_manage_space(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_manage_booking(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_view_booking_commercial(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_manage_org_finance(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_manage_org_people(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.user_is_active_platform_admin() IS
  'New organisation-access Global Admin: profiles.role admin/super_admin and admin_access_disabled is not true. Does not replace user_is_platform_admin().';
COMMENT ON FUNCTION public.user_can_manage_space(uuid) IS
  'Host-side space management: active platform admin, org admin, property manager, space manager, or legacy space/property owner. Pending/revoked grants do not count.';
COMMENT ON FUNCTION public.user_can_view_booking_commercial(uuid) IS
  'Booking price/payment visibility within authorised space scope. Not organisation finance administration.';
COMMENT ON FUNCTION public.user_can_manage_org_finance(uuid) IS
  'Organisation-level finance (reports, payouts, bank/payment config, commission). Org Admin or active platform admin only.';
COMMENT ON FUNCTION public.user_can_manage_org_people(uuid) IS
  'People & Access for an organisation. Org Admin or active platform admin only.';
