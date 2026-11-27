DO $$
DECLARE
  target_space uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  saved jsonb;
BEGIN
  INSERT INTO public.spaces (id, status, public_listing_mode)
  VALUES (target_space, 'active', 'live');

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    PERFORM public.replace_space_booking_rates(target_space, '[]'::jsonb);
    RAISE EXCEPTION 'authenticated user executed replace_space_booking_rates';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%not authorized%' THEN
        RAISE;
      END IF;
  END;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  saved := public.replace_space_booking_rates(
    target_space,
    '[
      {"period":"hour","amount":250},
      {"period":"day","amount":1500},
      {"period":"week","amount":6000},
      {"period":"month","amount":8000},
      {"period":"quarter","amount":20000},
      {"period":"year","amount":65000}
    ]'::jsonb
  );
  IF (saved->>'useFlexibleRates')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'rates were not saved';
  END IF;
  IF (SELECT count(*) FROM public.space_booking_rates WHERE space_id = target_space) <> 6 THEN
    RAISE EXCEPTION 'expected six independent rates';
  END IF;

  BEGIN
    PERFORM public.replace_space_booking_rates(
      target_space,
      '[{"period":"week","amount":1},{"period":"week","amount":2}]'::jsonb
    );
    RAISE EXCEPTION 'duplicate period was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%duplicate%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM public.replace_space_booking_rates(
      target_space,
      '[{"period":"hour","amount":0}]'::jsonb
    );
    RAISE EXCEPTION 'zero price was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%invalid booking price%' THEN
        RAISE;
      END IF;
  END;

  PERFORM public.replace_space_booking_rates(target_space, '[]'::jsonb);
  IF (SELECT count(*) FROM public.space_booking_rates WHERE space_id = target_space) <> 0 THEN
    RAISE EXCEPTION 'clearing rates did not restore the legacy configuration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE table_name = 'space_booking_rates'
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
  ) THEN
    RAISE EXCEPTION 'ordinary roles can write booking rates';
  END IF;
END $$;
