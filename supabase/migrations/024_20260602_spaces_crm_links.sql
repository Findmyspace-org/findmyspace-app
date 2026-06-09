-- Link marketplace listings (spaces) to Space Place CRM orgs/contacts.
-- Nullable FKs: optional, one listing → at most one org + optional contact.

ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS crm_organisation_id uuid
    REFERENCES public.crm_organisations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS crm_contact_id uuid
    REFERENCES public.crm_contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS spaces_crm_organisation_id_idx
  ON public.spaces (crm_organisation_id)
  WHERE crm_organisation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS spaces_crm_contact_id_idx
  ON public.spaces (crm_contact_id)
  WHERE crm_contact_id IS NOT NULL;

ALTER TABLE public.spaces
  DROP CONSTRAINT IF EXISTS spaces_crm_contact_requires_org;

ALTER TABLE public.spaces
  ADD CONSTRAINT spaces_crm_contact_requires_org CHECK (
    crm_contact_id IS NULL OR crm_organisation_id IS NOT NULL
  );

COMMENT ON COLUMN public.spaces.crm_organisation_id IS
  'Optional Space Place CRM organisation linked to this listing (admin/CRM only).';
COMMENT ON COLUMN public.spaces.crm_contact_id IS
  'Optional Space Place CRM contact; must belong to crm_organisation_id when set.';
