import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { adminAudit } from "@/lib/admin-audit";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import { createListingClaimLink } from "@/lib/listing-claim-server";

type CreateBody = {
  spaceId?: string;
  ownerEmail?: string | null;
  sendEmail?: boolean;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const spaceId = req.nextUrl.searchParams.get("spaceId")?.trim();
  if (!spaceId || !UUID_RE.test(spaceId)) {
    return NextResponse.json({ error: "spaceId is required." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const { data: tokens, error } = await admin
    .from("listing_claim_tokens")
    .select(
      "id, listing_id, owner_email, created_by, claimed_by, status, expires_at, used_at, revoked_at, created_at"
    )
    .eq("listing_id", spaceId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = ((tokens as Record<string, unknown>[]) || []).map((row) => ({
    ...row,
    status:
      row.status === "pending" &&
      row.expires_at &&
      new Date(row.expires_at as string).getTime() < Date.now()
        ? "expired"
        : row.status,
  }));

  const { data: space } = await admin
    .from("spaces")
    .select("claimed_at, owner_id, status")
    .eq("id", spaceId)
    .maybeSingle();

  return NextResponse.json({ tokens: rows, space: space ?? null });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const spaceId = body.spaceId?.trim();
  if (!spaceId || !UUID_RE.test(spaceId)) {
    return NextResponse.json({ error: "spaceId is required." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const result = await createListingClaimLink(admin, {
    spaceId,
    actorUserId: auth.userId,
    ownerEmail: body.ownerEmail,
    sendEmail: body.sendEmail,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await adminAudit({
    action: "listing_claim_link_created",
    actorUserId: auth.userId,
    targetType: "space",
    targetId: spaceId,
    meta: {
      token_id: result.token.id,
      owner_email: body.ownerEmail?.trim() || null,
      email_sent: result.emailSent,
    },
  });

  return NextResponse.json({
    ok: true,
    claimUrl: result.claimUrl,
    emailSent: result.emailSent,
    token: result.token,
  });
}
