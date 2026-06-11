import { NextRequest, NextResponse } from "next/server";
import { adminAudit } from "@/lib/admin-audit";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import { requireAdminApi } from "@/lib/require-admin-api";
import { validateAdminRestoreSpace } from "@/lib/space-archive";

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
    return NextResponse.json({ error: "Invalid space id." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const { data: before } = await admin
    .from("spaces")
    .select("archive_restore_status, archive_restore_public_listing_mode")
    .eq("id", id)
    .maybeSingle();

  const validation = await validateAdminRestoreSpace(admin, id);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { error: updateErr } = await admin
    .from("spaces")
    .update(validation.patch)
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const snapshot = before as {
    archive_restore_status?: string | null;
    archive_restore_public_listing_mode?: string | null;
  } | null;

  await adminAudit({
    action: "space_restored",
    actorUserId: auth.userId,
    targetType: "space",
    targetId: id,
    meta: {
      restored_to: validation.patch,
      previous_archive_snapshot: {
        status: snapshot?.archive_restore_status ?? null,
        public_listing_mode: snapshot?.archive_restore_public_listing_mode ?? null,
      },
    },
  });

  return NextResponse.json({
    ok: true,
    status: validation.patch.status,
    public_listing_mode: validation.patch.public_listing_mode,
  });
}
