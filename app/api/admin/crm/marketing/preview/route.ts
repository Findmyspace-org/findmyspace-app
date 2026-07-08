import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import { buildRecipientPreview } from "@/lib/crm-marketing/recipient-preview";
import { writeMarketingAudit } from "@/lib/crm-marketing/audits";

export async function POST(req: NextRequest) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  try {
    const body = (await req.json()) as {
      listIds?: string[];
      marketingContactIds?: string[];
      filters?: Record<string, string | undefined>;
      audienceDefinition?: unknown;
    };

    const preview = await buildRecipientPreview(auth.adminClient, {
      listIds: body.listIds,
      marketingContactIds: body.marketingContactIds,
      filters: body.filters,
      audienceDefinition: body.audienceDefinition,
      actorId: auth.userId,
    });

    await writeMarketingAudit(auth.adminClient, {
      action: "recipient_preview",
      actorId: auth.userId,
      newValue: {
        totalMatching: preview.totalMatching,
        eligibleRecipients: preview.eligibleRecipients,
        excludedRecipients: preview.excludedRecipients,
        listIds: body.listIds || [],
      },
      source: "marketing_admin",
    });

    return NextResponse.json({ ok: true, preview });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preview failed." },
      { status: 500 }
    );
  }
}
