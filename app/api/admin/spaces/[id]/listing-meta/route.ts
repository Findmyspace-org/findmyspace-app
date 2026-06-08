import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminAudit } from "@/lib/admin-audit";
import { requireAdminApi } from "@/lib/require-admin-api";
import { getCanonicalPublicSiteUrl } from "@/lib/site-url";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createServiceAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid listing id." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};

  if (body.platform_fee_percent !== undefined) {
    const fee = Number(body.platform_fee_percent);
    if (!Number.isFinite(fee) || fee < 0 || fee > 100) {
      return NextResponse.json(
        { error: "platform_fee_percent must be between 0 and 100." },
        { status: 400 }
      );
    }
    patch.platform_fee_percent = Number(fee.toFixed(2));
  }

  if (body.listing_admin_comment !== undefined) {
    patch.listing_admin_comment =
      typeof body.listing_admin_comment === "string"
        ? body.listing_admin_comment.trim() || null
        : null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const { data, error } = await admin
    .from("spaces")
    .update(patch)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  await adminAudit({
    action: "listing_admin_meta_updated",
    actorUserId: auth.userId,
    targetType: "space",
    targetId: id,
    meta: { fields: Object.keys(patch) },
  });

  if (
    typeof patch.listing_admin_comment === "string" ||
    patch.listing_admin_comment === null
  ) {
    try {
      const base = getCanonicalPublicSiteUrl();
      await fetch(`${base}/api/notifications/listing-event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.INTERNAL_API_SECRET
            ? { "X-Internal-Api-Secret": process.env.INTERNAL_API_SECRET }
            : {}),
        },
        body: JSON.stringify({
          spaceId: id,
          eventType: "listing_pending",
          adminComment: patch.listing_admin_comment,
        }),
      });
    } catch {
      /* non-fatal */
    }
  }

  return NextResponse.json({ ok: true });
}
