-- People & Access management foundation.
-- Extends organisation_access. Does not create a second membership table.
-- Does not insert organisation or organisation_access rows.
-- Mutations remain service-role. Authenticated keeps SELECT only.
-- Last active Organisation Admin protection from 064 is unchanged (no Global Admin bypass).

-- ---------------------------------------------------------------------------
-- Harden remaining 064 trigger functions (search_path). Logic unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.organisation_access_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  prop_org uuid;
  space_prop uuid;
BEGIN
  NEW.email := btrim(NEW.email);
  NEW.email_normalized := lower(NEW.email);

  IF NEW.role IN ('property_manager', 'space_manager') THEN
    SELECT p.organisation_id
      INTO prop_org
    FROM public.properties p
    WHERE p.id = NEW.property_id;

    IF prop_org IS NULL OR prop_org IS DISTINCT FROM NEW.organisation_id THEN
      RAISE EXCEPTION 'organisation_access_property_scope_mismatch'
        USING HINT = 'Property must belong to the same organisation as the grant.';
    END IF;
  END IF;

  IF NEW.role = 'space_manager' THEN
    SELECT s.property_id
      INTO space_prop
    FROM public.spaces s
    WHERE s.id = NEW.space_id;

    IF space_prop IS NULL OR space_prop IS DISTINCT FROM NEW.property_id THEN
      RAISE EXCEPTION 'organisation_access_space_scope_mismatch'
        USING HINT = 'Space must belong to the grant property.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.organisation_access_protect_last_org_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  remaining integer;
  org uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IS DISTINCT FROM 'active' OR OLD.role IS DISTINCT FROM 'org_admin' THEN
      RETURN OLD;
    END IF;
    org := OLD.organisation_id;
  ELSE
    IF OLD.status IS DISTINCT FROM 'active' OR OLD.role IS DISTINCT FROM 'org_admin' THEN
      RETURN NEW;
    END IF;
    IF NEW.status IS NOT DISTINCT FROM 'active'
      AND NEW.role IS NOT DISTINCT FROM 'org_admin'
      AND NEW.organisation_id IS NOT DISTINCT FROM OLD.organisation_id
      AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
    THEN
      RETURN NEW;
    END IF;
    org := OLD.organisation_id;
  END IF;

  PERFORM 1
  FROM public.organisation_access a
  WHERE a.organisation_id = org
    AND a.status = 'active'
    AND a.role = 'org_admin'
  ORDER BY a.id
  FOR UPDATE;

  SELECT COUNT(*)::integer
    INTO remaining
  FROM public.organisation_access a
  WHERE a.organisation_id = org
    AND a.status = 'active'
    AND a.role = 'org_admin'
    AND a.id IS DISTINCT FROM OLD.id;

  IF remaining < 1 THEN
    RAISE EXCEPTION 'last_active_org_admin_required'
      USING HINT = 'An organisation must keep at least one active Organisation Admin. Pending/revoked grants do not count. Recovery is grant a replacement Organisation Admin, then revoke. No Global Admin bypass in this migration.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.organisation_access_block_property_org_move()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.organisation_id IS NOT DISTINCT FROM OLD.organisation_id THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organisation_access a
    WHERE a.property_id = OLD.id
      AND a.status IN ('pending', 'active')
  ) THEN
    RAISE EXCEPTION 'organisation_access_property_in_use'
      USING HINT = 'Revoke live property/space grants before changing properties.organisation_id.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.organisation_access_block_space_property_move()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.property_id IS NOT DISTINCT FROM OLD.property_id THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organisation_access a
    WHERE a.space_id = OLD.id
      AND a.status IN ('pending', 'active')
  ) THEN
    RAISE EXCEPTION 'organisation_access_space_in_use'
      USING HINT = 'Revoke live space grants before changing spaces.property_id.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.organisation_access_before_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.organisation_access_before_write() FROM anon;
REVOKE ALL ON FUNCTION public.organisation_access_protect_last_org_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.organisation_access_protect_last_org_admin() FROM anon;
REVOKE ALL ON FUNCTION public.organisation_access_block_property_org_move() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.organisation_access_block_property_org_move() FROM anon;
REVOKE ALL ON FUNCTION public.organisation_access_block_space_property_move() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.organisation_access_block_space_property_move() FROM anon;

-- Disabled Global Admins must not see all grants via PostgREST.
DROP POLICY IF EXISTS organisation_access_select ON public.organisation_access;
CREATE POLICY organisation_access_select ON public.organisation_access
  FOR SELECT TO authenticated
  USING (
    public.user_is_active_platform_admin()
    OR (user_id = auth.uid() AND status = 'active')
    OR public.user_is_active_org_admin(organisation_id)
  );

COMMENT ON POLICY organisation_access_select ON public.organisation_access IS
  'Active platform admins see all grants. Active Org Admins see grants for their organisation. Users see only their own active grant. Pending is hidden from the invitee. No authenticated writes.';

-- Reaffirm: browser clients do not mutate organisation_access.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.organisation_access FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.organisation_access FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.organisation_access FROM authenticated;
GRANT SELECT ON TABLE public.organisation_access TO authenticated;
GRANT ALL ON TABLE public.organisation_access TO service_role;

-- ---------------------------------------------------------------------------
-- Activate pending grants for a verified auth user (service_role only).
-- Email is taken from auth.users for p_user_id. Callers cannot activate a
-- different email. Idempotent: already-active matching grants are skipped.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_pending_organisation_access(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_email_normalized text;
  v_confirmed timestamptz;
  v_activated jsonb := '[]'::jsonb;
  r public.organisation_access%ROWTYPE;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('activated', v_activated);
  END IF;

  SELECT lower(btrim(u.email)), u.email_confirmed_at
    INTO v_email_normalized, v_confirmed
  FROM auth.users u
  WHERE u.id = p_user_id;

  IF v_email_normalized IS NULL OR v_confirmed IS NULL THEN
    RETURN jsonb_build_object('activated', v_activated);
  END IF;

  FOR r IN
    SELECT a.*
    FROM public.organisation_access a
    WHERE a.status = 'pending'
      AND a.email_normalized = v_email_normalized
      AND a.user_id IS NULL
    ORDER BY a.id
    FOR UPDATE
  LOOP
    -- Revoked rows are excluded by status=pending. Historical revoked grants
    -- never reactivate. If this user already has an identical active grant,
    -- leave the pending row pending (no duplicate authority).
    IF EXISTS (
      SELECT 1
      FROM public.organisation_access e
      WHERE e.status = 'active'
        AND e.organisation_id = r.organisation_id
        AND e.role = r.role
        AND e.property_id IS NOT DISTINCT FROM r.property_id
        AND e.space_id IS NOT DISTINCT FROM r.space_id
        AND e.user_id = p_user_id
    ) THEN
      CONTINUE;
    END IF;

    BEGIN
      UPDATE public.organisation_access
      SET
        user_id = p_user_id,
        status = 'active',
        activated_at = pg_catalog.now(),
        is_primary = false
      WHERE id = r.id
        AND status = 'pending'
        AND user_id IS NULL;

      IF FOUND THEN
        v_activated := v_activated || jsonb_build_array(
          jsonb_build_object(
            'id', r.id,
            'organisation_id', r.organisation_id,
            'role', r.role,
            'property_id', r.property_id,
            'space_id', r.space_id,
            'invited_by', r.invited_by
          )
        );
      END IF;
    EXCEPTION
      WHEN unique_violation THEN
        NULL;
      WHEN foreign_key_violation THEN
        NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object('activated', v_activated);
END;
$$;

REVOKE ALL ON FUNCTION public.activate_pending_organisation_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_pending_organisation_access(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.activate_pending_organisation_access(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.activate_pending_organisation_access(uuid) TO service_role;

COMMENT ON FUNCTION public.activate_pending_organisation_access(uuid) IS
  'Service-role only. Activates pending organisation_access rows whose normalized email matches the verified auth.users email for p_user_id. Idempotent. Does not activate unverified users or other emails.';

-- ---------------------------------------------------------------------------
-- Atomic primary Space Manager switch (service_role only).
-- Unique index organisation_access_one_primary_space_manager remains the
-- invariant. This RPC unsets the previous primary then sets the new one
-- under row locks so concurrent writes cannot create two actives.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_organisation_access_primary_space_manager(
  p_access_id uuid,
  p_is_primary boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  r public.organisation_access%ROWTYPE;
  previous_id uuid;
  v_space_id uuid;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_access_id IS NULL THEN
    RAISE EXCEPTION 'organisation_access_not_found';
  END IF;

  -- Read space_id without row locks, then take a deterministic space-level
  -- advisory lock before locking sibling grants. Locking a target row first
  -- would deadlock two concurrent switches on the same space.
  SELECT *
    INTO r
  FROM public.organisation_access
  WHERE id = p_access_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organisation_access_not_found';
  END IF;

  IF r.role IS DISTINCT FROM 'space_manager'
    OR r.status IS DISTINCT FROM 'active'
    OR r.space_id IS NULL
  THEN
    RAISE EXCEPTION 'organisation_access_not_active_space_manager';
  END IF;

  v_space_id := r.space_id;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    867001,
    pg_catalog.hashtext(v_space_id::text)
  );

  PERFORM a.id
  FROM public.organisation_access a
  WHERE a.space_id = v_space_id
    AND a.status = 'active'
    AND a.role = 'space_manager'
  ORDER BY a.id
  FOR UPDATE;

  SELECT *
    INTO r
  FROM public.organisation_access
  WHERE id = p_access_id;

  IF NOT FOUND
    OR r.role IS DISTINCT FROM 'space_manager'
    OR r.status IS DISTINCT FROM 'active'
    OR r.space_id IS DISTINCT FROM v_space_id
  THEN
    RAISE EXCEPTION 'organisation_access_not_active_space_manager';
  END IF;

  SELECT a.id
    INTO previous_id
  FROM public.organisation_access a
  WHERE a.space_id = r.space_id
    AND a.status = 'active'
    AND a.role = 'space_manager'
    AND a.is_primary = true
    AND a.id IS DISTINCT FROM p_access_id;

  IF p_is_primary THEN
    UPDATE public.organisation_access
    SET is_primary = false
    WHERE space_id = r.space_id
      AND status = 'active'
      AND role = 'space_manager'
      AND is_primary = true
      AND id IS DISTINCT FROM p_access_id;

    UPDATE public.organisation_access
    SET is_primary = true
    WHERE id = p_access_id;
  ELSE
    UPDATE public.organisation_access
    SET is_primary = false
    WHERE id = p_access_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', p_access_id,
    'is_primary', p_is_primary,
    'previous_primary_id', previous_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_organisation_access_primary_space_manager(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_organisation_access_primary_space_manager(uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.set_organisation_access_primary_space_manager(uuid, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_organisation_access_primary_space_manager(uuid, boolean) TO service_role;

COMMENT ON FUNCTION public.set_organisation_access_primary_space_manager(uuid, boolean) IS
  'Service-role only. Atomically assigns or clears the active primary Space Manager for a space. Primary is operational preference, not ownership.';
