-- The Management API creates these tables with the project default privileges.
-- Migrations 082-087 revoke INSERT, UPDATE and DELETE from anon and
-- authenticated, and grant SELECT only where a calendar or price must be
-- readable. TRUNCATE is not covered by row level security, so the remaining
-- default TRUNCATE, TRIGGER and REFERENCES grants are removed here.
-- Service-role access is unchanged. No rows are deleted.

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'availability_rules',
    'availability_rule_exceptions',
    'space_booking_rates',
    'booking_series',
    'booking_occurrences',
    'booking_change_events',
    'booking_change_requests',
    'booking_discounts'
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format(
        'REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.%I FROM anon',
        table_name
      );
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format(
        'REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.%I FROM authenticated',
        table_name
      );
    END IF;
  END LOOP;
END $$;
