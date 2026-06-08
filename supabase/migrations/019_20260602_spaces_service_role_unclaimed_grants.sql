-- Admin unclaimed listing APIs insert via service_role (PostgREST).
-- Migration 018 enabled RLS on spaces; without INSERT grant, create draft returns:
--   permission denied for table spaces

GRANT INSERT ON public.spaces TO service_role;

-- Admin unclaimed photo upload/delete (was SELECT-only for service_role).
GRANT INSERT, UPDATE, DELETE ON public.space_images TO service_role;

-- Admin unclaimed attribute sync (delete + re-insert on save).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.space_attributes TO service_role;
