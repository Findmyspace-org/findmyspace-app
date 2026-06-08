-- Secure claim tokens for admin-created unclaimed listings (store hash only).

CREATE TABLE IF NOT EXISTS public.listing_claim_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  owner_email text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'claimed', 'revoked', 'expired')
  ),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listing_claim_tokens_listing_id_idx
  ON public.listing_claim_tokens (listing_id);

CREATE INDEX IF NOT EXISTS listing_claim_tokens_status_idx
  ON public.listing_claim_tokens (status);

CREATE INDEX IF NOT EXISTS listing_claim_tokens_expires_at_idx
  ON public.listing_claim_tokens (expires_at);

ALTER TABLE public.listing_claim_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS listing_claim_tokens_admin_all ON public.listing_claim_tokens;
CREATE POLICY listing_claim_tokens_admin_all ON public.listing_claim_tokens
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

GRANT SELECT, INSERT, UPDATE ON public.listing_claim_tokens TO authenticated;
GRANT ALL ON public.listing_claim_tokens TO service_role;
