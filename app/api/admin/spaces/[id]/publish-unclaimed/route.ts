import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { adminAudit } from "@/lib/admin-audit";
import {
  createServiceAdminClient,
  fetchAdminUnclaimedSpace,
  validateReadyToPublishUnclaimed,
} from "@/lib/admin-unclaimed-space";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  const existing = await fetchAdminUnclaimedSpace(admin, id);
  if (existing.error || !existing.space) {
    return NextResponse.json({ error: existing.error || "Not found." }, { status: 404 });
  }

  const validation = await validateReadyToPublishUnclaimed(admin, id);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { error: updateErr } = await admin
    .from("spaces")
    .update({
      status: "unclaimed",
      public_listing_mode: "enquiry",
      owner_id: null,
      created_by_admin: true,
    })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await adminAudit({
    action: "unclaimed_listing_published",
    actorUserId: auth.userId,
    targetType: "space",
    targetId: id,
  });

  return NextResponse.json({ ok: true, status: "unclaimed" });
}
