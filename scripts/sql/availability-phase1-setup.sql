CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '');
$$;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULL::uuid;
$$;

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL,
  renter_id uuid,
  status text,
  payment_status text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  owner_response_at timestamptz,
  owner_response_by uuid,
  owner_response_message text,
  total_price numeric,
  platform_fee numeric,
  owner_earnings numeric
);

CREATE EXTENSION IF NOT EXISTS dblink;

CREATE TABLE public.test_gate (
  name text PRIMARY KEY,
  ready boolean NOT NULL DEFAULT false
);
