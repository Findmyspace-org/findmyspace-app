import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type OwnerListingAuthOk = {
  userId: string;
  admin: SupabaseClient;
};

export type OwnerListingAuthFail = { response: NextResponse };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function requireOwnerListingApi(
  req: NextRequest,
  spaceId: string
): Promise<OwnerListingAuthOk | OwnerListingAuthFail> {
  if (!UUID_RE.test(spaceId)) {
    return {
      response: NextResponse.json({ error: "Invalid listing id." }, { status: 400 }),
    };
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

  const { data: space, error: spaceErr } = await admin
    .from("spaces")
    .select("id, owner_id")
    .eq("id", spaceId)
    .maybeSingle();

  if (spaceErr || !space) {
    return {
      response: NextResponse.json({ error: "Listing not found." }, { status: 404 }),
    };
  }

  if ((space as { owner_id: string | null }).owner_id !== user.id) {
    return {
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }

  return { userId: user.id, admin };
}
