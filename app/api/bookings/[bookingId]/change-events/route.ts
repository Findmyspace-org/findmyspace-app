import { NextRequest, NextResponse } from "next/server";
import { assertBookingRequirementAccess } from "@/lib/booking-requirement-access";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const auth = await requireAuthenticatedApi(req);
  if ("response" in auth) return auth.response;
  const { bookingId } = await params;
  if (!UUID_RE.test(bookingId)) {
    return NextResponse.json({ error: "Invalid booking id." }, { status: 400 });
  }
  try {
    await assertBookingRequirementAccess(auth.admin, auth.userId, bookingId);
  } catch {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const { data, error } = await auth.admin
    .from("booking_change_events")
    .select(
      "id, actor_role, change_scope, action, reason, before_values, after_values, financial_effect, agreement_status, notice_text, created_at"
    )
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ events: [] });
  }
  return NextResponse.json({ events: data ?? [] });
}
