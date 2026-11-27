-- Phase 5 corrections and Phase 6 approval-time discounts.
-- Additive. Does not rewrite paid totals or listing rates.
-- Incomplete document requests stay requirements_pending until the renter
-- finishes the upload. They do not reserve time and cannot be approved.
-- A discount is written in the same transaction as approval. A failure
-- rolls the discount back. PayFast still charges bookings.total_price.
-- Amounts below R5, including a 100% discount, are rejected because this
-- release has no free-booking confirmation that skips PayFast safely.
-- Legacy monthly deposits and extra charge types are not discounted.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS requirements_ready boolean NOT NULL DEFAULT true;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS original_requested_total numeric(12, 2);

ALTER TABLE public.booking_change_requests
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days');

ALTER TABLE public.booking_change_requests
  DROP CONSTRAINT IF EXISTS booking_change_requests_status_check;

ALTER TABLE public.booking_change_requests
  ADD CONSTRAINT booking_change_requests_status_check
  CHECK (status IN ('pending_renter', 'accepted', 'declined', 'withdrawn', 'expired'));

CREATE UNIQUE INDEX IF NOT EXISTS booking_change_requests_one_pending
  ON public.booking_change_requests (booking_id)
  WHERE status = 'pending_renter';

CREATE TABLE IF NOT EXISTS public.booking_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  discount_type text NOT NULL,
  discount_value numeric(12, 2) NOT NULL,
  discount_amount numeric(12, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  reason text,
  original_rental numeric(12, 2) NOT NULL,
  approved_rental numeric(12, 2) NOT NULL,
  platform_fee numeric(12, 2),
  host_payout numeric(12, 2),
  commercial_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  CONSTRAINT booking_discounts_type_check CHECK (discount_type IN ('percent', 'fixed')),
  CONSTRAINT booking_discounts_value_check CHECK (discount_value > 0),
  CONSTRAINT booking_discounts_amount_check CHECK (discount_amount > 0),
  CONSTRAINT booking_discounts_currency_check CHECK (currency = 'ZAR'),
  CONSTRAINT booking_discounts_approved_check CHECK (approved_rental >= 5)
);

CREATE UNIQUE INDEX IF NOT EXISTS booking_discounts_one_active
  ON public.booking_discounts (booking_id)
  WHERE removed_at IS NULL;

ALTER TABLE public.booking_discounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_discounts FROM PUBLIC;


CREATE OR REPLACE FUNCTION public.create_recurring_booking(
  p_booking jsonb,
  p_frequency text,
  p_weekdays smallint[],
  p_local_start time,
  p_local_end time,
  p_starts_on date,
  p_ends_on date,
  p_excluded date[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  allowed text[] := ARRAY[
    'space_id','renter_id','owner_id','organisation_id',
    'commercial_beneficiary_type','commercial_beneficiary_user_id','commercial_beneficiary_organisation_id',
    'booking_unit','start_at','end_at','notes','pricing_mode','rate_period','unit_price','billed_quantity',
    'total_price','platform_fee','owner_earnings','payout_status',
    'commercial_model','platform_commission_percent','transaction_fee_percent',
    'platform_commission_amount','transaction_fee_amount','monthly_subscription_amount',
    'commercial_terms_id','commercial_terms_source','commercial_terms_effective_at',
    'monthly_rent','deposit_amount','initial_payment_amount','next_payment_date','months_total','months_paid',
    'terms_accepted','terms_accepted_at','accepted_terms_updated_at','accepted_terms_title','accepted_terms_label',
    'client_request_id','requirements_ready'
  ];
  col text;
  cols text[] := ARRAY[]::text[];
  vals text[] := ARRAY[]::text[];
  seen text[] := ARRAY[]::text[];
  raw text;
  coltype text;
  new_id uuid;
  existing uuid;
  renter uuid;
  request_id uuid;
  requirements_needed boolean := false;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_booking IS NULL OR p_booking->>'space_id' IS NULL THEN
    RAISE EXCEPTION 'A listing is required.';
  END IF;

  IF NULLIF(p_booking->>'client_request_id', '') IS NOT NULL
     AND NULLIF(p_booking->>'renter_id', '') IS NOT NULL THEN
    renter := (p_booking->>'renter_id')::uuid;
    request_id := (p_booking->>'client_request_id')::uuid;
    SELECT b.id INTO existing
    FROM public.bookings b
    WHERE b.renter_id = renter AND b.client_request_id = request_id;
    IF existing IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM public.booking_series WHERE booking_id = existing)
         AND EXISTS (
           SELECT 1 FROM public.booking_charges
           WHERE booking_id = existing AND charge_type = 'booking_total'
         ) THEN
        RETURN jsonb_build_object(
          'id', existing,
          'reused', true,
          'requirements_ready', COALESCE((SELECT requirements_ready FROM public.bookings WHERE id = existing), true)
        );
      END IF;
      RAISE EXCEPTION 'incomplete recurring booking';
    END IF;
  END IF;

  FOREACH col IN ARRAY allowed LOOP
    IF NOT (p_booking ? col) OR jsonb_typeof(p_booking->col) = 'null' THEN
      CONTINUE;
    END IF;
    SELECT data_type INTO coltype
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = col;
    IF coltype IS NULL THEN
      CONTINUE;
    END IF;
    raw := p_booking->>col;
    cols := cols || format('%I', col);
    vals := vals || format('%L::%s', raw, CASE coltype
      WHEN 'uuid' THEN 'uuid'
      WHEN 'numeric' THEN 'numeric'
      WHEN 'integer' THEN 'integer'
      WHEN 'boolean' THEN 'boolean'
      WHEN 'timestamp with time zone' THEN 'timestamptz'
      WHEN 'timestamp without time zone' THEN 'timestamp'
      WHEN 'date' THEN 'date'
      ELSE 'text'
    END);
    seen := seen || col;
  END LOOP;

  IF NOT ('space_id' = ANY (seen)) OR NOT ('start_at' = ANY (seen)) OR NOT ('end_at' = ANY (seen)) THEN
    RAISE EXCEPTION 'A listing, start, and end are required.';
  END IF;
  IF NOT ('total_price' = ANY (seen)) OR NOT ('unit_price' = ANY (seen)) THEN
    RAISE EXCEPTION 'The hourly price and total are required.';
  END IF;

  requirements_needed := COALESCE((p_booking->>'requirements_ready')::boolean, true) = false;
  cols := cols || ARRAY['status','payment_status','reserves_via_occurrences','pricing_mode']::text[];
  vals := vals || ARRAY['''pending_owner''::text','''unpaid''::text','true','''recurring''::text']::text[];
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'requirements_ready'
  ) AND NOT ('requirements_ready' = ANY (seen)) THEN
    cols := cols || 'requirements_ready'::text;
    vals := vals || CASE WHEN requirements_needed THEN 'false' ELSE 'true' END;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'booking_unit'
  ) AND NOT ('booking_unit' = ANY (seen)) THEN
    cols := cols || 'booking_unit'::text;
    vals := vals || '''recurring_hour''::text'::text;
  END IF;

  EXECUTE 'INSERT INTO public.bookings (' || array_to_string(cols, ',') || ') VALUES ('
    || array_to_string(vals, ',') || ') RETURNING id'
  INTO new_id;

  PERFORM public.attach_recurring_series(
    new_id, p_frequency, p_weekdays, p_local_start, p_local_end, p_starts_on, p_ends_on, p_excluded
  );

  IF requirements_needed THEN
    UPDATE public.bookings
    SET status = 'requirements_pending',
        requirements_ready = false
    WHERE id = new_id;
  END IF;

  INSERT INTO public.booking_charges (
    booking_id, charge_type, description, billing_period_start, billing_period_end, amount, currency, status
  )
  SELECT b.id, 'booking_total', 'Booking total', b.start_at, b.end_at, b.total_price, 'ZAR', 'pending'
  FROM public.bookings b
  WHERE b.id = new_id;

  RETURN jsonb_build_object('id', new_id, 'reused', false, 'requirements_ready', NOT requirements_needed);
EXCEPTION
  WHEN unique_violation THEN
    IF request_id IS NOT NULL AND renter IS NOT NULL THEN
      SELECT b.id INTO existing
      FROM public.bookings b
      WHERE b.renter_id = renter AND b.client_request_id = request_id;
      IF existing IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.booking_series WHERE booking_id = existing
      ) THEN
        RETURN jsonb_build_object(
          'id', existing,
          'reused', true,
          'requirements_ready', COALESCE((SELECT requirements_ready FROM public.bookings WHERE id = existing), true)
        );
      END IF;
    END IF;
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_recurring_booking(
  p_booking_id uuid,
  p_occurrence_id uuid,
  p_action text,
  p_scope text,
  p_new_start timestamptz,
  p_new_end timestamptz,
  p_actor uuid,
  p_actor_role text,
  p_reason text,
  p_frequency text DEFAULT NULL,
  p_weekdays smallint[] DEFAULT NULL,
  p_local_start time DEFAULT NULL,
  p_local_end time DEFAULT NULL,
  p_starts_on date DEFAULT NULL,
  p_ends_on date DEFAULT NULL,
  p_excluded date[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  booking public.bookings%ROWTYPE;
  occurrence public.booking_occurrences%ROWTYPE;
  target uuid;
  targets uuid[] := ARRAY[]::uuid[];
  proposed jsonb := '[]'::jsonb;
  old_start timestamptz;
  old_end timestamptz;
  new_start timestamptz;
  new_end timestamptz;
  local_start time;
  local_end time;
  minutes integer;
  old_minutes integer;
  hours numeric;
  included integer;
  new_total numeric;
  old_total numeric;
  new_fee numeric;
  request_id uuid;
  financial text;
  agreement text;
  notice text;
  sibling_hit boolean;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_action NOT IN ('reschedule', 'exclude', 'amend') OR p_scope NOT IN ('occurrence', 'this_and_future', 'series') THEN
    RAISE EXCEPTION 'Choose a session, this and future sessions, or the whole series.';
  END IF;

  SELECT * INTO booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR NOT COALESCE(booking.reserves_via_occurrences, false) THEN
    RAISE EXCEPTION 'Recurring booking not found.';
  END IF;
  PERFORM public.lock_space_availability(booking.space_id);

  IF booking.payment_status = 'processing' THEN
    RAISE EXCEPTION 'payment_requested: A payment has already started. The approved amount stays as it is and cannot be changed from here.';
  END IF;
  IF booking.status IN ('accepted_awaiting_payment', 'awaiting_payment', 'approved')
     OR booking.payment_status = 'awaiting_payment' THEN
    RAISE EXCEPTION 'payment_requested: This booking is already approved and waiting for payment. The approved amount stays as it is. It cannot be declined from here, and the dates cannot change without invalidating that payment.';
  END IF;

  IF p_action = 'amend' THEN
    IF booking.status NOT IN ('pending', 'pending_owner') OR p_actor IS DISTINCT FROM booking.renter_id THEN
      RAISE EXCEPTION 'not authorized: Only the renter can change a request before it is approved.';
    END IF;
    SELECT count(*) INTO included
    FROM public.generate_recurring_occurrences(
      p_frequency, COALESCE(p_weekdays, ARRAY[]::smallint[]), p_local_start, p_local_end,
      p_starts_on, p_ends_on, COALESCE(p_excluded, ARRAY[]::date[])
    ) generated_row
    WHERE NOT generated_row.excluded;
    minutes := EXTRACT(EPOCH FROM (p_local_end - p_local_start))::int / 60;
    hours := round((minutes / 60.0)::numeric, 2);
    new_total := round(booking.unit_price * hours * included, 2);
    old_total := booking.total_price;
    UPDATE public.bookings
    SET total_price = new_total,
        platform_fee = CASE
          WHEN old_total > 0 AND platform_fee IS NOT NULL
            THEN round(platform_fee * new_total / old_total, 2)
          ELSE platform_fee
        END,
        owner_earnings = CASE
          WHEN old_total > 0 AND platform_fee IS NOT NULL
            THEN new_total - round(platform_fee * new_total / old_total, 2)
          ELSE owner_earnings
        END
    WHERE id = booking.id;
    DELETE FROM public.booking_series WHERE booking_id = booking.id;
    PERFORM set_config('findmyspace.preserve_hourly_rate', 'on', true);
    PERFORM public.attach_recurring_series(
      booking.id, p_frequency, COALESCE(p_weekdays, ARRAY[]::smallint[]), p_local_start, p_local_end,
      p_starts_on, p_ends_on, COALESCE(p_excluded, ARRAY[]::date[])
    );
    UPDATE public.booking_charges
    SET amount = new_total,
        billing_period_start = (SELECT start_at FROM public.bookings WHERE id = booking.id),
        billing_period_end = (SELECT end_at FROM public.bookings WHERE id = booking.id)
    WHERE booking_id = booking.id AND charge_type = 'booking_total' AND status = 'pending';
    PERFORM public.record_booking_change(
      booking.space_id, booking.id, NULL, p_actor, 'renter', 'series', 'amend', p_reason,
      jsonb_build_object('total_price', old_total),
      jsonb_build_object('total_price', new_total, 'sessions', included),
      'unpaid_recalculated', 'not_required',
      'The request was amended before approval. No email was sent.'
    );
    RETURN jsonb_build_object('applied', true, 'total_price', new_total, 'message', 'The request was updated.');
  END IF;

  IF p_occurrence_id IS NULL THEN
    RAISE EXCEPTION 'Choose the session to change.';
  END IF;
  SELECT * INTO occurrence
  FROM public.booking_occurrences
  WHERE id = p_occurrence_id AND booking_id = booking.id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found.';
  END IF;

  IF p_scope = 'occurrence' THEN
    IF occurrence.end_at <= now() THEN
      RAISE EXCEPTION 'A completed session cannot be changed.';
    END IF;
    targets := ARRAY[occurrence.id];
  ELSE
    SELECT COALESCE(array_agg(o.id ORDER BY o.occurrence_date), ARRAY[]::uuid[])
    INTO targets
    FROM public.booking_occurrences o
    WHERE o.booking_id = booking.id
      AND NOT o.excluded
      AND o.cancelled_at IS NULL
      AND o.end_at > now()
      AND (p_scope = 'series' OR o.occurrence_date >= occurrence.occurrence_date);
  END IF;
  IF cardinality(targets) < 1 THEN
    RAISE EXCEPTION 'There is no upcoming session in that range.';
  END IF;

  IF booking.status IN ('paid_confirmed', 'confirmed', 'completed') OR booking.payment_status = 'paid' THEN
    IF p_action = 'exclude' THEN
      RAISE EXCEPTION 'paid_immutable: Cancelling a paid session would change the amount already paid. FindMySpace cannot refund or credit that amount in this release, so the session stays in place.';
    END IF;
    IF p_actor_role IS DISTINCT FROM 'manager' THEN
      RAISE EXCEPTION 'not authorized: Ask the host to propose a move. The renter has to accept it before the calendar changes.';
    END IF;
    old_minutes := EXTRACT(EPOCH FROM (occurrence.end_at - occurrence.start_at))::int / 60;
    minutes := EXTRACT(EPOCH FROM (p_new_end - p_new_start))::int / 60;
    IF minutes IS DISTINCT FROM old_minutes OR minutes <= 0 OR minutes % 30 <> 0 THEN
      RAISE EXCEPTION 'paid_immutable: A paid booking can only move to a time of the same length. Changing the hours would change the amount paid, and that adjustment is not available yet.';
    END IF;
    local_start := (p_new_start AT TIME ZONE 'Africa/Johannesburg')::time;
    local_end := (p_new_end AT TIME ZONE 'Africa/Johannesburg')::time;
    FOR target IN SELECT unnest(targets) LOOP
      SELECT start_at, end_at, occurrence_date INTO old_start, old_end, p_starts_on
      FROM public.booking_occurrences WHERE id = target;
      IF p_scope = 'occurrence' THEN
        new_start := p_new_start;
        new_end := p_new_end;
      ELSE
        new_start := ((p_starts_on + local_start) AT TIME ZONE 'Africa/Johannesburg');
        new_end := ((p_starts_on + local_end) AT TIME ZONE 'Africa/Johannesburg');
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.space_availability_conflicts(
          booking.space_id, new_start, new_end, booking.id, true
        )
      ) THEN
        RAISE EXCEPTION 'space_unavailable: That time is not available. The original session was kept.';
      END IF;
      proposed := proposed || jsonb_build_array(jsonb_build_object(
        'occurrence_id', target, 'start_at', new_start, 'end_at', new_end,
        'previous_start', old_start, 'previous_end', old_end
      ));
    END LOOP;
    INSERT INTO public.booking_change_requests (
      booking_id, space_id, occurrence_id, change_scope, proposed, reason, requested_by, financial_effect
    ) VALUES (
      booking.id, booking.space_id, p_occurrence_id, p_scope, proposed, NULLIF(btrim(COALESCE(p_reason, '')), ''),
      p_actor, 'unchanged_paid'
    )
    RETURNING id INTO request_id;
    notice := 'The host proposed a move. The sessions stay where they are until the renter accepts. No email was sent.';
    PERFORM public.record_booking_change(
      booking.space_id, booking.id, NULL, p_actor, 'manager', p_scope, 'propose_reschedule', p_reason,
      jsonb_build_object('occurrence_id', p_occurrence_id), proposed, 'unchanged_paid', 'pending_renter', notice
    );
    RETURN jsonb_build_object(
      'applied', false, 'change_request_id', request_id, 'message', notice
    );
  END IF;

  IF booking.status NOT IN ('pending', 'pending_owner') OR p_actor IS DISTINCT FROM booking.renter_id THEN
    RAISE EXCEPTION 'not authorized: Only the renter can change a request before it is approved.';
  END IF;

  IF p_action = 'exclude' THEN
    UPDATE public.booking_occurrences
    SET excluded = true
    WHERE id = ANY (targets);
    UPDATE public.booking_series
    SET excluded_dates = (
          SELECT COALESCE(array_agg(DISTINCT d ORDER BY d), ARRAY[]::date[])
          FROM (
            SELECT unnest(excluded_dates) AS d
            UNION
            SELECT o.occurrence_date FROM public.booking_occurrences o WHERE o.id = ANY (targets)
          ) dates
        ),
        session_count = (
          SELECT count(*) FROM public.booking_occurrences o
          WHERE o.booking_id = booking.id AND NOT o.excluded AND o.cancelled_at IS NULL
        )
    WHERE booking_id = booking.id;
  ELSE
    IF p_new_end <= p_new_start THEN
      RAISE EXCEPTION 'The end time must be after the start time.';
    END IF;
    local_start := (p_new_start AT TIME ZONE 'Africa/Johannesburg')::time;
    local_end := (p_new_end AT TIME ZONE 'Africa/Johannesburg')::time;
    minutes := EXTRACT(EPOCH FROM (p_new_end - p_new_start))::int / 60;
    IF minutes <= 0 OR minutes % 30 <> 0 OR minutes > 720 THEN
      RAISE EXCEPTION 'Each session must be a 30-minute interval of at most 12 hours.';
    END IF;
    FOR target IN SELECT unnest(targets) LOOP
      SELECT o.start_at, o.end_at, o.occurrence_date INTO old_start, old_end, p_starts_on
      FROM public.booking_occurrences o WHERE o.id = target;
      IF p_scope = 'occurrence' THEN
        new_start := p_new_start;
        new_end := p_new_end;
      ELSE
        new_start := ((p_starts_on + local_start) AT TIME ZONE 'Africa/Johannesburg');
        new_end := ((p_starts_on + local_end) AT TIME ZONE 'Africa/Johannesburg');
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.space_availability_conflicts(
          booking.space_id, new_start, new_end, booking.id, true
        )
      ) OR EXISTS (
        SELECT 1 FROM public.booking_occurrences o
        WHERE o.booking_id = booking.id
          AND o.id <> ALL (targets)
          AND NOT o.excluded
          AND o.cancelled_at IS NULL
          AND o.start_at < new_end
          AND o.end_at > new_start
      ) THEN
        RAISE EXCEPTION 'space_unavailable: That time is not available. The original session was kept.';
      END IF;
      proposed := proposed || jsonb_build_array(jsonb_build_object(
        'occurrence_id', target, 'start_at', new_start, 'end_at', new_end
      ));
      UPDATE public.booking_occurrences
      SET moved_from_start = COALESCE(moved_from_start, start_at),
          moved_from_end = COALESCE(moved_from_end, end_at),
          occurrence_date = (new_start AT TIME ZONE 'Africa/Johannesburg')::date,
          start_at = new_start,
          end_at = new_end
      WHERE id = target;
    END LOOP;
  END IF;

  SELECT COALESCE(round(sum(EXTRACT(EPOCH FROM (end_at - start_at)) / 3600.0)::numeric, 2), 0)
  INTO hours
  FROM public.booking_occurrences
  WHERE booking_id = booking.id AND NOT excluded AND cancelled_at IS NULL;
  new_total := round(booking.unit_price * hours, 2);
  old_total := booking.total_price;
  new_fee := CASE
    WHEN old_total > 0 AND booking.platform_fee IS NOT NULL
      THEN round(booking.platform_fee * new_total / old_total, 2)
    ELSE booking.platform_fee
  END;
  UPDATE public.bookings
  SET total_price = new_total,
      billed_quantity = hours,
      platform_fee = new_fee,
      owner_earnings = CASE WHEN new_fee IS NOT NULL THEN new_total - new_fee ELSE owner_earnings END,
      start_at = (
        SELECT min(start_at) FROM public.booking_occurrences
        WHERE booking_id = booking.id AND NOT excluded AND cancelled_at IS NULL
      ),
      end_at = (
        SELECT max(end_at) FROM public.booking_occurrences
        WHERE booking_id = booking.id AND NOT excluded AND cancelled_at IS NULL
      )
  WHERE id = booking.id;
  UPDATE public.booking_charges
  SET amount = new_total
  WHERE booking_id = booking.id AND charge_type = 'booking_total' AND status = 'pending';
  financial := CASE WHEN new_total IS DISTINCT FROM old_total THEN 'unpaid_recalculated' ELSE 'none' END;
  PERFORM public.record_booking_change(
    booking.space_id, booking.id, NULL, p_actor, 'renter', p_scope, p_action, p_reason,
    jsonb_build_object('total_price', old_total),
    jsonb_build_object('total_price', new_total, 'sessions', proposed),
    financial, 'not_required',
    'The renter changed the request before approval. No email was sent.'
  );
  RETURN jsonb_build_object('applied', true, 'total_price', new_total, 'message', 'The request was updated.');
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_booking_change_request(
  p_request_id uuid,
  p_actor uuid,
  p_accept boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  change public.booking_change_requests%ROWTYPE;
  booking public.bookings%ROWTYPE;
  item jsonb;
  occ_id uuid;
  new_start timestamptz;
  new_end timestamptz;
  moved uuid[] := ARRAY[]::uuid[];
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT * INTO change FROM public.booking_change_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR change.status <> 'pending_renter' THEN
    RAISE EXCEPTION 'That change is no longer waiting for the renter.';
  END IF;
  IF change.expires_at IS NOT NULL AND change.expires_at <= now() THEN
    UPDATE public.booking_change_requests
    SET status = 'expired', decided_at = now(), decided_by = p_actor
    WHERE id = change.id;
    RETURN jsonb_build_object('applied', false, 'message', 'That proposal has expired. The original session was kept.');
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(change.proposed) proposal_item
    JOIN public.booking_occurrences o ON o.id = (proposal_item->>'occurrence_id')::uuid
    WHERE o.booking_id = change.booking_id
      AND (
        o.cancelled_at IS NOT NULL
        OR o.excluded
        OR o.end_at <= now()
        OR (proposal_item ? 'previous_start' AND o.start_at IS DISTINCT FROM (proposal_item->>'previous_start')::timestamptz)
        OR (proposal_item ? 'previous_end' AND o.end_at IS DISTINCT FROM (proposal_item->>'previous_end')::timestamptz)
      )
  ) THEN
    UPDATE public.booking_change_requests
    SET status = 'expired', decided_at = now(), decided_by = p_actor
    WHERE id = change.id;
    RETURN jsonb_build_object('applied', false, 'message', 'That session has changed or already ended. The original time was kept.');
  END IF;
  SELECT * INTO booking FROM public.bookings WHERE id = change.booking_id FOR UPDATE;
  IF p_actor IS DISTINCT FROM booking.renter_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF NOT p_accept THEN
    UPDATE public.booking_change_requests
    SET status = 'declined', decided_at = now(), decided_by = p_actor
    WHERE id = change.id;
    PERFORM public.record_booking_change(
      booking.space_id, booking.id, NULL, p_actor, 'renter', change.change_scope, 'decline_reschedule',
      change.reason, change.proposed, '{}'::jsonb, 'unchanged_paid', 'declined',
      'The renter declined the move. The original sessions remain. No email was sent.'
    );
    RETURN jsonb_build_object('applied', false, 'message', 'The original sessions remain.');
  END IF;

  PERFORM public.lock_space_availability(booking.space_id);
  FOR item IN SELECT value FROM jsonb_array_elements(change.proposed) LOOP
    occ_id := (item->>'occurrence_id')::uuid;
    new_start := (item->>'start_at')::timestamptz;
    new_end := (item->>'end_at')::timestamptz;
    moved := moved || occ_id;
    IF EXISTS (
      SELECT 1 FROM public.space_availability_conflicts(booking.space_id, new_start, new_end, booking.id, true)
    ) OR EXISTS (
      SELECT 1 FROM public.booking_occurrences o
      WHERE o.booking_id = booking.id
        AND NOT (o.id = ANY (moved))
        AND NOT o.excluded AND o.cancelled_at IS NULL
        AND o.start_at < new_end AND o.end_at > new_start
    ) OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(change.proposed) other
      WHERE (other->>'occurrence_id')::uuid <> occ_id
        AND (other->>'start_at')::timestamptz < new_end
        AND (other->>'end_at')::timestamptz > new_start
    ) THEN
      RAISE EXCEPTION 'space_unavailable: That time is no longer available. The original sessions were kept.';
    END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(change.proposed) LOOP
    UPDATE public.booking_occurrences
    SET moved_from_start = COALESCE(moved_from_start, start_at),
        moved_from_end = COALESCE(moved_from_end, end_at),
        occurrence_date = ((item->>'start_at')::timestamptz AT TIME ZONE 'Africa/Johannesburg')::date,
        start_at = (item->>'start_at')::timestamptz,
        end_at = (item->>'end_at')::timestamptz
    WHERE id = (item->>'occurrence_id')::uuid
      AND booking_id = booking.id;
  END LOOP;
  UPDATE public.bookings
  SET start_at = (
        SELECT min(start_at) FROM public.booking_occurrences
        WHERE booking_id = booking.id AND NOT excluded AND cancelled_at IS NULL
      ),
      end_at = (
        SELECT max(end_at) FROM public.booking_occurrences
        WHERE booking_id = booking.id AND NOT excluded AND cancelled_at IS NULL
      )
  WHERE id = booking.id;
  UPDATE public.booking_change_requests
  SET status = 'accepted', decided_at = now(), decided_by = p_actor
  WHERE id = change.id;
  PERFORM public.record_booking_change(
    booking.space_id, booking.id, NULL, p_actor, 'renter', change.change_scope, 'accept_reschedule',
    change.reason, change.proposed, change.proposed, 'unchanged_paid', 'accepted',
    'The renter accepted the move. The paid total is unchanged. No email was sent.'
  );
  RETURN jsonb_build_object('applied', true, 'message', 'The sessions were moved. The paid total is unchanged.');
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_host_booking_response(
  p_booking_id uuid,
  p_actor_id uuid,
  p_action text,
  p_message text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  b public.bookings%ROWTYPE;
  now_ts timestamptz := now();
  competing uuid[] := ARRAY[]::uuid[];
  msg text := NULLIF(btrim(COALESCE(p_message, '')), '');
  overlap_msg text :=
    'Your booking request was declined because another overlapping booking was approved for this space. Thank you for your interest. Please try another date.';
  occurrence record;
  occurrence_count integer;
BEGIN
  IF p_action NOT IN ('approve', 'decline') THEN
    RAISE EXCEPTION 'Invalid action.';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Missing actor.';
  END IF;
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('booking-space:' || b.space_id::text)
  );
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF b.status IS DISTINCT FROM 'pending_owner'
     AND b.status IS DISTINCT FROM 'pending'
     AND NOT (b.status = 'requirements_pending' AND p_action = 'decline') THEN
    RAISE EXCEPTION 'This booking has already been responded to.';
  END IF;
  IF p_action = 'approve' AND COALESCE((to_jsonb(b)->>'requirements_ready')::boolean, true) = false THEN
    RAISE EXCEPTION 'requirements_incomplete: Required information is still missing. This request cannot be approved or paid.';
  END IF;

  IF p_action = 'decline' THEN
    UPDATE public.bookings SET
      status = 'declined',
      payment_status = 'unpaid',
      owner_response_at = now_ts,
      owner_response_by = p_actor_id,
      owner_response_message = msg
    WHERE id = p_booking_id;
    RETURN jsonb_build_object('ok', true, 'competing_ids', competing);
  END IF;

  IF COALESCE(b.reserves_via_occurrences, false) THEN
    SELECT count(*) INTO occurrence_count
    FROM public.booking_occurrences
    WHERE booking_id = b.id AND NOT excluded AND cancelled_at IS NULL;
    IF occurrence_count < 1 THEN
      RAISE EXCEPTION 'space_unavailable: This recurring request has no sessions to reserve.';
    END IF;
    FOR occurrence IN
      SELECT start_at, end_at
      FROM public.booking_occurrences
      WHERE booking_id = b.id AND NOT excluded AND cancelled_at IS NULL
      ORDER BY start_at
    LOOP
      PERFORM public.assert_space_interval_available(
        b.space_id, occurrence.start_at, occurrence.end_at, b.id, true
      );
    END LOOP;
  ELSE
    PERFORM public.assert_space_interval_available(
      b.space_id, b.start_at, b.end_at, b.id, true
    );
  END IF;

  UPDATE public.bookings SET
    status = 'accepted_awaiting_payment',
    payment_status = 'awaiting_payment',
    owner_response_at = now_ts,
    owner_response_by = p_actor_id,
    owner_response_message = msg
  WHERE id = p_booking_id;

  WITH approved_intervals AS (
    SELECT interval_start AS start_at, interval_end AS end_at
    FROM public.booking_reserving_intervals(b.space_id)
    WHERE booking_id = b.id
  ),
  declined AS (
    UPDATE public.bookings x SET
      status = 'declined',
      payment_status = 'unpaid',
      owner_response_at = now_ts,
      owner_response_by = NULL,
      owner_response_message = overlap_msg
    WHERE x.space_id = b.space_id
      AND x.id <> b.id
      AND x.status IN ('pending', 'pending_owner')
      AND (
        (
          NOT COALESCE(x.reserves_via_occurrences, false)
          AND EXISTS (
            SELECT 1 FROM approved_intervals slot
            WHERE x.start_at < slot.end_at AND x.end_at > slot.start_at
          )
        )
        OR (
          COALESCE(x.reserves_via_occurrences, false)
          AND EXISTS (
            SELECT 1
            FROM public.booking_occurrences o
            JOIN approved_intervals slot
              ON o.start_at < slot.end_at AND o.end_at > slot.start_at
            WHERE o.booking_id = x.id
              AND NOT o.excluded
          )
        )
      )
    RETURNING x.id
  )
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO competing FROM declined;

  RETURN jsonb_build_object('ok', true, 'competing_ids', competing);
END;
$$;


DROP FUNCTION IF EXISTS public.split_availability_rule_from_date(uuid, date, smallint[], boolean, time, time, uuid, text);

CREATE OR REPLACE FUNCTION public.split_availability_rule_from_date(
  p_rule_id uuid,
  p_from date,
  p_weekdays smallint[],
  p_whole_day boolean,
  p_local_start time,
  p_local_end time,
  p_actor uuid,
  p_reason text,
  p_confirm boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  rule public.availability_rules%ROWTYPE;
  new_id uuid;
  reserved record;
  hit record;
  exception_row public.availability_rule_exceptions%ROWTYPE;
  incompatible text := '';
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT * INTO rule FROM public.availability_rules WHERE id = p_rule_id AND removed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Availability restriction not found.';
  END IF;
  IF p_from <= rule.starts_on THEN
    RAISE EXCEPTION 'Choose a date after the restriction starts. Edit the whole restriction to change the beginning.';
  END IF;
  IF rule.ends_on IS NOT NULL AND p_from > rule.ends_on THEN
    RAISE EXCEPTION 'That date is after the restriction ends.';
  END IF;
  PERFORM public.lock_space_availability(rule.space_id);

  FOR exception_row IN
    SELECT * FROM public.availability_rule_exceptions
    WHERE rule_id = rule.id AND removed_at IS NULL AND exception_date >= p_from
    ORDER BY exception_date
  LOOP
    IF NOT (EXTRACT(ISODOW FROM exception_row.exception_date)::int = ANY (p_weekdays)) THEN
      incompatible := incompatible || to_char(exception_row.exception_date, 'YYYY-MM-DD') || ' ';
    END IF;
  END LOOP;
  IF incompatible <> '' AND NOT COALESCE(p_confirm, false) THEN
    RAISE EXCEPTION 'exceptions_need_confirmation: These opened or changed dates do not fall on the new blocked days, so their exceptions cannot move. Those dates stay open because they are no longer blocked. Confirm to continue without moving them: %', btrim(incompatible);
  END IF;

  FOR reserved IN
    SELECT booking_id, interval_start, interval_end
    FROM public.booking_reserving_intervals(rule.space_id)
    WHERE interval_end > (p_from::timestamp AT TIME ZONE 'Africa/Johannesburg')
      AND (rule.ends_on IS NULL OR interval_start < ((rule.ends_on + 1)::timestamp AT TIME ZONE 'Africa/Johannesburg'))
  LOOP
    SELECT * INTO hit
    FROM public.availability_rule_blocks(
      p_weekdays, p_whole_day, p_local_start, p_local_end, p_from, rule.ends_on,
      reserved.interval_start, reserved.interval_end, rule.id
    );
    IF hit.occurs THEN
      RAISE EXCEPTION 'space_unavailable: The new restriction overlaps a confirmed booking. The original restriction was kept.';
    END IF;
  END LOOP;

  UPDATE public.availability_rules
  SET ends_on = p_from - 1, updated_by = p_actor, updated_at = now()
  WHERE id = rule.id;
  INSERT INTO public.availability_rules (
    space_id, reason, weekdays, whole_day, local_start, local_end, starts_on, ends_on, created_by, updated_by
  ) VALUES (
    rule.space_id, rule.reason, p_weekdays, p_whole_day,
    CASE WHEN p_whole_day THEN NULL ELSE p_local_start END,
    CASE WHEN p_whole_day THEN NULL ELSE p_local_end END,
    p_from, rule.ends_on, p_actor, p_actor
  )
  RETURNING id INTO new_id;

  INSERT INTO public.availability_rule_exceptions (
    rule_id, space_id, exception_date, action, local_start, local_end, whole_day, reason, created_by
  )
  SELECT new_id, rule.space_id, e.exception_date, e.action, e.local_start, e.local_end, e.whole_day, e.reason, p_actor
  FROM public.availability_rule_exceptions e
  WHERE e.rule_id = rule.id
    AND e.removed_at IS NULL
    AND e.exception_date >= p_from
    AND EXTRACT(ISODOW FROM e.exception_date)::int = ANY (p_weekdays);

  PERFORM public.record_booking_change(
    rule.space_id, NULL, rule.id, p_actor, 'manager', 'this_and_future', 'split_rule', p_reason,
    jsonb_build_object('rule_id', rule.id, 'from', p_from, 'incompatible', NULLIF(btrim(incompatible), '')),
    jsonb_build_object('new_rule_id', new_id),
    'none', 'not_required',
    'Future blocked days use the new restriction. Matching exceptions were copied. Earlier exceptions stay on the original restriction. No email was sent.'
  );
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_booking_requirements(
  p_booking_id uuid,
  p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  b public.bookings%ROWTYPE;
  missing boolean;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;
  IF b.renter_id IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF COALESCE(b.requirements_ready, true) AND b.status IS DISTINCT FROM 'requirements_pending' THEN
    RETURN jsonb_build_object('id', b.id, 'ready', true);
  END IF;
  IF to_regclass('public.space_booking_requirement_fields') IS NOT NULL
     AND to_regclass('public.booking_requirement_responses') IS NOT NULL THEN
    EXECUTE
      'SELECT EXISTS (
         SELECT 1 FROM public.space_booking_requirement_fields f
         WHERE f.space_id = $1 AND f.required IS TRUE AND COALESCE(f.active, true)
           AND NOT EXISTS (
             SELECT 1 FROM public.booking_requirement_responses r
             WHERE r.booking_id = $2 AND r.field_id = f.id
           )
       )'
    INTO missing
    USING b.space_id, b.id;
    IF missing THEN
      RAISE EXCEPTION 'requirements_incomplete: Required answers or documents are still missing.';
    END IF;
  END IF;
  UPDATE public.bookings
  SET requirements_ready = true,
      status = CASE WHEN status = 'requirements_pending' THEN 'pending_owner' ELSE status END
  WHERE id = b.id;
  RETURN jsonb_build_object('id', b.id, 'ready', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_booking_change_request(
  p_request_id uuid,
  p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  change public.booking_change_requests%ROWTYPE;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT * INTO change FROM public.booking_change_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR change.status <> 'pending_renter' THEN
    RAISE EXCEPTION 'That change is no longer waiting for the renter.';
  END IF;
  IF change.requested_by IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.booking_change_requests
  SET status = 'withdrawn', decided_at = now(), decided_by = p_actor
  WHERE id = change.id;
  RETURN jsonb_build_object('applied', false, 'message', 'The proposal was withdrawn. The original session stays in place.');
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_booking_with_discount(
  p_booking_id uuid,
  p_actor_id uuid,
  p_action text,
  p_message text,
  p_discount_type text,
  p_discount_value numeric,
  p_discount_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  b public.bookings%ROWTYPE;
  snap jsonb;
  original numeric;
  discount_amount numeric;
  approved numeric;
  fee numeric;
  earnings numeric;
  result jsonb;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF NULLIF(btrim(COALESCE(p_discount_type, '')), '') IS NULL THEN
    RETURN public.apply_host_booking_response(p_booking_id, p_actor_id, p_action, p_message);
  END IF;
  IF p_action IS DISTINCT FROM 'approve' THEN
    RAISE EXCEPTION 'discount_rejected: A discount is only applied when the request is approved.';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;
  PERFORM public.lock_space_availability(b.space_id);
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  snap := to_jsonb(b);

  IF b.status NOT IN ('pending', 'pending_owner') THEN
    RAISE EXCEPTION 'This booking has already been responded to.';
  END IF;
  IF COALESCE(b.payment_status, 'unpaid') IS DISTINCT FROM 'unpaid' THEN
    RAISE EXCEPTION 'discount_rejected: A discount cannot be applied after payment has started.';
  END IF;
  IF COALESCE((snap->>'requirements_ready')::boolean, true) = false THEN
    RAISE EXCEPTION 'requirements_incomplete: Required information is still missing. This request cannot be approved or paid.';
  END IF;
  IF NULLIF(snap->>'payment_reference', '') IS NOT NULL THEN
    RAISE EXCEPTION 'discount_rejected: Checkout has already started. The approved amount cannot change.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.booking_charges
    WHERE booking_id = b.id AND status = 'paid'
  ) THEN
    RAISE EXCEPTION 'discount_rejected: This booking has already been paid.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.booking_charges
    WHERE booking_id = b.id
      AND charge_type IN ('deposit', 'first_month_rent', 'monthly_deposit')
  ) OR (
    COALESCE(snap->>'booking_unit', '') = 'month'
    AND COALESCE(snap->>'pricing_mode', '') IS DISTINCT FROM 'flexible'
    AND COALESCE((snap->>'deposit_amount')::numeric, 0) > 0
  ) THEN
    RAISE EXCEPTION 'discount_rejected: Legacy monthly deposit bookings keep their existing deposit calculation. A generic discount is not applied.';
  END IF;

  original := round(COALESCE(b.total_price, 0), 2);
  IF original <= 0 THEN
    RAISE EXCEPTION 'discount_rejected: This request has no rental amount that can be discounted. On-request pricing is unchanged.';
  END IF;
  IF p_discount_type = 'percent' THEN
    IF p_discount_value IS NULL OR p_discount_value <= 0 OR p_discount_value > 100 THEN
      RAISE EXCEPTION 'discount_rejected: A percentage discount must be greater than 0 and no more than 100.';
    END IF;
    discount_amount := round(original * p_discount_value / 100, 2);
  ELSIF p_discount_type = 'fixed' THEN
    IF p_discount_value IS NULL OR p_discount_value <= 0 THEN
      RAISE EXCEPTION 'discount_rejected: Enter a discount greater than zero.';
    END IF;
    discount_amount := round(p_discount_value, 2);
  ELSE
    RAISE EXCEPTION 'discount_rejected: Choose a percentage or a fixed amount in rand.';
  END IF;
  IF discount_amount <= 0 OR discount_amount > original THEN
    RAISE EXCEPTION 'discount_rejected: The discount cannot be more than the booking amount.';
  END IF;
  approved := round(original - discount_amount, 2);
  IF approved < 5 THEN
    RAISE EXCEPTION 'discount_rejected: The amount payable must be at least R5.00. A free booking cannot be sent to PayFast in this release.';
  END IF;
  IF (
    SELECT count(*) FROM public.booking_charges
    WHERE booking_id = b.id AND status = 'pending' AND charge_type = 'booking_total'
  ) <> 1 OR EXISTS (
    SELECT 1 FROM public.booking_charges
    WHERE booking_id = b.id AND status = 'pending' AND charge_type <> 'booking_total'
  ) THEN
    RAISE EXCEPTION 'discount_rejected: This booking does not have one pending rental charge, so the discount was not applied.';
  END IF;

  fee := CASE
    WHEN b.platform_fee IS NOT NULL THEN round(b.platform_fee * approved / original, 2)
    ELSE NULL
  END;
  earnings := CASE WHEN fee IS NOT NULL THEN round(approved - fee, 2) ELSE b.owner_earnings END;

  UPDATE public.bookings
  SET original_requested_total = COALESCE(original_requested_total, original),
      total_price = approved,
      platform_fee = fee,
      owner_earnings = earnings
  WHERE id = b.id;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'platform_commission_amount'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'transaction_fee_amount'
  ) THEN
    EXECUTE
      'UPDATE public.bookings
       SET platform_commission_amount = CASE WHEN platform_commission_amount IS NOT NULL THEN round(platform_commission_amount * $1 / $2, 2) ELSE NULL END,
           transaction_fee_amount = CASE WHEN transaction_fee_amount IS NOT NULL THEN round(transaction_fee_amount * $1 / $2, 2) ELSE NULL END
       WHERE id = $3'
    USING approved, original, b.id;
  END IF;

  UPDATE public.booking_charges
  SET amount = approved
  WHERE booking_id = b.id AND charge_type = 'booking_total' AND status = 'pending';

  INSERT INTO public.booking_discounts (
    booking_id, discount_type, discount_value, discount_amount, currency, reason,
    original_rental, approved_rental, platform_fee, host_payout, commercial_snapshot, created_by
  ) VALUES (
    b.id, p_discount_type, round(p_discount_value, 2), discount_amount, 'ZAR',
    NULLIF(btrim(COALESCE(p_discount_reason, '')), ''),
    original, approved, fee, earnings, snap, p_actor_id
  );

  result := public.apply_host_booking_response(p_booking_id, p_actor_id, 'approve', p_message);
  RETURN result || jsonb_build_object(
    'original_rental', original,
    'discount_amount', discount_amount,
    'approved_rental', approved
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bookings_block_incomplete_requirements()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.requirements_ready IS FALSE AND (
    public.booking_status_reserves_availability(NEW.status)
    OR COALESCE(NEW.payment_status, '') IN ('awaiting_payment', 'processing', 'paid')
  ) THEN
    RAISE EXCEPTION 'requirements_incomplete: Required information is still missing. This request cannot be approved or paid.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_block_incomplete_requirements ON public.bookings;
CREATE TRIGGER bookings_block_incomplete_requirements
  BEFORE INSERT OR UPDATE OF status, payment_status, requirements_ready
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.bookings_block_incomplete_requirements();

REVOKE ALL ON FUNCTION public.split_availability_rule_from_date(uuid, date, smallint[], boolean, time, time, uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_booking_requirements(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.withdraw_booking_change_request(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_booking_with_discount(uuid, uuid, text, text, text, numeric, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.split_availability_rule_from_date(uuid, date, smallint[], boolean, time, time, uuid, text, boolean) TO service_role;
    GRANT EXECUTE ON FUNCTION public.finalize_booking_requirements(uuid, uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.withdraw_booking_change_request(uuid, uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.approve_booking_with_discount(uuid, uuid, text, text, text, numeric, text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.create_recurring_booking(jsonb, text, smallint[], time, time, date, date, date[]) TO service_role;
    GRANT EXECUTE ON FUNCTION public.decide_booking_change_request(uuid, uuid, boolean) TO service_role;
    GRANT EXECUTE ON FUNCTION public.apply_host_booking_response(uuid, uuid, text, text) TO service_role;
  END IF;
  IF to_regprocedure('public.user_can_manage_space(uuid)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_discounts' AND policyname = 'booking_discounts_select'
  ) THEN
    CREATE POLICY booking_discounts_select
      ON public.booking_discounts
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.id = booking_discounts.booking_id
            AND (
              b.renter_id = auth.uid()
              OR public.user_can_manage_space(b.space_id)
            )
        )
      );
  END IF;
END $$;
