import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import { fetchMarketingContactRows } from "@/lib/crm-marketing/queries";
import { buildMarketingContactsCsv } from "@/lib/crm-marketing/export";
import { writeMarketingAudit } from "@/lib/crm-marketing/audits";
import { buildRecipientPreview } from "@/lib/crm-marketing/recipient-preview";
import { previewRowsForCsv } from "@/lib/crm-marketing/export";

export async function GET(req: NextRequest) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  const sp = req.nextUrl.searchParams;
  const marketingContactIds = sp.get("ids")?.split(",").filter(Boolean) || [];
  const listIds = sp.get("listIds")?.split(",").filter(Boolean) || [];

  try {
    let rows;
    if (marketingContactIds.length || listIds.length) {
      const preview = await buildRecipientPreview(auth.adminClient, {
        marketingContactIds,
        listIds,
        filters: {
          q: sp.get("q") || undefined,
          status: sp.get("status") || undefined,
          consent: sp.get("consent") || undefined,
          basis: sp.get("basis") || undefined,
          org: sp.get("org") || undefined,
        },
      });
      rows = previewRowsForCsv(preview);
      await writeMarketingAudit(auth.adminClient, {
        action: "csv_export",
        actorId: auth.userId,
        newValue: {
          mode: "preview",
          total: preview.totalMatching,
          eligible: preview.eligibleRecipients,
          excluded: preview.excludedRecipients,
        },
        source: "marketing_admin",
      });
    } else {
      const result = await fetchMarketingContactRows(
        auth.adminClient,
        {
          q: sp.get("q") || undefined,
          status: sp.get("status") || undefined,
          consent: sp.get("consent") || undefined,
          basis: sp.get("basis") || undefined,
          org: sp.get("org") || undefined,
          sendable: sp.get("sendable") || undefined,
          list: sp.get("list") || undefined,
          review: sp.get("review") || undefined,
        },
        1,
        5000
      );
      rows = result.rows;
      await writeMarketingAudit(auth.adminClient, {
        action: "csv_export",
        actorId: auth.userId,
        newValue: { mode: "filtered", total: result.total },
        source: "marketing_admin",
      });
    }

    const csv = buildMarketingContactsCsv(rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="marketing-contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed." },
      { status: 500 }
    );
  }
}
