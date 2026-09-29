-- Align profiles.role with the existing application role model.
-- This migration changes only profiles_role_check and does not promote users.

DO $migration$
DECLARE
  current_definition text;
BEGIN
  SELECT pg_get_constraintdef(constraint_row.oid, true)
  INTO current_definition
  FROM pg_constraint AS constraint_row
  JOIN pg_class AS table_row
    ON table_row.oid = constraint_row.conrelid
  JOIN pg_namespace AS schema_row
    ON schema_row.oid = table_row.relnamespace
  WHERE schema_row.nspname = 'public'
    AND table_row.relname = 'profiles'
    AND constraint_row.conname = 'profiles_role_check';

  IF current_definition IS DISTINCT FROM
    'CHECK (role = ANY (ARRAY[''user''::text, ''admin''::text]))'
  THEN
    RAISE EXCEPTION
      'profiles_role_check is not in the expected pre-migration state: %',
      COALESCE(current_definition, 'missing');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE role NOT IN ('user', 'admin')
  ) THEN
    RAISE EXCEPTION
      'profiles contains an unexpected role; refusing to replace profiles_role_check';
  END IF;

  ALTER TABLE public.profiles
    DROP CONSTRAINT profiles_role_check;

  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('user', 'admin', 'super_admin'));
END
$migration$;
