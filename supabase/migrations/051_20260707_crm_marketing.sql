-- CRM marketing audience (POPIA-aware; contacts remain source of truth in crm_contacts)

CREATE TABLE IF NOT EXISTS public.crm_marketing_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  list_type text NOT NULL DEFAULT 'manual' CHECK (list_type IN ('manual', 'system', 'dynamic')),
  is_system boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.crm_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_marketing_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_contact_id uuid NOT NULL UNIQUE REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  crm_organisation_id uuid REFERENCES public.crm_organisations(id) ON DELETE SET NULL,
  email text,
  email_normalised text,
  status text NOT NULL DEFAULT 'pending_consent' CHECK (
    status IN (
      'pending_consent', 'eligible_customer', 'subscribed',
      'unsubscribed', 'suppressed', 'invalid_email'
    )
  ),
  consent_status text NOT NULL DEFAULT 'unknown' CHECK (
    consent_status IN ('unknown', 'granted', 'withdrawn', 'not_required')
  ),
  lawful_basis text NOT NULL DEFAULT 'review_required' CHECK (
    lawful_basis IN (
      'consent', 'existing_customer_similar_services', 'none', 'review_required'
    )
  ),
  consent_source text,
  consent_recorded_at timestamptz,
  consent_withdrawn_at timestamptz,
  unsubscribe_at timestamptz,
  suppressed_at timestamptz,
  suppression_reason text,
  last_bounce_at timestamptz,
  bounce_type text,
  created_from text,
  created_from_pipeline_stage text,
  created_by uuid REFERENCES public.crm_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_marketing_contacts_org_idx
  ON public.crm_marketing_contacts(crm_organisation_id);
CREATE INDEX IF NOT EXISTS crm_marketing_contacts_email_norm_idx
  ON public.crm_marketing_contacts(email_normalised);
CREATE INDEX IF NOT EXISTS crm_marketing_contacts_status_idx
  ON public.crm_marketing_contacts(status);

CREATE TABLE IF NOT EXISTS public.crm_marketing_list_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marketing_contact_id uuid NOT NULL REFERENCES public.crm_marketing_contacts(id) ON DELETE CASCADE,
  marketing_list_id uuid NOT NULL REFERENCES public.crm_marketing_lists(id) ON DELETE CASCADE,
  source text,
  added_by uuid REFERENCES public.crm_profiles(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marketing_contact_id, marketing_list_id)
);

CREATE TABLE IF NOT EXISTS public.crm_marketing_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  actor_id uuid REFERENCES public.crm_profiles(id) ON DELETE SET NULL,
  marketing_contact_id uuid REFERENCES public.crm_marketing_contacts(id) ON DELETE SET NULL,
  crm_contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  crm_organisation_id uuid REFERENCES public.crm_organisations(id) ON DELETE SET NULL,
  marketing_list_id uuid REFERENCES public.crm_marketing_lists(id) ON DELETE SET NULL,
  previous_value jsonb,
  new_value jsonb,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text,
  preview_text text,
  sender_name text,
  reply_to text,
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN (
      'draft', 'ready_for_review', 'scheduled', 'sending', 'sent', 'cancelled', 'failed'
    )
  ),
  body_html text,
  body_text text,
  list_ids uuid[] DEFAULT '{}',
  estimated_audience integer DEFAULT 0,
  eligible_recipients integer DEFAULT 0,
  excluded_recipients integer DEFAULT 0,
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_by uuid REFERENCES public.crm_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_pipeline_close_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  organisation_id uuid NOT NULL REFERENCES public.crm_organisations(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.crm_profiles(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  result jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS crm_pipeline_close_ops_org_idx
  ON public.crm_pipeline_close_operations(organisation_id);

-- Seed system lists
INSERT INTO public.crm_marketing_lists (slug, name, description, list_type, is_system)
VALUES
  ('general-updates', 'General updates', 'Product and platform updates', 'system', true),
  ('go-live-announcements', 'Go-live announcements', 'Launch and go-live announcements', 'system', true),
  ('listed-organisations', 'Listed organisations', 'Organisations with listed spaces', 'system', true),
  ('signed-up-organisations', 'Signed-up organisations', 'Organisations that have signed up', 'system', true),
  ('closed-not-now', 'Closed / Not Now', 'Pipeline closed or not now contacts', 'system', true),
  ('municipalities', 'Municipalities', 'Municipality organisations', 'system', true),
  ('schools', 'Schools', 'School organisations', 'system', true),
  ('property-owners', 'Property owners', 'Property owner organisations', 'system', true),
  ('venues', 'Venues', 'Venue organisations', 'system', true)
ON CONFLICT (slug) DO NOTHING;

GRANT ALL ON public.crm_marketing_lists TO service_role;
GRANT ALL ON public.crm_marketing_contacts TO service_role;
GRANT ALL ON public.crm_marketing_list_members TO service_role;
GRANT ALL ON public.crm_marketing_audits TO service_role;
GRANT ALL ON public.crm_marketing_campaigns TO service_role;
GRANT ALL ON public.crm_pipeline_close_operations TO service_role;

ALTER TABLE public.crm_marketing_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_marketing_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_marketing_list_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_marketing_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_pipeline_close_operations ENABLE ROW LEVEL SECURITY;
