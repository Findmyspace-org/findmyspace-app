-- PostgREST uses the database role behind the service_role API key. Without explicit
-- GRANT, admin routes can return: permission denied for table <name>.
-- Only service_role receives these privileges; authenticated/anon RLS is unchanged.

-- Admin listing content PATCH, admin users listing counts, booking flows
GRANT SELECT, UPDATE ON public.spaces TO service_role;

-- Admin bookings list/detail, notes, cancel-support, payment-link, finance
GRANT SELECT, UPDATE ON public.bookings TO service_role;

-- Admin support notes and thread replies
GRANT SELECT, INSERT ON public.booking_messages TO service_role;

-- Admin messages UI (listing cover / metadata joins)
GRANT SELECT ON public.space_images TO service_role;

-- Admin finance summary and export
GRANT SELECT ON public.payments TO service_role;
