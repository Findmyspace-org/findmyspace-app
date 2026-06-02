-- Allow active Spacers to assign tasks to any active CRM profile
-- when they can access the related organisation.
-- Organisation ownership (crm_organisations.assigned_to) remains unchanged.

-- crm_profiles: Spacers need a visible assignee roster.
DROP POLICY IF EXISTS crm_profiles_select ON public.crm_profiles;
CREATE POLICY crm_profiles_select ON public.crm_profiles
  FOR SELECT TO authenticated
  USING (
    public.crm_is_admin()
    OR id = auth.uid()
    OR (
      public.crm_user_role() IN ('admin', 'spacer')
      AND active = true
    )
  );

-- crm_tasks: allow assignment to any active CRM profile for accessible orgs.
DROP POLICY IF EXISTS crm_tasks_select ON public.crm_tasks;
CREATE POLICY crm_tasks_select ON public.crm_tasks
  FOR SELECT TO authenticated
  USING (
    public.crm_is_admin()
    OR owner_id = auth.uid()
    OR (
      public.crm_user_role() = 'spacer'
      AND organisation_id IS NOT NULL
      AND public.crm_can_access_org(organisation_id)
    )
  );

DROP POLICY IF EXISTS crm_tasks_insert ON public.crm_tasks;
CREATE POLICY crm_tasks_insert ON public.crm_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.crm_profiles p
      WHERE p.id = owner_id
        AND p.active = true
    )
    AND (
      public.crm_is_admin()
      OR (
        public.crm_user_role() = 'spacer'
        AND organisation_id IS NOT NULL
        AND public.crm_can_access_org(organisation_id)
      )
    )
  );

DROP POLICY IF EXISTS crm_tasks_update ON public.crm_tasks;
CREATE POLICY crm_tasks_update ON public.crm_tasks
  FOR UPDATE TO authenticated
  USING (
    public.crm_is_admin()
    OR owner_id = auth.uid()
    OR (
      public.crm_user_role() = 'spacer'
      AND organisation_id IS NOT NULL
      AND public.crm_can_access_org(organisation_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.crm_profiles p
      WHERE p.id = owner_id
        AND p.active = true
    )
    AND (
      public.crm_is_admin()
      OR (
        public.crm_user_role() = 'spacer'
        AND (
          owner_id = auth.uid()
          OR (
            organisation_id IS NOT NULL
            AND public.crm_can_access_org(organisation_id)
          )
        )
      )
    )
  );
