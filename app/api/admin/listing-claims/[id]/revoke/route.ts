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
    return NextResponse.json({ error: "Invalid token id." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const { data: token, error: fetchErr } = await admin
    .from("listing_claim_tokens")
    .select("id, listing_id, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !token) {
    return NextResponse.json({ error: "Token not found." }, { status: 404 });
  }

  const row = token as { id: string; listing_id: string; status: string };
  if (row.status !== "pending") {
    return NextResponse.json(
      { error: `Token is already ${row.status}.` },
      { status: 400 }
    );
  }

  const nowIso = new Date().toISOString();
  const { error: updateErr } = await admin
    .from("listing_claim_tokens")
    .update({ status: "revoked", revoked_at: nowIso })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await adminAudit({
    action: "listing_claim_link_revoked",
    actorUserId: auth.userId,
    targetType: "space",
    targetId: row.listing_id,
    meta: { token_id: id },
  });

  return NextResponse.json({ ok: true });
}
