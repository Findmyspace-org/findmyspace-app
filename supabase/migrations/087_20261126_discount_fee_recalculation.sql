-- Recalculate split commercial fees from the snapshotted percentages.
-- Do not rewrite frozen commercial snapshot columns.
-- Lock the space before the booking row.

ALTER TABLE public.booking_discounts
  ADD COLUMN IF NOT EXISTS transaction_fee numeric(12,2),
  ADD COLUMN IF NOT EXISTS platform_commission numeric(12,2);

CREATE OR REPLACE FUNCTION public.approve_booking_with_discount(
  p_booking_id uuid,
  p_actor_id uuid,
  p_action text,
  p_message text,
  p_discount_type text,
  p_discount_value numeric,
  p_discount_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  b public.bookings%ROWTYPE;
  snap jsonb;
  locked_space uuid;
  original numeric;
  discount_amount numeric;
  approved numeric;
  fee numeric;
  earnings numeric;
  model text;
  source text;
  tx_percent numeric;
  comm_percent numeric;
  tx_fee numeric;
  comm_fee numeric;
  result jsonb;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF NULLIF(btrim(COALESCE(p_discount_type, '')), '') IS NULL THEN
    RETURN public.apply_host_booking_response(p_booking_id, p_actor_id, p_action, p_message);
  END IF;
  IF p_action IS DISTINCT FROM 'approve' THEN
    RAISE EXCEPTION 'discount_rejected: A discount is only applied when the request is approved.';
  END IF;

  SELECT bookings.space_id INTO locked_space
  FROM public.bookings
  WHERE bookings.id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;
  -- Space lock first, then the booking row. The same order as apply_host_booking_response.
  PERFORM public.lock_space_availability(locked_space);
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;
  snap := to_jsonb(b);

  IF b.status NOT IN ('pending', 'pending_owner') THEN
    RAISE EXCEPTION 'This booking has already been responded to.';
  END IF;
  IF COALESCE(b.payment_status, 'unpaid') IS DISTINCT FROM 'unpaid' THEN
    RAISE EXCEPTION 'discount_rejected: A discount cannot be applied after payment has started.';
  END IF;
  IF COALESCE((snap->>'requirements_ready')::boolean, true) = false THEN
    RAISE EXCEPTION 'requirements_incomplete: Required information is still missing. This request cannot be approved or paid.';
  END IF;
  IF NULLIF(snap->>'payment_reference', '') IS NOT NULL THEN
    RAISE EXCEPTION 'discount_rejected: Checkout has already started. The approved amount cannot change.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.booking_charges
    WHERE booking_id = b.id AND status = 'paid'
  ) THEN
    RAISE EXCEPTION 'discount_rejected: This booking has already been paid.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.booking_charges
    WHERE booking_id = b.id
      AND charge_type IN ('deposit', 'first_month_rent', 'monthly_deposit')
  ) OR (
    COALESCE(snap->>'booking_unit', '') = 'month'
    AND COALESCE(snap->>'pricing_mode', '') IS DISTINCT FROM 'flexible'
    AND COALESCE((snap->>'deposit_amount')::numeric, 0) > 0
  ) THEN
    RAISE EXCEPTION 'discount_rejected: Legacy monthly deposit bookings keep their existing deposit calculation. A generic discount is not applied.';
  END IF;

  original := round(COALESCE(b.total_price, 0), 2);
  IF original <= 0 THEN
    RAISE EXCEPTION 'discount_rejected: This request has no rental amount that can be discounted. On-request pricing is unchanged.';
  END IF;
  IF p_discount_type = 'percent' THEN
    IF p_discount_value IS NULL OR p_discount_value <= 0 OR p_discount_value > 100 THEN
      RAISE EXCEPTION 'discount_rejected: A percentage discount must be greater than 0 and no more than 100.';
    END IF;
    discount_amount := round(original * p_discount_value / 100, 2);
  ELSIF p_discount_type = 'fixed' THEN
    IF p_discount_value IS NULL OR p_discount_value <= 0 THEN
      RAISE EXCEPTION 'discount_rejected: Enter a discount greater than zero.';
    END IF;
    discount_amount := round(p_discount_value, 2);
  ELSE
    RAISE EXCEPTION 'discount_rejected: Choose a percentage or a fixed amount in rand.';
  END IF;
  IF discount_amount <= 0 OR discount_amount > original THEN
    RAISE EXCEPTION 'discount_rejected: The discount cannot be more than the booking amount.';
  END IF;
  approved := round(original - discount_amount, 2);
  IF approved < 5 THEN
    RAISE EXCEPTION 'discount_rejected: The amount payable must be at least R5.00. A free booking cannot be sent to PayFast in this release.';
  END IF;
  IF (
    SELECT count(*) FROM public.booking_charges
    WHERE booking_id = b.id AND status = 'pending' AND charge_type = 'booking_total'
  ) <> 1 OR EXISTS (
    SELECT 1 FROM public.booking_charges
    WHERE booking_id = b.id AND status = 'pending' AND charge_type <> 'booking_total'
  ) THEN
    RAISE EXCEPTION 'discount_rejected: This booking does not have one pending rental charge, so the discount was not applied.';
  END IF;

  -- Split terms are recalculated from the snapshotted percentages.
  -- A subscription or free model charges no commission. The monthly subscription
  -- amount is not a booking fee and is left untouched.
  -- Legacy combined bookings do not store a percentage, so the single snapshotted
  -- platform fee is scaled. The frozen commercial snapshot columns are not rewritten.
  model := COALESCE(snap->>'commercial_model', '');
  source := COALESCE(snap->>'commercial_terms_source', '');
  tx_percent := NULLIF(snap->>'transaction_fee_percent', '')::numeric;
  comm_percent := NULLIF(snap->>'platform_commission_percent', '')::numeric;
  IF source <> ''
     AND source IS DISTINCT FROM 'legacy_space_percent'
     AND tx_percent IS NOT NULL
     AND comm_percent IS NOT NULL THEN
    tx_fee := round(approved * tx_percent / 100, 2);
    IF model = 'commission' THEN
      comm_fee := round(approved * comm_percent / 100, 2);
    ELSE
      comm_fee := 0;
    END IF;
    fee := round(tx_fee + comm_fee, 2);
  ELSE
    tx_fee := NULL;
    comm_fee := NULL;
    fee := CASE
      WHEN b.platform_fee IS NOT NULL THEN round(b.platform_fee * approved / original, 2)
      ELSE NULL
    END;
  END IF;
  earnings := CASE WHEN fee IS NOT NULL THEN round(approved - fee, 2) ELSE b.owner_earnings END;

  UPDATE public.bookings
  SET original_requested_total = COALESCE(original_requested_total, original),
      total_price = approved,
      platform_fee = fee,
      owner_earnings = earnings
  WHERE id = b.id;

  UPDATE public.booking_charges
  SET amount = approved
  WHERE booking_id = b.id AND charge_type = 'booking_total' AND status = 'pending';

  INSERT INTO public.booking_discounts (
    booking_id, discount_type, discount_value, discount_amount, currency, reason,
    original_rental, approved_rental, platform_fee, host_payout,
    transaction_fee, platform_commission, commercial_snapshot, created_by
  ) VALUES (
    b.id, p_discount_type, round(p_discount_value, 2), discount_amount, 'ZAR',
    NULLIF(btrim(COALESCE(p_discount_reason, '')), ''),
    original, approved, fee, earnings, tx_fee, comm_fee, snap, p_actor_id
  );

  result := public.apply_host_booking_response(p_booking_id, p_actor_id, 'approve', p_message);
  RETURN result || jsonb_build_object(
    'original_rental', original,
    'discount_amount', discount_amount,
    'approved_rental', approved
  );
END;
$$;


REVOKE ALL ON FUNCTION public.approve_booking_with_discount(uuid, uuid, text, text, text, numeric, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.approve_booking_with_discount(uuid, uuid, text, text, text, numeric, text) TO service_role;
  END IF;
END $$;
