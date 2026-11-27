-- Split commercial terms are recalculated. Frozen snapshot columns stay as first written.
DO $$
DECLARE
  space uuid := '10000000-0000-4000-8000-000000000088';
  renter uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  host uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  split_id uuid := gen_random_uuid();
  subscription_id uuid := gen_random_uuid();
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS commercial_model text,
    ADD COLUMN IF NOT EXISTS platform_commission_percent numeric,
    ADD COLUMN IF NOT EXISTS transaction_fee_percent numeric,
    ADD COLUMN IF NOT EXISTS platform_commission_amount numeric,
    ADD COLUMN IF NOT EXISTS transaction_fee_amount numeric,
    ADD COLUMN IF NOT EXISTS monthly_subscription_amount numeric,
    ADD COLUMN IF NOT EXISTS commercial_terms_id uuid,
    ADD COLUMN IF NOT EXISTS commercial_terms_source text,
    ADD COLUMN IF NOT EXISTS commercial_terms_effective_at timestamptz;

  CREATE OR REPLACE FUNCTION public.bookings_freeze_commercial_snapshot()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
  AS $fn$
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
        RAISE EXCEPTION 'booking_commercial_snapshot_frozen';
      END IF;
      RAISE EXCEPTION 'booking_commercial_snapshot_frozen';
    END IF;
    RETURN NEW;
  END;
  $fn$;

  DROP TRIGGER IF EXISTS bookings_freeze_commercial_snapshot ON public.bookings;
  CREATE TRIGGER bookings_freeze_commercial_snapshot
    BEFORE UPDATE ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.bookings_freeze_commercial_snapshot();

  INSERT INTO public.spaces (id, status, public_listing_mode, recurring_bookings_enabled, price_per_hour)
  VALUES (space, 'active', 'live', true, 250);

  INSERT INTO public.bookings (
    id, space_id, renter_id, status, payment_status, start_at, end_at,
    total_price, platform_fee, owner_earnings,
    commercial_model, platform_commission_percent, transaction_fee_percent,
    platform_commission_amount, transaction_fee_amount, monthly_subscription_amount,
    commercial_terms_source
  ) VALUES (
    split_id, space, renter, 'pending_owner', 'unpaid',
    '2027-08-02 09:00+02', '2027-08-02 17:00+02',
    6.44, 0.96, 5.48,
    'commission', 10, 5,
    0.64, 0.32, 0,
    'organisation'
  );
  INSERT INTO public.booking_charges (booking_id, charge_type, amount, currency, status)
  VALUES (split_id, 'booking_total', 6.44, 'ZAR', 'pending');

  BEGIN
    UPDATE public.bookings SET platform_commission_amount = 0.01 WHERE id = split_id;
    RAISE EXCEPTION 'the snapshot freeze did not reject a rewrite';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%booking_commercial_snapshot_frozen%' THEN RAISE; END IF;
  END;

  PERFORM public.approve_booking_with_discount(split_id, host, 'approve', NULL, 'percent', 20, 'Rounding');
  IF (SELECT total_price FROM public.bookings WHERE id = split_id) <> 5.15 THEN
    RAISE EXCEPTION '20 percent of 6.44 should approve at 5.15';
  END IF;
  IF (SELECT platform_fee FROM public.bookings WHERE id = split_id) <> 0.78 THEN
    RAISE EXCEPTION 'split fee should be recalculated to 0.78, not scaled to 0.77';
  END IF;
  IF (SELECT owner_earnings FROM public.bookings WHERE id = split_id) <> 4.37 THEN
    RAISE EXCEPTION 'host payout should be 4.37';
  END IF;
  IF (SELECT platform_commission_amount FROM public.bookings WHERE id = split_id) <> 0.64
     OR (SELECT transaction_fee_amount FROM public.bookings WHERE id = split_id) <> 0.32
     OR (SELECT monthly_subscription_amount FROM public.bookings WHERE id = split_id) <> 0 THEN
    RAISE EXCEPTION 'the frozen commercial snapshot was rewritten';
  END IF;
  IF (SELECT platform_commission FROM public.booking_discounts WHERE booking_id = split_id) <> 0.52
     OR (SELECT transaction_fee FROM public.booking_discounts WHERE booking_id = split_id) <> 0.26
     OR (SELECT original_rental FROM public.booking_discounts WHERE booking_id = split_id) <> 6.44 THEN
    RAISE EXCEPTION 'the discount audit did not keep the recalculated split';
  END IF;

  INSERT INTO public.bookings (
    id, space_id, renter_id, status, payment_status, start_at, end_at,
    total_price, platform_fee, owner_earnings,
    commercial_model, platform_commission_percent, transaction_fee_percent,
    platform_commission_amount, transaction_fee_amount, monthly_subscription_amount,
    commercial_terms_source
  ) VALUES (
    subscription_id, space, renter, 'pending_owner', 'unpaid',
    '2027-08-03 09:00+02', '2027-08-03 17:00+02',
    100, 5, 95,
    'subscription', 10, 5,
    0, 5, 250,
    'organisation'
  );
  INSERT INTO public.booking_charges (booking_id, charge_type, amount, currency, status)
  VALUES (subscription_id, 'booking_total', 100, 'ZAR', 'pending');
  PERFORM public.approve_booking_with_discount(subscription_id, host, 'approve', NULL, 'percent', 20, 'Subscription');
  IF (SELECT platform_fee FROM public.bookings WHERE id = subscription_id) <> 4 THEN
    RAISE EXCEPTION 'a subscription booking should charge only the transaction fee';
  END IF;
  IF (SELECT platform_commission FROM public.booking_discounts WHERE booking_id = subscription_id) <> 0
     OR (SELECT transaction_fee FROM public.booking_discounts WHERE booking_id = subscription_id) <> 4 THEN
    RAISE EXCEPTION 'subscription commission was charged on the booking';
  END IF;
  IF (SELECT monthly_subscription_amount FROM public.bookings WHERE id = subscription_id) <> 250 THEN
    RAISE EXCEPTION 'the monthly subscription amount was scaled with the rental';
  END IF;
END $$;
