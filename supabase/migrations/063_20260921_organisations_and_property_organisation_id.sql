-- Operational marketplace organisations (not CRM).
-- Additive: existing properties/spaces/owners/claims/invites are unchanged.
-- organisation_id on properties is nullable and is not backfilled.

-- ---------------------------------------------------------------------------
-- organisations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  crm_organisation_id uuid REFERENCES public.crm_organisations(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT organisations_slug_nonempty CHECK (slug IS NULL OR length(btrim(slug)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS organisations_slug_key
  ON public.organisations (slug)
  WHERE slug IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS organisations_crm_organisation_id_uidx
  ON public.organisations (crm_organisation_id)
  WHERE crm_organisation_id IS NOT NULL;

COMMENT ON TABLE public.organisations IS
  'Operational marketplace account for properties, spaces, access, bookings and finance. Separate from crm_organisations; CRM is not the RBAC boundary.';
COMMENT ON COLUMN public.organisations.crm_organisation_id IS
  'Optional link to the internal CRM organisation. Not used for marketplace permissions.';
COMMENT ON COLUMN public.organisations.status IS
  'active or archived. Soft archive; do not hard-delete operational organisations.';
COMMENT ON COLUMN public.organisations.created_by IS
  'Profile that created the organisation (typically a platform admin).';

DROP TRIGGER IF EXISTS organisations_updated_at ON public.organisations;
CREATE TRIGGER organisations_updated_at
  BEFORE UPDATE ON public.organisations
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organisations FROM PUBLIC;
REVOKE ALL ON TABLE public.organisations FROM anon;

GRANT SELECT, INSERT, UPDATE ON TABLE public.organisations TO authenticated;
GRANT ALL ON TABLE public.organisations TO service_role;

-- Platform admin (profiles.role admin or super_admin). No public or member access yet.
DROP POLICY IF EXISTS organisations_platform_admin_all ON public.organisations;
CREATE POLICY organisations_platform_admin_all ON public.organisations
  FOR ALL TO authenticated
  USING (public.user_is_platform_admin())
  WITH CHECK (public.user_is_platform_admin());

COMMENT ON POLICY organisations_platform_admin_all ON public.organisations IS
  'Global Admin and Super Admin may manage operational organisations. Member access is added in a later migration.';

-- ---------------------------------------------------------------------------
-- properties.organisation_id (nullable, no backfill)
-- ---------------------------------------------------------------------------
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES public.organisations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS properties_organisation_id_idx
  ON public.properties (organisation_id)
  WHERE organisation_id IS NOT NULL;

COMMENT ON COLUMN public.properties.organisation_id IS
  'Optional operational organisation that owns this property. Source of truth for Organisation → Property → Space. NULL for individual/non-organisation listings.';
