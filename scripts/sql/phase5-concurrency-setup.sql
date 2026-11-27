-- Two races on a disposable database. The caller starts the competing statements.
INSERT INTO public.spaces (id, status, public_listing_mode, recurring_bookings_enabled, price_per_hour)
VALUES
  ('10000000-0000-4000-8000-000000000087', 'active', 'live', true, 250),
  ('10000000-0000-4000-8000-000000000088', 'active', 'live', true, 250);

SELECT public.create_recurring_booking(
  jsonb_build_object(
    'space_id', '10000000-0000-4000-8000-000000000087',
    'renter_id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'start_at', '2027-01-04 14:00+02',
    'end_at', '2027-01-11 16:00+02',
    'total_price', 1000,
    'unit_price', 250,
    'client_request_id', '22222222-2222-4222-8222-222222222222'
  ),
  'weekly', ARRAY[1]::smallint[], '14:00', '16:00', '2027-01-04', '2027-01-11', ARRAY[]::date[]
)
FROM (SELECT set_config('request.jwt.claim.role', 'service_role', true)) cfg;

SELECT public.apply_host_booking_response(
  (SELECT id FROM public.bookings WHERE client_request_id = '22222222-2222-4222-8222-222222222222'),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'approve',
  NULL
)
FROM (SELECT set_config('request.jwt.claim.role', 'service_role', true)) cfg;

UPDATE public.bookings
SET status = 'paid_confirmed', payment_status = 'paid'
WHERE client_request_id = '22222222-2222-4222-8222-222222222222';

SELECT public.manage_recurring_booking(
  (SELECT id FROM public.bookings WHERE client_request_id = '22222222-2222-4222-8222-222222222222'),
  (SELECT o.id FROM public.booking_occurrences o
    JOIN public.bookings b ON b.id = o.booking_id
    WHERE b.client_request_id = '22222222-2222-4222-8222-222222222222'
      AND o.occurrence_date = '2027-01-11'),
  'reschedule', 'occurrence',
  '2027-01-11 16:00+02', '2027-01-11 18:00+02',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'manager', 'race',
  NULL, NULL, NULL, NULL, NULL, NULL, NULL
)
FROM (SELECT set_config('request.jwt.claim.role', 'service_role', true)) cfg;

INSERT INTO public.bookings (id, space_id, renter_id, status, payment_status, start_at, end_at, total_price)
VALUES (
  '33333333-3333-4333-8333-333333333333',
  '10000000-0000-4000-8000-000000000087',
  'cccccccc-cccc-4ccc-8ccc-cccccccccc01',
  'pending_owner', 'unpaid',
  '2027-01-11 16:00+02', '2027-01-11 18:00+02', 500
);

SELECT public.save_availability_rule(
  '10000000-0000-4000-8000-000000000088',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '{"reason":"Saturdays","weekdays":[6],"wholeDay":false,"localStart":"08:00","localEnd":"12:00","startsOn":"2027-01-02"}'::jsonb
)
FROM (SELECT set_config('request.jwt.claim.role', 'service_role', true)) cfg;

SELECT public.open_availability_exception(
  (SELECT id FROM public.availability_rules WHERE space_id = '10000000-0000-4000-8000-000000000088' AND removed_at IS NULL),
  '2027-01-09', 'open', NULL, NULL, false,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Open for the race'
)
FROM (SELECT set_config('request.jwt.claim.role', 'service_role', true)) cfg;

INSERT INTO public.bookings (id, space_id, renter_id, status, payment_status, start_at, end_at, total_price)
VALUES (
  '44444444-4444-4444-8444-444444444444',
  '10000000-0000-4000-8000-000000000088',
  'cccccccc-cccc-4ccc-8ccc-cccccccccc02',
  'pending_owner', 'unpaid',
  '2027-01-09 09:00+02', '2027-01-09 11:00+02', 200
);
