import { NextRequest, NextResponse } from "next/server";
import { adminAudit } from "@/lib/admin-audit";
import {
  adminPublicListingModeAuditAction,
  validateAdminPublicListingModeChange,
} from "@/lib/admin-public-listing-mode";
import {
  PUBLIC_LISTING_MODES,
  type PublicListingMode,
} from "@/lib/public-listing-mode";
import { requireAdminApi } from "@/lib/require-admin-api";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";

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

  const body = await req.json().catch(() => ({}));
  const mode = body.mode as PublicListingMode;
  if (!PUBLIC_LISTING_MODES.includes(mode)) {
    return NextResponse.json(
      { error: "mode must be off, enquiry, or live." },
      { status: 400 }
    );
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const validation = await validateAdminPublicListingModeChange(admin, id, mode, {
    overrideNeedsChanges: Boolean(body.overrideNeedsChanges),
  });

  if (!validation.ok) {
    return NextResponse.json(
      {
        error: validation.error,
        blockers: validation.blockers,
      },
      { status: 400 }
    );
  }

  const { data: existing, error: fetchErr } = await admin
    .from("spaces")
    .select("status, approved_at")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  const previousStatus = (existing as { status: string | null }).status;

  const { error: updateErr } = await admin
    .from("spaces")
    .update(validation.patch)
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (
    mode === "live" &&
    validation.patch.status === "active" &&
    (previousStatus === "pending_verification" || previousStatus === "pending")
  ) {
    await admin
      .from("spaces")
      .update({
        approved_at: new Date().toISOString(),
        approved_by: auth.userId,
      })
      .eq("id", id);
  }

  await adminAudit({
    action: adminPublicListingModeAuditAction(mode),
    actorUserId: auth.userId,
    targetType: "space",
    targetId: id,
    meta: { mode, patch: validation.patch },
  });

  return NextResponse.json({
    ok: true,
    public_listing_mode: validation.patch.public_listing_mode,
    status: validation.patch.status,
  });
}
