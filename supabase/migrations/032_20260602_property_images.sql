-- Property-level gallery images (admin only, Phase 1). Separate from space_images.

CREATE TABLE IF NOT EXISTS public.property_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  file_path text,
  sort_order integer NOT NULL DEFAULT 0,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS property_images_property_id_idx
  ON public.property_images (property_id);

CREATE INDEX IF NOT EXISTS property_images_property_id_sort_idx
  ON public.property_images (property_id, sort_order);

COMMENT ON TABLE public.property_images IS
  'Admin-only venue/property photos. Not used for public browse in Phase 1.';
