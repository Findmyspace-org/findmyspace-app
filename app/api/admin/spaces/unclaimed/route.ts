import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { adminAudit } from "@/lib/admin-audit";
import {
  buildUnclaimedSpaceRow,
  createServiceAdminClient,
  parseUnclaimedSpaceInput,
  syncSpaceAttributes,
} from "@/lib/admin-unclaimed-space";

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const { data: spaces, error } = await admin
    .from("spaces")
    .select("id, title, city, suburb, space_type, status, created_at")
    .eq("created_by_admin", true)
    .in("status", ["draft", "unclaimed"])
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = ((spaces as { id: string }[]) || []).map((s) => s.id);
  const enquiryCounts: Record<string, number> = {};

  if (ids.length > 0) {
    const { data: enquiries } = await admin
      .from("listing_enquiries")
      .select("listing_id")
      .in("listing_id", ids);

    for (const row of (enquiries as { listing_id: string }[]) || []) {
      enquiryCounts[row.listing_id] = (enquiryCounts[row.listing_id] || 0) + 1;
    }
  }

  const rows = ((spaces as Record<string, unknown>[]) || []).map((space) => ({
    ...space,
    enquiry_count: enquiryCounts[(space.id as string) || ""] || 0,
  }));

  return NextResponse.json({ listings: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = parseUnclaimedSpaceInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const status = "draft" as const;

  const insertRow = buildUnclaimedSpaceRow(parsed.data, auth.userId, status);

  const { data: inserted, error: insertErr } = await admin
    .from("spaces")
    .insert(insertRow)
    .select("id, status, title")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: insertErr?.message || "Could not create listing." },
      { status: 500 }
    );
  }

  const spaceId = (inserted as { id: string }).id;

  const attrErr = await syncSpaceAttributes(admin, spaceId, parsed.data.attributes);
  if (attrErr) {
    return NextResponse.json({ error: attrErr }, { status: 500 });
  }

  await adminAudit({
    action: "unclaimed_listing_created",
    actorUserId: auth.userId,
    targetType: "space",
    targetId: spaceId,
    meta: { status },
  });

  return NextResponse.json({
    ok: true,
    id: spaceId,
    space: inserted,
  });
}
