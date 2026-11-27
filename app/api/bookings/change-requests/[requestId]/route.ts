import { NextRequest, NextResponse } from "next/server";
import { recordBookingChangeNotice } from "@/lib/booking-change-notice";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const auth = await requireAuthenticatedApi(req);
  if ("response" in auth) return auth.response;
  const { requestId } = await params;
  if (!UUID_RE.test(requestId)) {
    return NextResponse.json({ error: "Invalid change." }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as { accept?: boolean; withdraw?: boolean } | null;
  if (body?.withdraw) {
    const { data, error } = await auth.admin.rpc("withdraw_booking_change_request", {
      p_request_id: requestId,
      p_actor: auth.userId,
    });
    if (error) {
      return NextResponse.json(
        { error: (error.message || "Could not withdraw the change.").replace(/^.*?:\s*/, "") },
        { status: 409 }
      );
    }
    const { data: change } = await auth.admin
      .from("booking_change_requests")
      .select("booking_id")
      .eq("id", requestId)
      .maybeSingle();
    const bookingId = (change as { booking_id?: string } | null)?.booking_id;
    if (bookingId) {
      const { data: booking } = await auth.admin
        .from("bookings")
        .select("renter_id")
        .eq("id", bookingId)
        .maybeSingle();
      const renterId = (booking as { renter_id?: string | null } | null)?.renter_id;
      if (renterId) {
        await recordBookingChangeNotice(auth.admin, {
          userId: renterId,
          role: "renter",
          type: "booking_change_withdrawn",
          title: "A proposed time change was withdrawn",
          message: "The host withdrew the proposed move. The original time stays reserved.",
          href: "/dashboard/my-bookings",
          relatedId: requestId,
        });
      }
    }
    return NextResponse.json(data);
  }

  const { data, error } = await auth.admin.rpc("decide_booking_change_request", {
    p_request_id: requestId,
    p_actor: auth.userId,
    p_accept: Boolean(body?.accept),
  });
  if (error) {
    return NextResponse.json(
      { error: (error.message || "Could not decide the change.").replace(/^.*?:\s*/, "") },
      { status: 409 }
    );
  }
  const { data: change } = await auth.admin
    .from("booking_change_requests")
    .select("status, requested_by")
    .eq("id", requestId)
    .maybeSingle();
  const row = change as { status?: string; requested_by?: string | null } | null;
  if (row?.requested_by && row.status === "accepted") {
    await recordBookingChangeNotice(auth.admin, {
      userId: row.requested_by,
      role: "host",
      type: "booking_change_accepted",
      title: "The renter accepted the new time",
      message: "The renter accepted the move. The paid amount is unchanged.",
      href: "/dashboard/calendar",
      relatedId: requestId,
    });
  }
  if (row?.requested_by && row.status === "declined") {
    await recordBookingChangeNotice(auth.admin, {
      userId: row.requested_by,
      role: "host",
      type: "booking_change_declined",
      title: "The renter declined the new time",
      message: "The renter declined the move. The original time stays reserved.",
      href: "/dashboard/calendar",
      relatedId: requestId,
    });
  }
  if (row?.status === "expired") {
    await recordBookingChangeNotice(auth.admin, {
      userId: auth.userId,
      role: "renter",
      type: "booking_change_expired",
      title: "A proposed time change expired",
      message: "The proposal expired. The original time stays reserved.",
      href: "/dashboard/my-bookings",
      relatedId: requestId,
    });
  }
  return NextResponse.json(data);
}
