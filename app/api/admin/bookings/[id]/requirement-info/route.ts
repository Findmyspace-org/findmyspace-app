import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { createClient } from "@supabase/supabase-js";
import { contactDetailsAllowedForRequirementViewer, sanitizeRequirementResponsesForViewer } from "@/lib/booking-requirement-display";
import { resolveBookingRequirementFileUrl } from "@/lib/booking-requirement-storage";
import { bookingTermsAcceptanceFromRow } from "@/lib/property-booking-terms";
import type { BookingRequirementResponseRow } from "@/lib/space-booking-requirement-fields";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id: bookingId } = await params;
  if (!UUID_RE.test(bookingId)) {
    return NextResponse.json({ error: "Invalid booking id." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select(
      "id, status, payment_status, terms_accepted, terms_accepted_at, accepted_terms_updated_at, accepted_terms_title, accepted_terms_label"
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingErr || !booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const { data: responseRows, error: responsesErr } = await admin
    .from("booking_requirement_responses")
    .select(
      "id, booking_id, space_id, field_id, field_label_snapshot, field_type_snapshot, value, file_url, file_path, created_at"
    )
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });

  if (responsesErr) {
    return NextResponse.json({ error: responsesErr.message }, { status: 500 });
  }

  const responses: Array<BookingRequirementResponseRow & { signed_file_url?: string | null }> =
    [];
  for (const row of (responseRows || []) as Array<
    BookingRequirementResponseRow & { file_path?: string | null }
  >) {
    const signedFileUrl =
      row.field_type_snapshot === "file_upload"
        ? await resolveBookingRequirementFileUrl(admin, row.file_path ?? null, row.file_url)
        : null;
    responses.push({ ...row, signed_file_url: signedFileUrl });
  }

  const bookingRow = booking as {
    status: string | null;
    payment_status: string | null;
  };
  const allowContactDetails = contactDetailsAllowedForRequirementViewer(
    bookingRow,
    "platform_admin"
  );
  const safeResponses = sanitizeRequirementResponsesForViewer(responses, allowContactDetails);

  return NextResponse.json({
    terms: bookingTermsAcceptanceFromRow(booking as Record<string, unknown>),
    responses: safeResponses,
    contactDetailsRedacted: !allowContactDetails,
  });
}
