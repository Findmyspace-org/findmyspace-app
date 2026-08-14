import { NextRequest, NextResponse } from "next/server";
import { requireOwnerPropertyApi } from "@/lib/require-owner-property-api";
import {
  listPropertyManagers,
  removeManagerFromProperty,
  updateManagerAssignments,
} from "@/lib/space-manager-server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const { id, userId } = await params;
  const auth = await requireOwnerPropertyApi(req, id);
  if ("response" in auth) return auth.response;

  let body: { spaceIds?: string[]; receiveNotifications?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const result = await updateManagerAssignments(auth.admin, {
    propertyId: id,
    userId,
    spaceIds: Array.isArray(body.spaceIds) ? body.spaceIds : [],
    receiveNotifications: body.receiveNotifications,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const list = await listPropertyManagers(auth.admin, id);
  return NextResponse.json({ ok: true, ...list });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const { id, userId } = await params;
  const auth = await requireOwnerPropertyApi(req, id);
  if ("response" in auth) return auth.response;

  await removeManagerFromProperty(auth.admin, id, userId);
  const list = await listPropertyManagers(auth.admin, id);
  return NextResponse.json({ ok: true, ...list });
}
