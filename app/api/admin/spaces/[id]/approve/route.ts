import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminAudit } from "@/lib/admin-audit";
import { computeListingCompletion } from "@/lib/listing-completion";
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

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const completion = await computeListingCompletion(admin, id);
  if (!completion) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  if (completion.status !== "pending_verification" && completion.status !== "pending") {
    return NextResponse.json(
      { error: "Only listings pending verification can be approved." },
      { status: 400 }
    );
  }

  if (!completion.canApprove) {
    return NextResponse.json(
      {
        error:
          "Cannot approve until owner verification, bank verification, ownership proof, and listing content are complete.",
        approvalBlockers: completion.approvalBlockers,
      },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await admin
    .from("spaces")
    .update({
      status: "active",
      public_listing_mode: "live",
      approved_at: now,
      approved_by: auth.userId,
    })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await adminAudit({
    action: "listing_approved",
    actorUserId: auth.userId,
    targetType: "space",
    targetId: id,
  });

  await notifyListingReviewEvent({
    spaceId: id,
    eventType: "listing_activated",
  });

  return NextResponse.json({ ok: true, status: "active" });
}
