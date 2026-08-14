import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import {
  listPropertyManagers,
  revokeSpaceManagerInvite,
} from "@/lib/space-manager-server";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;
  const { id, inviteId } = await params;
  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }
  const result = await revokeSpaceManagerInvite(admin, inviteId, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const list = await listPropertyManagers(admin, id);
  return NextResponse.json({ ok: true, ...list });
}
