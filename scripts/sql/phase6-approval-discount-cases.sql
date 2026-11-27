-- Phase 6 discounts and the Phase 5 corrections on a disposable database.
DO $$
DECLARE
  space uuid := '10000000-0000-4000-8000-000000000087';
  renter uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  host uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  created jsonb;
  parent_id uuid;
  plain_id uuid;
  fixed_id uuid;
  blocked_id uuid;
  held_id uuid;
  rule_id uuid;
  copied integer;
  change_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  INSERT INTO public.spaces (id, status, public_listing_mode, recurring_bookings_enabled, price_per_hour)
  VALUES (space, 'active', 'live', true, 250);

  created := public.create_recurring_booking(
    jsonb_build_object(
      'space_id', space, 'renter_id', renter,
      'start_at', '2027-01-04 14:00+02', 'end_at', '2027-03-22 16:00+02',
      'total_price', 6000, 'unit_price', 250, 'platform_fee', 900, 'owner_earnings', 5100,
      'client_request_id', '12121212-1212-4121-8121-121212121212'
    ),
    'weekly', ARRAY[1]::smallint[], '14:00', '16:00', '2027-01-04', '2027-03-22', ARRAY[]::date[]
  );
  parent_id := (created->>'id')::uuid;
  PERFORM public.approve_booking_with_discount(parent_id, host, 'approve', NULL, NULL, NULL, NULL);
  IF (SELECT total_price FROM public.bookings WHERE id = parent_id) <> 6000 THEN
    RAISE EXCEPTION 'approval without a discount changed the total';
  END IF;
  IF (SELECT count(*) FROM public.booking_discounts WHERE booking_id = parent_id) <> 0 THEN
    RAISE EXCEPTION 'approval without a discount wrote a discount';
  END IF;
  IF (SELECT count(*) FROM public.booking_occurrences WHERE booking_id = parent_id AND NOT excluded) <> 12 THEN
    RAISE EXCEPTION 'approval changed the recurring sessions';
  END IF;

  created := public.create_recurring_booking(
    jsonb_build_object(
      'space_id', space, 'renter_id', renter,
      'start_at', '2027-01-05 14:00+02', 'end_at', '2027-03-23 16:00+02',
      'total_price', 6000, 'unit_price', 250, 'platform_fee', 900, 'owner_earnings', 5100,
      'client_request_id', '13131313-1313-4131-8131-131313131313'
    ),
    'weekly', ARRAY[2]::smallint[], '14:00', '16:00', '2027-01-05', '2027-03-23', ARRAY[]::date[]
  );
  parent_id := (created->>'id')::uuid;
  PERFORM public.approve_booking_with_discount(parent_id, host, 'approve', NULL, 'percent', 20, 'School term');
  IF (SELECT total_price FROM public.bookings WHERE id = parent_id) <> 4800 THEN
    RAISE EXCEPTION '20 percent of 6000 should approve at 4800';
  END IF;
  IF (SELECT platform_fee FROM public.bookings WHERE id = parent_id) <> 720 THEN
    RAISE EXCEPTION 'the fee was not scaled from the snapshot';
  END IF;
  IF (SELECT owner_earnings FROM public.bookings WHERE id = parent_id) <> 4080 THEN
    RAISE EXCEPTION 'the host payout was not recalculated';
  END IF;
  IF (SELECT amount FROM public.booking_charges WHERE booking_id = parent_id AND charge_type = 'booking_total') <> 4800 THEN
    RAISE EXCEPTION 'the payable charge does not match the approved amount';
  END IF;
  IF (SELECT original_rental FROM public.booking_discounts WHERE booking_id = parent_id) <> 6000
     OR (SELECT discount_amount FROM public.booking_discounts WHERE booking_id = parent_id) <> 1200 THEN
    RAISE EXCEPTION 'the original amount or discount was not kept';
  END IF;
  IF (SELECT count(*) FROM public.booking_occurrences WHERE booking_id = parent_id AND NOT excluded) <> 12 THEN
    RAISE EXCEPTION 'the discount changed the recurring schedule';
  END IF;
  BEGIN
    PERFORM public.approve_booking_with_discount(parent_id, host, 'approve', NULL, 'fixed', 100, 'again');
    RAISE EXCEPTION 'a second approval was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%already been responded%' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.booking_discounts WHERE booking_id = parent_id) <> 1 THEN
    RAISE EXCEPTION 'a repeated approval created another discount';
  END IF;

  plain_id := gen_random_uuid();
  INSERT INTO public.bookings (
    id, space_id, renter_id, status, payment_status, start_at, end_at, total_price, platform_fee, owner_earnings
  ) VALUES (
    plain_id, space, renter, 'pending_owner', 'unpaid',
    '2027-04-06 09:00+02', '2027-04-06 17:00+02', 2000, 300, 1700
  );
  INSERT INTO public.booking_charges (booking_id, charge_type, amount, currency, status)
  VALUES (plain_id, 'booking_total', 2000, 'ZAR', 'pending');
  PERFORM public.approve_booking_with_discount(plain_id, host, 'approve', NULL, 'fixed', 500, 'Courtesy');
  IF (SELECT total_price FROM public.bookings WHERE id = plain_id) <> 1500
     OR (SELECT platform_fee FROM public.bookings WHERE id = plain_id) <> 225 THEN
    RAISE EXCEPTION 'a fixed discount did not scale the fee';
  END IF;

  fixed_id := gen_random_uuid();
  INSERT INTO public.bookings (
    id, space_id, renter_id, status, payment_status, start_at, end_at, total_price, platform_fee
  ) VALUES (
    fixed_id, space, renter, 'pending_owner', 'unpaid',
    '2027-04-07 09:00+02', '2027-04-07 17:00+02', 6000, 900
  );
  INSERT INTO public.booking_charges (booking_id, charge_type, amount, currency, status)
  VALUES (fixed_id, 'booking_total', 6000, 'ZAR', 'pending');
  BEGIN
    PERFORM public.approve_booking_with_discount(fixed_id, host, 'approve', NULL, 'percent', 100, 'Free');
    RAISE EXCEPTION 'a 100 percent discount was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%at least R5.00%' THEN RAISE; END IF;
  END;
  IF (SELECT status FROM public.bookings WHERE id = fixed_id) <> 'pending_owner'
     OR (SELECT count(*) FROM public.booking_discounts WHERE booking_id = fixed_id) <> 0 THEN
    RAISE EXCEPTION 'a rejected discount changed the booking';
  END IF;

  UPDATE public.bookings SET payment_status = 'processing' WHERE id = fixed_id;
  BEGIN
    PERFORM public.approve_booking_with_discount(fixed_id, host, 'approve', NULL, 'fixed', 100, 'Late');
    RAISE EXCEPTION 'a discount was applied after payment started';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%after payment has started%' THEN RAISE; END IF;
  END;
  UPDATE public.bookings SET payment_status = 'unpaid', status = 'paid_confirmed' WHERE id = fixed_id;
  UPDATE public.booking_charges SET status = 'paid' WHERE booking_id = fixed_id;
  BEGIN
    PERFORM public.approve_booking_with_discount(fixed_id, host, 'approve', NULL, 'fixed', 100, 'Paid');
    RAISE EXCEPTION 'a paid booking was discounted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%already%' THEN RAISE; END IF;
  END;

  plain_id := gen_random_uuid();
  INSERT INTO public.bookings (
    id, space_id, renter_id, status, payment_status, start_at, end_at, total_price, platform_fee
  ) VALUES (
    plain_id, space, renter, 'pending_owner', 'unpaid',
    '2027-05-03 10:00+02', '2027-05-03 12:00+02', 500, 75
  );
  blocked_id := gen_random_uuid();
  INSERT INTO public.bookings (
    id, space_id, renter_id, status, payment_status, start_at, end_at, total_price, platform_fee
  ) VALUES (
    blocked_id, space, renter, 'confirmed', 'paid',
    '2027-05-03 10:00+02', '2027-05-03 12:00+02', 500, 75
  );
  INSERT INTO public.booking_charges (booking_id, charge_type, amount, currency, status)
  VALUES (plain_id, 'booking_total', 500, 'ZAR', 'pending');
  BEGIN
    PERFORM public.approve_booking_with_discount(plain_id, host, 'approve', NULL, 'fixed', 50, 'Overlap');
    RAISE EXCEPTION 'an overlapping approval was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%not available%' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.booking_discounts WHERE booking_id = plain_id) <> 0
     OR (SELECT total_price FROM public.bookings WHERE id = plain_id) <> 500 THEN
    RAISE EXCEPTION 'a failed approval left a discount behind';
  END IF;

  plain_id := gen_random_uuid();
  INSERT INTO public.bookings (
    id, space_id, renter_id, status, payment_status, start_at, end_at, total_price, platform_fee
  ) VALUES (
    plain_id, space, renter, 'pending_owner', 'unpaid',
    '2027-05-04 10:00+02', '2027-05-04 12:00+02', 2000, 300
  );
  INSERT INTO public.booking_charges (booking_id, charge_type, amount, currency, status)
  VALUES
    (plain_id, 'booking_total', 2000, 'ZAR', 'pending'),
    (plain_id, 'deposit', 1000, 'ZAR', 'pending');
  BEGIN
    PERFORM public.approve_booking_with_discount(plain_id, host, 'approve', NULL, 'fixed', 50, 'Deposit');
    RAISE EXCEPTION 'a deposit booking was discounted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%deposit%' THEN RAISE; END IF;
  END;
  IF (SELECT total_price FROM public.bookings WHERE id = plain_id) <> 2000 THEN
    RAISE EXCEPTION 'a rejected deposit discount changed the total';
  END IF;

  created := public.create_recurring_booking(
    jsonb_build_object(
      'space_id', space, 'renter_id', renter, 'requirements_ready', false,
      'start_at', '2027-06-07 14:00+02', 'end_at', '2027-06-07 16:00+02',
      'total_price', 500, 'unit_price', 250,
      'client_request_id', '14141414-1414-4141-8141-141414141414'
    ),
    'weekly', ARRAY[1]::smallint[], '14:00', '16:00', '2027-06-07', '2027-06-07', ARRAY[]::date[]
  );
  held_id := (created->>'id')::uuid;
  IF (SELECT status FROM public.bookings WHERE id = held_id) <> 'requirements_pending' THEN
    RAISE EXCEPTION 'a request with missing documents became approvable';
  END IF;
  BEGIN
    PERFORM public.apply_host_booking_response(held_id, host, 'approve', NULL);
    RAISE EXCEPTION 'an incomplete request was approved';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Required information%' AND SQLERRM NOT LIKE '%already been responded%' THEN RAISE; END IF;
  END;
  PERFORM public.finalize_booking_requirements(held_id, renter);
  IF (SELECT status FROM public.bookings WHERE id = held_id) <> 'pending_owner'
     OR (SELECT requirements_ready FROM public.bookings WHERE id = held_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'finishing the documents did not release the request';
  END IF;

  INSERT INTO public.availability_rules (
    id, space_id, weekdays, whole_day, local_start, local_end, starts_on, ends_on
  ) VALUES (
    '44444444-4444-4444-8444-444444444444', space, ARRAY[1,6]::smallint[], false, '09:00', '12:00', '2027-01-04', '2027-03-31'
  );
  rule_id := '44444444-4444-4444-8444-444444444444';
  PERFORM public.open_availability_exception(rule_id, '2027-01-23', 'open', NULL, NULL, false, host, 'Open Saturday');
  PERFORM public.open_availability_exception(rule_id, '2027-01-25', 'open', NULL, NULL, false, host, 'Open Monday');
  BEGIN
    PERFORM public.split_availability_rule_from_date(
      rule_id, '2027-01-18', ARRAY[1]::smallint[], false, '09:00', '12:00', host, 'Mondays only', false
    );
    RAISE EXCEPTION 'an incompatible exception was dropped without confirmation';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%exceptions_need_confirmation%' THEN RAISE; END IF;
  END;
  IF (SELECT ends_on FROM public.availability_rules WHERE id = rule_id) IS DISTINCT FROM '2027-03-31' THEN
    RAISE EXCEPTION 'a refused split changed the original restriction';
  END IF;
  PERFORM public.split_availability_rule_from_date(
    rule_id, '2027-01-18', ARRAY[1]::smallint[], false, '09:00', '12:00', host, 'Mondays only', true
  );
  SELECT count(*) INTO copied
  FROM public.availability_rule_exceptions
  WHERE exception_date = '2027-01-25' AND removed_at IS NULL;
  IF copied <> 2 THEN
    RAISE EXCEPTION 'the Monday exception was not kept on both the original and the new restriction, got %', copied;
  END IF;

  UPDATE public.bookings
  SET status = 'paid_confirmed', payment_status = 'paid', total_price = 500
  WHERE id = held_id;
  INSERT INTO public.booking_change_requests (
    booking_id, space_id, occurrence_id, change_scope, proposed, requested_by, financial_effect, expires_at
  )
  SELECT held_id, space, o.id, 'occurrence',
    jsonb_build_array(jsonb_build_object(
      'occurrence_id', o.id,
      'start_at', '2027-06-07 16:00+02',
      'end_at', '2027-06-07 18:00+02',
      'previous_start', '2027-06-07 14:00+02',
      'previous_end', '2027-06-07 16:00+02'
    )),
    host, 'unchanged_paid', now() - interval '1 hour'
  FROM public.booking_occurrences o
  WHERE o.booking_id = held_id
  ORDER BY o.start_at DESC
  LIMIT 1
  RETURNING id INTO change_id;
  created := public.decide_booking_change_request(change_id, renter, true);
  IF created->>'message' NOT LIKE '%expired%' THEN
    RAISE EXCEPTION 'an expired proposal was accepted: %', created;
  END IF;
  IF (SELECT start_at FROM public.booking_occurrences WHERE booking_id = held_id ORDER BY start_at DESC LIMIT 1)
     <> '2027-06-07 14:00+02' THEN
    RAISE EXCEPTION 'an expired proposal moved the session';
  END IF;

  INSERT INTO public.booking_change_requests (
    booking_id, space_id, change_scope, proposed, requested_by, financial_effect
  ) VALUES (
    held_id, space, 'occurrence', '[]'::jsonb, host, 'unchanged_paid'
  )
  RETURNING id INTO change_id;
  created := public.withdraw_booking_change_request(change_id, host);
  IF (SELECT status FROM public.booking_change_requests WHERE id = change_id) <> 'withdrawn' THEN
    RAISE EXCEPTION 'the proposal was not withdrawn';
  END IF;
  BEGIN
    PERFORM public.decide_booking_change_request(change_id, renter, true);
    RAISE EXCEPTION 'a withdrawn proposal was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%no longer waiting%' THEN RAISE; END IF;
  END;

  INSERT INTO public.bookings (
    id, space_id, renter_id, status, payment_status, start_at, end_at, total_price, platform_fee, owner_earnings
  ) VALUES (
    '55555555-5555-4555-8555-555555555555', space, renter, 'pending_owner', 'unpaid',
    '2027-08-10 09:00+02', '2027-08-10 12:00+02', 1000, 150, 850
  );
  INSERT INTO public.booking_charges (booking_id, charge_type, amount, currency, status)
  VALUES ('55555555-5555-4555-8555-555555555555', 'booking_total', 1000, 'ZAR', 'pending');
END $$;
