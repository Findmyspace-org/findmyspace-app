-- CRM email logging (BCC to crm@findmyspace.co.za → IMAP import).

CREATE TABLE IF NOT EXISTS public.crm_email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid REFERENCES public.crm_organisations(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  engagement_id uuid REFERENCES public.crm_engagements(id) ON DELETE SET NULL,
  message_id text NOT NULL,
  from_email text,
  to_emails text[] NOT NULL DEFAULT '{}',
  cc_emails text[] NOT NULL DEFAULT '{}',
  bcc_emails text[] NOT NULL DEFAULT '{}',
  subject text,
  body_text text,
  body_html text,
  direction text NOT NULL DEFAULT 'outbound',
  sent_at timestamptz,
  imported_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.crm_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_email_messages_message_id_idx
  ON public.crm_email_messages(message_id);

CREATE INDEX IF NOT EXISTS crm_email_messages_organisation_id_idx
  ON public.crm_email_messages(organisation_id);

CREATE INDEX IF NOT EXISTS crm_email_messages_contact_id_idx
  ON public.crm_email_messages(contact_id);

CREATE INDEX IF NOT EXISTS crm_email_messages_sent_at_idx
  ON public.crm_email_messages(sent_at DESC);

CREATE INDEX IF NOT EXISTS crm_email_messages_unlinked_idx
  ON public.crm_email_messages(imported_at DESC)
  WHERE contact_id IS NULL;

ALTER TABLE public.crm_email_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_email_messages_select ON public.crm_email_messages;
CREATE POLICY crm_email_messages_select ON public.crm_email_messages
  FOR SELECT TO authenticated
  USING (
    public.crm_is_task_manager()
    OR (
      organisation_id IS NOT NULL
      AND public.crm_can_access_org(organisation_id)
    )
  );

DROP POLICY IF EXISTS crm_email_messages_update ON public.crm_email_messages;
CREATE POLICY crm_email_messages_update ON public.crm_email_messages
  FOR UPDATE TO authenticated
  USING (public.crm_is_task_manager())
  WITH CHECK (public.crm_is_task_manager());

GRANT SELECT, UPDATE ON public.crm_email_messages TO authenticated;
GRANT ALL ON public.crm_email_messages TO service_role;
