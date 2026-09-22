import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";
import { isPlatformAdminRole } from "@/lib/admin-roles";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ActivePlatformAdminOk = {
  userId: string;
  admin: SupabaseClient;
  role: string;
};

export type ActivePlatformAdminFail = { response: NextResponse };

export async function requireActivePlatformAdminApi(
  req: NextRequest
): Promise<ActivePlatformAdminOk | ActivePlatformAdminFail> {
  const auth = await requireAuthenticatedApi(req);
  if ("response" in auth) return auth;

  const { data: profile } = await auth.admin
    .from("profiles")
    .select("role, admin_access_disabled")
    .eq("id", auth.userId)
    .maybeSingle();

  const row = profile as {
    role?: string | null;
    admin_access_disabled?: boolean | null;
  } | null;

  if (
    !isPlatformAdminRole(row?.role) ||
    Boolean(row?.admin_access_disabled)
  ) {
    return {
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }

  return {
    userId: auth.userId,
    admin: auth.admin,
    role: row?.role as string,
  };
}
