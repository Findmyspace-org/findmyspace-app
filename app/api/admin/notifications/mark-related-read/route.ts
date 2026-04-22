import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/require-admin-api";

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
    }

    const body = (await req.json()) as {
      relatedEntityType?: string;
      relatedEntityId?: string;
      types?: string[];
    };

    const { relatedEntityType, relatedEntityId, types } = body;
    if (!relatedEntityType || !relatedEntityId || !Array.isArray(types) || types.length === 0) {
      return NextResponse.json(
        { error: "Missing relatedEntityType, relatedEntityId, or types." },
        { status: 400 }
      );
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { error } = await (admin.from("notifications") as any)
      .update({ is_read: true })
      .eq("related_entity_type", relatedEntityType)
      .eq("related_entity_id", relatedEntityId)
      .in("type", types)
      .eq("is_read", false);

    if (error) {
      console.error("mark-related-read failed:", error);
      return NextResponse.json({ error: "Update failed." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("mark-related-read error:", error);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
