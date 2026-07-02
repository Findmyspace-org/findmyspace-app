-- Admin unclaimed listing hard-delete: ensure service_role can delete spaces and
-- verify optional ownership-document activity before delete.

GRANT DELETE ON TABLE public.spaces TO service_role;

DO $$
BEGIN
  IF to_regclass('public.listing_ownership_documents') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON TABLE public.listing_ownership_documents TO service_role';
  END IF;
END $$;
