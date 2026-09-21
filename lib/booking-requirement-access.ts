import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAccessForSpace } from "@/lib/access/resolve-access";

export type BookingRequirementAccess =
  | "renter"
  | "space_owner"
  | "property_owner"
  | "platform_admin"
  | "organisation_manager";

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
    owner_id: string | null;
    space_id: string;
  };

  if (row.renter_id === userId) return "renter";
  if (row.owner_id === userId) return "space_owner";

  const access = await resolveAccessForSpace(admin, userId, row.space_id);
  if (!access?.canManageBooking) return null;
  if (access.isGlobalAdmin) return "platform_admin";
  if (access.isLegacyPropertyOwner) return "property_owner";
  if (access.isLegacySpaceOwner) return "space_owner";
  return "organisation_manager";
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
