-- Restrict expire_unpaid_bookings() to service_role.
--
-- Live signature (unchanged):
--   public.expire_unpaid_bookings()
--   RETURNS TABLE(id uuid)
--   LANGUAGE plpgsql
--   SECURITY DEFINER
--   SET search_path TO 'public'
--
-- Business rules stay in the existing function body (24h unpaid accepted
-- bookings → expired + unpaid). This migration only tightens EXECUTE grants.
-- Postgres default PUBLIC EXECUTE plus SECURITY DEFINER allowed anon and
-- authenticated to invoke the RPC directly.

REVOKE ALL ON FUNCTION public.expire_unpaid_bookings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_unpaid_bookings() FROM anon;
REVOKE ALL ON FUNCTION public.expire_unpaid_bookings() FROM authenticated;

GRANT EXECUTE ON FUNCTION public.expire_unpaid_bookings() TO service_role;

COMMENT ON FUNCTION public.expire_unpaid_bookings() IS
  'Marks accepted_awaiting_payment bookings as expired after 24h without payment; returns affected booking ids. EXECUTE is restricted to service_role.';
