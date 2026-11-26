-- Phase 4 correction and Phase 5 administration.
-- One transaction creates the parent booking, the series, every occurrence,
-- and the booking charge. A failure rolls all of them back.
-- Requirement files are uploaded after that commit. If that later step fails,
-- the request handler deletes the parent, and the series, occurrences, and
-- charge go with it. A crash between the commit and the file upload can leave
-- a complete request without its files. It cannot leave a parent with no sessions.
-- Re-sending the same client_request_id returns the existing complete booking.
-- Paid totals stay immutable. A later financial adjustment, not built here,
-- would be a separate ledger row (credit, extra charge, or refund) that a
-- renter accepts before any money moves. It must not rewrite total_price,
-- a paid booking_charges row, or a PayFast notification.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS client_request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_renter_client_request_idx
  ON public.bookings (renter_id, client_request_id)
  WHERE client_request_id IS NOT NULL AND renter_id IS NOT NULL;

ALTER TABLE public.booking_occurrences
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS moved_from_start timestamptz,
  ADD COLUMN IF NOT EXISTS moved_from_end timestamptz;

CREATE TABLE IF NOT EXISTS public.booking_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  charge_type text NOT NULL,
  description text,
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.booking_change_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL,
  booking_id uuid,
  rule_id uuid,
  actor_id uuid,
  actor_role text NOT NULL,
  change_scope text NOT NULL,
  action text NOT NULL,
  reason text,
  before_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  financial_effect text NOT NULL,
  agreement_status text NOT NULL,
  notice_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.booking_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  space_id uuid NOT NULL,
  occurrence_id uuid,
  change_scope text NOT NULL,
  status text NOT NULL DEFAULT 'pending_renter',
  proposed jsonb NOT NULL,
  reason text,
  requested_by uuid,
  financial_effect text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid,
  CONSTRAINT booking_change_requests_status_check
    CHECK (status IN ('pending_renter', 'accepted', 'declined'))
);

CREATE INDEX IF NOT EXISTS booking_change_events_booking_idx
  ON public.booking_change_events (booking_id, created_at);
CREATE INDEX IF NOT EXISTS booking_change_requests_booking_idx
  ON public.booking_change_requests (booking_id, status);

CREATE TABLE IF NOT EXISTS public.availability_rule_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.availability_rules (id) ON DELETE CASCADE,
  space_id uuid NOT NULL,
  exception_date date NOT NULL,
  action text NOT NULL,
  local_start time,
  local_end time,
  whole_day boolean,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  CONSTRAINT availability_rule_exceptions_action_check CHECK (action IN ('open', 'override'))
);

CREATE UNIQUE INDEX IF NOT EXISTS availability_rule_exceptions_active_date
  ON public.availability_rule_exceptions (rule_id, exception_date)
  WHERE removed_at IS NULL;

ALTER TABLE public.booking_change_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_rule_exceptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_change_events FROM PUBLIC;
REVOKE ALL ON public.booking_change_requests FROM PUBLIC;
REVOKE ALL ON public.availability_rule_exceptions FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.booking_reserving_intervals(p_space_id uuid)
RETURNS TABLE (
  booking_id uuid,
  interval_start timestamptz,
  interval_end timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT b.id, b.start_at, b.end_at
  FROM public.bookings b
  WHERE b.space_id = p_space_id
    AND public.booking_status_reserves_availability(b.status)
    AND NOT COALESCE(b.reserves_via_occurrences, false)
  UNION ALL
  SELECT o.booking_id, o.start_at, o.end_at
  FROM public.booking_occurrences o
  JOIN public.bookings b ON b.id = o.booking_id
  WHERE o.space_id = p_space_id
    AND NOT o.excluded
    AND o.cancelled_at IS NULL
    AND COALESCE(b.reserves_via_occurrences, false)
    AND public.booking_status_reserves_availability(b.status);
$$;

CREATE OR REPLACE FUNCTION public.availability_rule_blocks(
  p_weekdays smallint[],
  p_whole_day boolean,
  p_local_start time,
  p_local_end time,
  p_starts_on date,
  p_ends_on date,
  p_start timestamptz,
  p_end timestamptz,
  p_rule_id uuid DEFAULT NULL
)
RETURNS TABLE (
  occurs boolean,
  occurs_start timestamptz,
  occurs_end timestamptz
)
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  first_day date;
  last_day date;
  day date;
  query_end timestamp;
  occ_start timestamptz;
  occ_end timestamptz;
  steps integer := 0;
  exception_action text;
  exception_start time;
  exception_end time;
  exception_whole boolean;
  use_whole boolean;
  use_start time;
  use_end time;
BEGIN
  occurs := false;
  occurs_start := NULL;
  occurs_end := NULL;
  IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start OR p_starts_on IS NULL THEN
    RETURN NEXT;
    RETURN;
  END IF;

  first_day := GREATEST(p_starts_on, (p_start AT TIME ZONE 'Africa/Johannesburg')::date);
  query_end := p_end AT TIME ZONE 'Africa/Johannesburg';
  IF query_end::time = time '00:00' THEN
    last_day := query_end::date - 1;
  ELSE
    last_day := query_end::date;
  END IF;
  IF p_ends_on IS NOT NULL THEN
    last_day := LEAST(last_day, p_ends_on);
  END IF;
  IF last_day < first_day THEN
    RETURN NEXT;
    RETURN;
  END IF;

  day := first_day;
  WHILE day <= last_day LOOP
    steps := steps + 1;
    IF steps > 40000 THEN
      RAISE EXCEPTION 'space_unavailable: The period is too long to check in one request.';
    END IF;
    IF EXTRACT(ISODOW FROM day)::int = ANY (p_weekdays) THEN
      exception_action := NULL;
      IF p_rule_id IS NOT NULL THEN
        SELECT e.action, e.local_start, e.local_end, e.whole_day
        INTO exception_action, exception_start, exception_end, exception_whole
        FROM public.availability_rule_exceptions e
        WHERE e.rule_id = p_rule_id
          AND e.exception_date = day
          AND e.removed_at IS NULL;
      END IF;
      IF exception_action IS DISTINCT FROM 'open' THEN
        use_whole := CASE WHEN exception_action = 'override' THEN COALESCE(exception_whole, false) ELSE p_whole_day END;
        use_start := CASE WHEN exception_action = 'override' THEN exception_start ELSE p_local_start END;
        use_end := CASE WHEN exception_action = 'override' THEN exception_end ELSE p_local_end END;
        IF use_whole THEN
          occ_start := (day::timestamp AT TIME ZONE 'Africa/Johannesburg');
          occ_end := ((day + 1)::timestamp AT TIME ZONE 'Africa/Johannesburg');
        ELSE
          occ_start := ((day + use_start) AT TIME ZONE 'Africa/Johannesburg');
          occ_end := ((day + use_end) AT TIME ZONE 'Africa/Johannesburg');
        END IF;
        IF occ_start < p_end AND occ_end > p_start THEN
          occurs := true;
          occurs_start := occ_start;
          occurs_end := occ_end;
          RETURN NEXT;
          RETURN;
        END IF;
      END IF;
    END IF;
    day := day + 1;
  END LOOP;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.attach_recurring_series(
  p_booking_id uuid,
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
  booking public.bookings%ROWTYPE;
  occurrence record;
  series_id uuid;
  included integer := 0;
  generated integer := 0;
  minutes integer;
  hours numeric;
  conflict_dates text[] := ARRAY[]::text[];
  sessions jsonb := '[]'::jsonb;
  space_enabled boolean;
  space_max integer;
  space_min numeric;
  legacy_hour numeric;
  price_amount_hour numeric;
  listed_hour numeric;
  rate_rows integer;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;
  IF NOT COALESCE(booking.reserves_via_occurrences, false) THEN
    RAISE EXCEPTION 'space_unavailable: This booking is not a recurring series.';
  END IF;
  IF booking.status NOT IN ('pending', 'pending_owner') THEN
    RAISE EXCEPTION 'This booking has already been responded to.';
  END IF;

  PERFORM public.lock_space_availability(booking.space_id);

  SELECT
    s.recurring_bookings_enabled,
    s.recurring_max_occurrences,
    s.min_booking_hours,
    s.price_per_hour,
    CASE WHEN s.price_unit = 'hour' THEN s.price_amount ELSE NULL END
  INTO space_enabled, space_max, space_min, legacy_hour, price_amount_hour
  FROM public.spaces s
  WHERE s.id = booking.space_id;
  IF EXISTS (SELECT 1 FROM public.booking_series WHERE booking_id = booking.id) THEN
    RAISE EXCEPTION 'space_unavailable: This booking already has a recurring schedule.';
  END IF;

  SELECT count(*) INTO rate_rows
  FROM public.space_booking_rates
  WHERE space_id = booking.space_id AND enabled;
  SELECT amount INTO listed_hour
  FROM public.space_booking_rates
  WHERE space_id = booking.space_id AND period = 'hour' AND enabled;
  IF rate_rows > 0 THEN
    IF listed_hour IS NULL THEN
      RAISE EXCEPTION 'space_unavailable: Recurring sessions use the hourly price. Enable Per hour and enter a price.';
    END IF;
  ELSE
    listed_hour := COALESCE(legacy_hour, price_amount_hour);
  END IF;
  IF coalesce(current_setting('findmyspace.preserve_hourly_rate', true), '') = 'on' THEN
    listed_hour := booking.unit_price;
  ELSIF NOT COALESCE(space_enabled, false) THEN
    RAISE EXCEPTION 'space_unavailable: Recurring bookings are not enabled for this space.';
  END IF;
  IF listed_hour IS NULL OR listed_hour <= 0 OR booking.unit_price IS DISTINCT FROM listed_hour THEN
    RAISE EXCEPTION 'space_unavailable: The hourly price does not match this listing.';
  END IF;

  minutes := EXTRACT(EPOCH FROM (p_local_end - p_local_start))::int / 60;
  IF minutes <= 0 OR minutes % 30 <> 0 OR minutes > 720
     OR (minutes / 60.0) < GREATEST(COALESCE(space_min, 1), 1) THEN
    RAISE EXCEPTION 'space_unavailable: Each session must be a 30-minute interval of at least 1 hour and at most 12 hours.';
  END IF;
  hours := round((minutes / 60.0)::numeric, 2);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', generated_row.occurrence_date,
    'start', generated_row.start_at,
    'end', generated_row.end_at,
    'excluded', generated_row.excluded
  ) ORDER BY generated_row.occurrence_date), '[]'::jsonb)
  INTO sessions
  FROM public.generate_recurring_occurrences(
    p_frequency, p_weekdays, p_local_start, p_local_end, p_starts_on, p_ends_on, p_excluded
  ) AS generated_row;
  SELECT count(*) INTO generated FROM jsonb_array_elements(sessions);
  SELECT count(*) INTO included
  FROM jsonb_array_elements(sessions) AS session_row
  WHERE NOT (session_row.value->>'excluded')::boolean;
  IF generated > 750 THEN
    RAISE EXCEPTION 'space_unavailable: That pattern creates too many sessions. Shorten the date range.';
  END IF;
  IF included < 1 THEN
    RAISE EXCEPTION 'space_unavailable: Include at least one session.';
  END IF;
  IF space_max IS NOT NULL AND included > space_max THEN
    RAISE EXCEPTION 'space_unavailable: This listing allows at most % sessions in one request.', space_max;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_excluded, ARRAY[]::date[])) AS excluded_date
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(sessions) AS session_row
      WHERE (session_row.value->>'date')::date = excluded_date
    )
  ) THEN
    RAISE EXCEPTION 'space_unavailable: An excluded date is not one of the generated sessions.';
  END IF;
  IF round(booking.unit_price * hours * included, 2) IS DISTINCT FROM round(booking.total_price, 2) THEN
    RAISE EXCEPTION 'space_unavailable: The booking total does not match the hourly price.';
  END IF;

  FOR occurrence IN
    SELECT
      (session_row.value->>'date')::date AS occurrence_date,
      (session_row.value->>'start')::timestamptz AS start_at,
      (session_row.value->>'end')::timestamptz AS end_at
    FROM jsonb_array_elements(sessions) AS session_row
    WHERE NOT (session_row.value->>'excluded')::boolean
    ORDER BY 1
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.space_availability_conflicts(
        booking.space_id, occurrence.start_at, occurrence.end_at, booking.id, true
      )
    ) THEN
      IF cardinality(conflict_dates) < 8 THEN
        conflict_dates := conflict_dates || to_char(occurrence.occurrence_date, 'YYYY-MM-DD');
      END IF;
    END IF;
  END LOOP;
  IF cardinality(conflict_dates) > 0 THEN
    RAISE EXCEPTION 'space_unavailable: These sessions are not available: %.',
      array_to_string(conflict_dates, ', ');
  END IF;

  INSERT INTO public.booking_series (
    booking_id, frequency, weekdays, local_start, local_end, starts_on, ends_on,
    excluded_dates, session_count, hours_per_session, hourly_rate
  ) VALUES (
    booking.id, p_frequency, p_weekdays, p_local_start, p_local_end, p_starts_on, p_ends_on,
    COALESCE(p_excluded, ARRAY[]::date[]), included, hours, booking.unit_price
  )
  RETURNING id INTO series_id;

  INSERT INTO public.booking_occurrences (
    booking_id, series_id, space_id, occurrence_date, start_at, end_at, excluded
  )
  SELECT
    booking.id,
    series_id,
    booking.space_id,
    (session_row.value->>'date')::date,
    (session_row.value->>'start')::timestamptz,
    (session_row.value->>'end')::timestamptz,
    (session_row.value->>'excluded')::boolean
  FROM jsonb_array_elements(sessions) AS session_row;

  UPDATE public.bookings
  SET start_at = (
        SELECT min((session_row.value->>'start')::timestamptz)
        FROM jsonb_array_elements(sessions) AS session_row
        WHERE NOT (session_row.value->>'excluded')::boolean
      ),
      end_at = (
        SELECT max((session_row.value->>'end')::timestamptz)
        FROM jsonb_array_elements(sessions) AS session_row
        WHERE NOT (session_row.value->>'excluded')::boolean
      ),
      billed_quantity = round(hours * included, 2)
  WHERE id = booking.id;

  RETURN jsonb_build_object(
    'series_id', series_id,
    'session_count', included,
    'hours_per_session', hours
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.space_availability_conflicts(
  p_space_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_ignore_booking_id uuid DEFAULT NULL,
  p_include_blocks boolean DEFAULT true
)
RETURNS TABLE (
  conflict_kind text,
  conflict_id uuid,
  conflict_start timestamptz,
  conflict_end timestamptz,
  conflict_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT 'booking'::text, x.id, x.start_at, x.end_at, x.status
  FROM public.bookings x
  WHERE x.space_id = p_space_id
    AND (p_ignore_booking_id IS NULL OR x.id <> p_ignore_booking_id)
    AND NOT COALESCE(x.reserves_via_occurrences, false)
    AND public.booking_status_reserves_availability(x.status)
    AND x.start_at < p_end
    AND x.end_at > p_start
  UNION ALL
  SELECT 'occurrence'::text, o.id, o.start_at, o.end_at, b.status
  FROM public.booking_occurrences o
  JOIN public.bookings b ON b.id = o.booking_id
  WHERE o.space_id = p_space_id
    AND NOT o.excluded
    AND o.cancelled_at IS NULL
    AND COALESCE(b.reserves_via_occurrences, false)
    AND (p_ignore_booking_id IS NULL OR b.id <> p_ignore_booking_id)
    AND public.booking_status_reserves_availability(b.status)
    AND o.start_at < p_end
    AND o.end_at > p_start
  UNION ALL
  SELECT 'block'::text, d.id, d.start_at, d.end_at, NULL::text
  FROM public.blocked_dates d
  WHERE p_include_blocks
    AND d.space_id = p_space_id
    AND d.start_at < p_end
    AND d.end_at > p_start
  UNION ALL
  SELECT 'rule'::text, r.id, c.occurs_start, c.occurs_end, NULL::text
  FROM public.availability_rules r
  CROSS JOIN LATERAL public.availability_rule_blocks(
    r.weekdays, r.whole_day, r.local_start, r.local_end, r.starts_on, r.ends_on,
    p_start, p_end, r.id
  ) c
  WHERE p_include_blocks
    AND r.removed_at IS NULL
    AND r.space_id = p_space_id
    AND c.occurs;
$$;

CREATE OR REPLACE FUNCTION public.record_booking_change(
  p_space_id uuid,
  p_booking_id uuid,
  p_rule_id uuid,
  p_actor uuid,
  p_actor_role text,
  p_scope text,
  p_action text,
  p_reason text,
  p_before jsonb,
  p_after jsonb,
  p_financial text,
  p_agreement text,
  p_notice text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  INSERT INTO public.booking_change_events (
    space_id, booking_id, rule_id, actor_id, actor_role, change_scope, action,
    reason, before_values, after_values, financial_effect, agreement_status, notice_text
  ) VALUES (
    p_space_id, p_booking_id, p_rule_id, p_actor, p_actor_role, p_scope, p_action,
    NULLIF(btrim(COALESCE(p_reason, '')), ''),
    COALESCE(p_before, '{}'::jsonb), COALESCE(p_after, '{}'::jsonb),
    p_financial, p_agreement, p_notice
  )
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

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
    'client_request_id'
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
        RETURN jsonb_build_object('id', existing, 'reused', true);
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

  cols := cols || ARRAY['status','payment_status','reserves_via_occurrences','pricing_mode']::text[];
  vals := vals || ARRAY['''pending_owner''::text','''unpaid''::text','true','''recurring''::text']::text[];
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

  INSERT INTO public.booking_charges (
    booking_id, charge_type, description, billing_period_start, billing_period_end, amount, currency, status
  )
  SELECT b.id, 'booking_total', 'Booking total', b.start_at, b.end_at, b.total_price, 'ZAR', 'pending'
  FROM public.bookings b
  WHERE b.id = new_id;

  RETURN jsonb_build_object('id', new_id, 'reused', false);
EXCEPTION
  WHEN unique_violation THEN
    IF request_id IS NOT NULL AND renter IS NOT NULL THEN
      SELECT b.id INTO existing
      FROM public.bookings b
      WHERE b.renter_id = renter AND b.client_request_id = request_id;
      IF existing IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.booking_series WHERE booking_id = existing
      ) THEN
        RETURN jsonb_build_object('id', existing, 'reused', true);
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

  IF booking.status IN ('accepted_awaiting_payment', 'awaiting_payment', 'approved')
     OR booking.payment_status IN ('awaiting_payment', 'processing') THEN
    RAISE EXCEPTION 'payment_requested: This booking is awaiting payment. The approved total stays as it is. Decline it and submit a new request if the schedule must change. A payment that has already started is left untouched.';
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

CREATE OR REPLACE FUNCTION public.open_availability_exception(
  p_rule_id uuid,
  p_date date,
  p_action text,
  p_local_start time,
  p_local_end time,
  p_whole_day boolean,
  p_actor uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  rule public.availability_rules%ROWTYPE;
  new_id uuid;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_action NOT IN ('open', 'override') THEN
    RAISE EXCEPTION 'Choose whether to open the date or change that one block.';
  END IF;
  SELECT * INTO rule FROM public.availability_rules WHERE id = p_rule_id AND removed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Availability restriction not found.';
  END IF;
  IF p_date < rule.starts_on OR (rule.ends_on IS NOT NULL AND p_date > rule.ends_on) THEN
    RAISE EXCEPTION 'That date is outside this restriction.';
  END IF;
  IF NOT (EXTRACT(ISODOW FROM p_date)::int = ANY (rule.weekdays)) THEN
    RAISE EXCEPTION 'That date is not one of the blocked days.';
  END IF;
  PERFORM public.lock_space_availability(rule.space_id);
  INSERT INTO public.availability_rule_exceptions (
    rule_id, space_id, exception_date, action, local_start, local_end, whole_day, reason, created_by
  ) VALUES (
    rule.id, rule.space_id, p_date, p_action, p_local_start, p_local_end, COALESCE(p_whole_day, false),
    NULLIF(btrim(COALESCE(p_reason, '')), ''), p_actor
  )
  RETURNING id INTO new_id;
  PERFORM public.record_booking_change(
    rule.space_id, NULL, rule.id, p_actor, 'manager', 'occurrence', 'rule_exception', p_reason,
    jsonb_build_object('date', p_date),
    jsonb_build_object('action', p_action, 'exception_id', new_id),
    'none', 'not_required', 'The restriction remains. This date is an exception. No email was sent.'
  );
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_availability_exception(
  p_exception_id uuid,
  p_actor uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  exception_row public.availability_rule_exceptions%ROWTYPE;
  rule public.availability_rules%ROWTYPE;
  block_start timestamptz;
  block_end timestamptz;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT * INTO exception_row
  FROM public.availability_rule_exceptions
  WHERE id = p_exception_id AND removed_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exception not found.';
  END IF;
  SELECT * INTO rule FROM public.availability_rules WHERE id = exception_row.rule_id FOR UPDATE;
  PERFORM public.lock_space_availability(rule.space_id);
  IF rule.whole_day THEN
    block_start := (exception_row.exception_date::timestamp AT TIME ZONE 'Africa/Johannesburg');
    block_end := ((exception_row.exception_date + 1)::timestamp AT TIME ZONE 'Africa/Johannesburg');
  ELSE
    block_start := ((exception_row.exception_date + rule.local_start) AT TIME ZONE 'Africa/Johannesburg');
    block_end := ((exception_row.exception_date + rule.local_end) AT TIME ZONE 'Africa/Johannesburg');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.space_availability_conflicts(rule.space_id, block_start, block_end, NULL, false)
  ) THEN
    RAISE EXCEPTION 'space_unavailable: A confirmed booking now uses that time. The date stays open.';
  END IF;
  UPDATE public.availability_rule_exceptions
  SET removed_at = now()
  WHERE id = exception_row.id;
  PERFORM public.record_booking_change(
    rule.space_id, NULL, rule.id, p_actor, 'manager', 'occurrence', 'restore_exception', NULL,
    jsonb_build_object('date', exception_row.exception_date),
    jsonb_build_object('restored', true),
    'none', 'not_required', 'The blocked occurrence was restored. No email was sent.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.split_availability_rule_from_date(
  p_rule_id uuid,
  p_from date,
  p_weekdays smallint[],
  p_whole_day boolean,
  p_local_start time,
  p_local_end time,
  p_actor uuid,
  p_reason text
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
  FOR reserved IN
    SELECT booking_id, interval_start, interval_end
    FROM public.booking_reserving_intervals(rule.space_id)
    WHERE interval_end > (p_from::timestamp AT TIME ZONE 'Africa/Johannesburg')
      AND (rule.ends_on IS NULL OR interval_start < ((rule.ends_on + 1)::timestamp AT TIME ZONE 'Africa/Johannesburg'))
  LOOP
    SELECT * INTO hit
    FROM public.availability_rule_blocks(
      p_weekdays, p_whole_day, p_local_start, p_local_end, p_from, rule.ends_on,
      reserved.interval_start, reserved.interval_end, NULL
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
  PERFORM public.record_booking_change(
    rule.space_id, NULL, rule.id, p_actor, 'manager', 'this_and_future', 'split_rule', p_reason,
    jsonb_build_object('rule_id', rule.id, 'from', p_from),
    jsonb_build_object('new_rule_id', new_id),
    'none', 'not_required', 'Future blocked days use the new restriction. Earlier days stay on the original one. No email was sent.'
  );
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_availability_rule(
  p_space_id uuid,
  p_actor uuid,
  p_rule jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  rule_id uuid;
  v_reason text;
  v_days smallint[];
  v_whole_day boolean;
  v_local_start time;
  v_local_end time;
  v_starts_on date;
  v_ends_on date;
  booking record;
  hit record;
  saved public.availability_rules%ROWTYPE;
  when_label text;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_space_id IS NULL OR p_actor IS NULL THEN
    RAISE EXCEPTION 'space_unavailable: A space and an administrator are required.';
  END IF;

  v_reason := NULLIF(btrim(COALESCE(p_rule->>'reason', '')), '');
  IF v_reason IS NOT NULL AND char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'space_unavailable: Keep the reason under 500 characters.';
  END IF;

  SELECT COALESCE(array_agg(day_value ORDER BY day_value), ARRAY[]::smallint[])
  INTO v_days
  FROM (
    SELECT DISTINCT value::smallint AS day_value
    FROM jsonb_array_elements_text(COALESCE(p_rule->'weekdays', '[]'::jsonb)) AS value
    WHERE value ~ '^[1-7]$'
  ) parsed;

  IF v_days IS NULL OR cardinality(v_days) < 1
     OR cardinality(v_days) <> jsonb_array_length(COALESCE(p_rule->'weekdays', '[]'::jsonb)) THEN
    RAISE EXCEPTION 'space_unavailable: Choose at least one day of the week.';
  END IF;

  v_whole_day := COALESCE((p_rule->>'wholeDay')::boolean, false);
  IF v_whole_day THEN
    v_local_start := NULL;
    v_local_end := NULL;
  ELSE
    v_local_start := NULLIF(p_rule->>'localStart', '')::time;
    v_local_end := NULLIF(p_rule->>'localEnd', '')::time;
    IF v_local_start IS NULL OR v_local_end IS NULL OR v_local_end <= v_local_start THEN
      RAISE EXCEPTION 'space_unavailable: The end time must be after the start time on the same day.';
    END IF;
  END IF;

  v_starts_on := NULLIF(p_rule->>'startsOn', '')::date;
  v_ends_on := NULLIF(p_rule->>'endsOn', '')::date;
  IF v_starts_on IS NULL THEN
    RAISE EXCEPTION 'space_unavailable: Choose the date the restriction starts.';
  END IF;
  IF v_ends_on IS NOT NULL AND v_ends_on < v_starts_on THEN
    RAISE EXCEPTION 'space_unavailable: The end date must be on or after the start date.';
  END IF;

  PERFORM public.lock_space_availability(p_space_id);
  PERFORM 1 FROM public.bookings
  WHERE space_id = p_space_id
    AND public.booking_status_reserves_availability(status)
  FOR UPDATE;

  FOR booking IN
    SELECT booking_id AS id, interval_start AS start_at, interval_end AS end_at
    FROM public.booking_reserving_intervals(p_space_id)
    WHERE interval_end > (v_starts_on::timestamp AT TIME ZONE 'Africa/Johannesburg')
      AND (
        v_ends_on IS NULL
        OR interval_start < ((v_ends_on + 1)::timestamp AT TIME ZONE 'Africa/Johannesburg')
      )
  LOOP
    SELECT * INTO hit
    FROM public.availability_rule_blocks(
      v_days, v_whole_day, v_local_start, v_local_end, v_starts_on, v_ends_on,
      booking.start_at, booking.end_at, NULLIF(p_rule->>'id', '')::uuid
    );
    IF hit.occurs THEN
      when_label := to_char(booking.start_at AT TIME ZONE 'Africa/Johannesburg', 'YYYY-MM-DD HH24:MI')
        || ' to '
        || to_char(booking.end_at AT TIME ZONE 'Africa/Johannesburg', 'YYYY-MM-DD HH24:MI')
        || ' SAST';
      RAISE EXCEPTION 'space_unavailable: This restriction overlaps a confirmed booking from %.', when_label;
    END IF;
  END LOOP;

  rule_id := NULLIF(p_rule->>'id', '')::uuid;
  IF rule_id IS NULL THEN
    INSERT INTO public.availability_rules (
      space_id, reason, weekdays, whole_day, local_start, local_end,
      starts_on, ends_on, created_by, updated_by
    ) VALUES (
      p_space_id, v_reason, v_days, v_whole_day, v_local_start, v_local_end,
      v_starts_on, v_ends_on, p_actor, p_actor
    )
    RETURNING * INTO saved;
  ELSE
    UPDATE public.availability_rules
    SET reason = v_reason,
        weekdays = v_days,
        whole_day = v_whole_day,
        local_start = v_local_start,
        local_end = v_local_end,
        starts_on = v_starts_on,
        ends_on = v_ends_on,
        updated_by = p_actor,
        updated_at = now()
    WHERE id = rule_id
      AND space_id = p_space_id
      AND removed_at IS NULL
    RETURNING * INTO saved;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Availability restriction not found.';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', saved.id,
    'space_id', saved.space_id,
    'reason', saved.reason,
    'weekdays', to_jsonb(saved.weekdays),
    'whole_day', saved.whole_day,
    'local_start', to_char(saved.local_start, 'HH24:MI'),
    'local_end', to_char(saved.local_end, 'HH24:MI'),
    'starts_on', saved.starts_on,
    'ends_on', saved.ends_on
  );
END;
$$;


REVOKE ALL ON FUNCTION public.record_booking_change(uuid, uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_recurring_booking(jsonb, text, smallint[], time, time, date, date, date[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manage_recurring_booking(uuid, uuid, text, text, timestamptz, timestamptz, uuid, text, text, text, smallint[], time, time, date, date, date[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decide_booking_change_request(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_availability_exception(uuid, date, text, time, time, boolean, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_availability_exception(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.split_availability_rule_from_date(uuid, date, smallint[], boolean, time, time, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.availability_rule_blocks(smallint[], boolean, time, time, date, date, timestamptz, timestamptz, uuid) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.record_booking_change(uuid, uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, text, text, text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.create_recurring_booking(jsonb, text, smallint[], time, time, date, date, date[]) TO service_role;
    GRANT EXECUTE ON FUNCTION public.manage_recurring_booking(uuid, uuid, text, text, timestamptz, timestamptz, uuid, text, text, text, smallint[], time, time, date, date, date[]) TO service_role;
    GRANT EXECUTE ON FUNCTION public.decide_booking_change_request(uuid, uuid, boolean) TO service_role;
    GRANT EXECUTE ON FUNCTION public.open_availability_exception(uuid, date, text, time, time, boolean, uuid, text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.restore_availability_exception(uuid, uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.split_availability_rule_from_date(uuid, date, smallint[], boolean, time, time, uuid, text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.availability_rule_blocks(smallint[], boolean, time, time, date, date, timestamptz, timestamptz, uuid) TO service_role;
  END IF;
  IF to_regprocedure('public.user_can_manage_space(uuid)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RETURN;
  END IF;
  GRANT SELECT ON public.booking_change_events TO authenticated;
  GRANT SELECT ON public.booking_change_requests TO authenticated;
  GRANT SELECT ON public.availability_rule_exceptions TO authenticated;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'availability_rule_exceptions' AND policyname = 'availability_rule_exceptions_select'
  ) THEN
    CREATE POLICY availability_rule_exceptions_select
      ON public.availability_rule_exceptions
      FOR SELECT TO authenticated
      USING (public.user_can_manage_space(space_id));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_change_events' AND policyname = 'booking_change_events_select'
  ) THEN
    CREATE POLICY booking_change_events_select
      ON public.booking_change_events
      FOR SELECT TO authenticated
      USING (
        public.user_can_manage_space(space_id)
        OR EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.id = booking_change_events.booking_id AND b.renter_id = auth.uid()
        )
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_change_requests' AND policyname = 'booking_change_requests_select'
  ) THEN
    CREATE POLICY booking_change_requests_select
      ON public.booking_change_requests
      FOR SELECT TO authenticated
      USING (
        public.user_can_manage_space(space_id)
        OR EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.id = booking_change_requests.booking_id AND b.renter_id = auth.uid()
        )
      );
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.bookings_guard_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  occurrence record;
BEGIN
  IF NEW.start_at IS NULL OR NEW.end_at IS NULL OR NEW.space_id IS NULL THEN
    RAISE EXCEPTION 'space_unavailable: A start and end are required.';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.space_id IS NOT DISTINCT FROM NEW.space_id
     AND OLD.start_at IS NOT DISTINCT FROM NEW.start_at
     AND OLD.end_at IS NOT DISTINCT FROM NEW.end_at
     AND (
       (
         public.booking_status_reserves_availability(OLD.status)
         AND public.booking_status_reserves_availability(NEW.status)
       )
       OR (
         public.booking_status_is_pending(OLD.status)
         AND public.booking_status_is_pending(NEW.status)
       )
     )
  THEN
    RETURN NEW;
  END IF;

  IF NOT (
    public.booking_status_reserves_availability(NEW.status)
    OR public.booking_status_is_pending(NEW.status)
  ) THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.reserves_via_occurrences, false) THEN
    IF TG_OP = 'INSERT' THEN
      IF public.booking_status_reserves_availability(NEW.status) THEN
        RAISE EXCEPTION 'space_unavailable: Recurring sessions must be saved before the booking can reserve time.';
      END IF;
      RETURN NEW;
    END IF;
    FOR occurrence IN
      SELECT start_at, end_at
      FROM public.booking_occurrences
      WHERE booking_id = NEW.id
        AND NOT excluded
        AND cancelled_at IS NULL
    LOOP
      PERFORM public.assert_space_interval_available(
        NEW.space_id,
        occurrence.start_at,
        occurrence.end_at,
        NEW.id,
        true
      );
    END LOOP;
    RETURN NEW;
  END IF;

  PERFORM public.assert_space_interval_available(
    NEW.space_id,
    NEW.start_at,
    NEW.end_at,
    NEW.id,
    true
  );
  RETURN NEW;
END;
$$;

