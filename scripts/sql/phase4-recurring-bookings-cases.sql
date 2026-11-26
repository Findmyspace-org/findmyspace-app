-- Disposable checks for migration 084. No production data.

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
  INSERT INTO public.bookings (id, space_id, status, payment_status, start_at, end_at, total_price)
  VALUES (new_id, p_space, p_status, 'unpaid', p_start, p_end, 100);
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.test_insert_series_parent(
  p_space uuid,
  p_rate numeric,
  p_total numeric
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  new_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.bookings (
    id, space_id, status, payment_status, start_at, end_at,
    total_price, unit_price, pricing_mode, rate_period, reserves_via_occurrences
  ) VALUES (
    new_id, p_space, 'pending_owner', 'unpaid',
    '2027-01-04 14:00+02', '2027-03-22 16:00+02',
    p_total, p_rate, 'recurring', 'hour', true
  );
  RETURN new_id;
END;
$$;

DO $$
DECLARE
  classroom uuid := '10000000-0000-4000-8000-000000000010';
  church uuid := '10000000-0000-4000-8000-000000000011';
  actor uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  parent_id uuid;
  approved_id uuid;
  tuesday_id uuid;
  dates date[];
  stored_sessions integer;
BEGIN
  IF (SELECT recurring_bookings_enabled FROM public.spaces WHERE id = classroom) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'recurring bookings were enabled by default';
  END IF;

  PERFORM public.test_insert_booking(classroom, 'confirmed', '2027-01-05 09:00+02', '2027-01-05 11:00+02');
  parent_id := public.test_insert_series_parent(classroom, 250, 6000);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  BEGIN
    PERFORM public.attach_recurring_series(
      parent_id, 'weekly', ARRAY[1]::smallint[], '14:00', '16:00', '2027-01-04', '2027-03-22', ARRAY[]::date[]
    );
    RAISE EXCEPTION 'a disabled listing accepted a recurring request';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%not enabled%' THEN
        RAISE;
      END IF;
  END;
  IF (SELECT count(*) FROM public.booking_series) <> 0
     OR (SELECT count(*) FROM public.booking_occurrences) <> 0 THEN
    RAISE EXCEPTION 'a rejected series left rows behind';
  END IF;
  DELETE FROM public.bookings WHERE id = parent_id;

  UPDATE public.spaces
  SET recurring_bookings_enabled = true,
      price_per_hour = 250,
      min_booking_hours = 1
  WHERE id IN (classroom, church);
  INSERT INTO public.space_booking_rates (space_id, period, amount)
  VALUES (classroom, 'year', 65000), (classroom, 'hour', 250);

  SELECT array_agg(occurrence_date ORDER BY occurrence_date)
  INTO dates
  FROM public.generate_recurring_occurrences(
    'daily', ARRAY[]::smallint[], '08:00', '10:00', '2027-01-04', '2027-01-08', ARRAY[]::date[]
  );
  IF dates <> ARRAY['2027-01-04','2027-01-05','2027-01-06','2027-01-07','2027-01-08']::date[] THEN
    RAISE EXCEPTION 'daily recurrence was %', dates;
  END IF;

  SELECT array_agg(occurrence_date ORDER BY occurrence_date)
  INTO dates
  FROM public.generate_recurring_occurrences(
    'weekly', ARRAY[1]::smallint[], '14:00', '16:00', '2027-01-04', '2027-03-22', ARRAY[]::date[]
  );
  IF cardinality(dates) <> 12 OR dates[1] <> '2027-01-04' OR dates[12] <> '2027-03-22' THEN
    RAISE EXCEPTION 'weekly Mondays were %', dates;
  END IF;
  IF '2027-01-05' = ANY (dates) THEN
    RAISE EXCEPTION 'a Monday series included a Tuesday';
  END IF;

  SELECT array_agg(occurrence_date ORDER BY occurrence_date)
  INTO dates
  FROM public.generate_recurring_occurrences(
    'fortnightly', ARRAY[2, 4]::smallint[], '09:00', '12:00', '2027-01-07', '2027-02-04', ARRAY[]::date[]
  );
  IF dates <> ARRAY['2027-01-07','2027-01-19','2027-01-21','2027-02-02','2027-02-04']::date[] THEN
    RAISE EXCEPTION 'fortnightly anchoring was %', dates;
  END IF;

  SELECT array_agg(occurrence_date ORDER BY occurrence_date)
  INTO dates
  FROM public.generate_recurring_occurrences(
    'weekly', ARRAY[2, 4]::smallint[], '15:00', '17:00', '2027-01-05', '2027-01-14', ARRAY[]::date[]
  );
  IF dates <> ARRAY['2027-01-05','2027-01-07','2027-01-12','2027-01-14']::date[] THEN
    RAISE EXCEPTION 'weekday selection was %', dates;
  END IF;

  BEGIN
    PERFORM public.generate_recurring_occurrences(
      'weekly', ARRAY[1]::smallint[], '14:00', '16:00', '2027-01-04', '2029-01-05', ARRAY[]::date[]
    );
    RAISE EXCEPTION 'a series beyond 24 months was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%24 months%' THEN
        RAISE;
      END IF;
  END;
  PERFORM public.generate_recurring_occurrences(
    'weekly', ARRAY[1]::smallint[], '14:00', '16:00', '2027-01-04', '2029-01-04', ARRAY[]::date[]
  );

  UPDATE public.spaces SET recurring_max_occurrences = 2 WHERE id = classroom;
  parent_id := public.test_insert_series_parent(classroom, 250, 2000);
  BEGIN
    PERFORM public.attach_recurring_series(
      parent_id, 'weekly', ARRAY[1]::smallint[], '14:00', '16:00', '2027-01-04', '2027-01-25', ARRAY[]::date[]
    );
    RAISE EXCEPTION 'the session limit was ignored';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%at most 2%' THEN
        RAISE;
      END IF;
  END;
  DELETE FROM public.bookings WHERE id = parent_id;
  UPDATE public.spaces SET recurring_max_occurrences = NULL WHERE id = classroom;

  parent_id := public.test_insert_series_parent(classroom, 250, 500);
  BEGIN
    PERFORM public.attach_recurring_series(
      parent_id, 'weekly', ARRAY[1]::smallint[], '14:00', '14:30', '2027-01-04', '2027-01-04', ARRAY[]::date[]
    );
    RAISE EXCEPTION 'a short session was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%30-minute%' AND SQLERRM NOT LIKE '%at least 1 hour%' THEN
        RAISE;
      END IF;
  END;
  DELETE FROM public.bookings WHERE id = parent_id;

  parent_id := public.test_insert_series_parent(classroom, 1, 24);
  BEGIN
    PERFORM public.attach_recurring_series(
      parent_id, 'weekly', ARRAY[1]::smallint[], '14:00', '16:00', '2027-01-04', '2027-03-22', ARRAY[]::date[]
    );
    RAISE EXCEPTION 'a manipulated hourly price was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%does not match%' THEN
        RAISE;
      END IF;
  END;
  DELETE FROM public.bookings WHERE id = parent_id;

  parent_id := public.test_insert_series_parent(classroom, 250, 1000);
  BEGIN
    PERFORM public.attach_recurring_series(
      parent_id, 'weekly', ARRAY[1]::smallint[], '14:00', '16:00', '2027-01-04', '2027-03-22', ARRAY[]::date[]
    );
    RAISE EXCEPTION 'a manipulated total was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%does not match the hourly price%' THEN
        RAISE;
      END IF;
  END;
  DELETE FROM public.bookings WHERE id = parent_id;

  parent_id := public.test_insert_series_parent(classroom, 250, 6000);
  BEGIN
    PERFORM public.attach_recurring_series(
      parent_id, 'weekly', ARRAY[1]::smallint[], '14:00', '16:00', '2027-01-04', '2027-03-22', ARRAY['2027-01-06']::date[]
    );
    RAISE EXCEPTION 'an invented occurrence was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%not one of the generated%' THEN
        RAISE;
      END IF;
  END;
  IF (SELECT count(*) FROM public.booking_series WHERE booking_id = parent_id) <> 0 THEN
    RAISE EXCEPTION 'a failed request left a series';
  END IF;
  DELETE FROM public.bookings WHERE id = parent_id;

  PERFORM public.test_insert_booking(classroom, 'confirmed', '2027-02-01 14:00+02', '2027-02-01 16:00+02');
  parent_id := public.test_insert_series_parent(classroom, 250, 6000);
  BEGIN
    PERFORM public.attach_recurring_series(
      parent_id, 'weekly', ARRAY[1]::smallint[], '14:00', '16:00', '2027-01-04', '2027-03-22', ARRAY[]::date[]
    );
    RAISE EXCEPTION 'a once-off conflict was ignored';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%2027-02-01%' THEN
        RAISE;
      END IF;
  END;
  DELETE FROM public.bookings WHERE id = parent_id;

  parent_id := public.test_insert_series_parent(classroom, 250, 5500);
  PERFORM public.attach_recurring_series(
    parent_id, 'weekly', ARRAY[1]::smallint[], '14:00', '16:00', '2027-01-04', '2027-03-22', ARRAY['2027-02-01']::date[]
  );
  IF (SELECT total_price FROM public.bookings WHERE id = parent_id) <> 5500
     OR (SELECT series.session_count FROM public.booking_series AS series WHERE series.booking_id = parent_id) <> 11 THEN
    RAISE EXCEPTION 'excluding a session did not recalculate the series';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.booking_occurrences
    WHERE booking_id = parent_id AND occurrence_date = '2027-02-01' AND NOT excluded
  ) THEN
    RAISE EXCEPTION 'the excluded session was still reserved';
  END IF;
  approved_id := parent_id;

  PERFORM public.test_insert_booking(church, 'confirmed', '2027-02-01 00:00+02', '2027-03-01 00:00+02');
  parent_id := public.test_insert_series_parent(church, 250, 2000);
  UPDATE public.spaces SET price_per_hour = 250 WHERE id = church;
  BEGIN
    PERFORM public.attach_recurring_series(
      parent_id, 'weekly', ARRAY[1]::smallint[], '14:00', '16:00', '2027-02-01', '2027-02-22', ARRAY[]::date[]
    );
    RAISE EXCEPTION 'a continuous booking did not block the Mondays inside it';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%not available%' THEN
        RAISE;
      END IF;
  END;
  DELETE FROM public.bookings WHERE id = parent_id;

  PERFORM public.apply_host_booking_response(approved_id, actor, 'approve', NULL);
  IF (SELECT status FROM public.bookings WHERE id = approved_id) <> 'accepted_awaiting_payment' THEN
    RAISE EXCEPTION 'the series was not approved as one booking';
  END IF;
  tuesday_id := public.test_insert_booking(classroom, 'confirmed', '2027-01-05 14:00+02', '2027-01-05 16:00+02');
  PERFORM public.test_insert_booking(classroom, 'confirmed', '2027-01-06 10:00+02', '2027-01-06 12:00+02');
  PERFORM public.test_insert_booking(classroom, 'confirmed', '2027-01-04 16:00+02', '2027-01-04 18:00+02');
  BEGIN
    PERFORM public.test_insert_booking(classroom, 'confirmed', '2027-01-04 15:00+02', '2027-01-04 17:00+02');
    RAISE EXCEPTION 'an overlapping Monday session was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%not available%' AND SQLERRM NOT LIKE '%Blocked%' AND SQLERRM NOT LIKE '%booking%' THEN
        RAISE;
      END IF;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE id = tuesday_id AND status = 'confirmed') THEN
    RAISE EXCEPTION 'Tuesday was blocked by a Monday series';
  END IF;

  parent_id := public.test_insert_series_parent(classroom, 250, 6000);
  BEGIN
    PERFORM public.attach_recurring_series(
      parent_id, 'weekly', ARRAY[1]::smallint[], '14:00', '16:00', '2027-01-04', '2027-03-22', ARRAY[]::date[]
    );
    RAISE EXCEPTION 'a second series was allowed over reserved Mondays';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%not available%' THEN
        RAISE;
      END IF;
  END;
  DELETE FROM public.bookings WHERE id = parent_id;

  PERFORM public.insert_blocked_date(church, '2027-04-05 14:00+02', '2027-04-05 16:00+02', 'maintenance');
  parent_id := public.test_insert_series_parent(church, 250, 1000);
  BEGIN
    PERFORM public.attach_recurring_series(
      parent_id, 'weekly', ARRAY[1]::smallint[], '14:00', '16:00', '2027-04-05', '2027-04-12', ARRAY[]::date[]
    );
    RAISE EXCEPTION 'a once-off block was ignored';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%2027-04-05%' THEN
        RAISE;
      END IF;
  END;
  DELETE FROM public.bookings WHERE id = parent_id;

  PERFORM public.save_availability_rule(
    church, actor,
    '{"reason":"School day","weekdays":[1,2,3,4,5],"wholeDay":false,"localStart":"08:00","localEnd":"15:00","startsOn":"2027-05-03"}'::jsonb
  );
  parent_id := public.test_insert_series_parent(church, 250, 1000);
  BEGIN
    PERFORM public.attach_recurring_series(
      parent_id, 'weekly', ARRAY[1]::smallint[], '14:00', '16:00', '2027-05-03', '2027-05-10', ARRAY[]::date[]
    );
    RAISE EXCEPTION 'a recurring restriction was ignored';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%not available%' THEN
        RAISE;
      END IF;
  END;
  DELETE FROM public.bookings WHERE id = parent_id;
  parent_id := public.test_insert_series_parent(church, 250, 1000);
  PERFORM public.attach_recurring_series(
    parent_id, 'weekly', ARRAY[1]::smallint[], '15:00', '17:00', '2027-05-03', '2027-05-10', ARRAY[]::date[]
  );
  DELETE FROM public.bookings WHERE id = parent_id;

  PERFORM public.save_availability_rule(
    classroom, actor,
    '{"reason":"One Tuesday","weekdays":[2],"wholeDay":true,"startsOn":"2027-01-12","endsOn":"2027-01-12"}'::jsonb
  );

  parent_id := public.test_insert_series_parent(church, 250, 1000);
  PERFORM public.attach_recurring_series(
    parent_id, 'weekly', ARRAY[1]::smallint[], '18:00', '20:00', '2027-06-07', '2027-06-14', ARRAY[]::date[]
  );
  PERFORM public.test_insert_booking(church, 'pending_owner', '2027-06-08 18:00+02', '2027-06-08 20:00+02');
  PERFORM public.test_insert_booking(church, 'pending_owner', '2027-06-07 18:00+02', '2027-06-07 20:00+02');
  PERFORM public.apply_host_booking_response(parent_id, actor, 'approve', NULL);
  IF (
    SELECT count(*) FROM public.bookings
    WHERE space_id = church
      AND status = 'pending_owner'
      AND start_at = '2027-06-08 18:00+02'
  ) <> 1 THEN
    RAISE EXCEPTION 'a Tuesday request was declined by a Monday series';
  END IF;
  IF (
    SELECT count(*) FROM public.bookings
    WHERE space_id = church
      AND status = 'declined'
      AND start_at = '2027-06-07 18:00+02'
  ) <> 1 THEN
    RAISE EXCEPTION 'the overlapping Monday request was not declined';
  END IF;

  parent_id := public.test_insert_series_parent(church, 250, 1000);
  PERFORM public.attach_recurring_series(
    parent_id, 'weekly', ARRAY[1]::smallint[], '16:00', '18:00', '2027-07-05', '2027-07-12', ARRAY[]::date[]
  );
  PERFORM public.test_insert_booking(church, 'confirmed', '2027-07-05 16:00+02', '2027-07-05 17:00+02');
  BEGIN
    PERFORM public.apply_host_booking_response(parent_id, actor, 'approve', NULL);
    RAISE EXCEPTION 'approval ignored a conflict that appeared after submission';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%not available%' THEN
        RAISE;
      END IF;
  END;
  IF (SELECT status FROM public.bookings WHERE id = parent_id) <> 'pending_owner' THEN
    RAISE EXCEPTION 'a conflicting series was partially approved';
  END IF;

  UPDATE public.bookings
  SET status = 'expired', payment_status = 'unpaid'
  WHERE id = approved_id;
  PERFORM public.test_insert_booking(classroom, 'confirmed', '2027-03-01 14:00+02', '2027-03-01 16:00+02');
  BEGIN
    UPDATE public.bookings
    SET status = 'paid_confirmed', payment_status = 'paid'
    WHERE id = approved_id;
    RAISE EXCEPTION 'a late payment revived an expired series';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%not available%' THEN
        RAISE;
      END IF;
  END;
  IF (SELECT status FROM public.bookings WHERE id = approved_id) <> 'expired' THEN
    RAISE EXCEPTION 'the expired series changed status';
  END IF;

  UPDATE public.spaces SET recurring_bookings_enabled = false WHERE id = classroom;
  IF (SELECT status FROM public.bookings WHERE id = approved_id) <> 'expired' THEN
    RAISE EXCEPTION 'disabling new requests changed an existing series';
  END IF;
  parent_id := public.test_insert_series_parent(classroom, 250, 500);
  BEGIN
    PERFORM public.attach_recurring_series(
      parent_id, 'weekly', ARRAY[1]::smallint[], '08:00', '10:00', '2027-08-02', '2027-08-02', ARRAY[]::date[]
    );
    RAISE EXCEPTION 'disabling the listing did not stop a new series';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%not enabled%' THEN
        RAISE;
      END IF;
  END;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    PERFORM public.attach_recurring_series(
      parent_id, 'weekly', ARRAY[1]::smallint[], '08:00', '10:00', '2027-08-02', '2027-08-02', ARRAY[]::date[]
    );
    RAISE EXCEPTION 'an authenticated user attached a series';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%not authorized%' THEN
        RAISE;
      END IF;
  END;

  SELECT count(*) INTO stored_sessions FROM public.booking_occurrences;
  IF stored_sessions < 1 THEN
    RAISE EXCEPTION 'no occurrences were stored';
  END IF;
END $$;
