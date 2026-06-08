import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminAudit } from "@/lib/admin-audit";
import { requireAdminApi } from "@/lib/require-admin-api";
import { getCanonicalPublicSiteUrl } from "@/lib/site-url";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED = new Set(["verified", "pending", "rejected"]);

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

export async function POST(
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
  const nextStatus =
    typeof body.status === "string" && ALLOWED.has(body.status)
      ? body.status
      : null;
  if (!nextStatus) {
    return NextResponse.json(
      { error: "status must be verified, pending, or rejected." },
      { status: 400 }
    );
  }

  const comment =
    typeof body.comment === "string" ? body.comment.trim() || null : null;

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const { data: space, error: fetchErr } = await admin
    .from("spaces")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !space) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  const patch: Record<string, string | null> = {
    ownership_proof_status: nextStatus,
  };
  if (comment) patch.listing_admin_comment = comment;

  const { error: spaceErr } = await admin.from("spaces").update(patch).eq("id", id);
  if (spaceErr) {
    return NextResponse.json({ error: spaceErr.message }, { status: 500 });
  }

  await admin
    .from("listing_ownership_documents")
    .update({ status: nextStatus })
    .eq("space_id", id)
    .eq("document_type", "ownership_proof");

  await adminAudit({
    action:
      nextStatus === "verified"
        ? "ownership_proof_verified"
        : nextStatus === "rejected"
          ? "ownership_proof_rejected"
          : "ownership_proof_pending",
    actorUserId: auth.userId,
    targetType: "space",
    targetId: id,
    reason: comment ?? undefined,
  });

  if (nextStatus === "verified") {
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
          eventType: "ownership_proof_verified",
        }),
      });
    } catch {
      /* non-fatal */
    }
  }

  return NextResponse.json({
    ok: true,
    ownership_proof_status: nextStatus,
    message:
      nextStatus === "verified"
        ? "Ownership proof verified. Complete listing approval from the review queue when ready."
        : undefined,
  });
}
