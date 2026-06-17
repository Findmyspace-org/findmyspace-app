import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { adminAudit } from "@/lib/admin-audit";
import {
  buildUnclaimedSpaceRow,
  createServiceAdminClient,
  parseUnclaimedSpaceInput,
  syncSpaceAttributes,
} from "@/lib/admin-unclaimed-space";
import { validateSpaceCrmLink, enrichSpacesWithCrmSummaries } from "@/lib/space-crm-link";

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const overviewStatuses = [
    "draft",
    "unclaimed",
    "owner_claimed",
    "pending_verification",
    "pending",
    "needs_changes",
    "rejected",
    "active",
    "paused",
  ];

  const { data: spaces, error } = await admin
    .from("spaces")
    .select(
      "id, title, city, suburb, space_type, status, created_at, property_id, crm_organisation_id, crm_contact_id, min_group_size, max_group_size"
    )
    .eq("created_by_admin", true)
    .in("status", overviewStatuses)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = ((spaces as { id: string }[]) || []).map((s) => s.id);
  const enquiryCounts: Record<string, number> = {};
  const coverImages: Record<string, string> = {};

  if (ids.length > 0) {
    const [{ data: enquiries }, { data: images }] = await Promise.all([
      admin.from("listing_enquiries").select("listing_id").in("listing_id", ids),
      admin
        .from("space_images")
        .select("space_id, image_url, sort_order")
        .in("space_id", ids)
        .order("sort_order", { ascending: true }),
    ]);

    for (const row of (enquiries as { listing_id: string }[]) || []) {
      enquiryCounts[row.listing_id] = (enquiryCounts[row.listing_id] || 0) + 1;
    }

    for (const row of (images as {
      space_id: string;
      image_url: string;
      sort_order: number | null;
    }[]) || []) {
      if (!coverImages[row.space_id]) {
        coverImages[row.space_id] = row.image_url;
      }
    }
  }

  const enriched = await enrichSpacesWithCrmSummaries(
    admin,
    ((spaces as Record<string, unknown>[]) || []) as {
      id: string;
      crm_organisation_id?: string | null;
      crm_contact_id?: string | null;
    }[]
  );

  const rows = enriched.map((space) => ({
    ...space,
    enquiry_count: enquiryCounts[space.id] || 0,
    cover_image_url: coverImages[space.id] || null,
  }));

  return NextResponse.json({ listings: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const admin = createServiceAdminClient();
  if (!admin) {
    console.error(
      "[admin/unclaimed/create] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
    );
    return NextResponse.json(
      { error: "Server configuration error. Service role is not configured." },
      { status: 500 }
    );
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

  const crmValidated = await validateSpaceCrmLink(admin, {
    crm_organisation_id: parsed.data.crm_organisation_id,
    crm_contact_id: parsed.data.crm_contact_id,
  });
  if (!crmValidated.ok) {
    return NextResponse.json({ error: crmValidated.error }, { status: 400 });
  }

  const status = "draft" as const;

  const insertRow = buildUnclaimedSpaceRow(parsed.data, auth.userId, status);

  console.info(
    "[admin/unclaimed/create] Creating draft",
    JSON.stringify({ adminUserId: auth.userId, title: insertRow.title })
  );

  const { data: inserted, error: insertErr } = await admin
    .from("spaces")
    .insert(insertRow)
    .select("id, status, title")
    .single();

  if (insertErr || !inserted) {
    console.error(
      "[admin/unclaimed/create] spaces insert failed:",
      JSON.stringify({
        adminUserId: auth.userId,
        code: insertErr?.code,
        message: insertErr?.message,
        hint: insertErr?.hint,
      })
    );
    const message = insertErr?.message || "Could not create listing.";
    const statusCode =
      message.includes("permission denied") ||
      message.includes("spaces_status_change_forbidden")
        ? 503
        : 500;
    return NextResponse.json(
      {
        error:
          statusCode === 503
            ? "Server cannot write to listings. Apply migration 019 (spaces service_role grants) and ensure SUPABASE_SERVICE_ROLE_KEY is set."
            : message,
      },
      { status: statusCode }
    );
  }

  const spaceId = (inserted as { id: string }).id;

  const attrErr = await syncSpaceAttributes(admin, spaceId, parsed.data.attributes);
  if (attrErr) {
    console.error(
      "[admin/unclaimed/create] space_attributes sync failed:",
      JSON.stringify({ spaceId, message: attrErr })
    );
    return NextResponse.json({ error: attrErr }, { status: 500 });
  }

  await adminAudit({
    action: "unclaimed_listing_created",
    actorUserId: auth.userId,
    targetType: "space",
    targetId: spaceId,
    meta: { status },
  });

  console.info(
    "[admin/unclaimed/create] Draft created",
    JSON.stringify({ spaceId, adminUserId: auth.userId })
  );

  return NextResponse.json({
    ok: true,
    id: spaceId,
    space: inserted,
  });
}
