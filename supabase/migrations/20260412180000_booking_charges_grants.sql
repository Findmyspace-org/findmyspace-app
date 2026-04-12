-- booking_charges was created via SQL without inheriting Supabase UI default grants.
-- Without GRANT, PostgREST returns: permission denied for table booking_charges
-- (RLS policies alone are not enough if the role cannot SELECT the table at all.)

GRANT SELECT, INSERT ON public.booking_charges TO authenticated;

GRANT ALL ON public.booking_charges TO service_role;
