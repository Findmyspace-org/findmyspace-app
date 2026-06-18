-- Property brand logo (separate from property_images gallery).

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS logo_file_path text;

COMMENT ON COLUMN public.properties.logo_url IS
  'Public URL for the property brand logo (not a gallery photo).';
COMMENT ON COLUMN public.properties.logo_file_path IS
  'Storage path for logo deletion in space-images bucket.';
