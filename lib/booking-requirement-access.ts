import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlatformAdminRole } from "@/lib/admin-roles";
import { assertCanManageSpaceId } from "@/lib/space-manager-server";

export type BookingRequirementAccess =
  | "renter"
  | "space_owner"
  | "property_owner"
  | "platform_admin";

export async function getBookingRequirementAccess(
  admin: SupabaseClient,
  userId: string,
  bookingId: string
): Promise<BookingRequirementAccess | null> {
  const { data: booking, error } = await admin
    .from("bookings")
    .select("id, renter_id, owner_id, space_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !booking) return null;

  const row = booking as {
    id: string;
    renter_id: string;
    owner_id: string;
    space_id: string;
  };

  if (row.renter_id === userId) return "renter";
  if (row.owner_id === userId) return "space_owner";

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (isPlatformAdminRole((profile as { role?: string | null } | null)?.role)) {
    return "platform_admin";
  }

  const { data: space } = await admin
    .from("spaces")
    .select("property_id")
    .eq("id", row.space_id)
    .maybeSingle();

  const propertyId = (space as { property_id: string | null } | null)?.property_id;
  if (propertyId) {
    const { data: property } = await admin
      .from("properties")
      .select("owner_id")
      .eq("id", propertyId)
      .maybeSingle();

    if ((property as { owner_id: string | null } | null)?.owner_id === userId) {
      return "property_owner";
    }
  }

  try {
    await assertCanManageSpaceId(admin, userId, row.space_id);
    return "space_owner";
  } catch {
    return null;
  }
}

export async function assertBookingRequirementAccess(
  admin: SupabaseClient,
  userId: string,
  bookingId: string
): Promise<BookingRequirementAccess> {
  const access = await getBookingRequirementAccess(admin, userId, bookingId);
  if (!access) {
    throw new Error("Forbidden.");
  }
  return access;
}
