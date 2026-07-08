-- CRM email manual link provenance + link audit trail

ALTER TABLE public.crm_email_messages
  ADD COLUMN IF NOT EXISTS linked_at timestamptz,
  ADD COLUMN IF NOT EXISTS linked_by uuid REFERENCES public.crm_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crm_email_messages_linked_by_idx
  ON public.crm_email_messages (linked_by)
  WHERE linked_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.crm_email_link_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL CHECK (action IN ('email_linked', 'email_relinked', 'email_unlinked')),
  email_message_id uuid NOT NULL REFERENCES public.crm_email_messages(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.crm_profiles(id) ON DELETE SET NULL,
  previous_contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  previous_organisation_id uuid REFERENCES public.crm_organisations(id) ON DELETE SET NULL,
  new_contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  new_organisation_id uuid REFERENCES public.crm_organisations(id) ON DELETE SET NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_email_link_audits_email_idx
  ON public.crm_email_link_audits (email_message_id, created_at DESC);

CREATE INDEX IF NOT EXISTS crm_email_link_audits_actor_idx
  ON public.crm_email_link_audits (actor_id);

GRANT ALL ON public.crm_email_link_audits TO service_role;
ALTER TABLE public.crm_email_link_audits ENABLE ROW LEVEL SECURITY;
