import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { adminAudit } from "@/lib/admin-audit";
import {
  buildUnclaimedSpaceRow,
  createServiceAdminClient,
  parseUnclaimedSpaceInput,
  syncSpaceAttributes,
} from "@/lib/admin-unclaimed-space";
import { prefillSpaceFromProperty } from "@/lib/admin-property";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id: propertyId } = await params;
  if (!UUID_RE.test(propertyId)) {
    return NextResponse.json({ error: "Invalid property id." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const { data: property, error: propertyErr } = await admin
    .from("properties")
    .select(
      "id, address_line1, suburb, city, province, postal_code, country, latitude, longitude, crm_organisation_id"
    )
    .eq("id", propertyId)
    .maybeSingle();

  if (propertyErr || !property) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }

  const mergedBody = prefillSpaceFromProperty(body, property as {
    address_line1: string | null;
    suburb: string | null;
    city: string | null;
    province: string | null;
    postal_code: string | null;
    country: string | null;
    latitude: number | null;
    longitude: number | null;
    crm_organisation_id: string | null;
  });

  const parsed = parseUnclaimedSpaceInput(mergedBody);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const status =
    mergedBody.status === "unclaimed" ? ("unclaimed" as const) : ("draft" as const);

  const row = buildUnclaimedSpaceRow(parsed.data, auth.userId, status, {
    propertyId,
  });

  const { data: inserted, error: insertErr } = await admin
    .from("spaces")
    .insert(row)
    .select("id, title, status")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: insertErr?.message || "Could not create space." },
      { status: 500 }
    );
  }

  const spaceId = (inserted as { id: string }).id;
  const attrErr = await syncSpaceAttributes(admin, spaceId, parsed.data.attributes);
  if (attrErr) {
    return NextResponse.json({ error: attrErr }, { status: 500 });
  }

  await adminAudit({
    action: "property_space_created",
    actorUserId: auth.userId,
    targetType: "space",
    targetId: spaceId,
    meta: {
      property_id: propertyId,
      title: (inserted as { title: string }).title,
    },
  });

  return NextResponse.json({ space: inserted });
}
