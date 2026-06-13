import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export type AuthenticatedAuthOk = { userId: string };
export type AuthenticatedAuthFail = { response: NextResponse };

/** Verify Bearer JWT for any signed-in user. Use in Route Handlers only. */
export async function requireAuthenticatedApi(
  req: NextRequest
): Promise<AuthenticatedAuthOk | AuthenticatedAuthFail> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
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

  return { userId: user.id };
}
