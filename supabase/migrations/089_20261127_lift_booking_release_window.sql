-- The release window rejected new booking and availability writes while
-- migrations 080-088 were applied. Payment status updates stayed allowed.
-- Public discovery and sign-in have been verified on the new production
-- deployment, so the temporary guards are removed. No booking or block rows
-- are changed.

DROP TRIGGER IF EXISTS release_window_guard_bookings ON public.bookings;
DROP TRIGGER IF EXISTS release_window_guard_blocks ON public.blocked_dates;
DROP FUNCTION IF EXISTS public.release_window_guard_bookings();
DROP FUNCTION IF EXISTS public.release_window_guard_blocks();
