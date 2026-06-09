import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { markNotificationReadPayload } from "@/lib/notification-state";

/**
 * POST /api/notifications/mark-all-read
 *
 * Marks every unread notification belonging to the AUTHENTICATED user as read.
 * Optionally scoped to a list of `types`.
 */

export const runtime = "nodejs";

type Body = {
  types?: string[];
};

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return NextResponse.json(
        { error: "Server configuration error." },
        { status: 500 }
      );
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    let body: Body = {};
    try {
      body = ((await req.json()) as Body) || {};
    } catch {
      // empty body is allowed
    }

    const types = Array.isArray(body?.types)
      ? body.types
          .map((t) => (typeof t === "string" ? t.trim() : ""))
          .filter((t) => t.length > 0)
      : [];

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    let query = (admin.from("notifications") as any)
      .update(markNotificationReadPayload())
      .eq("user_id", user.id)
      .is("read_at", null);

    if (types.length > 0) {
      query = query.in("type", types);
    }

    const { error } = await query;
    if (error) {
      console.error("mark-all-read update failed:", error);
      return NextResponse.json({ error: "Update failed." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("mark-all-read error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
