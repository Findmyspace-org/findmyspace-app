import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertCanViewProperty } from "@/lib/space-manager-server";

export type OwnerPropertyAuthOk = {
  userId: string;
  admin: SupabaseClient;
};

export type OwnerPropertyAuthFail = { response: NextResponse };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authenticatePropertyRequest(
  req: NextRequest,
  propertyId: string
): Promise<OwnerPropertyAuthOk | OwnerPropertyAuthFail> {
  if (!UUID_RE.test(propertyId)) {
    return {
      response: NextResponse.json({ error: "Invalid property id." }, { status: 400 }),
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

  return { userId: user.id, admin };
}

export async function requireOwnerPropertyApi(
  req: NextRequest,
  propertyId: string
): Promise<OwnerPropertyAuthOk | OwnerPropertyAuthFail> {
  const auth = await authenticatePropertyRequest(req, propertyId);
  if ("response" in auth) return auth;

  const { data: property, error: propertyErr } = await auth.admin
    .from("properties")
    .select("id, owner_id")
    .eq("id", propertyId)
    .maybeSingle();

  if (propertyErr || !property) {
    return {
      response: NextResponse.json({ error: "Property not found." }, { status: 404 }),
    };
  }

  if ((property as { owner_id: string | null }).owner_id !== auth.userId) {
    return {
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }

  return auth;
}

export async function requirePropertyViewApi(
  req: NextRequest,
  propertyId: string
): Promise<OwnerPropertyAuthOk | OwnerPropertyAuthFail> {
  const auth = await authenticatePropertyRequest(req, propertyId);
  if ("response" in auth) return auth;

  try {
    await assertCanViewProperty(auth.admin, auth.userId, propertyId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden.";
    const status = message === "Property not found." ? 404 : 403;
    return {
      response: NextResponse.json({ error: message }, { status }),
    };
  }

  return auth;
}
