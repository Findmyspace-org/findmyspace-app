DO $$
DECLARE
  session_time text;
  once_status text;
  exception_open integer;
  opened_booking text;
BEGIN
  SELECT to_char(o.start_at AT TIME ZONE 'Africa/Johannesburg', 'HH24:MI')
  INTO session_time
  FROM public.booking_occurrences o
  JOIN public.bookings b ON b.id = o.booking_id
  WHERE b.client_request_id = '22222222-2222-4222-8222-222222222222'
    AND o.occurrence_date = '2027-01-11';

  SELECT status INTO once_status
  FROM public.bookings
  WHERE id = '33333333-3333-4333-8333-333333333333';

  IF session_time = '16:00' AND once_status IN (
    'approved', 'accepted_awaiting_payment', 'awaiting_payment', 'paid_confirmed', 'confirmed', 'completed'
  ) THEN
    RAISE EXCEPTION 'reschedule and approval both reserved 16:00';
  END IF;
  IF session_time <> '16:00' AND once_status NOT IN (
    'approved', 'accepted_awaiting_payment', 'awaiting_payment', 'paid_confirmed', 'confirmed', 'completed'
  ) THEN
    RAISE EXCEPTION 'both the reschedule and the approval failed: session %, once %', session_time, once_status;
  END IF;
  IF (SELECT total_price FROM public.bookings WHERE client_request_id = '22222222-2222-4222-8222-222222222222') <> 1000 THEN
    RAISE EXCEPTION 'the race changed the paid total';
  END IF;

  SELECT count(*) INTO exception_open
  FROM public.availability_rule_exceptions
  WHERE space_id = '10000000-0000-4000-8000-000000000088' AND removed_at IS NULL;

  SELECT status INTO opened_booking
  FROM public.bookings
  WHERE id = '44444444-4444-4444-8444-444444444444';

  IF exception_open = 0 AND opened_booking IN (
    'approved', 'accepted_awaiting_payment', 'awaiting_payment', 'paid_confirmed', 'confirmed', 'completed'
  ) THEN
    RAISE EXCEPTION 'the restriction was restored over an approved booking';
  END IF;
  IF exception_open > 0 AND opened_booking NOT IN (
    'approved', 'accepted_awaiting_payment', 'awaiting_payment', 'paid_confirmed', 'confirmed', 'completed'
  ) THEN
    RAISE EXCEPTION 'both restoring the block and approving the booking failed';
  END IF;
END $$;
