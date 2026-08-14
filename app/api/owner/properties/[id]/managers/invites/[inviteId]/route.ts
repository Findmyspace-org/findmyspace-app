import { NextRequest, NextResponse } from "next/server";
import { requireOwnerPropertyApi } from "@/lib/require-owner-property-api";
import {
  listPropertyManagers,
  revokeSpaceManagerInvite,
} from "@/lib/space-manager-server";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  const { id, inviteId } = await params;
  const auth = await requireOwnerPropertyApi(req, id);
  if ("response" in auth) return auth.response;

  const result = await revokeSpaceManagerInvite(auth.admin, inviteId, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const list = await listPropertyManagers(auth.admin, id);
  return NextResponse.json({ ok: true, ...list });
}
