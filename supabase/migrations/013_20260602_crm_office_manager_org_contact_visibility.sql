-- Office managers (and admins) can view all organisations and contacts like admins.

CREATE OR REPLACE FUNCTION public.crm_can_access_org(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.crm_is_task_manager()
    OR EXISTS (
      SELECT 1 FROM public.crm_organisations o
      WHERE o.id = org_id AND o.assigned_to = auth.uid()
    );
$$;

-- crm_organisations
DROP POLICY IF EXISTS crm_organisations_select ON public.crm_organisations;
CREATE POLICY crm_organisations_select ON public.crm_organisations
  FOR SELECT TO authenticated
  USING (public.crm_is_task_manager() OR assigned_to = auth.uid());

DROP POLICY IF EXISTS crm_organisations_insert ON public.crm_organisations;
CREATE POLICY crm_organisations_insert ON public.crm_organisations
  FOR INSERT TO authenticated
  WITH CHECK (public.crm_is_task_manager());

DROP POLICY IF EXISTS crm_organisations_update ON public.crm_organisations;
CREATE POLICY crm_organisations_update ON public.crm_organisations
  FOR UPDATE TO authenticated
  USING (public.crm_is_task_manager() OR assigned_to = auth.uid())
  WITH CHECK (public.crm_is_task_manager() OR assigned_to = auth.uid());

-- crm_contacts
DROP POLICY IF EXISTS crm_contacts_select ON public.crm_contacts;
CREATE POLICY crm_contacts_select ON public.crm_contacts
  FOR SELECT TO authenticated
  USING (
    public.crm_is_task_manager()
    OR assigned_to = auth.uid()
    OR public.crm_can_access_org(organisation_id)
  );

DROP POLICY IF EXISTS crm_contacts_insert ON public.crm_contacts;
CREATE POLICY crm_contacts_insert ON public.crm_contacts
  FOR INSERT TO authenticated
  WITH CHECK (public.crm_is_task_manager() OR public.crm_can_access_org(organisation_id));

DROP POLICY IF EXISTS crm_contacts_update ON public.crm_contacts;
CREATE POLICY crm_contacts_update ON public.crm_contacts
  FOR UPDATE TO authenticated
  USING (
    public.crm_is_task_manager()
    OR assigned_to = auth.uid()
    OR public.crm_can_access_org(organisation_id)
  )
  WITH CHECK (
    public.crm_is_task_manager()
    OR assigned_to = auth.uid()
    OR public.crm_can_access_org(organisation_id)
  );

-- crm_engagements (read/write across orgs for task managers)
DROP POLICY IF EXISTS crm_engagements_select ON public.crm_engagements;
CREATE POLICY crm_engagements_select ON public.crm_engagements
  FOR SELECT TO authenticated
  USING (
    public.crm_is_task_manager()
    OR created_by = auth.uid()
    OR public.crm_can_access_org(organisation_id)
  );

DROP POLICY IF EXISTS crm_engagements_insert ON public.crm_engagements;
CREATE POLICY crm_engagements_insert ON public.crm_engagements
  FOR INSERT TO authenticated
  WITH CHECK (
    public.crm_is_task_manager()
    OR public.crm_can_access_org(organisation_id)
  );

DROP POLICY IF EXISTS crm_engagements_update ON public.crm_engagements;
CREATE POLICY crm_engagements_update ON public.crm_engagements
  FOR UPDATE TO authenticated
  USING (public.crm_is_task_manager() OR created_by = auth.uid())
  WITH CHECK (public.crm_is_task_manager() OR created_by = auth.uid());
