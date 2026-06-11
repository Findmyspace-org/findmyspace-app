import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { renderEmailLayout } from "@/lib/email-templates/EmailLayout";
import { buildPropertyInviteCopy } from "@/lib/communication-copy";
import {
  buildPropertyInviteUrl,
  generatePropertyInviteToken,
  hashPropertyInviteToken,
  propertyInviteExpiresAt,
  publicPropertyInviteFields,
  resolvePropertyInviteStatus,
  type PropertyInviteRow,
  type PropertyInviteStatus,
} from "@/lib/property-invite-token";

export type CreatePropertyInviteResult =
  | {
      ok: true;
      inviteUrl: string;
      emailSent: boolean;
      token: ReturnType<typeof publicPropertyInviteFields>;
    }
  | { ok: false; error: string; status: number };

export type AcceptPropertyInviteResult =
  | { ok: true; propertyId: string; propertyName: string; spaceCount: number }
  | { ok: false; error: string; status: number };

export async function loadPropertyInviteByRawToken(
  admin: SupabaseClient,
  rawToken: string
): Promise<{ token: PropertyInviteRow | null; error?: string }> {
  const tokenHash = hashPropertyInviteToken(rawToken);
  const { data, error } = await admin
    .from("property_owner_invites")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) return { token: null, error: error.message };
  if (!data) return { token: null, error: "Invite link not found." };
  return { token: data as PropertyInviteRow };
}

export async function expirePropertyInviteIfNeeded(
  admin: SupabaseClient,
  token: PropertyInviteRow
): Promise<PropertyInviteStatus> {
  const status = resolvePropertyInviteStatus(token);
  if (status === "expired" && token.status === "pending") {
    await admin
      .from("property_owner_invites")
      .update({ status: "expired" })
      .eq("id", token.id);
  }
  return status;
}

export async function createPropertyOwnerInvite(
  admin: SupabaseClient,
  params: {
    propertyId: string;
    actorUserId: string;
    ownerEmail: string;
    sendEmail?: boolean;
    propertyName?: string | null;
    spaceCount?: number;
  }
): Promise<CreatePropertyInviteResult> {
  const ownerEmail = params.ownerEmail.trim();
  if (!ownerEmail.includes("@")) {
    return { ok: false, error: "Invalid owner email.", status: 400 };
  }

  const { data: property, error: propertyErr } = await admin
    .from("properties")
    .select("id, name, owner_id")
    .eq("id", params.propertyId)
    .maybeSingle();

  if (propertyErr || !property) {
    return { ok: false, error: "Property not found.", status: 404 };
  }

  const propertyRow = property as { id: string; name: string; owner_id: string | null };
  if (propertyRow.owner_id) {
    return {
      ok: false,
      error: "This property already has an owner.",
      status: 400,
    };
  }

  const nowIso = new Date().toISOString();
  await admin
    .from("property_owner_invites")
    .update({ status: "revoked", revoked_at: nowIso })
    .eq("property_id", params.propertyId)
    .eq("status", "pending");

  const rawToken = generatePropertyInviteToken();
  const tokenHash = hashPropertyInviteToken(rawToken);
  const expiresAt = propertyInviteExpiresAt(14);

  const { data: inserted, error: insertErr } = await admin
    .from("property_owner_invites")
    .insert({
      property_id: params.propertyId,
      token_hash: tokenHash,
      owner_email: ownerEmail,
      created_by: params.actorUserId,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("*")
    .single();

  if (insertErr || !inserted) {
    return {
      ok: false,
      error: insertErr?.message || "Could not create invite.",
      status: 500,
    };
  }

  await admin
    .from("properties")
    .update({ owner_email: ownerEmail, owner_invited_at: nowIso })
    .eq("id", params.propertyId);

  const inviteUrl = buildPropertyInviteUrl(rawToken);
  const propertyName =
    params.propertyName?.trim() || propertyRow.name?.trim() || "Your property";

  let spaceCount = params.spaceCount;
  if (spaceCount === undefined) {
    const { count } = await admin
      .from("spaces")
      .select("id", { count: "exact", head: true })
      .eq("property_id", params.propertyId);
    spaceCount = count ?? 0;
  }

  let emailSent = false;
  if (params.sendEmail) {
    try {
      await sendPropertyInviteEmail({
        to: ownerEmail,
        propertyName,
        spaceCount,
        inviteUrl,
      });
      emailSent = true;
    } catch (err) {
      console.error("[property-invite] invite email failed", err);
    }
  }

  return {
    ok: true,
    inviteUrl,
    emailSent,
    token: publicPropertyInviteFields(inserted as PropertyInviteRow),
  };
}

export async function sendPropertyInviteEmail(params: {
  to: string;
  propertyName: string;
  spaceCount: number;
  inviteUrl: string;
}) {
  const copy = buildPropertyInviteCopy({
    propertyName: params.propertyName,
    spaceCount: params.spaceCount,
    inviteUrl: params.inviteUrl,
  });

  const rendered = renderEmailLayout({
    preheader: copy.emailPreheader,
    title: copy.emailTitle,
    bodyLines: copy.emailBodyLines,
    primaryCTA: { label: copy.ctaLabel, href: params.inviteUrl },
    footerRole: copy.emailFooterRole,
  });

  await sendEmail({
    to: params.to,
    subject: copy.emailSubject,
    html: rendered.html,
    text: rendered.text,
  });
}

export async function loadPropertyInvitePreview(
  admin: SupabaseClient,
  rawToken: string
) {
  const { token, error } = await loadPropertyInviteByRawToken(admin, rawToken);
  if (!token) {
    return { valid: false as const, error: error || "Invite link not found." };
  }

  const status = await expirePropertyInviteIfNeeded(admin, token);
  if (status !== "pending") {
    return { valid: false as const, error: `This invite link is ${status}.`, status };
  }

  const { data: property, error: propertyErr } = await admin
    .from("properties")
    .select("id, name, description, owner_id")
    .eq("id", token.property_id)
    .maybeSingle();

  if (propertyErr || !property) {
    return { valid: false as const, error: "Property not found." };
  }

  const propertyRow = property as {
    id: string;
    name: string;
    description: string | null;
    owner_id: string | null;
  };

  if (propertyRow.owner_id) {
    return {
      valid: false as const,
      error: "This property already has an owner.",
    };
  }

  const { data: spaces } = await admin
    .from("spaces")
    .select("id, title")
    .eq("property_id", token.property_id)
    .order("title", { ascending: true });

  const spaceRows = (spaces as { id: string; title: string | null }[]) || [];

  return {
    valid: true as const,
    property: {
      id: propertyRow.id,
      name: propertyRow.name,
      description: propertyRow.description,
      space_count: spaceRows.length,
      spaces: spaceRows.map((s) => ({
        id: s.id,
        title: s.title?.trim() || "Untitled space",
      })),
    },
    expires_at: token.expires_at,
    owner_email: token.owner_email,
  };
}

export async function acceptPropertyInvite(
  admin: SupabaseClient,
  rawToken: string,
  userId: string
): Promise<AcceptPropertyInviteResult> {
  const { token, error } = await loadPropertyInviteByRawToken(admin, rawToken);
  if (!token) {
    return { ok: false, error: error || "Invite link not found.", status: 404 };
  }

  const status = await expirePropertyInviteIfNeeded(admin, token);
  if (status !== "pending") {
    return {
      ok: false,
      error: `This invite link is ${status}.`,
      status: 400,
    };
  }

  const { data: property, error: propertyErr } = await admin
    .from("properties")
    .select("id, name, owner_id")
    .eq("id", token.property_id)
    .maybeSingle();

  if (propertyErr || !property) {
    return { ok: false, error: "Property not found.", status: 404 };
  }

  const propertyRow = property as { id: string; name: string; owner_id: string | null };
  if (propertyRow.owner_id) {
    return {
      ok: false,
      error: "This property was already accepted by an owner.",
      status: 409,
    };
  }

  const nowIso = new Date().toISOString();

  const { data: updatedProperty, error: propertyUpdateErr } = await admin
    .from("properties")
    .update({
      owner_id: userId,
      owner_accepted_at: nowIso,
    })
    .eq("id", token.property_id)
    .is("owner_id", null)
    .select("id, name")
    .maybeSingle();

  if (propertyUpdateErr) {
    return { ok: false, error: propertyUpdateErr.message, status: 500 };
  }

  if (!updatedProperty) {
    return {
      ok: false,
      error: "This property was already accepted.",
      status: 409,
    };
  }

  const { data: childSpaces, error: spacesErr } = await admin
    .from("spaces")
    .select("id, owner_id, claimed_at, created_by_admin, status")
    .eq("property_id", token.property_id);

  if (spacesErr) {
    return { ok: false, error: spacesErr.message, status: 500 };
  }

  const spaces =
    (childSpaces as {
      id: string;
      owner_id: string | null;
      claimed_at: string | null;
      created_by_admin: boolean | null;
      status: string | null;
    }[]) || [];

  for (const space of spaces) {
    if (space.owner_id != null || !space.created_by_admin) {
      continue;
    }

    const patch: Record<string, unknown> = {
      owner_id: userId,
      status: "owner_claimed",
      claimed_at: nowIso,
    };

    const { error: spaceUpdateErr } = await admin
      .from("spaces")
      .update(patch)
      .eq("id", space.id)
      .is("owner_id", null)
      .eq("created_by_admin", true);

    if (spaceUpdateErr) {
      console.error("[property-invite] child space update failed", spaceUpdateErr);
      return { ok: false, error: spaceUpdateErr.message, status: 500 };
    }
  }

  const { data: acceptedToken, error: tokenErr } = await admin
    .from("property_owner_invites")
    .update({
      status: "accepted",
      accepted_by: userId,
      used_at: nowIso,
    })
    .eq("id", token.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (tokenErr) {
    console.error("[property-invite] token update failed after accept", tokenErr);
    return { ok: false, error: tokenErr.message, status: 500 };
  }

  if (!acceptedToken) {
    return {
      ok: false,
      error: "This invite link is no longer valid.",
      status: 409,
    };
  }

  await admin
    .from("property_owner_invites")
    .update({
      status: "revoked",
      revoked_at: nowIso,
    })
    .eq("property_id", token.property_id)
    .eq("status", "pending")
    .neq("id", token.id);

  const { error: profileErr } = await admin
    .from("profiles")
    .update({ is_host: true })
    .eq("id", userId);

  if (profileErr) {
    console.error("[property-invite] is_host update failed", profileErr);
  }

  return {
    ok: true,
    propertyId: propertyRow.id,
    propertyName: propertyRow.name?.trim() || "Your property",
    spaceCount: spaces.length,
  };
}
