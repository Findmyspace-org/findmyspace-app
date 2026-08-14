-- Booking-specific discounts applied at approval time.
-- Does not change space/listing/property pricing. Historical rows stay valid
-- with nullable columns. PayFast continues to use bookings.total_price as the
-- payable amount (set to the final approved amount by the server approve API).

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS original_total_price numeric(12, 2),
  ADD COLUMN IF NOT EXISTS discount_type text,
  ADD COLUMN IF NOT EXISTS discount_value numeric(12, 2),
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12, 2),
  ADD COLUMN IF NOT EXISTS discount_reason text,
  ADD COLUMN IF NOT EXISTS discount_applied_by uuid,
  ADD COLUMN IF NOT EXISTS discount_applied_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bookings_discount_applied_by_fkey'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_discount_applied_by_fkey
      FOREIGN KEY (discount_applied_by)
      REFERENCES auth.users (id)
      ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_discount_type_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_discount_type_check
  CHECK (
    discount_type IS NULL
    OR discount_type IN ('percent', 'fixed', 'negotiated')
  );

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_discount_value_nonnegative_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_discount_value_nonnegative_check
  CHECK (discount_value IS NULL OR discount_value >= 0);

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_discount_amount_nonnegative_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_discount_amount_nonnegative_check
  CHECK (discount_amount IS NULL OR discount_amount >= 0);

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_original_total_price_nonnegative_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_original_total_price_nonnegative_check
  CHECK (original_total_price IS NULL OR original_total_price >= 0);

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_discount_not_exceed_original_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_discount_not_exceed_original_check
  CHECK (
    discount_amount IS NULL
    OR original_total_price IS NULL
    OR discount_amount <= original_total_price
  );

COMMENT ON COLUMN public.bookings.original_total_price IS
  'Pricing-engine snapshot at request (or first approval). Never overwritten by a discount. Null on historical bookings; treat as total_price.';
COMMENT ON COLUMN public.bookings.discount_type IS
  'percent | fixed | negotiated. Null when no booking-specific discount was applied.';
COMMENT ON COLUMN public.bookings.discount_value IS
  'Approver input: percent (0-100), fixed rand amount, or negotiated final rand amount.';
COMMENT ON COLUMN public.bookings.discount_amount IS
  'Rand amount subtracted from original_total_price. Payable amount is stored in total_price.';
COMMENT ON COLUMN public.bookings.discount_reason IS
  'Internal approver note. Not shown to the customer.';
COMMENT ON COLUMN public.bookings.discount_applied_by IS
  'Profile id of the approver who authorised the discount.';
COMMENT ON COLUMN public.bookings.discount_applied_at IS
  'When the discount was stored as part of approval.';

CREATE INDEX IF NOT EXISTS bookings_discount_applied_by_idx
  ON public.bookings (discount_applied_by)
  WHERE discount_applied_by IS NOT NULL;

-- Prevent JWT clients from changing financial columns. Status/payment_status
-- remain updatable for existing decline flows. Service-role approve API has
-- auth.uid() IS NULL and is allowed.
CREATE OR REPLACE FUNCTION public.enforce_booking_finance_server_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NEW.total_price IS DISTINCT FROM OLD.total_price
       OR NEW.original_total_price IS DISTINCT FROM OLD.original_total_price
       OR NEW.discount_type IS DISTINCT FROM OLD.discount_type
       OR NEW.discount_value IS DISTINCT FROM OLD.discount_value
       OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
       OR NEW.discount_reason IS DISTINCT FROM OLD.discount_reason
       OR NEW.discount_applied_by IS DISTINCT FROM OLD.discount_applied_by
       OR NEW.discount_applied_at IS DISTINCT FROM OLD.discount_applied_at
       OR NEW.platform_fee IS DISTINCT FROM OLD.platform_fee
       OR NEW.owner_earnings IS DISTINCT FROM OLD.owner_earnings
       OR NEW.initial_payment_amount IS DISTINCT FROM OLD.initial_payment_amount
       OR NEW.deposit_amount IS DISTINCT FROM OLD.deposit_amount
       OR NEW.monthly_rent IS DISTINCT FROM OLD.monthly_rent
    THEN
      RAISE EXCEPTION 'bookings_finance_server_only'
        USING HINT = 'Booking amounts can only be changed through the server approval API.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_booking_finance_server_only() IS
  'Blocks authenticated JWT updates to booking price/discount columns; service_role approve API may change them.';

DROP TRIGGER IF EXISTS tr_bookings_finance_server_only ON public.bookings;
CREATE TRIGGER tr_bookings_finance_server_only
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_booking_finance_server_only();
