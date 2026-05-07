import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/notifications/read-by-related
 *
 * Bulk mark the AUTHENTICATED user's unread notifications as read where they
 * match a given `(related_entity_type, related_entity_id, type[])` triple.
 *
 * Body:
 *   {
 *     relatedEntityType: string,   // e.g. "booking" | "space" | "profile"
 *     relatedEntityId:   string,
 *     types:             string[]  // e.g. ["booking_request"]
 *   }
 *
 * Used by `?focus=` deep-link landing pages to clear the matching bell items
 * once the user has actually opened the entity.
 */

export const runtime = "nodejs";

type Body = {
  relatedEntityType?: string;
  relatedEntityId?: string;
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

    let body: Body | null = null;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const relatedEntityType = (body?.relatedEntityType || "").trim();
    const relatedEntityId = (body?.relatedEntityId || "").trim();
    const types = Array.isArray(body?.types)
      ? body.types
          .map((t) => (typeof t === "string" ? t.trim() : ""))
          .filter((t) => t.length > 0)
      : [];

    if (!relatedEntityType || !relatedEntityId || types.length === 0) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: relatedEntityType, relatedEntityId, types[].",
        },
        { status: 400 }
      );
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { error } = await (admin.from("notifications") as any)
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("related_entity_type", relatedEntityType)
      .eq("related_entity_id", relatedEntityId)
      .in("type", types)
      .eq("is_read", false);

    if (error) {
      console.error("read-by-related update failed:", error);
      return NextResponse.json({ error: "Update failed." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("read-by-related error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
