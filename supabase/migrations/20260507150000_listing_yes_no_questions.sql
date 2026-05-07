-- Listing yes/no questions: controlled pre-booking communication.
-- Renters can ask hosts simple yes/no questions; hosts answer with structured
-- buttons only (yes / no / not_applicable). Answered questions can be reused
-- as listing FAQ context for the Space Assistant.
--
-- TODO: AI assistant integration — surface answered questions in the assistant
--       context (already wired in app/api/space-assistant/route.ts).

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.listing_yes_no_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces (id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings (id) ON DELETE SET NULL,
  renter_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  question text NOT NULL,
  normalized_question text,
  answer text CHECK (answer IS NULL OR answer IN ('yes', 'no', 'not_applicable')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'answered', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  answered_at timestamptz,
  used_for_listing_faq boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS listing_yes_no_questions_space_id_idx
  ON public.listing_yes_no_questions (space_id);

CREATE INDEX IF NOT EXISTS listing_yes_no_questions_renter_id_idx
  ON public.listing_yes_no_questions (renter_id);

CREATE INDEX IF NOT EXISTS listing_yes_no_questions_owner_id_idx
  ON public.listing_yes_no_questions (owner_id);

CREATE INDEX IF NOT EXISTS listing_yes_no_questions_status_idx
  ON public.listing_yes_no_questions (status);

CREATE INDEX IF NOT EXISTS listing_yes_no_questions_booking_id_idx
  ON public.listing_yes_no_questions (booking_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.listing_yes_no_questions ENABLE ROW LEVEL SECURITY;

-- Renter can insert questions for active listings (and must record themselves
-- as renter_id; owner_id must match the listing owner).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'listing_yes_no_questions'
      AND policyname = 'listing_yes_no_questions_insert_renter'
  ) THEN
    CREATE POLICY listing_yes_no_questions_insert_renter
      ON public.listing_yes_no_questions
      FOR INSERT
      TO authenticated
      WITH CHECK (
        renter_id = (SELECT auth.uid())
        AND EXISTS (
          SELECT 1 FROM public.spaces s
          WHERE s.id = listing_yes_no_questions.space_id
            AND s.status = 'active'
            AND s.owner_id = listing_yes_no_questions.owner_id
        )
      );
  END IF;
END
$$;

-- Renter can read their own questions.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'listing_yes_no_questions'
      AND policyname = 'listing_yes_no_questions_select_renter'
  ) THEN
    CREATE POLICY listing_yes_no_questions_select_renter
      ON public.listing_yes_no_questions
      FOR SELECT
      TO authenticated
      USING (renter_id = (SELECT auth.uid()));
  END IF;
END
$$;

-- Owner can read questions for their spaces.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'listing_yes_no_questions'
      AND policyname = 'listing_yes_no_questions_select_owner'
  ) THEN
    CREATE POLICY listing_yes_no_questions_select_owner
      ON public.listing_yes_no_questions
      FOR SELECT
      TO authenticated
      USING (owner_id = (SELECT auth.uid()));
  END IF;
END
$$;

-- Owner can update answer / status on questions for their spaces.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'listing_yes_no_questions'
      AND policyname = 'listing_yes_no_questions_update_owner'
  ) THEN
    CREATE POLICY listing_yes_no_questions_update_owner
      ON public.listing_yes_no_questions
      FOR UPDATE
      TO authenticated
      USING (owner_id = (SELECT auth.uid()))
      WITH CHECK (owner_id = (SELECT auth.uid()));
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.listing_yes_no_questions TO authenticated;
GRANT ALL ON public.listing_yes_no_questions TO service_role;
