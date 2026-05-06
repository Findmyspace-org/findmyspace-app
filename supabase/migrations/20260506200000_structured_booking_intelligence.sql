-- Structured Booking Intelligence: listing questionnaires, host requirements, renter request payloads.
-- TODO: AI assistant integration — expose listing_questionnaires.data + booking_request_details for RAG / matching.

-- ---------------------------------------------------------------------------
-- updated_at helper (idempotent)
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
-- listing_questionnaires
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.listing_questionnaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces (id) ON DELETE CASCADE,
  category text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT listing_questionnaires_space_id_key UNIQUE (space_id)
);

CREATE INDEX IF NOT EXISTS listing_questionnaires_space_id_idx
  ON public.listing_questionnaires (space_id);

DROP TRIGGER IF EXISTS tr_listing_questionnaires_updated_at ON public.listing_questionnaires;
CREATE TRIGGER tr_listing_questionnaires_updated_at
  BEFORE UPDATE ON public.listing_questionnaires
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_listing_intel_updated_at();

ALTER TABLE public.listing_questionnaires ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'listing_questionnaires'
      AND policyname = 'listing_questionnaires_select_owner'
  ) THEN
    CREATE POLICY listing_questionnaires_select_owner
      ON public.listing_questionnaires
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.spaces s
          WHERE s.id = listing_questionnaires.space_id
            AND s.owner_id = (SELECT auth.uid())
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'listing_questionnaires'
      AND policyname = 'listing_questionnaires_select_public_active'
  ) THEN
    CREATE POLICY listing_questionnaires_select_public_active
      ON public.listing_questionnaires
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.spaces s
          WHERE s.id = listing_questionnaires.space_id
            AND s.status = 'active'
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'listing_questionnaires'
      AND policyname = 'listing_questionnaires_insert_owner'
  ) THEN
    CREATE POLICY listing_questionnaires_insert_owner
      ON public.listing_questionnaires
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.spaces s
          WHERE s.id = listing_questionnaires.space_id
            AND s.owner_id = (SELECT auth.uid())
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'listing_questionnaires'
      AND policyname = 'listing_questionnaires_update_owner'
  ) THEN
    CREATE POLICY listing_questionnaires_update_owner
      ON public.listing_questionnaires
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.spaces s
          WHERE s.id = listing_questionnaires.space_id
            AND s.owner_id = (SELECT auth.uid())
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.spaces s
          WHERE s.id = listing_questionnaires.space_id
            AND s.owner_id = (SELECT auth.uid())
        )
      );
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- listing_booking_requirements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.listing_booking_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces (id) ON DELETE CASCADE,
  require_item_type boolean NOT NULL DEFAULT false,
  require_dimensions boolean NOT NULL DEFAULT false,
  require_photos boolean NOT NULL DEFAULT false,
  require_vehicle_details boolean NOT NULL DEFAULT false,
  require_access_frequency boolean NOT NULL DEFAULT false,
  require_estimated_value boolean NOT NULL DEFAULT false,
  require_notes boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT listing_booking_requirements_space_id_key UNIQUE (space_id)
);

CREATE INDEX IF NOT EXISTS listing_booking_requirements_space_id_idx
  ON public.listing_booking_requirements (space_id);

DROP TRIGGER IF EXISTS tr_listing_booking_requirements_updated_at ON public.listing_booking_requirements;
CREATE TRIGGER tr_listing_booking_requirements_updated_at
  BEFORE UPDATE ON public.listing_booking_requirements
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_listing_intel_updated_at();

ALTER TABLE public.listing_booking_requirements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'listing_booking_requirements'
      AND policyname = 'listing_booking_requirements_select_owner'
  ) THEN
    CREATE POLICY listing_booking_requirements_select_owner
      ON public.listing_booking_requirements
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.spaces s
          WHERE s.id = listing_booking_requirements.space_id
            AND s.owner_id = (SELECT auth.uid())
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'listing_booking_requirements'
      AND policyname = 'listing_booking_requirements_select_public_active'
  ) THEN
    CREATE POLICY listing_booking_requirements_select_public_active
      ON public.listing_booking_requirements
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.spaces s
          WHERE s.id = listing_booking_requirements.space_id
            AND s.status = 'active'
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'listing_booking_requirements'
      AND policyname = 'listing_booking_requirements_insert_owner'
  ) THEN
    CREATE POLICY listing_booking_requirements_insert_owner
      ON public.listing_booking_requirements
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.spaces s
          WHERE s.id = listing_booking_requirements.space_id
            AND s.owner_id = (SELECT auth.uid())
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'listing_booking_requirements'
      AND policyname = 'listing_booking_requirements_update_owner'
  ) THEN
    CREATE POLICY listing_booking_requirements_update_owner
      ON public.listing_booking_requirements
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.spaces s
          WHERE s.id = listing_booking_requirements.space_id
            AND s.owner_id = (SELECT auth.uid())
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.spaces s
          WHERE s.id = listing_booking_requirements.space_id
            AND s.owner_id = (SELECT auth.uid())
        )
      );
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- booking_request_details (structured renter payload per booking)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_request_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT booking_request_details_booking_id_key UNIQUE (booking_id)
);

CREATE INDEX IF NOT EXISTS booking_request_details_booking_id_idx
  ON public.booking_request_details (booking_id);

ALTER TABLE public.booking_request_details ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'booking_request_details'
      AND policyname = 'booking_request_details_insert_renter'
  ) THEN
    CREATE POLICY booking_request_details_insert_renter
      ON public.booking_request_details
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.id = booking_request_details.booking_id
            AND b.renter_id = (SELECT auth.uid())
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'booking_request_details'
      AND policyname = 'booking_request_details_select_parties'
  ) THEN
    CREATE POLICY booking_request_details_select_parties
      ON public.booking_request_details
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.id = booking_request_details.booking_id
            AND (
              b.renter_id = (SELECT auth.uid())
              OR b.owner_id = (SELECT auth.uid())
            )
        )
      );
  END IF;
END
$$;

COMMENT ON TABLE public.listing_questionnaires IS
  'Structured listing intelligence (JSONB) for matching and future AI; see TODO: AI assistant integration.';
COMMENT ON TABLE public.listing_booking_requirements IS
  'Host-defined fields renters must supply when requesting a booking.';
COMMENT ON TABLE public.booking_request_details IS
  'Structured renter answers for a booking request; complements bookings.notes.';
