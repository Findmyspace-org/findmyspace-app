-- Migrations 081, 082 and 083 are applied before this file.
-- The database is disposable. It does not contain production data.

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
  VALUES (new_id, p_space, p_status, 'unpaid', p_start, p_end, 65000);
  RETURN new_id;
END;
$$;

DO $$
DECLARE
  classroom uuid := '10000000-0000-4000-8000-000000000010';
  church uuid := '10000000-0000-4000-8000-000000000011';
  maintenance uuid := '10000000-0000-4000-8000-000000000012';
  actor uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  weekday_rule jsonb;
  sunday_rule jsonb;
  saved jsonb;
  monday_2030 date;
  price numeric;
  rule_count integer;
  block_count integer;
BEGIN
  INSERT INTO public.spaces (id, status, public_listing_mode)
  VALUES (maintenance, 'active', 'live')
  ON CONFLICT (id) DO NOTHING;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    PERFORM public.save_availability_rule(classroom, actor, '{"weekdays":[1],"wholeDay":true,"startsOn":"2027-01-01"}'::jsonb);
    RAISE EXCEPTION 'authenticated role saved a restriction';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%not authorized%' THEN
        RAISE;
      END IF;
  END;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  saved := public.save_availability_rule(
    classroom,
    actor,
    jsonb_build_object(
      'reason', 'School day',
      'weekdays', jsonb_build_array(1, 2, 3, 4, 5),
      'wholeDay', false,
      'localStart', '08:00',
      'localEnd', '15:00',
      'startsOn', '2027-01-01',
      'endsOn', NULL
    )
  );
  weekday_rule := saved;
  IF (SELECT count(*) FROM public.availability_rules WHERE space_id = classroom AND removed_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'an indefinite rule created more than one row';
  END IF;

  BEGIN
    PERFORM public.test_insert_booking(classroom, 'pending_owner', '2027-01-04 10:00+02', '2027-01-04 11:00+02');
    RAISE EXCEPTION 'a request during a weekday restriction was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Recurring restriction from 2027-01-04 08:00 to 2027-01-04 15:00 SAST%' THEN
        RAISE EXCEPTION 'weekday conflict was not explained: %', SQLERRM;
      END IF;
  END;

  PERFORM public.test_insert_booking(classroom, 'pending_owner', '2027-01-04 07:00+02', '2027-01-04 08:00+02');
  PERFORM public.test_insert_booking(classroom, 'pending_owner', '2027-01-04 15:00+02', '2027-01-04 16:00+02');
  PERFORM public.test_insert_booking(classroom, 'pending_owner', '2027-01-09 10:00+02', '2027-01-09 11:00+02');

  BEGIN
    PERFORM public.test_insert_booking(classroom, 'pending_owner', '2027-01-04 00:00+02', '2027-04-04 00:00+02');
    RAISE EXCEPTION 'a quarterly booking over weekday restrictions was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Recurring restriction%' THEN
        RAISE;
      END IF;
  END;

  SELECT d::date INTO monday_2030
  FROM generate_series('2030-01-01'::date, '2030-01-07'::date, '1 day'::interval) AS d
  WHERE EXTRACT(ISODOW FROM d) = 1
  LIMIT 1;
  BEGIN
    PERFORM public.test_insert_booking(
      classroom,
      'confirmed',
      (monday_2030::timestamp + time '10:00') AT TIME ZONE 'Africa/Johannesburg',
      (monday_2030::timestamp + time '11:00') AT TIME ZONE 'Africa/Johannesburg'
    );
    RAISE EXCEPTION 'an indefinite rule was not visible in 2030';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Recurring restriction%' THEN
        RAISE EXCEPTION '2030 conflict was not a recurring restriction: %', SQLERRM;
      END IF;
  END;

  saved := public.save_availability_rule(
    church,
    actor,
    jsonb_build_object(
      'reason', 'Sunday service',
      'weekdays', jsonb_build_array(7),
      'wholeDay', false,
      'localStart', '08:00',
      'localEnd', '12:00',
      'startsOn', '2027-01-01'
    )
  );
  sunday_rule := saved;
  BEGIN
    PERFORM public.test_insert_booking(church, 'pending_owner', '2027-01-03 09:00+02', '2027-01-03 10:00+02');
    RAISE EXCEPTION 'Sunday service did not block the overlapping hour';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Recurring restriction%' THEN RAISE; END IF;
  END;
  PERFORM public.test_insert_booking(church, 'pending_owner', '2027-01-03 12:00+02', '2027-01-03 13:00+02');

  PERFORM public.test_insert_booking(maintenance, 'confirmed', '2027-02-02 09:00+02', '2027-02-02 11:00+02');
  BEGIN
    PERFORM public.save_availability_rule(
      maintenance,
      actor,
      jsonb_build_object(
        'reason', 'Internal meeting',
        'weekdays', jsonb_build_array(2),
        'wholeDay', false,
        'localStart', '09:00',
        'localEnd', '11:00',
        'startsOn', '2027-02-01',
        'endsOn', '2027-03-31'
      )
    );
    RAISE EXCEPTION 'a restriction over a confirmed booking was saved';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%confirmed booking from 2027-02-02 09:00 to 2027-02-02 11:00 SAST%' THEN
        RAISE EXCEPTION 'confirmed booking conflict was not identified: %', SQLERRM;
      END IF;
      IF SQLERRM LIKE '%@%' OR SQLERRM LIKE '%renter%' THEN
        RAISE EXCEPTION 'conflict exposed renter information';
      END IF;
  END;

  UPDATE public.bookings
  SET status = 'accepted_awaiting_payment', payment_status = 'awaiting_payment'
  WHERE space_id = maintenance;
  BEGIN
    PERFORM public.save_availability_rule(
      maintenance,
      actor,
      jsonb_build_object(
        'weekdays', jsonb_build_array(2),
        'wholeDay', false,
        'localStart', '09:00',
        'localEnd', '11:00',
        'startsOn', '2027-02-01',
        'endsOn', '2027-03-31'
      )
    );
    RAISE EXCEPTION 'a restriction over an accepted booking was saved';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%confirmed booking%' THEN
        RAISE;
      END IF;
  END;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM public.insert_blocked_date(church, '2027-01-20 00:00+02', '2027-01-21 00:00+02', 'maintenance week');
  block_count := (SELECT count(*) FROM public.blocked_dates WHERE space_id = church);
  PERFORM public.archive_availability_rule(church, (sunday_rule->>'id')::uuid, actor);
  IF (SELECT count(*) FROM public.blocked_dates WHERE space_id = church) <> block_count THEN
    RAISE EXCEPTION 'removing a rule changed once-off blocked dates';
  END IF;
  IF (SELECT removed_at FROM public.availability_rules WHERE id = (sunday_rule->>'id')::uuid) IS NULL THEN
    RAISE EXCEPTION 'the removed rule was deleted instead of archived';
  END IF;
  PERFORM public.test_insert_booking(church, 'pending_owner', '2027-01-10 09:00+02', '2027-01-10 10:00+02');
  BEGIN
    PERFORM public.test_insert_booking(church, 'pending_owner', '2027-01-20 10:00+02', '2027-01-20 11:00+02');
    RAISE EXCEPTION 'a once-off block stopped working after rules were added';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Blocked period%' THEN
        RAISE EXCEPTION 'once-off block was not reported: %', SQLERRM;
      END IF;
  END;

  saved := public.save_availability_rule(
    classroom,
    actor,
    jsonb_build_object(
      'id', weekday_rule->>'id',
      'reason', 'School day',
      'weekdays', jsonb_build_array(6, 7),
      'wholeDay', true,
      'startsOn', '2027-01-01',
      'endsOn', '2027-01-31'
    )
  );
  PERFORM public.test_insert_booking(classroom, 'pending_owner', '2027-02-01 10:00+02', '2027-02-01 11:00+02');
  BEGIN
    PERFORM public.test_insert_booking(classroom, 'pending_owner', '2027-01-09 00:00+02', '2027-01-10 00:00+02');
    RAISE EXCEPTION 'a weekend rule with an end date did not block Saturday';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Recurring restriction%' THEN RAISE; END IF;
  END;

  SELECT total_price INTO price
  FROM public.bookings
  WHERE space_id = classroom
  ORDER BY start_at
  LIMIT 1;
  IF price IS DISTINCT FROM 65000 THEN
    RAISE EXCEPTION 'a restriction changed a stored booking price';
  END IF;

  SELECT count(*) INTO rule_count FROM public.availability_rules;
  IF rule_count > 10 THEN
    RAISE EXCEPTION 'rules were expanded into occurrence rows';
  END IF;
END $$;
