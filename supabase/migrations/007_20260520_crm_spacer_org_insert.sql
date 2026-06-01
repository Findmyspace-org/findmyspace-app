-- Spacers may create organisations assigned to themselves (client-side crmDb inserts).

DROP POLICY IF EXISTS crm_organisations_insert ON public.crm_organisations;
CREATE POLICY crm_organisations_insert ON public.crm_organisations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.crm_is_admin()
    OR (
      assigned_to = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM public.crm_profiles p
        WHERE p.id = auth.uid()
          AND p.active = true
          AND p.role = 'spacer'
      )
    )
  );
