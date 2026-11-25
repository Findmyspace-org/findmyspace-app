-- Sequential availability cases against migration 081.
-- Parallel cases are launched by scripts/test-availability-phase1-db.sh.

CREATE OR REPLACE FUNCTION public.test_insert_booking(
  p_space uuid,
  p_status text,
  p_start timestamptz,
  p_end timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  new_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.bookings (id, space_id, status, payment_status, start_at, end_at)
  VALUES (new_id, p_space, p_status, 'unpaid', p_start, p_end);
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.test_signal(p_name text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM dblink_exec(
    'host=/var/run/postgresql dbname=availability_phase1 user=postgres',
    format(
      'INSERT INTO public.test_gate(name, ready) VALUES (%L, true)
       ON CONFLICT (name) DO UPDATE SET ready = true',
      p_name
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.test_hold_then_confirm(
  p_space uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_gate text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.lock_space_availability(p_space);
  PERFORM public.test_signal(p_gate);
  PERFORM pg_sleep(1);
  PERFORM public.test_insert_booking(
    p_space,
    'accepted_awaiting_payment',
    p_start,
    p_end
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.test_hold_then_approve(
  p_booking uuid,
  p_actor uuid,
  p_gate text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_space uuid;
BEGIN
  SELECT space_id INTO v_space FROM public.bookings WHERE id = p_booking;
  PERFORM public.lock_space_availability(v_space);
  PERFORM public.test_signal(p_gate);
  PERFORM pg_sleep(1);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM public.apply_host_booking_response(p_booking, p_actor, 'approve', NULL);
END;
$$;

DO $$
DECLARE
  space_back uuid := '10000000-0000-4000-8000-000000000001';
  space_night uuid := '10000000-0000-4000-8000-000000000002';
  space_block uuid := '10000000-0000-4000-8000-000000000003';
  space_pay uuid := '10000000-0000-4000-8000-000000000004';
  space_compete uuid := '10000000-0000-4000-8000-000000000005';
  actor uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  first_id uuid;
  second_id uuid;
  paid_id uuid;
  block_id uuid;
  pending_count integer;
  accepted_count integer;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  PERFORM public.test_insert_booking(
    space_back,
    'accepted_awaiting_payment',
    '2026-06-01 08:00+02',
    '2026-06-01 11:00+02'
  );
  PERFORM public.test_insert_booking(
    space_back,
    'pending_owner',
    '2026-06-01 11:00+02',
    '2026-06-01 12:00+02'
  );

  BEGIN
    PERFORM public.test_insert_booking(
      space_back,
      'pending_owner',
      '2026-06-01 10:00+02',
      '2026-06-01 10:30+02'
    );
    RAISE EXCEPTION 'overlapping request was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'space_unavailable:%' THEN
        RAISE;
      END IF;
      IF SQLERRM NOT LIKE '%Confirmed booking from 2026-06-01 08:00 to 2026-06-01 11:00 SAST.%' THEN
        RAISE EXCEPTION 'conflict message did not name the booking: %', SQLERRM;
      END IF;
  END;

  PERFORM public.test_insert_booking(
    space_night,
    'confirmed',
    '2026-06-02 23:00+02',
    '2026-06-03 01:00+02'
  );
  BEGIN
    PERFORM public.test_insert_booking(
      space_night,
      'pending_owner',
      '2026-06-03 00:30+02',
      '2026-06-03 02:00+02'
    );
    RAISE EXCEPTION 'cross-midnight overlap was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'space_unavailable:%' THEN
        RAISE;
      END IF;
  END;
  PERFORM public.test_insert_booking(
    space_night,
    'pending_owner',
    '2026-06-03 01:00+02',
    '2026-06-03 02:00+02'
  );

  PERFORM public.test_insert_booking(
    space_block,
    'paid_confirmed',
    '2026-06-04 08:00+02',
    '2026-06-04 15:00+02'
  );
  BEGIN
    INSERT INTO public.blocked_dates (space_id, start_at, end_at, reason)
    VALUES (
      space_block,
      '2026-06-04 14:00+02',
      '2026-06-04 16:00+02',
      'maintenance'
    );
    RAISE EXCEPTION 'block over a confirmed booking was saved';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'space_unavailable:%Confirmed booking%' THEN
        RAISE EXCEPTION 'block conflict was not explicit: %', SQLERRM;
      END IF;
  END;

  PERFORM public.test_insert_booking(
    space_block,
    'pending_owner',
    '2026-06-05 08:00+02',
    '2026-06-05 10:00+02'
  );
  INSERT INTO public.blocked_dates (space_id, start_at, end_at, reason)
  VALUES (
    space_block,
    '2026-06-05 08:00+02',
    '2026-06-05 10:00+02',
    'school day'
  )
  RETURNING id INTO block_id;

  PERFORM public.test_insert_booking(
    space_block,
    'pending_owner',
    '2026-06-06 08:00+02',
    '2026-06-06 09:00+02'
  );
  INSERT INTO public.blocked_dates (space_id, start_at, end_at, reason)
  VALUES (
    space_block,
    '2026-06-06 08:00+02',
    '2026-06-06 12:00+02',
    'assembly'
  );
  BEGIN
    PERFORM public.test_insert_booking(
      space_block,
      'pending',
      '2026-06-06 09:00+02',
      '2026-06-06 10:00+02'
    );
    RAISE EXCEPTION 'direct request over a block was saved';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Blocked period%' THEN
        RAISE EXCEPTION 'blocked request message was not explicit: %', SQLERRM;
      END IF;
  END;

  -- Pending that now overlaps the new June 5 block cannot be approved.
  second_id := (
    SELECT id FROM public.bookings
    WHERE space_id = space_block
      AND status = 'pending_owner'
      AND start_at = '2026-06-05 08:00+02'
  );
  BEGIN
    PERFORM public.apply_host_booking_response(second_id, actor, 'approve', NULL);
    RAISE EXCEPTION 'approval over a block succeeded';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Blocked period%' THEN
        RAISE EXCEPTION 'approval did not name the block: %', SQLERRM;
      END IF;
  END;
  IF (
    SELECT status FROM public.bookings WHERE id = second_id
  ) IS DISTINCT FROM 'pending_owner' THEN
    RAISE EXCEPTION 'failed approval changed the pending request';
  END IF;

  paid_id := public.test_insert_booking(
    space_pay,
    'accepted_awaiting_payment',
    '2026-07-01 09:00+02',
    '2026-07-01 10:00+02'
  );
  UPDATE public.bookings
  SET status = 'paid_confirmed', payment_status = 'paid'
  WHERE id = paid_id;
  IF (SELECT status FROM public.bookings WHERE id = paid_id) IS DISTINCT FROM 'paid_confirmed' THEN
    RAISE EXCEPTION 'payment update of an already reserved booking was rejected';
  END IF;

  UPDATE public.bookings
  SET status = 'expired', payment_status = 'unpaid'
  WHERE id = paid_id;
  PERFORM public.test_insert_booking(
    space_pay,
    'pending_owner',
    '2026-07-01 09:00+02',
    '2026-07-01 10:00+02'
  );

  first_id := public.test_insert_booking(
    space_compete,
    'pending_owner',
    '2026-08-01 14:00+02',
    '2026-08-01 16:00+02'
  );
  second_id := public.test_insert_booking(
    space_compete,
    'pending',
    '2026-08-01 15:00+02',
    '2026-08-01 17:00+02'
  );
  PERFORM public.apply_host_booking_response(first_id, actor, 'approve', 'approved');
  SELECT count(*) INTO pending_count
  FROM public.bookings
  WHERE space_id = space_compete AND status IN ('pending', 'pending_owner');
  SELECT count(*) INTO accepted_count
  FROM public.bookings
  WHERE space_id = space_compete AND status = 'accepted_awaiting_payment';
  IF pending_count <> 0 OR accepted_count <> 1 THEN
    RAISE EXCEPTION 'approval did not keep one reservation and decline the competing request';
  END IF;
  IF (SELECT status FROM public.bookings WHERE id = second_id) IS DISTINCT FROM 'declined' THEN
    RAISE EXCEPTION 'competing pending request was not declined';
  END IF;

  -- A long reservation rejects a shorter request inside it.
  PERFORM public.test_insert_booking(
    space_pay,
    'confirmed',
    '2026-07-10 00:00+02',
    '2026-10-10 00:00+02'
  );
  BEGIN
    PERFORM public.test_insert_booking(
      space_pay,
      'pending_owner',
      '2026-08-01 10:00+02',
      '2026-08-01 12:00+02'
    );
    RAISE EXCEPTION 'request inside a long reservation was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'space_unavailable:%' THEN
        RAISE;
      END IF;
  END;

  -- Moving a block onto a confirmed booking is rejected. The old row stays.
  BEGIN
    UPDATE public.blocked_dates
    SET start_at = '2026-06-04 14:00+02', end_at = '2026-06-04 16:00+02'
    WHERE id = block_id;
    RAISE EXCEPTION 'block modification over a confirmed booking succeeded';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Confirmed booking%' THEN
        RAISE EXCEPTION 'block modification did not name the booking: %', SQLERRM;
      END IF;
  END;
  IF (
    SELECT start_at FROM public.blocked_dates WHERE id = block_id
  ) IS DISTINCT FROM '2026-06-05 08:00+02'::timestamptz THEN
    RAISE EXCEPTION 'rejected block modification changed the saved period';
  END IF;

  -- After expiry, a later confirmed booking holds the slot. A late payment
  -- update cannot revive the expired row over that reservation.
  PERFORM public.test_insert_booking(
    space_pay,
    'confirmed',
    '2026-07-01 09:00+02',
    '2026-07-01 10:00+02'
  );
  BEGIN
    UPDATE public.bookings
    SET status = 'paid_confirmed', payment_status = 'paid'
    WHERE id = paid_id;
    RAISE EXCEPTION 'late payment revived an expired booking over a new reservation';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'space_unavailable:%' THEN
        RAISE;
      END IF;
  END;

  PERFORM public.delete_blocked_date(block_id, space_block);
END $$;
