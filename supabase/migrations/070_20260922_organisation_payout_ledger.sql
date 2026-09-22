-- Manual organisation payout ledger. Additive accounting for Global Admin
-- recording of EFTs already made outside FindMySpace.
-- Does not send money. Does not change PayFast, booking prices, or PGH data.
-- Paid payouts are immutable. Personal-host payouts are out of scope.

-- ---------------------------------------------------------------------------
-- Booking payout_status vocabulary (compatible with unpaid_to_owner default)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'bookings_payout_status_chk'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_payout_status_chk
      CHECK (payout_status IN ('unpaid_to_owner', 'paid'));
  END IF;
END $$;

COMMENT ON COLUMN public.bookings.payout_status IS
  'Organisation/owner payout marker. unpaid_to_owner until a completed organisation payout includes the booking; then paid. Independent of customer payment_status.';

-- Freeze booking money + payout markers after customer payment / payout.
CREATE OR REPLACE FUNCTION public.bookings_freeze_paid_money()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.payment_status = 'paid' THEN
    IF NEW.total_price IS DISTINCT FROM OLD.total_price
      OR NEW.platform_fee IS DISTINCT FROM OLD.platform_fee
      OR NEW.owner_earnings IS DISTINCT FROM OLD.owner_earnings
    THEN
      RAISE EXCEPTION 'booking_money_frozen'
        USING HINT = 'Paid booking money snapshots cannot be rewritten.';
    END IF;
  END IF;

  IF OLD.payout_status = 'paid' THEN
    IF NEW.payout_status IS DISTINCT FROM OLD.payout_status
      OR NEW.payout_paid_at IS DISTINCT FROM OLD.payout_paid_at
    THEN
      RAISE EXCEPTION 'booking_payout_frozen'
        USING HINT = 'A paid-out booking cannot be unmarked or reassigned.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_freeze_paid_money ON public.bookings;
CREATE TRIGGER bookings_freeze_paid_money
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.bookings_freeze_paid_money();

-- ---------------------------------------------------------------------------
-- organisation_payouts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organisation_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL
    REFERENCES public.organisations(id) ON DELETE RESTRICT,
  bank_account_id uuid NOT NULL
    REFERENCES public.organisation_bank_accounts(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'paid'
    CHECK (status = 'paid'),
  currency text NOT NULL DEFAULT 'ZAR'
    CHECK (currency = 'ZAR'),
  amount_gross numeric(12, 2) NOT NULL
    CHECK (amount_gross > 0),
  amount_platform_fee numeric(12, 2) NOT NULL
    CHECK (amount_platform_fee >= 0),
  amount_net numeric(12, 2) NOT NULL
    CHECK (amount_net >= 0),
  reference text NOT NULL,
  notes text,
  created_by uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_by uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  paid_at timestamptz NOT NULL,
  CONSTRAINT organisation_payouts_reference_nonempty_chk CHECK (
    length(btrim(reference)) BETWEEN 2 AND 80
  ),
  CONSTRAINT organisation_payouts_notes_len_chk CHECK (
    notes IS NULL OR length(notes) <= 500
  ),
  CONSTRAINT organisation_payouts_totals_chk CHECK (
    amount_gross = amount_platform_fee + amount_net
  )
);

CREATE INDEX IF NOT EXISTS organisation_payouts_org_paid_idx
  ON public.organisation_payouts (organisation_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS organisation_payouts_bank_idx
  ON public.organisation_payouts (bank_account_id);

COMMENT ON TABLE public.organisation_payouts IS
  'Immutable record of a manual organisation EFT already made outside FindMySpace. '
  'bank_account_id is the exact historical organisation_bank_accounts version used.';

ALTER TABLE public.organisation_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisation_payouts FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organisation_payouts FROM PUBLIC;
REVOKE ALL ON TABLE public.organisation_payouts FROM anon;
REVOKE ALL ON TABLE public.organisation_payouts FROM authenticated;
GRANT ALL ON TABLE public.organisation_payouts TO service_role;

DROP TRIGGER IF EXISTS organisation_payouts_server_only_insert
  ON public.organisation_payouts;
CREATE TRIGGER organisation_payouts_server_only_insert
  BEFORE INSERT ON public.organisation_payouts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_server_role_writes_only();

DROP TRIGGER IF EXISTS organisation_payouts_server_only_update
  ON public.organisation_payouts;
CREATE TRIGGER organisation_payouts_server_only_update
  BEFORE UPDATE ON public.organisation_payouts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_server_role_writes_only();

DROP TRIGGER IF EXISTS organisation_payouts_server_only_delete
  ON public.organisation_payouts;
CREATE TRIGGER organisation_payouts_server_only_delete
  BEFORE DELETE ON public.organisation_payouts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_server_role_writes_only();

CREATE OR REPLACE FUNCTION public.organisation_payouts_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'organisation_payout_immutable'
    USING HINT = 'Recorded organisation payouts cannot be updated or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS organisation_payouts_immutable_update
  ON public.organisation_payouts;
CREATE TRIGGER organisation_payouts_immutable_update
  BEFORE UPDATE ON public.organisation_payouts
  FOR EACH ROW
  EXECUTE FUNCTION public.organisation_payouts_immutable();

DROP TRIGGER IF EXISTS organisation_payouts_immutable_delete
  ON public.organisation_payouts;
CREATE TRIGGER organisation_payouts_immutable_delete
  BEFORE DELETE ON public.organisation_payouts
  FOR EACH ROW
  EXECUTE FUNCTION public.organisation_payouts_immutable();

-- ---------------------------------------------------------------------------
-- organisation_payout_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organisation_payout_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id uuid NOT NULL
    REFERENCES public.organisation_payouts(id) ON DELETE RESTRICT,
  booking_id uuid NOT NULL
    REFERENCES public.bookings(id) ON DELETE RESTRICT,
  organisation_id uuid NOT NULL
    REFERENCES public.organisations(id) ON DELETE RESTRICT,
  gross_amount numeric(12, 2) NOT NULL
    CHECK (gross_amount > 0),
  platform_fee numeric(12, 2) NOT NULL
    CHECK (platform_fee >= 0),
  net_amount numeric(12, 2) NOT NULL
    CHECK (net_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organisation_payout_items_totals_chk CHECK (
    gross_amount = platform_fee + net_amount
  ),
  CONSTRAINT organisation_payout_items_booking_uidx UNIQUE (booking_id)
);

CREATE INDEX IF NOT EXISTS organisation_payout_items_payout_idx
  ON public.organisation_payout_items (payout_id);

CREATE INDEX IF NOT EXISTS organisation_payout_items_org_idx
  ON public.organisation_payout_items (organisation_id);

COMMENT ON TABLE public.organisation_payout_items IS
  'Frozen booking money snapshot attached to an organisation payout. '
  'UNIQUE(booking_id) prevents double payment. Items are never deleted.';

ALTER TABLE public.organisation_payout_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisation_payout_items FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organisation_payout_items FROM PUBLIC;
REVOKE ALL ON TABLE public.organisation_payout_items FROM anon;
REVOKE ALL ON TABLE public.organisation_payout_items FROM authenticated;
GRANT ALL ON TABLE public.organisation_payout_items TO service_role;

DROP TRIGGER IF EXISTS organisation_payout_items_server_only_insert
  ON public.organisation_payout_items;
CREATE TRIGGER organisation_payout_items_server_only_insert
  BEFORE INSERT ON public.organisation_payout_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_server_role_writes_only();

DROP TRIGGER IF EXISTS organisation_payout_items_server_only_update
  ON public.organisation_payout_items;
CREATE TRIGGER organisation_payout_items_server_only_update
  BEFORE UPDATE ON public.organisation_payout_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_server_role_writes_only();

DROP TRIGGER IF EXISTS organisation_payout_items_server_only_delete
  ON public.organisation_payout_items;
CREATE TRIGGER organisation_payout_items_server_only_delete
  BEFORE DELETE ON public.organisation_payout_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_server_role_writes_only();

CREATE OR REPLACE FUNCTION public.organisation_payout_items_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'organisation_payout_item_immutable'
    USING HINT = 'Organisation payout items cannot be updated or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS organisation_payout_items_immutable_update
  ON public.organisation_payout_items;
CREATE TRIGGER organisation_payout_items_immutable_update
  BEFORE UPDATE ON public.organisation_payout_items
  FOR EACH ROW
  EXECUTE FUNCTION public.organisation_payout_items_immutable();

DROP TRIGGER IF EXISTS organisation_payout_items_immutable_delete
  ON public.organisation_payout_items;
CREATE TRIGGER organisation_payout_items_immutable_delete
  BEFORE DELETE ON public.organisation_payout_items
  FOR EACH ROW
  EXECUTE FUNCTION public.organisation_payout_items_immutable();

-- ---------------------------------------------------------------------------
-- Eligibility: customer funds received, organisation beneficiary, unpaid
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_organisation_booking_payout_eligible(
  p_booking_id uuid,
  p_organisation_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.id = p_booking_id
      AND p_organisation_id IS NOT NULL
      AND b.commercial_beneficiary_type = 'organisation'
      AND b.commercial_beneficiary_organisation_id = p_organisation_id
      AND b.status IN ('paid_confirmed', 'confirmed', 'completed')
      AND b.payment_status = 'paid'
      AND b.payout_status = 'unpaid_to_owner'
      AND b.payout_paid_at IS NULL
      AND b.total_price IS NOT NULL
      AND b.total_price > 0
      AND b.platform_fee IS NOT NULL
      AND b.platform_fee >= 0
      AND b.owner_earnings IS NOT NULL
      AND b.owner_earnings >= 0
      AND round(b.total_price, 2) = round(b.platform_fee, 2) + round(b.owner_earnings, 2)
      AND NOT EXISTS (
        SELECT 1
        FROM public.organisation_payout_items i
        WHERE i.booking_id = b.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.booking_charges c
        WHERE c.booking_id = b.id
          AND c.status = 'pending'
      )
      AND (
        EXISTS (
          SELECT 1
          FROM public.booking_charges c
          WHERE c.booking_id = b.id
            AND c.status = 'paid'
        )
        OR NOT EXISTS (
          SELECT 1
          FROM public.booking_charges c
          WHERE c.booking_id = b.id
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_organisation_booking_payout_eligible(uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_organisation_booking_payout_eligible(uuid, uuid)
  FROM anon;
REVOKE ALL ON FUNCTION public.is_organisation_booking_payout_eligible(uuid, uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_organisation_booking_payout_eligible(uuid, uuid)
  TO service_role;

COMMENT ON FUNCTION public.is_organisation_booking_payout_eligible(uuid, uuid) IS
  'True when FindMySpace has received customer funds for an organisation-beneficiary booking that has not been paid out. Does not use owner_id. Refunds are not modelled; pending charges exclude the booking.';

-- ---------------------------------------------------------------------------
-- Record payout (transactional, service-role, Global Admin actor)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_organisation_payout(
  p_organisation_id uuid,
  p_actor_id uuid,
  p_booking_ids uuid[],
  p_reference text,
  p_paid_at timestamptz,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_is_ga boolean;
  v_org public.organisations%ROWTYPE;
  v_profile public.organisation_commercial_profiles%ROWTYPE;
  v_bank public.organisation_bank_accounts%ROWTYPE;
  v_ids uuid[];
  v_booking public.bookings%ROWTYPE;
  v_gross numeric(12, 2) := 0;
  v_fee numeric(12, 2) := 0;
  v_net numeric(12, 2) := 0;
  v_item_gross numeric(12, 2);
  v_item_fee numeric(12, 2);
  v_item_net numeric(12, 2);
  v_ref text;
  v_notes text;
  v_paid_at timestamptz;
  v_payout public.organisation_payouts%ROWTYPE;
  v_found int := 0;
BEGIN
  IF p_organisation_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'organisation_payout_actor_required'
      USING HINT = 'Organisation and actor are required.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_actor_id
      AND p.role IN ('admin', 'super_admin')
      AND COALESCE(p.admin_access_disabled, false) = false
  ) INTO v_is_ga;

  IF NOT v_is_ga THEN
    RAISE EXCEPTION 'organisation_payout_forbidden'
      USING HINT = 'Only an active Global Admin may record organisation payouts.';
  END IF;

  v_ref := btrim(COALESCE(p_reference, ''));
  IF length(v_ref) < 2 OR length(v_ref) > 80 THEN
    RAISE EXCEPTION 'organisation_payout_reference_required'
      USING HINT = 'An EFT/payment reference between 2 and 80 characters is required.';
  END IF;

  v_notes := nullif(btrim(COALESCE(p_notes, '')), '');
  IF v_notes IS NOT NULL AND length(v_notes) > 500 THEN
    RAISE EXCEPTION 'organisation_payout_notes_invalid'
      USING HINT = 'Notes must be 500 characters or fewer.';
  END IF;

  v_paid_at := COALESCE(p_paid_at, now());
  IF v_paid_at > now() + interval '1 hour' THEN
    RAISE EXCEPTION 'organisation_payout_paid_at_invalid'
      USING HINT = 'Paid date cannot be in the future.';
  END IF;
  IF v_paid_at < now() - interval '30 days' THEN
    RAISE EXCEPTION 'organisation_payout_paid_at_invalid'
      USING HINT = 'Paid date cannot be more than 30 days in the past.';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT x
    FROM unnest(COALESCE(p_booking_ids, ARRAY[]::uuid[])) AS x
    WHERE x IS NOT NULL
    ORDER BY 1
  ) INTO v_ids;

  IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'organisation_payout_bookings_required'
      USING HINT = 'Select at least one eligible booking.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('organisation-payout:' || p_organisation_id::text)
  );

  SELECT * INTO v_org
  FROM public.organisations
  WHERE id = p_organisation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organisation_not_found'
      USING HINT = 'Organisation not found.';
  END IF;

  IF v_org.status IS DISTINCT FROM 'active' OR v_org.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'organisation_payout_archived'
      USING HINT = 'Archived organisations cannot receive payouts.';
  END IF;

  SELECT * INTO v_profile
  FROM public.organisation_commercial_profiles
  WHERE organisation_id = p_organisation_id
  FOR UPDATE;

  IF NOT FOUND OR v_profile.verification_status IS DISTINCT FROM 'verified' THEN
    RAISE EXCEPTION 'organisation_payout_unverified'
      USING HINT = 'The organisation must be verified before a payout can be recorded.';
  END IF;

  SELECT * INTO v_bank
  FROM public.organisation_bank_accounts
  WHERE organisation_id = p_organisation_id
    AND is_current = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organisation_payout_bank_missing'
      USING HINT = 'A verified current bank account is required.';
  END IF;

  IF v_bank.status IS DISTINCT FROM 'verified' THEN
    RAISE EXCEPTION 'organisation_payout_bank_not_verified'
      USING HINT = 'The current bank account must be verified before a payout can be recorded.';
  END IF;

  FOR v_booking IN
    SELECT *
    FROM public.bookings
    WHERE id = ANY (v_ids)
    ORDER BY id
    FOR UPDATE
  LOOP
    v_found := v_found + 1;
    IF NOT public.is_organisation_booking_payout_eligible(v_booking.id, p_organisation_id) THEN
      RAISE EXCEPTION 'organisation_payout_booking_ineligible'
        USING HINT = 'One or more bookings are not eligible for this organisation payout.';
    END IF;

    v_item_gross := round(v_booking.total_price, 2);
    v_item_fee := round(v_booking.platform_fee, 2);
    v_item_net := round(v_booking.owner_earnings, 2);
    v_gross := v_gross + v_item_gross;
    v_fee := v_fee + v_item_fee;
    v_net := v_net + v_item_net;
  END LOOP;

  IF v_found IS DISTINCT FROM COALESCE(array_length(v_ids, 1), 0) THEN
    RAISE EXCEPTION 'organisation_payout_booking_ineligible'
      USING HINT = 'One or more bookings are not eligible for this organisation payout.';
  END IF;

  IF v_gross <= 0 OR v_gross IS DISTINCT FROM (v_fee + v_net) THEN
    RAISE EXCEPTION 'organisation_payout_totals_invalid'
      USING HINT = 'Payout totals must equal the sum of frozen booking amounts.';
  END IF;

  INSERT INTO public.organisation_payouts (
    organisation_id,
    bank_account_id,
    status,
    currency,
    amount_gross,
    amount_platform_fee,
    amount_net,
    reference,
    notes,
    created_by,
    paid_by,
    paid_at
  ) VALUES (
    p_organisation_id,
    v_bank.id,
    'paid',
    'ZAR',
    v_gross,
    v_fee,
    v_net,
    v_ref,
    v_notes,
    p_actor_id,
    p_actor_id,
    v_paid_at
  )
  RETURNING * INTO v_payout;

  INSERT INTO public.organisation_payout_items (
    payout_id,
    booking_id,
    organisation_id,
    gross_amount,
    platform_fee,
    net_amount
  )
  SELECT
    v_payout.id,
    b.id,
    p_organisation_id,
    round(b.total_price, 2),
    round(b.platform_fee, 2),
    round(b.owner_earnings, 2)
  FROM public.bookings b
  WHERE b.id = ANY (v_ids)
  ORDER BY b.id;

  UPDATE public.bookings
  SET
    payout_status = 'paid',
    payout_paid_at = v_paid_at
  WHERE id = ANY (v_ids)
    AND payout_status = 'unpaid_to_owner'
    AND payout_paid_at IS NULL;

  IF NOT FOUND OR (
    SELECT count(*) FROM public.bookings WHERE id = ANY (v_ids) AND payout_status = 'paid'
  ) IS DISTINCT FROM COALESCE(array_length(v_ids, 1), 0) THEN
    RAISE EXCEPTION 'organisation_payout_booking_conflict'
      USING HINT = 'Could not mark bookings as paid out. Retry with a fresh eligible list.';
  END IF;

  RETURN jsonb_build_object(
    'id', v_payout.id,
    'organisation_id', v_payout.organisation_id,
    'bank_account_id', v_payout.bank_account_id,
    'bank_version_number', v_bank.version_number,
    'account_number_last4', v_bank.account_number_last4,
    'bank_name', v_bank.bank_name,
    'account_holder_name', v_bank.account_holder_name,
    'status', v_payout.status,
    'currency', v_payout.currency,
    'amount_gross', v_payout.amount_gross,
    'amount_platform_fee', v_payout.amount_platform_fee,
    'amount_net', v_payout.amount_net,
    'reference', v_payout.reference,
    'notes', v_payout.notes,
    'paid_at', v_payout.paid_at,
    'paid_by', v_payout.paid_by,
    'booking_ids', to_jsonb(v_ids),
    'booking_count', COALESCE(array_length(v_ids, 1), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_organisation_payout(
  uuid, uuid, uuid[], text, timestamptz, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_organisation_payout(
  uuid, uuid, uuid[], text, timestamptz, text
) FROM anon;
REVOKE ALL ON FUNCTION public.record_organisation_payout(
  uuid, uuid, uuid[], text, timestamptz, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_organisation_payout(
  uuid, uuid, uuid[], text, timestamptz, text
) TO service_role;

COMMENT ON FUNCTION public.record_organisation_payout(
  uuid, uuid, uuid[], text, timestamptz, text
) IS
  'Atomically records a manual organisation payout from frozen booking amounts and the current verified bank version. Service-role only. Does not transfer funds. Never returns full account numbers.';
