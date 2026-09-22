import type { SupabaseClient } from "@supabase/supabase-js";
import { isListingLiveForExistingBookings } from "@/lib/listing-lifecycle";
import {
  bookingRangesOverlap,
  canHostRespondToStatus,
  HOST_PENDING_STATUSES,
} from "@/lib/booking-range-overlap";

export const AUTO_DECLINE_OVERLAP_MESSAGE =
  "Your booking request was declined because another overlapping booking was approved for this space. Thank you for your interest. Please try another date.";

export const STALE_HOST_RESPONSE_MESSAGE =
  "This booking has already been responded to.";

export type HostResponseAction = "approve" | "decline";

export function buildHostResponsePatch(
  action: HostResponseAction,
  actorUserId: string,
  message: string | null,
  nowIso: string
): Record<string, unknown> {
  if (action === "approve") {
    return {
      status: "accepted_awaiting_payment",
      payment_status: "awaiting_payment",
      owner_response_at: nowIso,
      owner_response_by: actorUserId,
      owner_response_message: message,
    };
  }
  return {
    status: "declined",
    payment_status: "unpaid",
    owner_response_at: nowIso,
    owner_response_by: actorUserId,
    owner_response_message: message,
  };
}

export function buildOverlapAutoDeclinePatch(nowIso: string): Record<string, unknown> {
  return {
    status: "declined",
    payment_status: "unpaid",
    owner_response_at: nowIso,
    owner_response_by: null,
    owner_response_message: AUTO_DECLINE_OVERLAP_MESSAGE,
  };
}

type BookingRow = {
  id: string;
  space_id: string;
  renter_id: string;
  owner_id: string | null;
  booking_unit: string | null;
  start_at: string;
  end_at: string;
  status: string | null;
  payment_status: string | null;
};

function parseCompetingIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const raw = (payload as { competing_ids?: unknown }).competing_ids;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string" && id.length > 0);
}

export async function applyHostBookingResponse(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    actorUserId: string;
    action: HostResponseAction;
    message: string | null;
  }
): Promise<{
  booking: BookingRow;
  competingDeclinedIds: string[];
}> {
  const { data: booking, error } = await admin
    .from("bookings")
    .select(
      "id, space_id, renter_id, owner_id, booking_unit, start_at, end_at, status, payment_status"
    )
    .eq("id", params.bookingId)
    .maybeSingle();

  if (error || !booking) {
    throw new Error("Booking not found.");
  }

  const row = booking as BookingRow;
  if (!canHostRespondToStatus(row.status)) {
    throw new Error(STALE_HOST_RESPONSE_MESSAGE);
  }

  const message = params.message?.trim() || null;
  let spaceUnit: string | null = null;

  if (params.action === "approve") {
    const { data: space } = await admin
      .from("spaces")
      .select("status, public_listing_mode, booking_unit")
      .eq("id", row.space_id)
      .maybeSingle();

    if (
      !isListingLiveForExistingBookings(
        space as {
          status: string | null;
          public_listing_mode: string | null;
        } | null
      )
    ) {
      throw new Error(
        "This listing is not active. Approve the listing before accepting bookings."
      );
    }
    spaceUnit =
      (space as { booking_unit?: string | null } | null)?.booking_unit ?? null;
  }

  const { data: rpcData, error: rpcError } = await admin.rpc(
    "apply_host_booking_response",
    {
      p_booking_id: params.bookingId,
      p_actor_id: params.actorUserId,
      p_action: params.action,
      p_message: message,
    }
  );

  if (rpcError) {
    const raw = rpcError.message || "Could not update booking.";
    if (raw.includes("already been responded to")) {
      throw new Error(STALE_HOST_RESPONSE_MESSAGE);
    }
    throw new Error(raw);
  }

  let competingDeclinedIds = parseCompetingIds(rpcData);

  if (params.action === "approve") {
    const unit = row.booking_unit || spaceUnit;

    const { data: pending } = await admin
      .from("bookings")
      .select("id, renter_id, booking_unit, start_at, end_at")
      .eq("space_id", row.space_id)
      .in("status", [...HOST_PENDING_STATUSES])
      .neq("id", row.id);

    const extraCompeting = ((pending || []) as Array<{
      id: string;
      renter_id: string;
      booking_unit: string | null;
      start_at: string;
      end_at: string;
    }>).filter((existing) =>
      bookingRangesOverlap(
        unit,
        row.start_at,
        row.end_at,
        existing.booking_unit,
        existing.start_at,
        existing.end_at
      )
    );

    const extraIds = extraCompeting
      .map((item) => item.id)
      .filter((id) => !competingDeclinedIds.includes(id));

    if (extraIds.length > 0) {
      const nowIso = new Date().toISOString();
      await admin
        .from("bookings")
        .update(buildOverlapAutoDeclinePatch(nowIso))
        .in("id", extraIds)
        .in("status", [...HOST_PENDING_STATUSES]);
      competingDeclinedIds = [...competingDeclinedIds, ...extraIds];
    }
  }

  if (params.action === "approve" && competingDeclinedIds.length > 0) {
    const { data: declinedBookings } = await admin
      .from("bookings")
      .select("id, renter_id")
      .in("id", competingDeclinedIds);

    const renterById = new Map(
      ((declinedBookings || []) as Array<{ id: string; renter_id: string }>).map(
        (item) => [item.id, item.renter_id]
      )
    );

    const messages = competingDeclinedIds
      .map((id) => {
        const renterId = renterById.get(id);
        if (!renterId) return null;
        return {
          booking_id: id,
          sender_id: params.actorUserId,
          recipient_id: renterId,
          message: AUTO_DECLINE_OVERLAP_MESSAGE,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    if (messages.length > 0) {
      await admin.from("booking_messages").insert(messages);
    }
  }

  const { data: updated } = await admin
    .from("bookings")
    .select(
      "id, space_id, renter_id, owner_id, booking_unit, start_at, end_at, status, payment_status"
    )
    .eq("id", row.id)
    .single();

  return {
    booking: (updated || row) as BookingRow,
    competingDeclinedIds,
  };
}
