-- Objects migration 082 expects, added to the Phase 1 local database.
-- This file is only for the disposable combined test database.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.spaces (
  id uuid PRIMARY KEY,
  status text,
  public_listing_mode text
);

CREATE OR REPLACE FUNCTION public.user_can_manage_space(space_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT false;
$$;

INSERT INTO public.spaces (id, status, public_listing_mode)
VALUES
  ('10000000-0000-4000-8000-000000000010', 'active', 'live'),
  ('10000000-0000-4000-8000-000000000011', 'active', 'live')
ON CONFLICT (id) DO NOTHING;
