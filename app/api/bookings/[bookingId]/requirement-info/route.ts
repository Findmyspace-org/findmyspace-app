import { NextRequest, NextResponse } from "next/server";
import { assertBookingRequirementAccess } from "@/lib/booking-requirement-access";
import {
  contactDetailsAllowedForRequirementViewer,
  sanitizeRequirementResponsesForViewer,
} from "@/lib/booking-requirement-display";
import { resolveBookingRequirementFileUrl } from "@/lib/booking-requirement-storage";
import { bookingTermsAcceptanceFromRow } from "@/lib/property-booking-terms";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";
import type { BookingRequirementResponseRow } from "@/lib/space-booking-requirement-fields";

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

  let access;
  try {
    access = await assertBookingRequirementAccess(auth.admin, auth.userId, bookingId);
  } catch {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { data: booking, error: bookingErr } = await auth.admin
    .from("bookings")
    .select(
      "id, status, payment_status, terms_accepted, terms_accepted_at, accepted_terms_updated_at, accepted_terms_title, accepted_terms_label"
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingErr || !booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const { data: responseRows, error: responsesErr } = await auth.admin
    .from("booking_requirement_responses")
    .select(
      "id, booking_id, space_id, field_id, field_label_snapshot, field_type_snapshot, value, file_url, file_path, created_at"
    )
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });

  if (responsesErr) {
    return NextResponse.json({ error: responsesErr.message }, { status: 500 });
  }

  const responses: BookingRequirementResponseRow[] = [];
  for (const row of (responseRows || []) as BookingRequirementResponseRow[]) {
    const signedFileUrl =
      row.field_type_snapshot === "file_upload"
        ? await resolveBookingRequirementFileUrl(
            auth.admin,
            (row as { file_path?: string | null }).file_path ?? null,
            row.file_url
          )
        : null;

    responses.push({
      ...row,
      signed_file_url: signedFileUrl,
    } as BookingRequirementResponseRow & { signed_file_url?: string | null });
  }

  const bookingRow = booking as {
    status: string | null;
    payment_status: string | null;
  };
  const allowContactDetails = contactDetailsAllowedForRequirementViewer(bookingRow, access);
  const safeResponses = sanitizeRequirementResponsesForViewer(responses, allowContactDetails);

  return NextResponse.json({
    terms: bookingTermsAcceptanceFromRow(booking as Record<string, unknown>),
    responses: safeResponses,
    contactDetailsRedacted: !allowContactDetails,
  });
}
