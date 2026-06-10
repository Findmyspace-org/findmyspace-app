-- Venue/property ownership layer (Phase 1). Not a public marketplace listing.

CREATE TABLE IF NOT EXISTS public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  address_line1 text,
  suburb text,
  city text,
  province text,
  postal_code text,
  country text,
  latitude numeric,
  longitude numeric,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_email text,
  crm_organisation_id uuid REFERENCES public.crm_organisations(id) ON DELETE SET NULL,
  created_by_admin boolean NOT NULL DEFAULT true,
  created_by_admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_invited_at timestamptz,
  owner_accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS properties_owner_id_idx
  ON public.properties (owner_id)
  WHERE owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS properties_created_by_admin_id_idx
  ON public.properties (created_by_admin_id)
  WHERE created_by_admin_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS properties_crm_organisation_id_idx
  ON public.properties (crm_organisation_id)
  WHERE crm_organisation_id IS NOT NULL;

DROP TRIGGER IF EXISTS properties_updated_at ON public.properties;
CREATE TRIGGER properties_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

COMMENT ON TABLE public.properties IS
  'Real-world venue/property grouping for ownership and CRM. Not a public listing.';
