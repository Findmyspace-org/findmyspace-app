-- Historical overlap must survive migrations 081-087 unchanged.
-- An update that keeps the same interval does not create a new conflict.
-- An update that moves the interval is validated.
-- The database is disposable.

DO $$
DECLARE
  space_id uuid := '10000000-0000-4000-8000-0000000000aa';
  booking_id uuid := '10000000-0000-4000-8000-0000000000ab';
  block_id uuid := '10000000-0000-4000-8000-0000000000ac';
  original_end timestamptz := '2026-08-01 00:00+02';
  kept_end timestamptz;
  kept_message text;
  legacy_rows bigint;
  legacy_policies integer;
BEGIN
  IF to_regclass('public.availability_rules_legacy_weekly_empty') IS NULL THEN
    RAISE EXCEPTION 'empty legacy availability table was not preserved';
  END IF;
  SELECT count(*) INTO legacy_rows FROM public.availability_rules_legacy_weekly_empty;
  IF legacy_rows <> 0 THEN
    RAISE EXCEPTION 'legacy availability rename changed the row count to %', legacy_rows;
  END IF;
  SELECT count(*) INTO legacy_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'availability_rules_legacy_weekly_empty';
  IF legacy_policies <> 2 THEN
    RAISE EXCEPTION 'legacy availability policies were not preserved (found %)', legacy_policies;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'availability_rules'
      AND column_name = 'weekdays'
  ) THEN
    RAISE EXCEPTION 'recurring availability_rules.weekdays is missing';
  END IF;

  IF (SELECT count(*) FROM public.blocked_dates WHERE id = block_id) <> 1
     OR (SELECT count(*) FROM public.bookings WHERE id = booking_id AND status = 'paid_confirmed') <> 1 THEN
    RAISE EXCEPTION 'historical booking or block was not preserved';
  END IF;

  UPDATE public.bookings
  SET owner_response_message = 'interval unchanged'
  WHERE id = booking_id;

  SELECT end_at, owner_response_message
    INTO kept_end, kept_message
  FROM public.bookings
  WHERE id = booking_id;
  IF kept_end IS DISTINCT FROM original_end OR kept_message IS DISTINCT FROM 'interval unchanged' THEN
    RAISE EXCEPTION 'unchanged-interval update rewrote the historical booking';
  END IF;

  BEGIN
    UPDATE public.bookings
    SET end_at = '2026-09-01 00:00+02'
    WHERE id = booking_id;
    RAISE EXCEPTION 'moving the historical booking into the block was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%space_unavailable%' THEN
        RAISE;
      END IF;
  END;

  SELECT end_at INTO kept_end FROM public.bookings WHERE id = booking_id;
  IF kept_end IS DISTINCT FROM original_end THEN
    RAISE EXCEPTION 'rejected date change altered the historical booking';
  END IF;

  BEGIN
    INSERT INTO public.bookings (space_id, status, payment_status, start_at, end_at, total_price)
    VALUES (space_id, 'paid_confirmed', 'paid', '2026-08-01 00:00+02', '2026-08-02 00:00+02', 100);
    RAISE EXCEPTION 'a new reservation over the historical block was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%space_unavailable%' THEN
        RAISE;
      END IF;
  END;

  PERFORM public.test_insert_booking(space_id, 'pending_owner', '2027-02-01 09:00+02', '2027-02-01 10:00+02');

  IF (SELECT total_price FROM public.bookings WHERE id = booking_id) IS DISTINCT FROM 1250::numeric THEN
    RAISE EXCEPTION 'historical booking amount changed';
  END IF;
END $$;
