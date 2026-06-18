-- Unified space pricing fields (price_amount + price_unit).
-- deposit_required / deposit_amount already exist from phase2a finance migration.

ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS price_amount numeric;

ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS price_unit text;

COMMENT ON COLUMN public.spaces.price_amount IS
  'Listing price in ZAR for the selected price_unit.';
COMMENT ON COLUMN public.spaces.price_unit IS
  'Pricing type: hour | day | event | month | on_request.';

-- Backfill from legacy price_per_* + booking_unit columns.
UPDATE public.spaces
SET
  price_unit = CASE COALESCE(booking_unit, 'day')
    WHEN 'hour' THEN 'hour'
    WHEN 'month' THEN 'month'
    ELSE 'day'
  END,
  price_amount = CASE COALESCE(booking_unit, 'day')
    WHEN 'hour' THEN price_per_hour
    WHEN 'month' THEN price_per_month
    ELSE price_per_day
  END
WHERE price_unit IS NULL
  AND (
    price_per_hour IS NOT NULL
    OR price_per_day IS NOT NULL
    OR price_per_month IS NOT NULL
  );
