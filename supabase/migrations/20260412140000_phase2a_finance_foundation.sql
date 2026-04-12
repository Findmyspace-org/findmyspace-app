-- Phase 2A: Finance data model foundation (invoices, monthly charges, reporting hooks).
-- Safe to apply after 20260412120000_phase1_expiry_payment_reference.sql
-- Does not change payment or expiry behaviour; extends schema only.

-- ---------------------------------------------------------------------------
-- bookings: align naming with product model (owner_earnings)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bookings'
      AND column_name = 'owner_amount'
  ) THEN
    ALTER TABLE public.bookings RENAME COLUMN owner_amount TO owner_earnings;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bookings'
      AND column_name = 'owner_earnings'
  ) THEN
    ALTER TABLE public.bookings ADD COLUMN owner_earnings numeric;
  END IF;
END $$;

COMMENT ON COLUMN public.bookings.owner_earnings IS
  'Net amount due to the owner after platform_fee for this booking''s charge total.';

-- Ensure core finance columns exist on greenfield / older DBs
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_reference text;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS platform_fee numeric;

COMMENT ON COLUMN public.bookings.payment_reference IS
  'Gateway reference (e.g. PayFast pf_payment_id) for the primary checkout payment.';
COMMENT ON COLUMN public.bookings.paid_at IS
  'When the renter payment was recorded as complete.';
COMMENT ON COLUMN public.bookings.platform_fee IS
  'Platform fee amount in currency of total_price, computed at booking creation.';

-- ---------------------------------------------------------------------------
-- spaces: explicit deposit flags and optional fixed deposit amount
-- ---------------------------------------------------------------------------
ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS deposit_required boolean NOT NULL DEFAULT false;

ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS deposit_amount numeric;

COMMENT ON COLUMN public.spaces.deposit_required IS
  'True when this listing requires a deposit for monthly bookings.';
COMMENT ON COLUMN public.spaces.deposit_type IS
  'Deposit rule: none | one_month | two_months (existing app values).';
COMMENT ON COLUMN public.spaces.deposit_amount IS
  'Optional explicit deposit in listing currency; when null, derive from rent × deposit_months.';

-- Backfill deposit_required from existing deposit_type / deposit_months
UPDATE public.spaces
SET deposit_required = true
WHERE (deposit_type IS NOT NULL AND deposit_type <> 'none')
   OR COALESCE(deposit_months, 0) > 0;

-- ---------------------------------------------------------------------------
-- booking_charges: line items for invoices and future recurring statements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  charge_type text NOT NULL,
  description text,
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  status text NOT NULL DEFAULT 'pending',
  invoice_number text,
  statement_month date,
  payment_reference text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS booking_charges_booking_id_idx
  ON public.booking_charges (booking_id);

CREATE INDEX IF NOT EXISTS booking_charges_status_idx
  ON public.booking_charges (status);

CREATE INDEX IF NOT EXISTS booking_charges_statement_month_idx
  ON public.booking_charges (statement_month);

CREATE INDEX IF NOT EXISTS booking_charges_invoice_number_idx
  ON public.booking_charges (invoice_number)
  WHERE invoice_number IS NOT NULL;

COMMENT ON TABLE public.booking_charges IS
  'Per-booking charge lines: first month, deposit, recurring rent, adjustments; supports invoices and statements.';

COMMENT ON COLUMN public.booking_charges.charge_type IS
  'e.g. first_month_rent, deposit, recurring_rent, adjustment — app-defined.';

COMMENT ON COLUMN public.booking_charges.statement_month IS
  'Calendar month (store as first day) for owner statements / reporting.';

COMMENT ON COLUMN public.booking_charges.invoice_number IS
  'Human-readable invoice id when this line is billed to renter.';
