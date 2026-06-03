import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  hasSpacePlaceAccess,
  isSpacePlaceRole,
} from "@/lib/space-place/access";
import type { CrmProfile, CrmRole } from "@/lib/space-place/types";

export type CrmAuthOk = {
  userId: string;
  crmRole: CrmRole;
  platformRole: string | null;
  userClient: SupabaseClient;
  adminClient: SupabaseClient;
};

export type CrmAuthFail = { response: NextResponse };

type CrmProfileRow = Pick<CrmProfile, "role" | "active">;

async function loadCrmProfile(
  adminClient: SupabaseClient,
  userId: string
): Promise<CrmProfileRow | null> {
  const { data, error } = await (adminClient.from("crm_profiles") as ReturnType<
    typeof adminClient.from
  >)
    .select("role, active")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[requireCrmApi] crm_profiles read failed", {
      userId,
      message: error.message,
      code: error.code,
    });
    return null;
  }

  return data as CrmProfileRow | null;
}

async function ensurePlatformAdminCrmProfile(
  adminClient: SupabaseClient,
  user: { id: string; email?: string; user_metadata?: Record<string, unknown> },
  platformProfile: {
    full_name?: string | null;
    phone?: string | null;
  } | null
): Promise<CrmProfileRow | null> {
  const row = {
    id: user.id,
    full_name:
      platformProfile?.full_name ||
      (user.user_metadata?.full_name as string | undefined) ||
      user.email?.split("@")[0] ||
      "Main Admin",
    email: user.email ?? null,
    phone: platformProfile?.phone ?? null,
    role: "admin" as const,
    active: true,
  };

  const { data, error } = await (adminClient.from("crm_profiles") as ReturnType<
    typeof adminClient.from
  >)
    .upsert(row, { onConflict: "id" })
    .select("role, active")
    .single();

  if (error) {
    console.error("[requireCrmApi] crm_profiles upsert (platform admin) failed", {
      userId: user.id,
      message: error.message,
      code: error.code,
    });
    return null;
  }

  console.info("[requireCrmApi] ensured crm_profiles admin row", {
    userId: user.id,
  });

  return data as CrmProfileRow;
}

/** Spacers always own new records; admins may set assignee or leave unassigned. */
export function resolveCrmAssignedTo(
  auth: Pick<CrmAuthOk, "crmRole" | "userId">,
  clientAssignedTo?: string | null
): string | null {
  if (auth.crmRole === "spacer") {
    return auth.userId;
  }
  const trimmed = clientAssignedTo?.trim();
  return trimmed || null;
}

export async function requireCrmApi(
  req: NextRequest
): Promise<CrmAuthOk | CrmAuthFail> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error("[requireCrmApi] missing env", {
      hasUrl: Boolean(supabaseUrl),
      hasAnon: Boolean(anonKey),
      hasServiceRole: Boolean(serviceKey),
    });
    return {
      response: NextResponse.json(
        {
          error:
            "Server configuration error. SUPABASE_SERVICE_ROLE_KEY must be set for Space Place writes.",
        },
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

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: platformProfile } = await (userClient.from("profiles") as ReturnType<
    typeof userClient.from
  >)
    .select("role, full_name, phone")
    .eq("id", user.id)
    .maybeSingle();

  const platformRole =
    (platformProfile as { role?: string } | null)?.role ?? null;

  let crmProfile = await loadCrmProfile(adminClient, user.id);

  if (!hasSpacePlaceAccess(crmProfile)) {
    if (platformRole === "admin") {
      crmProfile = await ensurePlatformAdminCrmProfile(
        adminClient,
        user,
        platformProfile as { full_name?: string | null; phone?: string | null } | null
      );
    }
  }

  if (!crmProfile?.active || !isSpacePlaceRole(crmProfile.role)) {
    console.warn("[requireCrmApi] access denied", {
      userId: user.id,
      platformRole,
      crmRole: crmProfile?.role ?? null,
      crmActive: crmProfile?.active ?? null,
    });
    return {
      response: NextResponse.json(
        {
          error:
            "The Space Place is only for invited FindMySpace Spacers and Main Admins.",
        },
        { status: 403 }
      ),
    };
  }

  const crmRole = crmProfile.role;

  return {
    userId: user.id,
    crmRole,
    platformRole,
    userClient,
    adminClient,
  };
}
