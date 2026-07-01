-- Private storage for booking requirement file uploads + server-side terms guard.

INSERT INTO storage.buckets (id, name, public)
VALUES ('booking-requirement-files', 'booking-requirement-files', false)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

-- Belt-and-suspenders: block direct client booking inserts when property terms are required.
CREATE OR REPLACE FUNCTION public.validate_booking_property_terms_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prop RECORD;
BEGIN
  SELECT
    p.require_terms_acceptance,
    p.terms_text,
    p.terms_document_url
  INTO prop
  FROM public.spaces s
  JOIN public.properties p ON p.id = s.property_id
  WHERE s.id = NEW.space_id;

  IF NOT FOUND OR prop IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT COALESCE(prop.require_terms_acceptance, false) THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (prop.terms_text IS NOT NULL AND btrim(prop.terms_text) <> '')
    OR (prop.terms_document_url IS NOT NULL AND btrim(prop.terms_document_url) <> '')
  ) THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.terms_accepted, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'booking_property_terms_required'
      USING HINT = 'Property terms acceptance is required before submitting a booking request.';
  END IF;

  IF NEW.terms_accepted_at IS NULL THEN
    RAISE EXCEPTION 'booking_property_terms_timestamp_required'
      USING HINT = 'Property terms acceptance timestamp is required.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_bookings_validate_property_terms ON public.bookings;
CREATE TRIGGER tr_bookings_validate_property_terms
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE PROCEDURE public.validate_booking_property_terms_on_insert();
