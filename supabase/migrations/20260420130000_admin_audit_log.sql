-- Phase 4: Persistent admin audit log (server/service_role writes only; read via admin API)

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  admin_user_id uuid NOT NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  reason text,
  meta jsonb
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx
  ON public.admin_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_log_action_idx
  ON public.admin_audit_log (action);

CREATE INDEX IF NOT EXISTS admin_audit_log_admin_user_id_idx
  ON public.admin_audit_log (admin_user_id);

COMMENT ON TABLE public.admin_audit_log IS
  'Append-only admin action audit; inserted only from trusted server routes using service role.';

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
