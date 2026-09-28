#!/usr/bin/env node
/**
 * Invoice PDF route contracts and optional local Chromium smoke.
 * Run: npm run test:invoice-pdf
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { invoicePdfUserMessage, renderHtmlToPdf } from "../lib/invoice-pdf";

const route = readFileSync("app/api/invoice/[bookingId]/pdf/route.ts", "utf8");
const pdfLib = readFileSync("lib/invoice-pdf.ts", "utf8");
const server = readFileSync("lib/invoice-server.ts", "utf8");
const nextConfig = readFileSync("next.config.ts", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  dependencies: Record<string, string>;
};

{
  assert.match(route, /loadInvoiceDocumentForRequest/);
  assert.match(route, /renderHtmlToPdf/);
  assert.match(route, /invoicePdfUserMessage/);
  assert.match(route, /export const runtime = "nodejs"/);
  assert.match(route, /maxDuration = 60/);
  assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY[\s\S]{0,80}NextResponse\.json/);
}

{
  assert.match(pdfLib, /chromium\.headless/);
  assert.match(pdfLib, /chromium\.args/);
  assert.match(pdfLib, /setGraphicsMode/);
  assert.match(pdfLib, /resolveChromiumBinDirectory/);
  assert.match(pdfLib, /chromium\.br/);
  assert.match(
    pdfLib,
    /We could not generate your invoice PDF\. Please try again\./
  );
}

{
  assert.match(server, /renter_id === user\.id \|\| row\.owner_id === user\.id/);
  assert.match(server, /canViewBookingCommercial/);
}

{
  assert.match(nextConfig, /serverExternalPackages/);
  assert.match(nextConfig, /outputFileTracingIncludes/);
  assert.match(nextConfig, /@sparticuz\/chromium\/bin/);
  assert.match(nextConfig, /\/api\/invoice\/\*\/pdf/);
}

{
  const chromium = pkg.dependencies["@sparticuz/chromium"] || "";
  const puppeteer = pkg.dependencies["puppeteer-core"] || "";
  assert.match(chromium, /^[\^~]?13[3-9]\.|^[\^~]?1[4-9]\d\./);
  assert.match(puppeteer, /^[\^~]?24\./);
}

{
  const previous = process.env.VERCEL;
  process.env.VERCEL = "1";
  assert.equal(
    invoicePdfUserMessage(new Error("The input directory does not exist.")),
    "We could not generate your invoice PDF. Please try again."
  );
  if (previous === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = previous;
}

{
  const previous = process.env.VERCEL;
  delete process.env.VERCEL;
  assert.match(
    invoicePdfUserMessage(new Error("No Chromium executable found.")),
    /CHROME_EXECUTABLE_PATH/
  );
  if (previous !== undefined) process.env.VERCEL = previous;
}

void (async () => {
  const chrome =
    process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : "";
  if (chrome && existsSync(chrome) && !process.env.VERCEL) {
    const pdf = await renderHtmlToPdf(
      "<!doctype html><html><body><h1>FindMySpace invoice test</h1></body></html>"
    );
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
    console.log("test-invoice-pdf: local Chrome PDF header ok");
  } else {
    console.log("test-invoice-pdf: skipped local Chrome PDF smoke");
  }

  console.log("test-invoice-pdf: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
