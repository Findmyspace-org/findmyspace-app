-- Structured address fields for listings (spaces)
-- Keeps address_line_1 for backward compatibility while migrating existing data.

ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS street_address text,
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'South Africa';

-- Existing schema already has suburb, city, latitude, longitude in this project.
-- Backfill structured fields from legacy address where possible.
UPDATE public.spaces
SET
  street_address = COALESCE(NULLIF(street_address, ''), address_line_1),
  country = COALESCE(NULLIF(country, ''), 'South Africa')
WHERE true;

CREATE INDEX IF NOT EXISTS spaces_suburb_idx ON public.spaces(suburb);
CREATE INDEX IF NOT EXISTS spaces_city_idx ON public.spaces(city);
CREATE INDEX IF NOT EXISTS spaces_province_idx ON public.spaces(province);
CREATE INDEX IF NOT EXISTS spaces_latitude_idx ON public.spaces(latitude);
CREATE INDEX IF NOT EXISTS spaces_longitude_idx ON public.spaces(longitude);
