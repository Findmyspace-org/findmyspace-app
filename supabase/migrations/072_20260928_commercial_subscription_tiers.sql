-- Subscription pricing modes, inventory tiers, and monthly billing snapshots.
-- Additive and backward compatible: does not rewrite historical bookings,
-- does not seed a platform default, and does not start subscription billing.

-- ---------------------------------------------------------------------------
-- commercial_terms: subscription pricing mode
-- ---------------------------------------------------------------------------
ALTER TABLE public.commercial_terms
  ADD COLUMN IF NOT EXISTS subscription_pricing_mode text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'commercial_terms_pricing_mode_chk'
  ) THEN
    ALTER TABLE public.commercial_terms
      ADD CONSTRAINT commercial_terms_pricing_mode_chk
      CHECK (
        subscription_pricing_mode IS NULL
        OR subscription_pricing_mode IN (
          'fixed',
          'by_property_count',
          'by_space_count'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'commercial_terms_pricing_mode_model_chk'
  ) THEN
    ALTER TABLE public.commercial_terms
      ADD CONSTRAINT commercial_terms_pricing_mode_model_chk
      CHECK (
        (
          commercial_model = 'subscription'
          AND (
            subscription_pricing_mode IS NULL
            OR subscription_pricing_mode IN (
              'fixed',
              'by_property_count',
              'by_space_count'
            )
          )
        )
        OR (
          commercial_model <> 'subscription'
          AND subscription_pricing_mode IS NULL
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.commercial_terms.subscription_pricing_mode IS
  'How monthly subscription is priced: fixed amount, by property count, or by space count. NULL unless commercial_model = subscription. NULL is treated as fixed.';

COMMENT ON COLUMN public.commercial_terms.monthly_subscription_amount IS
  'Fixed monthly FindMySpace subscription (ZAR) when subscription_pricing_mode is fixed. 0 for tiered modes; the matched tier amount is authoritative.';

-- ---------------------------------------------------------------------------
-- commercial_term_tiers (normalized, versioned with parent terms row)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commercial_term_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_terms_id uuid NOT NULL
    REFERENCES public.commercial_terms(id) ON DELETE CASCADE,
  min_count integer NOT NULL CHECK (min_count >= 0),
  max_count integer,
  monthly_amount numeric(12, 2) NOT NULL DEFAULT 0,
  label text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_term_tiers_max_gte_min_chk CHECK (
    max_count IS NULL OR max_count >= min_count
  ),
  CONSTRAINT commercial_term_tiers_amount_nonneg_chk CHECK (
    monthly_amount >= 0
  )
);

CREATE INDEX IF NOT EXISTS commercial_term_tiers_terms_idx
  ON public.commercial_term_tiers (commercial_terms_id, sort_order, min_count);

COMMENT ON TABLE public.commercial_term_tiers IS
  'Inventory-count pricing bands for a commercial_terms version. Never mutate historical rows; supersede the parent terms instead.';

COMMENT ON COLUMN public.commercial_term_tiers.max_count IS
  'Inclusive upper bound. NULL means open-ended (highest tier).';

ALTER TABLE public.commercial_term_tiers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.commercial_term_tiers FROM PUBLIC;
REVOKE ALL ON TABLE public.commercial_term_tiers FROM anon;
REVOKE ALL ON TABLE public.commercial_term_tiers FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_term_tiers TO service_role;

-- ---------------------------------------------------------------------------
-- commercial_subscription_periods (audit snapshots; no auto-insert here)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commercial_subscription_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_month date NOT NULL,
  scope_type text NOT NULL
    CHECK (scope_type IN ('organisation', 'property', 'space')),
  scope_id uuid NOT NULL,
  commercial_terms_id uuid
    REFERENCES public.commercial_terms(id) ON DELETE SET NULL,
  pricing_mode text,
  inventory_count integer NOT NULL DEFAULT 0,
  matched_tier_id uuid
    REFERENCES public.commercial_term_tiers(id) ON DELETE SET NULL,
  matched_tier_label text,
  monthly_amount numeric(12, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_subscription_periods_month_chk CHECK (
    billing_month = date_trunc('month', billing_month::timestamp)::date
  ),
  CONSTRAINT commercial_subscription_periods_count_chk CHECK (
    inventory_count >= 0
  ),
  CONSTRAINT commercial_subscription_periods_amount_chk CHECK (
    monthly_amount >= 0
  ),
  CONSTRAINT commercial_subscription_periods_status_chk CHECK (
    status IN ('draft', 'open', 'invoiced', 'void')
  ),
  CONSTRAINT commercial_subscription_periods_mode_chk CHECK (
    pricing_mode IS NULL
    OR pricing_mode IN ('fixed', 'by_property_count', 'by_space_count')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS commercial_subscription_periods_scope_month_uidx
  ON public.commercial_subscription_periods (scope_type, scope_id, billing_month);

CREATE INDEX IF NOT EXISTS commercial_subscription_periods_terms_idx
  ON public.commercial_subscription_periods (commercial_terms_id)
  WHERE commercial_terms_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS commercial_subscription_periods_month_idx
  ON public.commercial_subscription_periods (billing_month DESC);

COMMENT ON TABLE public.commercial_subscription_periods IS
  'Monthly subscription billing snapshots for audit. Do not auto-insert or invoice from this migration. Do not rewrite historical rows.';

COMMENT ON COLUMN public.commercial_subscription_periods.billing_month IS
  'First calendar day of the billed month in Africa/Johannesburg.';

ALTER TABLE public.commercial_subscription_periods ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.commercial_subscription_periods FROM PUBLIC;
REVOKE ALL ON TABLE public.commercial_subscription_periods FROM anon;
REVOKE ALL ON TABLE public.commercial_subscription_periods FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_subscription_periods TO service_role;
