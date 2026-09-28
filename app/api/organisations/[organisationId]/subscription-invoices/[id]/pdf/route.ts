import { NextRequest, NextResponse } from "next/server";
import { requireOrgCommercialApi } from "@/lib/access/require-org-commercial-api";
import { getSubscriptionPeriod } from "@/lib/subscription-billing-server";
import { renderSubscriptionInvoiceHtml } from "@/lib/subscription-invoice-document";
import { invoicePdfUserMessage, renderHtmlToPdf } from "@/lib/invoice-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ organisationId: string; id: string }> }
) {
  const { organisationId, id } = await context.params;
  const auth = await requireOrgCommercialApi(req, organisationId);
  if ("response" in auth) return auth.response;

  try {
    const period = await getSubscriptionPeriod(auth.admin, id);
    if (period.billed_organisation_id !== organisationId) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    if (period.status === "void") {
      return NextResponse.json({ error: "This invoice is void." }, { status: 409 });
    }
    const html = renderSubscriptionInvoiceHtml(period);
    const pdf = await renderHtmlToPdf(html);
    const filename = `FindMySpace-${period.invoice_number || "subscription"}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: invoicePdfUserMessage(err) },
      { status: 500 }
    );
  }
}
