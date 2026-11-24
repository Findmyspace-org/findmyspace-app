-- Paarl Girls' High school administration.
-- Ensures the existing login mvandermerwe@paarlgirlshigh.com has one active
-- Organisation Admin grant on the existing organisation. Does not create an
-- account, organisation, property, or space. Does not change ownership,
-- profile role, booking terms, or any other organisation.

DO $$
DECLARE
  v_email constant text := 'mvandermerwe@paarlgirlshigh.com';
  v_org constant uuid := '21cf12c3-3235-4cd3-8106-801d120dc7b5';
  v_property constant uuid := 'b13d1be1-0bc6-437d-8deb-d43b881fe5cb';
  v_space_ids constant uuid[] := ARRAY[
    '9f9f8700-0fa2-4086-87d7-7a58e1b2ff18',
    'cd1ebdff-0259-4185-8a0c-ac2892f03778',
    '2add6853-3b32-450e-a4ba-42c0b6e5f47f',
    'd6eb8542-f89f-42a7-80b8-cebf15999e18',
    'a3fd1477-bb1d-4f2a-a42f-c36751c6e1ea',
    'c2196a2e-6432-4765-842f-8cff51aca88e',
    '070e8909-5e61-49ad-86d9-f6084a6ee2b9',
    '09c75d46-4eb0-4b6c-aaec-21f8b0cd9cd8'
  ]::uuid[];
  v_user uuid;
  v_user_count integer;
  v_confirmed timestamptz;
  v_profile_email text;
  v_profile_role text;
  v_org_name text;
  v_org_status text;
  v_org_archived timestamptz;
  v_property_org uuid;
  v_property_archived timestamptz;
  v_property_owner uuid;
  v_space_count integer;
  v_other_grants integer;
  v_other_grants_after integer;
  v_active_count integer;
  v_pending_count integer;
  v_pending_id uuid;
  v_owner_checksum text;
  v_owner_checksum_after text;
BEGIN
  IF to_regclass('public.organisations') IS NULL
     OR to_regclass('public.organisation_access') IS NULL
     OR to_regclass('public.properties') IS NULL
     OR to_regclass('public.spaces') IS NULL
     OR to_regclass('public.profiles') IS NULL THEN
    RAISE NOTICE 'pgh org admin grant skipped: access tables are not present';
    RETURN;
  END IF;

  SELECT o.name, o.status, o.archived_at
    INTO v_org_name, v_org_status, v_org_archived
  FROM public.organisations o
  WHERE o.id = v_org;

  IF NOT FOUND THEN
    RAISE NOTICE 'pgh org admin grant skipped: canonical organisation is not in this database';
    RETURN;
  END IF;

  IF v_org_archived IS NOT NULL OR v_org_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'abort: Paarl Girls'' High organisation is not active';
  END IF;

  IF v_org_name ILIKE '%paarl%'
     AND (v_org_name ILIKE '%girl%' OR v_org_name ILIKE '%meisie%') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'abort: organisation % is not Paarl Girls'' High', v_org;
  END IF;

  SELECT p.organisation_id, p.archived_at, p.owner_id
    INTO v_property_org, v_property_archived, v_property_owner
  FROM public.properties p
  WHERE p.id = v_property;

  IF NOT FOUND
     OR v_property_org IS DISTINCT FROM v_org
     OR v_property_archived IS NOT NULL THEN
    RAISE EXCEPTION 'abort: canonical PGH property is not linked to the organisation';
  END IF;

  SELECT COUNT(*)
    INTO v_space_count
  FROM public.spaces s
  WHERE s.id = ANY (v_space_ids)
    AND s.property_id = v_property
    AND s.archived_at IS NULL
    AND COALESCE(s.status, '') <> 'deleted';

  IF v_space_count <> 8 THEN
    RAISE EXCEPTION 'abort: expected 8 canonical PGH spaces, found %', v_space_count;
  END IF;

  SELECT md5(string_agg(s.id::text || ':' || COALESCE(s.owner_id::text, ''), ',' ORDER BY s.id))
    INTO v_owner_checksum
  FROM public.spaces s
  WHERE s.id = ANY (v_space_ids);

  SELECT COUNT(*)
    INTO v_user_count
  FROM auth.users u
  WHERE lower(btrim(u.email)) = v_email;

  IF v_user_count <> 1 THEN
    RAISE EXCEPTION 'abort: expected exactly one auth user for %, found %', v_email, v_user_count;
  END IF;

  SELECT u.id, u.email_confirmed_at
    INTO v_user, v_confirmed
  FROM auth.users u
  WHERE lower(btrim(u.email)) = v_email;

  IF v_confirmed IS NULL THEN
    RAISE EXCEPTION 'abort: auth email is not confirmed for %', v_email;
  END IF;

  SELECT p.email, p.role
    INTO v_profile_email, v_profile_role
  FROM public.profiles p
  WHERE p.id = v_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'abort: profile is not linked to auth user %', v_user;
  END IF;

  IF v_profile_email IS NOT NULL
     AND lower(btrim(v_profile_email)) IS DISTINCT FROM v_email THEN
    RAISE EXCEPTION 'abort: profile email does not match the auth user';
  END IF;

  IF v_profile_role IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'abort: refusing to alter a platform admin profile';
  END IF;

  SELECT COUNT(*)
    INTO v_other_grants
  FROM public.organisation_access a
  WHERE a.user_id = v_user
    AND a.organisation_id IS DISTINCT FROM v_org
    AND a.status = 'active';

  SELECT COUNT(*)
    INTO v_active_count
  FROM public.organisation_access a
  WHERE a.organisation_id = v_org
    AND a.user_id = v_user
    AND a.role = 'org_admin'
    AND a.property_id IS NULL
    AND a.space_id IS NULL
    AND a.status = 'active';

  IF v_active_count > 1 THEN
    RAISE EXCEPTION 'abort: multiple active org admin grants already exist';
  END IF;

  IF v_active_count = 0 THEN
    SELECT COUNT(*)
      INTO v_pending_count
    FROM public.organisation_access a
    WHERE a.organisation_id = v_org
      AND a.role = 'org_admin'
      AND a.property_id IS NULL
      AND a.space_id IS NULL
      AND a.status = 'pending'
      AND a.email_normalized = v_email;

    IF v_pending_count > 1 THEN
      RAISE EXCEPTION 'abort: multiple pending org admin invites for %', v_email;
    END IF;

    IF v_pending_count = 1 THEN
      UPDATE public.organisation_access a
      SET user_id = v_user,
          status = 'active',
          activated_at = now(),
          email = v_email
      WHERE a.organisation_id = v_org
        AND a.role = 'org_admin'
        AND a.property_id IS NULL
        AND a.space_id IS NULL
        AND a.status = 'pending'
        AND a.email_normalized = v_email
        AND a.user_id IS NULL
      RETURNING a.id INTO v_pending_id;

      IF v_pending_id IS NULL THEN
        RAISE EXCEPTION 'abort: pending org admin invite could not be activated';
      END IF;
    ELSE
      INSERT INTO public.organisation_access (
        organisation_id,
        role,
        property_id,
        space_id,
        user_id,
        email,
        email_normalized,
        status,
        is_primary,
        notify_all_bookings,
        activated_at
      ) VALUES (
        v_org,
        'org_admin',
        NULL,
        NULL,
        v_user,
        v_email,
        v_email,
        'active',
        false,
        false,
        now()
      );
    END IF;
  END IF;

  SELECT md5(string_agg(s.id::text || ':' || COALESCE(s.owner_id::text, ''), ',' ORDER BY s.id))
    INTO v_owner_checksum_after
  FROM public.spaces s
  WHERE s.id = ANY (v_space_ids);

  IF v_owner_checksum IS DISTINCT FROM v_owner_checksum_after THEN
    RAISE EXCEPTION 'abort: space ownership changed';
  END IF;

  IF (SELECT p.owner_id FROM public.properties p WHERE p.id = v_property)
       IS DISTINCT FROM v_property_owner THEN
    RAISE EXCEPTION 'abort: property ownership changed';
  END IF;

  IF (SELECT p.role FROM public.profiles p WHERE p.id = v_user)
       IS DISTINCT FROM v_profile_role THEN
    RAISE EXCEPTION 'abort: profile role changed';
  END IF;

  SELECT COUNT(*)
    INTO v_other_grants_after
  FROM public.organisation_access a
  WHERE a.user_id = v_user
    AND a.organisation_id IS DISTINCT FROM v_org
    AND a.status = 'active';

  IF v_other_grants_after IS DISTINCT FROM v_other_grants THEN
    RAISE EXCEPTION 'abort: grants on other organisations changed';
  END IF;

  SELECT COUNT(*)
    INTO v_active_count
  FROM public.organisation_access a
  WHERE a.organisation_id = v_org
    AND a.user_id = v_user
    AND a.role = 'org_admin'
    AND a.property_id IS NULL
    AND a.space_id IS NULL
    AND a.status = 'active';

  IF v_active_count <> 1 THEN
    RAISE EXCEPTION 'abort: expected one active PGH org admin grant, found %', v_active_count;
  END IF;
END $$;
