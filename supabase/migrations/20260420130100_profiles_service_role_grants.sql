-- Server-side admin routes use PostgREST with the service_role key. Some projects
-- omit default table GRANTs on legacy/dashboard-created tables; without UPDATE on
-- public.profiles for service_role, PATCH returns: permission denied for table profiles.
-- This does not alter RLS policies or privileges for authenticated/anon users.

GRANT SELECT, UPDATE ON public.profiles TO service_role;
