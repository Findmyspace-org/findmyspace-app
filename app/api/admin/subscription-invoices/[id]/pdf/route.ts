import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import { getSubscriptionPeriod } from "@/lib/subscription-billing-server";
import { renderSubscriptionInvoiceHtml } from "@/lib/subscription-invoice-document";
import { invoicePdfUserMessage, renderHtmlToPdf } from "@/lib/invoice-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;
  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  try {
    const { id } = await context.params;
    const period = await getSubscriptionPeriod(admin, id);
    if (period.status !== "invoiced" && period.status !== "void" && !period.invoice_number) {
      return NextResponse.json({ error: "Invoice PDF is not available yet." }, { status: 409 });
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
