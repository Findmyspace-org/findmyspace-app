import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import {
  createCompletedAction,
  listCompletedActions,
} from "@/lib/crm-desktop/completed-actions-mutations";

export async function GET(req: NextRequest) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  const sp = req.nextUrl.searchParams;
  try {
    const rows = await listCompletedActions(auth.adminClient, {
      organisationId: sp.get("organisationId") || undefined,
      propertyId: sp.get("propertyId") || undefined,
      spaceId: sp.get("spaceId") || undefined,
      q: sp.get("q") || undefined,
      kind: (sp.get("kind") as "standard" | "custom" | "all" | null) || "all",
      completedBy: sp.get("completedBy") || undefined,
      from: sp.get("from") || undefined,
      to: sp.get("to") || undefined,
    });
    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load completed actions." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const row = await createCompletedAction(
      auth.adminClient,
      {
        organisationId: String(body.organisationId || ""),
        propertyId: (body.propertyId as string | null) ?? null,
        spaceId: (body.spaceId as string | null) ?? null,
        actionKey: (body.actionKey as string | null) ?? null,
        actionLabel: (body.actionLabel as string | null) ?? null,
        isCustom: Boolean(body.isCustom),
        note: (body.note as string | null) ?? null,
        completedAt: (body.completedAt as string | null) ?? null,
        source: typeof body.source === "string" ? body.source : "crm_desktop",
      },
      auth.userId
    );
    return NextResponse.json({ ok: true, row });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create completed action.";
    const status =
      message.includes("required") ||
      message.includes("Invalid") ||
      message.includes("cannot") ||
      message.includes("Unknown") ||
      message.includes("belong")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
