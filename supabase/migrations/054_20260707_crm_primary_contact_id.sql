-- Explicit primary contact on organisations (replaces created_at fallback).

ALTER TABLE public.crm_organisations
  ADD COLUMN IF NOT EXISTS primary_contact_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'crm_organisations'
      AND constraint_name = 'crm_organisations_primary_contact_id_fkey'
  ) THEN
    ALTER TABLE public.crm_organisations
      ADD CONSTRAINT crm_organisations_primary_contact_id_fkey
      FOREIGN KEY (primary_contact_id)
      REFERENCES public.crm_contacts(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS crm_organisations_primary_contact_id_idx
  ON public.crm_organisations(primary_contact_id);

COMMENT ON COLUMN public.crm_organisations.primary_contact_id IS
  'Explicit primary CRM contact for this organisation; not inferred from created_at.';
