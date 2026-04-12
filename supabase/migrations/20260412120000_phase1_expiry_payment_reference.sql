-- Phase 1: Auto-expiry RPC + payment_reference for PayFast reconciliation
-- Apply via Supabase SQL Editor or `supabase db push` / migrate tooling.

-- PayFast pf_payment_id stored after successful ITN (Phase 1 handoff for finance)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_reference text;

-- Idempotent expiry: unpaid approved bookings older than 24h from owner response (or fallback timestamps)
CREATE OR REPLACE FUNCTION public.expire_unpaid_bookings()
RETURNS TABLE (id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.bookings b
  SET
    status = 'expired',
    payment_status = 'unpaid'
  WHERE b.status = 'accepted_awaiting_payment'
    AND b.payment_status = 'awaiting_payment'
    AND COALESCE(b.owner_response_at, b.created_at)
      <= (timezone('utc', now()) - interval '24 hours')
  RETURNING b.id;
END;
$$;

COMMENT ON FUNCTION public.expire_unpaid_bookings() IS
  'Marks accepted_awaiting_payment bookings as expired after 24h without payment; returns affected booking ids.';

GRANT EXECUTE ON FUNCTION public.expire_unpaid_bookings() TO service_role;
