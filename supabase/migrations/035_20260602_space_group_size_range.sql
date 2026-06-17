-- Replace single capacity with min/max group size range on spaces.

ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS min_group_size integer,
  ADD COLUMN IF NOT EXISTS max_group_size integer;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'spaces'
      AND column_name = 'capacity'
  ) THEN
    UPDATE public.spaces
    SET
      min_group_size = COALESCE(min_group_size, 1),
      max_group_size = COALESCE(max_group_size, capacity)
    WHERE capacity IS NOT NULL;

    ALTER TABLE public.spaces DROP COLUMN capacity;
  END IF;
END $$;

COMMENT ON COLUMN public.spaces.min_group_size IS 'Minimum group size the venue can accommodate.';
COMMENT ON COLUMN public.spaces.max_group_size IS 'Maximum group size the venue can accommodate.';
