import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlatformAdminRole } from "@/lib/admin-roles";
import { isCommunicationAllowed } from "@/lib/booking-communication";

export type AssistantViewerRole =
  | "guest"
  | "enquiring_user"
  | "confirmed_booking"
  | "owner"
  | "admin";

export type AssistantAccessContext = {
  viewerRole: AssistantViewerRole;
  bookingStatus: string | null;
  paymentStatus: string | null;
  bookingId: string | null;
  userId: string | null;
  canRevealContactDetails: boolean;
  canRevealOperationalInfo: boolean;
};

export function canRevealAssistantRestrictedInfo(
  ctx: AssistantAccessContext
): boolean {
  return ctx.canRevealContactDetails && ctx.canRevealOperationalInfo;
}

export function buildAssistantAccessFromBooking(params: {
  viewerRole: AssistantViewerRole;
  userId: string | null;
  bookingId: string | null;
  bookingStatus: string | null;
  paymentStatus: string | null;
}): AssistantAccessContext {
  const privileged =
    params.viewerRole === "owner" || params.viewerRole === "admin";

  const confirmed =
    privileged ||
    (params.viewerRole === "confirmed_booking" &&
      isCommunicationAllowed({
        status: params.bookingStatus,
        payment_status: params.paymentStatus,
      }));

  return {
    viewerRole: params.viewerRole,
    bookingStatus: params.bookingStatus,
    paymentStatus: params.paymentStatus,
    bookingId: params.bookingId,
    userId: params.userId,
    canRevealContactDetails: confirmed,
    canRevealOperationalInfo: confirmed,
  };
}

export async function resolveAssistantAccessContext(
  admin: SupabaseClient,
  params: {
    spaceId: string;
    userId: string | null;
    bookingId?: string | null;
  }
): Promise<AssistantAccessContext> {
  const { spaceId, userId, bookingId } = params;

  if (!userId) {
    return buildAssistantAccessFromBooking({
      viewerRole: "guest",
      userId: null,
      bookingId: null,
      bookingStatus: null,
      paymentStatus: null,
    });
  }

  const [{ data: profile }, { data: space }] = await Promise.all([
    admin.from("profiles").select("role").eq("id", userId).maybeSingle(),
    admin.from("spaces").select("owner_id").eq("id", spaceId).maybeSingle(),
  ]);

  const role = (profile as { role?: string } | null)?.role ?? null;
  if (isPlatformAdminRole(role)) {
    return buildAssistantAccessFromBooking({
      viewerRole: "admin",
      userId,
      bookingId: bookingId ?? null,
      bookingStatus: null,
      paymentStatus: null,
    });
  }

  const ownerId = (space as { owner_id?: string | null } | null)?.owner_id ?? null;
  if (ownerId && ownerId === userId) {
    return buildAssistantAccessFromBooking({
      viewerRole: "owner",
      userId,
      bookingId: bookingId ?? null,
      bookingStatus: null,
      paymentStatus: null,
    });
  }

  let bookingRow: {
    id: string;
    status: string | null;
    payment_status: string | null;
  } | null = null;

  if (bookingId) {
    const { data } = await admin
      .from("bookings")
      .select("id, status, payment_status, renter_id, space_id")
      .eq("id", bookingId)
      .maybeSingle();

    const row = data as {
      id: string;
      status: string | null;
      payment_status: string | null;
      renter_id: string | null;
      space_id: string | null;
    } | null;

    if (row && row.renter_id === userId && row.space_id === spaceId) {
      bookingRow = row;
    }
  } else {
    const { data } = await admin
      .from("bookings")
      .select("id, status, payment_status")
      .eq("space_id", spaceId)
      .eq("renter_id", userId)
      .in("status", ["paid_confirmed", "confirmed", "completed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    bookingRow = (data as typeof bookingRow) ?? null;
  }

  if (
    bookingRow &&
    isCommunicationAllowed({
      status: bookingRow.status,
      payment_status: bookingRow.payment_status,
    })
  ) {
    return buildAssistantAccessFromBooking({
      viewerRole: "confirmed_booking",
      userId,
      bookingId: bookingRow.id,
      bookingStatus: bookingRow.status,
      paymentStatus: bookingRow.payment_status,
    });
  }

  return buildAssistantAccessFromBooking({
    viewerRole: "enquiring_user",
    userId,
    bookingId: bookingRow?.id ?? null,
    bookingStatus: bookingRow?.status ?? null,
    paymentStatus: bookingRow?.payment_status ?? null,
  });
}

export function assistantPromptAccessRules(ctx: AssistantAccessContext): string {
  if (canRevealAssistantRestrictedInfo(ctx)) {
    return [
      "The viewer has a confirmed, paid booking (or is the owner/admin).",
      "You may share relevant operational details from the AI Information source,",
      "including venue contacts, access procedures, gate codes, WiFi, and setup instructions.",
    ].join(" ");
  }

  return [
    "The viewer does NOT have a confirmed paid booking.",
    "Use AI Information for general venue questions only.",
    "Never reveal phone numbers, email addresses, WhatsApp numbers, website URLs,",
    "social media handles, direct owner or supplier contacts, access codes, gate codes,",
    "WiFi passwords, or security instructions that could bypass the platform.",
    "Direct contact requests to the FindMySpace enquiry/booking flow.",
  ].join(" ");
}
