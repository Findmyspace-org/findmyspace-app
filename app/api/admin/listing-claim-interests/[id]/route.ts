import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { adminAudit } from "@/lib/admin-audit";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import { LISTING_CLAIM_INTEREST_STATUSES } from "@/lib/listing-lifecycle";
import { createListingClaimLink } from "@/lib/listing-claim-server";
import { fetchSpaceCrmLinkSummary } from "@/lib/space-crm-link";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PatchBody = {
  status?: string;
  /** Generate secure claim link using claimant email. */
  sendClaimLink?: boolean;
  /** Generate link without sending email; returns claimUrl. */
  generateClaimLink?: boolean;
};

async function loadInterest(admin: ReturnType<typeof createServiceAdminClient>, id: string) {
  if (!admin) return { interest: null, error: "Server configuration error." };

  const { data, error } = await admin
    .from("listing_claim_interests")
    .select(
      `
      id,
      listing_id,
      name,
      email,
      phone,
      role,
      message,
      status,
      created_at,
      spaces (
        id,
        title,
        status,
        city,
        suburb,
        crm_organisation_id,
        crm_contact_id
      )
    `
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return { interest: null, error: error.message };
  if (!data) return { interest: null, error: "Claim interest not found." };
  return { interest: data, error: null };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const { interest, error } = await loadInterest(admin, id);
  if (error || !interest) {
    return NextResponse.json({ error: error || "Not found." }, { status: 404 });
  }

  const row = interest as unknown as {
    listing_id: string;
    spaces: {
      id: string;
      title: string | null;
      status: string | null;
      city: string | null;
      suburb: string | null;
      crm_organisation_id: string | null;
      crm_contact_id: string | null;
    } | null;
  };
  const spaceRow = Array.isArray(row.spaces) ? row.spaces[0] ?? null : row.spaces;

  const [{ data: tokens }, crmLink] = await Promise.all([
    admin
      .from("listing_claim_tokens")
      .select(
        "id, listing_id, owner_email, created_by, claimed_by, status, expires_at, used_at, revoked_at, created_at"
      )
      .eq("listing_id", row.listing_id)
      .order("created_at", { ascending: false }),
    row.spaces
      ? fetchSpaceCrmLinkSummary(admin, spaceRow ?? row.spaces)
      : Promise.resolve(null),
  ]);

  const tokenRows = ((tokens as Record<string, unknown>[]) || []).map((token) => ({
    ...token,
    status:
      token.status === "pending" &&
      token.expires_at &&
      new Date(token.expires_at as string).getTime() < Date.now()
        ? "expired"
        : token.status,
  }));

  return NextResponse.json({
    interest,
    crm_link: crmLink,
    claim_tokens: tokenRows,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    body.status &&
    !(LISTING_CLAIM_INTEREST_STATUSES as readonly string[]).includes(body.status)
  ) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const { interest, error: loadErr } = await loadInterest(admin, id);
  if (loadErr || !interest) {
    return NextResponse.json({ error: loadErr || "Not found." }, { status: 404 });
  }

  const interestRow = interest as unknown as {
    id: string;
    listing_id: string;
    email: string;
    status: string;
    spaces: { title: string | null } | { title: string | null }[] | null;
  };
  const listingTitle = Array.isArray(interestRow.spaces)
    ? interestRow.spaces[0]?.title
    : interestRow.spaces?.title;

  let claimUrl: string | null = null;
  let emailSent = false;

  if (body.sendClaimLink || body.generateClaimLink) {
    const linkResult = await createListingClaimLink(admin, {
      spaceId: interestRow.listing_id,
      actorUserId: auth.userId,
      ownerEmail: interestRow.email,
      sendEmail: Boolean(body.sendClaimLink),
      listingTitle,
    });

    if (!linkResult.ok) {
      return NextResponse.json(
        { error: linkResult.error },
        { status: linkResult.status }
      );
    }

    claimUrl = linkResult.claimUrl;
    emailSent = linkResult.emailSent;

    await adminAudit({
      action: "listing_claim_link_created",
      actorUserId: auth.userId,
      targetType: "listing_claim_interest",
      targetId: id,
      meta: {
        listing_id: interestRow.listing_id,
        token_id: linkResult.token.id,
        owner_email: interestRow.email,
        email_sent: emailSent,
        from_claim_interest: true,
      },
    });
  }

  const updates: Record<string, string> = {};
  if (body.status) {
    updates.status = body.status;
  } else if (body.sendClaimLink && emailSent) {
    updates.status = "claim_link_sent";
  } else if (body.sendClaimLink && !emailSent) {
    // Link generated but email failed — still mark as contacted if still new
    if (interestRow.status === "new") {
      updates.status = "contacted";
    }
  }

  let updated = interestRow;
  if (Object.keys(updates).length > 0) {
    const { data, error } = await admin
      .from("listing_claim_interests")
      .update(updates)
      .eq("id", id)
      .select("id, status")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    updated = { ...interestRow, status: (data as { status: string }).status };
  }

  return NextResponse.json({
    ok: true,
    interest: updated,
    claimUrl,
    emailSent,
  });
}
