-- Admin API and claim/lookup routes use service_role for space_advisors.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.space_advisors TO service_role;
