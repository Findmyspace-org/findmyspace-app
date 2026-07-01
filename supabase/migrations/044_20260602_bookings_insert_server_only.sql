-- Restrict booking creation to service-role server routes (POST /api/bookings/request).
--
-- Audit (2026-06-02): public.bookings has no INSERT RLS policies in migrations.
-- Supabase default grants allow authenticated INSERT; QA confirmed direct client INSERT
-- was possible (see migration 017 active-space trigger tests). Custom requirement
-- validation was API-only; property terms had a BEFORE INSERT trigger but only when
-- terms are required — spaces without terms could still be bypassed.

REVOKE INSERT ON TABLE public.bookings FROM authenticated;
REVOKE INSERT ON TABLE public.bookings FROM anon;

GRANT INSERT ON TABLE public.bookings TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_booking_insert_server_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service-role clients (API routes) have no JWT subject; renter JWT clients do.
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'bookings_insert_server_only'
      USING HINT = 'Booking requests must be created through the application booking API.';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_booking_insert_server_only() IS
  'Blocks authenticated/anon JWT INSERT on bookings; only service_role API paths may create bookings.';

DROP TRIGGER IF EXISTS tr_bookings_insert_server_only ON public.bookings;
CREATE TRIGGER tr_bookings_insert_server_only
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_booking_insert_server_only();
