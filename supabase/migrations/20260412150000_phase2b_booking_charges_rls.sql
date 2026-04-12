-- Phase 2B: RLS so renters can insert/select line items for their own bookings.
-- Service role (API routes) bypasses RLS for payment updates.

ALTER TABLE public.booking_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_charges_select_renter ON public.booking_charges;
CREATE POLICY booking_charges_select_renter ON public.booking_charges
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_charges.booking_id
        AND b.renter_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS booking_charges_insert_renter ON public.booking_charges;
CREATE POLICY booking_charges_insert_renter ON public.booking_charges
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
        AND b.renter_id = auth.uid()
    )
  );
