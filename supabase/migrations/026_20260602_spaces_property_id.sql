-- Link marketplace spaces to a parent property/venue (optional; no backfill).

ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS property_id uuid
    REFERENCES public.properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS spaces_property_id_idx
  ON public.spaces (property_id)
  WHERE property_id IS NOT NULL;

COMMENT ON COLUMN public.spaces.property_id IS
  'Optional parent property/venue. Property invite grants ownership of all linked spaces.';
