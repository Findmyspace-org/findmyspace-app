import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { adminAudit } from "@/lib/admin-audit";
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
    return NextResponse.json({ error: "Invalid invite id." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const { data: invite, error: fetchErr } = await admin
    .from("property_owner_invites")
    .select("id, property_id, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !invite) {
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  }

  const row = invite as { id: string; property_id: string; status: string };
  if (row.status !== "pending") {
    return NextResponse.json(
      { error: `Invite is already ${row.status}.` },
      { status: 400 }
    );
  }

  const nowIso = new Date().toISOString();
  const { error: updateErr } = await admin
    .from("property_owner_invites")
    .update({ status: "revoked", revoked_at: nowIso })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await adminAudit({
    action: "property_owner_invite_revoked",
    actorUserId: auth.userId,
    targetType: "property",
    targetId: row.property_id,
    meta: { invite_id: id },
  });

  return NextResponse.json({ ok: true });
}
