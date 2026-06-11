import { NextRequest, NextResponse } from "next/server";
import { adminAudit } from "@/lib/admin-audit";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import { requireAdminApi } from "@/lib/require-admin-api";
import {
  applyAdminArchiveSpace,
  assertArchiveSchemaReady,
  validateAdminArchiveSpace,
} from "@/lib/space-archive";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { ok: false, error: "Invalid space id." },
      { status: 400 }
    );
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Server configuration error." },
      { status: 500 }
    );
  }

  try {
    const schema = await assertArchiveSchemaReady(admin);
    if (!schema.ok) {
      console.error("[space-archive] schema not ready", { spaceId: id, error: schema.error });
      return NextResponse.json(
        { ok: false, error: schema.error, migrationRequired: true },
        { status: 503 }
      );
    }

    const validation = await validateAdminArchiveSpace(admin, id, auth.userId);
    if (!validation.ok) {
      console.warn("[space-archive] validation blocked", {
        spaceId: id,
        error: validation.error,
        openBookingCount: validation.openBookingCount,
        openBookingStatuses: validation.openBookingStatuses,
      });
      return NextResponse.json(
        {
          ok: false,
          error: validation.error,
          openBookingCount: validation.openBookingCount,
          openBookingStatuses: validation.openBookingStatuses,
        },
        { status: 400 }
      );
    }

    const applied = await applyAdminArchiveSpace(admin, id, validation.patch);
    if (!applied.ok) {
      console.error("[space-archive] apply failed", {
        spaceId: id,
        error: applied.error,
        migrationRequired: applied.migrationRequired,
      });
      return NextResponse.json(
        {
          ok: false,
          error: applied.error,
          migrationRequired: applied.migrationRequired ?? false,
        },
        { status: applied.migrationRequired ? 503 : 500 }
      );
    }

    await adminAudit({
      action: "space_archived",
      actorUserId: auth.userId,
      targetType: "space",
      targetId: id,
      meta: {
        archive_restore_status: validation.patch.archive_restore_status,
        archive_restore_public_listing_mode:
          validation.patch.archive_restore_public_listing_mode,
      },
    });

    console.info("[space-archive] success", {
      spaceId: id,
      actorUserId: auth.userId,
    });

    return NextResponse.json({
      ok: true,
      spaceId: applied.spaceId,
      status: applied.status,
      public_listing_mode: applied.public_listing_mode,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected error while archiving.";
    console.error("[space-archive] unhandled error", { spaceId: id, err });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
