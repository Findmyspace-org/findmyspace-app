-- Super Admin admin-user management: disable flag + service_role profile INSERT.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_access_disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_invited_at timestamptz;

COMMENT ON COLUMN public.profiles.admin_access_disabled IS
  'When true, user cannot access admin APIs/UI even if role is admin or super_admin.';

COMMENT ON COLUMN public.profiles.admin_invited_at IS
  'When the admin invite / password-setup email was last sent.';

GRANT INSERT ON public.profiles TO service_role;

-- Bootstrap your first Super Admin once (replace email):
-- UPDATE public.profiles SET role = 'super_admin' WHERE lower(email) = lower('you@example.com');
