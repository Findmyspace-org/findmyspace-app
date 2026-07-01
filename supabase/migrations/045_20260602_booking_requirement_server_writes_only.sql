-- Close direct Supabase client bypass for booking requirement definitions and responses.
--
-- Audit (2026-06-02):
-- - space_booking_requirement_fields: RLS allowed owner/admin INSERT/UPDATE/DELETE via JWT;
--   contact-info validation only ran in PUT /api/spaces/[id]/booking-requirement-fields.
-- - booking_requirement_responses: RLS allowed renter INSERT on own bookings; validation only
--   in POST /api/bookings/request (service_role).
-- - bookings: migration 044 blocks JWT INSERT (REVOKE + trigger).
-- - booking-requirement-files bucket: private, no storage.objects policies — client upload denied
--   by default; uploads use service_role in booking-request-server.ts.

-- ---------------------------------------------------------------------------
-- Shared trigger: block JWT-backed writes (service_role API has auth.uid() IS NULL)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_server_role_writes_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'server_api_writes_only'
      USING HINT = 'This data must be written through the application API.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_server_role_writes_only() IS
  'Blocks authenticated/anon JWT writes; service_role API routes may mutate protected tables.';

-- ---------------------------------------------------------------------------
-- space_booking_requirement_fields: reads stay on client; writes via API only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS space_booking_requirement_fields_insert_manage
  ON public.space_booking_requirement_fields;
DROP POLICY IF EXISTS space_booking_requirement_fields_update_manage
  ON public.space_booking_requirement_fields;
DROP POLICY IF EXISTS space_booking_requirement_fields_delete_manage
  ON public.space_booking_requirement_fields;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.space_booking_requirement_fields FROM authenticated;

DROP TRIGGER IF EXISTS tr_space_booking_requirement_fields_server_only_insert
  ON public.space_booking_requirement_fields;
CREATE TRIGGER tr_space_booking_requirement_fields_server_only_insert
  BEFORE INSERT ON public.space_booking_requirement_fields
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_server_role_writes_only();

DROP TRIGGER IF EXISTS tr_space_booking_requirement_fields_server_only_update
  ON public.space_booking_requirement_fields;
CREATE TRIGGER tr_space_booking_requirement_fields_server_only_update
  BEFORE UPDATE ON public.space_booking_requirement_fields
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_server_role_writes_only();

DROP TRIGGER IF EXISTS tr_space_booking_requirement_fields_server_only_delete
  ON public.space_booking_requirement_fields;
CREATE TRIGGER tr_space_booking_requirement_fields_server_only_delete
  BEFORE DELETE ON public.space_booking_requirement_fields
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_server_role_writes_only();

COMMENT ON TABLE public.space_booking_requirement_fields IS
  'Owner-defined custom fields renters complete before submitting a booking request. '
  'Writes must use PUT /api/spaces/[id]/booking-requirement-fields (contact-info validated server-side).';

-- ---------------------------------------------------------------------------
-- booking_requirement_responses: reads for parties; inserts via booking API only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS booking_requirement_responses_insert_renter
  ON public.booking_requirement_responses;

REVOKE INSERT ON TABLE public.booking_requirement_responses FROM authenticated;

DROP TRIGGER IF EXISTS tr_booking_requirement_responses_server_only_insert
  ON public.booking_requirement_responses;
CREATE TRIGGER tr_booking_requirement_responses_server_only_insert
  BEFORE INSERT ON public.booking_requirement_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_server_role_writes_only();

COMMENT ON TABLE public.booking_requirement_responses IS
  'Renter answers to space_booking_requirement_fields at booking request time (snapshots preserved). '
  'Inserts must use POST /api/bookings/request (contact-info validated server-side).';

-- ---------------------------------------------------------------------------
-- bookings: confirm INSERT remains server-only (044); document remaining surface
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.bookings IS
  'Booking requests. INSERT is server-only (migration 044). '
  'Owners/renters may still UPDATE status fields via authenticated client where RLS/grants allow.';
