-- service_role INSERT on space_images may also require sequence USAGE when id is serial.

DO $$
DECLARE
  seq_name text;
BEGIN
  SELECT pg_get_serial_sequence('public.space_images', 'id') INTO seq_name;
  IF seq_name IS NOT NULL THEN
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO service_role', seq_name);
  END IF;
END $$;
