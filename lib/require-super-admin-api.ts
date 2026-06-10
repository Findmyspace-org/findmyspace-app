import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isSuperAdminRole } from "@/lib/admin-roles";

export type SuperAdminAuthOk = { userId: string };
export type SuperAdminAuthFail = { response: NextResponse };

/**
 * Verify Bearer JWT and profiles.role === 'super_admin'. Use in Route Handlers only.
 */
export async function requireSuperAdminApi(
  req: NextRequest
): Promise<SuperAdminAuthOk | SuperAdminAuthFail> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return {
      response: NextResponse.json(
        { error: "Server configuration error." },
        { status: 500 }
      ),
    };
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  const accessToken = authHeader.replace("Bearer ", "");

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
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role, admin_access_disabled")
    .eq("id", user.id)
    .maybeSingle();

  const row = profile as {
    role?: string | null;
    admin_access_disabled?: boolean | null;
  } | null;

  if (profileError || !isSuperAdminRole(row?.role)) {
    return {
      response: NextResponse.json(
        { error: "Super admin access required." },
        { status: 403 }
      ),
    };
  }

  if (row?.admin_access_disabled) {
    return {
      response: NextResponse.json(
        { error: "Your admin access is disabled." },
        { status: 403 }
      ),
    };
  }

  return { userId: user.id };
}
