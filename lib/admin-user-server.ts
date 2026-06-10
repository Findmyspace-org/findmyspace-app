import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { renderEmailLayout } from "@/lib/email-templates/EmailLayout";
import {
  ADMIN_ROLE,
  DEFAULT_USER_ROLE,
  PLATFORM_ADMIN_ROLES,
  SUPER_ADMIN_ROLE,
} from "@/lib/admin-roles";
import { getCanonicalPublicSiteUrl } from "@/lib/site-url";

export type AdminUserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string;
  admin_access_disabled: boolean;
  admin_invited_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  is_banned: boolean;
  active_status: "active" | "disabled" | "invite_pending";
};

export function parseFullName(fullName: string): {
  first_name: string | null;
  last_name: string | null;
  full_name: string;
} {
  const trimmed = fullName.trim();
  if (!trimmed) {
    return { first_name: null, last_name: null, full_name: "" };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { first_name: parts[0], last_name: null, full_name: trimmed };
  }
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(" "),
    full_name: trimmed,
  };
}

function buildAdminInviteEmail(params: {
  fullName: string;
  setupUrl: string;
  isResend?: boolean;
}) {
  const name = params.fullName.trim() || "there";
  const title = params.isResend
    ? "Your FindMySpace admin invite"
    : "You're invited to FindMySpace Admin";
  const preheader = "Set your password to access the admin workspace.";
  const bodyLines = [
    `Hi ${name},`,
    params.isResend
      ? "Here is a fresh link to set up or reset your admin password."
      : "You've been invited as a FindMySpace platform admin.",
    "Use the button below to set your password and sign in to the admin workspace.",
    "If you did not expect this invite, you can ignore this email.",
  ];

  const rendered = renderEmailLayout({
    preheader,
    title,
    bodyLines,
    primaryCTA: { label: "Set up password", href: params.setupUrl },
    footerRole: "admin",
  });

  return {
    subject: params.isResend
      ? "FindMySpace admin — set your password"
      : "You're invited to FindMySpace Admin",
    html: rendered.html,
    text: rendered.text,
  };
}

async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string
): Promise<{ id: string; email?: string; last_sign_in_at?: string | null; email_confirmed_at?: string | null; banned_until?: string | null } | null> {
  const normalized = email.trim().toLowerCase();
  let page = 1;
  const perPage = 200;

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);

    const match = (data.users || []).find(
      (u) => (u.email || "").toLowerCase() === normalized
    );
    if (match) return match;

    if ((data.users || []).length < perPage) break;
    page += 1;
  }

  return null;
}

export async function sendAdminPasswordSetupEmail(params: {
  to: string;
  fullName: string;
  setupUrl: string;
  isResend?: boolean;
}): Promise<boolean> {
  const copy = buildAdminInviteEmail({
    fullName: params.fullName,
    setupUrl: params.setupUrl,
    isResend: params.isResend,
  });

  const result = await sendEmail({
    to: params.to,
    subject: copy.subject,
    html: copy.html,
    text: copy.text,
  });

  return result.ok;
}

export async function generateAdminPasswordSetupLink(
  admin: SupabaseClient,
  email: string
): Promise<string> {
  const redirectTo = `${getCanonicalPublicSiteUrl()}/login?next=${encodeURIComponent("/admin")}`;

  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email: email.trim().toLowerCase(),
    options: { redirectTo },
  });

  if (error) {
    const { data: recoveryData, error: recoveryError } =
      await admin.auth.admin.generateLink({
        type: "recovery",
        email: email.trim().toLowerCase(),
        options: { redirectTo },
      });

    if (recoveryError || !recoveryData?.properties?.action_link) {
      throw new Error(error.message || recoveryError?.message || "Could not generate setup link.");
    }

    return recoveryData.properties.action_link;
  }

  if (!data?.properties?.action_link) {
    throw new Error("Could not generate setup link.");
  }

  return data.properties.action_link;
}

export async function listAdminUsers(
  admin: SupabaseClient
): Promise<AdminUserRow[]> {
  const { data: profiles, error } = await admin
    .from("profiles")
    .select(
      "id, email, full_name, first_name, last_name, role, admin_access_disabled, admin_invited_at"
    )
    .in("role", [...PLATFORM_ADMIN_ROLES])
    .order("full_name", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = (profiles as Record<string, unknown>[]) || [];
  const authById = new Map<
    string,
    {
      last_sign_in_at: string | null;
      email_confirmed_at: string | null;
      is_banned: boolean;
    }
  >();

  let page = 1;
  while (page <= 10) {
    const { data: authData, error: authErr } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (authErr) break;

    for (const user of authData.users || []) {
      authById.set(user.id, {
        last_sign_in_at: user.last_sign_in_at ?? null,
        email_confirmed_at: user.email_confirmed_at ?? null,
        is_banned: Boolean(
          user.banned_until && new Date(user.banned_until) > new Date()
        ),
      });
    }

    if ((authData.users || []).length < 200) break;
    page += 1;
  }

  return rows.map((row) => {
    const id = String(row.id);
    const authMeta = authById.get(id);
    const disabled = Boolean(row.admin_access_disabled);
    const invitedAt = (row.admin_invited_at as string | null) || null;
    const lastSignIn = authMeta?.last_sign_in_at ?? null;
    const confirmed = authMeta?.email_confirmed_at ?? null;
    const banned = authMeta?.is_banned ?? false;

    let active_status: AdminUserRow["active_status"] = "active";
    if (disabled) {
      active_status = "disabled";
    } else if (!lastSignIn && !confirmed) {
      active_status = "invite_pending";
    }

    const nameParts = parseFullName(
      (row.full_name as string | null) ||
        `${row.first_name || ""} ${row.last_name || ""}`.trim()
    );

    return {
      id,
      email: (row.email as string | null) || null,
      full_name: nameParts.full_name || null,
      first_name: (row.first_name as string | null) || nameParts.first_name,
      last_name: (row.last_name as string | null) || nameParts.last_name,
      role: String(row.role || ADMIN_ROLE),
      admin_access_disabled: disabled,
      admin_invited_at: invitedAt,
      last_sign_in_at: lastSignIn,
      email_confirmed_at: confirmed,
      is_banned: banned,
      active_status,
    };
  });
}

export async function upsertAdminProfile(
  admin: SupabaseClient,
  params: {
    userId: string;
    email: string;
    fullName: string;
    role: string;
  }
): Promise<void> {
  const parsed = parseFullName(params.fullName);
  const nowIso = new Date().toISOString();

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("id", params.userId)
    .maybeSingle();

  const row = {
    id: params.userId,
    email: params.email.trim().toLowerCase(),
    full_name: parsed.full_name || null,
    first_name: parsed.first_name,
    last_name: parsed.last_name,
    role: params.role,
    admin_access_disabled: false,
    admin_invited_at: nowIso,
  };

  if (existing) {
    const { error } = await admin.from("profiles").update(row).eq("id", params.userId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin.from("profiles").insert(row);
    if (error) throw new Error(error.message);
  }
}

export async function inviteAdminUser(
  admin: SupabaseClient,
  params: {
    fullName: string;
    email: string;
    role?: string;
  }
): Promise<{ userId: string; emailSent: boolean }> {
  const email = params.email.trim().toLowerCase();
  if (!email.includes("@")) {
    throw new Error("Valid email is required.");
  }

  const fullName = params.fullName.trim();
  if (!fullName) {
    throw new Error("Full name is required.");
  }

  const role = params.role === SUPER_ADMIN_ROLE ? SUPER_ADMIN_ROLE : ADMIN_ROLE;

  const existingAuth = await findAuthUserByEmail(admin, email);
  let userId = existingAuth?.id;

  if (!userId) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createErr || !created.user) {
      throw new Error(createErr?.message || "Could not create auth user.");
    }

    userId = created.user.id;
  }

  await upsertAdminProfile(admin, { userId, email, fullName, role });

  const setupUrl = await generateAdminPasswordSetupLink(admin, email);
  const emailSent = await sendAdminPasswordSetupEmail({
    to: email,
    fullName,
    setupUrl,
  });

  return { userId, emailSent };
}

export async function promoteUserToAdmin(
  admin: SupabaseClient,
  params: { email?: string; userId?: string; fullName?: string }
): Promise<{ userId: string; emailSent: boolean }> {
  let userId = params.userId?.trim();
  let email = params.email?.trim().toLowerCase() || "";

  if (!userId && email) {
    const authUser = await findAuthUserByEmail(admin, email);
    if (!authUser) {
      throw new Error("No user found with that email. Use Invite admin instead.");
    }
    userId = authUser.id;
    email = authUser.email || email;
  }

  if (!userId) {
    throw new Error("userId or email is required.");
  }

  const { data: authUser, error: authErr } =
    await admin.auth.admin.getUserById(userId);
  if (authErr || !authUser.user) {
    throw new Error("User not found.");
  }

  email = authUser.user.email || email;
  if (!email) {
    throw new Error("User has no email address.");
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, first_name, last_name, role")
    .eq("id", userId)
    .maybeSingle();

  const profileRow = profile as {
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    role?: string | null;
  } | null;

  if (profileRow?.role === SUPER_ADMIN_ROLE) {
    throw new Error("User is already a super admin.");
  }

  const fullName =
    params.fullName?.trim() ||
    profileRow?.full_name ||
    `${profileRow?.first_name || ""} ${profileRow?.last_name || ""}`.trim() ||
    email;

  await upsertAdminProfile(admin, {
    userId,
    email,
    fullName,
    role: ADMIN_ROLE,
  });

  const setupUrl = await generateAdminPasswordSetupLink(admin, email);
  const emailSent = await sendAdminPasswordSetupEmail({
    to: email,
    fullName,
    setupUrl,
    isResend: Boolean(authUser.user.last_sign_in_at),
  });

  return { userId, emailSent };
}

export async function resendAdminInvite(
  admin: SupabaseClient,
  userId: string
): Promise<{ emailSent: boolean }> {
  const { data: profile, error } = await admin
    .from("profiles")
    .select("email, full_name, first_name, last_name, role")
    .eq("id", userId)
    .maybeSingle();

  if (error || !profile) {
    throw new Error("Admin user not found.");
  }

  const row = profile as {
    email?: string | null;
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    role?: string | null;
  };

  if (!row.role || !PLATFORM_ADMIN_ROLES.includes(row.role as typeof PLATFORM_ADMIN_ROLES[number])) {
    throw new Error("User is not an admin.");
  }

  const email = row.email?.trim();
  if (!email) {
    throw new Error("Admin user has no email.");
  }

  const fullName =
    row.full_name ||
    `${row.first_name || ""} ${row.last_name || ""}`.trim() ||
    email;

  const setupUrl = await generateAdminPasswordSetupLink(admin, email);
  const emailSent = await sendAdminPasswordSetupEmail({
    to: email,
    fullName,
    setupUrl,
    isResend: true,
  });

  await admin
    .from("profiles")
    .update({ admin_invited_at: new Date().toISOString() })
    .eq("id", userId);

  return { emailSent };
}

export async function setAdminAccessDisabled(
  admin: SupabaseClient,
  userId: string,
  disabled: boolean
): Promise<void> {
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const role = (profile as { role?: string | null } | null)?.role;
  if (!role || !PLATFORM_ADMIN_ROLES.includes(role as typeof PLATFORM_ADMIN_ROLES[number])) {
    throw new Error("User is not an admin.");
  }

  const { error } = await admin
    .from("profiles")
    .update({ admin_access_disabled: disabled })
    .eq("id", userId);

  if (error) throw new Error(error.message);
}

export async function removeAdminAccess(
  admin: SupabaseClient,
  userId: string
): Promise<void> {
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const role = (profile as { role?: string | null } | null)?.role;
  if (!role || !PLATFORM_ADMIN_ROLES.includes(role as typeof PLATFORM_ADMIN_ROLES[number])) {
    throw new Error("User is not an admin.");
  }

  const { error } = await admin
    .from("profiles")
    .update({
      role: DEFAULT_USER_ROLE,
      admin_access_disabled: false,
    })
    .eq("id", userId);

  if (error) throw new Error(error.message);
}

export async function countSuperAdmins(admin: SupabaseClient): Promise<number> {
  const { count, error } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", SUPER_ADMIN_ROLE)
    .eq("admin_access_disabled", false);

  if (error) throw new Error(error.message);
  return count ?? 0;
}
