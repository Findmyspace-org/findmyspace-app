-- Phase 4 corrections and Phase 5 checks on a disposable database.
DO $$
DECLARE
  space uuid := '10000000-0000-4000-8000-000000000085';
  renter uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  host uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  request_id uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  created jsonb;
  parent_id uuid;
  sessions integer;
  moved text;
  kept text;
  change_id uuid;
  rule_id uuid;
  exception_id uuid;
  opened integer;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  INSERT INTO public.spaces (id, status, public_listing_mode, recurring_bookings_enabled, price_per_hour)
  VALUES (space, 'active', 'live', true, 250);

  created := public.create_recurring_booking(
    jsonb_build_object(
      'space_id', space, 'renter_id', renter,
      'start_at', '2027-01-04 14:00+02', 'end_at', '2027-03-22 16:00+02',
      'total_price', 6000, 'unit_price', 250, 'client_request_id', request_id
    ),
    'weekly', ARRAY[1]::smallint[], '14:00', '16:00', '2027-01-04', '2027-03-22', ARRAY[]::date[]
  );
  parent_id := (created->>'id')::uuid;
  IF created->>'reused' <> 'false' THEN
    RAISE EXCEPTION 'first create was treated as a retry';
  END IF;
  IF (SELECT count(*) FROM public.booking_charges WHERE booking_id = parent_id) <> 1 THEN
    RAISE EXCEPTION 'the charge was not created with the series';
  END IF;
  SELECT count(*) INTO sessions FROM public.booking_occurrences WHERE booking_id = parent_id AND NOT excluded;
  IF sessions <> 12 THEN
    RAISE EXCEPTION 'expected 12 sessions, got %', sessions;
  END IF;

  created := public.create_recurring_booking(
    jsonb_build_object(
      'space_id', space, 'renter_id', renter,
      'start_at', '2027-01-04 14:00+02', 'end_at', '2027-03-22 16:00+02',
      'total_price', 6000, 'unit_price', 250, 'client_request_id', request_id
    ),
    'weekly', ARRAY[1]::smallint[], '14:00', '16:00', '2027-01-04', '2027-03-22', ARRAY[]::date[]
  );
  IF (created->>'id')::uuid <> parent_id OR created->>'reused' <> 'true' THEN
    RAISE EXCEPTION 'retry created another booking';
  END IF;
  IF (SELECT count(*) FROM public.bookings WHERE client_request_id = request_id) <> 1 THEN
    RAISE EXCEPTION 'duplicate submission left more than one booking';
  END IF;

  BEGIN
    PERFORM public.create_recurring_booking(
      jsonb_build_object(
        'space_id', space, 'renter_id', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        'start_at', '2027-02-01 14:00+02', 'end_at', '2027-02-08 16:00+02',
        'total_price', 1000, 'unit_price', 250,
        'client_request_id', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
      ),
      'weekly', ARRAY[1]::smallint[], '14:00', '16:00', '2027-02-01', '2027-02-08', ARRAY[]::date[]
    );
    -- The first series is pending, so it does not reserve 1 February.
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'pending series unexpectedly blocked another request: %', SQLERRM;
  END;
  IF (SELECT count(*) FROM public.booking_series) < 2 THEN
    RAISE EXCEPTION 'a non-reserving overlap was rejected';
  END IF;

  PERFORM public.manage_recurring_booking(
    parent_id,
    (SELECT id FROM public.booking_occurrences WHERE booking_id = parent_id AND occurrence_date = '2027-01-04'),
    'reschedule', 'occurrence',
    '2027-01-04 16:00+02', '2027-01-04 18:00+02',
    renter, 'renter', 'Later that afternoon',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL
  );
  SELECT to_char(start_at AT TIME ZONE 'Africa/Johannesburg', 'HH24:MI') INTO moved
  FROM public.booking_occurrences WHERE booking_id = parent_id AND occurrence_date = '2027-01-04';
  IF moved <> '16:00' THEN
    RAISE EXCEPTION 'pending session was not moved';
  END IF;
  SELECT to_char(start_at AT TIME ZONE 'Africa/Johannesburg', 'HH24:MI') INTO kept
  FROM public.booking_occurrences WHERE booking_id = parent_id AND occurrence_date = '2027-01-11';
  IF kept <> '14:00' THEN
    RAISE EXCEPTION 'a later session changed with a single-occurrence edit';
  END IF;

  INSERT INTO public.bookings (space_id, status, payment_status, start_at, end_at, total_price)
  VALUES (space, 'confirmed', 'paid', '2027-02-01 14:00+02', '2027-02-01 16:00+02', 500);
  BEGIN
    PERFORM public.manage_recurring_booking(
      parent_id,
      (SELECT id FROM public.booking_occurrences WHERE booking_id = parent_id AND occurrence_date = '2027-02-01'),
      'reschedule', 'occurrence',
      '2027-02-01 14:00+02', '2027-02-01 16:00+02',
      renter, 'renter', 'onto a booking',
      NULL, NULL, NULL, NULL, NULL, NULL, NULL
    );
    RAISE EXCEPTION 'conflicting reschedule was stored';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%original session was kept%' THEN
      RAISE;
    END IF;
  END;

  PERFORM public.apply_host_booking_response(parent_id, host, 'decline', 'replaced by paid example');

  INSERT INTO public.spaces (id, status, public_listing_mode, recurring_bookings_enabled, price_per_hour)
  VALUES ('10000000-0000-4000-8000-000000000086', 'active', 'live', true, 250);
  created := public.create_recurring_booking(
    jsonb_build_object(
      'space_id', '10000000-0000-4000-8000-000000000086', 'renter_id', renter,
      'start_at', '2027-01-04 14:00+02', 'end_at', '2027-01-18 16:00+02',
      'total_price', 1500, 'unit_price', 250,
      'client_request_id', '11111111-1111-4111-8111-111111111111'
    ),
    'weekly', ARRAY[1]::smallint[], '14:00', '16:00', '2027-01-04', '2027-01-18', ARRAY[]::date[]
  );
  parent_id := (created->>'id')::uuid;
  PERFORM public.apply_host_booking_response(parent_id, host, 'approve', NULL);
  UPDATE public.bookings SET status = 'paid_confirmed', payment_status = 'paid' WHERE id = parent_id;
  BEGIN
    PERFORM public.manage_recurring_booking(
      parent_id,
      (SELECT id FROM public.booking_occurrences WHERE booking_id = parent_id AND occurrence_date = '2027-01-04'),
      'exclude', 'occurrence', NULL, NULL, host, 'manager', 'cancel paid',
      NULL, NULL, NULL, NULL, NULL, NULL, NULL
    );
    RAISE EXCEPTION 'paid cancellation was applied';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%paid_immutable%' THEN
      RAISE;
    END IF;
  END;
  IF EXISTS (
    SELECT 1 FROM public.booking_occurrences
    WHERE booking_id = parent_id AND occurrence_date = '2027-01-04' AND excluded
  ) THEN
    RAISE EXCEPTION 'paid session was excluded';
  END IF;

  created := public.manage_recurring_booking(
    parent_id,
    (SELECT id FROM public.booking_occurrences WHERE booking_id = parent_id AND occurrence_date = '2027-01-18'),
    'reschedule', 'occurrence',
    '2027-01-18 16:00+02', '2027-01-18 18:00+02',
    host, 'manager', 'same length',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL
  );
  IF created->>'applied' <> 'false' THEN
    RAISE EXCEPTION 'paid move was applied before the renter accepted';
  END IF;
  change_id := (created->>'change_request_id')::uuid;
  PERFORM public.decide_booking_change_request(change_id, renter, true);
  SELECT to_char(start_at AT TIME ZONE 'Africa/Johannesburg', 'HH24:MI') INTO moved
  FROM public.booking_occurrences WHERE booking_id = parent_id AND occurrence_date = '2027-01-18';
  IF moved <> '16:00' OR (SELECT total_price FROM public.bookings WHERE id = parent_id) <> 1500 THEN
    RAISE EXCEPTION 'accepted move changed the paid total or missed the new time';
  END IF;
  IF (SELECT count(*) FROM public.booking_change_events WHERE booking_id = parent_id) < 2 THEN
    RAISE EXCEPTION 'audit history is missing';
  END IF;

  created := public.save_availability_rule(
    '10000000-0000-4000-8000-000000000086', host,
    '{"reason":"Saturdays","weekdays":[6],"wholeDay":false,"localStart":"08:00","localEnd":"12:00","startsOn":"2027-01-02"}'::jsonb
  );
  rule_id := (created->>'id')::uuid;
  exception_id := public.open_availability_exception(
    rule_id, '2027-01-09', 'open', NULL, NULL, false, host, 'Open one Saturday'
  );
  INSERT INTO public.bookings (space_id, status, payment_status, start_at, end_at, total_price)
  VALUES ('10000000-0000-4000-8000-000000000086', 'confirmed', 'paid', '2027-01-09 09:00+02', '2027-01-09 11:00+02', 200);
  BEGIN
    INSERT INTO public.bookings (space_id, status, payment_status, start_at, end_at, total_price)
    VALUES ('10000000-0000-4000-8000-000000000086', 'confirmed', 'paid', '2027-01-16 09:00+02', '2027-01-16 11:00+02', 200);
    RAISE EXCEPTION 'the following Saturday was not blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Recurring restriction%' THEN
      RAISE;
    END IF;
  END;
  BEGIN
    PERFORM public.restore_availability_exception(exception_id, host);
    RAISE EXCEPTION 'restored a restriction over a booking';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%date stays open%' THEN
      RAISE;
    END IF;
  END;
  SELECT count(*) INTO opened FROM public.availability_rule_exceptions WHERE id = exception_id AND removed_at IS NULL;
  IF opened <> 1 THEN
    RAISE EXCEPTION 'the exception was removed';
  END IF;
END $$;
