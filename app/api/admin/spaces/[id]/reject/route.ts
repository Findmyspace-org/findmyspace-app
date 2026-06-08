import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminAudit } from "@/lib/admin-audit";
import { notifyListingReviewEvent } from "@/lib/listing-review-notify";
import { requireAdminApi } from "@/lib/require-admin-api";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createServiceAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid listing id." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  if (!comment) {
    return NextResponse.json(
      { error: "An admin comment is required when rejecting a listing." },
      { status: 400 }
    );
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const { data: space, error: fetchErr } = await admin
    .from("spaces")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !space) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  const status = (space as { status: string | null }).status;
  if (status !== "pending_verification" && status !== "pending") {
    return NextResponse.json(
      { error: "Only listings pending verification can be rejected." },
      { status: 400 }
    );
  }

  const { error: updateErr } = await admin
    .from("spaces")
    .update({
      status: "rejected",
      listing_admin_comment: comment,
    })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await adminAudit({
    action: "listing_rejected",
    actorUserId: auth.userId,
    targetType: "space",
    targetId: id,
    reason: comment,
  });

  await notifyListingReviewEvent({
    spaceId: id,
    eventType: "listing_rejected",
    adminComment: comment,
  });

  return NextResponse.json({ ok: true, status: "rejected" });
}
