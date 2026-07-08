-- CRM marketing templates + campaign builder extensions

CREATE TABLE IF NOT EXISTS public.crm_marketing_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  template_type text NOT NULL DEFAULT 'general',
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  header_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  footer_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_style_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  html_template text,
  plain_text_template text,
  preview_image_url text,
  created_by uuid REFERENCES public.crm_profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.crm_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_marketing_templates_active_idx
  ON public.crm_marketing_templates(is_active);
CREATE INDEX IF NOT EXISTS crm_marketing_templates_type_idx
  ON public.crm_marketing_templates(template_type);

CREATE UNIQUE INDEX IF NOT EXISTS crm_marketing_templates_one_default_idx
  ON public.crm_marketing_templates ((true))
  WHERE is_default = true AND is_active = true;

ALTER TABLE public.crm_marketing_campaigns
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.crm_marketing_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_snapshot_json jsonb,
  ADD COLUMN IF NOT EXISTS rendered_html text,
  ADD COLUMN IF NOT EXISTS rendered_plain_text text,
  ADD COLUMN IF NOT EXISTS audience_definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS audience_snapshot_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audience_snapshot_json jsonb,
  ADD COLUMN IF NOT EXISTS audience_previewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sender_email text,
  ADD COLUMN IF NOT EXISTS campaign_type text NOT NULL DEFAULT 'newsletter',
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS content_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS crm_marketing_campaigns_template_idx
  ON public.crm_marketing_campaigns(template_id);
CREATE INDEX IF NOT EXISTS crm_marketing_campaigns_status_idx
  ON public.crm_marketing_campaigns(status);

ALTER TABLE public.crm_marketing_audits
  ADD COLUMN IF NOT EXISTS marketing_campaign_id uuid REFERENCES public.crm_marketing_campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crm_marketing_audits_campaign_idx
  ON public.crm_marketing_audits(marketing_campaign_id);

-- Default FindMySpace template (safe starter; logo uses site asset path)
INSERT INTO public.crm_marketing_templates (
  name,
  description,
  template_type,
  is_default,
  is_active,
  header_json,
  footer_json,
  content_style_json,
  html_template,
  plain_text_template
)
SELECT
  'FindMySpace general update',
  'Default branded newsletter layout for platform updates and announcements.',
  'general',
  true,
  true,
  jsonb_build_object(
    'logoUrl', '/logo.png',
    'backgroundColor', '#f5f7fb',
    'brandColor', '#192a3a',
    'accentColor', '#c1121f'
  ),
  jsonb_build_object(
    'companyName', 'FindMySpace',
    'contactEmail', 'hello@findmyspace.co.za',
    'websiteUrl', 'https://findmyspace.co.za',
    'showSocialLinks', true,
    'socialLinks', jsonb_build_array(
      jsonb_build_object('label', 'Website', 'url', 'https://findmyspace.co.za')
    ),
    'legalText', 'You are receiving this email because you are a CRM contact for FindMySpace.',
    'requireUnsubscribe', true
  ),
  jsonb_build_object(
    'contentWidth', 600,
    'fontFamily', 'Arial, Helvetica, sans-serif',
    'textColor', '#192a3a',
    'buttonBackground', '#c1121f',
    'buttonTextColor', '#ffffff',
    'buttonRadius', 8
  ),
  '<!-- FMS_TEMPLATE -->',
  'FindMySpace update\n\n{{content}}\n\n{{unsubscribe_url}}'
WHERE NOT EXISTS (
  SELECT 1 FROM public.crm_marketing_templates WHERE is_default = true AND is_active = true
);

GRANT ALL ON public.crm_marketing_templates TO service_role;

ALTER TABLE public.crm_marketing_templates ENABLE ROW LEVEL SECURITY;
