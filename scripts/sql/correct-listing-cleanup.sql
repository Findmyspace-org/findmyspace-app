-- FindMySpace production data cleanup (NOT a schema migration).
-- 1) Paarl Town Hall address
-- 2) Dal Josaphat display titles
-- 3) Archive PGH duplicate test property + Classroom #1
-- Atomic: any RAISE EXCEPTION rolls the whole DO block back.

DO $$
DECLARE
  v_cnt integer;
  v_payouts integer;
  v_boland_lat numeric;
  v_boland_lng numeric;
  v_admin uuid := 'ebf238f5-a25b-464b-b663-e6f8bc4e6867';
BEGIN
  SELECT COUNT(*) INTO v_payouts FROM organisation_payouts;

  SELECT latitude, longitude INTO v_boland_lat, v_boland_lng
  FROM properties
  WHERE id = '41dd232a-17c3-4f7b-ab47-745ebb2273f9'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'abort: Boland Park property missing';
  END IF;

  -- -------------------------------------------------------------------------
  -- Guards: Town Hall
  -- -------------------------------------------------------------------------
  PERFORM 1 FROM spaces
  WHERE id = '1bc1e17a-4251-4dec-a448-c54fc53455f3'
    AND title = 'Town Hall Paarl'
    AND address_line_1 = 'Faure Street'
    AND street_address = 'Faure Street'
    AND latitude = -33.737902
    AND longitude = 18.962274
    AND owner_id IS NULL
    AND archived_at IS NULL
    AND status = 'unclaimed'
    AND public_listing_mode = 'enquiry'
    AND platform_fee_percent = 15.00
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'abort: Town Hall Paarl is not in the expected state';
  END IF;

  -- -------------------------------------------------------------------------
  -- Guards: Dal Josaphat titles
  -- -------------------------------------------------------------------------
  PERFORM 1 FROM spaces
  WHERE id = '6d4d5a0f-87c3-49b2-afd9-2b2a60a55e59'
    AND title = 'Dal Josephat - Athletics'
    AND status = 'active'
    AND public_listing_mode = 'live'
    AND archived_at IS NULL
    AND platform_fee_percent = 15.00
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'abort: Dal Josephat Athletics is not in the expected state';
  END IF;

  PERFORM 1 FROM spaces
  WHERE id = '29e6a604-72e5-424b-8d9f-baf1017dc723'
    AND title = 'Dal Josephat - Netball'
    AND status = 'active'
    AND public_listing_mode = 'live'
    AND archived_at IS NULL
    AND platform_fee_percent = 15.00
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'abort: Dal Josephat Netball is not in the expected state';
  END IF;

  -- -------------------------------------------------------------------------
  -- Guards: PGH duplicate vs canonical
  -- -------------------------------------------------------------------------
  PERFORM 1 FROM properties
  WHERE id = '0e5f0732-c712-43a4-9c2d-88c2cd061803'
    AND name = 'Paarl Girls High'
    AND organisation_id IS NULL
    AND owner_id = 'bde2194c-072a-45ee-b42e-92ff85241b73'
    AND owner_email = 'connect.schalk+pgh@gmail.com'
    AND archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'abort: PGH duplicate property is not in the expected state';
  END IF;

  PERFORM 1 FROM spaces
  WHERE id = '63064a1c-b9ee-44f8-a4dd-1034d3089fc6'
    AND title = 'Classroom #1'
    AND property_id = '0e5f0732-c712-43a4-9c2d-88c2cd061803'
    AND owner_id = 'bde2194c-072a-45ee-b42e-92ff85241b73'
    AND status = 'owner_claimed'
    AND public_listing_mode = 'enquiry'
    AND archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'abort: PGH duplicate Classroom #1 is not in the expected state';
  END IF;

  SELECT COUNT(*) INTO v_cnt
  FROM spaces
  WHERE property_id = '0e5f0732-c712-43a4-9c2d-88c2cd061803';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'abort: PGH duplicate property has unexpected spaces (%)', v_cnt;
  END IF;

  SELECT COUNT(*) INTO v_cnt FROM bookings WHERE space_id = '63064a1c-b9ee-44f8-a4dd-1034d3089fc6';
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'abort: PGH duplicate has bookings (%)', v_cnt;
  END IF;

  SELECT COUNT(*) INTO v_cnt FROM listing_enquiries WHERE listing_id = '63064a1c-b9ee-44f8-a4dd-1034d3089fc6';
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'abort: PGH duplicate has enquiries (%)', v_cnt;
  END IF;

  SELECT COUNT(*) INTO v_cnt FROM user_favourites WHERE space_id = '63064a1c-b9ee-44f8-a4dd-1034d3089fc6';
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'abort: PGH duplicate has favourites (%)', v_cnt;
  END IF;

  PERFORM 1 FROM organisations
  WHERE id = '21cf12c3-3235-4cd3-8106-801d120dc7b5'
    AND name = 'Paarl Girls'' High'
    AND archived_at IS NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'abort: canonical PGH organisation missing or changed';
  END IF;

  PERFORM 1 FROM properties
  WHERE id = 'b13d1be1-0bc6-437d-8deb-d43b881fe5cb'
    AND organisation_id = '21cf12c3-3235-4cd3-8106-801d120dc7b5'
    AND archived_at IS NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'abort: canonical PGH campus missing or changed';
  END IF;

  PERFORM 1 FROM spaces
  WHERE id = 'cd1ebdff-0259-4185-8a0c-ac2892f03778'
    AND title = 'Classroom #1'
    AND property_id = 'b13d1be1-0bc6-437d-8deb-d43b881fe5cb'
    AND status = 'active'
    AND public_listing_mode = 'live'
    AND archived_at IS NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'abort: canonical Classroom #1 missing or changed';
  END IF;

  SELECT COUNT(*) INTO v_cnt
  FROM spaces
  WHERE property_id = 'b13d1be1-0bc6-437d-8deb-d43b881fe5cb'
    AND archived_at IS NULL
    AND status IN (
      'draft','owner_claimed','pending_verification','needs_changes',
      'approved','pending','active','paused'
    );
  IF v_cnt <> 8 THEN
    RAISE EXCEPTION 'abort: canonical PGH billable inventory is % not 8', v_cnt;
  END IF;

  -- Protected FMS V1 paid test space / booking must exist unchanged.
  PERFORM 1 FROM spaces
  WHERE id = '3a5a3d27-cb6a-4e90-b5d1-2f7356287cac'
    AND title = 'FMS V1 Test Space'
    AND status = 'active'
    AND public_listing_mode = 'live'
    AND archived_at IS NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'abort: FMS V1 paid test space is not in the expected state';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM bookings
    WHERE id = 'b5a97793-b8b1-436a-a7a0-40342a841f75'
      AND space_id = '3a5a3d27-cb6a-4e90-b5d1-2f7356287cac'
      AND total_price = 100.00
      AND platform_fee = 15.00
      AND owner_earnings = 85.00
      AND payout_status = 'unpaid_to_owner'
      AND status = 'paid_confirmed'
  ) THEN
    RAISE EXCEPTION 'abort: R100 booking is not in the expected state';
  END IF;

  SELECT COUNT(*) INTO v_cnt FROM commercial_terms;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'abort: commercial_terms is no longer empty';
  END IF;

  -- -------------------------------------------------------------------------
  -- 1. Town Hall address
  -- -------------------------------------------------------------------------
  UPDATE spaces
  SET address_line_1 = 'Main Street',
      street_address = 'Main Street'
  WHERE id = '1bc1e17a-4251-4dec-a448-c54fc53455f3'
    AND address_line_1 = 'Faure Street'
    AND street_address = 'Faure Street'
    AND latitude = -33.737902
    AND longitude = 18.962274;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'abort: Town Hall address update affected % rows', v_cnt;
  END IF;

  -- -------------------------------------------------------------------------
  -- 2. Dal Josaphat titles
  -- -------------------------------------------------------------------------
  UPDATE spaces
  SET title = 'Dal Josaphat - Athletics'
  WHERE id = '6d4d5a0f-87c3-49b2-afd9-2b2a60a55e59'
    AND title = 'Dal Josephat - Athletics';
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'abort: Athletics title update affected % rows', v_cnt;
  END IF;

  UPDATE spaces
  SET title = 'Dal Josaphat - Netball'
  WHERE id = '29e6a604-72e5-424b-8d9f-baf1017dc723'
    AND title = 'Dal Josephat - Netball';
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'abort: Netball title update affected % rows', v_cnt;
  END IF;

  -- -------------------------------------------------------------------------
  -- 4. Archive PGH duplicate using existing archive convention
  -- -------------------------------------------------------------------------
  UPDATE spaces
  SET status = 'deleted',
      public_listing_mode = 'off',
      is_bookable = false,
      archived_at = now(),
      archived_by = v_admin,
      archive_restore_status = 'owner_claimed',
      archive_restore_public_listing_mode = 'enquiry'
  WHERE id = '63064a1c-b9ee-44f8-a4dd-1034d3089fc6'
    AND property_id = '0e5f0732-c712-43a4-9c2d-88c2cd061803'
    AND owner_id = 'bde2194c-072a-45ee-b42e-92ff85241b73'
    AND status = 'owner_claimed'
    AND archived_at IS NULL;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'abort: PGH duplicate space archive affected % rows', v_cnt;
  END IF;

  UPDATE properties
  SET archived_at = now(),
      archived_by = v_admin
  WHERE id = '0e5f0732-c712-43a4-9c2d-88c2cd061803'
    AND organisation_id IS NULL
    AND archived_at IS NULL;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'abort: PGH duplicate property archive affected % rows', v_cnt;
  END IF;

  -- -------------------------------------------------------------------------
  -- Post-write assertions
  -- -------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM spaces
    WHERE id = '1bc1e17a-4251-4dec-a448-c54fc53455f3'
      AND address_line_1 = 'Main Street'
      AND street_address = 'Main Street'
      AND latitude = -33.737902
      AND longitude = 18.962274
      AND status = 'unclaimed'
      AND public_listing_mode = 'enquiry'
      AND platform_fee_percent = 15.00
      AND owner_id IS NULL
  ) THEN
    RAISE EXCEPTION 'abort: Town Hall post-write state incorrect';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM spaces
    WHERE id = '6d4d5a0f-87c3-49b2-afd9-2b2a60a55e59'
      AND title = 'Dal Josaphat - Athletics'
      AND status = 'active'
      AND public_listing_mode = 'live'
      AND platform_fee_percent = 15.00
  ) THEN
    RAISE EXCEPTION 'abort: Athletics post-write state incorrect';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM spaces
    WHERE id = '29e6a604-72e5-424b-8d9f-baf1017dc723'
      AND title = 'Dal Josaphat - Netball'
      AND status = 'active'
      AND public_listing_mode = 'live'
      AND platform_fee_percent = 15.00
  ) THEN
    RAISE EXCEPTION 'abort: Netball post-write state incorrect';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM spaces
    WHERE id = '63064a1c-b9ee-44f8-a4dd-1034d3089fc6'
      AND status = 'deleted'
      AND public_listing_mode = 'off'
      AND archived_at IS NOT NULL
      AND owner_id = 'bde2194c-072a-45ee-b42e-92ff85241b73'
      AND property_id = '0e5f0732-c712-43a4-9c2d-88c2cd061803'
  ) THEN
    RAISE EXCEPTION 'abort: PGH duplicate space was not archived correctly';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM properties
    WHERE id = '0e5f0732-c712-43a4-9c2d-88c2cd061803'
      AND archived_at IS NOT NULL
      AND organisation_id IS NULL
      AND owner_id = 'bde2194c-072a-45ee-b42e-92ff85241b73'
  ) THEN
    RAISE EXCEPTION 'abort: PGH duplicate property was not archived correctly';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM organisations
    WHERE id = '21cf12c3-3235-4cd3-8106-801d120dc7b5'
      AND name = 'Paarl Girls'' High'
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'abort: canonical PGH organisation was modified';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM properties
    WHERE id = 'b13d1be1-0bc6-437d-8deb-d43b881fe5cb'
      AND organisation_id = '21cf12c3-3235-4cd3-8106-801d120dc7b5'
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'abort: canonical PGH campus was modified';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM spaces
    WHERE id = 'cd1ebdff-0259-4185-8a0c-ac2892f03778'
      AND property_id = 'b13d1be1-0bc6-437d-8deb-d43b881fe5cb'
      AND status = 'active'
      AND public_listing_mode = 'live'
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'abort: canonical Classroom #1 was modified';
  END IF;

  SELECT COUNT(*) INTO v_cnt
  FROM spaces
  WHERE property_id = 'b13d1be1-0bc6-437d-8deb-d43b881fe5cb'
    AND archived_at IS NULL
    AND status IN (
      'draft','owner_claimed','pending_verification','needs_changes',
      'approved','pending','active','paused'
    );
  IF v_cnt <> 8 THEN
    RAISE EXCEPTION 'abort: canonical PGH billable inventory became %', v_cnt;
  END IF;

  -- Duplicate must no longer be billable.
  IF EXISTS (
    SELECT 1 FROM spaces
    WHERE id = '63064a1c-b9ee-44f8-a4dd-1034d3089fc6'
      AND archived_at IS NULL
      AND status IN (
        'draft','owner_claimed','pending_verification','needs_changes',
        'approved','pending','active','paused'
      )
  ) THEN
    RAISE EXCEPTION 'abort: archived PGH duplicate is still billable';
  END IF;

  -- Boland Park untouched.
  IF NOT EXISTS (
    SELECT 1 FROM properties
    WHERE id = '41dd232a-17c3-4f7b-ab47-745ebb2273f9'
      AND latitude = v_boland_lat
      AND longitude = v_boland_lng
      AND name = 'Boland Park'
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'abort: Boland Park was modified';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM spaces
    WHERE id = '3d7e816e-991d-4a71-a38c-63bd8c3fe6a0'
      AND latitude = -33.644930
      AND longitude = 19.445043
      AND property_id = '41dd232a-17c3-4f7b-ab47-745ebb2273f9'
  ) THEN
    RAISE EXCEPTION 'abort: Boland Park space coordinates were modified';
  END IF;

  -- FMS V1 paid test data untouched.
  IF NOT EXISTS (
    SELECT 1 FROM spaces
    WHERE id = '3a5a3d27-cb6a-4e90-b5d1-2f7356287cac'
      AND title = 'FMS V1 Test Space'
      AND status = 'active'
      AND public_listing_mode = 'live'
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'abort: FMS V1 test space was modified';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM bookings
    WHERE id = 'b5a97793-b8b1-436a-a7a0-40342a841f75'
      AND space_id = '3a5a3d27-cb6a-4e90-b5d1-2f7356287cac'
      AND total_price = 100.00
      AND platform_fee = 15.00
      AND owner_earnings = 85.00
      AND payout_status = 'unpaid_to_owner'
      AND status = 'paid_confirmed'
  ) THEN
    RAISE EXCEPTION 'abort: R100 booking values changed';
  END IF;

  SELECT COUNT(*) INTO v_cnt FROM commercial_terms;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'abort: commercial_terms rows were created';
  END IF;
  SELECT COUNT(*) INTO v_cnt FROM commercial_term_tiers;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'abort: commercial_term_tiers rows were created';
  END IF;
  SELECT COUNT(*) INTO v_cnt FROM commercial_subscription_periods;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'abort: commercial_subscription_periods rows were created';
  END IF;

  SELECT COUNT(*) INTO v_cnt FROM organisation_payouts;
  IF v_cnt <> v_payouts THEN
    RAISE EXCEPTION 'abort: organisation_payouts count changed from % to %', v_payouts, v_cnt;
  END IF;
END $$;
