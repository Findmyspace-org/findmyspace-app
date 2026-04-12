-- Phase 2C: owners can read booking_charges for their bookings (finance dashboard).

DROP POLICY IF EXISTS booking_charges_select_owner ON public.booking_charges;

CREATE POLICY booking_charges_select_owner ON public.booking_charges
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_charges.booking_id
        AND b.owner_id = auth.uid()
    )
  );
