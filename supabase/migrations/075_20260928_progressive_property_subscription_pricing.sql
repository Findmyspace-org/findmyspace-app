-- Progressive per-property subscription pricing.
-- Additive CHECK expansion only. Does not rewrite historical terms,
-- tiers, bookings, or periods.

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
      'progressive_space_pricing',
      'progressive_property_pricing'
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
          'progressive_space_pricing',
          'progressive_property_pricing'
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
      'progressive_space_pricing',
      'progressive_property_pricing'
    )
  );

COMMENT ON COLUMN public.commercial_terms.subscription_included_units IS
  'Units included in the base monthly fee for progressive_space_pricing and progressive_property_pricing. NULL for other modes.';

COMMENT ON COLUMN public.commercial_terms.monthly_subscription_amount IS
  'Fixed monthly amount, or progressive base monthly fee. 0 for matched-tier modes.';

COMMENT ON COLUMN public.commercial_term_tiers.incremental_amount IS
  'Per-unit increment for progressive bands. NULL for fixed-tier monthly_amount rows.';
