-- Allow listing enquiries from logged-out visitors (requester_id optional).

ALTER TABLE public.listing_enquiries
  ALTER COLUMN requester_id DROP NOT NULL;

ALTER TABLE public.listing_enquiries
  DROP CONSTRAINT IF EXISTS listing_enquiries_requester_id_fkey;

ALTER TABLE public.listing_enquiries
  ADD CONSTRAINT listing_enquiries_requester_id_fkey
  FOREIGN KEY (requester_id) REFERENCES auth.users(id) ON DELETE SET NULL;
