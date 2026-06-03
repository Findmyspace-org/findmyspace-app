-- Office manager role and task-manager permissions (admin + office_manager).

ALTER TABLE public.crm_profiles
  DROP CONSTRAINT IF EXISTS crm_profiles_role_check;

ALTER TABLE public.crm_profiles
  ADD CONSTRAINT crm_profiles_role_check
  CHECK (role IN ('admin', 'spacer', 'office_manager'));

CREATE OR REPLACE FUNCTION public.crm_is_task_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.crm_user_role() IN ('admin', 'office_manager');
$$;

DROP POLICY IF EXISTS crm_profiles_select ON public.crm_profiles;
CREATE POLICY crm_profiles_select ON public.crm_profiles
  FOR SELECT TO authenticated
  USING (
    public.crm_is_task_manager()
    OR id = auth.uid()
    OR (
      public.crm_user_role() IN ('admin', 'spacer', 'office_manager')
      AND active = true
    )
  );

DROP POLICY IF EXISTS crm_tasks_select ON public.crm_tasks;
CREATE POLICY crm_tasks_select ON public.crm_tasks
  FOR SELECT TO authenticated
  USING (
    public.crm_is_task_manager()
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
      public.crm_is_task_manager()
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
    public.crm_is_task_manager()
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
      public.crm_is_task_manager()
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
