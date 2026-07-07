import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import { fetchMarketingListMembers } from "@/lib/crm-marketing/queries";
import {
  archiveManualMarketingList,
  updateManualMarketingList,
} from "@/lib/crm-marketing/mutations";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const page = Number(req.nextUrl.searchParams.get("page") || "1") || 1;
  const pageSize = Number(req.nextUrl.searchParams.get("pageSize") || "25") || 25;

  try {
    const result = await fetchMarketingListMembers(auth.adminClient, id, page, pageSize);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load list." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const body = (await req.json()) as {
    action?: "archive";
    name?: string;
    description?: string;
    active?: boolean;
  };

  try {
    const list =
      body.action === "archive"
        ? await archiveManualMarketingList(auth.adminClient, {
            listId: id,
            actorId: auth.userId,
          })
        : await updateManualMarketingList(auth.adminClient, {
            listId: id,
            actorId: auth.userId,
            name: body.name,
            description: body.description,
            active: body.active,
          });
    return NextResponse.json({ ok: true, list });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update list." },
      { status: 400 }
    );
  }
}
