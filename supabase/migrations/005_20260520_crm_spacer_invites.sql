-- Spacer invitations (internal acquisition only; not for property owners)

CREATE TABLE IF NOT EXISTS public.crm_spacer_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text,
  phone text,
  invite_token text NOT NULL UNIQUE,
  invited_by uuid REFERENCES public.crm_profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'accepted', 'cancelled', 'expired')
  ),
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_spacer_invites_email_idx
  ON public.crm_spacer_invites (lower(btrim(email)));

CREATE INDEX IF NOT EXISTS crm_spacer_invites_status_idx
  ON public.crm_spacer_invites (status);

CREATE INDEX IF NOT EXISTS crm_spacer_invites_token_idx
  ON public.crm_spacer_invites (invite_token);

ALTER TABLE public.crm_spacer_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_spacer_invites_admin_all ON public.crm_spacer_invites;
CREATE POLICY crm_spacer_invites_admin_all ON public.crm_spacer_invites
  FOR ALL TO authenticated
  USING (public.crm_is_admin())
  WITH CHECK (public.crm_is_admin());

GRANT SELECT, INSERT, UPDATE ON public.crm_spacer_invites TO authenticated;

-- Tighten crm_profiles creation: only CRM admins may insert profiles (acceptance uses service role)
DROP POLICY IF EXISTS crm_profiles_insert_admin ON public.crm_profiles;
CREATE POLICY crm_profiles_insert_admin ON public.crm_profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.crm_is_admin());

-- Admins may update any profile (activate/deactivate Spacers); Spacers may update only themselves (not role/active)
DROP POLICY IF EXISTS crm_profiles_update ON public.crm_profiles;
CREATE POLICY crm_profiles_update ON public.crm_profiles
  FOR UPDATE TO authenticated
  USING (public.crm_is_admin() OR id = auth.uid())
  WITH CHECK (
    public.crm_is_admin()
    OR (
      id = auth.uid()
      AND role = (SELECT p.role FROM public.crm_profiles p WHERE p.id = auth.uid())
      AND active = (SELECT p.active FROM public.crm_profiles p WHERE p.id = auth.uid())
    )
  );
