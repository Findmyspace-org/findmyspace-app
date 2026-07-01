-- Phase 1: property-level terms & space-level custom booking requirement fields (pre-request only).

-- ---------------------------------------------------------------------------
-- Property terms columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS terms_title text,
  ADD COLUMN IF NOT EXISTS terms_text text,
  ADD COLUMN IF NOT EXISTS terms_document_url text,
  ADD COLUMN IF NOT EXISTS terms_document_path text,
  ADD COLUMN IF NOT EXISTS require_terms_acceptance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terms_acceptance_label text NOT NULL DEFAULT
    'I have read and agree to the terms and conditions for this property.',
  ADD COLUMN IF NOT EXISTS terms_updated_at timestamptz NOT NULL DEFAULT timezone('utc', now());

COMMENT ON COLUMN public.properties.terms_document_path IS
  'Storage path for terms document deletion in space-images bucket.';

-- ---------------------------------------------------------------------------
-- Booking terms acceptance evidence
-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS terms_accepted boolean,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_terms_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_terms_title text,
  ADD COLUMN IF NOT EXISTS accepted_terms_label text;

-- ---------------------------------------------------------------------------
-- updated_at helper (reuse listing intel trigger fn if present)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_listing_intel_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- space_booking_requirement_fields
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.space_booking_requirement_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces (id) ON DELETE CASCADE,
  label text NOT NULL,
  help_text text,
  field_type text NOT NULL,
  required boolean NOT NULL DEFAULT false,
  options jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT space_booking_requirement_fields_field_type_check CHECK (
    field_type IN (
      'short_text',
      'long_text',
      'number',
      'yes_no',
      'dropdown',
      'multi_select',
      'file_upload'
    )
  )
);

CREATE INDEX IF NOT EXISTS space_booking_requirement_fields_space_id_idx
  ON public.space_booking_requirement_fields (space_id);

CREATE INDEX IF NOT EXISTS space_booking_requirement_fields_space_active_sort_idx
  ON public.space_booking_requirement_fields (space_id, active, sort_order);

DROP TRIGGER IF EXISTS tr_space_booking_requirement_fields_updated_at
  ON public.space_booking_requirement_fields;
CREATE TRIGGER tr_space_booking_requirement_fields_updated_at
  BEFORE UPDATE ON public.space_booking_requirement_fields
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_listing_intel_updated_at();

-- ---------------------------------------------------------------------------
-- booking_requirement_responses
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_requirement_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  space_id uuid NOT NULL REFERENCES public.spaces (id) ON DELETE CASCADE,
  field_id uuid REFERENCES public.space_booking_requirement_fields (id) ON DELETE SET NULL,
  field_label_snapshot text NOT NULL,
  field_type_snapshot text NOT NULL,
  value jsonb,
  file_url text,
  file_path text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS booking_requirement_responses_booking_id_idx
  ON public.booking_requirement_responses (booking_id);

CREATE INDEX IF NOT EXISTS booking_requirement_responses_space_id_idx
  ON public.booking_requirement_responses (space_id);

CREATE INDEX IF NOT EXISTS booking_requirement_responses_field_id_idx
  ON public.booking_requirement_responses (field_id);

-- ---------------------------------------------------------------------------
-- Permission helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_manage_space_listing(p_space_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.spaces s
    WHERE s.id = p_space_id
      AND (
        s.owner_id = auth.uid()
        OR (
          s.property_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.properties p
            WHERE p.id = s.property_id
              AND p.owner_id = auth.uid()
          )
        )
        OR public.user_is_platform_admin()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_owns_property(p_property_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.properties p
    WHERE p.id = p_property_id
      AND p.owner_id = auth.uid()
  );
$$;

-- Safe public read of property booking terms (no owner PII).
CREATE OR REPLACE FUNCTION public.get_space_property_booking_terms(p_space_id uuid)
RETURNS TABLE (
  property_id uuid,
  terms_title text,
  terms_text text,
  terms_document_url text,
  require_terms_acceptance boolean,
  terms_acceptance_label text,
  terms_updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.terms_title,
    p.terms_text,
    p.terms_document_url,
    p.require_terms_acceptance,
    p.terms_acceptance_label,
    p.terms_updated_at
  FROM public.spaces s
  JOIN public.properties p ON p.id = s.property_id
  WHERE s.id = p_space_id
    AND s.status IN ('active', 'unclaimed', 'paused');
$$;

GRANT EXECUTE ON FUNCTION public.get_space_property_booking_terms(uuid) TO anon, authenticated;

-- Bump terms_updated_at when terms content changes.
CREATE OR REPLACE FUNCTION public.bump_property_terms_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.terms_title IS DISTINCT FROM OLD.terms_title
     OR NEW.terms_text IS DISTINCT FROM OLD.terms_text
     OR NEW.terms_document_url IS DISTINCT FROM OLD.terms_document_url
     OR NEW.require_terms_acceptance IS DISTINCT FROM OLD.require_terms_acceptance
     OR NEW.terms_acceptance_label IS DISTINCT FROM OLD.terms_acceptance_label THEN
    NEW.terms_updated_at := timezone('utc', now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_properties_terms_updated_at ON public.properties;
CREATE TRIGGER tr_properties_terms_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW
  EXECUTE PROCEDURE public.bump_property_terms_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: properties owner update (terms + general property fields for owners)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS properties_owner_update ON public.properties;
CREATE POLICY properties_owner_update ON public.properties
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS: space_booking_requirement_fields
-- ---------------------------------------------------------------------------
ALTER TABLE public.space_booking_requirement_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS space_booking_requirement_fields_select_manage
  ON public.space_booking_requirement_fields;
CREATE POLICY space_booking_requirement_fields_select_manage
  ON public.space_booking_requirement_fields
  FOR SELECT TO authenticated
  USING (public.user_can_manage_space_listing(space_id));

DROP POLICY IF EXISTS space_booking_requirement_fields_select_public_active
  ON public.space_booking_requirement_fields;
CREATE POLICY space_booking_requirement_fields_select_public_active
  ON public.space_booking_requirement_fields
  FOR SELECT
  USING (
    active = true
    AND EXISTS (
      SELECT 1 FROM public.spaces s
      WHERE s.id = space_booking_requirement_fields.space_id
        AND s.status IN ('active', 'unclaimed')
    )
  );

DROP POLICY IF EXISTS space_booking_requirement_fields_insert_manage
  ON public.space_booking_requirement_fields;
CREATE POLICY space_booking_requirement_fields_insert_manage
  ON public.space_booking_requirement_fields
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_manage_space_listing(space_id));

DROP POLICY IF EXISTS space_booking_requirement_fields_update_manage
  ON public.space_booking_requirement_fields;
CREATE POLICY space_booking_requirement_fields_update_manage
  ON public.space_booking_requirement_fields
  FOR UPDATE TO authenticated
  USING (public.user_can_manage_space_listing(space_id))
  WITH CHECK (public.user_can_manage_space_listing(space_id));

DROP POLICY IF EXISTS space_booking_requirement_fields_delete_manage
  ON public.space_booking_requirement_fields;
CREATE POLICY space_booking_requirement_fields_delete_manage
  ON public.space_booking_requirement_fields
  FOR DELETE TO authenticated
  USING (public.user_can_manage_space_listing(space_id));

-- ---------------------------------------------------------------------------
-- RLS: booking_requirement_responses
-- ---------------------------------------------------------------------------
ALTER TABLE public.booking_requirement_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_requirement_responses_insert_renter
  ON public.booking_requirement_responses;
CREATE POLICY booking_requirement_responses_insert_renter
  ON public.booking_requirement_responses
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_requirement_responses.booking_id
        AND b.renter_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS booking_requirement_responses_select_parties
  ON public.booking_requirement_responses;
CREATE POLICY booking_requirement_responses_select_parties
  ON public.booking_requirement_responses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_requirement_responses.booking_id
        AND (
          b.renter_id = auth.uid()
          OR b.owner_id = auth.uid()
          OR public.user_is_platform_admin()
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.bookings b
      JOIN public.spaces s ON s.id = b.space_id
      JOIN public.properties p ON p.id = s.property_id
      WHERE b.id = booking_requirement_responses.booking_id
        AND p.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.space_booking_requirement_fields TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.space_booking_requirement_fields TO authenticated;
GRANT ALL ON public.space_booking_requirement_fields TO service_role;

GRANT SELECT, INSERT ON public.booking_requirement_responses TO authenticated;
GRANT ALL ON public.booking_requirement_responses TO service_role;

COMMENT ON TABLE public.space_booking_requirement_fields IS
  'Owner-defined custom fields renters complete before submitting a booking request.';
COMMENT ON TABLE public.booking_requirement_responses IS
  'Renter answers to space_booking_requirement_fields at booking request time (snapshots preserved).';

-- Legacy Phase 1 uploads may still reference public `space-images` URLs; migration 043
-- adds private `booking-requirement-files` bucket for new uploads with signed URL access.
