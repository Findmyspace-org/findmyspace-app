import { NextRequest, NextResponse } from "next/server";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { renderInvoiceHtml } from "@/lib/invoice-document";
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
  } catch (e) {
    console.error("invoice pdf:", e);
    return NextResponse.json(
      {
        error:
          "Could not generate PDF. For local development, install Chrome/Chromium or set CHROME_EXECUTABLE_PATH.",
      },
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

async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const isServerless = Boolean(process.env.VERCEL);

  const localChrome =
    process.env.CHROME_EXECUTABLE_PATH ||
    (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : process.platform === "linux"
        ? "/usr/bin/google-chrome"
        : undefined);

  const executablePath = isServerless
    ? await chromium.executablePath()
    : localChrome;

  if (!executablePath) {
    throw new Error("No Chromium executable found.");
  }

  const launchArgs = isServerless
    ? chromium.args
    : [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--font-render-hinting=none",
      ];

  const browser = await puppeteer.launch({
    args: launchArgs,
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "12mm", right: "12mm", bottom: "14mm", left: "12mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
