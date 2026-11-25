-- Flexible booking periods. Additive. Existing spaces keep their current
-- price until an owner explicitly saves booking rates.
-- Does not convert existing rows, change checkout providers, or create
-- recurring series. Recurrence columns are intentionally absent until the
-- later phases that store rules and evaluate them inside the availability lock.

DO $$
BEGIN
  IF to_regclass('public.spaces') IS NULL OR to_regclass('public.bookings') IS NULL THEN
    RAISE EXCEPTION 'spaces and bookings must exist before flexible booking rates';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.space_booking_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces (id) ON DELETE CASCADE,
  period text NOT NULL,
  amount numeric(12, 2) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT space_booking_rates_period_check CHECK (
    period IN ('hour', 'day', 'week', 'month', 'quarter', 'year')
  ),
  CONSTRAINT space_booking_rates_amount_check CHECK (amount > 0 AND amount <= 100000000),
  CONSTRAINT space_booking_rates_space_period_key UNIQUE (space_id, period)
);

CREATE INDEX IF NOT EXISTS space_booking_rates_space_idx
  ON public.space_booking_rates (space_id);

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS pricing_mode text,
  ADD COLUMN IF NOT EXISTS rate_period text,
  ADD COLUMN IF NOT EXISTS unit_price numeric(12, 2),
  ADD COLUMN IF NOT EXISTS billed_quantity numeric(8, 2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bookings_pricing_mode_check'
      AND conrelid = 'public.bookings'::regclass
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_pricing_mode_check
      CHECK (pricing_mode IS NULL OR pricing_mode IN ('legacy', 'flexible'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bookings_rate_period_check'
      AND conrelid = 'public.bookings'::regclass
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_rate_period_check
      CHECK (
        rate_period IS NULL
        OR rate_period IN ('hour', 'day', 'week', 'month', 'quarter', 'year')
      );
  END IF;
END $$;

ALTER TABLE public.space_booking_rates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'space_booking_rates'
      AND policyname = 'space_booking_rates_select_public'
  ) THEN
    CREATE POLICY space_booking_rates_select_public
      ON public.space_booking_rates
      FOR SELECT
      TO anon, authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.spaces s
          WHERE s.id = space_booking_rates.space_id
            AND s.status = 'active'
            AND COALESCE(s.public_listing_mode, 'live') = 'live'
        )
        OR public.user_can_manage_space(space_booking_rates.space_id)
      );
  END IF;
END $$;

REVOKE INSERT, UPDATE, DELETE ON public.space_booking_rates FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE INSERT, UPDATE, DELETE ON public.space_booking_rates FROM anon;
    GRANT SELECT ON public.space_booking_rates TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE INSERT, UPDATE, DELETE ON public.space_booking_rates FROM authenticated;
    GRANT SELECT ON public.space_booking_rates TO authenticated;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.replace_space_booking_rates(
  p_space_id uuid,
  p_rates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  row jsonb;
  period text;
  amount numeric;
  seen text[] := ARRAY[]::text[];
BEGIN
  IF COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_space_id IS NULL THEN
    RAISE EXCEPTION 'space is required';
  END IF;
  IF to_regclass('public.spaces') IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.spaces WHERE id = p_space_id) THEN
    RAISE EXCEPTION 'space not found';
  END IF;

  DELETE FROM public.space_booking_rates WHERE space_id = p_space_id;

  IF p_rates IS NULL OR jsonb_typeof(p_rates) = 'null' OR p_rates = '[]'::jsonb THEN
    RETURN jsonb_build_object('useFlexibleRates', false, 'rates', '[]'::jsonb);
  END IF;
  IF jsonb_typeof(p_rates) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'rates must be a list';
  END IF;

  FOR row IN SELECT value FROM jsonb_array_elements(p_rates)
  LOOP
    period := row->>'period';
    amount := (row->>'amount')::numeric;
    IF period NOT IN ('hour', 'day', 'week', 'month', 'quarter', 'year') THEN
      RAISE EXCEPTION 'unsupported booking period';
    END IF;
    IF period = ANY (seen) THEN
      RAISE EXCEPTION 'duplicate booking period';
    END IF;
    IF amount IS NULL OR amount <= 0 OR amount > 100000000 THEN
      RAISE EXCEPTION 'invalid booking price';
    END IF;
    seen := seen || period;
    INSERT INTO public.space_booking_rates (space_id, period, amount, enabled)
    VALUES (p_space_id, period, amount, true);
  END LOOP;

  IF COALESCE(array_length(seen, 1), 0) = 0 THEN
    RAISE EXCEPTION 'enable at least one booking period';
  END IF;

  RETURN jsonb_build_object(
    'useFlexibleRates', true,
    'rates', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'period', rates.period,
        'amount', rates.amount,
        'enabled', rates.enabled
      ) ORDER BY rates.period), '[]'::jsonb)
      FROM public.space_booking_rates AS rates
      WHERE rates.space_id = p_space_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_space_booking_rates(uuid, jsonb) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.replace_space_booking_rates(uuid, jsonb) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.replace_space_booking_rates(uuid, jsonb) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.replace_space_booking_rates(uuid, jsonb) TO service_role;
  END IF;
END $$;
