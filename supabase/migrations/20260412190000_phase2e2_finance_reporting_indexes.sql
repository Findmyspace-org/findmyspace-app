-- Phase 2E.2: finance reporting — index for booking_charges filtered by booking + status
-- (e.g. PayFast notify pending check, owner dashboards). No uniqueness: recurring
-- monthly lines may share charge_type with different periods.

CREATE INDEX IF NOT EXISTS booking_charges_booking_id_status_idx
  ON public.booking_charges (booking_id, status);

COMMENT ON INDEX booking_charges_booking_id_status_idx IS
  'Supports reporting and ITN paths filtering booking_charges by booking_id and status.';
