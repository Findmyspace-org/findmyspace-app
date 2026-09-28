import { NextRequest, NextResponse } from "next/server";
import { renderInvoiceHtml } from "@/lib/invoice-document";
import { invoicePdfUserMessage, renderHtmlToPdf } from "@/lib/invoice-pdf";
import { loadInvoiceDocumentForRequest } from "@/lib/invoice-server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return new NextResponse("Server configuration error", { status: 500 });
  }

  const authHeader = req.headers.get("authorization");

  const loaded = await loadInvoiceDocumentForRequest({
    supabaseUrl,
    serviceKey,
    anonKey,
    authHeader,
    bookingId,
  });

  if (!loaded.ok) {
    return loaded.response;
  }

  const html = renderInvoiceHtml(loaded.doc);

  let pdfBuffer: Buffer;

  try {
    pdfBuffer = await renderHtmlToPdf(html);
  } catch (error) {
    console.error("invoice pdf generation failed", {
      bookingId,
      vercel: Boolean(process.env.VERCEL),
      node: process.version,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: invoicePdfUserMessage(error) },
      { status: 503 }
    );
  }

  const safeId = loaded.doc.invoiceNumber.replace(/[^\w-]+/g, "_");

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="FindMySpace-invoice-${safeId}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
