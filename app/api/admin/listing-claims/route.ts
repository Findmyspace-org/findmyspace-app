import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { adminAudit } from "@/lib/admin-audit";
import {
  createServiceAdminClient,
  fetchAdminCreatedListing,
} from "@/lib/admin-unclaimed-space";
import {
  buildListingClaimUrl,
  claimTokenExpiresAt,
  generateClaimToken,
  hashClaimToken,
  isSpaceClaimable,
  type ClaimableSpaceRow,
} from "@/lib/listing-claim-token";
import { sendListingClaimInviteEmail } from "@/lib/listing-claim-server";

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

type CreateBody = {
  spaceId?: string;
  ownerEmail?: string | null;
  sendEmail?: boolean;
};

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

  const ownerEmail = body.ownerEmail?.trim() || null;
  if (ownerEmail && !ownerEmail.includes("@")) {
    return NextResponse.json({ error: "Invalid owner email." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const { space, error: spaceErr } = await fetchAdminCreatedListing(admin, spaceId, {
    allowOwnerClaimed: false,
  });
  if (spaceErr || !space) {
    return NextResponse.json({ error: spaceErr || "Listing not found." }, { status: 404 });
  }

  const spaceRow = space as ClaimableSpaceRow;
  if (!isSpaceClaimable(spaceRow)) {
    return NextResponse.json(
      { error: "Listing must be draft or unclaimed with no owner to generate a claim link." },
      { status: 400 }
    );
  }

  const nowIso = new Date().toISOString();
  await admin
    .from("listing_claim_tokens")
    .update({ status: "revoked", revoked_at: nowIso })
    .eq("listing_id", spaceId)
    .eq("status", "pending");

  const rawToken = generateClaimToken();
  const tokenHash = hashClaimToken(rawToken);
  const expiresAt = claimTokenExpiresAt(14);

  const { data: inserted, error: insertErr } = await admin
    .from("listing_claim_tokens")
    .insert({
      listing_id: spaceId,
      token_hash: tokenHash,
      owner_email: ownerEmail,
      created_by: auth.userId,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id, listing_id, owner_email, status, expires_at, created_at")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: insertErr?.message || "Could not create claim token." },
      { status: 500 }
    );
  }

  await admin
    .from("spaces")
    .update({ owner_invited_at: nowIso })
    .eq("id", spaceId);

  const claimUrl = buildListingClaimUrl(rawToken);
  const listingTitle = spaceRow.title?.trim() || "Your listing";

  let emailSent = false;
  if (body.sendEmail && ownerEmail) {
    try {
      await sendListingClaimInviteEmail({
        to: ownerEmail,
        listingTitle,
        claimUrl,
      });
      emailSent = true;
    } catch (err) {
      console.error("[listing-claims] invite email failed", err);
    }
  }

  await adminAudit({
    action: "listing_claim_link_created",
    actorUserId: auth.userId,
    targetType: "space",
    targetId: spaceId,
    meta: {
      token_id: (inserted as { id: string }).id,
      owner_email: ownerEmail,
      email_sent: emailSent,
    },
  });

  return NextResponse.json({
    ok: true,
    claimUrl,
    emailSent,
    token: inserted,
  });
}
