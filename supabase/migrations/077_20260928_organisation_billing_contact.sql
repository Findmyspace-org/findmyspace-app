-- Dedicated organisation billing contact for subscription invoices.
-- Additive only. Does not rewrite commercial_terms, bookings, or payouts.

ALTER TABLE public.organisation_commercial_profiles
  ADD COLUMN IF NOT EXISTS billing_contact_name text,
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS billing_phone text;

COMMENT ON COLUMN public.organisation_commercial_profiles.billing_email IS
  'Invoice delivery address for organisation subscription billing. Separate from CRM contacts and payout bank details.';
