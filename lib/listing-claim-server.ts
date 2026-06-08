import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { renderEmailLayout } from "@/lib/email-templates/EmailLayout";
import {
  buildListingClaimedAdminCopy,
  buildListingClaimedOwnerCopy,
  buildListingClaimInviteCopy,
} from "@/lib/communication-copy";
import { getCanonicalPublicSiteUrl } from "@/lib/site-url";
import {
  hashClaimToken,
  isSpaceClaimable,
  type ClaimTokenRow,
  type ClaimableSpaceRow,
  OWNER_CLAIMED_STATUS,
  resolveClaimTokenStatus,
  type ListingClaimTokenStatus,
} from "@/lib/listing-claim-token";

export type AcceptClaimResult =
  | { ok: true; spaceId: string; listingTitle: string }
  | { ok: false; error: string; status: number };

export async function loadClaimTokenByRawToken(
  admin: SupabaseClient,
  rawToken: string
): Promise<{ token: ClaimTokenRow | null; error?: string }> {
  const tokenHash = hashClaimToken(rawToken);
  const { data, error } = await admin
    .from("listing_claim_tokens")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) return { token: null, error: error.message };
  if (!data) return { token: null, error: "Claim link not found." };
  return { token: data as ClaimTokenRow };
}

export async function expireClaimTokenIfNeeded(
  admin: SupabaseClient,
  token: ClaimTokenRow
): Promise<ListingClaimTokenStatus> {
  const status = resolveClaimTokenStatus(token);
  if (status === "expired" && token.status === "pending") {
    await admin
      .from("listing_claim_tokens")
      .update({ status: "expired" })
      .eq("id", token.id);
  }
  return status;
}

export async function validateClaimTokenForAccept(
  admin: SupabaseClient,
  rawToken: string
): Promise<
  | { ok: true; token: ClaimTokenRow; space: ClaimableSpaceRow }
  | { ok: false; error: string; status: number }
> {
  const { token, error } = await loadClaimTokenByRawToken(admin, rawToken);
  if (!token) {
    return { ok: false, error: error || "Claim link not found.", status: 404 };
  }

  const status = await expireClaimTokenIfNeeded(admin, token);
  if (status !== "pending") {
    return {
      ok: false,
      error: `This claim link is ${status}.`,
      status: 400,
    };
  }

  const { data: space, error: spaceErr } = await admin
    .from("spaces")
    .select(
      "id, title, description, city, suburb, space_type, status, owner_id, created_by_admin, claimed_at"
    )
    .eq("id", token.listing_id)
    .maybeSingle();

  if (spaceErr || !space) {
    return { ok: false, error: "Listing not found.", status: 404 };
  }

  const spaceRow = space as ClaimableSpaceRow;
  if (!isSpaceClaimable(spaceRow)) {
    return {
      ok: false,
      error: "This listing is no longer available to claim.",
      status: 400,
    };
  }

  return { ok: true, token, space: spaceRow };
}

export async function acceptListingClaim(
  admin: SupabaseClient,
  rawToken: string,
  userId: string
): Promise<AcceptClaimResult> {
  const validation = await validateClaimTokenForAccept(admin, rawToken);
  if (!validation.ok) {
    return { ok: false, error: validation.error, status: validation.status };
  }

  const { token, space } = validation;
  const nowIso = new Date().toISOString();

  const { error: spaceErr } = await admin
    .from("spaces")
    .update({
      owner_id: userId,
      claimed_at: nowIso,
      status: OWNER_CLAIMED_STATUS,
    })
    .eq("id", space.id)
    .is("owner_id", null);

  if (spaceErr) {
    return { ok: false, error: spaceErr.message, status: 500 };
  }

  const { error: tokenErr } = await admin
    .from("listing_claim_tokens")
    .update({
      status: "claimed",
      claimed_by: userId,
      used_at: nowIso,
    })
    .eq("id", token.id)
    .eq("status", "pending");

  if (tokenErr) {
    console.error("[listing-claim] token update failed after space claim", tokenErr);
    return { ok: false, error: tokenErr.message, status: 500 };
  }

  await admin
    .from("listing_claim_tokens")
    .update({
      status: "revoked",
      revoked_at: nowIso,
    })
    .eq("listing_id", space.id)
    .eq("status", "pending")
    .neq("id", token.id);

  const { error: profileErr } = await admin
    .from("profiles")
    .update({ is_host: true })
    .eq("id", userId);

  if (profileErr) {
    console.error("[listing-claim] is_host update failed", profileErr);
  }

  const listingTitle = space.title?.trim() || "Your listing";

  try {
    await notifyListingClaimed(admin, {
      spaceId: space.id,
      listingTitle,
      ownerUserId: userId,
      ownerEmail: token.owner_email,
    });
  } catch (err) {
    console.error("[listing-claim] notification failed", err);
  }

  return { ok: true, spaceId: space.id, listingTitle };
}

async function notifyListingClaimed(
  admin: SupabaseClient,
  params: {
    spaceId: string;
    listingTitle: string;
    ownerUserId: string;
    ownerEmail: string | null;
  }
) {
  const appBaseUrl = getCanonicalPublicSiteUrl();
  const adminUrl = `${appBaseUrl}/admin/unclaimed-listings/${params.spaceId}/edit`;

  const adminCopy = buildListingClaimedAdminCopy({
    listingTitle: params.listingTitle,
    ownerEmail: params.ownerEmail,
  });

  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (adminEmail) {
    const rendered = renderEmailLayout({
      preheader: adminCopy.emailPreheader,
      title: adminCopy.emailTitle,
      bodyLines: adminCopy.emailBodyLines,
      primaryCTA: { label: adminCopy.ctaLabel, href: adminUrl },
      footerRole: adminCopy.emailFooterRole,
    });
    await sendEmail({
      to: adminEmail,
      subject: adminCopy.emailSubject,
      html: rendered.html,
      text: rendered.text,
    });
  }

  const { data: admins } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "admin");

  for (const row of (admins as { id: string }[]) || []) {
    await admin.from("notifications").insert({
      user_id: row.id,
      role: "admin",
      type: "listing_claimed",
      title: adminCopy.notificationTitle,
      message: adminCopy.notificationMessage,
      href: `/admin/unclaimed-listings/${params.spaceId}/edit`,
      related_entity_type: "space",
      related_entity_id: params.spaceId,
      is_read: false,
    });
  }

  const ownerCopy = buildListingClaimedOwnerCopy({
    listingTitle: params.listingTitle,
  });

  await admin.from("notifications").insert({
    user_id: params.ownerUserId,
    role: "owner",
    type: "listing_claimed",
    title: ownerCopy.notificationTitle,
    message: ownerCopy.notificationMessage,
    href: `/dashboard/listings/${params.spaceId}/complete`,
    related_entity_type: "space",
    related_entity_id: params.spaceId,
    is_read: false,
  });
}

export async function sendListingClaimInviteEmail(params: {
  to: string;
  listingTitle: string;
  claimUrl: string;
}) {
  const copy = buildListingClaimInviteCopy({
    listingTitle: params.listingTitle,
    claimUrl: params.claimUrl,
  });

  const rendered = renderEmailLayout({
    preheader: copy.emailPreheader,
    title: copy.emailTitle,
    bodyLines: copy.emailBodyLines,
    primaryCTA: { label: copy.ctaLabel, href: params.claimUrl },
    footerRole: copy.emailFooterRole,
  });

  await sendEmail({
    to: params.to,
    subject: copy.emailSubject,
    html: rendered.html,
    text: rendered.text,
  });
}

export async function loadClaimPreview(
  admin: SupabaseClient,
  rawToken: string
) {
  const { token, error } = await loadClaimTokenByRawToken(admin, rawToken);
  if (!token) {
    return { valid: false as const, error: error || "Claim link not found." };
  }

  const status = await expireClaimTokenIfNeeded(admin, token);
  if (status !== "pending") {
    return { valid: false as const, error: `This claim link is ${status}.`, status };
  }

  const { data: space, error: spaceErr } = await admin
    .from("spaces")
    .select("id, title, description, city, suburb, space_type, status")
    .eq("id", token.listing_id)
    .maybeSingle();

  if (spaceErr || !space) {
    return { valid: false as const, error: "Listing not found." };
  }

  const spaceRow = space as ClaimableSpaceRow;
  if (!isSpaceClaimable(spaceRow)) {
    return {
      valid: false as const,
      error: "This listing is no longer available to claim.",
    };
  }

  const { data: images } = await admin
    .from("space_images")
    .select("image_url, sort_order")
    .eq("space_id", token.listing_id)
    .order("sort_order", { ascending: true })
    .limit(1);

  const cover =
    (images as { image_url: string }[] | null)?.[0]?.image_url ?? null;

  return {
    valid: true as const,
    listing: {
      id: spaceRow.id,
      title: spaceRow.title,
      description: spaceRow.description,
      city: spaceRow.city,
      suburb: spaceRow.suburb,
      space_type: spaceRow.space_type,
      cover_image_url: cover,
    },
    expires_at: token.expires_at,
  };
}
