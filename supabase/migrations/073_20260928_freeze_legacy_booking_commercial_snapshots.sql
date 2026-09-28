-- Freeze legacy NULL commercial snapshots so they cannot be backfilled.
-- Additive. Does not UPDATE booking money or rewrite historical rows.

CREATE OR REPLACE FUNCTION public.bookings_freeze_commercial_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  old_has_snapshot boolean;
BEGIN
  old_has_snapshot :=
    OLD.commercial_model IS NOT NULL
    OR OLD.platform_commission_percent IS NOT NULL
    OR OLD.transaction_fee_percent IS NOT NULL
    OR OLD.platform_commission_amount IS NOT NULL
    OR OLD.transaction_fee_amount IS NOT NULL
    OR OLD.monthly_subscription_amount IS NOT NULL
    OR OLD.commercial_terms_id IS NOT NULL
    OR OLD.commercial_terms_source IS NOT NULL
    OR OLD.commercial_terms_effective_at IS NOT NULL;

  IF
    NEW.commercial_model IS DISTINCT FROM OLD.commercial_model
    OR NEW.platform_commission_percent IS DISTINCT FROM OLD.platform_commission_percent
    OR NEW.transaction_fee_percent IS DISTINCT FROM OLD.transaction_fee_percent
    OR NEW.platform_commission_amount IS DISTINCT FROM OLD.platform_commission_amount
    OR NEW.transaction_fee_amount IS DISTINCT FROM OLD.transaction_fee_amount
    OR NEW.monthly_subscription_amount IS DISTINCT FROM OLD.monthly_subscription_amount
    OR NEW.commercial_terms_id IS DISTINCT FROM OLD.commercial_terms_id
    OR NEW.commercial_terms_source IS DISTINCT FROM OLD.commercial_terms_source
    OR NEW.commercial_terms_effective_at IS DISTINCT FROM OLD.commercial_terms_effective_at
  THEN
    IF NOT old_has_snapshot THEN
      RAISE EXCEPTION 'booking_commercial_snapshot_frozen'
        USING HINT = 'Legacy bookings cannot be backfilled with commercial snapshots.';
    END IF;

    RAISE EXCEPTION 'booking_commercial_snapshot_frozen'
      USING HINT = 'Booking commercial terms are a historical snapshot and cannot be rewritten.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.bookings_freeze_commercial_snapshot() IS
  'Prevents rewriting booking commercial snapshots, including backfilling NULL legacy rows.';
