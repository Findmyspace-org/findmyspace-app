-- Persist test/non-payable subscription invoices issued without EFT details.
-- Additive. Does not rewrite commercial_terms, bookings, payouts, or invoice amounts/dates.

ALTER TABLE public.commercial_subscription_periods
  ADD COLUMN IF NOT EXISTS is_test_invoice boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.commercial_subscription_periods.is_test_invoice IS
  'True when the invoice was issued without complete FindMySpace EFT instructions. Not payable. Excluded from subscription revenue and organisation-admin invoice lists.';

CREATE INDEX IF NOT EXISTS commercial_subscription_periods_test_idx
  ON public.commercial_subscription_periods (is_test_invoice)
  WHERE is_test_invoice = true;

-- Voided periods remain as audit rows. A later real invoice for the same month is allowed.
DROP INDEX IF EXISTS public.commercial_subscription_periods_scope_month_uidx;
CREATE UNIQUE INDEX commercial_subscription_periods_scope_month_uidx
  ON public.commercial_subscription_periods (scope_type, scope_id, billing_month)
  WHERE status IS DISTINCT FROM 'void';

-- Classify and void the known production workflow-test invoice.
-- Keep invoice number, snapshot, amount, invoice_date, and due_date immutable.
UPDATE public.commercial_subscription_periods
SET
  is_test_invoice = true,
  status = 'void',
  voided_at = COALESCE(voided_at, now()),
  voided_by = COALESCE(voided_by, issued_by),
  void_reason = COALESCE(
    NULLIF(btrim(void_reason), ''),
    'Production billing workflow test'
  )
WHERE invoice_number = 'FMS-SUB-2026-0001'
  AND payment_status = 'unpaid'
  AND status IS DISTINCT FROM 'void';
