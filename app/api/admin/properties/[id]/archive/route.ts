import { NextRequest, NextResponse } from "next/server";
import { adminAudit } from "@/lib/admin-audit";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import {
  applyAdminArchiveProperty,
  assertPropertyArchiveSchemaReady,
  getPropertyArchivePreview,
} from "@/lib/property-archive";
import { requireAdminApi } from "@/lib/require-admin-api";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid property id." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const schema = await assertPropertyArchiveSchemaReady(admin);
  if (!schema.ok) {
    return NextResponse.json(
      { error: schema.error, migrationRequired: true },
      { status: 503 }
    );
  }

  const result = await getPropertyArchivePreview(admin, id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status || 400 }
    );
  }

  return NextResponse.json(result.preview);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid property id." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Server configuration error." },
      { status: 500 }
    );
  }

  try {
    const schema = await assertPropertyArchiveSchemaReady(admin);
    if (!schema.ok) {
      return NextResponse.json(
        { ok: false, error: schema.error, migrationRequired: true },
        { status: 503 }
      );
    }

    const applied = await applyAdminArchiveProperty(admin, id, auth.userId);
    if (!applied.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: applied.error,
          openBookingCount: applied.openBookingCount,
          openBookingStatuses: applied.openBookingStatuses,
          migrationRequired: applied.migrationRequired ?? false,
        },
        { status: applied.migrationRequired ? 503 : 400 }
      );
    }

    await adminAudit({
      action: "property_archived",
      actorUserId: auth.userId,
      targetType: "property",
      targetId: applied.property_id,
      meta: {
        property_name: applied.property_name,
        spaces_archived: applied.spaces_archived,
        spaces_already_archived: applied.spaces_already_archived,
        archived_space_ids: applied.archived_space_ids,
      },
    });

    return NextResponse.json({
      ok: true,
      property_id: applied.property_id,
      property_name: applied.property_name,
      spaces_archived: applied.spaces_archived,
      spaces_already_archived: applied.spaces_already_archived,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected error while archiving.";
    console.error("[property-archive] unhandled error", { propertyId: id, err });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
