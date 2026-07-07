import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import { fetchMarketingLists } from "@/lib/crm-marketing/queries";
import { createManualMarketingList } from "@/lib/crm-marketing/mutations";

export async function GET(req: NextRequest) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  try {
    const lists = await fetchMarketingLists(auth.adminClient);
    return NextResponse.json({ ok: true, lists });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load lists." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  const body = (await req.json()) as { name?: string; description?: string };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "List name is required." }, { status: 400 });
  }

  try {
    const list = await createManualMarketingList(auth.adminClient, {
      name: body.name,
      description: body.description,
      actorId: auth.userId,
    });
    return NextResponse.json({ ok: true, list });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create list." },
      { status: 400 }
    );
  }
}
