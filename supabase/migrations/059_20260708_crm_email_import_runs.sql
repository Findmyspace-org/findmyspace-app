-- CRM email import: IMAP UID dedup + import run metadata

ALTER TABLE public.crm_email_messages
  ADD COLUMN IF NOT EXISTS imap_uid bigint,
  ADD COLUMN IF NOT EXISTS mailbox_folder text,
  ADD COLUMN IF NOT EXISTS mailbox_host text;

CREATE UNIQUE INDEX IF NOT EXISTS crm_email_messages_imap_uid_uidx
  ON public.crm_email_messages (mailbox_host, mailbox_folder, imap_uid)
  WHERE imap_uid IS NOT NULL
    AND mailbox_host IS NOT NULL
    AND mailbox_folder IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_email_messages_mailbox_folder_idx
  ON public.crm_email_messages (mailbox_folder)
  WHERE mailbox_folder IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.crm_email_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_host text NOT NULL,
  mailbox_folder text NOT NULL,
  days_back integer NOT NULL,
  unread_only boolean NOT NULL DEFAULT false,
  scanned integer NOT NULL DEFAULT 0,
  imported integer NOT NULL DEFAULT 0,
  matched integer NOT NULL DEFAULT 0,
  unmatched integer NOT NULL DEFAULT 0,
  duplicates_skipped integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  marked_read integer NOT NULL DEFAULT 0,
  success boolean NOT NULL DEFAULT false,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_by uuid REFERENCES public.crm_profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS crm_email_import_runs_finished_idx
  ON public.crm_email_import_runs (finished_at DESC NULLS LAST);

GRANT ALL ON public.crm_email_import_runs TO service_role;
ALTER TABLE public.crm_email_import_runs ENABLE ROW LEVEL SECURITY;
