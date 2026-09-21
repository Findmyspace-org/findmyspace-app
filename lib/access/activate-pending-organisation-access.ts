import type { SupabaseClient } from "@supabase/supabase-js";
import { adminAudit } from "@/lib/admin-audit";
import {
  ORGANISATION_ACCESS_AUDIT,
  organisationAccessAuditEvent,
} from "@/lib/access/organisation-access-audit";

export type ActivatedOrganisationAccess = {
  id: string;
  organisation_id: string;
  role: string;
  property_id: string | null;
  space_id: string | null;
  invited_by: string | null;
};

/**
 * Activates pending organisation_access rows for the verified session user.
 * Idempotent. Uses the 067 SECURITY DEFINER RPC so the email comes from
 * auth.users for this user id — never from client input.
 */
export async function activatePendingOrganisationAccess(
  admin: SupabaseClient,
  userId: string
): Promise<ActivatedOrganisationAccess[]> {
  const { data, error } = await admin.rpc(
    "activate_pending_organisation_access",
    { p_user_id: userId }
  );

  if (error) {
    throw new Error(error.message);
  }

  const payload = (data ?? {}) as { activated?: ActivatedOrganisationAccess[] };
  const activated = Array.isArray(payload.activated) ? payload.activated : [];

  for (const row of activated) {
    await adminAudit(
      organisationAccessAuditEvent({
        action: ORGANISATION_ACCESS_AUDIT.activated,
        actorUserId: userId,
        actorKind: "access_holder",
        organisationId: row.organisation_id,
        accessId: row.id,
        role: row.role,
        propertyId: row.property_id,
        spaceId: row.space_id,
        previous: { status: "pending", user_id: null },
        next: { status: "active", user_id: userId },
      })
    );
  }

  return activated;
}
