-- admin_audit_log: service_role INSERT (adminAudit) + SELECT (/api/admin/activity).
-- Does not grant access to authenticated/anon; RLS remains enabled.

GRANT SELECT, INSERT ON public.admin_audit_log TO service_role;
