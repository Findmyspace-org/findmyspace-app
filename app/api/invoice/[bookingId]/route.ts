import { NextRequest, NextResponse } from "next/server";
import { renderInvoiceHtml } from "@/lib/invoice-document";
import { loadInvoiceDocumentForRequest } from "@/lib/invoice-server";

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

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
