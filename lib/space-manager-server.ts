import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { renderEmailLayout } from "@/lib/email-templates/EmailLayout";
import { buildSpaceManagerInviteCopy } from "@/lib/communication-copy";
import { isPlatformAdminUser } from "@/lib/host-managed-spaces";
import {
  canManagePropertyUsers,
  canManageSpace,
  canViewProperty,
} from "@/lib/space-access";
import {
  buildSpaceManagerInviteUrl,
  generateSpaceManagerInviteToken,
  hashSpaceManagerInviteToken,
  isSpaceManagerInviteExpired,
  spaceManagerInviteExpiresAt,
} from "@/lib/space-manager-token";

export type PropertyAccessSnapshot = {
  propertyId: string;
  propertyOwnerId: string | null;
  propertyName: string;
  assignedSpaceIdsOnProperty: string[];
  isPlatformAdmin: boolean;
};

async function loadPropertyAccess(
  admin: SupabaseClient,
  userId: string,
  propertyId: string
): Promise<PropertyAccessSnapshot | null> {
  const { data: property, error } = await admin
    .from("properties")
    .select("id, name, owner_id")
    .eq("id", propertyId)
    .maybeSingle();
  if (error || !property) return null;

  const row = property as { id: string; name: string; owner_id: string | null };
  const isPlatformAdmin = await isPlatformAdminUser(admin, userId);

  const { data: spaces } = await admin
    .from("spaces")
    .select("id")
    .eq("property_id", propertyId)
    .neq("status", "deleted");
  const spaceIds = ((spaces as { id: string }[]) || []).map((s) => s.id);

  let assignedSpaceIdsOnProperty: string[] = [];
  if (spaceIds.length > 0) {
    const { data: assigned } = await admin
      .from("space_manager_assignments")
      .select("space_id")
      .eq("user_id", userId)
      .in("space_id", spaceIds);
    assignedSpaceIdsOnProperty = ((assigned as { space_id: string }[]) || []).map(
      (row) => row.space_id
    );
  }

  return {
    propertyId: row.id,
    propertyOwnerId: row.owner_id,
    propertyName: row.name,
    assignedSpaceIdsOnProperty,
    isPlatformAdmin,
  };
}

export async function assertCanViewProperty(
  admin: SupabaseClient,
  userId: string,
  propertyId: string
): Promise<PropertyAccessSnapshot> {
  const snap = await loadPropertyAccess(admin, userId, propertyId);
  if (!snap) throw new Error("Property not found.");
  if (
    !canViewProperty({
      userId,
      isPlatformAdmin: snap.isPlatformAdmin,
      propertyId,
      propertyOwnerId: snap.propertyOwnerId,
      assignedSpaceIdsOnProperty: snap.assignedSpaceIdsOnProperty,
    })
  ) {
    throw new Error("Forbidden.");
  }
  return snap;
}

export async function assertCanManagePropertyUsers(
  admin: SupabaseClient,
  userId: string,
  propertyId: string
): Promise<PropertyAccessSnapshot> {
  const snap = await loadPropertyAccess(admin, userId, propertyId);
  if (!snap) throw new Error("Property not found.");
  if (
    !canManagePropertyUsers({
      userId,
      isPlatformAdmin: snap.isPlatformAdmin,
      propertyId,
      propertyOwnerId: snap.propertyOwnerId,
      assignedSpaceIdsOnProperty: snap.assignedSpaceIdsOnProperty,
    })
  ) {
    throw new Error("Forbidden.");
  }
  return snap;
}

export async function assertCanManageSpaceId(
  admin: SupabaseClient,
  userId: string,
  spaceId: string
): Promise<void> {
  const { data: space, error } = await admin
    .from("spaces")
    .select("id, owner_id, property_id")
    .eq("id", spaceId)
    .maybeSingle();
  if (error || !space) throw new Error("Space not found.");
  const row = space as {
    id: string;
    owner_id: string | null;
    property_id: string | null;
  };
  const isPlatformAdmin = await isPlatformAdminUser(admin, userId);
  let propertyOwnerId: string | null = null;
  if (row.property_id) {
    const { data: property } = await admin
      .from("properties")
      .select("owner_id")
      .eq("id", row.property_id)
      .maybeSingle();
    propertyOwnerId =
      (property as { owner_id: string | null } | null)?.owner_id ?? null;
  }
  const { data: assigned } = await admin
    .from("space_manager_assignments")
    .select("space_id")
    .eq("user_id", userId)
    .eq("space_id", spaceId)
    .maybeSingle();
  if (
    !canManageSpace({
      userId,
      isPlatformAdmin,
      spaceId,
      spaceOwnerId: row.owner_id,
      propertyId: row.property_id,
      propertyOwnerId,
      assignedSpaceIds: assigned ? [spaceId] : [],
    })
  ) {
    throw new Error("Forbidden.");
  }
}

async function spacesBelongToProperty(
  admin: SupabaseClient,
  propertyId: string,
  spaceIds: string[]
): Promise<string[]> {
  if (spaceIds.length === 0) return [];
  const { data, error } = await admin
    .from("spaces")
    .select("id")
    .eq("property_id", propertyId)
    .in("id", spaceIds)
    .neq("status", "deleted");
  if (error) throw new Error(error.message);
  return ((data as { id: string }[]) || []).map((row) => row.id);
}

export async function listPropertyManagers(
  admin: SupabaseClient,
  propertyId: string
) {
  const { data: spaces, error: spacesErr } = await admin
    .from("spaces")
    .select("id, title")
    .eq("property_id", propertyId)
    .neq("status", "deleted")
    .order("title", { ascending: true });
  if (spacesErr) throw new Error(spacesErr.message);
  const spaceRows = (spaces as { id: string; title: string | null }[]) || [];
  const spaceIds = spaceRows.map((s) => s.id);

  const { data: assignments, error: assignErr } = spaceIds.length
    ? await admin
        .from("space_manager_assignments")
        .select("id, space_id, user_id, receive_notifications, created_at, assigned_by")
        .in("space_id", spaceIds)
    : { data: [], error: null };
  if (assignErr) throw new Error(assignErr.message);

  const assignmentRows =
    (assignments as {
      id: string;
      space_id: string;
      user_id: string;
      receive_notifications: boolean;
      created_at: string;
      assigned_by: string | null;
    }[]) || [];

  const userIds = [...new Set(assignmentRows.map((row) => row.user_id))];
  const profilesById = new Map<
    string,
    { id: string; email: string | null; first_name: string | null; last_name: string | null }
  >();
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, first_name, last_name")
      .in("id", userIds);
    for (const profile of (profiles as {
      id: string;
      email: string | null;
      first_name: string | null;
      last_name: string | null;
    }[]) || []) {
      profilesById.set(profile.id, profile);
    }
  }

  const managersByUser = new Map<
    string,
    {
      user_id: string;
      email: string | null;
      name: string;
      receive_notifications: boolean;
      spaces: { assignment_id: string; space_id: string; title: string }[];
    }
  >();

  const spaceTitle = new Map(spaceRows.map((s) => [s.id, s.title?.trim() || "Untitled space"]));

  for (const row of assignmentRows) {
    const profile = profilesById.get(row.user_id);
    const name = [profile?.first_name, profile?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    const existing = managersByUser.get(row.user_id) || {
      user_id: row.user_id,
      email: profile?.email ?? null,
      name: name || profile?.email || "Space manager",
      receive_notifications: row.receive_notifications,
      spaces: [],
    };
    existing.receive_notifications =
      existing.receive_notifications || row.receive_notifications;
    existing.spaces.push({
      assignment_id: row.id,
      space_id: row.space_id,
      title: spaceTitle.get(row.space_id) || "Untitled space",
    });
    managersByUser.set(row.user_id, existing);
  }

  const { data: invites } = await admin
    .from("space_manager_invites")
    .select("id, email, status, receive_notifications, expires_at, created_at")
    .eq("property_id", propertyId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const inviteRows =
    (invites as {
      id: string;
      email: string;
      status: string;
      receive_notifications: boolean;
      expires_at: string;
      created_at: string;
    }[]) || [];

  const inviteIds = inviteRows.map((row) => row.id);
  const inviteSpacesById = new Map<string, { space_id: string; title: string }[]>();
  if (inviteIds.length > 0) {
    const { data: inviteSpaces } = await admin
      .from("space_manager_invite_spaces")
      .select("invite_id, space_id")
      .in("invite_id", inviteIds);
    for (const row of (inviteSpaces as { invite_id: string; space_id: string }[]) || []) {
      const list = inviteSpacesById.get(row.invite_id) || [];
      list.push({
        space_id: row.space_id,
        title: spaceTitle.get(row.space_id) || "Untitled space",
      });
      inviteSpacesById.set(row.invite_id, list);
    }
  }

  return {
    spaces: spaceRows.map((s) => ({
      id: s.id,
      title: s.title?.trim() || "Untitled space",
    })),
    managers: [...managersByUser.values()],
    pending_invites: inviteRows
      .filter((row) => !isSpaceManagerInviteExpired(row.expires_at))
      .map((row) => ({
        id: row.id,
        email: row.email,
        receive_notifications: row.receive_notifications,
        expires_at: row.expires_at,
        created_at: row.created_at,
        spaces: inviteSpacesById.get(row.id) || [],
      })),
  };
}

export async function inviteOrAssignSpaceManagers(
  admin: SupabaseClient,
  params: {
    propertyId: string;
    actorUserId: string;
    email: string;
    spaceIds: string[];
    receiveNotifications?: boolean;
    sendEmail?: boolean;
  }
): Promise<
  | { ok: true; assigned: boolean; inviteUrl?: string; emailSent?: boolean }
  | { ok: false; error: string; status: number }
> {
  const email = params.email.trim().toLowerCase();
  if (!email.includes("@")) {
    return { ok: false, error: "Enter a valid email address.", status: 400 };
  }
  const spaceIds = await spacesBelongToProperty(
    admin,
    params.propertyId,
    [...new Set(params.spaceIds.filter(Boolean))]
  );
  if (spaceIds.length === 0) {
    return { ok: false, error: "Select at least one space on this property.", status: 400 };
  }

  const receiveNotifications = params.receiveNotifications !== false;

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, email")
    .ilike("email", email)
    .maybeSingle();

  const existingUserId = (existingProfile as { id: string } | null)?.id;
  if (existingUserId) {
    if (existingUserId === params.actorUserId) {
      return { ok: false, error: "You already administer this property.", status: 400 };
    }
    const { data: property } = await admin
      .from("properties")
      .select("owner_id")
      .eq("id", params.propertyId)
      .maybeSingle();
    if ((property as { owner_id: string | null } | null)?.owner_id === existingUserId) {
      return {
        ok: false,
        error: "That person is already the property admin.",
        status: 400,
      };
    }

    const nowIso = new Date().toISOString();
    for (const spaceId of spaceIds) {
      const { error } = await admin.from("space_manager_assignments").upsert(
        {
          space_id: spaceId,
          user_id: existingUserId,
          assigned_by: params.actorUserId,
          receive_notifications: receiveNotifications,
          updated_at: nowIso,
        },
        { onConflict: "space_id,user_id" }
      );
      if (error) return { ok: false, error: error.message, status: 500 };
    }
    await admin.from("profiles").update({ is_host: true }).eq("id", existingUserId);
    return { ok: true, assigned: true };
  }

  const nowIso = new Date().toISOString();
  await admin
    .from("space_manager_invites")
    .update({ status: "revoked", revoked_at: nowIso })
    .eq("property_id", params.propertyId)
    .eq("status", "pending")
    .ilike("email", email);

  const rawToken = generateSpaceManagerInviteToken();
  const { data: inserted, error: insertErr } = await admin
    .from("space_manager_invites")
    .insert({
      property_id: params.propertyId,
      email,
      token_hash: hashSpaceManagerInviteToken(rawToken),
      status: "pending",
      receive_notifications: receiveNotifications,
      invited_by: params.actorUserId,
      expires_at: spaceManagerInviteExpiresAt(14),
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    return { ok: false, error: insertErr?.message || "Could not create invite.", status: 500 };
  }

  const inviteId = (inserted as { id: string }).id;
  const { error: spacesErr } = await admin.from("space_manager_invite_spaces").insert(
    spaceIds.map((spaceId) => ({ invite_id: inviteId, space_id: spaceId }))
  );
  if (spacesErr) {
    return { ok: false, error: spacesErr.message, status: 500 };
  }

  const inviteUrl = buildSpaceManagerInviteUrl(rawToken);
  const { data: property } = await admin
    .from("properties")
    .select("name")
    .eq("id", params.propertyId)
    .maybeSingle();
  const { data: spaceRows } = await admin
    .from("spaces")
    .select("title")
    .in("id", spaceIds);

  let emailSent = false;
  if (params.sendEmail !== false) {
    try {
      const copy = buildSpaceManagerInviteCopy({
        propertyName:
          ((property as { name?: string } | null)?.name || "").trim() || "a property",
        spaceTitles: ((spaceRows as { title: string | null }[]) || []).map(
          (row) => row.title?.trim() || "Untitled space"
        ),
        inviteUrl,
      });
      const rendered = renderEmailLayout({
        preheader: copy.emailPreheader,
        title: copy.emailTitle,
        bodyLines: copy.emailBodyLines,
        primaryCTA: { label: copy.ctaLabel, href: inviteUrl },
        footerRole: copy.emailFooterRole,
      });
      await sendEmail({
        to: email,
        subject: copy.emailSubject,
        html: rendered.html,
        text: rendered.text,
      });
      emailSent = true;
    } catch (err) {
      console.error("[space-manager] invite email failed", err);
    }
  }

  return { ok: true, assigned: false, inviteUrl, emailSent };
}

export async function updateManagerAssignments(
  admin: SupabaseClient,
  params: {
    propertyId: string;
    userId: string;
    spaceIds: string[];
    receiveNotifications?: boolean;
  }
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const spaceIds = await spacesBelongToProperty(
    admin,
    params.propertyId,
    [...new Set(params.spaceIds.filter(Boolean))]
  );

  const { data: currentSpaces } = await admin
    .from("spaces")
    .select("id")
    .eq("property_id", params.propertyId)
    .neq("status", "deleted");
  const propertySpaceIds = ((currentSpaces as { id: string }[]) || []).map((s) => s.id);

  if (propertySpaceIds.length > 0) {
    await admin
      .from("space_manager_assignments")
      .delete()
      .eq("user_id", params.userId)
      .in("space_id", propertySpaceIds);
  }

  const receiveNotifications = params.receiveNotifications !== false;
  for (const spaceId of spaceIds) {
    const { error } = await admin.from("space_manager_assignments").insert({
      space_id: spaceId,
      user_id: params.userId,
      receive_notifications: receiveNotifications,
    });
    if (error) return { ok: false, error: error.message, status: 500 };
  }

  return { ok: true };
}

export async function removeManagerFromProperty(
  admin: SupabaseClient,
  propertyId: string,
  userId: string
): Promise<void> {
  const { data: spaces } = await admin
    .from("spaces")
    .select("id")
    .eq("property_id", propertyId);
  const spaceIds = ((spaces as { id: string }[]) || []).map((s) => s.id);
  if (spaceIds.length === 0) return;
  await admin
    .from("space_manager_assignments")
    .delete()
    .eq("user_id", userId)
    .in("space_id", spaceIds);
}

export async function revokeSpaceManagerInvite(
  admin: SupabaseClient,
  inviteId: string,
  propertyId: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { data, error } = await admin
    .from("space_manager_invites")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
    })
    .eq("id", inviteId)
    .eq("property_id", propertyId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message, status: 500 };
  if (!data) return { ok: false, error: "Invite not found.", status: 404 };
  return { ok: true };
}

export async function loadSpaceManagerInvitePreview(
  admin: SupabaseClient,
  rawToken: string
) {
  const tokenHash = hashSpaceManagerInviteToken(rawToken);
  const { data: invite, error } = await admin
    .from("space_manager_invites")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error || !invite) {
    return { valid: false as const, error: "Invite link not found." };
  }
  const row = invite as {
    id: string;
    property_id: string;
    email: string;
    status: string;
    expires_at: string;
    receive_notifications: boolean;
  };
  if (row.status !== "pending") {
    return { valid: false as const, error: `This invite link is ${row.status}.` };
  }
  if (isSpaceManagerInviteExpired(row.expires_at)) {
    await admin
      .from("space_manager_invites")
      .update({ status: "expired" })
      .eq("id", row.id)
      .eq("status", "pending");
    return { valid: false as const, error: "This invite link is expired." };
  }

  const { data: property } = await admin
    .from("properties")
    .select("id, name")
    .eq("id", row.property_id)
    .maybeSingle();
  const { data: inviteSpaces } = await admin
    .from("space_manager_invite_spaces")
    .select("space_id")
    .eq("invite_id", row.id);
  const spaceIds = ((inviteSpaces as { space_id: string }[]) || []).map((s) => s.space_id);
  const { data: spaces } = spaceIds.length
    ? await admin.from("spaces").select("id, title").in("id", spaceIds)
    : { data: [] };

  return {
    valid: true as const,
    email: row.email,
    expires_at: row.expires_at,
    property: {
      id: (property as { id: string } | null)?.id || row.property_id,
      name: ((property as { name?: string } | null)?.name || "").trim() || "Property",
      spaces: ((spaces as { id: string; title: string | null }[]) || []).map((s) => ({
        id: s.id,
        title: s.title?.trim() || "Untitled space",
      })),
    },
  };
}

export async function acceptSpaceManagerInvite(
  admin: SupabaseClient,
  rawToken: string,
  userId: string,
  userEmail: string | null
): Promise<
  | { ok: true; propertyId: string; propertyName: string }
  | { ok: false; error: string; status: number }
> {
  const tokenHash = hashSpaceManagerInviteToken(rawToken);
  const { data: invite, error } = await admin
    .from("space_manager_invites")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error || !invite) {
    return { ok: false, error: "Invite link not found.", status: 404 };
  }
  const row = invite as {
    id: string;
    property_id: string;
    email: string;
    status: string;
    expires_at: string;
    receive_notifications: boolean;
  };
  if (row.status !== "pending") {
    return { ok: false, error: `This invite link is ${row.status}.`, status: 400 };
  }
  if (isSpaceManagerInviteExpired(row.expires_at)) {
    await admin
      .from("space_manager_invites")
      .update({ status: "expired" })
      .eq("id", row.id);
    return { ok: false, error: "This invite link is expired.", status: 400 };
  }
  if (userEmail && userEmail.trim().toLowerCase() !== row.email.toLowerCase()) {
    return {
      ok: false,
      error: `Sign in with ${row.email} to accept this invitation.`,
      status: 403,
    };
  }

  const { data: inviteSpaces } = await admin
    .from("space_manager_invite_spaces")
    .select("space_id")
    .eq("invite_id", row.id);
  const spaceIds = ((inviteSpaces as { space_id: string }[]) || []).map((s) => s.space_id);
  const validSpaceIds = await spacesBelongToProperty(admin, row.property_id, spaceIds);

  const nowIso = new Date().toISOString();
  for (const spaceId of validSpaceIds) {
    const { error: assignErr } = await admin.from("space_manager_assignments").upsert(
      {
        space_id: spaceId,
        user_id: userId,
        receive_notifications: row.receive_notifications,
        updated_at: nowIso,
      },
      { onConflict: "space_id,user_id" }
    );
    if (assignErr) return { ok: false, error: assignErr.message, status: 500 };
  }

  const { data: accepted, error: acceptErr } = await admin
    .from("space_manager_invites")
    .update({
      status: "accepted",
      accepted_by: userId,
      used_at: nowIso,
    })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (acceptErr) return { ok: false, error: acceptErr.message, status: 500 };
  if (!accepted) {
    return { ok: false, error: "This invite link is no longer valid.", status: 409 };
  }

  await admin.from("profiles").update({ is_host: true }).eq("id", userId);

  const { data: property } = await admin
    .from("properties")
    .select("name")
    .eq("id", row.property_id)
    .maybeSingle();

  return {
    ok: true,
    propertyId: row.property_id,
    propertyName:
      ((property as { name?: string } | null)?.name || "").trim() || "Property",
  };
}

export async function listSpaceManagerNotificationRecipients(
  admin: SupabaseClient,
  spaceId: string
): Promise<{ user_id: string; email: string | null; first_name: string | null }[]> {
  const { data: assignments, error } = await admin
    .from("space_manager_assignments")
    .select("user_id")
    .eq("space_id", spaceId)
    .eq("receive_notifications", true);
  if (error) {
    if (/space_manager_assignments/i.test(error.message)) return [];
    console.error("[space-manager] recipient lookup failed", error);
    return [];
  }
  const userIds = [
    ...new Set(((assignments as { user_id: string }[]) || []).map((row) => row.user_id)),
  ];
  if (userIds.length === 0) return [];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, first_name")
    .in("id", userIds);
  return ((profiles as { id: string; email: string | null; first_name: string | null }[]) || []).map(
    (row) => ({
      user_id: row.id,
      email: row.email,
      first_name: row.first_name,
    })
  );
}
