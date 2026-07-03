-- Soft archive for venue properties (parent of spaces).

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS properties_archived_at_idx
  ON public.properties (archived_at DESC)
  WHERE archived_at IS NOT NULL;

COMMENT ON COLUMN public.properties.archived_at IS
  'When the property was soft-archived. Archived properties are hidden from default admin/owner lists.';
COMMENT ON COLUMN public.properties.archived_by IS
  'Admin user who archived the property.';
