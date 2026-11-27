-- Recurring availability restrictions.
--
-- Rules are stored once. The availability check expands a rule only across
-- the booking or calendar window it is comparing, including a booking years
-- ahead. It does not insert one blocked_dates row per occurrence, and an
-- open-ended rule does not create an unbounded set of rows.
--
-- Once-off blocks remain in blocked_dates. This migration does not rewrite
-- bookings, payments, prices, ownership, or existing blocked periods.
-- Recurring bookings and single-date exceptions are not created here.
-- School terms are chosen start and end dates, not calendar quarters.
--
-- Production already has an empty weekly availability_rules table
-- (day_of_week, start_time, end_time, is_available). CREATE TABLE IF NOT
-- EXISTS would leave that shape in place. When that legacy table has zero
-- rows, this migration renames it to availability_rules_legacy_weekly_empty
-- and then creates the recurring structure. The renamed table, its policies,
-- and its constraints stay in the database. If the legacy table contains any
-- row, migration 083 stops and leaves those rows unchanged.

DO $$
BEGIN
  IF to_regprocedure('public.lock_space_availability(uuid)') IS NULL THEN
    RAISE EXCEPTION 'migration 081 must be applied before recurring availability rules';
  END IF;
END $$;

DO $$
DECLARE
  row_count bigint;
  has_legacy boolean;
  has_recurring boolean;
BEGIN
  IF to_regclass('public.availability_rules') IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'availability_rules'
      AND column_name = 'day_of_week'
  ) INTO has_legacy;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'availability_rules'
      AND column_name = 'weekdays'
  ) INTO has_recurring;

  IF has_recurring AND NOT has_legacy THEN
    RETURN;
  END IF;

  IF NOT has_legacy OR has_recurring THEN
    RAISE EXCEPTION
      'availability_rules has an unrecognised structure. Migration 083 stopped without changing it.';
  END IF;

  LOCK TABLE public.availability_rules IN ACCESS EXCLUSIVE MODE;
  SELECT count(*) INTO row_count FROM public.availability_rules;
  IF row_count <> 0 THEN
    RAISE EXCEPTION
      'availability_rules contains % legacy row(s). Migration 083 stopped without deleting or transforming them.',
      row_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.availability_rules'::regclass
      AND conname = 'availability_rules_pkey'
  ) THEN
    ALTER TABLE public.availability_rules
      RENAME CONSTRAINT availability_rules_pkey TO availability_rules_legacy_weekly_empty_pkey;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.availability_rules'::regclass
      AND conname = 'availability_rules_space_id_fkey'
  ) THEN
    ALTER TABLE public.availability_rules
      RENAME CONSTRAINT availability_rules_space_id_fkey TO availability_rules_legacy_weekly_empty_space_fkey;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.availability_rules'::regclass
      AND conname = 'availability_rules_day_of_week_check'
  ) THEN
    ALTER TABLE public.availability_rules
      RENAME CONSTRAINT availability_rules_day_of_week_check TO availability_rules_legacy_weekly_empty_day_check;
  END IF;
  IF to_regclass('public.idx_availability_rules_space_id') IS NOT NULL THEN
    ALTER INDEX public.idx_availability_rules_space_id
      RENAME TO idx_availability_rules_legacy_weekly_empty_space;
  END IF;

  ALTER TABLE public.availability_rules RENAME TO availability_rules_legacy_weekly_empty;
  COMMENT ON TABLE public.availability_rules_legacy_weekly_empty IS
    'Empty pre-083 weekly availability table, renamed with its policies and constraints. It is not read by the booking calendar.';
END $$;

CREATE TABLE IF NOT EXISTS public.availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL,
  reason text,
  weekdays smallint[] NOT NULL,
  whole_day boolean NOT NULL DEFAULT false,
  local_start time,
  local_end time,
  starts_on date NOT NULL,
  ends_on date,
  created_by uuid,
  updated_by uuid,
  removed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  CONSTRAINT availability_rules_reason_length CHECK (reason IS NULL OR char_length(reason) <= 500),
  CONSTRAINT availability_rules_dates_check CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT availability_rules_time_check CHECK (
    (
      whole_day
      AND local_start IS NULL
      AND local_end IS NULL
    )
    OR (
      NOT whole_day
      AND local_start IS NOT NULL
      AND local_end IS NOT NULL
      AND local_start < local_end
    )
  )
);

DO $$
BEGIN
  IF to_regclass('public.spaces') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'availability_rules_space_id_fkey'
     ) THEN
    ALTER TABLE public.availability_rules
      ADD CONSTRAINT availability_rules_space_id_fkey
      FOREIGN KEY (space_id) REFERENCES public.spaces (id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS availability_rules_space_active_idx
  ON public.availability_rules (space_id)
  WHERE removed_at IS NULL;

ALTER TABLE public.availability_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RETURN;
  END IF;
  IF to_regprocedure('public.user_can_manage_space(uuid)') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'availability_rules'
      AND policyname = 'availability_rules_select_visible'
  ) THEN
    CREATE POLICY availability_rules_select_visible
      ON public.availability_rules
      FOR SELECT
      TO anon, authenticated
      USING (
        removed_at IS NULL
        AND (
          public.user_can_manage_space(availability_rules.space_id)
          OR EXISTS (
            SELECT 1
            FROM public.spaces s
            WHERE s.id = availability_rules.space_id
              AND s.status = 'active'
              AND COALESCE(s.public_listing_mode, 'live') = 'live'
          )
        )
      );
  END IF;
END $$;

REVOKE INSERT, UPDATE, DELETE ON public.availability_rules FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE INSERT, UPDATE, DELETE ON public.availability_rules FROM anon;
    GRANT SELECT ON public.availability_rules TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE INSERT, UPDATE, DELETE ON public.availability_rules FROM authenticated;
    GRANT SELECT ON public.availability_rules TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability_rules TO service_role;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.availability_rule_conflict(
  p_weekdays smallint[],
  p_whole_day boolean,
  p_local_start time,
  p_local_end time,
  p_starts_on date,
  p_ends_on date,
  p_start timestamptz,
  p_end timestamptz
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
BEGIN
  occurs := false;
  occurs_start := NULL;
  occurs_end := NULL;
  IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start OR p_starts_on IS NULL THEN
    RETURN NEXT;
    RETURN;
  END IF;

  first_day := GREATEST(
    p_starts_on,
    (p_start AT TIME ZONE 'Africa/Johannesburg')::date
  );
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
      IF p_whole_day THEN
        occ_start := (day::timestamp AT TIME ZONE 'Africa/Johannesburg');
        occ_end := ((day + 1)::timestamp AT TIME ZONE 'Africa/Johannesburg');
      ELSE
        occ_start := ((day + p_local_start) AT TIME ZONE 'Africa/Johannesburg');
        occ_end := ((day + p_local_end) AT TIME ZONE 'Africa/Johannesburg');
      END IF;
      IF occ_start < p_end AND occ_end > p_start THEN
        occurs := true;
        occurs_start := occ_start;
        occurs_end := occ_end;
        RETURN NEXT;
        RETURN;
      END IF;
    END IF;
    day := day + 1;
  END LOOP;

  RETURN NEXT;
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
  SELECT
    'booking'::text,
    x.id,
    x.start_at,
    x.end_at,
    x.status
  FROM public.bookings x
  WHERE x.space_id = p_space_id
    AND (p_ignore_booking_id IS NULL OR x.id <> p_ignore_booking_id)
    AND public.booking_status_reserves_availability(x.status)
    AND x.start_at < p_end
    AND x.end_at > p_start
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

CREATE OR REPLACE FUNCTION public.assert_space_interval_available(
  p_space_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_ignore_booking_id uuid DEFAULT NULL,
  p_include_blocks boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  r record;
  parts text[] := ARRAY[]::text[];
  n integer := 0;
  when_label text;
BEGIN
  IF p_space_id IS NULL OR p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION 'space_unavailable: A start and end are required.';
  END IF;

  IF p_end <= p_start THEN
    RAISE EXCEPTION 'space_unavailable: The end must be after the start.';
  END IF;

  PERFORM public.lock_space_availability(p_space_id);

  FOR r IN
    SELECT *
    FROM public.space_availability_conflicts(
      p_space_id,
      p_start,
      p_end,
      p_ignore_booking_id,
      p_include_blocks
    )
  LOOP
    n := n + 1;
    IF n <= 8 THEN
      when_label := to_char(
        r.conflict_start AT TIME ZONE 'Africa/Johannesburg',
        'YYYY-MM-DD HH24:MI'
      ) || ' to ' || to_char(
        r.conflict_end AT TIME ZONE 'Africa/Johannesburg',
        'YYYY-MM-DD HH24:MI'
      ) || ' SAST';
      IF r.conflict_kind = 'booking' THEN
        parts := parts || ('Confirmed booking from ' || when_label || '.');
      ELSIF r.conflict_kind = 'rule' THEN
        parts := parts || ('Recurring restriction from ' || when_label || '.');
      ELSE
        parts := parts || ('Blocked period from ' || when_label || '.');
      END IF;
    END IF;
  END LOOP;

  IF n = 0 THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'space_unavailable: Those dates or times are not available. %',
    array_to_string(parts, ' ');
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

  FOR booking IN
    SELECT id, start_at, end_at
    FROM public.bookings
    WHERE space_id = p_space_id
      AND public.booking_status_reserves_availability(status)
      AND end_at > (v_starts_on::timestamp AT TIME ZONE 'Africa/Johannesburg')
      AND (
        v_ends_on IS NULL
        OR start_at < ((v_ends_on + 1)::timestamp AT TIME ZONE 'Africa/Johannesburg')
      )
    FOR UPDATE
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

CREATE OR REPLACE FUNCTION public.archive_availability_rule(
  p_space_id uuid,
  p_id uuid,
  p_actor uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  updated_count integer;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'space_unavailable: An administrator is required.';
  END IF;

  PERFORM public.lock_space_availability(p_space_id);

  UPDATE public.availability_rules
  SET removed_at = now(),
      removed_by = p_actor,
      updated_at = now()
  WHERE id = p_id
    AND space_id = p_space_id
    AND removed_at IS NULL;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count = 0 THEN
    RAISE EXCEPTION 'Availability restriction not found.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.availability_rule_conflict(smallint[], boolean, time, time, date, date, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_availability_rule(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_availability_rule(uuid, uuid, uuid) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.save_availability_rule(uuid, uuid, jsonb) FROM anon;
    REVOKE ALL ON FUNCTION public.archive_availability_rule(uuid, uuid, uuid) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.save_availability_rule(uuid, uuid, jsonb) FROM authenticated;
    REVOKE ALL ON FUNCTION public.archive_availability_rule(uuid, uuid, uuid) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.save_availability_rule(uuid, uuid, jsonb) TO service_role;
    GRANT EXECUTE ON FUNCTION public.archive_availability_rule(uuid, uuid, uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.availability_rule_conflict(smallint[], boolean, time, time, date, date, timestamptz, timestamptz) TO service_role;
  END IF;
END $$;
