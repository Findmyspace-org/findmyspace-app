-- Shared availability guard for booking requests, approvals, and blocked periods.
--
-- Uses the same per-space transaction lock as apply_host_booking_response:
--   pg_advisory_xact_lock(hashtext('booking-space:' || space_id))
-- The check and the write run in that transaction. A check in a separate
-- request is not sufficient.
--
-- Pending requests do not reserve a space and may overlap each other.
-- Reserving statuses are the existing approval list. Blocks are one-off
-- intervals. This migration does not change checkout, prices, ownership,
-- organisation membership, or existing rows.
--
-- Indefinite recurring restrictions are not created here. A later phase can
-- store them as rules and evaluate those rules inside this same lock, against
-- the finite set of future reserving bookings and the requested calendar
-- window. Do not generate unbounded occurrence rows.
--
-- blocked_dates has no CREATE TABLE in earlier migrations. If the table
-- already exists, its policies and grants are left untouched. Columns used
-- here are the ones the calendar already writes: id, space_id, start_at,
-- end_at, reason.

DO $$
DECLARE
  created boolean := false;
BEGIN
  IF to_regclass('public.bookings') IS NULL THEN
    RAISE EXCEPTION 'bookings is not present. Availability guards were not installed.';
  END IF;

  IF to_regclass('public.blocked_dates') IS NULL THEN
    CREATE TABLE public.blocked_dates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      space_id uuid NOT NULL,
      start_at timestamptz NOT NULL,
      end_at timestamptz NOT NULL,
      reason text,
      CONSTRAINT blocked_dates_end_after_start CHECK (end_at > start_at)
    );
    created := true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'blocked_dates' AND column_name = 'id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'blocked_dates' AND column_name = 'space_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'blocked_dates' AND column_name = 'start_at'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'blocked_dates' AND column_name = 'end_at'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'blocked_dates' AND column_name = 'reason'
  ) THEN
    RAISE EXCEPTION 'blocked_dates is missing id, space_id, start_at, end_at, or reason. Availability guards were not installed.';
  END IF;

  IF created THEN
    ALTER TABLE public.blocked_dates ENABLE ROW LEVEL SECURITY;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
       AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE $policy$
        CREATE POLICY blocked_dates_select_public
        ON public.blocked_dates
        FOR SELECT
        TO anon, authenticated
        USING (true)
      $policy$;
      EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON public.blocked_dates FROM anon, authenticated';
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.booking_status_reserves_availability(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_status IN (
    'approved',
    'accepted_awaiting_payment',
    'awaiting_payment',
    'paid_confirmed',
    'confirmed',
    'completed'
  );
$$;

CREATE OR REPLACE FUNCTION public.booking_status_is_pending(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_status IN ('pending', 'pending_owner');
$$;

CREATE OR REPLACE FUNCTION public.lock_space_availability(p_space_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_space_id IS NULL THEN
    RAISE EXCEPTION 'space_unavailable: A space is required.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('booking-space:' || p_space_id::text)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.space_availability_conflicts(
  p_space_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_ignore_booking_id uuid DEFAULT NULL,
  p_include_blocks boolean DEFAULT true
)
RETURNS TABLE (
  conflict_kind text,
  conflict_id uuid,
  conflict_start timestamptz,
  conflict_end timestamptz,
  conflict_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    'booking'::text,
    x.id,
    x.start_at,
    x.end_at,
    x.status
  FROM public.bookings x
  WHERE x.space_id = p_space_id
    AND (p_ignore_booking_id IS NULL OR x.id <> p_ignore_booking_id)
    AND public.booking_status_reserves_availability(x.status)
    AND x.start_at < p_end
    AND x.end_at > p_start
  UNION ALL
  SELECT
    'block'::text,
    d.id,
    d.start_at,
    d.end_at,
    NULL::text
  FROM public.blocked_dates d
  WHERE p_include_blocks
    AND d.space_id = p_space_id
    AND d.start_at < p_end
    AND d.end_at > p_start;
$$;

CREATE OR REPLACE FUNCTION public.assert_space_interval_available(
  p_space_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_ignore_booking_id uuid DEFAULT NULL,
  p_include_blocks boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  r record;
  parts text[] := ARRAY[]::text[];
  n integer := 0;
  when_label text;
BEGIN
  IF p_space_id IS NULL OR p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION 'space_unavailable: A start and end are required.';
  END IF;

  IF p_end <= p_start THEN
    RAISE EXCEPTION 'space_unavailable: The end must be after the start.';
  END IF;

  PERFORM public.lock_space_availability(p_space_id);

  FOR r IN
    SELECT *
    FROM public.space_availability_conflicts(
      p_space_id,
      p_start,
      p_end,
      p_ignore_booking_id,
      p_include_blocks
    )
  LOOP
    n := n + 1;
    IF n <= 8 THEN
      when_label := to_char(
        r.conflict_start AT TIME ZONE 'Africa/Johannesburg',
        'YYYY-MM-DD HH24:MI'
      ) || ' to ' || to_char(
        r.conflict_end AT TIME ZONE 'Africa/Johannesburg',
        'YYYY-MM-DD HH24:MI'
      ) || ' SAST';
      IF r.conflict_kind = 'booking' THEN
        parts := parts || ('Confirmed booking from ' || when_label || '.');
      ELSE
        parts := parts || ('Blocked period from ' || when_label || '.');
      END IF;
    END IF;
  END LOOP;

  IF n = 0 THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'space_unavailable: Those dates or times are not available. %',
    array_to_string(parts, ' ');
END;
$$;

CREATE OR REPLACE FUNCTION public.bookings_guard_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.start_at IS NULL OR NEW.end_at IS NULL OR NEW.space_id IS NULL THEN
    RAISE EXCEPTION 'space_unavailable: A start and end are required.';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.space_id IS NOT DISTINCT FROM NEW.space_id
     AND OLD.start_at IS NOT DISTINCT FROM NEW.start_at
     AND OLD.end_at IS NOT DISTINCT FROM NEW.end_at
     AND (
       (
         public.booking_status_reserves_availability(OLD.status)
         AND public.booking_status_reserves_availability(NEW.status)
       )
       OR (
         public.booking_status_is_pending(OLD.status)
         AND public.booking_status_is_pending(NEW.status)
       )
     )
  THEN
    RETURN NEW;
  END IF;

  IF NOT (
    public.booking_status_reserves_availability(NEW.status)
    OR public.booking_status_is_pending(NEW.status)
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM public.assert_space_interval_available(
    NEW.space_id,
    NEW.start_at,
    NEW.end_at,
    NEW.id,
    true
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.blocked_dates_guard_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_space uuid;
  target_start timestamptz;
  target_end timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.lock_space_availability(OLD.space_id);
    RETURN OLD;
  END IF;

  target_space := NEW.space_id;
  target_start := NEW.start_at;
  target_end := NEW.end_at;

  -- Blocks may overlap other blocks. They may not overlap a reserving booking.
  PERFORM public.assert_space_interval_available(
    target_space,
    target_start,
    target_end,
    NULL,
    false
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_blocked_date(
  p_space_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  inserted public.blocked_dates%ROWTYPE;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  PERFORM public.assert_space_interval_available(
    p_space_id,
    p_start,
    p_end,
    NULL,
    false
  );

  INSERT INTO public.blocked_dates (space_id, start_at, end_at, reason)
  VALUES (p_space_id, p_start, p_end, NULLIF(btrim(COALESCE(p_reason, '')), ''))
  RETURNING * INTO inserted;

  RETURN jsonb_build_object(
    'id', inserted.id,
    'space_id', inserted.space_id,
    'start_at', inserted.start_at,
    'end_at', inserted.end_at,
    'reason', inserted.reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_blocked_date(
  p_id uuid,
  p_space_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  existing_space uuid;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT d.space_id INTO existing_space
  FROM public.blocked_dates d
  WHERE d.id = p_id;

  IF existing_space IS NULL OR existing_space IS DISTINCT FROM p_space_id THEN
    RAISE EXCEPTION 'Blocked period not found.';
  END IF;

  PERFORM public.lock_space_availability(existing_space);

  SELECT d.space_id INTO existing_space
  FROM public.blocked_dates d
  WHERE d.id = p_id
    AND d.space_id = p_space_id
  FOR UPDATE;

  IF existing_space IS NULL THEN
    RAISE EXCEPTION 'Blocked period not found.';
  END IF;

  DELETE FROM public.blocked_dates WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'id', p_id);
END;
$$;

-- Replaces the migration 066 function. Decline is unchanged. Approve now
-- revalidates blocks and reserving bookings inside the existing lock.
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

  PERFORM public.assert_space_interval_available(
    b.space_id,
    b.start_at,
    b.end_at,
    b.id,
    true
  );

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
  'Service-role only. Host approve/decline after the API authenticates and checks canManageBooking. Approve rechecks reserving bookings and blocked periods inside the per-space advisory lock. Pending requests may still overlap until one is accepted.';

CREATE INDEX IF NOT EXISTS blocked_dates_space_range_idx
  ON public.blocked_dates (space_id, start_at, end_at);

DROP TRIGGER IF EXISTS bookings_guard_availability ON public.bookings;
CREATE TRIGGER bookings_guard_availability
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.bookings_guard_availability();

DROP TRIGGER IF EXISTS blocked_dates_guard_availability ON public.blocked_dates;
CREATE TRIGGER blocked_dates_guard_availability
  BEFORE INSERT OR UPDATE OR DELETE ON public.blocked_dates
  FOR EACH ROW
  EXECUTE FUNCTION public.blocked_dates_guard_availability();

REVOKE ALL ON FUNCTION public.booking_status_reserves_availability(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.booking_status_is_pending(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lock_space_availability(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.space_availability_conflicts(uuid, timestamptz, timestamptz, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_space_interval_available(uuid, timestamptz, timestamptz, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bookings_guard_availability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.blocked_dates_guard_availability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_blocked_date(uuid, timestamptz, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_blocked_date(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_host_booking_response(uuid, uuid, text, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.lock_space_availability(uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.space_availability_conflicts(uuid, timestamptz, timestamptz, uuid, boolean) TO service_role;
    GRANT EXECUTE ON FUNCTION public.assert_space_interval_available(uuid, timestamptz, timestamptz, uuid, boolean) TO service_role;
    GRANT EXECUTE ON FUNCTION public.bookings_guard_availability() TO service_role;
    GRANT EXECUTE ON FUNCTION public.blocked_dates_guard_availability() TO service_role;
    GRANT EXECUTE ON FUNCTION public.insert_blocked_date(uuid, timestamptz, timestamptz, text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.delete_blocked_date(uuid, uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.apply_host_booking_response(uuid, uuid, text, text) TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.bookings_guard_availability() TO authenticated;
    GRANT EXECUTE ON FUNCTION public.blocked_dates_guard_availability() TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.insert_blocked_date(uuid, timestamptz, timestamptz, text) FROM anon;
    REVOKE ALL ON FUNCTION public.delete_blocked_date(uuid, uuid) FROM anon;
    REVOKE ALL ON FUNCTION public.apply_host_booking_response(uuid, uuid, text, text) FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.insert_blocked_date(uuid, timestamptz, timestamptz, text) FROM authenticated;
    REVOKE ALL ON FUNCTION public.delete_blocked_date(uuid, uuid) FROM authenticated;
    REVOKE ALL ON FUNCTION public.apply_host_booking_response(uuid, uuid, text, text) FROM authenticated;
  END IF;
END $$;
