-- Sport venue listing category (application-validated on spaces.space_type).
-- Sub-types persist in space_attributes (attribute_key = 'sf_sport_types').
-- No row changes required; existing listings remain valid.

COMMENT ON COLUMN public.spaces.space_type IS
  'Listing category (storage, parking, office, sport_venue, event_space, etc.). '
  'Sport sub-types: space_attributes rows with attribute_key sf_sport_types.';
