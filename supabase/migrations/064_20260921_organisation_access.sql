-- Organisation Access security foundation.
-- Additive: does not replace spaces.owner_id, properties.owner_id, claims, or invites.
-- No organisation / access rows are inserted here.

-- ---------------------------------------------------------------------------
-- 063 privilege cleanup
-- Default privileges grant TRUNCATE/REFERENCES/TRIGGER/MAINTAIN to authenticated.
-- RLS does not protect TRUNCATE. Re-grant only intended DML.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.organisations FROM PUBLIC;
REVOKE ALL ON TABLE public.organisations FROM anon;
REVOKE ALL ON TABLE public.organisations FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.organisations TO authenticated;
GRANT ALL ON TABLE public.organisations TO service_role;

-- ---------------------------------------------------------------------------
-- organisation_access
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organisation_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('org_admin', 'property_manager', 'space_manager')),
  property_id uuid REFERENCES public.properties(id) ON DELETE RESTRICT,
  space_id uuid REFERENCES public.spaces(id) ON DELETE RESTRICT,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  email text NOT NULL,
  email_normalized text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'active', 'revoked')),
  is_primary boolean NOT NULL DEFAULT false,
  notify_all_bookings boolean NOT NULL DEFAULT false,
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoke_reason text,
  CONSTRAINT organisation_access_scope_chk CHECK (
    (role = 'org_admin' AND property_id IS NULL AND space_id IS NULL)
    OR (role = 'property_manager' AND property_id IS NOT NULL AND space_id IS NULL)
    OR (role = 'space_manager' AND property_id IS NOT NULL AND space_id IS NOT NULL)
  ),
  CONSTRAINT organisation_access_status_chk CHECK (
    (
      status = 'pending'
      AND user_id IS NULL
      AND activated_at IS NULL
      AND revoked_at IS NULL
    )
    OR (
      status = 'active'
      AND user_id IS NOT NULL
      AND activated_at IS NOT NULL
      AND revoked_at IS NULL
    )
    OR (
      status = 'revoked'
      AND revoked_at IS NOT NULL
    )
  ),
  CONSTRAINT organisation_access_email_normalized_chk CHECK (
    email_normalized = lower(btrim(email))
    AND length(btrim(email)) > 2
    AND position('@' IN email_normalized) > 1
  ),
  CONSTRAINT organisation_access_is_primary_chk CHECK (
    is_primary = false OR role = 'space_manager'
  ),
  CONSTRAINT organisation_access_notify_all_bookings_chk CHECK (
    notify_all_bookings = false OR role = 'org_admin'
  )
);

COMMENT ON TABLE public.organisation_access IS
  'Granted organisation access (org admin, optional property manager, space managers). Pending rows are email-only; active rows are linked to profiles. Revoked rows are retained. Not a replacement for owner_id, listing claims, or property owner invites.';
COMMENT ON COLUMN public.organisation_access.is_primary IS
  'UX/notification preference for space_manager only. Not a permission flag.';
COMMENT ON COLUMN public.organisation_access.notify_all_bookings IS
  'Org Admin preference to receive all operational booking emails. Not a permission flag.';
COMMENT ON COLUMN public.organisation_access.email_normalized IS
  'Canonical lower(trim(email)). Always overwritten by trigger; do not trust clients.';

-- Live-grant uniqueness. NULLS NOT DISTINCT so org_admin (NULL property/space) cannot duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS organisation_access_active_unique
  ON public.organisation_access (
    organisation_id,
    role,
    property_id,
    space_id,
    user_id
  )
  NULLS NOT DISTINCT
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS organisation_access_pending_unique
  ON public.organisation_access (
    organisation_id,
    role,
    property_id,
    space_id,
    email_normalized
  )
  NULLS NOT DISTINCT
  WHERE status = 'pending';

-- At most one active primary Space Manager per space. Pending primaries do not count.
CREATE UNIQUE INDEX IF NOT EXISTS organisation_access_one_primary_space_manager
  ON public.organisation_access (space_id)
  WHERE status = 'active'
    AND role = 'space_manager'
    AND is_primary = true;

CREATE INDEX IF NOT EXISTS organisation_access_organisation_id_status_idx
  ON public.organisation_access (organisation_id, status);

CREATE INDEX IF NOT EXISTS organisation_access_user_id_active_idx
  ON public.organisation_access (user_id)
  WHERE status = 'active' AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS organisation_access_email_pending_idx
  ON public.organisation_access (email_normalized)
  WHERE status = 'pending';

-- Active Org Admin helper (SECURITY DEFINER so RLS on organisation_access
-- can consult membership without policy recursion).
-- Does not change user_is_platform_admin(); that helper is used elsewhere
-- and still ignores admin_access_disabled (application gates remain authoritative).
CREATE OR REPLACE FUNCTION public.user_is_active_org_admin(p_organisation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
GRANT EXECUTE ON FUNCTION public.user_is_active_org_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_active_org_admin(uuid) TO service_role;

COMMENT ON FUNCTION public.user_is_active_org_admin(uuid) IS
  'True when auth.uid() has an active org_admin grant on the organisation. Used by RLS; bypasses organisation_access RLS to avoid recursion.';

-- ---------------------------------------------------------------------------
-- Triggers: email canonicalisation + property/space belongs to organisation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.organisation_access_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS organisation_access_before_write ON public.organisation_access;
CREATE TRIGGER organisation_access_before_write
  BEFORE INSERT OR UPDATE ON public.organisation_access
  FOR EACH ROW
  EXECUTE FUNCTION public.organisation_access_before_write();

DROP TRIGGER IF EXISTS organisation_access_updated_at ON public.organisation_access;
CREATE TRIGGER organisation_access_updated_at
  BEFORE UPDATE ON public.organisation_access
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_set_updated_at();

-- ---------------------------------------------------------------------------
-- Last active Organisation Admin: no bypass in this migration.
-- Future Global Admin force-remove must be a SECURITY DEFINER RPC added later;
-- do not use a client-settable GUC. Direct DELETE/UPDATE of the final active
-- org_admin is blocked for every role, including service_role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.organisation_access_protect_last_org_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      USING HINT = 'An organisation must keep at least one active Organisation Admin. Pending/revoked grants do not count. A controlled Global Admin force-remove RPC is not in this migration.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organisation_access_protect_last_org_admin
  ON public.organisation_access;
CREATE TRIGGER organisation_access_protect_last_org_admin
  BEFORE UPDATE OR DELETE ON public.organisation_access
  FOR EACH ROW
  EXECUTE FUNCTION public.organisation_access_protect_last_org_admin();

-- Inverse integrity: do not move a property/space out from under live grants.
CREATE OR REPLACE FUNCTION public.organisation_access_block_property_org_move()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS properties_block_org_move_with_access ON public.properties;
CREATE TRIGGER properties_block_org_move_with_access
  BEFORE UPDATE OF organisation_id ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.organisation_access_block_property_org_move();

CREATE OR REPLACE FUNCTION public.organisation_access_block_space_property_move()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS spaces_block_property_move_with_access ON public.spaces;
CREATE TRIGGER spaces_block_property_move_with_access
  BEFORE UPDATE OF property_id ON public.spaces
  FOR EACH ROW
  EXECUTE FUNCTION public.organisation_access_block_space_property_move();

REVOKE ALL ON FUNCTION public.organisation_access_before_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.organisation_access_protect_last_org_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.organisation_access_block_property_org_move() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.organisation_access_block_space_property_move() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.organisation_access ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organisation_access FROM PUBLIC;
REVOKE ALL ON TABLE public.organisation_access FROM anon;
REVOKE ALL ON TABLE public.organisation_access FROM authenticated;
GRANT SELECT ON TABLE public.organisation_access TO authenticated;
GRANT ALL ON TABLE public.organisation_access TO service_role;

DROP POLICY IF EXISTS organisation_access_select ON public.organisation_access;
CREATE POLICY organisation_access_select ON public.organisation_access
  FOR SELECT TO authenticated
  USING (
    public.user_is_platform_admin()
    OR (user_id = auth.uid() AND status = 'active')
    OR public.user_is_active_org_admin(organisation_id)
  );

COMMENT ON POLICY organisation_access_select ON public.organisation_access IS
  'Platform admins see all grants. Active Org Admins see grants for their organisation. Users see only their own active grant. Pending is hidden from the invitee. No authenticated writes.';

-- Org Admins may read their organisation row (not mutate).
DROP POLICY IF EXISTS organisations_org_admin_select ON public.organisations;
CREATE POLICY organisations_org_admin_select ON public.organisations
  FOR SELECT TO authenticated
  USING (public.user_is_active_org_admin(id));

COMMENT ON POLICY organisations_org_admin_select ON public.organisations IS
  'Active Organisation Admins can read their organisation. Mutations remain platform-admin / service-role.';
