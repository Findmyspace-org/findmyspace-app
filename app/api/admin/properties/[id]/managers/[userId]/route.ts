import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import {
  listPropertyManagers,
  removeManagerFromProperty,
  updateManagerAssignments,
} from "@/lib/space-manager-server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;
  const { id, userId } = await params;
  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  let body: { spaceIds?: string[]; receiveNotifications?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const result = await updateManagerAssignments(admin, {
    propertyId: id,
    userId,
    spaceIds: Array.isArray(body.spaceIds) ? body.spaceIds : [],
    receiveNotifications: body.receiveNotifications,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const list = await listPropertyManagers(admin, id);
  return NextResponse.json({ ok: true, ...list });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;
  const { id, userId } = await params;
  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }
  await removeManagerFromProperty(admin, id, userId);
  const list = await listPropertyManagers(admin, id);
  return NextResponse.json({ ok: true, ...list });
}
