import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeOperationalBookingManagers,
  type OperationalBookingManagers,
} from "@/lib/access/operational-booking-managers";

/**
 * Loads inventory + active grants, then computes operational booking managers.
 * Identity is not a parameter — this describes the space, not an acting user.
 */
export async function resolveOperationalBookingManagers(
  admin: SupabaseClient,
  spaceId: string
): Promise<OperationalBookingManagers | null> {
  const { data: space, error: spaceError } = await admin
    .from("spaces")
    .select("id, owner_id, property_id")
    .eq("id", spaceId)
    .maybeSingle();

  if (spaceError || !space) return null;

  const spaceRow = space as {
    id: string;
    owner_id: string | null;
    property_id: string | null;
  };

  let organisationId: string | null = null;
  let propertyOwnerId: string | null = null;

  if (spaceRow.property_id) {
    const { data: property } = await admin
      .from("properties")
      .select("id, owner_id, organisation_id")
      .eq("id", spaceRow.property_id)
      .maybeSingle();
    const propertyRow = property as {
      owner_id: string | null;
      organisation_id: string | null;
    } | null;
    organisationId = propertyRow?.organisation_id ?? null;
    propertyOwnerId = propertyRow?.owner_id ?? null;
  }

  let spaceManagerIds: string[] = [];
  let orgAdminIds: string[] = [];

  if (organisationId) {
    const { data: grants } = await admin
      .from("organisation_access")
      .select("user_id, role, property_id, space_id, status")
      .eq("organisation_id", organisationId)
      .eq("status", "active")
      .in("role", ["space_manager", "org_admin"]);

    for (const row of (grants || []) as Array<{
      user_id: string | null;
      role: string;
      property_id: string | null;
      space_id: string | null;
    }>) {
      if (!row.user_id) continue;
      if (
        row.role === "space_manager" &&
        row.space_id === spaceRow.id &&
        row.property_id === spaceRow.property_id
      ) {
        spaceManagerIds.push(row.user_id);
      }
      if (
        row.role === "org_admin" &&
        row.property_id == null &&
        row.space_id == null
      ) {
        orgAdminIds.push(row.user_id);
      }
    }
  }

  return computeOperationalBookingManagers({
    organisationId,
    spaceOwnerId: spaceRow.owner_id,
    propertyOwnerId,
    activeSpaceManagerUserIds: spaceManagerIds,
    activeOrgAdminUserIds: orgAdminIds,
  });
}

/**
 * Temporary 066 bridge: first operational host for a message recipient.
 * Organisation managers take precedence over a leftover spaces.owner_id snapshot.
 * Legacy owner is used only when no valid organisation operational recipient exists.
 */
export async function resolveBookingHostRecipientId(
  admin: SupabaseClient,
  booking: { owner_id: string | null; space_id: string }
): Promise<string | null> {
  const ops = await resolveOperationalBookingManagers(admin, booking.space_id);
  if (ops?.recipientUserIds?.length) {
    return ops.recipientUserIds[0] ?? null;
  }
  return booking.owner_id ?? null;
}
