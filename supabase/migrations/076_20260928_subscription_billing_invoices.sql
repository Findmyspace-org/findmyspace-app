-- Monthly subscription billing, invoicing, and manual payment tracking.
-- Additive only. Does not rewrite historical rows, bookings, or commercial_terms.

-- ---------------------------------------------------------------------------
-- Invoice number counters (per Johannesburg calendar year)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commercial_subscription_invoice_counters (
  year integer PRIMARY KEY CHECK (year >= 2000 AND year <= 2100),
  last_seq integer NOT NULL DEFAULT 0 CHECK (last_seq >= 0)
);

ALTER TABLE public.commercial_subscription_invoice_counters ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.commercial_subscription_invoice_counters FROM PUBLIC;
REVOKE ALL ON TABLE public.commercial_subscription_invoice_counters FROM anon;
REVOKE ALL ON TABLE public.commercial_subscription_invoice_counters FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_subscription_invoice_counters TO service_role;

CREATE OR REPLACE FUNCTION public.next_subscription_invoice_number(p_year integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq integer;
BEGIN
  IF p_year IS NULL OR p_year < 2000 OR p_year > 2100 THEN
    RAISE EXCEPTION 'invalid_subscription_invoice_year';
  END IF;

  INSERT INTO public.commercial_subscription_invoice_counters AS c (year, last_seq)
  VALUES (p_year, 1)
  ON CONFLICT (year) DO UPDATE
    SET last_seq = c.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN 'FMS-SUB-' || p_year::text || '-' || lpad(v_seq::text, GREATEST(4, length(v_seq::text)), '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_subscription_invoice_number(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_subscription_invoice_number(integer) FROM anon;
REVOKE ALL ON FUNCTION public.next_subscription_invoice_number(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.next_subscription_invoice_number(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Period billing columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.commercial_subscription_periods
  ADD COLUMN IF NOT EXISTS billed_organisation_id uuid
    REFERENCES public.organisations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billed_party_name text,
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS invoice_date date,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS amount_paid numeric(12, 2),
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS payment_note text,
  ADD COLUMN IF NOT EXISTS payment_recorded_by uuid,
  ADD COLUMN IF NOT EXISTS calculation_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS issued_by uuid,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid,
  ADD COLUMN IF NOT EXISTS void_reason text;

ALTER TABLE public.commercial_subscription_periods
  DROP CONSTRAINT IF EXISTS commercial_subscription_periods_payment_status_chk;

ALTER TABLE public.commercial_subscription_periods
  ADD CONSTRAINT commercial_subscription_periods_payment_status_chk
  CHECK (payment_status IN ('unpaid', 'paid'));

ALTER TABLE public.commercial_subscription_periods
  DROP CONSTRAINT IF EXISTS commercial_subscription_periods_invoice_number_chk;

ALTER TABLE public.commercial_subscription_periods
  ADD CONSTRAINT commercial_subscription_periods_invoice_number_chk
  CHECK (
    invoice_number IS NULL
    OR invoice_number ~ '^FMS-SUB-[0-9]{4}-[0-9]{4,}$'
  );

ALTER TABLE public.commercial_subscription_periods
  DROP CONSTRAINT IF EXISTS commercial_subscription_periods_amount_paid_chk;

ALTER TABLE public.commercial_subscription_periods
  ADD CONSTRAINT commercial_subscription_periods_amount_paid_chk
  CHECK (amount_paid IS NULL OR amount_paid >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS commercial_subscription_periods_invoice_number_uidx
  ON public.commercial_subscription_periods (invoice_number)
  WHERE invoice_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS commercial_subscription_periods_org_idx
  ON public.commercial_subscription_periods (billed_organisation_id, billing_month DESC);

CREATE INDEX IF NOT EXISTS commercial_subscription_periods_payment_idx
  ON public.commercial_subscription_periods (payment_status, status);

COMMENT ON TABLE public.commercial_subscription_periods IS
  'Monthly subscription billing snapshots owed TO FindMySpace. Historical truth: do not recalculate after create. Not booking revenue and not organisation payouts.';

COMMENT ON COLUMN public.commercial_subscription_periods.billing_month IS
  'First calendar day of the billed month in Africa/Johannesburg.';

COMMENT ON COLUMN public.commercial_subscription_periods.status IS
  'Billing status: draft | open | invoiced | void. Payment is a separate payment_status.';

COMMENT ON COLUMN public.commercial_subscription_periods.payment_status IS
  'unpaid | paid. Manual EFT tracking only.';

COMMENT ON COLUMN public.commercial_subscription_periods.calculation_snapshot IS
  'Frozen pricing breakdown used by invoices. Never recompute from live terms.';

COMMENT ON COLUMN public.commercial_subscription_periods.invoice_number IS
  'Stable FMS-SUB-YYYY-NNNN number allocated when the invoice is issued. Never reused.';
