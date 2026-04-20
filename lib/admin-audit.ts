import { createClient } from "@supabase/supabase-js";

/**
 * Admin action audit event. Persisted to `admin_audit_log` from trusted server routes only.
 * Do not put secrets, tokens, or payment credentials in `meta`.
 */
export type AdminAuditEvent = {
  action: string;
  actorUserId: string;
  targetType?: string;
  targetId?: string;
  reason?: string;
  meta?: Record<string, unknown>;
};

/**
 * Writes one audit row using the service role. Never throws: primary mutations must succeed
 * even if logging fails; failures are logged to stderr for operations follow-up.
 */
export async function adminAudit(event: AdminAuditEvent): Promise<void> {
  const line = {
    source: "admin-audit",
    ...event,
    at: new Date().toISOString(),
  };
  console.info("[admin-audit]", JSON.stringify(line));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error(
      "[admin-audit] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY; audit not persisted."
    );
    return;
  }

  try {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { error } = await (admin.from("admin_audit_log") as any).insert({
      admin_user_id: event.actorUserId,
      action: event.action,
      target_type: event.targetType ?? null,
      target_id: event.targetId ?? null,
      reason: event.reason ?? null,
      meta: event.meta ?? null,
    });

    if (error) {
      console.error("[admin-audit] Database insert failed:", error.message, error);
    }
  } catch (e) {
    console.error("[admin-audit] Unexpected error during persist:", e);
  }
}
