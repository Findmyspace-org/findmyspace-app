-- Advisor Phase 3: bookings filtered by space_id + created_at for conversion metrics
CREATE INDEX IF NOT EXISTS bookings_space_id_created_at_idx
  ON public.bookings (space_id, created_at DESC);
