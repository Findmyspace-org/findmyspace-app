-- CRM completed actions: optional historical facts for orgs / properties / spaces.
-- Not a checklist, task list, or pipeline controller.

CREATE TABLE IF NOT EXISTS public.crm_completed_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.crm_organisations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  space_id uuid REFERENCES public.spaces(id) ON DELETE SET NULL,
  action_key text,
  action_label text NOT NULL,
  is_custom boolean NOT NULL DEFAULT false,
  note text,
  completed_at timestamptz NOT NULL DEFAULT now(),
  completed_by uuid NOT NULL REFERENCES public.crm_profiles(id) ON DELETE RESTRICT,
  timeline_engagement_id uuid REFERENCES public.crm_engagements(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_completed_actions_label_not_blank CHECK (length(trim(action_label)) > 0),
  CONSTRAINT crm_completed_actions_custom_key CHECK (
    (is_custom = true AND action_key IS NULL)
    OR (is_custom = false AND action_key IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS crm_completed_actions_org_completed_idx
  ON public.crm_completed_actions (organisation_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS crm_completed_actions_property_idx
  ON public.crm_completed_actions (property_id)
  WHERE property_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_completed_actions_space_idx
  ON public.crm_completed_actions (space_id)
  WHERE space_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_completed_actions_completed_by_idx
  ON public.crm_completed_actions (completed_by);

CREATE INDEX IF NOT EXISTS crm_completed_actions_action_key_idx
  ON public.crm_completed_actions (action_key)
  WHERE action_key IS NOT NULL;

-- One active standard action per subject (org / property / space scope).
CREATE UNIQUE INDEX IF NOT EXISTS crm_completed_actions_std_org_uidx
  ON public.crm_completed_actions (organisation_id, action_key)
  WHERE action_key IS NOT NULL
    AND property_id IS NULL
    AND space_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crm_completed_actions_std_property_uidx
  ON public.crm_completed_actions (organisation_id, property_id, action_key)
  WHERE action_key IS NOT NULL
    AND property_id IS NOT NULL
    AND space_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crm_completed_actions_std_space_uidx
  ON public.crm_completed_actions (organisation_id, space_id, action_key)
  WHERE action_key IS NOT NULL
    AND space_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.crm_completed_action_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  actor_id uuid REFERENCES public.crm_profiles(id) ON DELETE SET NULL,
  completed_action_id uuid REFERENCES public.crm_completed_actions(id) ON DELETE SET NULL,
  organisation_id uuid REFERENCES public.crm_organisations(id) ON DELETE SET NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  space_id uuid REFERENCES public.spaces(id) ON DELETE SET NULL,
  previous_value jsonb,
  new_value jsonb,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_completed_action_audits_org_idx
  ON public.crm_completed_action_audits (organisation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS crm_completed_action_audits_action_idx
  ON public.crm_completed_action_audits (completed_action_id);

GRANT ALL ON public.crm_completed_actions TO service_role;
GRANT ALL ON public.crm_completed_action_audits TO service_role;

ALTER TABLE public.crm_completed_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_completed_action_audits ENABLE ROW LEVEL SECURITY;
