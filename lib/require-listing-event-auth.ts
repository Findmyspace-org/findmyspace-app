import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export type ListingEventAuthOk = { userId: string; role: "admin" | "owner" | "internal" };
export type ListingEventAuthFail = { response: NextResponse };

/**
 * Authorize listing-event notifications:
 * - X-Internal-Api-Secret (server-to-server)
 * - Bearer JWT where caller is admin or listing owner
 */
export async function requireListingEventAuth(
  req: NextRequest,
  spaceId: string
): Promise<ListingEventAuthOk | ListingEventAuthFail> {
  const internalSecret = process.env.INTERNAL_API_SECRET;
  const headerSecret = req.headers.get("x-internal-api-secret");
  if (internalSecret && headerSecret === internalSecret) {
    return { userId: "internal", role: "internal" };
  }

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

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if ((profile as { role?: string } | null)?.role === "admin") {
    return { userId: user.id, role: "admin" };
  }

  const { data: space } = await admin
    .from("spaces")
    .select("owner_id")
    .eq("id", spaceId)
    .maybeSingle();

  if ((space as { owner_id: string | null } | null)?.owner_id === user.id) {
    return { userId: user.id, role: "owner" };
  }

  return {
    response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
  };
}
