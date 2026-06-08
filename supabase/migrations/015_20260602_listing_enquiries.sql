-- Enquiries for unclaimed (non-bookable) listings.

CREATE TABLE IF NOT EXISTS public.listing_enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  requested_start timestamptz,
  requested_end timestamptz,
  duration_type text NOT NULL CHECK (duration_type IN ('hourly', 'daily', 'monthly')),
  purpose text,
  message text,
  status text NOT NULL DEFAULT 'new' CHECK (
    status IN ('new', 'contacted', 'owner_contacted', 'converted', 'closed')
  ),
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listing_enquiries_listing_id_idx
  ON public.listing_enquiries (listing_id);

CREATE INDEX IF NOT EXISTS listing_enquiries_status_idx
  ON public.listing_enquiries (status);

CREATE INDEX IF NOT EXISTS listing_enquiries_created_at_idx
  ON public.listing_enquiries (created_at DESC);

CREATE INDEX IF NOT EXISTS listing_enquiries_requester_id_idx
  ON public.listing_enquiries (requester_id);

ALTER TABLE public.listing_enquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS listing_enquiries_insert ON public.listing_enquiries;
CREATE POLICY listing_enquiries_insert ON public.listing_enquiries
  FOR INSERT TO authenticated
  WITH CHECK (
    requester_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.spaces s
      WHERE s.id = listing_id AND s.status = 'unclaimed'
    )
  );

DROP POLICY IF EXISTS listing_enquiries_select_own ON public.listing_enquiries;
CREATE POLICY listing_enquiries_select_own ON public.listing_enquiries
  FOR SELECT TO authenticated
  USING (requester_id = auth.uid());

DROP POLICY IF EXISTS listing_enquiries_admin_all ON public.listing_enquiries;
CREATE POLICY listing_enquiries_admin_all ON public.listing_enquiries
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.listing_enquiries TO authenticated;
GRANT ALL ON public.listing_enquiries TO service_role;
