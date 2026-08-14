import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import {
  inviteOrAssignSpaceManagers,
  listPropertyManagers,
} from "@/lib/space-manager-server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }
  try {
    const result = await listPropertyManagers(admin, id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load team." },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  let body: {
    email?: string;
    spaceIds?: string[];
    receiveNotifications?: boolean;
    sendEmail?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const result = await inviteOrAssignSpaceManagers(admin, {
    propertyId: id,
    actorUserId: auth.userId,
    email: body.email || "",
    spaceIds: Array.isArray(body.spaceIds) ? body.spaceIds : [],
    receiveNotifications: body.receiveNotifications,
    sendEmail: body.sendEmail,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const list = await listPropertyManagers(admin, id);
  return NextResponse.json({ ...result, ...list });
}
