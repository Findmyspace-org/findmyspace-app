import { NextRequest, NextResponse } from "next/server";
import { assertBookingRequirementAccess } from "@/lib/booking-requirement-access";
import { recordBookingChangeNotice } from "@/lib/booking-change-notice";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const auth = await requireAuthenticatedApi(req);
  if ("response" in auth) return auth.response;
  const { bookingId } = await params;
  if (!UUID_RE.test(bookingId)) {
    return NextResponse.json({ error: "Invalid booking id." }, { status: 400 });
  }

  let access: string;
  try {
    access = await assertBookingRequirementAccess(auth.admin, auth.userId, bookingId);
  } catch {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    action?: string;
    scope?: string;
    occurrenceId?: string | null;
    newStart?: string | null;
    newEnd?: string | null;
    reason?: string | null;
    frequency?: string | null;
    weekdays?: number[] | null;
    localStart?: string | null;
    localEnd?: string | null;
    startsOn?: string | null;
    endsOn?: string | null;
    excludedDates?: string[] | null;
  } | null;
  if (!body?.action || !body.scope) {
    return NextResponse.json({ error: "Choose what to change." }, { status: 400 });
  }

  const { data, error } = await auth.admin.rpc("manage_recurring_booking", {
    p_booking_id: bookingId,
    p_occurrence_id: body.occurrenceId ?? null,
    p_action: body.action,
    p_scope: body.scope,
    p_new_start: body.newStart ?? null,
    p_new_end: body.newEnd ?? null,
    p_actor: auth.userId,
    p_actor_role: access === "renter" ? "renter" : "manager",
    p_reason: body.reason ?? null,
    p_frequency: body.frequency ?? null,
    p_weekdays: body.weekdays ?? null,
    p_local_start: body.localStart ?? null,
    p_local_end: body.localEnd ?? null,
    p_starts_on: body.startsOn ?? null,
    p_ends_on: body.endsOn ?? null,
    p_excluded: body.excludedDates ?? null,
  });
  if (error) {
    const message = error.message || "Could not change the booking.";
    const status = message.includes("not authorized") ? 403 : 409;
    return NextResponse.json({ error: message.replace(/^.*?:\s*/, "") }, { status });
  }
  const result = (data || {}) as { change_request_id?: string };
  if (result.change_request_id) {
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
        type: "booking_change_proposed",
        title: "A host proposed a new time",
        message:
          "A host proposed moving a paid session. The original time stays reserved until you accept the new time.",
        href: "/dashboard/my-bookings",
        relatedId: result.change_request_id,
      });
    }
  }
  return NextResponse.json(data);
}
