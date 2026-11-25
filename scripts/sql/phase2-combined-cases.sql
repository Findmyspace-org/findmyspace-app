-- Migrations 081 and 082 are both applied before this file runs.
-- Bookings below use the availability trigger from 081 and the snapshot
-- columns from 082. No production database is involved.

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

DO $$
DECLARE
  quarter_space uuid := '10000000-0000-4000-8000-000000000010';
  legacy_space uuid := '10000000-0000-4000-8000-000000000011';
  quarter_id uuid;
  flexible_id uuid;
  legacy_id uuid;
  column_count integer;
BEGIN
  SELECT count(*) INTO column_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'bookings'
    AND column_name IN ('pricing_mode', 'rate_period', 'unit_price', 'billed_quantity');
  IF column_count <> 4 THEN
    RAISE EXCEPTION 'migration 082 snapshot columns are missing';
  END IF;

  IF to_regclass('public.space_booking_rates') IS NULL THEN
    RAISE EXCEPTION 'migration 082 did not create space_booking_rates';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'assert_space_interval_available'
  ) THEN
    RAISE EXCEPTION 'migration 081 availability function is missing';
  END IF;

  quarter_id := public.test_insert_booking(
    quarter_space,
    'confirmed',
    '2026-01-31 00:00+02',
    '2026-04-30 00:00+02'
  );

  BEGIN
    PERFORM public.test_insert_booking(
      quarter_space,
      'pending_owner',
      '2026-03-01 10:00+02',
      '2026-03-01 12:00+02'
    );
    RAISE EXCEPTION 'a request inside a quarterly reservation was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'space_unavailable:%Confirmed booking%' THEN
        RAISE EXCEPTION 'quarter conflict was not reported safely: %', SQLERRM;
      END IF;
      IF SQLERRM LIKE '%renter%' OR SQLERRM LIKE '%@%' THEN
        RAISE EXCEPTION 'conflict message exposed renter information';
      END IF;
  END;

  PERFORM public.test_insert_booking(
    quarter_space,
    'pending_owner',
    '2026-04-30 00:00+02',
    '2026-05-01 00:00+02'
  );

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  BEGIN
    PERFORM public.insert_blocked_date(
      quarter_space,
      '2026-02-01 00:00+02',
      '2026-02-02 00:00+02',
      'maintenance'
    );
    RAISE EXCEPTION 'a block over a quarterly reservation was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Confirmed booking%' THEN
        RAISE EXCEPTION 'block conflict was not reported: %', SQLERRM;
      END IF;
  END;

  PERFORM public.insert_blocked_date(
    quarter_space,
    '2026-05-02 00:00+02',
    '2026-05-03 00:00+02',
    'after the quarter'
  );

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    PERFORM public.replace_space_booking_rates(
      legacy_space,
      '[{"period":"quarter","amount":20000}]'::jsonb
    );
    RAISE EXCEPTION 'authenticated role replaced booking rates';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%not authorized%' THEN
        RAISE;
      END IF;
  END;
  BEGIN
    PERFORM public.insert_blocked_date(
      legacy_space,
      '2026-06-01 00:00+02',
      '2026-06-02 00:00+02',
      'direct'
    );
    RAISE EXCEPTION 'authenticated role inserted a block through the service function';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%not authorized%' THEN
        RAISE;
      END IF;
  END;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM public.replace_space_booking_rates(
    legacy_space,
    '[
      {"period":"hour","amount":250},
      {"period":"day","amount":1500},
      {"period":"week","amount":6000},
      {"period":"month","amount":8000},
      {"period":"quarter","amount":20000},
      {"period":"year","amount":65000}
    ]'::jsonb
  );
  IF (SELECT count(*) FROM public.space_booking_rates WHERE space_id = legacy_space) <> 6 THEN
    RAISE EXCEPTION 'the six booking rates were not stored independently';
  END IF;

  INSERT INTO public.bookings (
    space_id, status, payment_status, start_at, end_at,
    pricing_mode, rate_period, unit_price, billed_quantity, total_price
  ) VALUES (
    legacy_space, 'pending_owner', 'unpaid',
    '2026-06-01 00:00+02', '2026-09-01 00:00+02',
    'flexible', 'quarter', 20000, 1, 20000
  ) RETURNING id INTO flexible_id;

  IF (
    SELECT pricing_mode || ':' || rate_period || ':' || unit_price::text
    FROM public.bookings WHERE id = flexible_id
  ) IS DISTINCT FROM 'flexible:quarter:20000.00' THEN
    RAISE EXCEPTION 'the flexible price snapshot was not stored';
  END IF;

  UPDATE public.bookings
  SET unit_price = 1
  WHERE id = flexible_id AND status = 'pending_owner';
  -- The row above is a local fixture, not a customer booking. Confirm the
  -- stored request can keep its original snapshot when the listing rate changes.
  PERFORM public.replace_space_booking_rates(
    legacy_space,
    '[{"period":"quarter","amount":99999}]'::jsonb
  );
  IF (SELECT unit_price FROM public.bookings WHERE id = flexible_id) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'changing the listing rate changed an existing booking snapshot';
  END IF;
  UPDATE public.bookings SET unit_price = 20000 WHERE id = flexible_id;

  INSERT INTO public.bookings (
    space_id, status, payment_status, start_at, end_at, total_price
  ) VALUES (
    quarter_space, 'accepted_awaiting_payment', 'awaiting_payment',
    '2026-08-01 09:00+02', '2026-08-01 11:00+02', 500
  ) RETURNING id INTO legacy_id;

  UPDATE public.bookings
  SET status = 'paid_confirmed', payment_status = 'paid'
  WHERE id = legacy_id
    AND status = 'accepted_awaiting_payment'
    AND payment_status = 'awaiting_payment';
  IF (SELECT status FROM public.bookings WHERE id = legacy_id) IS DISTINCT FROM 'paid_confirmed' THEN
    RAISE EXCEPTION 'payment of an already reserved booking was rejected';
  END IF;

  UPDATE public.bookings
  SET status = 'expired', payment_status = 'unpaid'
  WHERE id = legacy_id;
  PERFORM public.test_insert_booking(
    quarter_space,
    'confirmed',
    '2026-08-01 09:00+02',
    '2026-08-01 11:00+02'
  );
  BEGIN
    UPDATE public.bookings
    SET status = 'paid_confirmed', payment_status = 'paid'
    WHERE id = legacy_id;
    RAISE EXCEPTION 'a late payment revived an expired booking';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'space_unavailable:%' THEN
        RAISE;
      END IF;
  END;
END $$;
