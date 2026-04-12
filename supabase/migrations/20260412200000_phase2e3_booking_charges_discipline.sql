-- Phase 2E.3: booking_charges discipline, deduplication, and finance query indexes.
-- Idempotent where possible; preserves backward compatibility.

-- ---------------------------------------------------------------------------
-- 1) Normalize status values before CHECK (maps UI/legacy variants to app model)
-- ---------------------------------------------------------------------------
UPDATE public.booking_charges
SET status = lower(trim(coalesce(status, '')));

UPDATE public.booking_charges
SET status = 'paid'
WHERE status = 'paid_confirmed';

UPDATE public.booking_charges
SET status = 'pending'
WHERE status IS NULL
   OR status = ''
   OR status NOT IN ('pending', 'paid');

-- ---------------------------------------------------------------------------
-- 2) charge_type: trim; fix empty / null before CHECK
-- ---------------------------------------------------------------------------
UPDATE public.booking_charges
SET charge_type = trim(charge_type)
WHERE charge_type IS NOT NULL;

UPDATE public.booking_charges
SET charge_type = 'legacy_untyped'
WHERE charge_type IS NULL
   OR trim(charge_type) = '';

-- ---------------------------------------------------------------------------
-- 3) Remove duplicate pending rows for known singleton charge types (keep oldest)
-- ---------------------------------------------------------------------------
DELETE FROM public.booking_charges bc
USING (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY booking_id, charge_type
        ORDER BY created_at ASC NULLS LAST, id ASC
      ) AS rn
    FROM public.booking_charges
    WHERE status = 'pending'
      AND charge_type IN ('booking_total', 'first_month_rent', 'deposit')
  ) ranked
  WHERE ranked.rn > 1
) doomed
WHERE bc.id = doomed.id;

-- ---------------------------------------------------------------------------
-- 4) Constraints: status and charge_type
-- ---------------------------------------------------------------------------
ALTER TABLE public.booking_charges
  DROP CONSTRAINT IF EXISTS booking_charges_status_check;

ALTER TABLE public.booking_charges
  ADD CONSTRAINT booking_charges_status_check
  CHECK (status IN ('pending', 'paid'));

ALTER TABLE public.booking_charges
  DROP CONSTRAINT IF EXISTS booking_charges_charge_type_check;

ALTER TABLE public.booking_charges
  ADD CONSTRAINT booking_charges_charge_type_check
  CHECK (
    char_length(charge_type) >= 1
    AND char_length(charge_type) <= 128
  );

COMMENT ON CONSTRAINT booking_charges_status_check ON public.booking_charges IS
  'Line lifecycle: pending until payment marks paid (see markBookingChargesPaid).';

COMMENT ON CONSTRAINT booking_charges_charge_type_check ON public.booking_charges IS
  'Non-empty charge_type; app uses snake_case identifiers (booking_total, deposit, …).';

-- ---------------------------------------------------------------------------
-- 5) Uniqueness: at most one pending row per (booking_id, charge_type) for
--    types that are never duplicated in current product flows. Recurring rent
--    lines must NOT use this partial index — use other charge_type values or
--    paid rows for history.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS booking_charges_unique_pending_singleton_types;

CREATE UNIQUE INDEX booking_charges_unique_pending_singleton_types
  ON public.booking_charges (booking_id, charge_type)
  WHERE status = 'pending'
    AND charge_type IN ('booking_total', 'first_month_rent', 'deposit');

COMMENT ON INDEX booking_charges_unique_pending_singleton_types IS
  'Prevents duplicate pending line items for initial checkout-style charges.';

-- ---------------------------------------------------------------------------
-- 6) booking_charges: ordering for invoice / detail (booking_id + created_at)
--    (booking_id, status) from Phase 2E.2 remains; add created_at for sort)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS booking_charges_booking_id_created_at_idx
  ON public.booking_charges (booking_id, created_at);

-- ---------------------------------------------------------------------------
-- 7) bookings: owner finance filter + sort (eq owner_id, order created_at desc)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS bookings_owner_id_created_at_idx
  ON public.bookings (owner_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 8) bookings: admin finance / export ordering by recency
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS bookings_created_at_idx
  ON public.bookings (created_at DESC);
