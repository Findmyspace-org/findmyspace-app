-- Booking engine: owner snapshot is optional; organisation snapshot + actor audit.
-- Does not backfill organisation_id. Does not create organisation/access rows.
-- Booking lifecycle mutations are server-only (service-role APIs / RPC / PayFast / cron).
-- Authenticated has no bookings UPDATE privilege and no UPDATE RLS policy.
-- Public browse and renter isolation are unchanged.

ALTER TABLE public.bookings
  ALTER COLUMN owner_id DROP NOT NULL;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS organisation_id uuid NULL
    REFERENCES public.organisations(id) ON DELETE SET NULL;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS owner_response_by uuid NULL
    REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bookings_organisation_id_created_at_idx
  ON public.bookings (organisation_id, created_at DESC)
  WHERE organisation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bookings_owner_response_by_idx
  ON public.bookings (owner_response_by)
  WHERE owner_response_by IS NOT NULL;

COMMENT ON COLUMN public.bookings.owner_id IS
  'Legacy/historical host snapshot from spaces.owner_id at booking creation. Nullable for organisation-managed spaces. Not current permission.';
COMMENT ON COLUMN public.bookings.organisation_id IS
  'Snapshot of properties.organisation_id at booking creation. Not current permission.';
COMMENT ON COLUMN public.bookings.owner_response_by IS
  'Authenticated user who approved or declined. NULL for overlap auto-decline (system) and pre-066 rows.';

-- Hosts with organisation grants must read bookings they can manage.
-- Mutations are not granted to authenticated (legacy owner or organisation managers).
CREATE POLICY bookings_select_manage_space
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (public.user_can_manage_space(space_id));

CREATE POLICY booking_charges_select_manage
  ON public.booking_charges
  FOR SELECT
  TO authenticated
  USING (public.user_can_view_booking_commercial(booking_id));

CREATE POLICY booking_requirement_responses_select_manage
  ON public.booking_requirement_responses
  FOR SELECT
  TO authenticated
  USING (public.user_can_manage_booking(booking_id));

CREATE POLICY booking_messages_select_manage
  ON public.booking_messages
  FOR SELECT
  TO authenticated
  USING (public.user_can_manage_booking(booking_id));

-- No authenticated PostgREST UPDATE. Host approve/decline → host-response API.
-- Renter cancel → renter-cancel API. Admin cancel → admin API. PayFast/cron → service_role.
DROP POLICY IF EXISTS "Users can update own booking status" ON public.bookings;
DROP POLICY IF EXISTS bookings_update_legacy_owner ON public.bookings;

REVOKE UPDATE ON TABLE public.bookings FROM PUBLIC;
REVOKE UPDATE ON TABLE public.bookings FROM anon;
REVOKE UPDATE ON TABLE public.bookings FROM authenticated;
GRANT UPDATE ON TABLE public.bookings TO service_role;

-- Atomic host approve/decline: same-booking stale guard + space advisory lock + overlap auto-decline.
-- Auto-declined rows keep owner_response_by NULL (system/overlap), not the approving manager.
CREATE OR REPLACE FUNCTION public.apply_host_booking_response(
  p_booking_id uuid,
  p_actor_id uuid,
  p_action text,
  p_message text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  b public.bookings%ROWTYPE;
  now_ts timestamptz := now();
  competing uuid[] := ARRAY[]::uuid[];
  msg text := NULLIF(btrim(COALESCE(p_message, '')), '');
  overlap_msg text :=
    'Your booking request was declined because another overlapping booking was approved for this space. Thank you for your interest. Please try another date.';
BEGIN
  IF p_action NOT IN ('approve', 'decline') THEN
    RAISE EXCEPTION 'Invalid action.';
  END IF;

  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Missing actor.';
  END IF;

  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('booking-space:' || b.space_id::text)
  );

  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;

  IF b.status IS DISTINCT FROM 'pending_owner' AND b.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'This booking has already been responded to.';
  END IF;

  IF p_action = 'decline' THEN
    UPDATE public.bookings SET
      status = 'declined',
      payment_status = 'unpaid',
      owner_response_at = now_ts,
      owner_response_by = p_actor_id,
      owner_response_message = msg
    WHERE id = p_booking_id;
    RETURN jsonb_build_object('ok', true, 'competing_ids', competing);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings x
    WHERE x.space_id = b.space_id
      AND x.id <> b.id
      AND x.status IN (
        'approved',
        'accepted_awaiting_payment',
        'awaiting_payment',
        'paid_confirmed',
        'confirmed',
        'completed'
      )
      AND x.start_at < b.end_at
      AND x.end_at > b.start_at
  ) THEN
    RAISE EXCEPTION 'This booking overlaps with another accepted booking and cannot be approved.';
  END IF;

  UPDATE public.bookings SET
    status = 'accepted_awaiting_payment',
    payment_status = 'awaiting_payment',
    owner_response_at = now_ts,
    owner_response_by = p_actor_id,
    owner_response_message = msg
  WHERE id = p_booking_id;

  WITH declined AS (
    UPDATE public.bookings x SET
      status = 'declined',
      payment_status = 'unpaid',
      owner_response_at = now_ts,
      owner_response_by = NULL,
      owner_response_message = overlap_msg
    WHERE x.space_id = b.space_id
      AND x.id <> b.id
      AND x.status IN ('pending', 'pending_owner')
      AND x.start_at < b.end_at
      AND x.end_at > b.start_at
    RETURNING x.id
  )
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO competing FROM declined;

  RETURN jsonb_build_object('ok', true, 'competing_ids', competing);
END;
$$;

COMMENT ON FUNCTION public.apply_host_booking_response(uuid, uuid, text, text) IS
  'Service-role only. Host approve/decline after the API authenticates and checks canManageBooking. Actor is the session user, not a client-supplied UUID. Overlap auto-decline does not attribute owner_response_by.';

REVOKE ALL ON FUNCTION public.apply_host_booking_response(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_host_booking_response(uuid, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.apply_host_booking_response(uuid, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_host_booking_response(uuid, uuid, text, text) TO service_role;
