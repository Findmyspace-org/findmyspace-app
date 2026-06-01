-- Server-side Space Place API routes use PostgREST with the service_role key.
-- Without explicit GRANTs, inserts return: permission denied for table crm_organisations.

GRANT ALL ON public.crm_profiles TO service_role;
GRANT ALL ON public.crm_organisations TO service_role;
GRANT ALL ON public.crm_contacts TO service_role;
GRANT ALL ON public.crm_engagements TO service_role;
GRANT ALL ON public.crm_tasks TO service_role;
GRANT ALL ON public.crm_inbox TO service_role;
GRANT ALL ON public.crm_spacer_invites TO service_role;
