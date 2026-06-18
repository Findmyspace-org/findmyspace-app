import { NextRequest, NextResponse } from "next/server";
import { adminAudit } from "@/lib/admin-audit";
import {
  applyAdminMatrixBookableChange,
  applyAdminMatrixStatusChange,
  MATRIX_STATUS_VALUES,
  type MatrixStatusValue,
} from "@/lib/admin-space-matrix";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import { requireAdminApi } from "@/lib/require-admin-api";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid space id." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const hasStatus = typeof body.status === "string";
  const hasBookable = typeof body.is_bookable === "boolean";

  if (!hasStatus && !hasBookable) {
    return NextResponse.json(
      { ok: false, error: 'Provide "status" or "is_bookable".' },
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

  const response: Record<string, unknown> = { ok: true, spaceId: id };

  if (hasStatus) {
    const status = body.status as string;
    if (!MATRIX_STATUS_VALUES.includes(status as MatrixStatusValue)) {
      return NextResponse.json(
        { ok: false, error: "status must be hidden, live, or archived." },
        { status: 400 }
      );
    }

    const result = await applyAdminMatrixStatusChange(
      admin,
      id,
      status as MatrixStatusValue,
      auth.userId
    );

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, blockers: result.blockers },
        { status: 400 }
      );
    }

    response.status = result.status;
    response.public_listing_mode = result.public_listing_mode;
    response.is_bookable = result.is_bookable;
    response.matrix_status = result.matrix_status;

    await adminAudit({
      action: "space_matrix_status_changed",
      actorUserId: auth.userId,
      targetType: "space",
      targetId: id,
      meta: { matrix_status: status, patch: result },
    });
  }

  if (hasBookable) {
    const result = await applyAdminMatrixBookableChange(
      admin,
      id,
      body.is_bookable as boolean
    );

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }

    response.is_bookable = result.is_bookable;

    await adminAudit({
      action: "space_bookable_changed",
      actorUserId: auth.userId,
      targetType: "space",
      targetId: id,
      meta: { is_bookable: result.is_bookable },
    });
  }

  return NextResponse.json(response);
}
