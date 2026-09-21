-- Organisation People & Access invitations.
-- Additive. Does not insert organisation_access or invitation rows.
-- Does not email anyone. Does not activate existing pending grants.
-- organisation_access remains the permission source of truth.
-- Invitation acceptance is the only path that activates pending email grants.

-- ---------------------------------------------------------------------------
-- organisation_access_invitations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organisation_access_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_access_id uuid NOT NULL
    REFERENCES public.organisation_access(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL
    REFERENCES public.organisations(id) ON DELETE RESTRICT,
  email text NOT NULL,
  email_normalized text NOT NULL,
  token_hash text NOT NULL,
  status text NOT NULL CHECK (
    status IN ('pending', 'accepted', 'revoked', 'expired')
  ),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT organisation_access_invitations_email_normalized_chk CHECK (
    email_normalized = lower(btrim(email))
    AND length(btrim(email)) > 2
    AND position('@' IN email_normalized) > 1
  ),
  CONSTRAINT organisation_access_invitations_status_chk CHECK (
    (
      status = 'pending'
      AND accepted_at IS NULL
      AND accepted_by IS NULL
      AND revoked_at IS NULL
    )
    OR (
      status = 'accepted'
      AND accepted_at IS NOT NULL
      AND accepted_by IS NOT NULL
      AND revoked_at IS NULL
    )
    OR (
      status = 'revoked'
      AND revoked_at IS NOT NULL
      AND accepted_at IS NULL
      AND accepted_by IS NULL
    )
    OR (
      status = 'expired'
      AND accepted_at IS NULL
      AND accepted_by IS NULL
    )
  )
);

COMMENT ON TABLE public.organisation_access_invitations IS
  'Hashed Organisation People & Access invitation tokens. Permission remains on organisation_access. Raw tokens are never stored. Pre-068 pending grants receive a token only when an admin resends.';

CREATE UNIQUE INDEX IF NOT EXISTS organisation_access_invitations_token_hash_uidx
  ON public.organisation_access_invitations (token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS organisation_access_invitations_one_pending
  ON public.organisation_access_invitations (organisation_access_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS organisation_access_invitations_access_id_idx
  ON public.organisation_access_invitations (organisation_access_id);

CREATE INDEX IF NOT EXISTS organisation_access_invitations_org_id_idx
  ON public.organisation_access_invitations (organisation_id);

CREATE INDEX IF NOT EXISTS organisation_access_invitations_expires_at_idx
  ON public.organisation_access_invitations (expires_at)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.organisation_access_invitations_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.email := btrim(NEW.email);
  NEW.email_normalized := lower(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organisation_access_invitations_before_write
  ON public.organisation_access_invitations;
CREATE TRIGGER organisation_access_invitations_before_write
  BEFORE INSERT OR UPDATE OF email, email_normalized
  ON public.organisation_access_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.organisation_access_invitations_before_write();

DROP TRIGGER IF EXISTS organisation_access_invitations_updated_at
  ON public.organisation_access_invitations;
CREATE TRIGGER organisation_access_invitations_updated_at
  BEFORE UPDATE ON public.organisation_access_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_set_updated_at();

REVOKE ALL ON FUNCTION public.organisation_access_invitations_before_write() FROM PUBLIC;

ALTER TABLE public.organisation_access_invitations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organisation_access_invitations FROM PUBLIC;
REVOKE ALL ON TABLE public.organisation_access_invitations FROM anon;
REVOKE ALL ON TABLE public.organisation_access_invitations FROM authenticated;
GRANT ALL ON TABLE public.organisation_access_invitations TO service_role;

-- ---------------------------------------------------------------------------
-- Disable unsafe email-match auto-activation from 067.
-- Pending grants can no longer become active merely because auth.users.email
-- matches. Invitation acceptance is the only activation path.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_pending_organisation_access(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Intentionally a no-op. p_user_id is accepted for signature compatibility
  -- with 067 callers and is not used to attach grants.
  RETURN jsonb_build_object(
    'activated', '[]'::jsonb,
    'invitation_required', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_pending_organisation_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_pending_organisation_access(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.activate_pending_organisation_access(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.activate_pending_organisation_access(uuid) TO service_role;

COMMENT ON FUNCTION public.activate_pending_organisation_access(uuid) IS
  'Deprecated no-op. Pending organisation_access is activated only by accept_organisation_access_invitation.';

-- ---------------------------------------------------------------------------
-- Atomic invitation acceptance.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_organisation_access_invitation(
  p_user_id uuid,
  p_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_invite public.organisation_access_invitations%ROWTYPE;
  v_access public.organisation_access%ROWTYPE;
  v_org_status text;
  v_email text;
  v_now timestamptz := pg_catalog.now();
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_user_id IS NULL OR p_token_hash IS NULL OR btrim(p_token_hash) = '' THEN
    RAISE EXCEPTION 'invitation_invalid';
  END IF;

  SELECT i.*
    INTO v_invite
  FROM public.organisation_access_invitations i
  WHERE i.token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found';
  END IF;

  IF v_invite.status = 'pending' AND v_invite.expires_at < v_now THEN
    UPDATE public.organisation_access_invitations
    SET status = 'expired'
    WHERE id = v_invite.id
      AND status = 'pending';
    RAISE EXCEPTION 'invitation_expired';
  END IF;

  IF v_invite.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'invitation_%', v_invite.status;
  END IF;

  SELECT a.*
    INTO v_access
  FROM public.organisation_access a
  WHERE a.id = v_invite.organisation_access_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found';
  END IF;

  IF v_access.organisation_id IS DISTINCT FROM v_invite.organisation_id THEN
    RAISE EXCEPTION 'invitation_invalid';
  END IF;

  IF v_access.status IS DISTINCT FROM 'pending' OR v_access.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'access_not_pending';
  END IF;

  SELECT o.status
    INTO v_org_status
  FROM public.organisations o
  WHERE o.id = v_access.organisation_id
  FOR UPDATE;

  IF v_org_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'organisation_inactive';
  END IF;

  SELECT lower(btrim(u.email))
    INTO v_email
  FROM auth.users u
  WHERE u.id = p_user_id;

  IF v_email IS NULL
    OR v_email IS DISTINCT FROM v_invite.email_normalized
    OR v_email IS DISTINCT FROM v_access.email_normalized
    OR v_invite.email_normalized IS DISTINCT FROM v_access.email_normalized
  THEN
    RAISE EXCEPTION 'invitation_email_mismatch';
  END IF;

  UPDATE public.organisation_access
  SET
    user_id = p_user_id,
    status = 'active',
    activated_at = v_now,
    is_primary = false
  WHERE id = v_access.id
    AND status = 'pending'
    AND user_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'access_not_pending';
  END IF;

  UPDATE public.organisation_access_invitations
  SET
    status = 'accepted',
    accepted_at = v_now,
    accepted_by = p_user_id
  WHERE id = v_invite.id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_pending';
  END IF;

  UPDATE public.organisation_access_invitations
  SET
    status = 'revoked',
    revoked_at = v_now
  WHERE organisation_access_id = v_access.id
    AND status = 'pending'
    AND id IS DISTINCT FROM v_invite.id;

  RETURN jsonb_build_object(
    'ok', true,
    'access_id', v_access.id,
    'organisation_id', v_access.organisation_id,
    'role', v_access.role,
    'property_id', v_access.property_id,
    'space_id', v_access.space_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'access_not_pending';
END;
$$;

REVOKE ALL ON FUNCTION public.accept_organisation_access_invitation(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_organisation_access_invitation(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.accept_organisation_access_invitation(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.accept_organisation_access_invitation(uuid, text) TO service_role;

COMMENT ON FUNCTION public.accept_organisation_access_invitation(uuid, text) IS
  'Service-role only. Activates a pending organisation_access row only when the hashed invitation token is pending, unexpired, and the authenticated auth.users email matches both the invitation and the grant.';
