-- Secure property owner invite tokens (store hash only).

CREATE TABLE IF NOT EXISTS public.property_owner_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  owner_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'accepted', 'revoked', 'expired')
  ),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS property_owner_invites_property_id_idx
  ON public.property_owner_invites (property_id);

CREATE INDEX IF NOT EXISTS property_owner_invites_status_idx
  ON public.property_owner_invites (status);

CREATE INDEX IF NOT EXISTS property_owner_invites_expires_at_idx
  ON public.property_owner_invites (expires_at);
