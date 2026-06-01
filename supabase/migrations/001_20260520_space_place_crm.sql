-- The Space Place — internal relationship hub (CRM tables + RLS)

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.crm_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  phone text,
  role text NOT NULL DEFAULT 'spacer' CHECK (role IN ('admin', 'spacer')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text,
  status text NOT NULL DEFAULT 'new',
  assigned_to uuid REFERENCES public.crm_profiles(id) ON DELETE SET NULL,
  pipeline_stage text NOT NULL DEFAULT 'prospect' CHECK (
    pipeline_stage IN (
      'prospect', 'first_contact', 'follow_up', 'in_progress',
      'signed_up', 'listed', 'closed_lost'
    )
  ),
  website text,
  address text,
  notes text,
  signed_up_at timestamptz,
  listed_at timestamptz,
  closed_at timestamptz,
  lost_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_organisations_closed_lost_reason CHECK (
    pipeline_stage <> 'closed_lost' OR (lost_reason IS NOT NULL AND btrim(lost_reason) <> '')
  )
);

CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.crm_organisations(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES public.crm_profiles(id) ON DELETE SET NULL,
  first_name text,
  last_name text,
  full_name text,
  role text,
  email text,
  phone text,
  whatsapp text,
  status text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.crm_organisations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  type text NOT NULL,
  summary text,
  outcome text,
  direction text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.crm_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid REFERENCES public.crm_organisations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  due_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  owner_id uuid REFERENCES public.crm_profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  raw_content text,
  parsed_json jsonb,
  processed boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.crm_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS crm_organisations_assigned_to_idx ON public.crm_organisations(assigned_to);
CREATE INDEX IF NOT EXISTS crm_organisations_pipeline_stage_idx ON public.crm_organisations(pipeline_stage);
CREATE INDEX IF NOT EXISTS crm_contacts_organisation_id_idx ON public.crm_contacts(organisation_id);
CREATE INDEX IF NOT EXISTS crm_contacts_assigned_to_idx ON public.crm_contacts(assigned_to);
CREATE INDEX IF NOT EXISTS crm_engagements_organisation_id_idx ON public.crm_engagements(organisation_id);
CREATE INDEX IF NOT EXISTS crm_engagements_created_by_idx ON public.crm_engagements(created_by);
CREATE INDEX IF NOT EXISTS crm_engagements_occurred_at_idx ON public.crm_engagements(occurred_at DESC);
CREATE INDEX IF NOT EXISTS crm_tasks_owner_id_idx ON public.crm_tasks(owner_id);
CREATE INDEX IF NOT EXISTS crm_tasks_due_date_idx ON public.crm_tasks(due_date);
CREATE INDEX IF NOT EXISTS crm_tasks_status_idx ON public.crm_tasks(status);

-- ---------------------------------------------------------------------------
-- RLS helper functions (after tables exist)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.crm_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.crm_profiles WHERE id = auth.uid() AND active = true;
$$;

CREATE OR REPLACE FUNCTION public.crm_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.crm_user_role() = 'admin';
$$;

CREATE OR REPLACE FUNCTION public.crm_can_access_org(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.crm_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.crm_organisations o
      WHERE o.id = org_id AND o.assigned_to = auth.uid()
    );
$$;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.crm_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_profiles_updated_at ON public.crm_profiles;
CREATE TRIGGER crm_profiles_updated_at
  BEFORE UPDATE ON public.crm_profiles
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

DROP TRIGGER IF EXISTS crm_organisations_updated_at ON public.crm_organisations;
CREATE TRIGGER crm_organisations_updated_at
  BEFORE UPDATE ON public.crm_organisations
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

DROP TRIGGER IF EXISTS crm_contacts_updated_at ON public.crm_contacts;
CREATE TRIGGER crm_contacts_updated_at
  BEFORE UPDATE ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

DROP TRIGGER IF EXISTS crm_tasks_updated_at ON public.crm_tasks;
CREATE TRIGGER crm_tasks_updated_at
  BEFORE UPDATE ON public.crm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

-- ---------------------------------------------------------------------------
-- Pipeline stage side effects
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.crm_organisations_pipeline_stage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.pipeline_stage IS DISTINCT FROM OLD.pipeline_stage THEN
    IF NEW.pipeline_stage = 'signed_up' AND NEW.signed_up_at IS NULL THEN
      NEW.signed_up_at = now();
    ELSIF NEW.pipeline_stage = 'listed' AND NEW.listed_at IS NULL THEN
      NEW.listed_at = now();
    ELSIF NEW.pipeline_stage = 'closed_lost' THEN
      NEW.closed_at = COALESCE(NEW.closed_at, now());
      IF NEW.lost_reason IS NULL OR btrim(NEW.lost_reason) = '' THEN
        RAISE EXCEPTION 'lost_reason is required when pipeline stage is closed_lost';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_organisations_pipeline_stage_trg ON public.crm_organisations;
CREATE TRIGGER crm_organisations_pipeline_stage_trg
  BEFORE INSERT OR UPDATE OF pipeline_stage, lost_reason ON public.crm_organisations
  FOR EACH ROW EXECUTE FUNCTION public.crm_organisations_pipeline_stage();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.crm_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_inbox ENABLE ROW LEVEL SECURITY;

-- crm_profiles
DROP POLICY IF EXISTS crm_profiles_select ON public.crm_profiles;
CREATE POLICY crm_profiles_select ON public.crm_profiles
  FOR SELECT TO authenticated
  USING (public.crm_is_admin() OR id = auth.uid());

DROP POLICY IF EXISTS crm_profiles_insert_admin ON public.crm_profiles;
CREATE POLICY crm_profiles_insert_admin ON public.crm_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.crm_is_admin()
    OR (
      id = auth.uid()
      AND role = 'spacer'
    )
    OR (
      id = auth.uid()
      AND role = 'admin'
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'
      )
    )
  );

DROP POLICY IF EXISTS crm_profiles_update ON public.crm_profiles;
CREATE POLICY crm_profiles_update ON public.crm_profiles
  FOR UPDATE TO authenticated
  USING (public.crm_is_admin() OR id = auth.uid())
  WITH CHECK (public.crm_is_admin() OR id = auth.uid());

-- crm_organisations
DROP POLICY IF EXISTS crm_organisations_select ON public.crm_organisations;
CREATE POLICY crm_organisations_select ON public.crm_organisations
  FOR SELECT TO authenticated
  USING (public.crm_is_admin() OR assigned_to = auth.uid());

DROP POLICY IF EXISTS crm_organisations_insert ON public.crm_organisations;
CREATE POLICY crm_organisations_insert ON public.crm_organisations
  FOR INSERT TO authenticated
  WITH CHECK (public.crm_is_admin());

DROP POLICY IF EXISTS crm_organisations_update ON public.crm_organisations;
CREATE POLICY crm_organisations_update ON public.crm_organisations
  FOR UPDATE TO authenticated
  USING (public.crm_is_admin() OR assigned_to = auth.uid())
  WITH CHECK (public.crm_is_admin() OR assigned_to = auth.uid());

DROP POLICY IF EXISTS crm_organisations_delete ON public.crm_organisations;
CREATE POLICY crm_organisations_delete ON public.crm_organisations
  FOR DELETE TO authenticated
  USING (public.crm_is_admin());

-- crm_contacts
DROP POLICY IF EXISTS crm_contacts_select ON public.crm_contacts;
CREATE POLICY crm_contacts_select ON public.crm_contacts
  FOR SELECT TO authenticated
  USING (
    public.crm_is_admin()
    OR assigned_to = auth.uid()
    OR public.crm_can_access_org(organisation_id)
  );

DROP POLICY IF EXISTS crm_contacts_insert ON public.crm_contacts;
CREATE POLICY crm_contacts_insert ON public.crm_contacts
  FOR INSERT TO authenticated
  WITH CHECK (public.crm_is_admin() OR public.crm_can_access_org(organisation_id));

DROP POLICY IF EXISTS crm_contacts_update ON public.crm_contacts;
CREATE POLICY crm_contacts_update ON public.crm_contacts
  FOR UPDATE TO authenticated
  USING (
    public.crm_is_admin()
    OR assigned_to = auth.uid()
    OR public.crm_can_access_org(organisation_id)
  )
  WITH CHECK (
    public.crm_is_admin()
    OR assigned_to = auth.uid()
    OR public.crm_can_access_org(organisation_id)
  );

DROP POLICY IF EXISTS crm_contacts_delete ON public.crm_contacts;
CREATE POLICY crm_contacts_delete ON public.crm_contacts
  FOR DELETE TO authenticated
  USING (public.crm_is_admin());

-- crm_engagements
DROP POLICY IF EXISTS crm_engagements_select ON public.crm_engagements;
CREATE POLICY crm_engagements_select ON public.crm_engagements
  FOR SELECT TO authenticated
  USING (
    public.crm_is_admin()
    OR created_by = auth.uid()
    OR public.crm_can_access_org(organisation_id)
  );

DROP POLICY IF EXISTS crm_engagements_insert ON public.crm_engagements;
CREATE POLICY crm_engagements_insert ON public.crm_engagements
  FOR INSERT TO authenticated
  WITH CHECK (
    public.crm_is_admin()
    OR public.crm_can_access_org(organisation_id)
  );

DROP POLICY IF EXISTS crm_engagements_update ON public.crm_engagements;
CREATE POLICY crm_engagements_update ON public.crm_engagements
  FOR UPDATE TO authenticated
  USING (public.crm_is_admin() OR created_by = auth.uid())
  WITH CHECK (public.crm_is_admin() OR created_by = auth.uid());

-- crm_tasks
DROP POLICY IF EXISTS crm_tasks_select ON public.crm_tasks;
CREATE POLICY crm_tasks_select ON public.crm_tasks
  FOR SELECT TO authenticated
  USING (public.crm_is_admin() OR owner_id = auth.uid());

DROP POLICY IF EXISTS crm_tasks_insert ON public.crm_tasks;
CREATE POLICY crm_tasks_insert ON public.crm_tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.crm_is_admin() OR owner_id = auth.uid());

DROP POLICY IF EXISTS crm_tasks_update ON public.crm_tasks;
CREATE POLICY crm_tasks_update ON public.crm_tasks
  FOR UPDATE TO authenticated
  USING (public.crm_is_admin() OR owner_id = auth.uid())
  WITH CHECK (public.crm_is_admin() OR owner_id = auth.uid());

DROP POLICY IF EXISTS crm_tasks_delete ON public.crm_tasks;
CREATE POLICY crm_tasks_delete ON public.crm_tasks
  FOR DELETE TO authenticated
  USING (public.crm_is_admin());

-- crm_inbox
DROP POLICY IF EXISTS crm_inbox_select ON public.crm_inbox;
CREATE POLICY crm_inbox_select ON public.crm_inbox
  FOR SELECT TO authenticated
  USING (public.crm_is_admin());

DROP POLICY IF EXISTS crm_inbox_insert ON public.crm_inbox;
CREATE POLICY crm_inbox_insert ON public.crm_inbox
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR public.crm_is_admin());

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_organisations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.crm_engagements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_tasks TO authenticated;
GRANT SELECT, INSERT ON public.crm_inbox TO authenticated;
