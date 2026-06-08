-- Owner/manager interest in claiming an unclaimed listing (not a secure claim token).

CREATE TABLE IF NOT EXISTS public.listing_claim_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  role text,
  message text,
  status text NOT NULL DEFAULT 'new' CHECK (
    status IN ('new', 'contacted', 'claim_link_sent', 'closed')
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listing_claim_interests_listing_id_idx
  ON public.listing_claim_interests (listing_id);

CREATE INDEX IF NOT EXISTS listing_claim_interests_status_idx
  ON public.listing_claim_interests (status);

ALTER TABLE public.listing_claim_interests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS listing_claim_interests_admin_all ON public.listing_claim_interests;
CREATE POLICY listing_claim_interests_admin_all ON public.listing_claim_interests
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

GRANT SELECT, UPDATE ON public.listing_claim_interests TO authenticated;
GRANT ALL ON public.listing_claim_interests TO service_role;
