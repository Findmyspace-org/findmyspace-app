-- Global Admin commercial charging model.
-- Additive and backward compatible: does not rewrite historical bookings,
-- does not seed a platform default, and does not change PayFast amounts.
--
-- bookings.platform_fee remains the total FindMySpace deduction
-- (legacy combined 15% OR commission + transaction). Component columns are
-- nullable so R100 / R15 / R85 rows stay exactly as stored.

-- ---------------------------------------------------------------------------
-- commercial_terms (versioned, scoped, Global Admin via service-role APIs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commercial_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL
    CHECK (scope_type IN ('platform', 'organisation', 'property', 'space')),
  scope_id uuid,
  commercial_model text NOT NULL
    CHECK (commercial_model IN ('commission', 'subscription', 'free')),
  commission_percent numeric(7, 3) NOT NULL DEFAULT 0,
  transaction_fee_percent numeric(7, 3) NOT NULL DEFAULT 5,
  monthly_subscription_amount numeric(12, 2) NOT NULL DEFAULT 0,
  effective_from timestamptz NOT NULL,
  superseded_at timestamptz,
  admin_note text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_terms_platform_scope_id_chk CHECK (
    (scope_type = 'platform' AND scope_id IS NULL)
    OR (scope_type <> 'platform' AND scope_id IS NOT NULL)
  ),
  CONSTRAINT commercial_terms_commission_range_chk CHECK (
    commission_percent >= 0 AND commission_percent <= 100
  ),
  CONSTRAINT commercial_terms_transaction_range_chk CHECK (
    transaction_fee_percent >= 0 AND transaction_fee_percent <= 100
  ),
  CONSTRAINT commercial_terms_rates_sum_chk CHECK (
    commission_percent + transaction_fee_percent <= 100
  ),
  CONSTRAINT commercial_terms_subscription_nonneg_chk CHECK (
    monthly_subscription_amount >= 0
  ),
  CONSTRAINT commercial_terms_model_amounts_chk CHECK (
    (
      commercial_model = 'commission'
      AND monthly_subscription_amount = 0
    )
    OR (
      commercial_model = 'subscription'
      AND commission_percent = 0
    )
    OR (
      commercial_model = 'free'
      AND commission_percent = 0
      AND monthly_subscription_amount = 0
    )
  ),
  CONSTRAINT commercial_terms_superseded_after_from_chk CHECK (
    superseded_at IS NULL OR superseded_at > effective_from
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS commercial_terms_scope_effective_uidx
  ON public.commercial_terms (
    scope_type,
    COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
    effective_from
  );

CREATE INDEX IF NOT EXISTS commercial_terms_scope_lookup_idx
  ON public.commercial_terms (scope_type, scope_id, effective_from DESC);

CREATE INDEX IF NOT EXISTS commercial_terms_open_idx
  ON public.commercial_terms (scope_type, scope_id)
  WHERE superseded_at IS NULL;

COMMENT ON TABLE public.commercial_terms IS
  'Versioned FindMySpace commercial arrangements. Global Admin writes via service-role APIs only. Hosts cannot mutate.';

COMMENT ON COLUMN public.commercial_terms.commission_percent IS
  'Platform/marketplace commission percent of gross booking payment. 0 for subscription and free models.';

COMMENT ON COLUMN public.commercial_terms.transaction_fee_percent IS
  'FindMySpace payment-processing charge percent applied to each online payment. Not PayFast''s published fee.';

COMMENT ON COLUMN public.commercial_terms.monthly_subscription_amount IS
  'Agreed monthly FindMySpace subscription (ZAR). Stored for the agreement; this migration does not bill it.';

COMMENT ON COLUMN public.commercial_terms.admin_note IS
  'Internal Global Admin reason (partnership, promotion, school waiver). Never expose on renter invoices.';

ALTER TABLE public.commercial_terms ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.commercial_terms FROM PUBLIC;
REVOKE ALL ON TABLE public.commercial_terms FROM anon;
REVOKE ALL ON TABLE public.commercial_terms FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_terms TO service_role;

-- ---------------------------------------------------------------------------
-- Booking commercial snapshot (nullable = legacy combined platform_fee)
-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS commercial_model text,
  ADD COLUMN IF NOT EXISTS platform_commission_percent numeric(7, 3),
  ADD COLUMN IF NOT EXISTS transaction_fee_percent numeric(7, 3),
  ADD COLUMN IF NOT EXISTS platform_commission_amount numeric(12, 2),
  ADD COLUMN IF NOT EXISTS transaction_fee_amount numeric(12, 2),
  ADD COLUMN IF NOT EXISTS monthly_subscription_amount numeric(12, 2),
  ADD COLUMN IF NOT EXISTS commercial_terms_id uuid
    REFERENCES public.commercial_terms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commercial_terms_source text,
  ADD COLUMN IF NOT EXISTS commercial_terms_effective_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'bookings_commercial_model_chk'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_commercial_model_chk
      CHECK (
        commercial_model IS NULL
        OR commercial_model IN ('commission', 'subscription', 'free')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'bookings_commercial_terms_source_chk'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_commercial_terms_source_chk
      CHECK (
        commercial_terms_source IS NULL
        OR commercial_terms_source IN (
          'platform',
          'organisation',
          'property',
          'space',
          'legacy_space_percent'
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.bookings.platform_fee IS
  'Total FindMySpace deduction from gross (commission + transaction, or legacy combined percent). Identity: total_price = platform_fee + owner_earnings. Do not reinterpret historical rows.';

COMMENT ON COLUMN public.bookings.platform_commission_amount IS
  'Snapshotted platform/marketplace commission in ZAR. NULL on legacy bookings that only store combined platform_fee.';

COMMENT ON COLUMN public.bookings.transaction_fee_amount IS
  'Snapshotted FindMySpace transaction/processing charge in ZAR for the initial booking total. NULL on legacy combined-fee bookings.';

COMMENT ON COLUMN public.bookings.monthly_subscription_amount IS
  'Subscription amount in force at booking creation when the model is subscription. Not a booking charge.';

CREATE INDEX IF NOT EXISTS bookings_commercial_terms_id_idx
  ON public.bookings (commercial_terms_id)
  WHERE commercial_terms_id IS NOT NULL;

-- Freeze snapshotted commercial columns once they have been set.
-- NULL snapshots (legacy bookings) remain untouched so we never rewrite them.
CREATE OR REPLACE FUNCTION public.bookings_freeze_commercial_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.commercial_model IS NULL
    AND OLD.platform_commission_amount IS NULL
    AND OLD.transaction_fee_amount IS NULL
    AND OLD.commercial_terms_id IS NULL
    AND OLD.commercial_terms_source IS NULL
  THEN
    RETURN NEW;
  END IF;

  IF NEW.commercial_model IS DISTINCT FROM OLD.commercial_model
    OR NEW.platform_commission_percent IS DISTINCT FROM OLD.platform_commission_percent
    OR NEW.transaction_fee_percent IS DISTINCT FROM OLD.transaction_fee_percent
    OR NEW.platform_commission_amount IS DISTINCT FROM OLD.platform_commission_amount
    OR NEW.transaction_fee_amount IS DISTINCT FROM OLD.transaction_fee_amount
    OR NEW.monthly_subscription_amount IS DISTINCT FROM OLD.monthly_subscription_amount
    OR NEW.commercial_terms_id IS DISTINCT FROM OLD.commercial_terms_id
    OR NEW.commercial_terms_source IS DISTINCT FROM OLD.commercial_terms_source
    OR NEW.commercial_terms_effective_at IS DISTINCT FROM OLD.commercial_terms_effective_at
  THEN
    RAISE EXCEPTION 'booking_commercial_snapshot_frozen'
      USING HINT = 'Booking commercial terms are a historical snapshot and cannot be rewritten.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_freeze_commercial_snapshot ON public.bookings;
CREATE TRIGGER bookings_freeze_commercial_snapshot
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.bookings_freeze_commercial_snapshot();
