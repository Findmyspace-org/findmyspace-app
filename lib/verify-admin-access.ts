import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isPlatformAdminRole } from "@/lib/admin-roles";

export type VerifiedAdminAccess = {
  userId: string;
  role: string;
  email: string | null;
  adminAccessDisabled: boolean;
};

export type VerifyAdminAccessResult =
  | { ok: true; admin: VerifiedAdminAccess }
  | {
      ok: false;
      reason: "config" | "unauthorized" | "forbidden" | "disabled";
      message: string;
    };

function createServiceClient(
  supabaseUrl: string,
  serviceKey: string
): SupabaseClient {
  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Verify a Supabase access token and load platform admin access from profiles
 * using the service role (same source of truth as admin API routes).
 */
export async function verifyAdminAccess(
  accessToken: string
): Promise<VerifyAdminAccessResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return {
      ok: false,
      reason: "config",
      message: "Server configuration error.",
    };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "Unauthorized.",
    };
  }

  const admin = createServiceClient(supabaseUrl, serviceKey);

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role, admin_access_disabled, email")
    .eq("id", user.id)
    .maybeSingle();

  const profileRow = profile as {
    role?: string | null;
    admin_access_disabled?: boolean | null;
    email?: string | null;
  } | null;

  if (profileError || !isPlatformAdminRole(profileRow?.role)) {
    return {
      ok: false,
      reason: "forbidden",
      message: "Forbidden.",
    };
  }

  if (profileRow?.admin_access_disabled) {
    return {
      ok: false,
      reason: "disabled",
      message: "Your admin access is disabled.",
    };
  }

  return {
    ok: true,
    admin: {
      userId: user.id,
      role: profileRow!.role!,
      email: profileRow?.email ?? user.email ?? null,
      adminAccessDisabled: false,
    },
  };
}
