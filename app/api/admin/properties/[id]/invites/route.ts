import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { adminAudit } from "@/lib/admin-audit";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import { createPropertyOwnerInvite } from "@/lib/property-invite-server";
import { resolvePropertyInviteStatus } from "@/lib/property-invite-token";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id: propertyId } = await params;
  if (!UUID_RE.test(propertyId)) {
    return NextResponse.json({ error: "Invalid property id." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const { data: invites, error } = await admin
    .from("property_owner_invites")
    .select(
      "id, property_id, owner_email, created_by, accepted_by, status, expires_at, used_at, revoked_at, created_at"
    )
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = ((invites || []) as Record<string, unknown>[]).map((row) => ({
    ...row,
    status: resolvePropertyInviteStatus({
      status: row.status as string,
      expires_at: row.expires_at as string,
    }),
  }));

  const { data: property } = await admin
    .from("properties")
    .select("owner_id, owner_accepted_at, owner_invited_at, owner_email")
    .eq("id", propertyId)
    .maybeSingle();

  return NextResponse.json({ invites: rows, property: property ?? null });
}

type CreateBody = {
  ownerEmail?: string;
  sendEmail?: boolean;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id: propertyId } = await params;
  if (!UUID_RE.test(propertyId)) {
    return NextResponse.json({ error: "Invalid property id." }, { status: 400 });
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const ownerEmail = body.ownerEmail?.trim();
  if (!ownerEmail) {
    return NextResponse.json({ error: "ownerEmail is required." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const { data: property } = await admin
    .from("properties")
    .select("name")
    .eq("id", propertyId)
    .maybeSingle();

  const result = await createPropertyOwnerInvite(admin, {
    propertyId,
    actorUserId: auth.userId,
    ownerEmail,
    sendEmail: body.sendEmail !== false,
    propertyName: (property as { name?: string } | null)?.name,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await adminAudit({
    action: "property_owner_invite_sent",
    actorUserId: auth.userId,
    targetType: "property",
    targetId: propertyId,
    meta: { owner_email: ownerEmail, email_sent: result.emailSent },
  });

  return NextResponse.json({
    inviteUrl: result.inviteUrl,
    emailSent: result.emailSent,
    token: result.token,
  });
}
