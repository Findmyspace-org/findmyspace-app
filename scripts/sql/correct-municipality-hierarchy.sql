-- FindMySpace production data correction (NOT a schema migration).
-- Organisation → Property → Space for four municipalities.
-- Atomic: any RAISE EXCEPTION rolls the whole DO block back.
-- Does not create access grants, bank details, payouts, or commercial terms.

DO $$
DECLARE
  v_cnt integer;

  v_org_drakenstein uuid;
  v_org_breede uuid;
  v_org_stellenbosch uuid;
  v_org_langeberg uuid;

  v_prop_dal uuid;
  v_prop_faure uuid;
  v_prop_town_hall uuid;
  v_prop_robertson uuid;
  v_prop_cogmanskloof uuid;

  v_space_title text;
  v_space_owner uuid;
  v_space_status text;
  v_space_mode text;
  v_space_fee numeric;
BEGIN
  -- -------------------------------------------------------------------------
  -- 1. Revalidate current state. Abort the entire operation on mismatch.
  -- -------------------------------------------------------------------------
  PERFORM 1
  FROM properties
  WHERE id = 'de1774fe-6e41-45a8-8e39-a8f941508824'
    AND name = 'Drakenstein Municipality'
    AND organisation_id IS NULL
    AND owner_id IS NULL
    AND archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'abort: Drakenstein catch-all property is not in the expected state';
  END IF;

  PERFORM 1
  FROM properties
  WHERE id = '41dd232a-17c3-4f7b-ab47-745ebb2273f9'
    AND name = 'Breede Valley Municipality'
    AND organisation_id IS NULL
    AND owner_id IS NULL
    AND archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'abort: Breede Valley property is not in the expected state';
  END IF;

  PERFORM 1
  FROM properties
  WHERE id = '8c1e3645-fff7-482d-a252-661fe9b1d58d'
    AND name = 'Stellenbosch Municipality'
    AND organisation_id IS NULL
    AND owner_id IS NULL
    AND archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'abort: Stellenbosch property is not in the expected state';
  END IF;

  PERFORM 1
  FROM properties
  WHERE id = '14a00167-584b-42af-a190-9ab6dd23d43f'
    AND name = 'Langeberg Muncipality'
    AND organisation_id IS NULL
    AND owner_id IS NULL
    AND archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'abort: Langeberg catch-all property is not in the expected state';
  END IF;

  -- Paarl Girls High duplicate must remain untouched.
  PERFORM 1
  FROM properties
  WHERE id = '0e5f0732-c712-43a4-9c2d-88c2cd061803'
    AND organisation_id IS NULL
    AND owner_id = 'bde2194c-072a-45ee-b42e-92ff85241b73'
    AND archived_at IS NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'abort: Paarl Girls High duplicate property changed; refusing municipality writes';
  END IF;

  PERFORM 1
  FROM spaces
  WHERE id = '63064a1c-b9ee-44f8-a4dd-1034d3089fc6'
    AND property_id = '0e5f0732-c712-43a4-9c2d-88c2cd061803'
    AND owner_id = 'bde2194c-072a-45ee-b42e-92ff85241b73'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'abort: Paarl Girls High duplicate Classroom #1 changed; refusing municipality writes';
  END IF;

  SELECT COUNT(*) INTO v_cnt
  FROM spaces
  WHERE property_id = 'de1774fe-6e41-45a8-8e39-a8f941508824'
    AND id IN (
      '6d4d5a0f-87c3-49b2-afd9-2b2a60a55e59',
      '29e6a604-72e5-424b-8d9f-baf1017dc723',
      '28d66f0f-f4b8-4da1-9c99-8cebeb97c705',
      '1bc1e17a-4251-4dec-a448-c54fc53455f3'
    );
  IF v_cnt <> 4 THEN
    RAISE EXCEPTION 'abort: Drakenstein expected space IDs missing or changed';
  END IF;

  SELECT COUNT(*) INTO v_cnt
  FROM spaces
  WHERE property_id = 'de1774fe-6e41-45a8-8e39-a8f941508824';
  IF v_cnt <> 4 THEN
    RAISE EXCEPTION 'abort: Drakenstein catch-all has unexpected extra/missing spaces (%)', v_cnt;
  END IF;

  SELECT COUNT(*) INTO v_cnt
  FROM spaces
  WHERE property_id = '41dd232a-17c3-4f7b-ab47-745ebb2273f9'
    AND id = '3d7e816e-991d-4a71-a38c-63bd8c3fe6a0';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'abort: Breede Valley Boland Park space ID changed';
  END IF;

  SELECT COUNT(*) INTO v_cnt
  FROM spaces
  WHERE property_id = '41dd232a-17c3-4f7b-ab47-745ebb2273f9';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'abort: Breede Valley property has unexpected spaces (%)', v_cnt;
  END IF;

  SELECT COUNT(*) INTO v_cnt
  FROM spaces
  WHERE property_id = '8c1e3645-fff7-482d-a252-661fe9b1d58d'
    AND id = '1f95a328-f33b-417c-b1db-92d6c4ac2d6a';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'abort: Stellenbosch Town Hall space ID changed';
  END IF;

  SELECT COUNT(*) INTO v_cnt
  FROM spaces
  WHERE property_id = '8c1e3645-fff7-482d-a252-661fe9b1d58d';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'abort: Stellenbosch property has unexpected spaces (%)', v_cnt;
  END IF;

  SELECT COUNT(*) INTO v_cnt
  FROM spaces
  WHERE property_id = '14a00167-584b-42af-a190-9ab6dd23d43f'
    AND id IN (
      '5ee15d41-74bd-4c15-ac7c-a76cddd73f08',
      'e871ba98-cd0b-4f3a-816c-6568216c413a'
    );
  IF v_cnt <> 2 THEN
    RAISE EXCEPTION 'abort: Langeberg expected space IDs missing or changed';
  END IF;

  SELECT COUNT(*) INTO v_cnt
  FROM spaces
  WHERE property_id = '14a00167-584b-42af-a190-9ab6dd23d43f';
  IF v_cnt <> 2 THEN
    RAISE EXCEPTION 'abort: Langeberg catch-all has unexpected spaces (%)', v_cnt;
  END IF;

  SELECT COUNT(*) INTO v_cnt
  FROM bookings
  WHERE space_id IN (
    '6d4d5a0f-87c3-49b2-afd9-2b2a60a55e59',
    '29e6a604-72e5-424b-8d9f-baf1017dc723',
    '28d66f0f-f4b8-4da1-9c99-8cebeb97c705',
    '1bc1e17a-4251-4dec-a448-c54fc53455f3',
    '3d7e816e-991d-4a71-a38c-63bd8c3fe6a0',
    '1f95a328-f33b-417c-b1db-92d6c4ac2d6a',
    'e871ba98-cd0b-4f3a-816c-6568216c413a',
    '5ee15d41-74bd-4c15-ac7c-a76cddd73f08'
  );
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'abort: unexpected bookings appeared on municipality spaces (%)', v_cnt;
  END IF;

  SELECT COUNT(*) INTO v_cnt
  FROM organisation_access
  WHERE property_id IN (
      'de1774fe-6e41-45a8-8e39-a8f941508824',
      '41dd232a-17c3-4f7b-ab47-745ebb2273f9',
      '8c1e3645-fff7-482d-a252-661fe9b1d58d',
      '14a00167-584b-42af-a190-9ab6dd23d43f'
    )
    OR space_id IN (
      '6d4d5a0f-87c3-49b2-afd9-2b2a60a55e59',
      '29e6a604-72e5-424b-8d9f-baf1017dc723',
      '28d66f0f-f4b8-4da1-9c99-8cebeb97c705',
      '1bc1e17a-4251-4dec-a448-c54fc53455f3',
      '3d7e816e-991d-4a71-a38c-63bd8c3fe6a0',
      '1f95a328-f33b-417c-b1db-92d6c4ac2d6a',
      'e871ba98-cd0b-4f3a-816c-6568216c413a',
      '5ee15d41-74bd-4c15-ac7c-a76cddd73f08'
    );
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'abort: unexpected access grants on municipality inventory (%)', v_cnt;
  END IF;

  SELECT COUNT(*) INTO v_cnt FROM commercial_terms;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'abort: commercial_terms is no longer empty (%)', v_cnt;
  END IF;
  SELECT COUNT(*) INTO v_cnt FROM commercial_term_tiers;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'abort: commercial_term_tiers is no longer empty (%)', v_cnt;
  END IF;
  SELECT COUNT(*) INTO v_cnt FROM commercial_subscription_periods;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'abort: commercial_subscription_periods is no longer empty (%)', v_cnt;
  END IF;

  SELECT COUNT(*) INTO v_cnt
  FROM organisations
  WHERE name IN (
    'Drakenstein Municipality',
    'Breede Valley Municipality',
    'Stellenbosch Municipality',
    'Langeberg Municipality'
  );
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'abort: municipality product organisations already exist (%)', v_cnt;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM crm_organisations
    WHERE id = 'a1000001-0001-4001-8001-000000000001'
      AND name = 'Drakenstein Municipality'
      AND type = 'municipality'
  ) THEN
    RAISE EXCEPTION 'abort: Drakenstein CRM organisation mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM crm_organisations
    WHERE id = 'd88e8c3c-e9ba-48cc-8137-73bb24451104'
      AND name = 'Breede Valley Municipality'
      AND type = 'municipality'
  ) THEN
    RAISE EXCEPTION 'abort: Breede Valley CRM organisation mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM crm_organisations
    WHERE id = 'b65bb192-0daa-4356-9201-b8da4d1fd5a8'
      AND name = 'Stellenbosch Municipality'
      AND type = 'municipality'
  ) THEN
    RAISE EXCEPTION 'abort: Stellenbosch Municipality CRM organisation mismatch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM crm_organisations
    WHERE id = '29c18c65-ef84-4832-be26-1dbf3a52af08'
      AND name = 'University of Stellenbosch'
  ) AND EXISTS (
    SELECT 1 FROM crm_organisations
    WHERE id = 'b65bb192-0daa-4356-9201-b8da4d1fd5a8'
      AND name = 'Stellenbosch Municipality'
  ) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'abort: cannot distinguish Stellenbosch Municipality from University CRM row';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM crm_organisations
    WHERE id = '00ca5f55-abe0-426d-842c-acf3fc82da99'
      AND name = 'Langeberg Municipality'
      AND type = 'municipality'
  ) THEN
    RAISE EXCEPTION 'abort: Langeberg CRM organisation mismatch';
  END IF;

  -- Snapshot immutable space fields.
  SELECT title, owner_id, status, public_listing_mode, platform_fee_percent
    INTO v_space_title, v_space_owner, v_space_status, v_space_mode, v_space_fee
  FROM spaces WHERE id = '6d4d5a0f-87c3-49b2-afd9-2b2a60a55e59';
  IF v_space_title IS DISTINCT FROM 'Dal Josephat - Athletics'
     OR v_space_owner IS NOT NULL
     OR v_space_status IS DISTINCT FROM 'active'
     OR v_space_fee IS DISTINCT FROM 15.00 THEN
    RAISE EXCEPTION 'abort: Dal Josephat Athletics ownership/title/fee changed';
  END IF;

  SELECT title, owner_id, status, platform_fee_percent
    INTO v_space_title, v_space_owner, v_space_status, v_space_fee
  FROM spaces WHERE id = '29e6a604-72e5-424b-8d9f-baf1017dc723';
  IF v_space_title IS DISTINCT FROM 'Dal Josephat - Netball'
     OR v_space_owner IS NOT NULL
     OR v_space_status IS DISTINCT FROM 'active'
     OR v_space_fee IS DISTINCT FROM 15.00 THEN
    RAISE EXCEPTION 'abort: Dal Josephat Netball ownership/title/fee changed';
  END IF;

  -- -------------------------------------------------------------------------
  -- 2. Create organisations with NEW UUIDs. Never reuse property UUIDs.
  -- -------------------------------------------------------------------------
  INSERT INTO organisations (name, slug, status, crm_organisation_id)
  VALUES (
    'Drakenstein Municipality',
    'drakenstein-municipality',
    'active',
    'a1000001-0001-4001-8001-000000000001'
  )
  RETURNING id INTO v_org_drakenstein;

  INSERT INTO organisations (name, slug, status, crm_organisation_id)
  VALUES (
    'Breede Valley Municipality',
    'breede-valley-municipality',
    'active',
    'd88e8c3c-e9ba-48cc-8137-73bb24451104'
  )
  RETURNING id INTO v_org_breede;

  INSERT INTO organisations (name, slug, status, crm_organisation_id)
  VALUES (
    'Stellenbosch Municipality',
    'stellenbosch-municipality',
    'active',
    'b65bb192-0daa-4356-9201-b8da4d1fd5a8'
  )
  RETURNING id INTO v_org_stellenbosch;

  INSERT INTO organisations (name, slug, status, crm_organisation_id)
  VALUES (
    'Langeberg Municipality',
    'langeberg-municipality',
    'active',
    '00ca5f55-abe0-426d-842c-acf3fc82da99'
  )
  RETURNING id INTO v_org_langeberg;

  IF v_org_drakenstein IN (
       'de1774fe-6e41-45a8-8e39-a8f941508824',
       '41dd232a-17c3-4f7b-ab47-745ebb2273f9',
       '8c1e3645-fff7-482d-a252-661fe9b1d58d',
       '14a00167-584b-42af-a190-9ab6dd23d43f'
     )
     OR v_org_breede IN (
       'de1774fe-6e41-45a8-8e39-a8f941508824',
       '41dd232a-17c3-4f7b-ab47-745ebb2273f9',
       '8c1e3645-fff7-482d-a252-661fe9b1d58d',
       '14a00167-584b-42af-a190-9ab6dd23d43f'
     )
     OR v_org_stellenbosch IN (
       'de1774fe-6e41-45a8-8e39-a8f941508824',
       '41dd232a-17c3-4f7b-ab47-745ebb2273f9',
       '8c1e3645-fff7-482d-a252-661fe9b1d58d',
       '14a00167-584b-42af-a190-9ab6dd23d43f'
     )
     OR v_org_langeberg IN (
       'de1774fe-6e41-45a8-8e39-a8f941508824',
       '41dd232a-17c3-4f7b-ab47-745ebb2273f9',
       '8c1e3645-fff7-482d-a252-661fe9b1d58d',
       '14a00167-584b-42af-a190-9ab6dd23d43f'
     ) THEN
    RAISE EXCEPTION 'abort: organisation UUID collided with a property UUID';
  END IF;

  -- -------------------------------------------------------------------------
  -- 3. Drakenstein physical sites
  -- -------------------------------------------------------------------------
  INSERT INTO properties (
    name, address_line1, suburb, city, province, postal_code, country,
    latitude, longitude, organisation_id, crm_organisation_id, created_by_admin
  )
  VALUES (
    'Dal Josaphat Stadium',
    'Jan van Riebeeck Drive',
    'New Orleans',
    'Paarl',
    'Western Cape',
    '7620',
    'South Africa',
    -33.705979,
    18.986876,
    v_org_drakenstein,
    'a1000001-0001-4001-8001-000000000001',
    true
  )
  RETURNING id INTO v_prop_dal;

  INSERT INTO properties (
    name, address_line1, suburb, city, province, postal_code, country,
    latitude, longitude, organisation_id, crm_organisation_id, created_by_admin
  )
  VALUES (
    'Faure Street Stadium',
    'Faure Street',
    'Drakenstein Ward 4',
    'Paarl',
    'Western Cape',
    '7646',
    'South Africa',
    -33.736974,
    18.966393,
    v_org_drakenstein,
    'a1000001-0001-4001-8001-000000000001',
    true
  )
  RETURNING id INTO v_prop_faure;

  INSERT INTO properties (
    name, address_line1, suburb, city, province, postal_code, country,
    latitude, longitude, organisation_id, crm_organisation_id, created_by_admin
  )
  VALUES (
    'Paarl Town Hall',
    'Main Street',
    'Paarl',
    'Paarl',
    'Western Cape',
    '7646',
    'South Africa',
    -33.737902,
    18.962274,
    v_org_drakenstein,
    'a1000001-0001-4001-8001-000000000001',
    true
  )
  RETURNING id INTO v_prop_town_hall;

  UPDATE spaces
  SET property_id = v_prop_dal
  WHERE id IN (
    '6d4d5a0f-87c3-49b2-afd9-2b2a60a55e59',
    '29e6a604-72e5-424b-8d9f-baf1017dc723'
  )
    AND property_id = 'de1774fe-6e41-45a8-8e39-a8f941508824';
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt <> 2 THEN
    RAISE EXCEPTION 'abort: failed to re-parent Dal Josaphat spaces (updated %)', v_cnt;
  END IF;

  UPDATE spaces
  SET property_id = v_prop_faure
  WHERE id = '28d66f0f-f4b8-4da1-9c99-8cebeb97c705'
    AND property_id = 'de1774fe-6e41-45a8-8e39-a8f941508824';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'abort: failed to re-parent Faure Street Stadium';
  END IF;

  UPDATE spaces
  SET property_id = v_prop_town_hall
  WHERE id = '1bc1e17a-4251-4dec-a448-c54fc53455f3'
    AND property_id = 'de1774fe-6e41-45a8-8e39-a8f941508824';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'abort: failed to re-parent Paarl Town Hall';
  END IF;

  SELECT COUNT(*) INTO v_cnt
  FROM spaces
  WHERE property_id = 'de1774fe-6e41-45a8-8e39-a8f941508824';
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'abort: Drakenstein catch-all still has spaces (%)', v_cnt;
  END IF;

  UPDATE properties
  SET
    archived_at = now(),
    name = 'Drakenstein Municipality (archived catch-all)'
  WHERE id = 'de1774fe-6e41-45a8-8e39-a8f941508824'
    AND archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'abort: failed to archive Drakenstein catch-all';
  END IF;

  -- -------------------------------------------------------------------------
  -- 4. Breede Valley: reuse existing property as Boland Park
  -- -------------------------------------------------------------------------
  UPDATE properties
  SET
    name = 'Boland Park',
    organisation_id = v_org_breede,
    crm_organisation_id = 'd88e8c3c-e9ba-48cc-8137-73bb24451104'
  WHERE id = '41dd232a-17c3-4f7b-ab47-745ebb2273f9'
    AND organisation_id IS NULL
    AND archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'abort: failed to attach Breede Valley Boland Park property';
  END IF;

  -- -------------------------------------------------------------------------
  -- 5. Stellenbosch: reuse existing property as Stellenbosch Town Hall
  -- -------------------------------------------------------------------------
  UPDATE properties
  SET
    name = 'Stellenbosch Town Hall',
    organisation_id = v_org_stellenbosch,
    crm_organisation_id = 'b65bb192-0daa-4356-9201-b8da4d1fd5a8'
  WHERE id = '8c1e3645-fff7-482d-a252-661fe9b1d58d'
    AND organisation_id IS NULL
    AND archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'abort: failed to attach Stellenbosch Town Hall property';
  END IF;

  -- -------------------------------------------------------------------------
  -- 6. Langeberg: Robertson Civic + Montagu Mountain Reserve (Cogmanskloof)
  -- -------------------------------------------------------------------------
  INSERT INTO properties (
    name, address_line1, suburb, city, province, postal_code, country,
    latitude, longitude, organisation_id, crm_organisation_id, created_by_admin
  )
  VALUES (
    'Robertson Civic',
    '14 Hospitaal Street',
    'Langeberg Ward 3',
    'Langeberg Local Municipality',
    'Western Cape',
    '6705',
    'South Africa',
    -33.790285,
    19.888015,
    v_org_langeberg,
    '00ca5f55-abe0-426d-842c-acf3fc82da99',
    true
  )
  RETURNING id INTO v_prop_robertson;

  INSERT INTO properties (
    name, address_line1, suburb, city, province, postal_code, country,
    latitude, longitude, organisation_id, crm_organisation_id, created_by_admin
  )
  VALUES (
    'Montagu Mountain Reserve',
    'Lover''s walk',
    'Badshoogte',
    'Langeberg Local Municipality',
    'Western Cape',
    '6720',
    'South Africa',
    -33.781119,
    20.114326,
    v_org_langeberg,
    '00ca5f55-abe0-426d-842c-acf3fc82da99',
    true
  )
  RETURNING id INTO v_prop_cogmanskloof;

  UPDATE spaces
  SET property_id = v_prop_robertson
  WHERE id = '5ee15d41-74bd-4c15-ac7c-a76cddd73f08'
    AND property_id = '14a00167-584b-42af-a190-9ab6dd23d43f';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'abort: failed to re-parent Robertson Civic';
  END IF;

  UPDATE spaces
  SET property_id = v_prop_cogmanskloof
  WHERE id = 'e871ba98-cd0b-4f3a-816c-6568216c413a'
    AND property_id = '14a00167-584b-42af-a190-9ab6dd23d43f';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'abort: failed to re-parent Cogmanskloof hiking trail';
  END IF;

  SELECT COUNT(*) INTO v_cnt
  FROM spaces
  WHERE property_id = '14a00167-584b-42af-a190-9ab6dd23d43f';
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'abort: Langeberg catch-all still has spaces (%)', v_cnt;
  END IF;

  UPDATE properties
  SET
    archived_at = now(),
    name = 'Langeberg Muncipality (archived catch-all)'
  WHERE id = '14a00167-584b-42af-a190-9ab6dd23d43f'
    AND archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'abort: failed to archive Langeberg catch-all';
  END IF;

  -- -------------------------------------------------------------------------
  -- 7. Forbidden side effects
  -- -------------------------------------------------------------------------
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
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'abort: organisation_payouts rows were created';
  END IF;
  SELECT COUNT(*) INTO v_cnt
  FROM organisation_access
  WHERE organisation_id IN (
    v_org_drakenstein, v_org_breede, v_org_stellenbosch, v_org_langeberg
  );
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'abort: organisation_access rows were created';
  END IF;

  -- Space IDs, owners, titles, listing mode, fee preserved.
  IF EXISTS (
    SELECT 1 FROM spaces
    WHERE id IN (
      '6d4d5a0f-87c3-49b2-afd9-2b2a60a55e59',
      '29e6a604-72e5-424b-8d9f-baf1017dc723',
      '28d66f0f-f4b8-4da1-9c99-8cebeb97c705',
      '1bc1e17a-4251-4dec-a448-c54fc53455f3',
      '3d7e816e-991d-4a71-a38c-63bd8c3fe6a0',
      '1f95a328-f33b-417c-b1db-92d6c4ac2d6a',
      'e871ba98-cd0b-4f3a-816c-6568216c413a',
      '5ee15d41-74bd-4c15-ac7c-a76cddd73f08'
    )
      AND (
        owner_id IS NOT NULL
        OR platform_fee_percent IS DISTINCT FROM 15.00
      )
  ) THEN
    RAISE EXCEPTION 'abort: space owner or platform_fee_percent changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM spaces
    WHERE id = '6d4d5a0f-87c3-49b2-afd9-2b2a60a55e59'
      AND (title IS DISTINCT FROM 'Dal Josephat - Athletics' OR property_id IS DISTINCT FROM v_prop_dal)
  ) THEN
    RAISE EXCEPTION 'abort: Athletics space title or parent incorrect';
  END IF;

  IF EXISTS (
    SELECT 1 FROM spaces
    WHERE id = '29e6a604-72e5-424b-8d9f-baf1017dc723'
      AND (title IS DISTINCT FROM 'Dal Josephat - Netball' OR property_id IS DISTINCT FROM v_prop_dal)
  ) THEN
    RAISE EXCEPTION 'abort: Netball space title or parent incorrect';
  END IF;

  IF EXISTS (
    SELECT 1 FROM spaces
    WHERE id = '28d66f0f-f4b8-4da1-9c99-8cebeb97c705'
      AND property_id IS DISTINCT FROM v_prop_faure
  ) THEN
    RAISE EXCEPTION 'abort: Faure Street Stadium parent incorrect';
  END IF;

  IF EXISTS (
    SELECT 1 FROM spaces
    WHERE id = '1bc1e17a-4251-4dec-a448-c54fc53455f3'
      AND property_id IS DISTINCT FROM v_prop_town_hall
  ) THEN
    RAISE EXCEPTION 'abort: Town Hall Paarl parent incorrect';
  END IF;

  IF EXISTS (
    SELECT 1 FROM spaces
    WHERE id = '3d7e816e-991d-4a71-a38c-63bd8c3fe6a0'
      AND property_id IS DISTINCT FROM '41dd232a-17c3-4f7b-ab47-745ebb2273f9'
  ) THEN
    RAISE EXCEPTION 'abort: Boland Park space relationship changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM spaces
    WHERE id = '1f95a328-f33b-417c-b1db-92d6c4ac2d6a'
      AND property_id IS DISTINCT FROM '8c1e3645-fff7-482d-a252-661fe9b1d58d'
  ) THEN
    RAISE EXCEPTION 'abort: Stellenbosch Town Hall space relationship changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM spaces
    WHERE id = '5ee15d41-74bd-4c15-ac7c-a76cddd73f08'
      AND property_id IS DISTINCT FROM v_prop_robertson
  ) THEN
    RAISE EXCEPTION 'abort: Robertson Civic parent incorrect';
  END IF;

  IF EXISTS (
    SELECT 1 FROM spaces
    WHERE id = 'e871ba98-cd0b-4f3a-816c-6568216c413a'
      AND property_id IS DISTINCT FROM v_prop_cogmanskloof
  ) THEN
    RAISE EXCEPTION 'abort: Cogmanskloof parent incorrect';
  END IF;

  -- Stellenbosch must not be linked to the university CRM row.
  IF EXISTS (
    SELECT 1 FROM organisations
    WHERE id = v_org_stellenbosch
      AND crm_organisation_id IS DISTINCT FROM 'b65bb192-0daa-4356-9201-b8da4d1fd5a8'
  ) THEN
    RAISE EXCEPTION 'abort: Stellenbosch organisation linked to the wrong CRM row';
  END IF;

  -- Historical booking money unchanged.
  IF NOT EXISTS (
    SELECT 1 FROM bookings
    WHERE id = 'b5a97793-b8b1-436a-a7a0-40342a841f75'
      AND total_price = 100.00
      AND platform_fee = 15.00
      AND owner_earnings = 85.00
      AND payout_status = 'unpaid_to_owner'
  ) THEN
    RAISE EXCEPTION 'abort: historical R100 booking values changed';
  END IF;

  -- PGH duplicate still exactly as before.
  IF NOT EXISTS (
    SELECT 1 FROM spaces
    WHERE id = '63064a1c-b9ee-44f8-a4dd-1034d3089fc6'
      AND property_id = '0e5f0732-c712-43a4-9c2d-88c2cd061803'
  ) THEN
    RAISE EXCEPTION 'abort: Paarl Girls High duplicate was modified';
  END IF;
END $$;
