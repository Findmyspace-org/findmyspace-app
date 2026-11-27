-- Production-shaped weekly availability_rules for disposable migration tests.
-- The table matches the audited production columns, constraint, index, and policies.
-- It does not contain production rows.

CREATE TABLE public.availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL,
  day_of_week integer NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_available boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT availability_rules_day_of_week_check CHECK (day_of_week >= 0 AND day_of_week <= 6),
  CONSTRAINT availability_rules_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces (id) ON DELETE CASCADE
);

CREATE INDEX idx_availability_rules_space_id ON public.availability_rules (space_id);

ALTER TABLE public.availability_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view availability for approved active spaces"
  ON public.availability_rules
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.spaces s
      WHERE s.id = availability_rules.space_id
        AND s.status = 'active'
    )
  );

CREATE POLICY "Owners can manage availability for own spaces"
  ON public.availability_rules
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.blocked_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now()
);
