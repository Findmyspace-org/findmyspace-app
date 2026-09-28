-- Progressive per-space subscription pricing.
-- Additive. Does not rewrite historical terms, tiers, bookings, or periods.

ALTER TABLE public.commercial_terms
  ADD COLUMN IF NOT EXISTS subscription_included_units integer;

ALTER TABLE public.commercial_term_tiers
  ADD COLUMN IF NOT EXISTS incremental_amount numeric(12, 2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'commercial_terms_included_units_chk'
  ) THEN
    ALTER TABLE public.commercial_terms
      ADD CONSTRAINT commercial_terms_included_units_chk
      CHECK (
        subscription_included_units IS NULL
        OR subscription_included_units >= 0
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'commercial_term_tiers_incremental_nonneg_chk'
  ) THEN
    ALTER TABLE public.commercial_term_tiers
      ADD CONSTRAINT commercial_term_tiers_incremental_nonneg_chk
      CHECK (incremental_amount IS NULL OR incremental_amount >= 0);
  END IF;
END $$;

ALTER TABLE public.commercial_terms
  DROP CONSTRAINT IF EXISTS commercial_terms_pricing_mode_chk;

ALTER TABLE public.commercial_terms
  ADD CONSTRAINT commercial_terms_pricing_mode_chk
  CHECK (
    subscription_pricing_mode IS NULL
    OR subscription_pricing_mode IN (
      'fixed',
      'by_property_count',
      'by_space_count',
      'progressive_space_pricing'
    )
  );

ALTER TABLE public.commercial_terms
  DROP CONSTRAINT IF EXISTS commercial_terms_pricing_mode_model_chk;

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
          'by_space_count',
          'progressive_space_pricing'
        )
      )
    )
    OR (
      commercial_model <> 'subscription'
      AND subscription_pricing_mode IS NULL
      AND subscription_included_units IS NULL
    )
  );

ALTER TABLE public.commercial_subscription_periods
  DROP CONSTRAINT IF EXISTS commercial_subscription_periods_mode_chk;

ALTER TABLE public.commercial_subscription_periods
  ADD CONSTRAINT commercial_subscription_periods_mode_chk
  CHECK (
    pricing_mode IS NULL
    OR pricing_mode IN (
      'fixed',
      'by_property_count',
      'by_space_count',
      'progressive_space_pricing'
    )
  );

COMMENT ON COLUMN public.commercial_terms.subscription_included_units IS
  'Spaces included in the base monthly fee for progressive_space_pricing. NULL for other modes.';

COMMENT ON COLUMN public.commercial_terms.monthly_subscription_amount IS
  'Fixed monthly amount, or progressive_space_pricing base monthly fee. 0 for matched-tier modes.';

COMMENT ON COLUMN public.commercial_term_tiers.incremental_amount IS
  'Per-space increment for progressive_space_pricing bands. NULL for fixed-tier monthly_amount rows.';

COMMENT ON COLUMN public.commercial_term_tiers.monthly_amount IS
  'Total monthly amount for a fixed inventory-count tier. Unused (0) for progressive bands.';
