import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isSpacePlaceRole } from "@/lib/space-place/access";

export type CrmAuthOk = {
  userId: string;
  crmRole: "admin" | "spacer";
  userClient: SupabaseClient;
  adminClient: SupabaseClient;
};

export type CrmAuthFail = { response: NextResponse };

export async function requireCrmApi(
  req: NextRequest
): Promise<CrmAuthOk | CrmAuthFail> {
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
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
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

  const { data: crmProfile, error: crmError } = await (
    userClient.from("crm_profiles") as any
  )
    .select("role, active")
    .eq("id", user.id)
    .maybeSingle();

  const profile = crmProfile as { role?: string; active?: boolean } | null;

  if (crmError || !profile?.active || !isSpacePlaceRole(profile.role)) {
    return {
      response: NextResponse.json(
        { error: "The Space Place access required." },
        { status: 403 }
      ),
    };
  }

  const crmRole = profile.role;

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return { userId: user.id, crmRole, userClient, adminClient };
}
