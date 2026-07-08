import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import {
  removeCompletedAction,
  updateCompletedAction,
} from "@/lib/crm-desktop/completed-actions-mutations";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const row = await updateCompletedAction(
      auth.adminClient,
      id,
      {
        actionLabel:
          typeof body.actionLabel === "string" ? body.actionLabel : undefined,
        note: body.note === undefined ? undefined : ((body.note as string | null) ?? null),
        completedAt:
          typeof body.completedAt === "string" ? body.completedAt : undefined,
        propertyId:
          body.propertyId === undefined
            ? undefined
            : ((body.propertyId as string | null) ?? null),
        spaceId:
          body.spaceId === undefined
            ? undefined
            : ((body.spaceId as string | null) ?? null),
      },
      auth.userId
    );
    return NextResponse.json({ ok: true, row });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update completed action.";
    const status =
      message.includes("not found")
        ? 404
        : message.includes("required") ||
            message.includes("Invalid") ||
            message.includes("cannot") ||
            message.includes("belong")
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  try {
    await removeCompletedAction(auth.adminClient, id, auth.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to remove completed action.";
    return NextResponse.json(
      { error: message },
      { status: message.includes("not found") ? 404 : 500 }
    );
  }
}
