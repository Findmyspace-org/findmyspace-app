import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";
import {
  createBookingRequestServer,
  type BookingRequestPayload,
} from "@/lib/booking-request-server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedApi(req);
  if ("response" in auth) return auth.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const payloadRaw = form.get("payload");
  if (typeof payloadRaw !== "string" || !payloadRaw.trim()) {
    return NextResponse.json({ error: "Missing booking payload." }, { status: 400 });
  }

  let payload: BookingRequestPayload;
  try {
    payload = JSON.parse(payloadRaw) as BookingRequestPayload;
  } catch {
    return NextResponse.json({ error: "Invalid booking payload JSON." }, { status: 400 });
  }

  const filesByFieldId = new Map<string, File>();
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("file_")) continue;
    if (!(value instanceof File) || value.size === 0) continue;
    const fieldId = key.slice("file_".length);
    if (fieldId) filesByFieldId.set(fieldId, value);
  }

  try {
    const result = await createBookingRequestServer(
      auth.admin,
      auth.userId,
      payload,
      filesByFieldId
    );
    return NextResponse.json({ bookingId: result.bookingId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create booking request.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
