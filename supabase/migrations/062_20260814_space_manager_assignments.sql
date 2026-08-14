-- Delegated space-manager access under existing property ownership.
-- Does not change properties.owner_id / spaces.owner_id or the owner-invite flow.
-- 061 is reserved for the live-mode claim fix on a sibling branch.

CREATE TABLE IF NOT EXISTS public.space_manager_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  receive_notifications boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (space_id, user_id)
);

CREATE INDEX IF NOT EXISTS space_manager_assignments_user_id_idx
  ON public.space_manager_assignments (user_id);
CREATE INDEX IF NOT EXISTS space_manager_assignments_space_id_idx
  ON public.space_manager_assignments (space_id);

COMMENT ON TABLE public.space_manager_assignments IS
  'Delegated managers for a specific space. Property ownership remains properties.owner_id.';

DROP TRIGGER IF EXISTS space_manager_assignments_updated_at ON public.space_manager_assignments;
CREATE TRIGGER space_manager_assignments_updated_at
  BEFORE UPDATE ON public.space_manager_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_set_updated_at();

CREATE TABLE IF NOT EXISTS public.space_manager_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  receive_notifications boolean NOT NULL DEFAULT true,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS space_manager_invites_property_id_idx
  ON public.space_manager_invites (property_id);
CREATE INDEX IF NOT EXISTS space_manager_invites_email_idx
  ON public.space_manager_invites (lower(email));

CREATE TABLE IF NOT EXISTS public.space_manager_invite_spaces (
  invite_id uuid NOT NULL REFERENCES public.space_manager_invites(id) ON DELETE CASCADE,
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  PRIMARY KEY (invite_id, space_id)
);

CREATE INDEX IF NOT EXISTS space_manager_invite_spaces_space_id_idx
  ON public.space_manager_invite_spaces (space_id);

-- ---------------------------------------------------------------------------
-- Permission helpers (extend existing 042 functions; do not drop callers)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_is_assigned_space_manager(p_space_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.space_manager_assignments a
    WHERE a.space_id = p_space_id
      AND a.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_view_property(p_property_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.user_is_platform_admin()
    OR public.user_owns_property(p_property_id)
    OR EXISTS (
      SELECT 1
      FROM public.spaces s
      JOIN public.space_manager_assignments a ON a.space_id = s.id
      WHERE s.property_id = p_property_id
        AND a.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.user_can_manage_space_listing(p_space_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.spaces s
    WHERE s.id = p_space_id
      AND (
        s.owner_id = auth.uid()
        OR (
          s.property_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.properties p
            WHERE p.id = s.property_id
              AND p.owner_id = auth.uid()
          )
        )
        OR public.user_is_assigned_space_manager(p_space_id)
        OR public.user_is_platform_admin()
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.space_manager_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_manager_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_manager_invite_spaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS space_manager_assignments_select ON public.space_manager_assignments;
CREATE POLICY space_manager_assignments_select
  ON public.space_manager_assignments
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.user_is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.spaces s
      WHERE s.id = space_manager_assignments.space_id
        AND s.property_id IS NOT NULL
        AND public.user_owns_property(s.property_id)
    )
  );

DROP POLICY IF EXISTS space_manager_invites_select ON public.space_manager_invites;
CREATE POLICY space_manager_invites_select
  ON public.space_manager_invites
  FOR SELECT TO authenticated
  USING (
    public.user_is_platform_admin()
    OR public.user_owns_property(property_id)
  );

DROP POLICY IF EXISTS space_manager_invite_spaces_select ON public.space_manager_invite_spaces;
CREATE POLICY space_manager_invite_spaces_select
  ON public.space_manager_invite_spaces
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.space_manager_invites i
      WHERE i.id = space_manager_invite_spaces.invite_id
        AND (
          public.user_is_platform_admin()
          OR public.user_owns_property(i.property_id)
        )
    )
  );

DROP POLICY IF EXISTS properties_manager_select ON public.properties;
CREATE POLICY properties_manager_select
  ON public.properties
  FOR SELECT TO authenticated
  USING (public.user_can_view_property(id));

DROP POLICY IF EXISTS spaces_manager_select ON public.spaces;
CREATE POLICY spaces_manager_select
  ON public.spaces
  FOR SELECT TO authenticated
  USING (public.user_is_assigned_space_manager(id));

DROP POLICY IF EXISTS spaces_manager_update ON public.spaces;
CREATE POLICY spaces_manager_update
  ON public.spaces
  FOR UPDATE TO authenticated
  USING (
    public.user_is_assigned_space_manager(id)
    OR (
      property_id IS NOT NULL
      AND public.user_owns_property(property_id)
    )
  )
  WITH CHECK (
    public.user_is_assigned_space_manager(id)
    OR (
      property_id IS NOT NULL
      AND public.user_owns_property(property_id)
    )
  );

DROP POLICY IF EXISTS properties_admin_all ON public.properties;
CREATE POLICY properties_admin_all ON public.properties
  FOR ALL TO authenticated
  USING (public.user_is_platform_admin())
  WITH CHECK (public.user_is_platform_admin());

DROP POLICY IF EXISTS spaces_admin_select ON public.spaces;
CREATE POLICY spaces_admin_select ON public.spaces
  FOR SELECT TO authenticated
  USING (public.user_is_platform_admin());

DO $$
BEGIN
  IF to_regclass('public.bookings') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS bookings_manage_select ON public.bookings';
  EXECUTE $sql$
    CREATE POLICY bookings_manage_select
      ON public.bookings
      FOR SELECT TO authenticated
      USING (public.user_can_manage_space_listing(space_id))
  $sql$;
  EXECUTE 'DROP POLICY IF EXISTS bookings_manage_update ON public.bookings';
  EXECUTE $sql$
    CREATE POLICY bookings_manage_update
      ON public.bookings
      FOR UPDATE TO authenticated
      USING (public.user_can_manage_space_listing(space_id))
      WITH CHECK (public.user_can_manage_space_listing(space_id))
  $sql$;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.blocked_dates') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'blocked_dates' AND c.relrowsecurity
  ) THEN
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS blocked_dates_manage_select ON public.blocked_dates';
  EXECUTE $sql$
    CREATE POLICY blocked_dates_manage_select
      ON public.blocked_dates
      FOR SELECT TO authenticated
      USING (public.user_can_manage_space_listing(space_id))
  $sql$;
  EXECUTE 'DROP POLICY IF EXISTS blocked_dates_manage_write ON public.blocked_dates';
  EXECUTE $sql$
    CREATE POLICY blocked_dates_manage_write
      ON public.blocked_dates
      FOR ALL TO authenticated
      USING (public.user_can_manage_space_listing(space_id))
      WITH CHECK (public.user_can_manage_space_listing(space_id))
  $sql$;
END
$$;

GRANT EXECUTE ON FUNCTION public.user_is_assigned_space_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_view_property(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_manage_space_listing(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_property(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_platform_admin() TO authenticated;
GRANT SELECT ON public.space_manager_assignments TO authenticated;
GRANT SELECT ON public.space_manager_invites TO authenticated;
GRANT SELECT ON public.space_manager_invite_spaces TO authenticated;
GRANT ALL ON public.space_manager_assignments TO service_role;
GRANT ALL ON public.space_manager_invites TO service_role;
GRANT ALL ON public.space_manager_invite_spaces TO service_role;
