-- Ensure authenticated users can read their own profiles row under RLS.
-- profiles_select_own (20260422120000) allows row access; table-level GRANT was
-- only explicit for service_role (20260420130100). Without SELECT grant, client
-- profile reads fail silently and admin UI treated platform admins as non-admin.

GRANT SELECT ON TABLE public.profiles TO authenticated;
