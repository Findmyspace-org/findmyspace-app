-- Recurring bookings are one parent booking, one approval, and one payment.
-- Occupied time is the individual session, not the span from the first
-- session to the last. A Monday series does not reserve Tuesday.
--
-- Fortnightly sessions use the ISO week of the start date as week zero.
-- A session is included when the Monday-based week offset is even.
-- Renter series require a finite end date, at most 24 months after the start.
-- Existing bookings are not backfilled into occurrence rows.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reserves_via_occurrences boolean NOT NULL DEFAULT false;

ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS recurring_bookings_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS recurring_max_occurrences integer;

-- These price columns already exist on production. The additions let the
-- recurring price check run on a disposable database that only has the
-- availability fixture. Existing prices are not changed.
ALTER TABLE public.spaces ADD COLUMN IF NOT EXISTS price_per_hour numeric;
ALTER TABLE public.spaces ADD COLUMN IF NOT EXISTS price_unit text;
ALTER TABLE public.spaces ADD COLUMN IF NOT EXISTS price_amount numeric;
ALTER TABLE public.spaces ADD COLUMN IF NOT EXISTS min_booking_hours numeric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'spaces_recurring_max_occurrences_check'
  ) THEN
    ALTER TABLE public.spaces
      ADD CONSTRAINT spaces_recurring_max_occurrences_check
      CHECK (
        recurring_max_occurrences IS NULL
        OR (recurring_max_occurrences BETWEEN 1 AND 750)
      );
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_pricing_mode_check'
  ) THEN
    ALTER TABLE public.bookings DROP CONSTRAINT bookings_pricing_mode_check;
  END IF;
  ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_pricing_mode_check
    CHECK (pricing_mode IS NULL OR pricing_mode IN ('legacy', 'flexible', 'recurring'));
END $$;

CREATE TABLE IF NOT EXISTS public.booking_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE,
  frequency text NOT NULL,
  weekdays smallint[] NOT NULL,
  local_start time NOT NULL,
  local_end time NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  excluded_dates date[] NOT NULL DEFAULT ARRAY[]::date[],
  session_count integer NOT NULL,
  hours_per_session numeric(6, 2) NOT NULL,
  hourly_rate numeric(12, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_series_frequency_check CHECK (frequency IN ('daily', 'weekly', 'fortnightly')),
  CONSTRAINT booking_series_dates_check CHECK (ends_on >= starts_on),
  CONSTRAINT booking_series_count_check CHECK (session_count BETWEEN 1 AND 750),
  CONSTRAINT booking_series_hours_check CHECK (hours_per_session > 0 AND hours_per_session <= 12)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'booking_series_booking_id_fkey'
  ) THEN
    ALTER TABLE public.booking_series
      ADD CONSTRAINT booking_series_booking_id_fkey
      FOREIGN KEY (booking_id) REFERENCES public.bookings (id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.booking_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  series_id uuid NOT NULL,
  space_id uuid NOT NULL,
  occurrence_date date NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  excluded boolean NOT NULL DEFAULT false,
  CONSTRAINT booking_occurrences_time_check CHECK (end_at > start_at),
  CONSTRAINT booking_occurrences_identity UNIQUE (booking_id, occurrence_date)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'booking_occurrences_booking_id_fkey'
  ) THEN
    ALTER TABLE public.booking_occurrences
      ADD CONSTRAINT booking_occurrences_booking_id_fkey
      FOREIGN KEY (booking_id) REFERENCES public.bookings (id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'booking_occurrences_series_id_fkey'
  ) THEN
    ALTER TABLE public.booking_occurrences
      ADD CONSTRAINT booking_occurrences_series_id_fkey
      FOREIGN KEY (series_id) REFERENCES public.booking_series (id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS booking_occurrences_space_range_idx
  ON public.booking_occurrences (space_id, start_at, end_at)
  WHERE NOT excluded;

ALTER TABLE public.booking_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_occurrences ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.booking_series FROM PUBLIC;
REVOKE ALL ON public.booking_occurrences FROM PUBLIC;

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
    AND COALESCE(b.reserves_via_occurrences, false)
    AND public.booking_status_reserves_availability(b.status);
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
  SELECT
    'booking'::text,
    x.id,
    x.start_at,
    x.end_at,
    x.status
  FROM public.bookings x
  WHERE x.space_id = p_space_id
    AND (p_ignore_booking_id IS NULL OR x.id <> p_ignore_booking_id)
    AND NOT COALESCE(x.reserves_via_occurrences, false)
    AND public.booking_status_reserves_availability(x.status)
    AND x.start_at < p_end
    AND x.end_at > p_start
  UNION ALL
  SELECT
    'occurrence'::text,
    o.id,
    o.start_at,
    o.end_at,
    b.status
  FROM public.booking_occurrences o
  JOIN public.bookings b ON b.id = o.booking_id
  WHERE o.space_id = p_space_id
    AND NOT o.excluded
    AND COALESCE(b.reserves_via_occurrences, false)
    AND (p_ignore_booking_id IS NULL OR b.id <> p_ignore_booking_id)
    AND public.booking_status_reserves_availability(b.status)
    AND o.start_at < p_end
    AND o.end_at > p_start
  UNION ALL
  SELECT
    'block'::text,
    d.id,
    d.start_at,
    d.end_at,
    NULL::text
  FROM public.blocked_dates d
  WHERE p_include_blocks
    AND d.space_id = p_space_id
    AND d.start_at < p_end
    AND d.end_at > p_start
  UNION ALL
  SELECT
    'rule'::text,
    r.id,
    c.occurs_start,
    c.occurs_end,
    NULL::text
  FROM public.availability_rules r
  CROSS JOIN LATERAL public.availability_rule_conflict(
    r.weekdays,
    r.whole_day,
    r.local_start,
    r.local_end,
    r.starts_on,
    r.ends_on,
    p_start,
    p_end
  ) c
  WHERE p_include_blocks
    AND r.removed_at IS NULL
    AND r.space_id = p_space_id
    AND c.occurs;
$$;

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

CREATE OR REPLACE FUNCTION public.generate_recurring_occurrences(
  p_frequency text,
  p_weekdays smallint[],
  p_local_start time,
  p_local_end time,
  p_starts_on date,
  p_ends_on date,
  p_excluded date[]
)
RETURNS TABLE (
  occurrence_date date,
  start_at timestamptz,
  end_at timestamptz,
  excluded boolean
)
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  day date;
  anchor_monday date;
  day_monday date;
  week_index integer;
  weekday integer;
  include_day boolean;
BEGIN
  IF p_frequency NOT IN ('daily', 'weekly', 'fortnightly') THEN
    RAISE EXCEPTION 'space_unavailable: Choose daily, weekly, or fortnightly.';
  END IF;
  IF p_starts_on IS NULL OR p_ends_on IS NULL OR p_ends_on < p_starts_on THEN
    RAISE EXCEPTION 'space_unavailable: Choose a start and end date.';
  END IF;
  IF p_ends_on > (p_starts_on + INTERVAL '24 months')::date THEN
    RAISE EXCEPTION 'space_unavailable: A recurring booking can run for at most 24 months.';
  END IF;
  IF p_local_end <= p_local_start THEN
    RAISE EXCEPTION 'space_unavailable: The end time must be after the start time.';
  END IF;
  IF EXTRACT(MINUTE FROM p_local_start)::int % 30 <> 0
     OR EXTRACT(MINUTE FROM p_local_end)::int % 30 <> 0 THEN
    RAISE EXCEPTION 'space_unavailable: Use a start and end time on a 30-minute interval.';
  END IF;
  IF p_frequency <> 'daily' AND (
    p_weekdays IS NULL OR cardinality(p_weekdays) < 1
  ) THEN
    RAISE EXCEPTION 'space_unavailable: Choose at least one day of the week.';
  END IF;

  anchor_monday := p_starts_on - (EXTRACT(ISODOW FROM p_starts_on)::int - 1);
  day := p_starts_on;
  WHILE day <= p_ends_on LOOP
    weekday := EXTRACT(ISODOW FROM day)::int;
    day_monday := day - (weekday - 1);
    week_index := (day_monday - anchor_monday) / 7;
    include_day := p_frequency = 'daily'
      OR (
        weekday = ANY (p_weekdays)
        AND (p_frequency = 'weekly' OR week_index % 2 = 0)
      );
    IF include_day THEN
      occurrence_date := day;
      start_at := ((day + p_local_start) AT TIME ZONE 'Africa/Johannesburg');
      end_at := ((day + p_local_end) AT TIME ZONE 'Africa/Johannesburg');
      excluded := day = ANY (COALESCE(p_excluded, ARRAY[]::date[]));
      RETURN NEXT;
    END IF;
    day := day + 1;
  END LOOP;
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
  IF NOT COALESCE(space_enabled, false) THEN
    RAISE EXCEPTION 'space_unavailable: Recurring bookings are not enabled for this space.';
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
  IF b.status IS DISTINCT FROM 'pending_owner' AND b.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'This booking has already been responded to.';
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
    WHERE booking_id = b.id AND NOT excluded;
    IF occurrence_count < 1 THEN
      RAISE EXCEPTION 'space_unavailable: This recurring request has no sessions to reserve.';
    END IF;
    FOR occurrence IN
      SELECT start_at, end_at
      FROM public.booking_occurrences
      WHERE booking_id = b.id AND NOT excluded
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

-- Rule saves must use occupied sessions, not a recurring parent's outer span.
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
    FROM public.availability_rule_conflict(
      v_days, v_whole_day, v_local_start, v_local_end, v_starts_on, v_ends_on,
      booking.start_at, booking.end_at
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

DO $$
BEGIN
  IF to_regprocedure('public.user_can_manage_space(uuid)') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RETURN;
  END IF;
  GRANT SELECT ON public.booking_series TO authenticated;
  GRANT SELECT ON public.booking_occurrences TO authenticated;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_series' AND policyname = 'booking_series_select_participant'
  ) THEN
    CREATE POLICY booking_series_select_participant
      ON public.booking_series
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.id = booking_series.booking_id
            AND b.renter_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.id = booking_series.booking_id
            AND public.user_can_manage_space(b.space_id)
        )
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_occurrences' AND policyname = 'booking_occurrences_select_participant'
  ) THEN
    CREATE POLICY booking_occurrences_select_participant
      ON public.booking_occurrences
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.id = booking_occurrences.booking_id
            AND b.renter_id = auth.uid()
        )
        OR public.user_can_manage_space(booking_occurrences.space_id)
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.preview_recurring_conflicts(
  p_space_id uuid,
  p_frequency text,
  p_weekdays smallint[],
  p_local_start time,
  p_local_end time,
  p_starts_on date,
  p_ends_on date,
  p_excluded date[]
)
RETURNS TABLE (occurrence_date date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  session_row record;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  FOR session_row IN
    SELECT generated_row.occurrence_date, generated_row.start_at, generated_row.end_at, generated_row.excluded
    FROM public.generate_recurring_occurrences(
      p_frequency, p_weekdays, p_local_start, p_local_end, p_starts_on, p_ends_on, p_excluded
    ) AS generated_row
  LOOP
    IF session_row.excluded THEN
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.space_availability_conflicts(
        p_space_id, session_row.start_at, session_row.end_at, NULL, true
      )
    ) THEN
      occurrence_date := session_row.occurrence_date;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.booking_reserving_intervals(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_recurring_conflicts(uuid, text, smallint[], time, time, date, date, date[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_recurring_occurrences(text, smallint[], time, time, date, date, date[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_recurring_series(uuid, text, smallint[], time, time, date, date, date[]) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.attach_recurring_series(uuid, text, smallint[], time, time, date, date, date[]) FROM anon;
    REVOKE ALL ON public.booking_series FROM anon;
    REVOKE ALL ON public.booking_occurrences FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.attach_recurring_series(uuid, text, smallint[], time, time, date, date, date[]) FROM authenticated;
    REVOKE ALL ON FUNCTION public.preview_recurring_conflicts(uuid, text, smallint[], time, time, date, date, date[]) FROM authenticated;
    REVOKE INSERT, UPDATE, DELETE ON public.booking_series FROM authenticated;
    REVOKE INSERT, UPDATE, DELETE ON public.booking_occurrences FROM authenticated;
    GRANT SELECT ON public.booking_series TO authenticated;
    GRANT SELECT ON public.booking_occurrences TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.attach_recurring_series(uuid, text, smallint[], time, time, date, date, date[]) TO service_role;
    GRANT EXECUTE ON FUNCTION public.preview_recurring_conflicts(uuid, text, smallint[], time, time, date, date, date[]) TO service_role;
    GRANT EXECUTE ON FUNCTION public.generate_recurring_occurrences(text, smallint[], time, time, date, date, date[]) TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_series TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_occurrences TO service_role;
  END IF;
END $$;
