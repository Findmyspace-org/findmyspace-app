import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/require-admin-api";
import { adminAudit } from "@/lib/admin-audit";
import { extractAdminProfilePatch } from "@/lib/admin-patch-validation";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminApi(req);
    if ("response" in auth) return auth.response;

    const { id: rawId } = await params;
    const id = (rawId || "").trim();
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }

    const parsed = extractAdminProfilePatch(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "Missing server configuration." },
        { status: 500 }
      );
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: updatedRows, error: updateError } = await (admin
      .from("profiles") as any)
      .update(parsed.patch)
      .eq("id", id)
      .select("id");

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }
    if (!updatedRows?.length) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    await adminAudit({
      action: "profile_update",
      actorUserId: auth.userId,
      targetType: "profile",
      targetId: id,
      reason: parsed.reason,
      meta: { fields: Object.keys(parsed.patch) },
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("admin users PATCH:", e);
    return NextResponse.json(
      { error: "Could not update profile." },
      { status: 500 }
    );
  }
}
