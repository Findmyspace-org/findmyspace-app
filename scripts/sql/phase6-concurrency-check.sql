DO $$
BEGIN
  IF (SELECT count(*) FROM public.booking_discounts WHERE booking_id = '55555555-5555-4555-8555-555555555555') <> 1 THEN
    RAISE EXCEPTION 'concurrent approvals created % discounts',
      (SELECT count(*) FROM public.booking_discounts WHERE booking_id = '55555555-5555-4555-8555-555555555555');
  END IF;
  IF (SELECT amount FROM public.booking_charges WHERE booking_id = '55555555-5555-4555-8555-555555555555')
     IS DISTINCT FROM (SELECT total_price FROM public.bookings WHERE id = '55555555-5555-4555-8555-555555555555') THEN
    RAISE EXCEPTION 'the charge does not match the approved total';
  END IF;
  IF (SELECT status FROM public.bookings WHERE id = '55555555-5555-4555-8555-555555555555')
     IS DISTINCT FROM 'accepted_awaiting_payment' THEN
    RAISE EXCEPTION 'the raced booking was not approved once';
  END IF;
END $$;
