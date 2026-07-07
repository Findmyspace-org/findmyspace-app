import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import { buildRecipientPreview } from "@/lib/crm-marketing/recipient-preview";

export async function POST(req: NextRequest) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  try {
    const body = (await req.json()) as {
      name: string;
      subject?: string;
      previewText?: string;
      senderName?: string;
      replyTo?: string;
      listIds?: string[];
      filters?: Record<string, string | undefined>;
      bodyHtml?: string;
      bodyText?: string;
    };

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Campaign name is required." }, { status: 400 });
    }

    const preview = await buildRecipientPreview(auth.adminClient, {
      listIds: body.listIds,
      filters: body.filters,
    });

    const { data, error } = await auth.adminClient
      .from("crm_marketing_campaigns")
      .insert({
        name: body.name.trim(),
        subject: body.subject?.trim() || null,
        preview_text: body.previewText?.trim() || null,
        sender_name: body.senderName?.trim() || null,
        reply_to: body.replyTo?.trim() || null,
        status: "draft",
        body_html: body.bodyHtml || null,
        body_text: body.bodyText || null,
        list_ids: body.listIds || [],
        estimated_audience: preview.totalMatching,
        eligible_recipients: preview.eligibleRecipients,
        excluded_recipients: preview.excludedRecipients,
        created_by: auth.userId,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, campaignId: data.id, preview });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save campaign draft." },
      { status: 400 }
    );
  }
}
