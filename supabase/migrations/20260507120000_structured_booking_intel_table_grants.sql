-- PostgREST / Supabase JS: RLS policies only apply after the database role has
-- appropriate table privileges. Without GRANT SELECT, anon/authenticated clients get
-- "permission denied" and the client may see null data — renters then never load
-- listing_booking_requirements even when RLS would allow it.

GRANT SELECT ON public.listing_booking_requirements TO anon, authenticated;
GRANT INSERT, UPDATE ON public.listing_booking_requirements TO authenticated;

GRANT SELECT ON public.listing_questionnaires TO anon, authenticated;
GRANT INSERT, UPDATE ON public.listing_questionnaires TO authenticated;

GRANT SELECT, INSERT ON public.booking_request_details TO authenticated;

-- Service role (admin API, jobs) — full access; RLS bypassed for service_role
GRANT ALL ON public.listing_booking_requirements TO service_role;
GRANT ALL ON public.listing_questionnaires TO service_role;
GRANT ALL ON public.booking_request_details TO service_role;

-- Make active-listing read policy explicit for anon + authenticated (idempotent replace)
DROP POLICY IF EXISTS listing_booking_requirements_select_public_active
  ON public.listing_booking_requirements;

CREATE POLICY listing_booking_requirements_select_public_active
  ON public.listing_booking_requirements
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.spaces s
      WHERE s.id = listing_booking_requirements.space_id
        AND s.status = 'active'
    )
  );
