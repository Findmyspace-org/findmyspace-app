import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminAudit } from "@/lib/admin-audit";
import { isLiveListingStatus } from "@/lib/admin-listing-routing";
import { requireAdminApi } from "@/lib/require-admin-api";
import { notifyListingReviewEvent } from "@/lib/listing-review-notify";

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
  const nextStatus = body.status === "paused" ? "paused" : "active";

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

  const currentStatus = (space as { status: string | null }).status;
  if (!isLiveListingStatus(currentStatus) && !isLiveListingStatus(nextStatus)) {
    return NextResponse.json(
      {
        error:
          "Live status changes are only allowed for active or paused listings. Use listing review for approval.",
      },
      { status: 400 }
    );
  }

  if (!isLiveListingStatus(currentStatus)) {
    return NextResponse.json(
      {
        error:
          "This listing is not live yet. Approve it from the listing review queue first.",
      },
      { status: 400 }
    );
  }

  const { error: updateErr } = await admin
    .from("spaces")
    .update({ status: nextStatus })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await adminAudit({
    action: nextStatus === "paused" ? "listing_paused" : "listing_resumed",
    actorUserId: auth.userId,
    targetType: "space",
    targetId: id,
  });

  if (nextStatus === "active" && currentStatus === "paused") {
    await notifyListingReviewEvent({
      spaceId: id,
      eventType: "listing_activated",
    });
  }

  return NextResponse.json({ ok: true, status: nextStatus });
}
